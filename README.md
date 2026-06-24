# Easy Plugin

A Jellyfin plugin (server **10.11.x / .NET 9**) that lets you choose **which** plugin
configuration entries appear in the admin sidebar and **in what order** — by drag-and-drop,
from the plugin's own settings page.

## How it works

Jellyfin core gives a plugin no hook to filter or reorder *other* plugins' configuration
pages: each plugin registers its pages, the server serves them, and **jellyfin-web renders the
links in the browser**. So the filtering has to happen client-side, in the DOM.

The client script is injected **only** through the
[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
plugin, which rewrites `index.html` **in memory** as it is served. Nothing is ever written to
disk, so:

- no file-permission or Docker bind-mount problems,
- server updates never overwrite the injection,
- removing the plugin removes the injection cleanly.

Registration uses File Transformation's **in-process callback** mode (the same mechanism the
JavaScript Injector / Jellyfin Tweaks plugins use): File Transformation loads
`TransformationPatches.IndexHtml` by name and calls it with the current `index.html`, and the
returned string is served. No extra HTTP endpoint and no reverse-proxy URL resolution to misfire.

## Requirements

- Jellyfin **10.11.x**
- The **File Transformation** plugin (GUID `5e87cc92-571a-4d8d-8d98-d2d4147f9f90`), installed
  and enabled.

> **No disk fallback by design.** If File Transformation is not present, Easy Plugin logs a
> warning and does nothing else — it never touches `index.html` on disk.

## Build

```bash
dotnet build Jellyfin.Plugin.EasyPlugin/Jellyfin.Plugin.EasyPlugin.csproj -c Release
dotnet test
```

## Release

```bash
git tag v0.0.1
git push origin v0.0.1
```

The Release workflow builds the DLL, packages `Jellyfin.Plugin.EasyPlugin.dll` + `meta.json`
into a zip, and prints the MD5. Then add a version entry to `manifest.json` (the `versions`
array is intentionally empty until the first release, to avoid 404 / checksum-mismatch install
failures):

```json
{
  "version": "0.0.1.0",
  "changelog": "First release.",
  "targetAbi": "10.11.0.0",
  "sourceUrl": "https://github.com/Kuschel-code/jellyfin-easy-plugin/releases/download/v0.0.1/easy-plugin_0.0.1.zip",
  "checksum": "<md5 printed by the release job>",
  "timestamp": "2026-06-24T00:00:00Z"
}
```

Add the raw URL of `manifest.json` as a plugin repository in Jellyfin to install/update.

## Caveats

- Verified against jellyfin-web 10.11 (`PluginDrawerSection`): plugin entries render as
  React MUI `<a class="MuiListItemButton-root">` under `ul[aria-labelledby="plugins-subheader"]`
  with href `#/configurationpage?name=<Name>`. Because that list is React-managed, the client
  script does **not** move nodes — it injects a `<style>` that hides (`display:none`) and
  reorders (flexbox `order`) entries keyed by href, which survives React re-renders. If a
  future web build changes the subheader id or the href format, update the selectors in
  `Web/client.js`.
- The injected script and the `/EasyPlugin/Config` endpoint are anonymous (a `<script src>`
  tag carries no auth token). Only the non-sensitive hidden/order name lists are exposed.
