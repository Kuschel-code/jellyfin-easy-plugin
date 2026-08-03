using System.IO;
using System.Xml.Serialization;
using Jellyfin.Plugin.EasyPlugin.Configuration;
using Xunit;

namespace Jellyfin.Plugin.EasyPlugin.Tests;

/// <summary>
/// Jellyfin persists plugin configuration as XML and rebuilds it with <see cref="XmlSerializer"/>
/// on every start. If deserialization throws, the server silently falls back to a brand-new
/// default configuration — the user's whole layout disappears. Updating the plugin is exactly when
/// an old file meets a new class, so every shipped shape has to keep loading.
/// </summary>
public class ConfigurationCompatibilityTests
{
    private static PluginConfiguration Deserialize(string xml)
    {
        var serializer = new XmlSerializer(typeof(PluginConfiguration));
        using var reader = new StringReader(xml);
        return (PluginConfiguration)serializer.Deserialize(reader)!;
    }

    [Fact]
    public void Load_ConfigWrittenBy_0_0_1()
    {
        var c = Deserialize(@"<?xml version=""1.0"" encoding=""utf-8""?>
<PluginConfiguration xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"">
  <Enabled>true</Enabled>
  <Hidden><string>PlugX</string></Hidden>
  <Order><string>PlugA</string><string>PlugB</string></Order>
</PluginConfiguration>");

        Assert.True(c.Enabled);
        Assert.Equal(new[] { "PlugX" }, c.Hidden);
        Assert.Equal(new[] { "PlugA", "PlugB" }, c.Order);
    }

    [Fact]
    public void Load_ConfigWrittenBy_0_0_4_WithAddedPages()
    {
        var c = Deserialize(@"<?xml version=""1.0"" encoding=""utf-8""?>
<PluginConfiguration xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"">
  <Enabled>true</Enabled>
  <Hidden><string>PlugX</string></Hidden>
  <Order><string>PlugA</string></Order>
  <Added>
    <AddedPage><Name>Extra1</Name><DisplayName>Extra One</DisplayName></AddedPage>
  </Added>
</PluginConfiguration>");

        Assert.Single(c.Added);
        Assert.Equal("Extra1", c.Added[0].Name);
        Assert.Equal("Extra One", c.Added[0].DisplayName);
    }

    [Fact]
    public void Load_ConfigWrittenBy_0_0_6_WithGroups()
    {
        var c = Deserialize(@"<?xml version=""1.0"" encoding=""utf-8""?>
<PluginConfiguration xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"">
  <Enabled>true</Enabled>
  <Hidden><string>PlugX</string></Hidden>
  <Order><string>PlugA</string><string>group:g1</string><string>MemX</string></Order>
  <Added>
    <AddedPage><Name>Extra1</Name><DisplayName>Extra One</DisplayName></AddedPage>
  </Added>
  <Groups>
    <PluginGroup>
      <Id>g1</Id>
      <Name>Tools</Name>
      <Members><string>MemX</string></Members>
    </PluginGroup>
  </Groups>
</PluginConfiguration>");

        Assert.Equal(new[] { "PlugA", "group:g1", "MemX" }, c.Order);
        Assert.Single(c.Groups);
        Assert.Equal("g1", c.Groups[0].Id);
        Assert.Equal(new[] { "MemX" }, c.Groups[0].Members);
        Assert.Equal(string.Empty, c.Groups[0].Icon);   // field added in 0.0.7
        Assert.Single(c.Added);

        // Fields introduced later must land on their defaults, not null: everything downstream
        // indexes into these arrays.
        Assert.False(c.PerUser);
        Assert.False(c.ShowSearch);
        Assert.NotNull(c.Renames);
        Assert.NotNull(c.Sections);
        Assert.NotNull(c.Users);
        Assert.NotNull(c.CollapseStates);
    }

    [Fact]
    public void Load_ConfigFromAFutureVersion_IgnoresUnknownElements()
    {
        // Downgrades happen too (a user rolls back). An element the class does not know must not
        // take the whole file down with it.
        var serializer = new XmlSerializer(typeof(PluginConfiguration));
        var failed = false;
        serializer.UnknownElement += (_, _) => failed = true;

        using var reader = new StringReader(@"<?xml version=""1.0"" encoding=""utf-8""?>
<PluginConfiguration xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"">
  <Enabled>true</Enabled>
  <Hidden><string>PlugX</string></Hidden>
  <SomethingFromTheFuture><Nested>1</Nested></SomethingFromTheFuture>
</PluginConfiguration>");
        var c = (PluginConfiguration)serializer.Deserialize(reader)!;

        Assert.Equal(new[] { "PlugX" }, c.Hidden);
        Assert.True(failed, "sanity: the unknown element really was present");
    }

    [Fact]
    public void RoundTrip_CurrentShape_Survives()
    {
        var original = new PluginConfiguration
        {
            Enabled = true,
            PerUser = true,
            ShowSearch = true,
            Hidden = new[] { "H" },
            Order = new[] { "A", "group:g1" },
            Added = new[] { new AddedPage { Name = "E", DisplayName = "Extra" } },
            Groups = new[] { new PluginGroup { Id = "g1", Name = "G", Icon = "tune", Members = new[] { "A" } } },
            Renames = new[] { new RenamedPage { Name = "A", DisplayName = "Alpha" } },
            Sections = new[] { new NavSection { Id = "server-subheader", Hidden = new[] { "#/x" }, Order = new[] { "#/y" } } },
            Users = new[] { new UserLayout { UserId = "u1", Order = new[] { "B" } } },
            CollapseStates = new[] { new UserCollapseState { UserId = "u1", Collapsed = new[] { "g1" } } }
        };

        var serializer = new XmlSerializer(typeof(PluginConfiguration));
        using var writer = new StringWriter();
        serializer.Serialize(writer, original);
        var back = Deserialize(writer.ToString());

        Assert.Equal(original.Order, back.Order);
        Assert.Equal("tune", back.Groups[0].Icon);
        Assert.Equal("Alpha", back.Renames[0].DisplayName);
        Assert.Equal("server-subheader", back.Sections[0].Id);
        Assert.Equal("u1", back.Users[0].UserId);
        Assert.Equal(new[] { "g1" }, back.CollapseStates[0].Collapsed);
    }
}
