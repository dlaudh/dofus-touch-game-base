// Runtime fixes applied AFTER the client bundle loads (see index.html initDofus).
// No gameplay modifications — only what the desktop environment needs.
(function () {
  "use strict";

  // --- Mouse -> touch translation ------------------------------------------
  // The Dofus Touch client is a TOUCH client: it binds touchstart/touchend/
  // touchmove and ignores mouse events. On desktop there are no touch events,
  // so the game looks frozen / unresponsive to clicks and drags. Synthesize
  // TouchEvents from mouse input, exactly the shim Lindo uses.
  //
  // Requires constructable Touch + TouchEvent (Chromium: yes; some WebKit
  // builds: no). Feature-detect and warn if unsupported so we can pick another
  // path on that platform rather than silently doing nothing.
  var touchSupported = false;
  try {
    // eslint-disable-next-line no-new
    new TouchEvent("touchstart", { touches: [new Touch({ identifier: 0, target: document })] });
    touchSupported = true;
  } catch (e) {
    console.warn("[dtd] TouchEvent constructor unsupported on this WebView; mouse->touch shim disabled", e);
  }

  if (touchSupported) {
    var MAP = { mousedown: "touchstart", mouseup: "touchend", mousemove: "touchmove" };
    var down = false;

    var handle = function (e) {
      try {
        if (e.type === "mousedown") down = true;
        else if (e.type === "mouseup") down = false;
        // Only forward moves while a button is held (drag), like a finger.
        if (!down && e.type === "mousemove") return;

        var touch = new Touch({
          identifier: 0,
          target: e.target,
          clientX: e.clientX,
          clientY: e.clientY,
          pageX: e.pageX,
          pageY: e.pageY,
          screenX: e.screenX,
          screenY: e.screenY,
          radiusX: 11.5,
          radiusY: 11.5,
          rotationAngle: 0,
          force: e.type === "mouseup" ? 0 : 1,
        });

        var ended = e.type === "mouseup";
        var touchEvent = new TouchEvent(MAP[e.type], {
          cancelable: true,
          bubbles: true,
          composed: true,
          touches: ended ? [] : [touch],
          targetTouches: ended ? [] : [touch],
          changedTouches: [touch],
          view: window,
        });
        e.target.dispatchEvent(touchEvent);
      } catch (err) {
        console.warn("[dtd] touch shim error", err);
      }
      e.stopPropagation();
      return false;
    };

    var attach = function () {
      if (!document.body) {
        setTimeout(attach, 200);
        return;
      }
      for (var type in MAP) {
        document.body.addEventListener(type, handle, true);
      }
      console.log("[dtd] mouse->touch shim active");
    };
    attach();
  }
})();
