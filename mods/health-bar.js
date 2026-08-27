// health-bar.js
// Faithful port of the reference client's health-bar mod (packages/renderer/src/mods/health-bar/).
// Merges bar.ts + health-bar.ts into a single self-contained IIFE.
// Displays HP/shield bars and numeric HP text above each fighter during combat,
// positioned using the game's own isoEngine coordinate APIs.
// No external dependencies — uses only client globals (window.gui, window.isoEngine,
// window.dofus, window.foreground, document).
(function () {
  "use strict";

  // Poll until the client globals we need are ready, then initialise.
  var POLL_INTERVAL = 300;
  var MAX_ATTEMPTS = 300; // ~90 s
  var attempts = 0;

  function isReady() {
    return (
      window.gui &&
      window.isoEngine &&
      window.dofus &&
      window.foreground
    );
  }

  function poll() {
    if (isReady()) {
      init();
    } else {
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL);
      } else {
        console.warn("[dtd] health-bar: timed out waiting for client globals");
      }
    }
  }

  poll();

  // ---------------------------------------------------------------------------
  // Bar — one health-bar + text node for a single fighter
  // ---------------------------------------------------------------------------

  function Bar(fighter) {
    this.fighter = fighter;
    this.lifeBarContainer = null;
    this.lifeBar = null;
    this.lifePointsText = null;
    this._create();
  }

  Bar.prototype._create = function () {
    var container = document.createElement("div");
    container.id = "fighterLifeBarContainer" + this.fighter.id;
    container.className = "lifeBarContainer";

    var bar = document.createElement("div");
    bar.id = "fighterLifeBar" + this.fighter.id;
    bar.className = "lifeBar";
    container.appendChild(bar);

    var text = document.createElement("div");
    text.id = "fighterLifePoints" + this.fighter.id;
    text.className = "lifePointsText";

    var lifeBarsEl = document.getElementById("lifeBars");
    if (lifeBarsEl) {
      lifeBarsEl.appendChild(container);
      lifeBarsEl.appendChild(text);
    }

    this.lifeBarContainer = container;
    this.lifeBar = bar;
    this.lifePointsText = text;
  };

  Bar.prototype.update = function () {
    var fighter;
    try {
      fighter = window.gui.fightManager.getFighter(this.fighter.id);
    } catch (e) {
      return;
    }

    if (!window.gui.fightManager.isInBattle()) return;
    if (!fighter || !fighter.data.alive) return;

    if (!this.lifeBar || !this.lifeBarContainer || !this.lifePointsText) {
      this._create();
    }

    var stats = fighter.data.stats;
    var lifePoints = stats.lifePoints;
    var maxLife = stats.maxLifePoints;
    var shield = stats.shieldPoints;
    var total = maxLife + shield;

    var lifePercent = total > 0 ? (lifePoints * 100) / total : 0;
    var shieldPercent = total > 0 ? lifePercent + (shield * 100) / total : 0;
    var teamColor = this.fighter.data.teamId === 0 ? "red" : "#3ad";

    this.lifeBar.style.background =
      "linear-gradient(to right, " +
      teamColor + " 0%, " +
      teamColor + " " + lifePercent + "%, " +
      "#944ae0 " + lifePercent + "%, " +
      "#944ae0 " + shieldPercent + "%, " +
      "#222 " + shieldPercent + "%, " +
      "#222 100%)";

    this.lifePointsText.innerHTML = String(lifePoints + shield);

    var invisible = fighter.buffs && fighter.buffs.some(function (b) {
      return b.effect && b.effect.effectId === 150;
    });

    var cellId = fighter.data.disposition && fighter.data.disposition.cellId;

    if (cellId && (!invisible || window.gui.fightManager.isFighterOnUsersTeam(fighter.id))) {
      try {
        var scenePos = window.isoEngine.mapRenderer.getCellSceneCoordinate(cellId);
        var pos = window.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);
        var halfW = this.lifeBarContainer.offsetWidth / 2;
        this.lifeBarContainer.style.left = (pos.x - halfW) + "px";
        this.lifeBarContainer.style.top = pos.y + "px";
        this.lifePointsText.style.left = (pos.x - halfW) + "px";
        this.lifePointsText.style.top = pos.y + "px";
      } catch (e) {
        console.error("[dtd] health-bar: position error for cellId", cellId, e);
      }
    } else if (invisible) {
      this.lifeBarContainer.style.opacity = "0.5";
      this.lifePointsText.style.opacity = "0.5";
    }
  };

  Bar.prototype.destroy = function () {
    try {
      if (this.lifePointsText && this.lifePointsText.parentElement) {
        this.lifePointsText.parentElement.removeChild(this.lifePointsText);
      }
    } catch (e) { /* noop */ }
    try {
      if (this.lifeBarContainer && this.lifeBarContainer.parentElement) {
        this.lifeBarContainer.parentElement.removeChild(this.lifeBarContainer);
      }
    } catch (e) { /* noop */ }
    this.lifeBarContainer = null;
    this.lifeBar = null;
    this.lifePointsText = null;
  };

  // ---------------------------------------------------------------------------
  // HealthBarMod — orchestrates bars, events, and DOM setup
  // ---------------------------------------------------------------------------

  function HealthBarMod() {
    this.bars = {};      // { [fighterId]: Bar }
    this.rendered = true;
    this._listeners = []; // [{ emitter, event, fn }] for cleanup
  }

  HealthBarMod.prototype._on = function (emitter, event, fn) {
    try {
      emitter.on(event, fn);
      this._listeners.push({ emitter: emitter, event: event, fn: fn });
    } catch (e) {
      console.warn("[dtd] health-bar: could not attach listener for", event, e);
    }
  };

  HealthBarMod.prototype._appendStyle = function () {
    if (document.getElementById("healthBarCss")) return; // already injected
    var style = document.createElement("style");
    style.id = "healthBarCss";
    style.innerHTML = [
      ".lifeBarContainer {",
      "  box-sizing: border-box;",
      "  background-color: #222;",
      "  height: 6px;",
      "  width: 80px;",
      "  position: absolute;",
      "  border-radius: 3px;",
      "  overflow: hidden;",
      "  margin-top: 10px;",
      "  transition-property: top, left;",
      "  transition-duration: 300ms;",
      "}",
      ".lifeBar {",
      "  height: 100%;",
      "  width: 100%;",
      "  background-color: #333;",
      "}",
      ".lifePointsText {",
      "  font-size: 12px;",
      "  position: absolute;",
      "  width: 80px;",
      "  color: white;",
      "  text-shadow: 0 0 5px rgba(0,0,0,0.9);",
      "  margin-top: 14px;",
      "  margin-left: 2px;",
      "  transition-property: top, left;",
      "  transition-duration: 300ms;",
      "}"
    ].join("\n");
    document.getElementsByTagName("head")[0].appendChild(style);
  };

  HealthBarMod.prototype._appendContainer = function () {
    if (document.getElementById("lifeBars")) return; // already present
    var container = document.createElement("div");
    container.id = "lifeBars";
    container.className = "lifeBarsContainer";
    try {
      window.foreground.rootElement.appendChild(container);
    } catch (e) {
      console.warn("[dtd] health-bar: could not append lifeBars container", e);
    }
  };

  HealthBarMod.prototype._listenGameEvents = function () {
    var self = this;

    // Reset the toggle when a new turn cycle starts
    var ensureRendering = function () {
      self._toggleRendering(true);
    };
    this._on(window.gui, "GameFightOptionStateUpdateMessage", ensureRendering);
    this._on(window.dofus.connectionManager, "GameFightTurnStartMessage", ensureRendering);
    this._on(window.dofus.connectionManager, "GameFightTurnEndMessage", ensureRendering);

    // Update bars on combat events
    var updateData = function () {
      setTimeout(function () { self._updateHealthBars(); }, 50);
    };
    this._on(window.dofus.connectionManager, "GameFightTurnStartMessage", updateData);
    this._on(window.dofus.connectionManager, "GameFightTurnEndMessage", updateData);
    this._on(window.gui, "GameActionFightLifePointsGainMessage", updateData);
    this._on(window.gui, "GameActionFightLifePointsLostMessage", updateData);
    this._on(window.gui, "GameActionFightLifeAndShieldPointsLostMessage", updateData);
    this._on(window.gui, "GameActionFightPointsVariationMessage", updateData);
    this._on(window.gui, "GameFightOptionStateUpdateMessage", updateData);
    this._on(window.gui, "GameActionFightDeathMessage", updateData);
    this._on(window.gui, "resize", updateData);

    // Remove the bar for a fighter that just died
    this._on(window.gui, "GameActionFightDeathMessage", function (e) {
      if (e && e.targetId != null) {
        self._destroyHealthBar(e.targetId);
      }
    });

    // Tear everything down when the fight ends
    var destroy = function () { self._destroyHealthBars(); };
    this._on(window.dofus.connectionManager, "GameFightLeaveMessage", destroy);
    this._on(window.dofus.connectionManager, "GameFightEndMessage", destroy);
  };

  HealthBarMod.prototype._updateHealthBars = function () {
    if (!this.rendered) return;

    var fighters;
    try {
      fighters = window.gui.fightManager.getFighters();
    } catch (e) {
      return;
    }

    var self = this;
    for (var i = 0; i < fighters.length; i++) {
      var fighterId = fighters[i];
      var fighter;
      try {
        fighter = window.gui.fightManager.getFighter(fighterId);
      } catch (e) {
        continue;
      }
      if (fighter && fighter.data && fighter.data.alive) {
        if (!self.bars[fighter.id]) {
          self.bars[fighter.id] = new Bar(fighter);
        }
        try {
          self.bars[fighter.id].update();
        } catch (e) {
          console.warn("[dtd] health-bar: update error for fighter", fighter.id, e);
        }
      }
    }
  };

  HealthBarMod.prototype._destroyHealthBar = function (fighterId) {
    if (this.bars[fighterId]) {
      try { this.bars[fighterId].destroy(); } catch (e) { /* noop */ }
      delete this.bars[fighterId];
    }
  };

  HealthBarMod.prototype._destroyHealthBars = function () {
    var self = this;
    Object.keys(this.bars).forEach(function (id) {
      self._destroyHealthBar(parseInt(id, 10));
    });
  };

  HealthBarMod.prototype._toggleRendering = function (rendered) {
    this.rendered = (rendered !== undefined) ? rendered : !this.rendered;
    if (this.rendered) {
      this._updateHealthBars();
    } else {
      this._destroyHealthBars();
    }
  };

  // ---------------------------------------------------------------------------
  // init — called once the client globals are confirmed present
  // ---------------------------------------------------------------------------

  function init() {
    var mod = new HealthBarMod();
    mod._appendStyle();
    mod._appendContainer();
    mod._listenGameEvents();
    mod._updateHealthBars();
    console.log("[dtd] mod health-bar active");
  }
})();
