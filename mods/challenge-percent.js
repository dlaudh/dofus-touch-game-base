// challenge-percent.js
// Shows the XP bonus percentage directly on the challenge icon in the fight HUD.
// Ported from the reference client's ChallengePercentMod (TypeScript) for this
// Electron wrapper.  Injects a small <style> block that widens the challenge
// slot and positions an overlay <div> bearing "+N%" text, populated whenever a
// ChallengeInfoMessage arrives from the server.
(function () {
  "use strict";

  var stylesheet = null;
  var challengeListener = null;

  window.__dtdMod.ready(
    { mod: "challenge-percent", need: ["gui", "isoEngine", "dofus"] },
    init
  );

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
        if (!msg || msg.xpBonus == null) return; // nothing to show

        var iconDetails =
          window.gui.challengeIndicator &&
          window.gui.challengeIndicator.iconDetailsListByChallengeId &&
          window.gui.challengeIndicator.iconDetailsListByChallengeId[msg.challengeId];

        var root = iconDetails && iconDetails.icon && iconDetails.icon.rootElement;
        if (!root) return;

        // Reuse the label if this challenge already has one. Appending a fresh
        // div per message stacked duplicate "+N%" texts on the same icon
        // whenever the server re-sent ChallengeInfoMessage.
        var label = root.querySelector(".challPercentOnIconDetails");
        if (!label) {
          label = document.createElement("div");
          label.className = "challPercentOnIconDetails";
          root.appendChild(label);
        }
        label.textContent = "+" + msg.xpBonus + "%";
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
