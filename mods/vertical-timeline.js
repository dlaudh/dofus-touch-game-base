// vertical-timeline.js
// Turns the fight turn-order timeline from horizontal to vertical by injecting
// a <style> block and toggling CSS classes + iScroll axis options on the
// gui.timeline widget. Ported from the reference client's VerticalTimelineMod (TypeScript).
// Always-on (no settings store needed); waits for window.gui to be ready.
(function () {
  "use strict";

  var CSS = [
    ".Timeline.vertical:not(.collapsed) .fighterListContainer {",
    "  max-width: 75px;",
    "  display: block;",
    "  height: auto;",
    "  margin: 0 auto;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .Scroller .iScrollIndicator {",
    "  right: -10px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighterList {",
    "  height: 100%;",
    "  max-height: 45vh;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighterList .scrollerContent {",
    "  flex-direction: column;",
    "  margin-right: 0;",
    "  margin-left: 5px;",
    "  height: auto;",
    "  position: relative;",
    "  padding-bottom: 10px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighter.current {",
    "  margin-top: 0;",
    "  margin-left: 8px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighter {",
    "  width: 51px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighter.current:after {",
    "  transform: rotate(90deg);",
    "  left: -24px;",
    "  bottom: 15px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighter.summoned {",
    "  max-width: 41px;",
    "  margin-left: 12px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .fighterListContainer .fighter.summoned.current {",
    "  margin-left: 20px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed) .FightBuffs {",
    "  margin-top: 0;",
    "  position: absolute;",
    "  left: -45px;",
    "  width: 43px;",
    "  top: 25px;",
    "}",
    "",
    ".Timeline.vertical:not(.collapsed).magnetLeft .FightBuffs {",
    "  left: auto;",
    "  right: -45px;",
    "}",
  ].join("\n");

  function start() {
    try {
      // Inject stylesheet
      var style = window.document.createElement("style");
      style.id = "VerticalTimeline";
      style.innerHTML = CSS;
      window.document.head.appendChild(style);

      // Add vertical class to the Timeline element
      var timelineEl = window.document.querySelector(".Timeline");
      if (timelineEl) {
        timelineEl.classList.add("vertical");
      }

      var tl = window.gui.timeline;

      // Remove horizontal iScroll mode
      tl.fighterList.rootElement.classList.remove("horizontal");
      tl.fighterListScroller.iScroll.options.scrollX = false;
      tl.fighterListScroller.iScroll.options.scrollY = true;

      // Switch scrollbar axis
      var indicator = tl.fighterListScroller.iScroll.indicators[0];
      indicator.options.listenX = false;
      indicator.options.listenY = true;
      indicator.wrapper.classList.remove("iScrollHorizontalScrollbar");
      indicator.wrapper.classList.add("iScrollVerticalScrollbar");

      // Refresh iScroll to apply changes
      tl.fighterListScroller.iScroll.refresh();

      console.log("[dtd] mod vertical-timeline active");
    } catch (e) {
      console.error("[dtd] vertical-timeline start error", e);
    }
  }

  // Poll until gui.timeline is available, then initialise once.
  var POLL_INTERVAL = 500;
  var MAX_ATTEMPTS = 120; // 60 s
  var attempts = 0;

  function poll() {
    try {
      if (
        window.gui &&
        window.gui.timeline &&
        window.gui.timeline.fighterList &&
        window.gui.timeline.fighterListScroller &&
        window.gui.timeline.fighterListScroller.iScroll
      ) {
        start();
        return;
      }
    } catch (e) {
      /* not ready yet */
    }
    attempts++;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(poll, POLL_INTERVAL);
    } else {
      console.warn("[dtd] vertical-timeline: gui.timeline never became ready");
    }
  }

  poll();
})();
