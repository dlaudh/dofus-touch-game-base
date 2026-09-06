// rune-lister — Listens for use of a Magic Fragment (forgemagie rune-cracker,
// GID 8378) and reports the rune quantities that changed as a result directly
// into the chat log.  Ported from the reference client's RuneListerMod (TypeScript) to plain
// JS for the Dofus Touch Electron wrapper.
(function () {
  "use strict";

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

  /**
   * Display name for an item, falling back to the GID. The port logged the raw
   * objectGID, so the chat line read "+3 7508" instead of naming the rune; the
   * client exposes the resolved name in more than one shape depending on build,
   * so try each and only fall back to the id when none is present.
   */
  function getItemLabel(uid) {
    var obj = getObjectEntry(uid);
    if (!obj) return null;
    try {
      if (typeof obj.getName === "function") {
        var name = obj.getName();
        if (name) return name;
      }
    } catch (e) { /* fall through */ }
    if (obj.item && typeof obj.item.nameId === "string" && obj.item.nameId) {
      return obj.item.nameId;
    }
    return obj.objectGID != null ? String(obj.objectGID) : null;
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

  var flushTimer = null;

  /** Flush the batch even if InventoryWeightMessage never arrives, so a stalled
   *  batch can't bleed into the next fragment the player cracks. */
  function armFlushTimeout() {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () {
      flushTimer = null;
      if (openedRune) showAllMessages();
    }, 5000);
  }

  function checkMagicFragment(uid) {
    var item = getObjectEntry(uid);
    if (!item) return;
    if (item.objectGID === FRAGMENT_GID) {
      openedRune = true;
      armFlushTimeout();
    }
  }

  function addObjectQuantity(uid, newQuantity) {
    if (!itsARune(uid)) return;
    var delta = newQuantity - getQuantityFromUid(uid);
    if (delta === 0) return; // nothing changed — the client already applied it
    messageItems.push({ label: getItemLabel(uid), quantity: delta });
  }

  function showAllMessages() {
    openedRune = false;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (messageItems.length === 0) {
      messageItems = [];
      return;
    }
    var lines = [];
    messageItems.forEach(function (mi) {
      var sign = mi.quantity > 0 ? "+" : "";
      lines.push(sign + mi.quantity + " " + (mi.label || "?"));
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

  window.__dtdMod.ready({ mod: "rune-lister", need: ["gui", "isoEngine", "dofus"] }, init);
})();
