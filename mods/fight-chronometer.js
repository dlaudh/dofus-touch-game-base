/**
 * fight-chronometer — faithful plain-JS port of the reference client's FightChronometerMod.
 *
 * Displays a HH:MM:SS counter inside the fight UI (.infoContainer) that
 * starts when GameFightStartMessage fires and resets on GameFightEndMessage /
 * GameFightLeaveMessage. The counter element is inserted before
 * .fightControlButtons inside .infoContainer, and a small negative margin
 * is applied to .turnCountLabel to make room.
 *
 * Original source:
 *   packages/renderer/src/mods/fight-chronometer/fight-chronometer.ts
 */
(function () {
  "use strict";

  window.__dtdMod.ready(
    { mod: "fight-chronometer", need: ["gui", "isoEngine", "dofus"] },
    init
  );

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  var chronometerInitialized = false;
  var chronometerContainer = null; // HTMLDivElement
  var chronometerInterval = null;  // setInterval handle

  // -------------------------------------------------------------------------
  // init — wire up connection-manager events (runs once after ready-poll).
  // -------------------------------------------------------------------------
  function init() {
    try {
      create(); // attempt early DOM insertion (fight UI may already be open)

      window.dofus.connectionManager.on("GameFightStartMessage", onFightStart);
      window.dofus.connectionManager.on("GameFightEndMessage",   onFightEnd);
      window.dofus.connectionManager.on("GameFightLeaveMessage", onFightLeave);

      console.log("[dtd] mod fight-chronometer active");
    } catch (ex) {
      console.error("[dtd] fight-chronometer init error", ex);
    }
  }

  // -------------------------------------------------------------------------
  // create — insert the chronometer div into the fight UI once.
  // -------------------------------------------------------------------------
  function create() {
    try {
      // The client tears down the fight UI between fights, which detaches the
      // node we cached. Trusting the flag alone meant the chronometer never
      // came back for the second fight of a session.
      if (chronometerInitialized && chronometerContainer && window.document.contains(chronometerContainer)) {
        return;
      }
      chronometerInitialized = false;
      chronometerContainer = null;

      // Re-check whether something already added the element.
      var existing = window.document.querySelector("#chronometerContainer");
      if (existing !== null) {
        chronometerContainer = existing;
        chronometerInitialized = true;
        return;
      }

      var container = window.document.querySelector(".infoContainer");
      if (!container) {
        // Fight UI not open yet; will be called again from onFightStart.
        return;
      }

      // Nudge the turn-count label upward to make room.
      var turnsLabel = window.document.querySelector(".turnCountLabel");
      if (turnsLabel) {
        turnsLabel.setAttribute("style", "margin-top: -5px");
      }

      chronometerContainer = window.document.createElement("div");
      chronometerContainer.id = "chronometerContainer";
      chronometerContainer.setAttribute(
        "style",
        [
          "margin-top: -9px;",
          "color: white;",
          "text-align: center;"
        ].join(" ")
      );
      chronometerContainer.innerHTML = "00:00:00";

      var fightButtons = window.document.querySelector(".fightControlButtons");
      if (fightButtons) {
        container.insertBefore(chronometerContainer, fightButtons);
      } else {
        container.appendChild(chronometerContainer);
      }

      chronometerInitialized = true;
    } catch (ex) {
      console.error("[dtd] fight-chronometer create error", ex);
    }
  }

  // -------------------------------------------------------------------------
  // update — start the counting interval when a fight begins.
  // -------------------------------------------------------------------------
  function update() {
    if (!chronometerInitialized) {
      create();
    }

    // Clear any stale interval from a previous fight.
    if (chronometerInterval !== null) {
      clearInterval(chronometerInterval);
      chronometerInterval = null;
    }

    var chronometerTime = 0;

    try {
      chronometerInterval = setInterval(function () {
        try {
          // Stop ticking when the fight is no longer in the "ongoing" state (1).
          if (window.gui.fightManager.fightState !== 1) {
            clearInterval(chronometerInterval);
            chronometerInterval = null;
            return;
          }
        } catch (e) { /* fightManager may not be accessible — keep ticking */ }

        if (chronometerContainer) {
          chronometerContainer.innerHTML = new Date(chronometerTime++ * 1000)
            .toISOString()
            .substr(11, 8);
        }
      }, 1000);
    } catch (ex) {
      console.error("[dtd] fight-chronometer update error", ex);
    }
  }

  // -------------------------------------------------------------------------
  // clear — stop and reset the display (fight ended / player left).
  // -------------------------------------------------------------------------
  function clear() {
    try {
      if (chronometerInterval !== null) {
        clearInterval(chronometerInterval);
        chronometerInterval = null;
      }
      if (chronometerContainer) {
        chronometerContainer.innerHTML = "00:00:00";
      }
    } catch (ex) {
      console.error("[dtd] fight-chronometer clear error", ex);
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------
  function onFightStart() {
    create(); // ensure the element exists (fight UI opens with this event)
    update();
  }

  function onFightEnd() {
    clear();
  }

  function onFightLeave() {
    clear();
  }
})();
