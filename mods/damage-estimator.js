// damage-estimator.js
// Faithful port of Lindo's damage-estimator mod (packages/renderer/src/mods/damage-estimator/).
// Shows estimated spell damage (normal + critical) as floating overlays on each enemy fighter
// during combat, hooked via window.gui (spellSlotSelected / spellSlotDeselected events) and
// window.isoEngine (cell coordinate conversion). No external dependencies.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Spell effect colour map (keyed by effectId)
  // ---------------------------------------------------------------------------
  var SpellColor = {
    5:    "#ba87dd", // Push damage
    91:   "#668cff", // Water life steal
    92:   "#cc8800", // Earth life steal
    93:   "#00e68a", // Air life steal
    94:   "#ff5c33", // Fire life steal
    96:   "#668cff", // Water damage
    97:   "#cc8800", // Earth damage
    98:   "#00e68a", // Air damage
    99:   "#ff5c33", // Fire damage
    108:  "#cc0080", // Heals
    1109: "#cc0080"  // Percent heal
  };

  var ESTIMATOR_CONTAINER_ID = "estimatorContainer";

  // Valid effect IDs this estimator handles
  var VALID_EFFECT_IDS = [96, 91, 100, 97, 92, 98, 93, 99, 94, 82, 108, 1109, 672];

  // ---------------------------------------------------------------------------
  // Estimator — one per fighter on screen
  // ---------------------------------------------------------------------------
  function Estimator(actor, spell) {
    this.actorId = actor.id;
    this.spell   = spell;

    var existing = document.getElementById(ESTIMATOR_CONTAINER_ID + this.actorId);
    this.estimatorContainer = existing || document.createElement("div");
    this.estimatorContainer.id = ESTIMATOR_CONTAINER_ID + this.actorId;

    this._createEstimator();
  }

  Estimator.prototype._getActor = function () {
    return window.gui.fightManager.getFighter(this.actorId);
  };

  Estimator.prototype._getUserActor = function () {
    return window.gui.fightManager.getFighter(window.gui.playerData.id);
  };

  Estimator.prototype._isActorVisible = function (actor) {
    for (var key in actor.buffs) {
      if (actor.buffs[key].effect.effectId === 150) return false; // invisible buff
    }
    return true;
  };

  Estimator.prototype._isActorInvincible = function (actor) {
    for (var i = 0; i < actor.buffs.length; i++) {
      // Dérobade, Corruption, Puissance Sylvestre
      if ([444, 4694, 197].indexOf(actor.buffs[i].castingSpell.spell.id) !== -1) return true;
    }
    return false;
  };

  Estimator.prototype._isActorBuff = function (actor, spellId) {
    for (var i = 0; i < actor.buffs.length; i++) {
      if (actor.buffs[i].castingSpell.spell.id === spellId) return true;
    }
    return false;
  };

  Estimator.prototype._isValidEffectId = function (id) {
    return VALID_EFFECT_IDS.indexOf(id) !== -1;
  };

  Estimator.prototype._getCharacterStat = function (key) {
    return window.gui.playerData.characters.mainCharacter.characteristics[key].getTotalStat();
  };

  Estimator.prototype._getCharacterBaseStat = function (key) {
    return Math.max(0, this._getCharacterStat(key));
  };

  Estimator.prototype._getElementResistPercent = function (actor, key) {
    return (!actor.isCreature && actor.data.stats[key] > 50) ? 50 : actor.data.stats[key];
  };

  Estimator.prototype._isCellIdNextToMe = function (actorCellId) {
    var self       = this._getUserActor();
    var currentCellId = self.data.disposition.cellId;
    var actorPos   = window.isoEngine.mapRenderer.grid.getCoordinateGridFromCellId(actorCellId);
    var currentPos = window.isoEngine.mapRenderer.grid.getCoordinateGridFromCellId(currentCellId);
    var neighbours = [
      [currentPos.i,     currentPos.j + 1],
      [currentPos.i,     currentPos.j - 1],
      [currentPos.i + 1, currentPos.j    ],
      [currentPos.i - 1, currentPos.j    ],
      [currentPos.i + 1, currentPos.j + 1],
      [currentPos.i - 1, currentPos.j - 1],
      [currentPos.i + 1, currentPos.j - 1],
      [currentPos.i - 1, currentPos.j + 1]
    ];
    for (var i = 0; i < neighbours.length; i++) {
      if (actorPos.i === neighbours[i][0] && actorPos.j === neighbours[i][1]) return true;
    }
    return false;
  };

  Estimator.prototype._getSpellDamageModifier = function (actor) {
    var damageMultiplicator      = 1;
    var baseSpellDamageModifier  = 0;
    var fixedDamageModifier      = 0;
    var baseStatModifier         = 0;
    var self                     = this._getUserActor();
    var spell                    = this.spell;

    for (var i = 0; i < self.buffs.length; i++) {
      var buff   = self.buffs[i];
      var spellId = buff.castingSpell.spell.id;
      switch (spellId) {
        case 159: // Colère de Iop
        case 146: // Epée du destin
        case 167: // Flèche d'Expiation
        case 171: // Flèche Punitive
          if (spell.id === spellId && !buff.effect.trigger) {
            if (buff.stack != null) {
              for (var s = 0; s < buff.stack.length; s++) {
                baseSpellDamageModifier += buff.stack[s].effect.value;
              }
            } else {
              baseSpellDamageModifier += buff.effect.value;
            }
          }
          break;
        case 166: // Powerful Shooting
          if (!spell.isItem) baseStatModifier += buff.effect.diceNum;
          break;
        case 3506: // Maîtrise d'Arme
          if (spell.isItem) baseStatModifier += buff.effect.diceNum;
          break;
      }
    }

    for (var j = 0; j < actor.buffs.length; j++) {
      var abuff = actor.buffs[j];
      if (abuff.effect.effect.characteristic !== 16) continue;
      var aSpellId = abuff.castingSpell.spell.id;
      switch (aSpellId) {
        case 7:    // Bouclier Féca
        case 2031: // Bouclier Féca du doepul
        case 1503: // Glyphe Agressif
        case 1504: // Glyphe Agressif
        case 2037: // Glyphe Agressif du dopeul
        case 4511: // Glyphe Agressif
        case 4696: // Glyphe Agressif
        case 4684: // Flèche Analgésique
          damageMultiplicator *= abuff.effect.diceNum / 100;
          break;
        case 4:    // Barricade
        case 2030: // Barricade du dopeul
          if (this._isCellIdNextToMe(actor.data.disposition.cellId)) {
            fixedDamageModifier -= abuff.effect.diceNum;
          }
          break;
        case 20:   // Bastion
        case 2039: // Bastion du dopeul
          if (!this._isCellIdNextToMe(actor.data.disposition.cellId)) {
            fixedDamageModifier -= abuff.effect.diceNum;
          }
          break;
        case 4690: // Chance d'Ecaflip
          damageMultiplicator *= (abuff.duration === 1) ? 1.5 : 0.5;
          break;
        case 6:    // Rempart
        case 4698: // Rempart
        case 5:    // Trêve
        case 127:  // Mot de prévention
        case 2093: { // Mot de prévention du doepul
          var caster = window.gui.fightManager.getFighter(abuff.source);
          fixedDamageModifier -= (abuff.effect.value * (100 + 5 * caster.level)) / 100;
          break;
        }
        default:
          break;
      }
    }
    return [baseStatModifier, baseSpellDamageModifier, fixedDamageModifier, damageMultiplicator];
  };

  Estimator.prototype._computeSpellEstimation = function (
    baseSpellDamage, isCritical,
    baseStat, fixDamages, spellDamageModifier,
    fixResistances, criticalDamageFixedResist, percentResistances
  ) {
    var baseStatModifier         = spellDamageModifier[0];
    var baseSpellDamageModifier  = spellDamageModifier[1];
    var fixedDamageModifier      = spellDamageModifier[2];
    var damageMultiplicator      = spellDamageModifier[3];
    var power = this._getCharacterStat("damagesBonusPercent");
    var possibleDamages =
      ((power * 0.8 + baseStatModifier + baseStat + 100) / 100) *
      (baseSpellDamage + baseSpellDamageModifier) +
      this._getCharacterStat("allDamagesBonus") +
      fixDamages;

    if (isCritical) {
      possibleDamages += this._getCharacterStat("criticalDamageBonus") - criticalDamageFixedResist;
    }
    return Math.trunc(
      ((possibleDamages - fixResistances + fixedDamageModifier) *
        damageMultiplicator *
        (100 - percentResistances)) /
        100
    );
  };

  Estimator.prototype._getSpellEstimation = function (effectId, actor, spellDice, isCritical) {
    isCritical = isCritical || false;
    var mod = this._getSpellDamageModifier(actor);

    switch (effectId) {
      case 96:  // Water damage
      case 91:  // Water life steal
        return this._computeSpellEstimation(
          spellDice, isCritical,
          this._getCharacterBaseStat("chance"),
          this._getCharacterStat("waterDamageBonus"), mod,
          actor.data.stats.waterElementReduction,
          actor.data.stats.criticalDamageFixedResist,
          this._getElementResistPercent(actor, "waterElementResistPercent")
        );
      case 100: // Neutral damage
        return this._computeSpellEstimation(
          spellDice, isCritical,
          this._getCharacterBaseStat("strength"),
          this._getCharacterStat("neutralDamageBonus"), mod,
          actor.data.stats.neutralElementReduction,
          actor.data.stats.criticalDamageFixedResist,
          this._getElementResistPercent(actor, "neutralElementResistPercent")
        );
      case 97:  // Earth damage
      case 92:  // Earth life steal
        return this._computeSpellEstimation(
          spellDice, isCritical,
          this._getCharacterBaseStat("strength"),
          this._getCharacterStat("earthDamageBonus"), mod,
          actor.data.stats.earthElementReduction,
          actor.data.stats.criticalDamageFixedResist,
          this._getElementResistPercent(actor, "earthElementResistPercent")
        );
      case 98:  // Air damage
      case 93:  // Air life steal
        return this._computeSpellEstimation(
          spellDice, isCritical,
          this._getCharacterBaseStat("agility"),
          this._getCharacterStat("airDamageBonus"), mod,
          actor.data.stats.airElementReduction,
          actor.data.stats.criticalDamageFixedResist,
          this._getElementResistPercent(actor, "airElementResistPercent")
        );
      case 99:  // Fire damage
      case 94:  // Fire life steal
        return this._computeSpellEstimation(
          spellDice, isCritical,
          this._getCharacterBaseStat("intelligence"),
          this._getCharacterStat("fireDamageBonus"), mod,
          actor.data.stats.fireElementReduction,
          actor.data.stats.criticalDamageFixedResist,
          this._getElementResistPercent(actor, "fireElementResistPercent")
        );
      case 82:  // Fixed neutral life steal
        return Math.trunc(
          ((spellDice - actor.data.stats.neutralElementReduction) *
            (100 - this._getElementResistPercent(actor, "neutralElementResistPercent"))) /
            100
        );
      case 108: // Heals
        return Math.trunc(
          (spellDice * (100 + this._getCharacterBaseStat("intelligence"))) / 100 +
            this._getCharacterStat("healBonus")
        );
      case 1109: // Percent heal
        return Math.trunc(spellDice * (actor.data.stats.maxLifePoints / 100));
      case 672: { // Sacrier's Punishment
        var selfActor  = this._getUserActor();
        var maxHealth  = this._getCharacterStat("vitality") + (50 + selfActor.level * 5);
        var percentMax = selfActor.data.stats.lifePoints / selfActor.data.stats.maxLifePoints;
        var possibleDamage =
          (((spellDice / 100) * Math.pow(Math.cos(2 * Math.PI * (percentMax - 0.5)) + 1, 2)) / 4) *
          maxHealth;
        return Math.trunc(
          ((possibleDamage - actor.data.stats.neutralElementReduction) *
            (100 - this._getElementResistPercent(actor, "neutralElementResistPercent"))) /
            100
        );
      }
      default:
        console.info("damage-estimator: effectId not handled: " + effectId);
        return 0;
    }
  };

  Estimator.prototype._getEstimations = function (spell, actor) {
    var estimations = [];
    var effects     = spell.spellLevel.effects;

    for (var i = 0; i < effects.length; i++) {
      var effectId      = effects[i].effectId;
      var diceNum       = effects[i].diceNum;
      var diceSide      = effects[i].diceSide;
      var criticalEffect = spell.spellLevel.criticalEffect[i];
      var estimation    = [effectId, 0, 0, 0, 0];

      if (this._isActorInvincible(actor)) {
        estimations.push(estimation);
        continue;
      }

      if (effectId === 5) {
        // Push damage
        var self  = this._getUserActor();
        var bonus = this._getCharacterStat("pushDamageBonus") - actor.data.stats.pushDamageFixedResist;
        estimation[1] = Math.trunc(Math.max(0, (8 + (0 * self.level) / 50) * diceNum + bonus));
        estimation[3] = Math.trunc(Math.max(0, (8 + (8 * self.level) / 50) * diceNum + bonus));
        estimations.push(estimation);
        continue;
      }

      if (!this._isValidEffectId(effectId)) continue;

      if (!this._isActorBuff(actor, 410)) {
        estimation[1] = Math.max(0, this._getSpellEstimation(effectId, actor, diceNum));
        if (criticalEffect !== undefined) {
          estimation[2] = Math.max(0, this._getSpellEstimation(effectId, actor, criticalEffect.diceNum, true));
        }
      }
      if (!this._isActorBuff(actor, 416) && diceSide > diceNum) {
        estimation[3] = Math.max(0, this._getSpellEstimation(effectId, actor, diceSide));
        if (criticalEffect !== undefined && criticalEffect.diceSide > criticalEffect.diceNum) {
          estimation[4] = Math.max(0, this._getSpellEstimation(effectId, actor, criticalEffect.diceSide, true));
        }
      }
      estimations.push(estimation);
    }
    return estimations;
  };

  Estimator.prototype._getWeaponEstimations = function (spell, actor) {
    var estimations = [];

    for (var key in spell.effectInstances) {
      var ei              = spell.effectInstances[key];
      var effectId        = ei.effectId;
      var min             = ei.min;
      var max             = ei.max;
      var criticalHitBonus = spell._item.item.criticalHitBonus;
      var estimation      = [effectId, 0, 0, 0, 0];

      if (ei.effect.category !== 1 /* EffectCategory.damage */) continue;
      if (this._isActorInvincible(actor)) {
        estimations.push(estimation);
        continue;
      }
      if (!this._isValidEffectId(effectId)) continue;

      if (!this._isActorBuff(actor, 410)) {
        estimation[1] = Math.max(0, this._getSpellEstimation(effectId, actor, min));
        estimation[2] = Math.max(0, this._getSpellEstimation(effectId, actor, min + criticalHitBonus, true));
      }
      if (!this._isActorBuff(actor, 416)) {
        estimation[3] = Math.max(0, this._getSpellEstimation(effectId, actor, max));
        estimation[4] = Math.max(0, this._getSpellEstimation(effectId, actor, max + criticalHitBonus, true));
      }
      estimations.push(estimation);
    }
    return estimations;
  };

  Estimator.prototype._createEstimator = function () {
    var actor = this._getActor();
    if (!this._isActorVisible(actor)) return;

    var cellId   = actor.data.disposition.cellId;
    var scenePos = window.isoEngine.mapRenderer.getCellSceneCoordinate(cellId);
    var pos      = window.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);

    // Re-use or create container
    var existing = document.getElementById(ESTIMATOR_CONTAINER_ID + this.actorId);
    if (existing) {
      this.estimatorContainer = existing;
    } else {
      this.estimatorContainer = document.createElement("div");
      this.estimatorContainer.id = ESTIMATOR_CONTAINER_ID + this.actorId;
    }

    this.estimatorContainer.style.cssText =
      "padding:3px; box-sizing: border-box; border: 1px gray solid; background-color: #222;" +
      "color: white; position: absolute; border-radius: 3px; overflow: hidden; transition-duration: 500ms;";
    this.estimatorContainer.innerHTML = "";

    var estimations = this.spell.isItem
      ? this._getWeaponEstimations(this.spell, actor)
      : this._getEstimations(this.spell, actor);

    for (var i = 0; i < estimations.length; i++) {
      var effectId    = estimations[i][0];
      var min         = estimations[i][1];
      var criticalMin = estimations[i][2];
      var max         = estimations[i][3];
      var criticalMax = estimations[i][4];

      var damage      = document.createElement("div");
      damage.textContent = (min || max) + "";
      damage.style.color = SpellColor[effectId] || "";
      damage.style.fontSize = "0.9em";

      if (min > 0 && max > 0) {
        damage.textContent += " - " + max;
      }
      if (criticalMin > 0 || criticalMax > 0) {
        var criticalDamage = document.createElement("span");
        var p1 = document.createElement("span");
        var p2 = document.createElement("span");
        p1.textContent = " (";
        p1.style.color = "white";
        p2.textContent = ")";
        p2.style.color = "white";
        criticalDamage.textContent = (criticalMin || criticalMax) + "";
        if (criticalMin > 0 && criticalMax > 0) {
          criticalDamage.textContent += " - " + criticalMax;
        }
        damage.appendChild(p1);
        damage.appendChild(criticalDamage);
        damage.appendChild(p2);
      }
      this.estimatorContainer.appendChild(damage);
    }

    document.getElementById("damage-estimator").appendChild(this.estimatorContainer);
    this.estimatorContainer.style.left =
      pos.x - this.estimatorContainer.clientWidth / 2 + "px";
    this.estimatorContainer.style.top = pos.y - 80 + "px";
  };

  Estimator.prototype.update = function (spell) {
    this.spell = spell;
    var actor  = this._getActor();

    if (
      !window.isoEngine.mapRenderer.isFightMode ||
      !actor.data.alive ||
      !this._isActorVisible(actor)
    ) {
      return;
    }
    if (!this.estimatorContainer) {
      this._createEstimator();
      return;
    }

    var cellId   = actor.data.disposition.cellId;
    if (cellId) {
      var scenePos = window.isoEngine.mapRenderer.getCellSceneCoordinate(cellId);
      var pos      = window.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);
      this.estimatorContainer.style.left =
        pos.x - this.estimatorContainer.clientWidth / 2 + "px";
      this.estimatorContainer.style.top = pos.y - 80 + "px";
    }
  };

  Estimator.prototype.destroy = function () {
    if (this.estimatorContainer && this.estimatorContainer.parentElement) {
      this.estimatorContainer.parentElement.removeChild(this.estimatorContainer);
    }
  };

  // ---------------------------------------------------------------------------
  // DamageContainer — owns the overlay div and manages per-fighter Estimators
  // ---------------------------------------------------------------------------
  function DamageContainer() {
    this.displayed  = false;
    this.isInFight  = false;
    this.estimators = {};
    this.container  = this._createContainer();
    window.foreground.rootElement.appendChild(this.container);
  }

  DamageContainer.prototype._createContainer = function () {
    var el    = document.createElement("div");
    el.id     = "damage-estimator";
    el.style.cssText =
      "top: 0; left: 0; z-index: 1; width: 100%; height: 100%; " +
      "pointer-events: none; visibility: hidden; position: absolute;";
    return el;
  };

  DamageContainer.prototype._show = function (spell) {
    this.displayed = true;
    this.container.style.visibility = "visible";
    var fighters = window.gui.fightManager.getFighters();

    for (var key in fighters) {
      var fighter = window.gui.fightManager.getFighter(fighters[key]);
      if (
        fighter.data.alive &&
        fighter.id !== window.gui.playerData.characters.mainCharacterId
      ) {
        try {
          this.estimators[fighter.id] = new Estimator(fighter, spell);
        } catch (e) {
          console.error("damage-estimator: error creating estimator for fighter", fighter.id, e);
        }
      }
    }
  };

  DamageContainer.prototype.hide = function () {
    if (this.displayed) {
      this.displayed = false;
      this.container.style.visibility = "hidden";
      for (var fighterId in this.estimators) {
        this.destroyEstimator(parseFloat(fighterId));
      }
      this.estimators = {};
      var el = document.getElementById(this.container.id);
      if (el) el.innerHTML = "";
    }
  };

  DamageContainer.prototype._update = function (spell) {
    if (!this.isInFight) return;
    var fighters = window.gui.fightManager.getFighters();

    for (var i = 0; i < fighters.length; i++) {
      var fighter = window.gui.fightManager.getFighter(fighters[i]);
      if (
        fighter.data.alive &&
        fighter.id !== window.gui.playerData.characters.mainCharacterId
      ) {
        try {
          if (this.estimators[fighter.id]) {
            this.estimators[fighter.id].update(spell);
          } else {
            this.estimators[fighter.id] = new Estimator(fighter, spell);
          }
        } catch (e) {
          console.error("damage-estimator: error updating estimator for fighter", fighter.id, e);
        }
      }
    }
  };

  DamageContainer.prototype.destroyEstimators = function () {
    this.estimators = {};
    this.container.innerHTML = "";
  };

  DamageContainer.prototype.destroyEstimator = function (fighterId) {
    if (this.estimators[fighterId]) {
      try {
        this.estimators[fighterId].destroy();
      } catch (e) { /* noop */ }
      delete this.estimators[fighterId];
    }
  };

  DamageContainer.prototype.display = function (spell) {
    this.isInFight = true;
    this._show(spell);
  };

  DamageContainer.prototype.fightEnded = function () {
    this.isInFight = false;
    this.hide();
  };

  // ---------------------------------------------------------------------------
  // Mod bootstrap — poll until client globals are ready, then wire up events
  // ---------------------------------------------------------------------------
  var pollInterval = setInterval(function () {
    if (!window.gui || !window.isoEngine || !window.foreground) return;
    clearInterval(pollInterval);

    try {
      var damageContainer = new DamageContainer();

      // When a spell slot is selected, compute and display damage estimates
      window.gui.on("spellSlotSelected", function (spellId) {
        try {
          var spell = window.gui.playerData.characters.mainCharacter.spellData.spells[spellId];
          damageContainer.display(spell);
        } catch (e) {
          console.error("damage-estimator: spellSlotSelected error", e);
        }
      });

      // When a spell slot is deselected, clear all estimates
      window.gui.on("spellSlotDeselected", function () {
        try {
          console.info("damage-estimator: onSpellSlotDeselected");
          damageContainer.destroyEstimators();
        } catch (e) {
          console.error("damage-estimator: spellSlotDeselected error", e);
        }
      });

      // Optional: clean up when the fight ends
      // (GameFightEndMessage via connectionManager — uncomment if dofus global is present)
      // if (window.dofus && window.dofus.connectionManager) {
      //   window.dofus.connectionManager.on("GameFightEndMessage", function () {
      //     try { damageContainer.fightEnded(); } catch (e) { /* noop */ }
      //   });
      // }

      console.log("[dtd] mod damage-estimator active");
    } catch (e) {
      console.error("[dtd] mod damage-estimator failed to initialize", e);
    }
  }, 200);
})();
