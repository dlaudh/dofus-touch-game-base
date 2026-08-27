// chat-history.js
// Port of Lindo's ChatHistoryMod (packages/renderer/src/mods/general/chat-history.ts).
// Adds ArrowUp / ArrowDown keyboard navigation through the game's built-in
// sent-message history while the chat input field is focused.  The input
// element (.inputChat) is found after the client boots, then a single
// "keydown" listener is attached directly to it — no external libraries needed.
(function () {
  "use strict";

  var POLL_INTERVAL = 250; // ms between readiness checks
  var _input = null;       // the chat <input> DOM element once found
  var _onKeyDown = null;   // reference kept so we can remove it on destroy

  // Poll until the game GUI and the chat-input element are available.
  var _pollTimer = setInterval(function () {
    try {
      if (!window.gui || !window.isoEngine) return;
      var el = window.gui.document
        ? window.gui.document.getElementsByClassName("inputChat")[0]
        : null;
      // Fall back to the page document if the game uses the host document.
      if (!el) {
        el = document.getElementsByClassName("inputChat")[0] || null;
      }
      if (!el) return;

      clearInterval(_pollTimer);
      _pollTimer = null;
      _input = el;
      _init();
    } catch (e) {
      // Not ready yet — ignore and retry.
    }
  }, POLL_INTERVAL);

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
      if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
      if (_input && _onKeyDown) {
        _input.removeEventListener("keydown", _onKeyDown, true);
        _onKeyDown = null;
        _input = null;
      }
    }
  };
})();
