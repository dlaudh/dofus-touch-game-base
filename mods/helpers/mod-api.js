// mod-api.js
// The small shared surface every mod builds on. Loaded first (see mods.js), so
// window.__dtdMod exists before any mod script runs.
//
// Why this exists: the client boots asynchronously and its globals appear in an
// order no mod controls, so each mod grew its own readiness poll. That produced
// sixteen slightly different loops — two shapes (setInterval with no attempt
// cap, setTimeout recursion with one), three intervals, and guard lists that
// disagreed about which globals were actually required. The divergence caused
// real bugs: show-pods waited for the globals but not for the window it needed
// and died silently; damage-estimator never waited for window.dofus, so its
// fight-cleanup was left commented out with a note wondering whether the global
// was present. One definition of "ready" removes that whole class of problem.
//
// Routing every mod's startup through ready() also gives us the registry a
// settings UI needs: which mods exist, which are on, and which can be switched
// off without a reload.
(function () {
  "use strict";

  var POLL_INTERVAL = 250;     // ms — one timer for every waiting mod
  var DEFAULT_TIMEOUT = 90000; // ms — give up rather than poll forever
  var STORAGE_KEY = "dtd-mods-enabled";

  var waiters = [];
  var timer = null;

  // name -> { name, spec, fn, running, teardown, cancel }
  var registry = {};
  var changeListeners = [];

  // --- enabled/disabled state ------------------------------------------------
  // Only overrides are stored, so a mod added later defaults to on without
  // needing a migration.

  function loadOverrides() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  var overrides = loadOverrides();

  function saveOverrides() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.warn("[dtd] mod-api: could not persist mod settings", e);
    }
  }

  function isEnabled(name) {
    return overrides[name] !== false;
  }

  function notifyChange(name) {
    var snapshot = mods();
    for (var i = 0; i < changeListeners.length; i++) {
      try {
        changeListeners[i](name, snapshot);
      } catch (e) {
        console.warn("[dtd] mod-api: onChange listener threw", e);
      }
    }
  }

  // --- readiness -------------------------------------------------------------

  function missingGlobals(need) {
    var missing = [];
    for (var i = 0; i < need.length; i++) {
      if (!window[need[i]]) missing.push("window." + need[i]);
    }
    return missing;
  }

  function isSatisfied(waiter) {
    if (missingGlobals(waiter.need).length > 0) return false;
    if (!waiter.until) return true;
    try {
      return !!waiter.until();
    } catch (e) {
      return false; // an `until` that throws just means "not ready yet"
    }
  }

  function describeUnmet(waiter) {
    var missing = missingGlobals(waiter.need);
    if (missing.length > 0) return missing.join(", ");
    return waiter.untilLabel || "its readiness condition";
  }

  /**
   * Run a mod's init and remember whatever it hands back. A mod that returns a
   * function is declaring how to undo itself, which is what makes it safe to
   * switch off without reloading the client.
   */
  function runInit(entry) {
    try {
      var teardown = entry.fn();
      entry.running = true;
      entry.teardown = typeof teardown === "function" ? teardown : null;
    } catch (e) {
      console.error("[dtd] " + entry.name + ": init error", e);
    }
  }

  function tick() {
    var now = Date.now();
    var pending = [];

    for (var i = 0; i < waiters.length; i++) {
      var waiter = waiters[i];
      if (waiter.cancelled) continue;

      if (isSatisfied(waiter)) {
        runInit(waiter.entry);
        continue;
      }

      if (now - waiter.started >= waiter.timeout) {
        console.warn(
          "[dtd] " + waiter.entry.name + ": gave up waiting for " + describeUnmet(waiter)
        );
        continue;
      }

      pending.push(waiter);
    }

    waiters = pending;
    if (waiters.length === 0) stop();
  }

  function start() {
    if (timer === null) timer = setInterval(tick, POLL_INTERVAL);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  /** Queue (or immediately run) a registered mod's init. */
  function beginWaiting(entry) {
    var spec = entry.spec;
    var waiter = {
      entry: entry,
      need: spec.need || [],
      until: spec.until || null,
      untilLabel: spec.untilLabel || null,
      timeout: spec.timeout || DEFAULT_TIMEOUT,
      started: Date.now(),
      cancelled: false
    };

    // Already satisfied: run now rather than waiting a whole poll interval.
    if (isSatisfied(waiter)) {
      runInit(entry);
      entry.cancel = function () {};
      return entry.cancel;
    }

    waiters.push(waiter);
    start();
    entry.cancel = function () {
      waiter.cancelled = true;
    };
    return entry.cancel;
  }

  // --- registry --------------------------------------------------------------

  /** Snapshot for a settings UI. */
  function mods() {
    return Object.keys(registry).sort().map(function (name) {
      var entry = registry[name];
      return {
        name: name,
        enabled: isEnabled(name),
        running: entry.running,
        // Only known once a mod has actually started: it is the init's return
        // value that says whether the mod can undo itself.
        liveToggle: !!entry.teardown
      };
    });
  }

  function setEnabled(name, on) {
    var entry = registry[name];
    if (!entry) {
      console.warn("[dtd] mod-api: unknown mod '" + name + "'");
      return false;
    }
    if (isEnabled(name) === !!on) return true;

    if (on) {
      delete overrides[name];
      saveOverrides();
      beginWaiting(entry);
      notifyChange(name);
      return true;
    }

    overrides[name] = false;
    saveOverrides();
    if (entry.cancel) entry.cancel(); // drop it from the readiness queue

    if (entry.running) {
      if (entry.teardown) {
        try {
          entry.teardown();
        } catch (e) {
          console.error("[dtd] " + name + ": teardown error", e);
        }
        entry.teardown = null;
        entry.running = false;
      } else {
        // The mod hooked the client and never said how to unhook. The setting
        // is saved, so it stays off from the next launch on.
        console.warn(
          "[dtd] " + name + ": disabled, but it has no teardown — " +
          "reload to actually stop it"
        );
      }
    }
    notifyChange(name);
    return true;
  }

  // --- client lookups --------------------------------------------------------

  /** A window component from gui.windowsContainer by its id, or null. */
  function findWindow(id) {
    try {
      var children = window.gui.windowsContainer.getChildren();
      for (var i = 0; i < children.length; i++) {
        if (children[i].id === id) return children[i];
      }
    } catch (e) { /* container not built yet */ }
    return null;
  }

  /**
   * Whether this host has desktop input — a hardware keyboard and a mouse wheel.
   * Mods that bind either (shortcuts) or that would summon a soft keyboard
   * (zaap-search-filter's autofocus) gate on this instead of each rolling its
   * own copy of the check.
   */
  function isDesktopInput() {
    var platform = window.__dtdPlatform;
    if (platform === "android" || platform === "ios") return false;
    // Hosts that don't declare a platform: a touch-only device reports a coarse
    // primary pointer and no hover. Anything else is treated as desktop.
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches &&
        !window.matchMedia("(hover: hover)").matches
      ) {
        return false;
      }
    } catch (e) {
      /* matchMedia unavailable — assume desktop */
    }
    return true;
  }

  // --- public surface --------------------------------------------------------

  window.__dtdMod = {
    /**
     * Register a mod and run fn once the client is ready for it.
     *
     *   __dtdMod.ready({
     *     mod: "show-pods",                       // name, also the registry key
     *     need: ["gui", "isoEngine", "dofus"],    // window.* globals required
     *     until: function () {                    // optional extra condition
     *       return __dtdMod.findWindow("equipment");
     *     },
     *     untilLabel: "the equipment window",     // optional, for the timeout log
     *     timeout: 90000,                         // optional, ms
     *   }, function () { ... });
     *
     * Registration happens even when the mod is switched off, so a settings UI
     * can list every mod rather than only the running ones.
     *
     * If fn returns a function, that function is kept as the mod's teardown and
     * the mod becomes switchable at runtime. Returning nothing is fine — the
     * mod then needs a reload to actually stop.
     *
     * Returns a function that cancels the wait.
     */
    ready: function (spec, fn) {
      var name = spec.mod || "mod";
      var entry = registry[name];
      if (!entry) {
        entry = registry[name] = { name: name, running: false, teardown: null, cancel: null };
      }
      entry.spec = spec;
      entry.fn = fn;

      if (!isEnabled(name)) {
        console.log("[dtd] mod " + name + " skipped (disabled)");
        return function () {};
      }
      return beginWaiting(entry);
    },

    /** Every registered mod: { name, enabled, running, liveToggle }. */
    mods: mods,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    enable: function (name) { return setEnabled(name, true); },
    disable: function (name) { return setEnabled(name, false); },

    /** Called as fn(changedName, mods()) whenever a mod is switched. */
    onChange: function (fn) {
      changeListeners.push(fn);
      return function () {
        var i = changeListeners.indexOf(fn);
        if (i !== -1) changeListeners.splice(i, 1);
      };
    },

    findWindow: findWindow,
    isDesktopInput: isDesktopInput
  };

  console.log("[dtd] helper mod-api active");
})();
