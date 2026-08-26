# game-base (local client bootstrap)

Clean, from-scratch replacement for Ankama's dead web-client entry point.
Ankama no longer serves a loadable client URL (the old
`proxyconnection.touch.dofus.com` is gone), so — like Lindo's `lindo-game-base`
— the wrapper must bootstrap the client **locally**.

## How it works

1. The wrapper copies these files into `<app_data>/game-base/` on launch
   (see `src-tauri/src/game_base.rs`) and serves them to the game WebView via
   the `dofus://` Tauri protocol.
2. `index.html` fakes the Cordova/Android environment the mobile client
   expects, fetches Ankama's `config.json`, sets `window.Config`, then loads
   the patched client bundle from `./build/script.js`.
3. `build/script.js` is **downloaded to `<app_data>/game-base/build/`** from a
   configured URL and **patched** using `patches.json` before it runs. The
   download+patch+cache step mirrors what Lindo does to appdata.

## Files

- `index.html` — bootstrap (fake Cordova env, macOS rAF fix, config fetch, loader)
- `fixes.js` / `fixes.css` — runtime/style fixes applied after the client loads
- `patches.json` — regex transforms applied to the downloaded client bundle
- `keymaster.js` — keyboard-dep stub

## PROVISIONAL — needs the real client bundle

The hard, version-fragile parts cannot be finalized without the live client
build (**currently v3.2.13**), which sits behind a locked CDN:

- The exact `client_build_url` for `build/script.js` (+ `styles-native.css`).
- The exact `patches.json` regexes — they key to the minified bundle and must
  be re-derived per client version. The seed list here captures the KNOWN
  transform *intents*; patterns that don't match are skipped with a warning.
- Whether the client reads `window.Config` vs fetches `config.json` itself,
  and any extra globals it needs at boot.

Login: the wrapper auto-intercepts `dofustouch://authorized?code=...` in Rust
(`on_navigation`) and feeds the code to `window.dofus.CustomAuth`; the
`patches.json` login entry is a manual fallback.
