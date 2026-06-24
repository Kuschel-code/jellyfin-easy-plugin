using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Common.Updates;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Updates;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.EasyPlugin;

/// <summary>
/// On startup, makes sure the <c>index.html</c> transformation is registered:
/// <list type="bullet">
/// <item>If one or more File Transformation providers are loaded, register with <b>all</b> of them
/// (the standalone plugin and/or a bundled copy such as Custom Theme's) so the active one applies it.</item>
/// <item>If File Transformation is installed but not yet loaded, ask the user to restart.</item>
/// <item>If no provider is present at all, install the File Transformation plugin automatically;
/// Easy Plugin then activates after the next restart.</item>
/// </list>
/// There is no on-disk fallback by design (the container's jellyfin-web is typically read-only).
/// </summary>
public class StartupService : IHostedService
{
    private const string FtAssemblyMarker = ".FileTransformation";
    private const string FtTypeName = "Jellyfin.Plugin.FileTransformation.PluginInterface";
    private const string FtRepoName = "File Transformation (added by Easy Plugin)";
    private const string FtRepoUrl = "https://www.iamparadox.dev/jellyfin/plugins/manifest.json";
    private static readonly Guid FtPluginId = Guid.Parse("5e87cc92-571a-4d8d-8d98-d2d4147f9f90");

    private readonly ILogger<StartupService> _logger;
    private readonly IInstallationManager _installationManager;
    private readonly IServerConfigurationManager _config;
    private readonly IPluginManager _pluginManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="StartupService"/> class.
    /// </summary>
    /// <param name="logger">Logger.</param>
    /// <param name="installationManager">Used to auto-install File Transformation when absent.</param>
    /// <param name="config">Used to register the File Transformation repository.</param>
    /// <param name="pluginManager">Used to detect an already-installed File Transformation.</param>
    public StartupService(
        ILogger<StartupService> logger,
        IInstallationManager installationManager,
        IServerConfigurationManager config,
        IPluginManager pluginManager)
    {
        _logger = logger;
        _installationManager = installationManager;
        _config = config;
        _pluginManager = pluginManager;
    }

    /// <inheritdoc />
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            // Every assembly that exposes the File Transformation entrypoint. There can be more
            // than one (the standalone plugin AND a bundled copy, e.g. Custom Theme's). Only one is
            // the active file-serving interceptor, and which one is non-deterministic across
            // restarts, so we register with all of them; the active one wins and the rest are no-ops.
            var ftAssemblies = AssemblyLoadContext.All
                .SelectMany(alc => alc.Assemblies)
                .Where(a => a.FullName?.Contains(FtAssemblyMarker, StringComparison.Ordinal) ?? false)
                .Distinct()
                .ToList();

            if (ftAssemblies.Count > 0)
            {
                RegisterWithAll(ftAssemblies);
                return;
            }

            // No provider loaded. If File Transformation is already installed (pending a restart),
            // don't reinstall.
            if (_pluginManager.Plugins.Any(p => p.Id.Equals(FtPluginId)))
            {
                _logger.LogInformation(
                    "Easy Plugin: File Transformation is installed but not loaded yet. " +
                    "Restart Jellyfin to activate the sidebar tweaks.");
                return;
            }

            // Missing entirely -> install it automatically (a restart is then needed to load it).
            await EnsureFileTransformationInstalledAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Easy Plugin: startup failed.");
        }
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private void RegisterWithAll(IReadOnlyList<Assembly> ftAssemblies)
    {
        // Callback mode: File Transformation loads this assembly/type and invokes the named static
        // method, passing { "contents": "<index.html>" } and serving its return value.
        var payloadJson = JsonSerializer.Serialize(new Dictionary<string, string?>
        {
            ["id"] = Plugin.Instance!.Id.ToString(),
            ["fileNamePattern"] = "index.html",
            ["callbackAssembly"] = typeof(Plugin).Assembly.FullName,
            ["callbackClass"] = typeof(TransformationPatches).FullName,
            ["callbackMethod"] = nameof(TransformationPatches.IndexHtml)
        });

        var registered = 0;
        foreach (var asm in ftAssemblies)
        {
            try
            {
                var pluginInterface = asm.GetType(FtTypeName);
                var register = pluginInterface?.GetMethod("RegisterTransformation");
                if (register is null)
                {
                    continue;
                }

                // Build the payload to match THIS provider's parameter type:
                //  - object / string param (e.g. Custom Theme's bundled provider, which does
                //    payload.ToString() + System.Text.Json) -> pass the JSON string directly.
                //  - Newtonsoft JObject param (the standalone File Transformation plugin) -> build
                //    it via that exact type's static Parse(string) so the type identity matches.
                var payloadType = register.GetParameters()[0].ParameterType;
                object? payload;
                if (payloadType.IsAssignableFrom(typeof(string)))
                {
                    payload = payloadJson;
                }
                else
                {
                    var parse = payloadType.GetMethod("Parse", new[] { typeof(string) });
                    payload = parse?.Invoke(null, new object[] { payloadJson });
                }

                if (payload is null)
                {
                    continue;
                }

                register.Invoke(null, new[] { payload });
                registered++;
                _logger.LogInformation(
                    "Easy Plugin: registered the index.html transformation with File Transformation provider '{Assembly}'.",
                    asm.GetName().Name);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Easy Plugin: registration with provider '{Assembly}' failed.", asm.GetName().Name);
            }
        }

        if (registered == 0)
        {
            _logger.LogWarning("Easy Plugin: no File Transformation provider accepted the registration.");
        }
    }

    private async Task EnsureFileTransformationInstalledAsync(CancellationToken cancellationToken)
    {
        EnsureRepository();

        // GetPackages never throws (it swallows IO/JSON/HTTP errors and returns empty).
        var packages = (await _installationManager
            .GetPackages(FtRepoName, FtRepoUrl, filterIncompatible: true, cancellationToken)
            .ConfigureAwait(false)).ToList();

        if (packages.Count == 0)
        {
            _logger.LogWarning(
                "Easy Plugin: could not fetch the File Transformation manifest ({Url}); " +
                "install the File Transformation plugin manually to enable the sidebar tweaks.",
                FtRepoUrl);
            return;
        }

        var target = _installationManager.GetCompatibleVersions(packages, id: FtPluginId).FirstOrDefault();
        if (target is null)
        {
            _logger.LogWarning("Easy Plugin: no ABI-compatible File Transformation version found for this server.");
            return;
        }

        await _installationManager.InstallPackage(target, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation(
            "Easy Plugin: installed File Transformation {Version}. Restart Jellyfin to activate the sidebar tweaks.",
            target.Version);
    }

    private void EnsureRepository()
    {
        var repos = _config.Configuration.PluginRepositories ?? Array.Empty<RepositoryInfo>();
        if (repos.Any(r => r.Url is not null && r.Url.Equals(FtRepoUrl, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        _config.Configuration.PluginRepositories = repos
            .Append(new RepositoryInfo { Name = FtRepoName, Url = FtRepoUrl, Enabled = true })
            .ToArray();
        _config.SaveConfiguration();
        _logger.LogInformation("Easy Plugin: added the File Transformation plugin repository ({Url}).", FtRepoUrl);
    }
}
