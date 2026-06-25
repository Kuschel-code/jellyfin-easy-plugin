# Easy Plugin

A Jellyfin plugin (server **10.11.x / .NET 9**) that tidies the admin sidebar: **hide**, **reorder**
and even **add** plugin configuration entries — and open any plugin's settings **inline** — all from
one auto-saving page.

## Features

- **Hide / show** any plugin entry in the admin sidebar.
- **Reorder** entries by drag-and-drop.
- **One row per plugin** — a plugin that registers several settings pages (e.g. AI Upscaler)
  collapses to a single entry instead of cluttering the list.
- **Add another plugin** — plugins that don't normally appear in the sidebar (e.g. metadata
  providers) live in a collapsible section; toggle one on to force it in. The main list therefore
  shows only the plugins that are actually in your sidebar.
- **Inline settings**: an arrow on each row opens that plugin's own settings in place (a same-origin
  iframe with Jellyfin's header and left nav hidden).
- **Plugins pinned to the top** of the dashboard sidebar — just below the server logo, never above it.
- **Auto-save** — changes apply immediately, no Save button. Turning the plugin off restores the
  original sidebar untouched.

## How it works

Jellyfin core gives a plugin no hook to filter *other* plugins' configuration pages — jellyfin-web
renders those links in the browser (the `PluginDrawerSection` component, as
`#/configurationpage?name=<Name>` links under `ul[aria-labelledby="plugins-subheader"]`). So Easy
Plugin works **client-side, in the DOM**:

- A small script is injected into `index.html` **in memory** (never patched on disk) via a File
  Transformation provider.
- Hide/reorder are expressed as an injected `<style>` (CSS `display:none` + flexbox `order`) so they
  survive React re-renders; "added" entries are injected as cloned MUI list items and re-applied on
  each mutation.

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
```

The embedded web resources (`Web/client.js`, `Configuration/configPage.html`) are minified at build
time (an inline MSBuild task strips comments and whitespace) to keep the plugin DLL small.

## Release

```bash
git tag v0.0.2
git push origin v0.0.2
```

The Release workflow builds the DLL, packages it with `meta.json` into a zip and prints the MD5; put
that MD5 into `manifest.json`'s version entry.

## Caveats

- Verified against jellyfin-web **10.11**. If a future web build changes the `plugins-subheader`
  list id or the `#/configurationpage?name=` href format, update the selectors in `Web/client.js`.
- The injected script and the `/EasyPlugin/Config` endpoint are anonymous (a `<script src>` tag
  carries no auth token); only the non-sensitive hidden/order/added name lists are exposed.
