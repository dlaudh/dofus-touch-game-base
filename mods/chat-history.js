// chat-history.js
// Port of the reference client's ChatHistoryMod (packages/renderer/src/mods/general/chat-history.ts).
// Adds ArrowUp / ArrowDown keyboard navigation through the game's built-in
// sent-message history while the chat input field is focused.  The input
// element (.inputChat) is found after the client boots, then a single
// "keydown" listener is attached directly to it — no external libraries needed.
(function () {
  "use strict";

  var _input = null;     // the chat <input> DOM element once found
  var _onKeyDown = null; // reference kept so we can remove it on destroy

  /** The chat input is a DOM element the client builds after boot, so it is a
   *  readiness condition in its own right, not just a global. */
  function findChatInput() {
    var el = window.gui.document
      ? window.gui.document.getElementsByClassName("inputChat")[0]
      : null;
    // Fall back to the page document if the game uses the host document.
    return el || document.getElementsByClassName("inputChat")[0] || null;
  }

  var _cancelWait = window.__dtdMod.ready(
    {
      mod: "chat-history",
      need: ["gui", "isoEngine"],
      until: findChatInput,
      untilLabel: "the .inputChat element"
    },
    function () {
      _input = findChatInput();
      _init();
    }
  );

  function _getHistory() {
    try {
      return window.gui.chat.chatInput.sentMessageHistory;
    } catch (e) {
      return null;
    }
  }

  function _getChatInput() {
    try {
      return window.gui.chat.chatInput.inputChat;
    } catch (e) {
      return null;
    }
  }

  function _init() {
    _onKeyDown = function (event) {
      var key = event.key;
      if (key !== "ArrowUp" && key !== "ArrowDown") return;

      try {
        var history = _getHistory();
        var chatInput = _getChatInput();
        if (!history || !chatInput) return;

        event.preventDefault();
        event.stopPropagation();

        if (key === "ArrowUp") {
          history.goBack();
        } else {
          history.goForward();
        }

        var entry = history.getCurrentEntry();
        if (entry) {
          chatInput.setValue(entry.message);
        }
      } catch (e) {
        console.warn("[dtd] chat-history: error navigating history", e);
      }
    };

    // Attach in the capture phase so we intercept before the game's own
    // handlers (which would otherwise consume ArrowUp/Down for cursor movement).
    _input.addEventListener("keydown", _onKeyDown, true);

    console.log("[dtd] mod chat-history active");
  }

  // Exposed as window.__dtdChatHistory so the host page can call destroy() if
  // it ever needs to tear down the mod (e.g. on game reload).
  window.__dtdChatHistory = {
    destroy: function () {
      _cancelWait();
      if (_input && _onKeyDown) {
        _input.removeEventListener("keydown", _onKeyDown, true);
        _onKeyDown = null;
        _input = null;
      }
    }
  };
})();
