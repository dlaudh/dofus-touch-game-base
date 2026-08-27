// challenge-percent.js
// Shows the XP bonus percentage directly on the challenge icon in the fight HUD.
// Ported from the reference client's ChallengePercentMod (TypeScript) for this
// Electron wrapper.  Injects a small <style> block that widens the challenge
// slot and positions an overlay <div> bearing "+N%" text, populated whenever a
// ChallengeInfoMessage arrives from the server.
(function () {
  "use strict";

  var POLL_INTERVAL = 250; // ms between readiness checks
  var stylesheet = null;
  var challengeListener = null;

  // -------------------------------------------------------------------------
  // Readiness poll — wait for the game globals that this mod depends on.
  // -------------------------------------------------------------------------
  var pollTimer = setInterval(function () {
    if (
      typeof window.gui === "undefined" ||
      typeof window.isoEngine === "undefined" ||
      typeof window.dofus === "undefined"
    ) {
      return;
    }
    clearInterval(pollTimer);
    init();
  }, POLL_INTERVAL);

  // -------------------------------------------------------------------------
  // init — called once the client globals are ready.
  // -------------------------------------------------------------------------
  function init() {
    try {
      start();
      console.log("[dtd] mod challenge-percent active");
    } catch (e) {
      console.error("[dtd] challenge-percent init error", e);
    }
  }

  // -------------------------------------------------------------------------
  // start — inject CSS and register the ChallengeInfoMessage listener.
  // -------------------------------------------------------------------------
  function start() {
    // Inject stylesheet
    stylesheet = document.createElement("style");
    stylesheet.id = "ChallPercent";
    stylesheet.innerHTML = [
      ".challPercentOnIcon .challengeIcon {",
      "  background-size: contain;",
      "  background-position: left center;",
      "}",
      "",
      ".challPercentOnIcon,",
      ".challPercentOnIcon .challengeSlot {",
      "  width: 100px;",
      "}",
      "",
      ".challPercentOnIconDetails {",
      "  position: absolute;",
      "  width: 45px;",
      "  left: 45px;",
      "  top: 11px;",
      "}"
    ].join("\n");
    document.head.appendChild(stylesheet);

    // Add the modifier class to the challenge indicator root element.
    try {
      window.gui.challengeIndicator.rootElement.classList.add("challPercentOnIcon");
    } catch (e) {
      console.warn("[dtd] challenge-percent: could not add class to challengeIndicator", e);
    }

    // Listen for challenge info messages and append the XP bonus label.
    challengeListener = function (msg) {
      try {
        var challengeText = document.createElement("div");
        challengeText.className = "challPercentOnIconDetails";
        challengeText.innerHTML = "+" + msg.xpBonus + "%";

        var iconDetails =
          window.gui.challengeIndicator &&
          window.gui.challengeIndicator.iconDetailsListByChallengeId &&
          window.gui.challengeIndicator.iconDetailsListByChallengeId[msg.challengeId];

        if (iconDetails && iconDetails.icon && iconDetails.icon.rootElement) {
          iconDetails.icon.rootElement.appendChild(challengeText);
        }
      } catch (e) {
        console.warn("[dtd] challenge-percent: ChallengeInfoMessage handler error", e);
      }
    };

    try {
      window.dofus.connectionManager.on("ChallengeInfoMessage", challengeListener);
    } catch (e) {
      console.warn("[dtd] challenge-percent: could not register ChallengeInfoMessage listener", e);
    }
  }
})();
