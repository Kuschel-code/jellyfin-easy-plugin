using System;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.EasyPlugin.Configuration;

/// <summary>
/// Easy Plugin configuration: which sidebar plugin entries are hidden, their order, and extra
/// (non-main-menu) plugin pages that should be force-added to the sidebar.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Gets or sets a value indicating whether the sidebar tweaks are applied.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets the configuration-page <c>name</c> values that should be hidden in the sidebar.
    /// </summary>
    public string[] Hidden { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Gets or sets the configuration-page <c>name</c> values in the desired top-to-bottom order.
    /// </summary>
    public string[] Order { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Gets or sets plugin pages that do NOT normally appear in the sidebar but should be
    /// force-added to it.
    /// </summary>
    public AddedPage[] Added { get; set; } = Array.Empty<AddedPage>();
}

/// <summary>An extra plugin page force-added to the sidebar.</summary>
public class AddedPage
{
    /// <summary>Gets or sets the configuration-page <c>name</c> (the <c>?name=</c> value).</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Gets or sets the human-readable label to show in the sidebar.</summary>
    public string DisplayName { get; set; } = string.Empty;
}
