using System;
using System.Linq;

namespace Jellyfin.Plugin.EasyPlugin.Configuration;

/// <summary>
/// Works out which layout a given user actually sees, and applies collapse-state changes.
/// Pure functions over the configuration object so the rules stay unit-testable.
/// </summary>
public static class LayoutResolver
{
    /// <summary>
    /// Resolves the layout for <paramref name="userId"/>: their own when per-user layouts are on
    /// and they have one, otherwise the server default. Collapse state is always personal.
    /// </summary>
    /// <param name="config">The plugin configuration.</param>
    /// <param name="userId">The requesting user's id, or null when unknown.</param>
    /// <returns>The layout to render for that user.</returns>
    public static EffectiveLayout Resolve(PluginConfiguration config, string? userId)
    {
        ArgumentNullException.ThrowIfNull(config);

        var user = config.PerUser ? FindUser(config, userId) : null;

        return new EffectiveLayout
        {
            Hidden = user?.Hidden ?? config.Hidden ?? Array.Empty<string>(),
            Order = user?.Order ?? config.Order ?? Array.Empty<string>(),
            Added = user?.Added ?? config.Added ?? Array.Empty<AddedPage>(),
            Groups = user?.Groups ?? config.Groups ?? Array.Empty<PluginGroup>(),
            Renames = user?.Renames ?? config.Renames ?? Array.Empty<RenamedPage>(),
            Sections = user?.Sections ?? config.Sections ?? Array.Empty<NavSection>(),
            Collapsed = FindCollapsed(config, userId)
        };
    }

    /// <summary>
    /// Collapses or expands one group for one user, returning the updated collapse store. The
    /// user's entry is created on first use and dropped again once nothing is collapsed, so the
    /// configuration does not accumulate empty records.
    /// <para>
    /// Collapsing is only accepted for a group that actually exists. The endpoint behind this is
    /// reachable by any signed-in user, and without the check they could grow their own record
    /// without limit by posting made-up ids. Expanding is always allowed, so ids left behind by a
    /// deleted group can still be cleared.
    /// </para>
    /// </summary>
    /// <param name="config">The plugin configuration.</param>
    /// <param name="userId">The user whose state changes.</param>
    /// <param name="groupId">The group being toggled.</param>
    /// <param name="collapsed">True to collapse, false to expand.</param>
    /// <returns>The new value for <see cref="PluginConfiguration.CollapseStates"/>.</returns>
    public static UserCollapseState[] SetCollapsed(
        PluginConfiguration config,
        string? userId,
        string? groupId,
        bool collapsed)
    {
        ArgumentNullException.ThrowIfNull(config);

        var states = config.CollapseStates ?? Array.Empty<UserCollapseState>();
        if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(groupId))
        {
            return states;
        }

        if (collapsed && !GroupExists(config, groupId))
        {
            return states;
        }

        var current = FindCollapsed(config, userId);
        var updated = collapsed
            ? (current.Contains(groupId, StringComparer.Ordinal) ? current : current.Append(groupId).ToArray())
            : current.Where(g => !string.Equals(g, groupId, StringComparison.Ordinal)).ToArray();

        var others = states.Where(s => !SameUser(s.UserId, userId));
        return updated.Length == 0
            ? others.ToArray()
            : others.Append(new UserCollapseState { UserId = userId, Collapsed = updated }).ToArray();
    }

    // A group counts as real if it is in the server default or in any user's layout — collapse
    // state is personal, but the group it points at may come from either.
    private static bool GroupExists(PluginConfiguration config, string groupId)
    {
        var inDefault = (config.Groups ?? Array.Empty<PluginGroup>())
            .Any(g => g is not null && string.Equals(g.Id, groupId, StringComparison.Ordinal));

        return inDefault || (config.Users ?? Array.Empty<UserLayout>())
            .Any(u => (u?.Groups ?? Array.Empty<PluginGroup>())
                .Any(g => g is not null && string.Equals(g.Id, groupId, StringComparison.Ordinal)));
    }

    private static UserLayout? FindUser(PluginConfiguration config, string? userId)
    {
        if (string.IsNullOrEmpty(userId))
        {
            return null;
        }

        return (config.Users ?? Array.Empty<UserLayout>())
            .FirstOrDefault(u => SameUser(u.UserId, userId));
    }

    private static string[] FindCollapsed(PluginConfiguration config, string? userId)
    {
        if (string.IsNullOrEmpty(userId))
        {
            return Array.Empty<string>();
        }

        return (config.CollapseStates ?? Array.Empty<UserCollapseState>())
            .FirstOrDefault(s => SameUser(s.UserId, userId))
            ?.Collapsed ?? Array.Empty<string>();
    }

    // User ids travel as strings and reach us in whatever Guid format the caller used ("N" vs "D",
    // any casing), so compare parsed Guids when possible and fall back to a loose string compare.
    private static bool SameUser(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
        {
            return false;
        }

        return Guid.TryParse(a, out var ga) && Guid.TryParse(b, out var gb)
            ? ga.Equals(gb)
            : string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>The layout one user actually sees, after per-user resolution.</summary>
public class EffectiveLayout
{
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

    /// <summary>Gets or sets the ids of the groups this user has collapsed.</summary>
    public string[] Collapsed { get; set; } = Array.Empty<string>();
}
