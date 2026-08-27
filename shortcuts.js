// Keyboard shortcuts + mouse-wheel zoom for desktop, mirroring Lindo's
// approach (all through the client's own window.gui / window.isoEngine APIs).
// No gameplay automation — just input conveniences a mobile client lacks.
(function () {
  "use strict";
  console.log("[dtd] shortcuts.js loaded");

  // Attach the keyboard listener immediately — each handler checks window.gui
  // at press time, so it doesn't need to wait for the client to boot. (The
  // previous "poll for gui/isoEngine then setup" never completed reliably.)
  setupKeys();

  // Zoom needs the game foreground element; poll until it exists.
  var z = setInterval(function () {
    if (!(window.foreground && window.foreground.rootElement)) return;
    clearInterval(z);
    setupZoom();
    try {
      var ids = window.gui.menuBar._icons._childrenList.map(function (c) {
        return c.id;
      });
      console.log("[dtd] menu icons:", ids.join(", "));
    } catch (e) {
      /* noop */
    }
    console.log("[dtd] shortcuts + zoom active");
  }, 500);

  // Interface key -> menu-bar icon id (matched case-insensitively at runtime,
  // so it's safe if an id is absent; the logged "menu icons" list lets these
  // be tuned to the real ids).
  var IFACE = {
    c: "characteristics",
    i: "inventory",
    p: "grimoire",
    q: "quest",
    b: "bank",
    n: "social",
    g: "guild",
    h: "bestiary",
    j: "job",
    o: "map",
  };
  function openInterface(id) {
    try {
      var icon = window.gui.menuBar._icons._childrenList.filter(function (c) {
        return c.id && c.id.toLowerCase().indexOf(id) !== -1;
      })[0];
      if (icon && icon.tap) {
        icon.tap();
        return true;
      }
    } catch (e) {
      /* noop */
    }
    return false;
  }

  // --- Mouse-wheel zoom (map + world map) ----------------------------------
  function currentWorldMap() {
    try {
      var w = window.gui.windowsContainer.getChildren().find(function (c) {
        return c.id === "worldMap";
      });
      return w && w.isVisible && w.isVisible() ? w._worldMap : null;
    } catch (e) {
      return null;
    }
  }

  function setupZoom() {
    var fg = window.foreground && window.foreground.rootElement;
    if (!fg) return;
    fg.addEventListener(
      "wheel",
      function (e) {
        try {
          var factor = 1 + -e.deltaY / 600;
          var wm = currentWorldMap();
          if (wm) {
            var pz = wm._scene.camera.zoomTarget;
            wm._scene.camera.zoomTo(wm._scene.camera.zoom * factor);
            var dz = wm._scene.camera.zoomTarget / pz;
            wm._scene.move(0, 0, e.layerX * (dz - 1), e.layerY * (dz - 1), 1);
            wm._loadChunksInView && wm._loadChunksInView();
          } else {
            var ms = window.isoEngine.mapScene;
            ms.camera.zoomTo(ms.camera.zoom * factor);
          }
        } catch (err) {
          /* noop */
        }
      },
      { passive: true }
    );
  }

  // --- Keyboard shortcuts ---------------------------------------------------
  function isTyping(e) {
    var t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  function setupKeys() {
    document.addEventListener(
      "keydown",
      function (e) {
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

          // Digit 1-8: spell slot; Shift+Digit 1-8: item slot.
          var m = /^Digit([1-8])$/.exec(e.code || "");
          if (m) {
            var idx = parseInt(m[1], 10) - 1;
            var panel = e.shiftKey ? "item" : "spell";
            var slot = g.shortcutBar._panels[panel].slotList[idx];
            if (slot && slot.tap) {
              slot.tap();
              e.preventDefault();
            }
            return;
          }

          // Arrow keys: change to the neighbouring map (via the ported mover).
          var dir = { arrowup: "top", arrowdown: "bottom", arrowleft: "left", arrowright: "right" }[k];
          if (dir && window.__dtdMover) {
            window.__dtdMover.move(
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
      },
      true
    );
  }
})();
