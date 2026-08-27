// rune-lister — Listens for use of a Magic Fragment (forgemagie rune-cracker,
// GID 8378) and reports the rune quantities that changed as a result directly
// into the chat log.  Ported from Lindo's RuneListerMod (TypeScript) to plain
// JS for the Dofus Touch Electron wrapper.
(function () {
  "use strict";

  var POLL_INTERVAL = 300;
  var FRAGMENT_GID = 8378;
  var RUNE_TYPE_ID = 78;

  var openedRune = false;
  var messageItems = []; // Array of { name: gid, quantity: delta }

  // ---- inventory helpers ----------------------------------------------------

  function getObjectEntry(uid) {
    try {
      return window.gui.playerData.inventory.objects[uid] || null;
    } catch (e) {
      return null;
    }
  }

  function getGidFromUid(uid) {
    var obj = getObjectEntry(uid);
    return obj ? obj.objectGID : null;
  }

  function getQuantityFromUid(uid) {
    var obj = getObjectEntry(uid);
    return obj ? obj.quantity : 0;
  }

  function itsARune(uid) {
    try {
      var obj = getObjectEntry(uid);
      return obj && obj.item && obj.item.type && obj.item.type.id === RUNE_TYPE_ID;
    } catch (e) {
      return false;
    }
  }

  // ---- core logic -----------------------------------------------------------

  function checkMagicFragment(uid) {
    var item = getObjectEntry(uid);
    if (!item) return;
    if (item.objectGID === FRAGMENT_GID) openedRune = true;
  }

  function addObjectQuantity(uid, newQuantity) {
    if (!itsARune(uid)) return;
    var gid = getGidFromUid(uid);
    var delta = newQuantity - getQuantityFromUid(uid);
    messageItems.push({ name: gid, quantity: delta });
  }

  function showAllMessages() {
    openedRune = false;
    if (messageItems.length === 0) {
      messageItems = [];
      return;
    }
    var lines = [];
    messageItems.forEach(function (mi) {
      lines.push("+" + mi.quantity + " " + mi.name);
    });
    try {
      window.gui.chat.logMsg(lines.join("\n"));
    } catch (e) {
      console.warn("[dtd] rune-lister: could not log to chat", e);
    }
    messageItems = [];
  }

  // ---- event handlers -------------------------------------------------------

  function onSendMessage(msg) {
    try {
      if (!msg || !msg.data || !msg.data.data) return;
      if (msg.data.data.type !== "ObjectUseMessage") return;
      var uid = msg.data.data.data.objectUID;
      checkMagicFragment(uid);
    } catch (e) {
      /* noop */
    }
  }

  function onReceiveMessage(msg) {
    try {
      if (!openedRune) return;
      if (msg._messageType === "ObjectQuantityMessage") {
        addObjectQuantity(msg.objectUID, msg.quantity);
      } else if (msg._messageType === "InventoryWeightMessage") {
        showAllMessages();
      } else if (msg._messageType === "ObjectUseMessage") {
        checkMagicFragment(msg.objectUID);
      }
    } catch (e) {
      /* noop */
    }
  }

  // ---- init -----------------------------------------------------------------

  function init() {
    try {
      window.dofus.connectionManager.on("send", onSendMessage);
      window.dofus.connectionManager.on("data", onReceiveMessage);
      console.log("[dtd] mod rune-lister active");
    } catch (e) {
      console.error("[dtd] rune-lister: init failed", e);
    }
  }

  var _poll = setInterval(function () {
    if (window.gui && window.isoEngine && window.dofus) {
      clearInterval(_poll);
      init();
    }
  }, POLL_INTERVAL);
})();
