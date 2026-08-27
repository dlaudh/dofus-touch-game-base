// Runtime fixes applied AFTER the client bundle loads (see index.html initDofus).
// No gameplay modifications — only what the desktop environment needs.
(function () {
  "use strict";

  // --- FPS counter overlay -------------------------------------------------
  // Measures the browser's paint rate (requestAnimationFrame), which is
  // vsync-locked to the monitor — so it reads the real on-screen framerate.
  // Toggle via window.__dtdSettings.showFps.
  if (!window.__dtdSettings || window.__dtdSettings.showFps !== false) {
    (function fpsCounter() {
      var clock = window.performance || Date;
      var el = null,
        frames = 0,
        last = clock.now();
      function tick() {
        frames++;
        var now = clock.now();
        if (now - last >= 500) {
          var fps = Math.round((frames * 1000) / (now - last));
          frames = 0;
          last = now;
          if (!el && document.body) {
            el = document.createElement("div");
            el.id = "dtd-fps";
            el.style.cssText =
              "position:fixed;top:4px;left:4px;z-index:2147483647;background:rgba(0,0,0,.6);" +
              "color:#0f0;font:12px/1.4 monospace;padding:2px 6px;border-radius:3px;pointer-events:none";
            document.body.appendChild(el);
          }
          if (el) el.textContent = "FPS: " + fps;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })();
  }

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

  // --- Native notifications from game events (read-only) -------------------
  // PROVISIONAL event names — confirm against the live client and adjust.
  function fireNotify(kind, detail) {
    if (window.__dtd && window.__dtd.notify) window.__dtd.notify(kind, detail);
  }
  var notifyTimer = setInterval(function () {
    if (!window.dofus && !window.gui) return;
    clearInterval(notifyTimer);
    try {
      var bus = window.gui || window.dofus;
      if (bus && bus.on) {
        bus.on("GameFightTurnStartMessage", function () { fireNotify("turn", "Your turn"); });
        bus.on("ChatServerMessage", function (m) { fireNotify("pm", (m && m.senderName) || "message"); });
      }
    } catch (e) {
      console.warn("[dtd] notify hook failed", e);
    }
  }, 1000);

  // --- Window resize -> re-layout the client (mirrors Lindo) ---------------
  // The client only recomputes its UI on its own internal resize path, so on
  // desktop it looks broken after a window resize. Drive gui._resizeUi() from
  // the window resize event (debounced), and bump the isometric map camera's
  // maxZoom so the map fills a taller desktop canvas.
  var backupMaxZoom = null;
  function resizeGameUi() {
    try {
      if (window.gui && window.gui._resizeUi) window.gui._resizeUi();
    } catch (e) {
      console.warn("[dtd] _resizeUi failed", e);
    }
    try {
      var iso = window.isoEngine;
      if (iso && iso.mapScene && iso.mapScene.camera && iso.mapScene.canvas) {
        if (backupMaxZoom === null) backupMaxZoom = iso.mapScene.camera.maxZoom;
        iso.mapScene.camera.maxZoom = Math.max(
          backupMaxZoom,
          backupMaxZoom + (iso.mapScene.canvas.height / 800 - 1)
        );
      }
    } catch (e) {}
  }
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    // Call _resizeUi several times after the resize settles. Maximize/animated
    // resizes report their final innerWidth/innerHeight late, so a single
    // debounced call catches an intermediate size and leaves black bars.
    resizeTimer = setTimeout(function () {
      resizeGameUi();
      setTimeout(resizeGameUi, 250);
      setTimeout(resizeGameUi, 600);
      setTimeout(resizeGameUi, 1000);
    }, 80);
  });
  // Fix the initial layout once the client's UI exists. Call it several times
  // over the first few seconds: a single early call often doesn't "stick"
  // while the client is still building its UI (which is why the landscape
  // layout looked lost).
  var resizeCount = 0;
  var nudged = false;
  var resizeBoot = setInterval(function () {
    if (window.gui && window.gui._resizeUi) {
      resizeGameUi();
      // Once, after the client has had a moment to build the map, ask main to
      // nudge the window size — the only thing that reliably fits the map
      // (removes the side black bars) and enables zoom on desktop.
      if (!nudged) {
        nudged = true;
        setTimeout(function () {
          if (window.__dtd && window.__dtd.nudgeResize) window.__dtd.nudgeResize();
        }, 1500);
      }
      if (++resizeCount >= 8) clearInterval(resizeBoot);
    }
  }, 500);

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
