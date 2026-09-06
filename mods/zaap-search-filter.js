// zaap-search-filter.js
// Adds a live search/filter input and favourite-star buttons to the Zaap,
// Zaapi (subway), and Prisme teleport dialogs. Favourites are stored in
// localStorage under the key "zaapFav" and are sorted to the top of each list.
// Ported from the reference client's ZaapSearchFilterMod (TypeScript) to plain JS.
//
// The star buttons are appended into rows the *client* owns and recycles, so
// every element this mod injects is tracked and removed again when the dialog
// closes — a leftover star outlives its row otherwise and reappears, wrongly
// sized, in whatever list reuses that row next.
(function () {
  "use strict";

  var STORAGE_KEY = "zaapFav";
  var STAR_CLASS = "dtd_zaapFav__btn";
  var STYLE_ID = "dtd_zaapSearch__style";

  var zaapSearchContainer = null;
  var zaapSearchInput = null;
  var injectedStars = []; // every star button currently living in a client row
  var listeners = [];

  function addListener(emitter, event, fn) {
    emitter.on(event, fn);
    listeners.push({ emitter: emitter, event: event, fn: fn });
  }

  function removeAllListeners() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i].emitter.removeListener(listeners[i].event, listeners[i].fn);
      } catch (e) { /* noop */ }
    }
    listeners = [];
  }

  // ---- favourites (localStorage) --------------------------------------------
  // Stored as a JSON array. The previous format was a comma-joined string, which
  // silently corrupted any destination name containing a comma; read it once for
  // migration, then always write JSON.

  function getFavs() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return [];
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Legacy comma-separated value — migrate it in place.
      var legacy = raw.split(",").filter(function (s) { return s !== ""; });
      saveFavs(legacy);
      return legacy;
    }
    return [];
  }

  function saveFavs(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("[dtd] zaap-search-filter: could not save favourites", e);
    }
  }

  function isFav(name) {
    return getFavs().indexOf(name) !== -1;
  }

  function toggleFav(name) {
    var favs = getFavs();
    var idx = favs.indexOf(name);
    if (idx !== -1) favs.splice(idx, 1);
    else favs.push(name);
    saveFavs(favs);
  }

  // ---- CSS ------------------------------------------------------------------
  // One stylesheet for the whole mod, injected once and left in place. The star
  // is sized here rather than via width/height attributes on the <img>, which
  // any of the client's own `img` rules would outrank.

  var CSS = [
    ".dtd_zaapSearch__container{padding:10px;width:100%;}",
    ".dtd_zaapSearch__input{text-align:center;width:96%;margin-right:10px;",
    "background-color:#424242;border-radius:5px;color:white;",
    "border-color:#262626;height:34px;font-size:1em;}",
    "." + STAR_CLASS + "{display:flex;align-items:center;justify-content:center;",
    "width:25px;height:24px;cursor:pointer;}",
    "." + STAR_CLASS + " img{width:25px;height:24px;}"
  ].join("");

  function ensureStyle(panelHeightClass) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.getElementsByTagName("head")[0].appendChild(style);
    }
    style.innerHTML = "." + panelHeightClass + "{height:70% !important;}" + CSS;
  }

  // ---- search input ---------------------------------------------------------

  /** Touch hosts have no hardware keyboard; focusing pops the soft keyboard
   *  over the very list the player is trying to read. */
  function shouldAutofocus() {
    return window.__dtdMod.isDesktopInput();
  }

  function injectInput(bodyClass, panelHeightClass, placeholder) {
    // Look the body up first: bailing after having appended a stylesheet is what
    // used to leak a <style> tag on every dialog this mod didn't recognise.
    var bodyEl = document.getElementsByClassName(bodyClass)[0];
    if (!bodyEl) return false;

    ensureStyle(panelHeightClass);

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

    if (shouldAutofocus()) {
      requestAnimationFrame(function () {
        if (!zaapSearchInput) return;
        zaapSearchInput.focus();
        zaapSearchInput.select();
      });
    }
    return true;
  }

  // ---- row filtering --------------------------------------------------------

  function rowDestination(row) {
    var cols = row.getElementsByClassName("col");
    if (!cols[1]) return null;
    return cols[1].getElementsByClassName("destinationName")[0] || null;
  }

  /** Snapshot of the live HTMLCollection — the sort below reorders rows, and
   *  iterating a live collection while mutating it skips entries. */
  function rowsOf(heightClass) {
    var container = document.getElementsByClassName(heightClass)[0];
    if (!container) return [];
    return Array.prototype.slice.call(container.getElementsByClassName("row"));
  }

  function attachFilter(heightClass) {
    if (!zaapSearchInput) return;
    zaapSearchInput.addEventListener("keyup", function () {
      var wanted = zaapSearchInput.value.toLowerCase();
      rowsOf(heightClass).forEach(function (row) {
        var dest = rowDestination(row);
        if (!dest) return;
        // Match the destination name only: the row's full text also carries the
        // star button, so an empty query is the only thing that should match all.
        var name = (dest.textContent || "").toLowerCase();
        row.style.display = name.indexOf(wanted) !== -1 ? "block" : "none";
      });
    });
  }

  // ---- favourite stars ------------------------------------------------------

  function starMarkup(name) {
    var icon = isFav(name) ? "goldenStar" : "greyStar";
    return '<img src="./assets/ui/icons/' + icon + '.png" alt="">';
  }

  function addFavs(heightClass) {
    var rows = rowsOf(heightClass);
    if (rows.length === 0) return;

    // Skip the header (first) and footer (last) rows.
    rows.slice(1, -1).forEach(function (row) {
      var cols = row.getElementsByClassName("col");
      if (!cols.length) return;
      var slot = cols[0];
      if (slot.innerHTML !== "") return; // already has a star, or isn't a spacer
      var destEl = rowDestination(row);
      if (!destEl) return;

      var name = destEl.textContent || "";
      var btn = document.createElement("div");
      btn.className = STAR_CLASS;
      btn.innerHTML = starMarkup(name);
      btn.onclick = function () {
        toggleFav(name);
        btn.innerHTML = starMarkup(name);
      };
      slot.appendChild(btn);
      injectedStars.push(btn);
    });

    sortFavsFirst(heightClass);
  }

  /**
   * Stable partition: favourites keep their relative order at the top, the rest
   * keep theirs below. The previous version reassigned the loop index while
   * calling insertBefore on a live collection, which both skipped rows and left
   * the order arbitrary.
   */
  function sortFavsFirst(heightClass) {
    var rows = rowsOf(heightClass);
    if (rows.length < 3) return;

    var header = rows[0];
    var body = rows.slice(1, -1);
    var parent = header.parentNode;
    if (!parent) return;

    var favs = [];
    var rest = [];
    body.forEach(function (row) {
      var dest = rowDestination(row);
      if (dest && isFav(dest.textContent || "")) favs.push(row);
      else rest.push(row);
    });
    if (favs.length === 0) return;

    var anchor = header.nextSibling;
    favs.concat(rest).forEach(function (row) {
      parent.insertBefore(row, anchor);
    });
  }

  // ---- cleanup --------------------------------------------------------------

  function resetSearchFilter() {
    try {
      // The stars live inside rows the client owns and recycles; leaving them
      // behind is what makes a stray star turn up in an unrelated list later.
      injectedStars.forEach(function (btn) {
        if (btn.parentNode) btn.parentNode.removeChild(btn);
      });
      injectedStars = [];

      if (zaapSearchContainer && zaapSearchContainer.parentNode) {
        zaapSearchContainer.parentNode.removeChild(zaapSearchContainer);
      }
      zaapSearchContainer = null;
      zaapSearchInput = null;
    } catch (e) {
      console.warn("[dtd] zaap-search-filter: cleanup error", e);
    }
  }

  // ---- per-dialog entry points ----------------------------------------------

  function build(bodyClass, heightClass, placeholder) {
    // A dialog can open without the previous one having emitted a close.
    resetSearchFilter();
    if (!injectInput(bodyClass, heightClass, placeholder)) return;
    attachFilter(heightClass);
    addFavs(heightClass);
  }

  // ---- initialisation -------------------------------------------------------

  function register() {
    var cm = window.dofus.connectionManager;

    addListener(cm, "ZaapListMessage", function () {
      try {
        build("zaapBody", "dtd_zaapBodyHeight__custom", "Search zaap...");
      } catch (e) {
        console.error("[dtd] zaap-search-filter ZaapListMessage error", e);
      }
    });

    addListener(cm, "TeleportDestinationsListMessage", function (arg) {
      try {
        if (arg && arg.teleporterType === 1) {
          build("subwayBody", "dtd_subwayBodyHeight__custom", "Search zaapi...");
        } else if (arg && arg.teleporterType === 2) {
          build("zaapBody", "dtd_prismeBodyHeight__custom", "Search prisme...");
        }
      } catch (e) {
        console.error("[dtd] zaap-search-filter TeleportDestinationsListMessage error", e);
      }
    });

    // LeaveDialogMessage fires for every NPC dialog, not just teleporters, so
    // this only tears down what was injected — the listeners stay registered.
    addListener(cm, "LeaveDialogMessage", function () {
      try {
        resetSearchFilter();
      } catch (e) {
        console.error("[dtd] zaap-search-filter LeaveDialogMessage error", e);
      }
    });
  }

  var cancelWait = window.__dtdMod.ready(
    {
      mod: "zaap-search-filter",
      need: ["gui", "isoEngine", "dofus"],
      until: function () { return window.dofus.connectionManager; },
      untilLabel: "dofus.connectionManager"
    },
    function () {
      register();
      console.log("[dtd] mod zaap-search-filter active");
    }
  );

  // Exposed so the host page can tear the mod down (e.g. on game reload).
  window.__dtdZaapSearchFilter = {
    destroy: function () {
      cancelWait();
      removeAllListeners();
      resetSearchFilter();
    }
  };
})();
