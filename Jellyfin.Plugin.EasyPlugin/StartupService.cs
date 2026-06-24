using System;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Common.Updates;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Updates;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.EasyPlugin;

/// <summary>
/// On startup, makes sure the <c>index.html</c> transformation is registered:
/// <list type="bullet">
/// <item>If the File Transformation plugin is loaded, register via its callback API (preferred).</item>
/// <item>If it is installed but not yet loaded, ask the user to restart.</item>
/// <item>If it is missing entirely, install it automatically from its official repository;
/// Easy Plugin then activates after the next restart.</item>
/// </list>
/// There is no on-disk fallback by design (the container's jellyfin-web is typically read-only).
/// </summary>
public class StartupService : IHostedService
{
    private const string FtAssemblyMarker = ".FileTransformation";
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
            // File Transformation loads into its own AssemblyLoadContext, so scan every context.
            var ftAssembly = AssemblyLoadContext.All
                .SelectMany(alc => alc.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(FtAssemblyMarker, StringComparison.Ordinal) ?? false);

            if (ftAssembly is not null)
            {
                // External File Transformation is present and loaded -> use it (our auto-install stays off).
                RegisterWithFileTransformation(ftAssembly);
                return;
            }

            // Not loaded. If it is already installed (pending a restart), don't reinstall.
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

    private void RegisterWithFileTransformation(Assembly ftAssembly)
    {
        var pluginInterface = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
        var register = pluginInterface?.GetMethod("RegisterTransformation");
        if (register is null)
        {
            _logger.LogWarning(
                "Easy Plugin: FileTransformation.PluginInterface.RegisterTransformation not found; " +
                "the File Transformation API may have changed.");
            return;
        }

        // Callback mode: File Transformation loads this assembly/type and invokes the named static
        // method, passing { "contents": "<index.html>" } and serving its return value.
        var payload = new JObject
        {
            { "id", Plugin.Instance!.Id.ToString() },
            { "fileNamePattern", "index.html" },
            { "callbackAssembly", typeof(Plugin).Assembly.FullName },
            { "callbackClass", typeof(TransformationPatches).FullName },
            { "callbackMethod", nameof(TransformationPatches.IndexHtml) }
        };

        register.Invoke(null, new object?[] { payload });
        _logger.LogInformation("Easy Plugin: registered the index.html transformation with File Transformation.");
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

        // Downloads the zip, verifies its MD5 against the manifest, extracts it, then flags a
        // pending restart. The plugin does NOT load in this process.
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
