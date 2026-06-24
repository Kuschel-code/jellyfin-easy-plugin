using System;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.EasyPlugin.Configuration;

/// <summary>
/// Easy Plugin configuration: which sidebar plugin entries are hidden, and their order.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Gets or sets a value indicating whether the sidebar tweaks are applied.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets the configuration-page <c>name</c> values (configurationpage?name=XYZ)
    /// that should be hidden in the sidebar.
    /// </summary>
    public string[] Hidden { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Gets or sets the configuration-page <c>name</c> values in the desired top-to-bottom order.
    /// </summary>
    public string[] Order { get; set; } = Array.Empty<string>();
}
