// show-resources.js
// Faithful port of Lindo's show-resources mod (packages/renderer/src/mods/show-resources/).
// Merges resources.ts + show-resources.ts into a single self-contained IIFE.
// Scans the current map for harvestable interactive elements (trees, ore, fish, plants,
// wheat fields, etc.) and shows a centered HUD bar at the top of the screen listing
// each resource type with its icon, name, and an available/total count (e.g. "3/5").
// Updates counts in real-time as resources are harvested or refresh.
// No external dependencies — uses only client globals (window.gui, window.isoEngine,
// window.dofus, window.foreground, document).
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Poll until client globals are ready, then init
  // ---------------------------------------------------------------------------
  var POLL_INTERVAL = 300;
  var MAX_ATTEMPTS = 300; // ~90 s

  function isReady() {
    return window.gui && window.isoEngine && window.dofus && window.foreground;
  }

  var attempts = 0;
  function poll() {
    if (isReady()) {
      init();
    } else {
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL);
      } else {
        console.warn("[dtd] show-resources: timed out waiting for client globals");
      }
    }
  }
  poll();

  // ---------------------------------------------------------------------------
  // State enum (mirrors resources.ts)
  // ---------------------------------------------------------------------------
  var State = { canUse: 0, cantUse: 1, inUse: 2 };

  // ---------------------------------------------------------------------------
  // iconIdByTypeId — Ankama CDN icon IDs keyed by interactive-element typeId
  // ---------------------------------------------------------------------------
  var ICON_CDN = "https://dofustouch.cdn.ankama.com/assets/2.34.8_kbu_6h45kmUJaqYJSzE(uwaos..pYYKs/gfx/items/";

  var iconIdByTypeId = {
    // General
    84:  "15026",   // eau
    146: "89002",   // paquet cadeau
    // Paysan
    38:  "34009",   // blé
    39:  "34080",   // houblon
    42:  ["34122", "35117"],  // lin (paysan / alchimiste)
    43:  "34082",   // orge
    44:  "34082",   // seigle
    45:  "34154",   // avoine
    46:  ["34121", "35156"],  // chanvre (paysan / alchimiste)
    47:  "34083",   // malt
    111: "34010",   // riz
    134: "34552",   // frostiz
    // Bucheron
    1:   "38017",   // frêne
    8:   "38092",   // chêne
    28:  "38094",   // if
    29:  "38073",   // ebène
    30:  "38140",   // orme
    31:  "38153",   // erable
    32:  "38138",   // charme
    33:  "38086",   // châtaignier
    34:  "38095",   // noyer
    35:  "38139",   // merisier
    98:  "38482",   // bombu
    101: "38481",   // oliviolet
    108: "38673",   // bambou
    109: "38672",   // bambou sombre
    110: "38671",   // bambou sacré
    121: "38001",   // kaliptus
    133: "38677",   // trembe
    // Alchimiste
    61:  "35191",   // edelweiss
    66:  "36052",   // menthe sauvages
    67:  "36067",   // trèfle à 5 feuilles
    68:  "35192",   // orchidée freyesque
    112: "58067",   // pandouille
    131: "35635",   // perce-neige
    // Mineur
    17:  "39024",   // fer
    24:  "39028",   // argent
    25:  "39022",   // or
    26:  "39076",   // pierre de beauxite
    37:  "39077",   // pierre de kobalte
    52:  "39078",   // etain
    53:  "39108",   // pierre cuivrée
    54:  "39397",   // manganèse
    55:  "39109",   // bronze
    113: "39110",   // dolomite
    114: "39111",   // silicate
    135: "39112",   // obsidienne
    // Pêcheur
    71:  ["41292", "41273", "41269"],         // petits poissons (mer)
    74:  ["41394", "41277", "41305", "41400"],// poissons (rivière)
    75:  ["41294", "41394", "41277"],         // petits poissons (rivière)
    76:  ["41277", "41305", "41400", "41290"],// gros poissons (rivière)
    77:  ["41273", "41269", "41309", "41317"],// poissons (mer)
    78:  ["41269", "41317", "41309", "41296"],// gros poissons (mer)
    79:  ["41400", "41305", "41290", "41313"],// poissons géants (rivière)
    80:  "41395",   // truite vaseuse
    81:  ["41317", "41309", "41296", "41322"],// poissons géants (mer)
    132: ["41403", "41271"],                  // poissons de Frigost
    225: "170877"   // piraniak
  };

  var ressourcesToSkip = [
    -1, 2, 11, 12, 13, 15, 16, 22, 27, 40, 41, 48, 49, 50, 56, 57, 58, 60, 62, 63,
    64, 65, 69, 70, 72, 73, 82, 83, 85, 86, 88, 90, 92, 93, 94, 95, 96, 97, 99, 100,
    102, 103, 105, 106, 107, 115, 116, 117, 118, 119, 120, 122, 127, 128, 129, 136, 137,
    138, 139, 140, 141, 142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 153, 154, 155,
    156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172,
    173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189,
    190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206,
    207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224
  ];

  // ---------------------------------------------------------------------------
  // Resources — tracks instances of a single resource type on the current map
  // ---------------------------------------------------------------------------

  function Resources(resource) {
    this.name = resource.name;
    this.typeId = resource.elementTypeId;
    this._items = []; // [{ elemId, state }]
    this.addOrUpdateResource(resource);
  }

  Resources.prototype.addOrUpdateResource = function (resource) {
    var ref = null;
    for (var i = 0; i < this._items.length; i++) {
      if (this._items[i].elemId === resource.elementId) {
        ref = this._items[i];
        break;
      }
    }
    if (ref) {
      ref.state = resource.elementState;
    } else {
      this._items.push({ elemId: resource.elementId, state: resource.elementState });
    }
  };

  Resources.prototype.getTotalCount = function () {
    return this._items.length;
  };

  Resources.prototype.getCountOfRessourcesCanBeUsed = function () {
    var count = 0;
    for (var i = 0; i < this._items.length; i++) {
      if (this._items[i].state === State.canUse) count++;
    }
    return count;
  };

  Resources.prototype.getCount = function () {
    return this.getCountOfRessourcesCanBeUsed() + "/" + this.getTotalCount();
  };

  Resources.prototype.getIcons = function () {
    var iconId = iconIdByTypeId[this.typeId];
    var result = [];
    if (iconId === undefined) {
      result.push("./assets/ui/icons/fail.png");
    } else if (typeof iconId === "string") {
      result.push(ICON_CDN + iconId + ".png");
    } else {
      for (var i = 0; i < iconId.length; i++) {
        result.push(ICON_CDN + iconId[i] + ".png");
      }
    }
    return result;
  };

  // ---------------------------------------------------------------------------
  // ShowResourcesMod — orchestrates data, events, and DOM
  // ---------------------------------------------------------------------------

  function ShowResourcesMod() {
    this._data = {};           // { [typeId]: Resources }
    this._elemIdToTypeId = {}; // { [elemId]: typeId }
    this._resourcesBox = null;
    this._enabled = true;
    this._isFighting = false;
    this._listeners = [];      // [{ emitter, event, fn }]
    this._loadDataTry = 0;
  }

  ShowResourcesMod.prototype._on = function (emitter, event, fn) {
    try {
      emitter.on(event, fn);
      this._listeners.push({ emitter: emitter, event: event, fn: fn });
    } catch (e) {
      console.warn("[dtd] show-resources: could not attach listener for", event, e);
    }
  };

  ShowResourcesMod.prototype._injectStyle = function () {
    if (document.getElementById("resourcesBoxCss")) return;
    var style = document.createElement("style");
    style.id = "resourcesBoxCss";
    style.innerHTML =
      "#resourcesBox {" +
      "  display: flex;" +
      "  flex-direction: row;" +
      "  align-items: flex-end;" +
      "  position: absolute;" +
      "  top: 0;" +
      "  border-top: none;" +
      "  border-radius: 0 0 5px 5px;" +
      "  padding: 4px 0px;" +
      "  background: rgba(120, 120, 120, 0.25);" +
      "  box-shadow: #505050 1px 1px 2px;" +
      "}" +
      ".resource-item {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  align-items: center;" +
      "  padding: 0 5px;" +
      "  margin: 0 5px;" +
      "  border-radius: 4px;" +
      "  background-color: #00000033;" +
      "}" +
      ".resource-item p {" +
      "  margin: 0;" +
      "}" +
      ".resource-item img {" +
      "  width: 32px;" +
      "}";
    document.head.appendChild(style);
  };

  ShowResourcesMod.prototype._onMapComplementaryInfos = function (interactiveElements, statedElements) {
    this._clearData();

    // Build stateId -> state lookup
    var statedMap = {};
    for (var si = 0; si < statedElements.length; si++) {
      statedMap[statedElements[si].elementId] = statedElements[si].elementState;
    }

    for (var ii = 0; ii < interactiveElements.length; ii++) {
      var el = interactiveElements[ii];
      var r = {
        elementId: el.elementId,
        elementTypeId: el.elementTypeId,
        name: el._name,
        elementState: statedMap[el.elementId]
      };

      if (ressourcesToSkip.indexOf(r.elementTypeId) === -1) {
        if (this._data[r.elementTypeId]) {
          this._data[r.elementTypeId].addOrUpdateResource(r);
        } else {
          this._data[r.elementTypeId] = new Resources(r);
          if (iconIdByTypeId[r.elementTypeId] === undefined) {
            console.warn('[dtd] show-resources: unknown resource "' + r.name + '" typeId=' + r.elementTypeId);
          }
        }
      }

      this._elemIdToTypeId[el.elementId] = el.elementTypeId;
    }

    if (this._enabled) this._createDom();
  };

  ShowResourcesMod.prototype._onStatedElementUpdated = function (statedElement) {
    var self = this;
    setTimeout(function () {
      var typeId = self._elemIdToTypeId[statedElement.elementId];
      if (typeId === undefined) return;

      try {
        self._data[typeId].addOrUpdateResource({
          elementId: statedElement.elementId,
          elementTypeId: typeId,
          elementState: statedElement.elementState,
          name: ""
        });
      } catch (e) {
        console.error("[dtd] show-resources: unable to update resource typeId=" + typeId, e);
      }

      if (self._enabled && !self._isFighting) {
        self._updateCountInDom(typeId);
      }
    }, 500);
  };

  ShowResourcesMod.prototype._updateCountInDom = function (typeId) {
    try {
      var el = document.getElementById("sr_" + typeId + "_count");
      if (el && this._data[typeId]) {
        el.innerText = this._data[typeId].getCount();
      }
    } catch (e) {
      console.warn("[dtd] show-resources: DOM update error for typeId=" + typeId, e);
    }
  };

  ShowResourcesMod.prototype._createDom = function () {
    this._removeDom();

    var box = document.createElement("div");
    box.id = "resourcesBox";

    var typeIds = Object.keys(this._data);
    for (var i = 0; i < typeIds.length; i++) {
      var resource = this._data[typeIds[i]];
      var icons = resource.getIcons();
      var iconHtml = "";
      for (var j = 0; j < icons.length; j++) {
        iconHtml += '<img src="' + icons[j] + '" alt=""/>';
      }
      var itemHtml =
        '<div class="resource-item">' +
        "  <div>" + iconHtml + "</div>" +
        "  <p>" + resource.name + "</p>" +
        '  <p id="sr_' + resource.typeId + '_count">' + resource.getCount() + "</p>" +
        "</div>";
      box.insertAdjacentHTML("beforeend", itemHtml);
    }

    if (box.innerHTML !== "") {
      try {
        window.foreground.rootElement.appendChild(box);
        var boxWidth = box.offsetWidth / 2;
        box.style.left = "calc(50% - " + boxWidth + "px)";
        this._resourcesBox = box;
      } catch (e) {
        console.warn("[dtd] show-resources: could not append resourcesBox", e);
      }
    }
  };

  ShowResourcesMod.prototype._removeDom = function () {
    if (this._resourcesBox && this._resourcesBox.parentElement) {
      this._resourcesBox.parentElement.removeChild(this._resourcesBox);
    }
    // Also clean up any leftover by id (guards against duplicate injection)
    try {
      var old = document.getElementById("resourcesBox");
      if (old) old.remove();
    } catch (e) { /* noop */ }
    this._resourcesBox = null;
  };

  ShowResourcesMod.prototype._clearData = function () {
    this._data = {};
    this._removeDom();
  };

  ShowResourcesMod.prototype._toggle = function () {
    this._enabled = !this._enabled;
    if (!this._enabled) {
      this._removeDom();
    } else {
      this._createDom();
    }
  };

  ShowResourcesMod.prototype._loadMapInfoOnStart = function () {
    var interactives, stated;
    try {
      interactives = window.isoEngine.mapRenderer.interactiveElements;
      stated = window.isoEngine.mapRenderer.statedElements;
    } catch (e) {
      interactives = null;
      stated = null;
    }

    if (interactives != null && stated != null) {
      var interactiveArr = [];
      var statedArr = [];
      for (var k in interactives) {
        if (Object.prototype.hasOwnProperty.call(interactives, k)) interactiveArr.push(interactives[k]);
      }
      for (var s in stated) {
        if (Object.prototype.hasOwnProperty.call(stated, s)) statedArr.push(stated[s]);
      }
      this._loadDataTry = 0;
      this._onMapComplementaryInfos(interactiveArr, statedArr);
    } else if (this._loadDataTry < 15) {
      var self = this;
      this._loadDataTry++;
      setTimeout(function () { self._loadMapInfoOnStart(); }, 100);
    } else {
      this._loadDataTry = 0;
    }
  };

  ShowResourcesMod.prototype._listenEvents = function () {
    var self = this;

    this._on(window.dofus.connectionManager, "MapComplementaryInformationsDataMessage", function (e) {
      self._onMapComplementaryInfos(e.interactiveElements, e.statedElements);
    });

    this._on(window.dofus.connectionManager, "StatedElementUpdatedMessage", function (e) {
      self._onStatedElementUpdated(e.statedElement);
    });

    this._on(window.dofus.connectionManager, "GameFightStartingMessage", function () {
      if (self._enabled) {
        self._isFighting = true;
        self._clearData();
      }
    });

    var onFightEnd = function () {
      if (self._enabled) {
        self._isFighting = false;
        self._createDom();
      }
    };
    this._on(window.dofus.connectionManager, "GameFightLeaveMessage", onFightEnd);
    this._on(window.dofus.connectionManager, "GameFightEndMessage", onFightEnd);
  };

  ShowResourcesMod.prototype.start = function () {
    this._injectStyle();
    this._listenEvents();
    var self = this;
    setTimeout(function () { self._loadMapInfoOnStart(); }, 100);
  };

  // ---------------------------------------------------------------------------
  // init — called once client globals are confirmed present
  // ---------------------------------------------------------------------------

  function init() {
    var mod = new ShowResourcesMod();
    mod.start();
    console.log("[dtd] mod show-resources active");
  }
})();
