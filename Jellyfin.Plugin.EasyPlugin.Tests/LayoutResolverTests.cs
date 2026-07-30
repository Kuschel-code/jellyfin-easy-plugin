using Jellyfin.Plugin.EasyPlugin.Configuration;
using Xunit;

namespace Jellyfin.Plugin.EasyPlugin.Tests;

public class LayoutResolverTests
{
    private const string UserA = "6f2a1c5e-0000-4000-8000-000000000001";
    private const string UserB = "6f2a1c5e-0000-4000-8000-000000000002";

    private static PluginConfiguration Config() => new()
    {
        Hidden = new[] { "DefaultHidden" },
        Order = new[] { "A", "B" },
        Groups = new[] { new PluginGroup { Id = "g1", Name = "Default group", Members = new[] { "A" } } }
    };

    [Fact]
    public void Resolve_PerUserOff_AlwaysReturnsServerDefault()
    {
        var c = Config();
        c.PerUser = false;
        c.Users = new[] { new UserLayout { UserId = UserA, Order = new[] { "Z" } } };

        var layout = LayoutResolver.Resolve(c, UserA);

        Assert.Equal(new[] { "A", "B" }, layout.Order);
    }

    [Fact]
    public void Resolve_PerUserOn_ReturnsUsersOwnLayout()
    {
        var c = Config();
        c.PerUser = true;
        c.Users = new[] { new UserLayout { UserId = UserA, Order = new[] { "Z" }, Hidden = new[] { "Q" } } };

        var layout = LayoutResolver.Resolve(c, UserA);

        Assert.Equal(new[] { "Z" }, layout.Order);
        Assert.Equal(new[] { "Q" }, layout.Hidden);
    }

    [Fact]
    public void Resolve_PerUserOn_UserWithoutLayout_FallsBackToDefault()
    {
        var c = Config();
        c.PerUser = true;
        c.Users = new[] { new UserLayout { UserId = UserA, Order = new[] { "Z" } } };

        var layout = LayoutResolver.Resolve(c, UserB);

        Assert.Equal(new[] { "A", "B" }, layout.Order);
    }

    [Theory]
    [InlineData("6F2A1C5E-0000-4000-8000-000000000001")]         // different casing
    [InlineData("6f2a1c5e000040008000000000000001")]             // "N" format, no dashes
    public void Resolve_MatchesUserIdRegardlessOfGuidFormat(string requestId)
    {
        var c = Config();
        c.PerUser = true;
        c.Users = new[] { new UserLayout { UserId = UserA, Order = new[] { "Z" } } };

        var layout = LayoutResolver.Resolve(c, requestId);

        Assert.Equal(new[] { "Z" }, layout.Order);
    }

    [Fact]
    public void Resolve_NullUser_ReturnsDefaultAndNoCollapseState()
    {
        var c = Config();
        c.PerUser = true;
        c.CollapseStates = new[] { new UserCollapseState { UserId = UserA, Collapsed = new[] { "g1" } } };

        var layout = LayoutResolver.Resolve(c, null);

        Assert.Equal(new[] { "A", "B" }, layout.Order);
        Assert.Empty(layout.Collapsed);
    }

    [Fact]
    public void Resolve_CollapseStateIsPersonal_EvenWhenPerUserIsOff()
    {
        var c = Config();
        c.PerUser = false;
        c.CollapseStates = new[]
        {
            new UserCollapseState { UserId = UserA, Collapsed = new[] { "g1" } }
        };

        Assert.Equal(new[] { "g1" }, LayoutResolver.Resolve(c, UserA).Collapsed);
        Assert.Empty(LayoutResolver.Resolve(c, UserB).Collapsed);
    }

    [Fact]
    public void SetCollapsed_AddsAndRemoves_WithoutTouchingOtherUsers()
    {
        var c = Config();
        c.CollapseStates = new[] { new UserCollapseState { UserId = UserB, Collapsed = new[] { "g9" } } };

        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "g1", true);
        Assert.Equal(new[] { "g1" }, LayoutResolver.Resolve(c, UserA).Collapsed);
        Assert.Equal(new[] { "g9" }, LayoutResolver.Resolve(c, UserB).Collapsed);

        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "g1", false);
        Assert.Empty(LayoutResolver.Resolve(c, UserA).Collapsed);
        Assert.Equal(new[] { "g9" }, LayoutResolver.Resolve(c, UserB).Collapsed);
    }

    [Fact]
    public void SetCollapsed_IsIdempotent_AndDropsEmptyRecords()
    {
        var c = Config();

        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "g1", true);
        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "g1", true);
        Assert.Equal(new[] { "g1" }, LayoutResolver.Resolve(c, UserA).Collapsed);

        // Expanding the only collapsed group removes the user's record entirely.
        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "g1", false);
        Assert.Empty(c.CollapseStates);
    }

    [Fact]
    public void SetCollapsed_IgnoresAGroupThatDoesNotExist()
    {
        // Any signed-in user can reach the collapse endpoint, so made-up ids must not be able to
        // grow the stored configuration.
        var c = Config();

        var result = LayoutResolver.SetCollapsed(c, UserA, "not-a-group", true);

        Assert.Empty(result);
    }

    [Fact]
    public void SetCollapsed_StillClearsAStaleIdAfterItsGroupIsDeleted()
    {
        var c = Config();
        c.CollapseStates = new[] { new UserCollapseState { UserId = UserA, Collapsed = new[] { "gone" } } };

        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "gone", false);

        Assert.Empty(LayoutResolver.Resolve(c, UserA).Collapsed);
    }

    [Fact]
    public void SetCollapsed_AcceptsAGroupThatOnlyExistsInAUserLayout()
    {
        var c = Config();
        c.PerUser = true;
        c.Users = new[]
        {
            new UserLayout
            {
                UserId = UserA,
                Groups = new[] { new PluginGroup { Id = "mine", Name = "Mine", Members = new[] { "A" } } }
            }
        };

        c.CollapseStates = LayoutResolver.SetCollapsed(c, UserA, "mine", true);

        Assert.Equal(new[] { "mine" }, LayoutResolver.Resolve(c, UserA).Collapsed);
    }

    [Fact]
    public void SetCollapsed_WithoutUser_LeavesStoreUnchanged()
    {
        var c = Config();
        c.CollapseStates = new[] { new UserCollapseState { UserId = UserA, Collapsed = new[] { "g1" } } };

        var result = LayoutResolver.SetCollapsed(c, null, "g1", true);

        Assert.Equal(c.CollapseStates, result);
    }

    [Fact]
    public void Resolve_NullArraysFromXml_BecomeEmptyNotNull()
    {
        // The XML deserializer leaves omitted elements null, so every accessor must tolerate it.
        var c = new PluginConfiguration
        {
            Hidden = null!,
            Order = null!,
            Added = null!,
            Groups = null!,
            Renames = null!,
            Sections = null!,
            Users = null!,
            CollapseStates = null!
        };

        var layout = LayoutResolver.Resolve(c, UserA);

        Assert.Empty(layout.Hidden);
        Assert.Empty(layout.Order);
        Assert.Empty(layout.Added);
        Assert.Empty(layout.Groups);
        Assert.Empty(layout.Renames);
        Assert.Empty(layout.Sections);
        Assert.Empty(layout.Collapsed);
    }
}
