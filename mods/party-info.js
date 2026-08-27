// party-info.js
// Port of the reference client's party-info mod (packages/renderer/src/mods/party-info/).
// Merges party-info.ts + party-member-on-map.ts into a single self-contained IIFE.
//
// PartyInfo:       Injects a small container above the party-member boxes showing the
//                  group's combined level and combined prospecting score, updated live
//                  on every party message from the connection manager.
//
// PartyMemberOnMap: Adds a coloured dot (green = on this map, red = elsewhere) to each
//                   party-member portrait box via injected CSS + a small status div,
//                   updated when actors join/leave the map or the player changes maps.
//
// Both features are always enabled (hardcoded true; no MobX / rootStore needed).
// Uses only client globals: window.gui, window.isoEngine, window.dofus, document.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Boot poll — wait for all required client globals before doing anything.
  // ---------------------------------------------------------------------------
  var POLL_INTERVAL = 300;
  var MAX_ATTEMPTS = 300; // ~90 s

  function isReady() {
    return window.gui && window.isoEngine && window.dofus;
  }

  var attempts = 0;
  function poll() {
    if (isReady()) {
      try {
        initPartyInfo();
        initPartyMemberOnMap();
        console.log("[dtd] mod party-info active");
      } catch (e) {
        console.error("[dtd] party-info init error", e);
      }
    } else {
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL);
      } else {
        console.warn("[dtd] party-info: timed out waiting for client globals");
      }
    }
  }

  poll();

  // ===========================================================================
  // PART 1 — PartyInfo: combined level + prospecting counter
  // ===========================================================================
  function initPartyInfo() {
    // Feature flags — hardcoded enabled (replaces rootStore.optionStore.gameGroup)
    var showGroupLevel = true;
    var showGroupProspecting = true;

    var partyInitialized = false;
    var container = null;

    // ---- helpers -------------------------------------------------------------

    function initializePartyInfo() {
      if (partyInitialized) return;
      var partyBoxes = document.querySelector(".partyBoxes");
      if (!partyBoxes) return;
      var parent = partyBoxes.parentElement;

      container = document.createElement("div");
      container.id = "party-info-container";
      container.setAttribute(
        "style",
        [
          "background: rgba(0, 0, 0, 0.6);",
          "margin: 2px;",
          "border-radius: 5px;",
          "margin-bottom: 5px;",
          "padding: 3px;",
          "font-weight: bolder;",
          "color: #ced0bb;",
          "font-family: berlin_sans_fb_demibold;",
          "box-shadow: 0 2px 10px rgba(0, 0, 0, 1) inset;",
        ].join(" ")
      );

      if (showGroupLevel) {
        var partyLevelElement = document.createElement("div");
        partyLevelElement.textContent = "Lvl ?";
        partyLevelElement.id = "party-level";
        partyLevelElement.setAttribute(
          "style",
          "font-size: 13px; user-select: none; cursor: default;"
        );
        container.appendChild(partyLevelElement);
      }

      if (showGroupProspecting) {
        var prospectionContainerElement = document.createElement("div");
        var prospectionImageElement = document.createElement("img");
        var prospectionTextElement = document.createElement("span");

        prospectionImageElement.src = "./assets/ui/icons/prospecting.png";
        prospectionImageElement.setAttribute(
          "style",
          "height: 1em; vertical-align: middle;"
        );
        prospectionContainerElement.appendChild(prospectionImageElement);
        prospectionContainerElement.setAttribute(
          "style",
          "font-size: 13px; user-select: none; cursor: default;"
        );

        prospectionTextElement.textContent = " ?";
        prospectionTextElement.id = "party-pr";
        prospectionTextElement.setAttribute(
          "style",
          "vertical-align: middle;"
        );

        prospectionContainerElement.appendChild(prospectionTextElement);
        container.appendChild(prospectionContainerElement);
      }

      parent.insertBefore(container, partyBoxes);
      partyInitialized = true;
    }

    function updatePartyInfo() {
      if (!partyInitialized) {
        initializePartyInfo();
      }
      try {
        var partyLevel = 0;
        var prospecting = 0;
        var currentParty = window.gui.party.currentParty;
        if (currentParty && currentParty._childrenList.length > 0) {
          currentParty._childrenList.forEach(function (c) {
            partyLevel += c.memberData.level;
            prospecting += c.memberData.prospecting;
          });
          if (showGroupLevel) {
            var levelEl = document.querySelector("#party-level");
            if (levelEl) {
              levelEl.textContent = "Lvl " + (isNaN(partyLevel) ? "?" : partyLevel);
            }
          }
          if (showGroupProspecting) {
            var prEl = document.querySelector("#party-pr");
            if (prEl) {
              prEl.textContent = " " + (isNaN(prospecting) ? "?" : prospecting);
            }
          }
        }
      } catch (e) {
        // silent — mirrors original try/catch
      }
    }

    // ---- event wiring --------------------------------------------------------

    var cm = window.dofus.connectionManager;

    // Initial read after a short delay (mirrors original setTimeout 100 ms)
    setTimeout(updatePartyInfo, 100);

    var partyEvents = [
      "PartyJoinMessage",
      "PartyUpdateMessage",
      "PartyMemberEjectedMessage",
      "PartyMemberRemoveMessage",
      "PartyNewMemberMessage",
      "PartyNewGuestMessage",
      "PartyLeaderUpdateMessage",
    ];
    partyEvents.forEach(function (evt) {
      cm.on(evt, updatePartyInfo);
    });
  }

  // ===========================================================================
  // PART 2 — PartyMemberOnMap: on-map / off-map status dot on each member box
  // ===========================================================================
  function initPartyMemberOnMap() {
    // Inject CSS
    var pmomCss = document.createElement("style");
    pmomCss.id = "pmomCss";
    pmomCss.innerHTML = [
      ".pmomStatus {",
      "    width: 15px;",
      "    height: 30px;",
      "    position: absolute;",
      "    bottom: -6px;",
      "    right: 12px;",
      "}",
      ".pmomOnMap {",
      "    background: url(./assets/ui/server/state_3.png);",
      "    background-position: center;",
      "}",
      ".pmomNotInMap {",
      "    background: url(./assets/ui/server/state_1.png);",
      "    background-position: center;",
      "}",
    ].join("\n");
    document.getElementsByTagName("head")[0].appendChild(pmomCss);

    // members: Map<playerId, isOnMap (bool)>
    var members = new Map();

    // ---- helpers -------------------------------------------------------------

    function addStatusToMember(divMember, memberStatus) {
      if (divMember == null) return;
      var className = memberStatus ? "pmomOnMap" : "pmomNotInMap";
      var divStatus = divMember.lastElementChild;
      if (divStatus && divStatus.classList.contains("pmomStatus")) {
        // Replace second class (the on/off class) in place
        var current = divStatus.classList.item(1);
        if (current) divStatus.classList.replace(current, className);
        else divStatus.classList.add(className);
      } else {
        divStatus = document.createElement("div");
        divStatus.className = "pmomStatus";
        divStatus.classList.add(className);
        divMember.appendChild(divStatus);
      }
    }

    function updateDOM() {
      var i = 0;
      members.forEach(function (status, memberId) {
        if (memberId !== window.isoEngine.actorManager.userId) {
          var memberEls = document.getElementsByClassName("member");
          var divMember = memberEls[i];
          addStatusToMember(divMember, status);
        }
        i++;
      });
    }

    function updatePartyMembers() {
      var oldMembers = new Map(members);
      members.clear();

      var currentParty = window.gui.party.currentParty;
      if (currentParty && currentParty._childrenList.length > 0) {
        var mapId = window.isoEngine.mapRenderer.mapId;
        currentParty._childrenList.forEach(function (m) {
          var isOnMap = mapId === m.memberData.mapId;
          if (oldMembers.has(m.memberData.id)) {
            isOnMap = !!oldMembers.get(m.memberData.id);
          }
          members.set(m.memberData.id, isOnMap);
        });
        updateDOM();
      }
    }

    // actor joined or left map
    function updateMember(data, isOnMap) {
      var currentParty = window.gui.party.currentParty;
      if (currentParty && currentParty._childrenList.length > 0) {
        var playerId = isOnMap ? data.informations.contextualId : data.id;
        if (members.has(playerId)) {
          members.set(playerId, isOnMap);
        }
        updateDOM();
      }
    }

    // player changed map
    function updateMemberOnMapChange(data) {
      var currentParty = window.gui.party.currentParty;
      if (currentParty && currentParty._childrenList.length > 0) {
        var actorsId = [];
        data.actors.forEach(function (actor) {
          if (actor.contextualId > 0) actorsId.push(actor.contextualId);
        });
        members.forEach(function (status, member) {
          members.set(member, actorsId.indexOf(member) !== -1);
        });
        updateDOM();
      }
    }

    // ---- event wiring --------------------------------------------------------

    var cm = window.dofus.connectionManager;

    var partyEvents = [
      "PartyJoinMessage",
      "PartyUpdateMessage",
      "PartyMemberEjectedMessage",
      "PartyMemberRemoveMessage",
      "PartyNewMemberMessage",
    ];
    partyEvents.forEach(function (evt) {
      cm.on(evt, updatePartyMembers);
    });

    cm.on("GameRolePlayShowActorMessage", function (e) {
      updateMember(e, true);
    });
    cm.on("GameContextRemoveElementMessage", function (e) {
      updateMember(e, false);
    });
    cm.on("MapComplementaryInformationsDataMessage", function (e) {
      updateMemberOnMapChange(e);
    });

    // Seed with current party state if already in a group when the mod loads.
    updatePartyMembers();
  }
})();
