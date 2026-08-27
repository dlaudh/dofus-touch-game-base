# game-base (local client bootstrap)

Clean, from-scratch replacement for Ankama's dead web-client entry point.
Ankama no longer serves a loadable client URL (the old
`proxyconnection.touch.dofus.com` is gone), so — like Lindo's `lindo-game-base`
— the wrapper bootstraps the client **locally**.

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
   `patches.json` before it runs — the download+patch+cache step mirrors what
   Lindo does. The bundle is re-downloaded only when the client version changes
   (read from `config.json`'s `assetsUrl`; tracked in `build/version.txt`);
   otherwise the cache is reused and patches are re-applied each launch.
4. **Login** — the client's OAuth flow opens in a dedicated Electron auth
   window; the `dofustouch://authorized?code=...` redirect is captured
   (`src/main/windows.ts`) and handed back to the client's own deeplink handler
   (`window.__dtd_onAuthRedirect` in `index.html`).

## Files

- `index.html` — bootstrap (fake Cordova env, macOS rAF note, config fetch, loader)
- `fixes.js` / `fixes.css` — runtime + style fixes applied after the client loads
  (mouse→touch, window-shape layout, black-bar/zoom fixes, popup sizing)
- `patches.json` — regex transforms applied to the downloaded client bundle
- `shortcuts.js` — desktop keyboard shortcuts + mouse-wheel zoom
- `mover.js` — A* pathfinder helper (ported from Lindo)
- `mods.js` + `mods/*.js` — quality-of-life mods ported from Lindo (always on)
- `keymaster.js` — keyboard-dep stub

## Patches are version-fragile

`patches.json` regexes key to the **minified** client bundle (currently
**v3.2.13**) and must be re-derived when Ankama ships a new build. Patterns that
don't match are skipped with a warning (`[dtd] patches: N applied, M skipped`),
so a bumped client version that logs skips is the signal to update the affected
regexes. The seed transforms mirror Lindo's `zenoxs/lindo-game-base` `regex.json`
where possible.
