using System;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.EasyPlugin.Configuration;

/// <summary>
/// Easy Plugin configuration.
/// <para>
/// The layout fields on this class (<see cref="Hidden"/>, <see cref="Order"/>, <see cref="Added"/>,
/// <see cref="Groups"/>, <see cref="Renames"/>, <see cref="Sections"/>) are the <b>server default</b>
/// layout — what every user sees unless <see cref="PerUser"/> is on and they have their own entry in
/// <see cref="Users"/>. Keeping the default in the flat fields means configurations written by
/// earlier versions keep working untouched, with no migration step.
/// </para>
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Gets or sets a value indicating whether the sidebar tweaks are applied.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether each user gets their own sidebar layout. When off,
    /// everyone shares the server default; when on, a user with an entry in <see cref="Users"/>
    /// sees that instead.
    /// </summary>
    public bool PerUser { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether a filter box is shown above the sidebar plugin list.
    /// </summary>
    public bool ShowSearch { get; set; }

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
    /// Group order is determined by the <c>group:&lt;id&gt;</c> token in <see cref="Order"/>.
    /// Groups affect sidebar display only.
    /// </summary>
    public PluginGroup[] Groups { get; set; } = Array.Empty<PluginGroup>();

    /// <summary>
    /// Gets or sets custom labels for sidebar entries that already exist (entries force-added via
    /// <see cref="Added"/> carry their own label).
    /// </summary>
    public RenamedPage[] Renames { get; set; } = Array.Empty<RenamedPage>();

    /// <summary>
    /// Gets or sets per-section overrides for the other admin-sidebar sections (Server, Devices,
    /// Live TV, …). Those hold core dashboard links rather than plugin pages, so they are keyed by
    /// link target instead of configuration-page name.
    /// </summary>
    public NavSection[] Sections { get; set; } = Array.Empty<NavSection>();

    /// <summary>
    /// Gets or sets the per-user layout overrides, used only when <see cref="PerUser"/> is on.
    /// </summary>
    public UserLayout[] Users { get; set; } = Array.Empty<UserLayout>();

    /// <summary>
    /// Gets or sets which groups each user has collapsed. Collapse state is always personal, no
    /// matter how <see cref="PerUser"/> is set, and is remembered server-side so it follows the
    /// user across browsers and devices.
    /// </summary>
    public UserCollapseState[] CollapseStates { get; set; } = Array.Empty<UserCollapseState>();
}

/// <summary>One user's sidebar layout, overriding the server default.</summary>
public class UserLayout
{
    /// <summary>Gets or sets the Jellyfin user id this layout belongs to.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Gets or sets the hidden configuration-page names.</summary>
    public string[] Hidden { get; set; } = Array.Empty<string>();

    /// <summary>Gets or sets the ordered entry names and <c>group:&lt;id&gt;</c> tokens.</summary>
    public string[] Order { get; set; } = Array.Empty<string>();

    /// <summary>Gets or sets the force-added pages.</summary>
    public AddedPage[] Added { get; set; } = Array.Empty<AddedPage>();

    /// <summary>Gets or sets the groups.</summary>
    public PluginGroup[] Groups { get; set; } = Array.Empty<PluginGroup>();

    /// <summary>Gets or sets the custom labels.</summary>
    public RenamedPage[] Renames { get; set; } = Array.Empty<RenamedPage>();

    /// <summary>Gets or sets the other-section overrides.</summary>
    public NavSection[] Sections { get; set; } = Array.Empty<NavSection>();
}

/// <summary>A named, collapsible sidebar group that bundles plugin entries.</summary>
public class PluginGroup
{
    /// <summary>Gets or sets the stable identifier (used for the collapse-state key).</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Gets or sets the human-readable group name shown as the sidebar header.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the optional Material icon ligature (e.g. <c>tune</c>) shown before the name.
    /// Empty means no icon.
    /// </summary>
    public string Icon { get; set; } = string.Empty;

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

/// <summary>A custom label for a sidebar entry that Jellyfin already renders.</summary>
public class RenamedPage
{
    /// <summary>Gets or sets the configuration-page <c>name</c> to relabel.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Gets or sets the label to show instead of the plugin's own.</summary>
    public string DisplayName { get; set; } = string.Empty;
}

/// <summary>Hide/reorder overrides for one non-plugin section of the admin sidebar.</summary>
public class NavSection
{
    /// <summary>
    /// Gets or sets the section identifier — the <c>aria-labelledby</c> value of the section's
    /// list (e.g. <c>server-subheader</c>).
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Gets or sets the hidden entries, keyed by link target (the <c>href</c>).</summary>
    public string[] Hidden { get; set; } = Array.Empty<string>();

    /// <summary>Gets or sets the entry link targets in the desired top-to-bottom order.</summary>
    public string[] Order { get; set; } = Array.Empty<string>();
}

/// <summary>The groups one user has collapsed in their sidebar.</summary>
public class UserCollapseState
{
    /// <summary>Gets or sets the Jellyfin user id.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Gets or sets the ids of the groups that are collapsed.</summary>
    public string[] Collapsed { get; set; } = Array.Empty<string>();
}
