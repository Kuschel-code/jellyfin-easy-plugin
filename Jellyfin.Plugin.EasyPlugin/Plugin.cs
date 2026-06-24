using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.EasyPlugin.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.EasyPlugin;

/// <summary>
/// The Easy Plugin entry point: hide and reorder plugin entries in the admin sidebar.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Server application paths.</param>
    /// <param name="xmlSerializer">XML serializer for the configuration.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>Gets the singleton plugin instance.</summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "Easy Plugin";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("f4acffe0-0347-4b20-a69d-d50d6b2b4a7e");

    /// <inheritdoc />
    public override string Description =>
        "Show, hide and reorder plugin configuration entries in the Jellyfin admin sidebar.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = "EasyPlugin",
            EmbeddedResourcePath = string.Format(
                CultureInfo.InvariantCulture,
                "{0}.Configuration.configPage.html",
                GetType().Namespace)
        }
    };
}
