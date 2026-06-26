# Easy Plugin — Sidebar Groups + inline-iframe black-bar fix

Date: 2026-06-26 · Target: v0.0.5 · Jellyfin 10.11 / net9

## Goal

1. Let the admin create named, collapsible **groups** in the sidebar "Plugins" section and
   assign plugins into them (sub-ordering). Groups affect **display only**, never plugin function.
2. Remove the **black bar** on the left of the inline-settings iframe.

## Decisions (confirmed with user)

- Assignment UX: **drag** plugin rows between group sections in the config page (not a dropdown).
- Ungrouped plugins render **above** the groups in the sidebar.
- Groups can be **created / renamed / deleted** in the config page.
- Group **collapse state** is a per-browser UI preference → `localStorage`, not server config.

## Data model

`PluginConfiguration` gains:

```csharp
public class PluginGroup
{
    public string Id { get; set; } = "";      // stable slug/guid
    public string Name { get; set; } = "";     // display name
    public string[] Members { get; set; } = []; // plugin page Names, in order
}
public PluginGroup[] Groups { get; set; } = [];
```

XML-serializable (arrays, no Dictionary). Group order = array order; member order = `Members` order;
a plugin is **ungrouped** iff it is in no group's `Members`. `Order` (existing) still drives the
ungrouped plugins' order; `Hidden`/`Added` unchanged.

`GET /EasyPlugin/Config` projection adds (lowercased, matching existing convention):
`groups: [{ id, name, members: [name, ...] }]`.

## Config page (Plugin Manager)

- A **"Groups" bar**: list of group chips with inline-rename + delete (×), and a **"New group"** button.
- The plugin list is rendered as **sections**: `Ungrouped` first, then one section per group (in order),
  then the existing collapsed **"Add another plugin"** (extras) section.
- **Drag** a plugin row from any section into another → reassign it (HTML5 DnD, reuse existing
  `wireRows` dragover/insert; on drop, recompute membership from DOM and auto-save). Within a section,
  drag still reorders.
- Empty groups show a dashed "drop plugins here" placeholder so they remain a drop target.
- Auto-save (existing debounce). On save, `save()` rebuilds `Groups` from the section DOM + dispatches
  the existing `easyplugin-config-changed` event so the sidebar updates live.

## Sidebar (client.js)

- For each non-empty group, inject a **group header** node (`data-ep-group=<id>`, styled like
  `MuiListSubheader` with a caret), re-applied on mutation + the live-refresh event (same pattern
  as the added clones).
- Ordering via the injected `<style>` (flex `order`): ungrouped plugins first (orders from `Order`),
  then per group `[header, members…]` with a big gap between groups; members get a left **indent**
  (`padding-left`).
- **Collapse**: clicking a header toggles `localStorage` key `ep-group-collapsed:<id>`; collapsed →
  the group's member `<a>`s get `display:none` (rebuilt in `buildStyle`). Header always visible.
- Hidden plugins (existing `Hidden`) stay hidden regardless of group. `unpinSection` behavior
  (native section position, no top-pin) is unchanged.

## Black-bar fix

Root cause: Jellyfin's `.page` is `position:absolute` with `left:<drawer-width>` (~240px) reserved for
the nav drawer. The inline iframe hides the drawer but the offset remained → black bar. Fix: the
chrome-hiding CSS injected into the iframe (`toggleEmbed`) adds
`.page{left:0!important;right:0!important;width:100%!important;margin:0!important;}`.
Verified live: page left 240→0, content fills the iframe.

## Out of scope

Nested groups (groups-in-groups); cross-tab live sync of group edits (covered by the existing
`visibilitychange` refresh); changing actual plugin load order/function.

## Verification

Live on TestFlix (Playwright): create group, drag a plugin in, sidebar shows collapsible header with
indented member live (no reload); collapse persists across reload; rename/delete; ungrouped above;
black bar gone. 0 console errors. Then release v0.0.5 (manual package + manifest sync + checksum
re-download verify, per project memory).
