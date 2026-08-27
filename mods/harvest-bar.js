// harvest-bar.js
// Shows a progress bar + countdown timer floating above a resource cell while
// the player is harvesting it (gathering profession animations). Listens to
// StatedElementUpdatedMessage to map element IDs to cell coordinates, then
// InteractiveUsedMessage to start the bar, and InteractiveUseEndedMessage to
// remove it. Ported from Lindo's HarvestBarMod / HarvestBar (TypeScript) to a
// plain JS IIFE for the dofus-touch-emu Electron wrapper.
(function () {
  "use strict";

  var POLL_INTERVAL = 200; // ms between ready-checks
  var UPDATE_INTERVAL = 200; // ms between bar-width updates

  var pollTimer = setInterval(function () {
    if (
      typeof window.gui === "undefined" ||
      typeof window.isoEngine === "undefined" ||
      typeof window.dofus === "undefined"
    ) {
      return;
    }
    clearInterval(pollTimer);
    try {
      init();
    } catch (e) {
      console.error("[dtd] harvest-bar init error", e);
    }
  }, POLL_INTERVAL);

  // -------------------------------------------------------------------------
  // HarvestBar — the DOM widget that tracks one harvest action
  // -------------------------------------------------------------------------
  function HarvestBar() {
    this.container = null;
    this.barEl = null;
    this.timeEl = null;
    this.updateTimer = null;
    this.interval = UPDATE_INTERVAL;
    this.cellId = 0;
    this.duration = 0;
    this.remainingTime = 0;
  }

  HarvestBar.prototype._createContainer = function () {
    this.container = document.createElement("div");
    this.container.id = "harvestBarContainer";
    this.container.className = "harvestBarContainer";
    window.foreground.rootElement.appendChild(this.container);
  };

  HarvestBar.prototype._createBar = function () {
    this._createContainer();

    try {
      var scenePos = window.isoEngine.mapRenderer.getCellSceneCoordinate(this.cellId);
      var pos = window.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);

      /* progress bar */
      this.barEl = document.createElement("div");
      this.barEl.id = "harvestBar";
      this.barEl.className = "harvestBar";
      this.container.appendChild(this.barEl);

      this.container.style.left = (pos.x - this.container.offsetWidth / 2) + "px";
      this.container.style.top = pos.y + "px";

      /* time label */
      this.timeEl = document.createElement("div");
      this.timeEl.id = "harvestTime";
      this.timeEl.className = "harvestTimeText";
      window.foreground.rootElement.appendChild(this.timeEl);

      this.timeEl.style.left = (pos.x - this.container.offsetWidth / 2) + "px";
      this.timeEl.style.top = pos.y + "px";
    } catch (e) {
      console.error("[dtd] harvest-bar _createBar error", e);
    }

    this._update();
  };

  HarvestBar.prototype._update = function () {
    if (!this.barEl || !this.timeEl) return;
    var pct = (this.remainingTime / this.duration) * 100;
    this.barEl.style.width = (pct > 0 ? pct : 0) + "%";
    this.timeEl.innerHTML = (this.remainingTime > 0 ? (this.remainingTime / 1000).toFixed(1) : "0") + "s";
  };

  HarvestBar.prototype._show = function () {
    this._createBar();
    if (this.container) this.container.style.visibility = "visible";

    var self = this;
    this.updateTimer = setInterval(function () {
      self.remainingTime -= self.interval;
      self._update();
    }, this.interval);
  };

  HarvestBar.prototype.harvestStarted = function (cellId, duration) {
    this.cellId = cellId;
    this.duration = duration * 100;
    this.remainingTime = duration * 100;
    this._show();
  };

  HarvestBar.prototype.destroy = function () {
    clearInterval(this.updateTimer);
    this.updateTimer = null;
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    if (this.timeEl && this.timeEl.parentElement) {
      this.timeEl.parentElement.removeChild(this.timeEl);
    }
    this.container = null;
    this.barEl = null;
    this.timeEl = null;
  };

  // -------------------------------------------------------------------------
  // init — wires event listeners to the connection manager
  // -------------------------------------------------------------------------
  function init() {
    /* inject CSS */
    var style = document.createElement("style");
    style.id = "harvestCss";
    style.innerHTML = [
      ".harvestBarContainer {",
      "  box-sizing: border-box;",
      "  border: 1px gray solid;",
      "  background-color: #222;",
      "  height: 6px;",
      "  width: 80px;",
      "  position: absolute;",
      "  border-radius: 3px;",
      "  overflow: hidden;",
      "  transition-duration: 500ms;",
      "  margin-top: 10px;",
      "}",
      ".harvestBar {",
      "  transition-duration: 300ms;",
      "  height: 100%;",
      "  width: 100%;",
      "  background-color: orange;",
      "}",
      ".harvestTimeText {",
      "  font-size: 11px;",
      "  font-weight: bold;",
      "  text-align: center;",
      "  position: absolute;",
      "  width: 80px;",
      "  color: white;",
      "  text-shadow: 0 0 5px rgba(0, 0, 0, 0.9);",
      "  transition-duration: 500ms;",
      "  margin-top: 4px;",
      "}",
    ].join("\n");
    document.head.appendChild(style);

    var cm = window.dofus.connectionManager;
    var harvestBar = new HarvestBar();

    // Map element IDs -> cell IDs as the server reports map state
    var statedElements = new Map();

    // StatedElementUpdatedMessage: keep a running map of elementId -> cellId
    cm.on("StatedElementUpdatedMessage", function (e) {
      try {
        statedElements.set(e.statedElement.elementId, e.statedElement.elementCellId);
      } catch (ex) {
        console.error("[dtd] harvest-bar StatedElementUpdatedMessage", ex);
      }
    });

    // InteractiveUsedMessage: start bar when the local player begins harvesting
    cm.on("InteractiveUsedMessage", function (e) {
      try {
        if (
          statedElements.has(e.elemId) &&
          e.entityId === window.isoEngine.actorManager.userId
        ) {
          harvestBar.harvestStarted(statedElements.get(e.elemId), e.duration);
          statedElements.clear();
        }
      } catch (ex) {
        console.error("[dtd] harvest-bar InteractiveUsedMessage", ex);
      }
    });

    // InteractiveUseEndedMessage: remove bar when harvest finishes/is cancelled
    cm.on("InteractiveUseEndedMessage", function () {
      try {
        harvestBar.destroy();
        harvestBar = new HarvestBar();
      } catch (ex) {
        console.error("[dtd] harvest-bar InteractiveUseEndedMessage", ex);
      }
    });

    console.log("[dtd] mod harvest-bar active");
  }
})();
