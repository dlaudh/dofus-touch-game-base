// keyboard-input-pad.js
// Port of the reference client's KeyboardInputPadMod.
// When the on-screen numeric input pad (window.gui.numberInputPad) is visible,
// routes physical keyboard digit (0-9), Backspace, and Enter keys to the pad's
// own API methods (_doDigit, _doBackspace, _doEnter), so the pad can be
// operated without touching the mouse/touchscreen.
(function () {
  "use strict";

  function init() {
    document.addEventListener("keydown", onKeyDown, true);
    console.log("[dtd] mod keyboard-input-pad active");
  }

  function onKeyDown(e) {
    try {
      var pad = window.gui && window.gui.numberInputPad;
      if (!pad || !pad.isVisible()) {
        return;
      }

      var key = e.key;

      // Digits 0-9
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        e.stopPropagation();
        pad._doDigit(parseInt(key, 10));
        return;
      }

      // Backspace
      if (key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        pad._doBackspace();
        return;
      }

      // Enter / confirm
      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        pad._doEnter();
        return;
      }
    } catch (err) {
      /* noop — guard against pad API changes */
    }
  }

  window.__dtdMod.ready({ mod: "keyboard-input-pad", need: ["gui", "isoEngine"] }, init);
})();
