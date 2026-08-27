// grip-position-save.js
// Persists and restores the drag positions of the five moveable HUD "grip"
// elements (timeline, party, notificationBar, challengeIndicator, roleplayBuffs).
// On every dragEnd the element's current top/left are written to localStorage
// under the key "dtd-grip-positions".  On init (and on gui "resize") each saved
// position is re-applied via a per-element <style> injected into the game
// document's <head>, clamped so the element cannot be dragged off-screen.
// Ported from Lindo's GripPositionSaveMod (TypeScript / MobX-State-Tree).
(function () {
  "use strict";

  var STORAGE_KEY = "dtd-grip-positions";

  // The five draggable HUD components exposed on window.gui.
  var GRIP_ELEMENTS = ["timeline", "party", "notificationBar", "challengeIndicator", "roleplayBuffs"];

  // --- Persistence helpers ---------------------------------------------------

  function loadPositions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function savePosition(grip, top, left) {
    try {
      var all = loadPositions();
      all[grip] = { top: top, left: left };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn("[dtd] grip-position-save: could not save position", e);
    }
  }

  // --- CSS injection ---------------------------------------------------------

  function applyPosition(grip, position) {
    try {
      var doc = window.document;
      var gui = window.gui;

      if (!gui || !gui.isConnected) return;

      var mapCanvas = doc.querySelector("#mapScene-canvas");
      if (!mapCanvas) return;

      var availableWidth = parseFloat(mapCanvas.style.width) || 0;
      var availableHeight = parseFloat(mapCanvas.style.height) || 0;
      if (mapCanvas.offsetLeft) {
        availableWidth += mapCanvas.offsetLeft;
      }

      // CSS class for the grip element uses title-cased name (e.g. ".Timeline")
      var cssClass = "." + grip.charAt(0).toUpperCase() + grip.slice(1);
      var el = doc.querySelector(cssClass);
      var targetWidth = el ? el.clientWidth : 0;
      var targetHeight = el ? el.clientHeight : 0;

      // Clamp so the element stays on-screen.
      var left = position.left < availableWidth - targetWidth ? position.left : availableWidth - targetWidth;
      var top = position.top < availableHeight - targetHeight ? position.top : availableHeight - targetHeight;

      // Remove any previous stylesheet for this grip.
      var existing = doc.querySelector("#" + grip + "stylesheet");
      if (existing) existing.remove();

      var stylesheet = doc.createElement("style");
      stylesheet.id = grip + "stylesheet";
      stylesheet.innerHTML =
        cssClass + "{" +
        "top:" + top + "px !important;" +
        "left:" + left + "px !important;" +
        "}";
      doc.head.appendChild(stylesheet);
    } catch (e) {
      console.warn("[dtd] grip-position-save: could not apply position for " + grip, e);
    }
  }

  // --- Grip registration -----------------------------------------------------

  function registerGrip(grip) {
    try {
      var guiElement = window.gui[grip];
      if (!guiElement) return;

      // Save position on drag end.
      guiElement.on("dragEnd", function () {
        try {
          var rootEl = guiElement.rootElement;
          var top = parseFloat(rootEl.style.top) || 0;
          var left = parseFloat(rootEl.style.left) || 0;
          savePosition(grip, top, left);
        } catch (e) {
          console.warn("[dtd] grip-position-save: dragEnd error for " + grip, e);
        }
      });

      // Timeline also moves when it is resized (collapsed/expanded).
      if (grip === "timeline") {
        guiElement.on("resized", function () {
          var pos = loadPositions()[grip];
          if (pos) applyPosition(grip, pos);
        });
      }

      // Restore saved position immediately if one exists.
      var saved = loadPositions()[grip];
      if (saved) {
        applyPosition(grip, saved);
      }
    } catch (e) {
      console.warn("[dtd] grip-position-save: could not register grip " + grip, e);
    }
  }

  // --- Resize handler --------------------------------------------------------

  function onResize() {
    var positions = loadPositions();
    GRIP_ELEMENTS.forEach(function (grip) {
      var pos = positions[grip];
      if (pos) applyPosition(grip, pos);
    });
  }

  // --- Init ------------------------------------------------------------------

  function init() {
    try {
      GRIP_ELEMENTS.forEach(registerGrip);
      window.gui.on("resize", onResize);
      console.log("[dtd] mod grip-position-save active");
    } catch (e) {
      console.error("[dtd] grip-position-save: init error", e);
    }
  }

  // Poll until window.gui and window.isoEngine are ready, then init once.
  var poll = setInterval(function () {
    try {
      if (window.gui && window.isoEngine && window.gui.isConnected) {
        clearInterval(poll);
        init();
      }
    } catch (e) {
      // not ready yet — keep polling
    }
  }, 300);
})();
