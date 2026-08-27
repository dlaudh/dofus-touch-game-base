// show-pods.js
// Port of Lindo's show-pods mod (packages/renderer/src/mods/general/show-pods.ts).
// When the equipment/inventory window is opened, replaces the capacity progress-bar
// label with a live numeric readout of remaining pod capacity (maxWeight - weight),
// formatted with thousands separators.  Updates in real time via InventoryWeightMessage.
// No external dependencies — uses only client globals (window.gui, window.isoEngine,
// window.dofus) and the game's own equipment window component API.
(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // Poll until client globals are ready, then initialise once.
  // -------------------------------------------------------------------------
  var POLL_INTERVAL = 300;
  var MAX_ATTEMPTS = 300; // ~90 s
  var attempts = 0;

  function isReady() {
    return window.gui && window.isoEngine;
  }

  function poll() {
    if (isReady()) {
      try {
        init();
      } catch (e) {
        console.error("[dtd] show-pods: init error", e);
      }
    } else {
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL);
      } else {
        console.warn("[dtd] show-pods: timed out waiting for client globals");
      }
    }
  }

  poll();

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Format a number with thin-space thousands separators (e.g. 12 345). */
  function formatNumber(x) {
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // -------------------------------------------------------------------------
  // Core logic
  // -------------------------------------------------------------------------

  /**
   * Walk the equipment window's storageBox component tree to locate the pods
   * label element, then wire up a live update listener.
   *
   * Expected tree (mirroring the TS source):
   *   equipmentWindow.storageBox
   *     ._childrenList[0]            — outer wrapper
   *       ._childrenList             — [ podContainer, ... ]
   *         podContainer             — hasClassName('podContainer')
   *           ._childrenList         — [ progressBarContainer, ... ]
   *             progressBarContainer — hasClassName('progressBarContainer')
   *               ._childrenList[0]  — the text label we overwrite
   */
  function show(equipmentWindow, inventoryWeightListener) {
    try {
      var outer = equipmentWindow.storageBox._childrenList[0];
      if (!outer) {
        console.warn("[dtd] show-pods: storageBox outer wrapper not found");
        return;
      }

      var podContainer = null;
      var outerChildren = outer._childrenList;
      for (var i = 0; i < outerChildren.length; i++) {
        if (outerChildren[i].hasClassName && outerChildren[i].hasClassName("podContainer")) {
          podContainer = outerChildren[i];
          break;
        }
      }
      if (!podContainer) {
        console.warn("[dtd] show-pods: podContainer not found");
        return;
      }

      var progressBarContainer = null;
      var podChildren = podContainer._childrenList;
      for (var j = 0; j < podChildren.length; j++) {
        if (podChildren[j].hasClassName && podChildren[j].hasClassName("progressBarContainer")) {
          progressBarContainer = podChildren[j];
          break;
        }
      }
      if (!progressBarContainer) {
        console.warn("[dtd] show-pods: progressBarContainer not found");
        return;
      }

      var podsLabel = progressBarContainer._childrenList[0];
      if (!podsLabel) {
        console.warn("[dtd] show-pods: pods label element not found");
        return;
      }

      // Remove any previously registered InventoryWeightMessage listener so we
      // don't stack duplicates across multiple open events.
      if (inventoryWeightListener.current) {
        try {
          window.dofus.connectionManager.removeListener(
            "InventoryWeightMessage",
            inventoryWeightListener.current
          );
        } catch (e) { /* noop */ }
      }

      var updatePods = function (msg) {
        try {
          var free = formatNumber(msg.weightMax - msg.weight);
          podsLabel.setText(free + " Pods:");
        } catch (e) {
          console.warn("[dtd] show-pods: setText error", e);
        }
      };

      // Initial display using current inventory state.
      try {
        updatePods({
          weight: window.gui.playerData.inventory.weight,
          weightMax: window.gui.playerData.inventory.maxWeight
        });
      } catch (e) {
        console.warn("[dtd] show-pods: could not read initial inventory weight", e);
      }

      // Live updates.
      inventoryWeightListener.current = updatePods;
      try {
        window.dofus.connectionManager.on("InventoryWeightMessage", updatePods);
      } catch (e) {
        console.warn("[dtd] show-pods: could not attach InventoryWeightMessage listener", e);
      }
    } catch (e) {
      console.error("[dtd] show-pods: show() error", e);
    }
  }

  // -------------------------------------------------------------------------
  // init — called once client globals are confirmed present
  // -------------------------------------------------------------------------

  function init() {
    // Locate the equipment window in the GUI container.
    var equipmentWindow = null;
    try {
      var children = window.gui.windowsContainer.getChildren();
      for (var i = 0; i < children.length; i++) {
        if (children[i].id === "equipment") {
          equipmentWindow = children[i];
          break;
        }
      }
    } catch (e) {
      console.error("[dtd] show-pods: could not access windowsContainer", e);
      return;
    }

    if (!equipmentWindow) {
      console.warn("[dtd] show-pods: equipment window not found in windowsContainer");
      return;
    }

    // A box that holds the current InventoryWeightMessage listener reference so
    // we can remove and replace it each time the window opens.
    var inventoryWeightListener = { current: null };

    // The Lindo source registers on 'open'; if already in openState it calls
    // show() directly, otherwise it waits for the 'opened' event.
    equipmentWindow.on("open", function () {
      try {
        if (equipmentWindow.openState) {
          show(equipmentWindow, inventoryWeightListener);
        } else {
          equipmentWindow.once("opened", function () {
            show(equipmentWindow, inventoryWeightListener);
          });
        }
      } catch (e) {
        console.error("[dtd] show-pods: open handler error", e);
      }
    });

    console.log("[dtd] mod show-pods active");
  }
})();
