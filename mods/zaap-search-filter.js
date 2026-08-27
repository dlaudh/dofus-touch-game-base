// zaap-search-filter.js
// Adds a live search/filter input and favourite-star buttons to the Zaap,
// Zaapi (subway), and Prisme teleport dialogs. Favourites are stored in
// localStorage under the key "zaapFav" and are sorted to the top of each list.
// Ported from the reference client's ZaapSearchFilterMod (TypeScript) to plain JS.
(function () {
  "use strict";

  var styleTag = null;
  var zaapSearchContainer = null;
  var zaapSearchInput = null;

  // Stored listeners so we can remove them on dialog close.
  var _listeners = [];

  function addListener(emitter, event, fn) {
    emitter.on(event, fn);
    _listeners.push({ emitter: emitter, event: event, fn: fn });
  }

  function removeAllListeners() {
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i].emitter.removeListener(_listeners[i].event, _listeners[i].fn);
      } catch (e) { /* noop */ }
    }
    _listeners = [];
  }

  // ---- localStorage helpers -------------------------------------------------

  function getFavs() {
    var raw = localStorage.getItem("zaapFav");
    if (raw == null || raw === "") return [];
    return raw.split(",").filter(function (s) { return s !== ""; });
  }

  function saveFavs(arr) {
    localStorage.setItem("zaapFav", arr.join(","));
  }

  function isFav(name) {
    var favs = getFavs();
    for (var i = 0; i < favs.length; i++) {
      if (favs[i] === name) return true;
    }
    return false;
  }

  function toggleFav(name) {
    var favs = getFavs();
    var idx = -1;
    for (var i = 0; i < favs.length; i++) {
      if (favs[i] === name) { idx = i; break; }
    }
    if (idx !== -1) {
      favs.splice(idx, 1);
    } else {
      favs.push(name);
    }
    saveFavs(favs);
  }

  // ---- Shared CSS (injected once per dialog open) ---------------------------

  var SHARED_CSS = [
    ".dtd_zaapSearch__container{padding:10px;width:100%;}",
    ".dtd_zaapSearch__input{text-align:center;width:96%;margin-right:10px;",
    "background-color:#424242;border-radius:5px;color:white;",
    "border-color:#262626;height:34px;font-size:1em;}"
  ].join("");

  // ---- Generic search-input injector ----------------------------------------

  function injectInput(bodyClass, panelHeightClass, placeholder) {
    styleTag = document.createElement("style");
    document.getElementsByTagName("head")[0].appendChild(styleTag);
    styleTag.innerHTML = "." + panelHeightClass + "{height:70% !important;}" + SHARED_CSS;

    var bodyEl = document.getElementsByClassName(bodyClass)[0];
    if (!bodyEl) return false;

    var panels = bodyEl.getElementsByClassName("panels")[0];
    if (panels) panels.classList.add(panelHeightClass);

    zaapSearchContainer = document.createElement("div");
    zaapSearchInput = document.createElement("input");
    zaapSearchInput.setAttribute("placeholder", placeholder);
    zaapSearchInput.setAttribute("id", "zaapName");
    zaapSearchContainer.classList.add("dtd_zaapSearch__container");
    zaapSearchInput.classList.add("dtd_zaapSearch__input");
    zaapSearchContainer.appendChild(zaapSearchInput);
    bodyEl.insertBefore(zaapSearchContainer, bodyEl.firstChild);

    requestAnimationFrame(function () {
      zaapSearchInput.focus();
      zaapSearchInput.select();
    });
    return true;
  }

  // ---- Generic row-filter on keyup ------------------------------------------

  function attachFilter(heightClass) {
    if (!zaapSearchInput) return;
    zaapSearchInput.addEventListener("keyup", function () {
      var wanted = zaapSearchInput.value.toLowerCase();
      var container = document.getElementsByClassName(heightClass)[0];
      if (!container) return;
      var rows = container.getElementsByClassName("row");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var dest = row.getElementsByClassName("destinationName");
        if (!dest.length) continue;
        row.style.display = "none";
        if (row.innerText.toLowerCase().indexOf(wanted) !== -1) {
          row.style.display = "block";
        }
      }
    });
  }

  // ---- Generic favourite-star injector --------------------------------------

  function addFavs(heightClass) {
    var container = document.getElementsByClassName(heightClass)[0];
    if (!container) return;

    var rows = container.getElementsByClassName("row");

    // Add star buttons (skip first header row and last footer row).
    for (var i = 1; i < rows.length - 1; i++) {
      var row = rows[i];
      var cols = row.getElementsByClassName("col");
      if (!cols.length) continue;
      var divVide = cols[0];
      if (divVide.innerHTML !== "") continue;
      var destCol = cols[1];
      if (!destCol) continue;
      var destEl = destCol.getElementsByClassName("destinationName")[0];
      if (!destEl) continue;

      (function (btn, nameEl) {
        btn.onclick = function () {
          var name = nameEl.innerHTML;
          toggleFav(name);
          btn.innerHTML = isFav(name)
            ? '<img width="25" height="24" src="./assets/ui/icons/goldenStar.png">'
            : '<img width="25" height="24" src="./assets/ui/icons/greyStar.png">';
        };
        var name = nameEl.innerHTML;
        btn.innerHTML = isFav(name)
          ? '<img width="25" height="24" src="./assets/ui/icons/goldenStar.png">'
          : '<img width="25" height="24" src="./assets/ui/icons/greyStar.png">';
        divVide.appendChild(btn);
      })(document.createElement("div"), destEl);
    }

    // Bubble favourites to the top.
    rows = container.getElementsByClassName("row");
    var saveIndex = 1;
    for (var j = 1; j < rows.length - 1; j++) {
      var cur = rows[j];
      var curCols = cur.getElementsByClassName("col");
      if (!curCols[1]) continue;
      var curDest = curCols[1].getElementsByClassName("destinationName")[0];
      if (curDest && isFav(curDest.innerHTML)) {
        cur.parentNode.insertBefore(cur, cur.parentNode.firstChild);
        saveIndex++;
        j = saveIndex;
      }
    }
  }

  // ---- Cleanup after dialog closes ------------------------------------------

  function resetSearchFilter() {
    try {
      if (styleTag) { styleTag.parentNode && styleTag.parentNode.removeChild(styleTag); styleTag = null; }
      if (zaapSearchInput) { zaapSearchInput.parentNode && zaapSearchInput.parentNode.removeChild(zaapSearchInput); zaapSearchInput = null; }
      if (zaapSearchContainer) { zaapSearchContainer.parentNode && zaapSearchContainer.parentNode.removeChild(zaapSearchContainer); zaapSearchContainer = null; }
    } catch (e) { /* noop */ }
  }

  // ---- Per-dialog entry points ----------------------------------------------

  function createSearchFilter() {
    // Zaap
    if (!injectInput("zaapBody", "dtd_zaapBodyHeight__custom", "Search zaap...")) return;
    attachFilter("dtd_zaapBodyHeight__custom");
    addFavs("dtd_zaapBodyHeight__custom");
  }

  function createSearchFilterZaapi() {
    // Zaapi / subway
    if (!injectInput("subwayBody", "dtd_subwayBodyHeight__custom", "Search zaapi...")) return;
    attachFilter("dtd_subwayBodyHeight__custom");
    addFavs("dtd_subwayBodyHeight__custom");
  }

  function createSearchFilterPrisme() {
    // Prisme
    if (!injectInput("zaapBody", "dtd_prismeBodyHeight__custom", "Search prisme...")) return;
    attachFilter("dtd_prismeBodyHeight__custom");
    addFavs("dtd_prismeBodyHeight__custom");
  }

  // ---- Initialisation (poll until client globals are ready) -----------------

  // Ensure zaapFav key exists.
  if (localStorage.getItem("zaapFav") == null) {
    localStorage.setItem("zaapFav", "");
  }

  var pollInterval = setInterval(function () {
    try {
      if (!window.gui || !window.isoEngine) return;
      if (!window.dofus || !window.dofus.connectionManager) return;

      clearInterval(pollInterval);

      var cm = window.dofus.connectionManager;

      addListener(cm, "ZaapListMessage", function () {
        try { createSearchFilter(); } catch (e) { console.error("[dtd] zaap-search-filter ZaapListMessage error", e); }
      });

      addListener(cm, "TeleportDestinationsListMessage", function (arg) {
        try {
          if (arg && arg.teleporterType === 1) {
            createSearchFilterZaapi();
          } else if (arg && arg.teleporterType === 2) {
            createSearchFilterPrisme();
          }
        } catch (e) { console.error("[dtd] zaap-search-filter TeleportDestinationsListMessage error", e); }
      });

      addListener(cm, "LeaveDialogMessage", function () {
        try {
          removeAllListeners();
          resetSearchFilter();
          // Re-register after cleanup so the mod keeps working for subsequent dialogs.
          reRegister();
        } catch (e) { console.error("[dtd] zaap-search-filter LeaveDialogMessage error", e); }
      });

      console.log("[dtd] mod zaap-search-filter active");
    } catch (e) {
      console.error("[dtd] zaap-search-filter poll error", e);
    }
  }, 300);

  // Re-attach connection-manager listeners after a dialog is closed.
  function reRegister() {
    var cm = window.dofus.connectionManager;

    addListener(cm, "ZaapListMessage", function () {
      try { createSearchFilter(); } catch (e) { console.error("[dtd] zaap-search-filter ZaapListMessage error", e); }
    });

    addListener(cm, "TeleportDestinationsListMessage", function (arg) {
      try {
        if (arg && arg.teleporterType === 1) {
          createSearchFilterZaapi();
        } else if (arg && arg.teleporterType === 2) {
          createSearchFilterPrisme();
        }
      } catch (e) { console.error("[dtd] zaap-search-filter TeleportDestinationsListMessage error", e); }
    });

    addListener(cm, "LeaveDialogMessage", function () {
      try {
        removeAllListeners();
        resetSearchFilter();
        reRegister();
      } catch (e) { console.error("[dtd] zaap-search-filter LeaveDialogMessage error", e); }
    });
  }
})();
