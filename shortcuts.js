// Keyboard shortcuts + mouse-wheel zoom for desktop, mirroring Lindo's
// approach (all through the client's own window.gui / window.isoEngine APIs).
// No gameplay automation — just input conveniences a mobile client lacks.
(function () {
  "use strict";

  var boot = setInterval(function () {
    if (!window.gui || !window.isoEngine) return;
    clearInterval(boot);
    setupZoom();
    setupKeys();
    console.log("[dtd] shortcuts + zoom active");
  }, 500);

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
        if (isTyping(e)) return;
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

          // Number keys 1-8: cast the matching spell slot (out of / in fight).
          if (k >= "1" && k <= "8") {
            var slot = g.shortcutBar._panels.spell.slotList[parseInt(k, 10) - 1];
            if (slot && slot.tap) {
              slot.tap();
              e.preventDefault();
            }
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
