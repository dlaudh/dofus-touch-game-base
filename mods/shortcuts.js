// shortcuts.js
// Keyboard shortcuts + mouse-wheel zoom for desktop, mirroring the reference
// client's approach (all through the client's own window.gui / window.isoEngine APIs).
// No gameplay automation — just input conveniences a mobile client lacks.
// Depends on the map-mover helper (window.__dtdMapMover) for arrow-key map changes.
(function () {
  "use strict";

  // Desktop input only. On a touch host (the Android build) there is no
  // physical keyboard and no wheel, so these bindings have nothing to bind to
  // and would only compete with the client's own native mobile input. Bail
  // instead of relying on the host to exclude this file from its bundle.
  if (!window.__dtdMod.isDesktopInput()) {
    console.log("[dtd] mod shortcuts skipped (no desktop input)");
    return;
  }

  // No globals to wait for: both handlers check window.gui / window.isoEngine at
  // event time, so they attach immediately. (A previous "poll then setup"
  // approach never completed reliably.) Going through ready() anyway is what
  // puts the mod in the registry a settings UI reads.
  window.__dtdMod.ready({ mod: "shortcuts", need: [] }, function () {
    var detachKeys = setupKeys();
    var detachZoom = setupZoom();
    console.log("[dtd] mod shortcuts active");

    // Returning a teardown makes this mod switchable without a reload.
    return function () {
      detachKeys();
      detachZoom();
      console.log("[dtd] mod shortcuts stopped");
    };
  });

  // Interface key -> menu-bar icon CSS class (the icons carry classes like
  // "menuIconBag", "menuIconSpell", ...). Matched against each icon's
  // rootElement className at runtime; safe if absent.
  var IFACE = {
    c: "menuiconcarac", // characteristics
    s: "menuiconspell", // spells
    i: "menuiconbag", // inventory
    b: "menuiconbook", // grimoire / quests book
    q: "menuicondailyquest", // daily quests
    f: "menuiconfriend", // friends / social
    j: "menuiconjob", // jobs
    g: "menuiconguild", // guild
    h: "menuiconbestiary", // bestiary
    m: "menuiconmap", // world map
  };
  function openInterface(cls) {
    try {
      var icons = window.gui.menuBar._icons._childrenList;
      for (var i = 0; i < icons.length; i++) {
        var el = icons[i].rootElement;
        if (el && (el.className || "").toLowerCase().indexOf(cls) !== -1 && icons[i].tap) {
          icons[i].tap();
          return true;
        }
      }
    } catch (e) {
      /* noop */
    }
    return false;
  }

  // --- Mouse-wheel zoom (map + world map) ----------------------------------
  // The wheel only zooms when the pointer is actually over the map (or over the
  // world map when it is open). Over any client UI — chat, inventory, a window
  // list — the wheel is left alone so the panel can scroll itself.
  function currentWorldMap() {
    try {
      var w = window.__dtdMod.findWindow("worldMap");
      if (!w || !w.isVisible || !w.isVisible()) return null;
      return { map: w._worldMap, root: w.rootElement };
    } catch (e) {
      return null;
    }
  }

  function inside(root, node) {
    return !!root && !!node && (root === node || root.contains(node));
  }

  // True when the wheel landed on the isometric map: the map canvas itself, the
  // transparent overlay layer the client (and our mods) draw on top of it, or
  // the bare page backdrop — but never on a client UI element.
  var BACKDROP_IDS = { dofusBody: 1, resizableBody: 1, foreground: 1 };
  function overMap(target) {
    if (!target || target.nodeType !== 1) return false;
    var scene = window.isoEngine.mapScene;
    if (inside(scene && scene.canvas, target)) return true;
    // Foreground overlays (health bars, damage estimator) are pointer-events:none,
    // so a hit inside the foreground root means empty map space.
    if (inside(window.foreground && window.foreground.rootElement, target)) return true;
    return (
      target === document.body ||
      target === document.documentElement ||
      BACKDROP_IDS[target.id] === 1
    );
  }

  function setupZoom() {
    // Attach to the document (capture) so it works regardless of when the game
    // foreground element appears; guard the client globals at wheel time.
    var onWheel = function (e) {
        if (!window.isoEngine || !window.gui) return;
        try {
          var factor = 1 + -e.deltaY / 600;
          var wmw = currentWorldMap();
          if (wmw && wmw.map) {
            var wm = wmw.map;
            var canvas = wm._scene && wm._scene.canvas;
            // Zoom only over the world map's own canvas (or, if it exposes
            // none, anywhere inside the world-map window).
            if (!inside(canvas || wmw.root, e.target)) return;
            var rect = (canvas || wmw.root).getBoundingClientRect();
            var px = e.clientX - rect.left;
            var py = e.clientY - rect.top;
            var pz = wm._scene.camera.zoomTarget;
            wm._scene.camera.zoomTo(wm._scene.camera.zoom * factor);
            var dz = wm._scene.camera.zoomTarget / pz;
            wm._scene.move(0, 0, px * (dz - 1), py * (dz - 1), 1);
            wm._loadChunksInView && wm._loadChunksInView();
          } else if (window.isoEngine.mapScene && overMap(e.target)) {
            window.isoEngine.mapScene.camera.zoomTo(window.isoEngine.mapScene.camera.zoom * factor);
          }
        } catch (err) {
          /* noop */
        }
    };
    var options = { passive: true, capture: true };
    document.addEventListener("wheel", onWheel, options);
    return function () {
      document.removeEventListener("wheel", onWheel, options);
    };
  }

  // --- Keyboard shortcuts ---------------------------------------------------
  function isTyping(e) {
    var t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  function setupKeys() {
    var onKeyDown = function (e) {
        if (isTyping(e) || !window.gui || !window.isoEngine) return;
        var g = window.gui;
        var k = (e.key || "").toLowerCase();
        try {
          // Escape: close the active chat, else the top-most open window.
          if (k === "escape") {
            if (g.chat && g.chat.active) {
              g.chat.deactivate();
              return;
            }
            var list = g.windowsContainer._childrenList;
            for (var i = list.length - 1; i >= 0; i--) {
              if (list[i].isVisible() && list[i].id !== "recaptcha") {
                list[i].close();
                return;
              }
            }
            return;
          }

          // Space: ready / end turn in fight.
          if (k === " " || k === "spacebar") {
            if (g.fightManager.fightState === 0) {
              g.timeline.fightControlButtons.toggleReadyForFight();
            } else if (g.fightManager.fightState === 1) {
              g.fightManager.finishTurn();
            }
            e.preventDefault();
            return;
          }

          // Enter: open/activate chat.
          if (k === "enter") {
            if (!g.numberInputPad || !g.numberInputPad.isVisible()) {
              g.chat.activate();
              e.preventDefault();
            }
            return;
          }

          // Digit 1-8: spell slot; Shift+Digit 1-8: item slot. Skipped while the
          // on-screen number pad is open — there the digits are typed input
          // (see mods/keyboard-input-pad.js), not spell shortcuts.
          var m = /^Digit([1-8])$/.exec(e.code || "");
          if (m && !(g.numberInputPad && g.numberInputPad.isVisible())) {
            var idx = parseInt(m[1], 10) - 1;
            var panel = e.shiftKey ? "item" : "spell";
            var slot = g.shortcutBar._panels[panel].slotList[idx];
            if (slot && slot.tap) {
              slot.tap();
              e.preventDefault();
            }
            return;
          }

          // Arrow keys: change to the neighbouring map (via the map-mover helper).
          var dir = { arrowup: "top", arrowdown: "bottom", arrowleft: "left", arrowright: "right" }[k];
          if (dir && window.__dtdMapMover) {
            window.__dtdMapMover.move(
              dir,
              function () {},
              function () {}
            );
            e.preventDefault();
            return;
          }

          // Interface toggles (inventory, spells, characteristics, map, ...).
          if (IFACE[k] && openInterface(IFACE[k])) {
            e.preventDefault();
            return;
          }
        } catch (err) {
          /* noop */
        }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return function () {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }
})();
