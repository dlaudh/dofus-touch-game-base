// Loads the QoL mods from game-base/mods/*.js. Each mod is a self-contained
// IIFE that registers itself through window.__dtdMod.ready() (see
// mods/helpers/mod-api.js) and hooks the client once it is ready. Add new mods
// to the list below as they are ported from the reference client.
(function () {
  "use strict";

  // Shared helpers from mods/helpers/. Loaded before the mods, because the
  // scripts are appended with async=false and so execute in list order.
  var HELPERS = [
    "mod-api", // window.__dtdMod — readiness, registry, client lookups
    "camera-watch", // notifies map-anchored overlays when the camera moves
    "map-mover", // A* pathfinder + map-edge navigation (used by shortcuts)
  ];

  var MODS = [
    // Combat
    "damage-estimator",
    "fight-chronometer",
    "challenge-percent",
    "health-bar",
    // Map / farming
    "show-resources",
    "harvest-bar",
    "job-xp",
    // Interface
    "grip-position-save",
    "party-info",
    "rune-lister",
    "zaap-search-filter",
    "rapid-exchange",
    "chat-history",
    "show-pods",
    "keyboard-input-pad",
    // Desktop input — self-disables on touch-only hosts (see the mod's own guard)
    "shortcuts",
  ];

  function load(src, name) {
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onerror = function () {
      console.warn("[dtd] failed to load:", name);
    };
    document.head.appendChild(s);
  }

  // --- extension point for mods that are not in this repo --------------------
  //
  // mods.local.js is an optional, gitignored file the host may supply to load
  // mods kept outside this repository — development tooling, anything not meant
  // to ship publicly. It is requested only when the host opts in via
  // settings.json ("localMods": true), so a normal build never asks for a file
  // that is not there.
  //
  // It runs after the helpers and before the stock mods, so it can both add its
  // own and switch stock ones off:
  //
  //   window.__dtdMods.load("my-mod");               // a file in mods/
  //   window.__dtdMods.loadPath("local/my-mod.js");  // a file anywhere
  //   window.__dtdMod.disable("show-resources");     // turn a stock mod off
  //
  // Scripts it loads are appended after the stock mods, which is early enough
  // for anything that must run before the client: the client bundle is fetched
  // inside a remote config request (see index.html), long after these resolve.
  window.__dtdMods = {
    load: function (name) {
      load("mods/" + name + ".js", name);
    },
    loadPath: function (src, name) {
      load(src, name || src);
    },
  };

  HELPERS.forEach(function (name) {
    load("mods/helpers/" + name + ".js", name);
  });

  var wantsLocal = !!(window.__dtdSettings && window.__dtdSettings.localMods);
  if (wantsLocal) load("mods.local.js", "mods.local.js");

  MODS.forEach(function (name) {
    load("mods/" + name + ".js", name);
  });

  console.log(
    "[dtd] loading " +
      MODS.length +
      " mods, " +
      HELPERS.length +
      " helpers" +
      (wantsLocal ? ", + mods.local.js" : "")
  );
})();
