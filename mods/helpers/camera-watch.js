// camera-watch.js
// Shared helper for the overlays that pin themselves to a map cell (health-bar,
// harvest-bar, damage-estimator).
//
// Those mods convert a cellId to canvas coordinates once and write the result to
// a div's top/left. The conversion depends on the map camera, so any zoom or pan
// leaves the overlay stranded until some unrelated game event happens to trigger
// a redraw. The client exposes no camera event, so this watches the camera's
// own fields and notifies subscribers when they actually change.
//
// Exposes: window.__dtdCameraWatch = { subscribe(fn) -> unsubscribe }
// The callback takes no arguments — it just means "the view moved, reposition".
//
// Polling only runs while at least one subscriber is registered, and a tick that
// sees an unchanged camera does nothing beyond reading four numbers.
(function () {
  "use strict";

  var POLL_INTERVAL = 60; // ms — well under one frame of visible drift at 60fps

  var subscribers = [];
  var timer = null;
  var lastSignature = null;

  // The camera fields differ slightly between the map scene and the world map;
  // read defensively and fold whatever exists into one comparable string.
  function cameraSignature() {
    try {
      var scene = window.isoEngine && window.isoEngine.mapScene;
      if (!scene) return null;
      var camera = scene.camera;
      if (!camera) return null;
      var canvas = scene.canvas;
      return [
        camera.zoom,
        camera.x,
        camera.y,
        canvas ? canvas.width : 0,
        canvas ? canvas.height : 0
      ].join("|");
    } catch (e) {
      return null;
    }
  }

  function tick() {
    var signature = cameraSignature();
    if (signature === null || signature === lastSignature) return;
    lastSignature = signature;
    // Iterate a copy: a callback is allowed to unsubscribe itself.
    var current = subscribers.slice();
    for (var i = 0; i < current.length; i++) {
      try {
        current[i]();
      } catch (e) {
        console.warn("[dtd] camera-watch: subscriber threw", e);
      }
    }
  }

  function start() {
    if (timer !== null) return;
    // Seed the signature so the first tick after subscribing doesn't fire a
    // spurious reposition for a camera that never moved.
    lastSignature = cameraSignature();
    timer = setInterval(tick, POLL_INTERVAL);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    lastSignature = null;
  }

  window.__dtdCameraWatch = {
    /**
     * Call fn whenever the map camera moves. Returns a function that removes
     * the subscription (and stops the poll once nobody is left listening).
     */
    subscribe: function (fn) {
      if (typeof fn !== "function") return function () {};
      subscribers.push(fn);
      start();
      var removed = false;
      return function () {
        if (removed) return;
        removed = true;
        var i = subscribers.indexOf(fn);
        if (i !== -1) subscribers.splice(i, 1);
        if (subscribers.length === 0) stop();
      };
    }
  };

  console.log("[dtd] helper camera-watch active");
})();
