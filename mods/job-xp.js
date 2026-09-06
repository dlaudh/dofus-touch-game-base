// job-xp.js
// Port of the reference client's job-xp mod (packages/renderer/src/mods/job-xp/).
// Overlays a small panel (top-right of the foreground) that lists every job the
// player has, showing XP remaining until the next level.  The panel hides during
// fights (GameFightStartingMessage) and re-appears when the fight ends or the
// player leaves it (GameFightEndMessage / GameFightLeaveMessage).  Job icon art
// is fetched from window.Config.assetsUrl + "/gfx/jobs/<iconId>.png".
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // CSS — injected once into document.head (same selectors/values as the reference client)
  // ---------------------------------------------------------------------------
  var CSS_ID = "jobsxpbarCss";
  var PANEL_ID = "xpRestanteId";

  var CSS_TEXT = [
    ".xpRestanteText {",
    "    box-sizing: border-box;",
    "    overflow: hidden;",
    "    font-size: 11px;",
    "    position: absolute;",
    "    color: white;",
    "    margin-right: 10px;",
    "    margin-top: 10px;",
    "    text-shadow: 0 0 5px rgba(0, 0, 0, 0.9);",
    "    right: 10px;",
    "    pointer-events: none;",
    "    padding: 5px 16px;",
    "    top: 0;",
    "}",
    ".xpRestanteText::after {",
    "    content: '';",
    "    position: absolute;",
    "    top: 0;",
    "    left: 0;",
    "    width: 100%;",
    "    height: 100%;",
    "    border-image-source: url(./assets/ui/container.png);",
    "    border-image-slice: 63;",
    "    border-image-width: 37px;",
    "    border-radius: 10px;",
    "    border-style: solid;",
    "    background-color: #2e2d28;",
    "    z-index: -1;",
    "    box-sizing: border-box;",
    "    opacity: 0.8;",
    "}",
    ".xpRestanteText .job {",
    "    display: flex;",
    "    margin: 8px;",
    "    align-items: center;",
    "}",
    ".xpRestanteText img {",
    "    flex-grow: 0;",
    "    flex-shrink: 0;",
    "    width: 50px;",
    "    height: 50px;",
    "    margin-left: 10px;",
    "}",
    ".xpRestanteText .description {",
    "    flex-grow: 1;",
    "    width: 120px;",
    "    text-align: right;",
    "}",
    ".xpRestanteText .name {",
    "    font-family: berlin_sans_fb_demibold;",
    "    font-size: 1.6em;",
    "    color: #ced0bb;",
    "    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);",
    "}"
  ].join("\n");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var xpPanel = null; // the live HTMLDivElement, or null when absent

  // Single pending rebuild timer, shared by every caller of create().
  var pendingTimer = null;
  var pendingTries = 0;
  var MAX_TRIES = 40; // ~20 s at 500 ms

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Remove any previously injected CSS + panel (idempotent). */
  function removeOldElements() {
    var old;
    old = document.getElementById(CSS_ID);
    if (old && old.parentElement) old.parentElement.removeChild(old);
    old = document.getElementById(PANEL_ID);
    if (old && old.parentElement) old.parentElement.removeChild(old);
  }

  /** Inject the stylesheet into document.head (idempotent via removeOldElements). */
  function injectCSS() {
    var style = document.createElement("style");
    style.id = CSS_ID;
    style.innerHTML = CSS_TEXT;
    document.getElementsByTagName("head")[0].appendChild(style);
  }

  /** Remove the XP panel from the DOM and clear the module reference. */
  function clean() {
    // Drop any queued rebuild too, or a create() scheduled just before a fight
    // started would put the panel back up mid-fight.
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (xpPanel && xpPanel.parentElement) {
      xpPanel.style.visibility = "";
      xpPanel.innerHTML = "";
      xpPanel.parentElement.removeChild(xpPanel);
    }
    xpPanel = null;
  }

  /**
   * Build (or rebuild) the XP panel.
   *
   * Retries every 500 ms until playerData.jobs.list is available and the first
   * job entry has an `experience` object. Every call reuses a single pending
   * timer: create() is driven by JobExperienceUpdateMessage, which fires
   * constantly while harvesting, and the previous version started an
   * independent unbounded retry chain per call — so a harvesting session ended
   * up with many overlapping chains all rebuilding the same panel.
   */
  function create() {
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      try {
        var playerData = window.gui && window.gui.playerData;
        if (!playerData || !playerData.jobs || !playerData.jobs.list) {
          return retry(); // not ready yet
        }

        var jobs = playerData.jobs.list;
        var jobKeys = Object.keys(jobs);

        // If there are jobs but the first one has no experience data yet, retry.
        if (jobKeys.length > 0 && !jobs[jobKeys[0]].experience) {
          return retry();
        }

        pendingTries = 0;
        clean();

        var panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.className = "xpRestanteText";
        panel.style.visibility = "visible";
        panel.innerHTML = "";

        for (var id in jobs) {
          var job = jobs[id];
          if (job.experience && job.experience.jobXpNextLevelFloor) {
            var xpToWin = job.experience.jobXpNextLevelFloor - job.experience.jobXP;
            var nextLevel = job.experience.jobLevel + 1;
            var iconSrc = (window.Config ? window.Config.assetsUrl : "") + "/gfx/jobs/" + job.info.iconId + ".png";
            var html =
              '<div class="job">' +
                '<div class="description">' +
                  '<div class="name">' + job.info.nameId + "</div>" +
                  '<div class="text">' + xpToWin + " XP until level " + nextLevel + "</div>" +
                "</div>" +
                '<img src="' + iconSrc + '" alt=""/>' +
              "</div>";
            panel.insertAdjacentHTML("beforeend", html);
          }
        }

        if (panel.innerHTML !== "") {
          xpPanel = panel;
          window.foreground.rootElement.appendChild(xpPanel);
        }
      } catch (ex) {
        console.error("[dtd] job-xp create error", ex);
      }
    }, 500);
  }

  /** Re-arm the single retry timer, giving up rather than spinning forever. */
  function retry() {
    if (++pendingTries > MAX_TRIES) {
      pendingTries = 0;
      console.warn("[dtd] job-xp: gave up waiting for job data");
      return;
    }
    create();
  }

  // ---------------------------------------------------------------------------
  // Initialisation (called once the client globals are ready)
  // ---------------------------------------------------------------------------
  function init() {
    try {
      removeOldElements();
      injectCSS();
      create();

      // Hide panel when a fight starts.
      window.dofus.connectionManager.on("GameFightStartingMessage", function () {
        try {
          clean();
        } catch (ex) {
          console.error("[dtd] job-xp GameFightStartingMessage error", ex);
        }
      });

      // Restore panel when a fight ends normally.
      window.dofus.connectionManager.on("GameFightEndMessage", function () {
        try {
          create();
        } catch (ex) {
          console.error("[dtd] job-xp GameFightEndMessage error", ex);
        }
      });

      // Restore panel when the player leaves a fight early.
      window.dofus.connectionManager.on("GameFightLeaveMessage", function () {
        try {
          create();
        } catch (ex) {
          console.error("[dtd] job-xp GameFightLeaveMessage error", ex);
        }
      });

      // Refresh panel whenever job XP is updated.
      window.gui.on("JobExperienceUpdateMessage", function (e) {
        try {
          if (e && e.experiencesUpdate && e.experiencesUpdate.jobXpNextLevelFloor) {
            create();
          }
        } catch (ex) {
          console.error("[dtd] job-xp JobExperienceUpdateMessage error", ex);
        }
      });

      console.log("[dtd] mod job-xp active");
    } catch (ex) {
      console.error("[dtd] job-xp init error", ex);
    }
  }

  window.__dtdMod.ready(
    { mod: "job-xp", need: ["gui", "isoEngine", "dofus", "foreground"] },
    init
  );
})();
