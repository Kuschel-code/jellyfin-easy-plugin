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
    /// Gets or sets the sidebar entries in the desired top-to-bottom order: configuration-page
    /// <c>name</c> values, plus <c>group:&lt;id&gt;</c> tokens marking where a whole group sits
    /// (each token precedes that group's member names). Entries without a position keep their
    /// natural order after the positioned ones.
    /// </summary>
    public string[] Order { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Gets or sets plugin pages that do NOT normally appear in the sidebar but should be
    /// force-added to it.
    /// </summary>
    public AddedPage[] Added { get; set; } = Array.Empty<AddedPage>();

    /// <summary>
    /// Gets or sets the sidebar groups. A group bundles plugin entries under a collapsible header.
    /// Group order is the array order; a plugin is ungrouped when no group lists it in <c>Members</c>.
    /// Groups affect sidebar display only.
    /// </summary>
    public PluginGroup[] Groups { get; set; } = Array.Empty<PluginGroup>();
}

/// <summary>A named, collapsible sidebar group that bundles plugin entries.</summary>
public class PluginGroup
{
    /// <summary>Gets or sets the stable identifier (used for the collapse-state key).</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Gets or sets the human-readable group name shown as the sidebar header.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Gets or sets the member configuration-page <c>name</c> values, in display order.</summary>
    public string[] Members { get; set; } = Array.Empty<string>();
}

/// <summary>An extra plugin page force-added to the sidebar.</summary>
public class AddedPage
{
    /// <summary>Gets or sets the configuration-page <c>name</c> (the <c>?name=</c> value).</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Gets or sets the human-readable label to show in the sidebar.</summary>
    public string DisplayName { get; set; } = string.Empty;
}
