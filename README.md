# game-base (local client bootstrap)

Clean, from-scratch replacement for Ankama's dead web-client entry point.
Ankama no longer serves a loadable client URL (the old
`proxyconnection.touch.dofus.com` is gone), so the wrapper bootstraps the
client **locally**.

## How it works

1. On launch the main process copies these files into `<userData>/game-base/`
   (`src/main/gameBase.ts`) and serves them over a loopback HTTP server
   (`src/main/server.ts`). The game `BrowserWindow` loads
   `http://127.0.0.1:<port>/index.html`.
2. `index.html` fakes the Cordova/Android environment the mobile client
   expects, fetches Ankama's `config.json`, sets `window.Config`, then loads
   the patched client bundle from `./build/script.js`.
3. `build/script.js` is **downloaded** into `<userData>/game-base/build/` (the
   raw bundle is cached as `script.raw.js`) and **regex-patched** using
   `patches.json` before it runs. Every launch asks the CDN whether the bundle
   changed — a conditional GET against the ETag kept in `build/etag.txt` — and
   downloads it only on a 200; a 304 reuses the cache. Patches are re-applied
   each launch either way. The signal is the bundle's own ETag because the one
   used before (the version segment of `config.json`'s `assetsUrl`) reads
   3.2.13 across builds that differ: Ankama shipped buildVersion 1.73.12 over
   1.73.10 without moving it, and the login server refused the stale client
   with INCOMPATIBLE_BUILD_VERSION.
4. **Login** — the client's OAuth flow opens in a dedicated Electron auth
   window; the `dofustouch://authorized?code=...` redirect is captured
   (`src/main/windows.ts`) and handed back to the client's own deeplink handler
   (`window.__dtd_onAuthRedirect` in `index.html`).

## Files

- `index.html` — bootstrap (fake Cordova env, macOS rAF note, config fetch, loader).
  The config endpoint is overridable with `configUrl` in `settings.json`
- `fixes.js` / `fixes.css` — runtime + style fixes applied after the client loads
  (mouse→touch, window-shape layout, black-bar/zoom fixes, popup sizing)
- `patches.json` — regex transforms applied to the downloaded client bundle
- `mods.js` + `mods/*.js` — quality-of-life mods (always on). Notably
  `mods/shortcuts.js` (desktop keyboard shortcuts + mouse-wheel zoom, inert on
  touch-only hosts)
- `mods/helpers/*.js` — shared code the mods depend on, loaded before them:
  `mod-api.js` (`window.__dtdMod`: readiness, the mod registry, enable/disable),
  `camera-watch.js` (tells map-anchored overlays when the camera moves) and
  `map-mover.js` (A* pathfinder + map-edge navigation)
- `keymaster.js` — keyboard-dep stub

## Loading mods that are not in this repo

`mods.js` will load an optional `mods.local.js` from the game-base root — a
gitignored file that is never committed here. Use it for mods kept outside this
repository (development tooling, anything not meant to ship publicly):

```js
// mods.local.js
window.__dtdMods.load("my-mod");               // a file in mods/
window.__dtdMods.loadPath("local/my-mod.js");  // a file anywhere
window.__dtdMod.disable("show-resources");     // switch a stock mod off
```

It is requested **only** when the host sets `"localMods": true` in
`<userData>/settings.json`, so a normal build never asks for a file that is not
there. It runs after the helpers and before the stock mods; scripts it loads are
appended after them, which is still well before the client bundle (that is
fetched inside a remote config request — see `index.html`).

## Patches are version-fragile

`patches.json` regexes key to the **minified** client bundle (currently
**v3.2.13**) and must be re-derived when Ankama ships a new build. Patterns that
don't match are skipped with a warning (`[dtd] patches: N applied, M skipped`),
so a bumped client version that logs skips is the signal to update the affected
regexes. The seed transforms mirror a known-good upstream `regex.json` where
possible.
