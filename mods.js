// Loads the QoL mods from game-base/mods/*.js. Each mod is a self-contained
// IIFE that waits for the client (window.gui/isoEngine) and hooks it. Add new
// mods to the list below as they are ported from the reference client.
(function () {
  "use strict";

  // Shared helpers from mods/helpers/. Loaded before the mods, because the
  // scripts are appended with async=false and so execute in list order.
  var HELPERS = [
    "mod-api", // window.__dtdMod — readiness, client lookups, platform check
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

  HELPERS.forEach(function (name) {
    load("mods/helpers/" + name + ".js", name);
  });
  MODS.forEach(function (name) {
    load("mods/" + name + ".js", name);
  });
  console.log(
    "[dtd] loading " + MODS.length + " mods, " + HELPERS.length + " helpers",
  );
})();
