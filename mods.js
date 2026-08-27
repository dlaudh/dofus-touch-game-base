// Loads the QoL mods from game-base/mods/*.js. Each mod is a self-contained
// IIFE that waits for the client (window.gui/isoEngine) and hooks it. Add new
// mods to the list below as they are ported from the reference client.
(function () {
  "use strict";
  var MODS = [
    // Combat
    "damage-estimator",
    "fight-chronometer",
    "challenge-percent",
    "vertical-timeline",
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
  ];
  MODS.forEach(function (name) {
    var s = document.createElement("script");
    s.src = "mods/" + name + ".js";
    s.async = false;
    s.onerror = function () {
      console.warn("[dtd] mod failed to load:", name);
    };
    document.head.appendChild(s);
  });
  console.log("[dtd] loading " + MODS.length + " mods");
})();
