// grip-position-save.js
// Persists and restores the drag positions of the five moveable HUD "grip"
// elements (timeline, party, notificationBar, challengeIndicator, roleplayBuffs).
// On every dragEnd the element's current top/left are written to localStorage
// under the key "dtd-grip-positions", clamped so the element cannot end up
// off-screen, and re-applied on init and on gui "resize".
// Ported from the reference client's GripPositionSaveMod (TypeScript / MobX-State-Tree).
//
// Positions are written as inline styles on the component's own rootElement —
// the same channel the client's drag handler uses. The port this was based on
// injected a per-element <style> rule with `!important`, which outranks the
// inline style the drag writes: once a saved position had been restored, the
// element visually refused to move while being dragged.
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

  // --- Geometry --------------------------------------------------------------

  /**
   * The area a grip may be placed in. Prefer the map canvas (what the player
   * actually sees the HUD over); fall back to the viewport so a missing canvas
   * degrades to "anywhere on screen" rather than to a zero-sized box.
   */
  function availableArea() {
    var canvas = document.querySelector("#mapScene-canvas");
    if (canvas) {
      var rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.left + rect.width, height: rect.top + rect.height };
      }
    }
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 0,
      height: window.innerHeight || document.documentElement.clientHeight || 0
    };
  }

  function clamp(value, max) {
    if (max <= 0) return 0; // nothing measurable yet — leave it at the origin
    if (value < 0) return 0;
    if (value > max) return max;
    return value;
  }

  // --- Applying a position ---------------------------------------------------

  function applyPosition(grip, position) {
    try {
      var gui = window.gui;
      if (!gui || !gui.isConnected) return;

      var component = gui[grip];
      var el = component && component.rootElement;
      if (!el) return;

      var area = availableArea();
      var left = clamp(position.left, area.width - el.clientWidth);
      var top = clamp(position.top, area.height - el.clientHeight);

      el.style.left = left + "px";
      el.style.top = top + "px";
    } catch (e) {
      console.warn("[dtd] grip-position-save: could not apply position for " + grip, e);
    }
  }

  // --- Grip registration -----------------------------------------------------

  function registerGrip(grip) {
    try {
      var component = window.gui[grip];
      if (!component) return;

      // Save position on drag end, then re-apply it so the clamp takes effect
      // immediately instead of only after the next reload or resize.
      component.on("dragEnd", function () {
        try {
          var el = component.rootElement;
          if (!el) return;
          var top = parseFloat(el.style.top) || 0;
          var left = parseFloat(el.style.left) || 0;
          savePosition(grip, top, left);
          applyPosition(grip, { top: top, left: left });
        } catch (e) {
          console.warn("[dtd] grip-position-save: dragEnd error for " + grip, e);
        }
      });

      // Timeline also moves when it is resized (collapsed/expanded).
      if (grip === "timeline") {
        component.on("resized", function () {
          var pos = loadPositions()[grip];
          if (pos) applyPosition(grip, pos);
        });
      }

      // Restore saved position immediately if one exists.
      var saved = loadPositions()[grip];
      if (saved) applyPosition(grip, saved);
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
      // Drop the stylesheets the previous implementation left in the document,
      // otherwise their !important rules keep overriding the inline styles.
      GRIP_ELEMENTS.forEach(function (grip) {
        var stale = document.getElementById(grip + "stylesheet");
        if (stale && stale.parentElement) stale.parentElement.removeChild(stale);
      });

      GRIP_ELEMENTS.forEach(registerGrip);
      window.gui.on("resize", onResize);
      console.log("[dtd] mod grip-position-save active");
    } catch (e) {
      console.error("[dtd] grip-position-save: init error", e);
    }
  }

  // applyPosition needs a connected gui, not merely a constructed one.
  window.__dtdMod.ready(
    {
      mod: "grip-position-save",
      need: ["gui", "isoEngine"],
      until: function () { return window.gui.isConnected; },
      untilLabel: "gui.isConnected"
    },
    init
  );
})();
