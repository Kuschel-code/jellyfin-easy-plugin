# Easy Plugin

A Jellyfin plugin (server **10.11.x / .NET 9**) that tidies the admin sidebar: **hide**, **reorder**
and even **add** plugin configuration entries — and open any plugin's settings **inline** — all from
one auto-saving page.

## Features

- **Hide / show** any plugin entry in the admin sidebar.
- **Reorder** entries by drag-and-drop, or with the **▲/▼ buttons** on every row — the buttons also
  work on touch devices and with the keyboard, where HTML5 dragging does not.
- **Groups** — create named, collapsible groups and move plugins into them; in the sidebar each
  group becomes a header with its plugins nested underneath. Give a group a **Material icon**
  (e.g. `tune`) to make it easier to spot. Groups and ungrouped plugins share one order, and the
  sidebar mirrors it, so a whole group can sit anywhere in the list.
- **Rename** any entry — type over its label to show something shorter than the plugin's own name.
- **Filter box** (optional) above the sidebar's plugin list, for when you have a lot of plugins.
- **The rest of the sidebar** — Jellyfin's own sections (Server, Devices, Live TV, …) can be hidden
  and reordered too.
- **One layout per user** (optional) — off, everyone shares one layout; on, each admin arranges
  their own and falls back to the server default until they change something.
- **Collapse state follows you** — which groups are folded up is stored per user on the server, so
  it is the same in every browser and on every device.
- **One row per plugin** — a plugin that registers several settings pages (e.g. AI Upscaler)
  collapses to a single entry instead of cluttering the list.
- **Add another plugin** — plugins that don't normally appear in the sidebar (e.g. metadata
  providers) live in a collapsible section; toggle one on to force it in. The main list therefore
  shows only the plugins that are actually in your sidebar.
- **Inline settings**: an arrow on each row opens that plugin's own settings in place (a same-origin
  iframe with Jellyfin's header and left nav hidden).
- **Import / export** the whole configuration as JSON — useful for backups and server moves.
- **Live updates** — every change (show/hide, add/remove, reorder, rename, the master switch) applies
  to the sidebar immediately, with no page reload.
- **Auto-save** — changes apply immediately, no Save button. Turning the plugin off restores the
  original sidebar untouched, labels included. The Plugins section keeps its normal place.

## How it works

Jellyfin core gives a plugin no hook to filter *other* plugins' configuration pages — jellyfin-web
renders those links in the browser (the `PluginDrawerSection` component, as
`#/configurationpage?name=<Name>` links under `ul[aria-labelledby="plugins-subheader"]`). So Easy
Plugin works **client-side, in the DOM**:

- A small script is injected into `index.html` **in memory** (never patched on disk) via a File
  Transformation provider.
- Hide/reorder/filter are expressed as an injected `<style>` (CSS `display:none` + flexbox `order`)
  so they survive React re-renders; added entries, group headers, renamed labels and the filter box
  are real DOM nodes, re-applied on each mutation.
- The script reads its layout from `GET /EasyPlugin/Config`, authenticating with the web app's own
  access token. That endpoint requires a signed-in caller — only the script file itself is public,
  since a `<script src>` tag carries no credentials.

### File Transformation

Injection uses a File Transformation provider, gated automatically:

1. If a provider is loaded — the standalone [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
   plugin **and/or** a bundled one (e.g. Custom Theme's `CustomTheme.FileTransformation`) — Easy
   Plugin registers the injection with **all** of them, so the active interceptor applies it.
2. If none is present, Easy Plugin **auto-installs** the File Transformation plugin from its official
   repository; a restart then activates the injection.

There is **no on-disk fallback** by design (the container's jellyfin-web is typically read-only).

## Requirements

- Jellyfin **10.11.x**
- A File Transformation provider — the standalone plugin (GUID `5e87cc92-571a-4d8d-8d98-d2d4147f9f90`),
  or Custom Theme's bundled provider, or let Easy Plugin auto-install it.

## Install

In Jellyfin: **Dashboard → Plugins → Repositories → Add**, paste the manifest URL, then install
**Easy Plugin** from the catalog:

```
https://raw.githubusercontent.com/Kuschel-code/jellyfin-easy-plugin/main/manifest.json
```

## Build

```bash
dotnet build Jellyfin.Plugin.EasyPlugin/Jellyfin.Plugin.EasyPlugin.csproj -c Release
dotnet test

# the browser-side code (client.js + the configuration page), run under jsdom
cd web-tests && npm ci && npm test
```

Most of this plugin's behaviour lives in the browser, so `web-tests/` exercises `Web/client.js` and
`Configuration/configPage.html` directly — sidebar ordering, grouping, renaming, filtering and the
configuration page's save round-trip. Each suite runs the code twice: as written, and as the
minified copy the build actually embeds.

The embedded web resources are minified at build time (an inline MSBuild task strips comments and
whitespace) to keep the plugin DLL small. The build prints the resulting DLL size and warns when it
exceeds `EpMaxDllBytes` — see the note in the `.csproj` for why that budget exists.

## Release

```bash
git tag v0.0.7
git push origin v0.0.7
```

The Release workflow builds the DLL, packages it with `meta.json` into a zip and prints the MD5; put
that MD5 into `manifest.json`'s version entry.

## Caveats

- Verified against jellyfin-web **10.11**. If a future web build changes the `plugins-subheader`
  list id or the `#/configurationpage?name=` href format, update the selectors in `Web/client.js`.
- Only `/EasyPlugin/ClientScript` is anonymous, because a `<script src>` tag carries no credentials.
  The layout endpoint needs a signed-in caller, and the script borrows the web app's access token to
  reach it; before you sign in there is no token, so the sidebar is simply left untouched.
- Renaming and the group headers/filter box work by editing the drawer's DOM on every mutation.
  Hiding and reordering are pure CSS and are the more robust half of the plugin.
