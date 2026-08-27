// rapid-exchange.js
// Ported from Lindo's RapidExchangeMod (packages/renderer/src/mods/rapid-exchange/).
// Lets the player hold Ctrl (or Cmd on macOS) and double-tap an item slot in the bank
// exchange, storage, or trade windows to instantly move the full stack — bypassing the
// MinMax quantity selector.  Works for: exchangeInventory, exchangeStorage,
// tradeWithPlayerAndNPCInventory, and tradeWithPlayer (common trade window).
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Poll until the client globals are ready, then initialise once.
  // ------------------------------------------------------------------
  var _poll = setInterval(function () {
    try {
      if (window.gui && window.isoEngine && window.dofus) {
        clearInterval(_poll);
        init();
      }
    } catch (e) {
      /* keep polling */
    }
  }, 300);

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var keyPressed = false;

  // ------------------------------------------------------------------
  // Helper: find a window by id inside windowsContainer
  // ------------------------------------------------------------------
  function getWindow(id) {
    try {
      var children = window.gui.windowsContainer.getChildren();
      for (var i = 0; i < children.length; i++) {
        if (children[i].id === id) return children[i];
      }
    } catch (e) { /* noop */ }
    return undefined;
  }

  // ------------------------------------------------------------------
  // Hide the MinMax quantity selector for the given window id
  // ------------------------------------------------------------------
  function hideMinMaxSelector(id) {
    try {
      var win = getWindow(id);
      if (!win) return;

      switch (win.id) {
        case 'exchangeInventory':
        case 'exchangeStorage':
          // These windows expose closeMinMaxSelector() directly
          if (typeof win.closeMinMaxSelector === 'function') {
            win.closeMinMaxSelector();
          }
          break;

        case 'tradeWithPlayerAndNPCInventory':
        case 'tradeWithPlayer': {
          // For these we must scan children for any element whose rootElement
          // carries the class "minMaxSelector" and hide() it.
          var container = win.id === 'tradeWithPlayer' ? win._myTradeSpace : win;
          if (!container) break;
          var list = container._childrenList;
          for (var i in list) {
            if (
              list[i].rootElement &&
              list[i].rootElement.className === 'minMaxSelector'
            ) {
              if (typeof list[i].hide === 'function') list[i].hide();
            }
          }
          break;
        }
      }
    } catch (e) { /* noop */ }
  }

  // ------------------------------------------------------------------
  // Move item: send ExchangeObjectMoveMessage when Ctrl is held and
  // the stack size is > 1.
  //   toStorage = true  → negative quantity (char → bank/remote)
  //   toStorage = false → positive quantity (bank/remote → char)
  // ------------------------------------------------------------------
  function moveItem(itemInstance, inventoryId, toStorage) {
    try {
      if (!itemInstance || itemInstance.quantity <= 1 || !keyPressed) return;
      window.dofus.sendMessage('ExchangeObjectMoveMessage', {
        objectUID: itemInstance.objectUID,
        quantity: toStorage ? -itemInstance.quantity : itemInstance.quantity
      });
      hideMinMaxSelector(inventoryId);
    } catch (e) {
      console.error('[dtd] rapid-exchange moveItem error', e);
    }
  }

  // ------------------------------------------------------------------
  // Keyboard listener: track Ctrl / Cmd state
  // ------------------------------------------------------------------
  function setKeyListener() {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Meta' || e.key === 'Control') keyPressed = true;
    }, true);
    window.addEventListener('keyup', function (e) {
      if (e.key === 'Meta' || e.key === 'Control') keyPressed = false;
    }, true);
  }

  // ------------------------------------------------------------------
  // Attach slot-doubletap listeners on the three inventory windows
  // that are available at exchange open time, and also wire the
  // ExchangeObjectAddedMessage for the common trade (tradeWithPlayer).
  // ------------------------------------------------------------------
  function setInventoryEventListeners() {
    try {
      var children = window.gui.windowsContainer.getChildren();
      children.forEach(function (win) {
        switch (win.id) {
          case 'exchangeInventory':
            win.on('slot-doubletap', function (slot) {
              moveItem(slot.itemInstance, 'exchangeInventory', false);
            });
            break;
          case 'exchangeStorage':
            win.on('slot-doubletap', function (slot) {
              moveItem(slot.itemInstance, 'exchangeStorage', true);
            });
            break;
          case 'tradeWithPlayerAndNPCInventory':
            win.on('slot-doubletap', function (slot) {
              moveItem(slot.itemInstance, 'tradeWithPlayerAndNPCInventory', false);
            });
            break;
        }
      });
    } catch (e) {
      console.error('[dtd] rapid-exchange setInventoryEventListeners error', e);
    }

    // Common player-trade window: items are added dynamically, so we listen
    // for ExchangeObjectAddedMessage and wire a doubletap on each new slot.
    try {
      window.gui.on('ExchangeObjectAddedMessage', function (msg) {
        try {
          // Ignore events from the remote character
          if (msg.remote) return;

          var uid = msg.object.objectUID;
          var quantity = msg.object.quantity;

          var tradeWithPlayer = getWindow('tradeWithPlayer');
          if (!tradeWithPlayer || tradeWithPlayer.id !== 'tradeWithPlayer') return;

          // The slot may not exist in the DOM yet — defer 500 ms (same as Lindo)
          setTimeout(function () {
            try {
              var slot = tradeWithPlayer._myTradeSpace._allSlots.getChild('slot' + uid);
              if (!slot) return;
              slot.on('doubletap', function () {
                moveItem({ objectUID: uid, quantity: quantity }, 'tradeWithPlayer', true);
              });
            } catch (e) {
              console.error('[dtd] rapid-exchange slot wiring error', e);
            }
          }, 500);
        } catch (e) {
          console.error('[dtd] rapid-exchange ExchangeObjectAddedMessage handler error', e);
        }
      });
    } catch (e) {
      console.error('[dtd] rapid-exchange gui.on ExchangeObjectAddedMessage error', e);
    }
  }

  // ------------------------------------------------------------------
  // Entry point
  // ------------------------------------------------------------------
  function init() {
    try {
      setKeyListener();
      setInventoryEventListeners();
      console.log('[dtd] mod rapid-exchange active');
    } catch (e) {
      console.error('[dtd] rapid-exchange init error', e);
    }
  }
})();
