/**
 * map-mover.js — faithful port of the reference client's Mover + PathFinder (A*) + supporting classes.
 * Source: packages/renderer/src/mods/shortcuts/mover.ts
 *         packages/renderer/src/mods/helpers/path-finder/path-finder.ts
 *         packages/renderer/src/mods/helpers/path-finder/cell-path-candidate.ts
 *         packages/renderer/src/mods/helpers/path-finder/cell-path-data.ts
 *
 * Exposes: window.__dtdMapMover = { move(direction, success, fail) }
 * direction: "top" | "bottom" | "left" | "right"
 * success: () => void   — called after the map change settles
 * fail: (reason: string) => void
 *
 * Loaded from mods.js as a helper (before the mods that use it), not as a
 * standalone mod: it only exposes an API and hooks nothing on its own.
 *
 * No gameplay automation beyond arrow-key map-edge navigation (identical to
 * what the reference client's Mover provides). Uses only game-client globals already on
 * window (isoEngine, gui, dofus).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // CellPathCandidate — a node in the A* open set
  // ---------------------------------------------------------------------------
  function CellPathCandidate(i, j, w, d, path) {
    this.i = i;       // grid position i
    this.j = j;       // grid position j
    this.w = w;       // accumulated weight of path to here
    this.d = d;       // remaining distance to destination (heuristic)
    this.path = path; // previous CellPathCandidate (linked list)
  }

  // ---------------------------------------------------------------------------
  // CellPathData — per-cell metadata stored in the A* grid
  // ---------------------------------------------------------------------------
  function CellPathData(i, j) {
    this.i = i;
    this.j = j;
    this.floor = -1;
    this.zone  = -1;
    this.speed = 1;
    this.weight = 0;
    this.candidateRef = undefined;
  }

  // ---------------------------------------------------------------------------
  // PathFinder — A* over the Dofus isometric map grid
  // ---------------------------------------------------------------------------
  var OCCUPIED_CELL_WEIGHT = 10;
  var WIDTH       = 33 + 2;  // 35
  var HEIGHT      = 34 + 2;  // 36
  var CELL_NUMBER = 560;
  var ELEVATION_TOLERANCE = 11.825;

  function PathFinder() {
    this.mapPoints          = {};
    this.grid               = [];
    this.useOldMovementSystem = false;
    this.firstCellZone      = undefined;

    this._generateMapPoints();
    this._generateGrid();
  }

  PathFinder.prototype.resetPath = function () {
    this.mapPoints            = {};
    this.grid                 = [];
    this.useOldMovementSystem = false;

    this._generateMapPoints();
    this._generateGrid();
  };

  PathFinder.prototype.fillPathGrid = function (map) {
    this.firstCellZone        = map.cells[0].z || 0;
    this.useOldMovementSystem = true;

    for (var i = 0; i < WIDTH; i += 1) {
      var row = this.grid[i];
      for (var j = 0; j < HEIGHT; j += 1) {
        var cellId   = this.getCellId(i - 1, j - 1);
        var cellPath = row[j];
        var cell     = map.cells[cellId];
        this.updateCellPath(cell, cellPath);
      }
    }
  };

  PathFinder.prototype.updateCellPath = function (cell, cellPath) {
    if (cell !== undefined && cell.l & 1) {
      cellPath.floor = cell.f || 0;
      cellPath.zone  = cell.z || 0;
      cellPath.speed = 1 + (cell.s || 0) / 10;

      if (cellPath.zone !== this.firstCellZone) {
        this.useOldMovementSystem = false;
      }
    } else {
      cellPath.floor = -1;
      cellPath.zone  = -1;
    }
  };

  PathFinder.prototype.getPath = function (source, target, occupiedCells, allowDiagonals, stopNextToTarget) {
    if (allowDiagonals === undefined) allowDiagonals    = true;
    if (stopNextToTarget === undefined) stopNextToTarget = false;

    var srcPos = this.getMapPoint(source);
    var dstPos = this.getMapPoint(target);

    var si = srcPos.x + 1;
    var sj = srcPos.y + 1;

    var srcCell = this.grid[si][sj];
    if (srcCell.zone === -1) {
      // Source cell is not walkable — find nearest accessible neighbour
      var bestFit       = undefined;
      var bestDist      = Infinity;
      var bestFloorDiff = Infinity;
      for (var ni = -1; ni <= 1; ni += 1) {
        for (var nj = -1; nj <= 1; nj += 1) {
          if (ni === 0 && nj === 0) continue;
          var ncell = this.grid[si + ni][sj + nj];
          if (ncell.zone === -1) continue;
          var floorDiff = Math.abs(ncell.floor - srcCell.floor);
          var dist      = Math.abs(ni) + Math.abs(nj);
          if (
            bestFit === undefined ||
            floorDiff < bestFloorDiff ||
            (floorDiff <= bestFloorDiff && dist < bestDist)
          ) {
            bestFit       = ncell;
            bestDist      = dist;
            bestFloorDiff = floorDiff;
          }
        }
      }

      if (bestFit !== undefined) {
        return [source, this.getCellId(bestFit.i - 1, bestFit.j - 1)];
      }

      console.error('[pathFinder.getPath] Player is stuck in ' + si + '/' + sj);
      return [source];
    }

    var di = dstPos.x + 1;
    var dj = dstPos.y + 1;

    // Mark occupied cells with extra weight
    var cellKeys = Object.keys(occupiedCells);
    var cellPos;
    for (var k = 0; k < cellKeys.length; k++) {
      var ocCellId = parseFloat(cellKeys[k]);
      cellPos = this.getMapPoint(ocCellId);
      this.grid[cellPos.x + 1][cellPos.y + 1].weight += OCCUPIED_CELL_WEIGHT;
    }

    var candidates = [];
    var selections = [];

    var distSrcDst = Math.sqrt((si - di) * (si - di) + (sj - dj) * (sj - dj));
    var selection  = new CellPathCandidate(si, sj, 0, distSrcDst);

    var reachingPath = undefined;
    var closestPath  = selection;

    while (selection.i !== di || selection.j !== dj) {
      this.addCandidates(selection, di, dj, candidates, allowDiagonals);

      var n = candidates.length;
      if (n === 0) {
        selection = closestPath;
        break;
      }

      var minPotentialWeight = Infinity;
      var selectionIndex     = 0;
      for (var c = 0; c < n; c += 1) {
        var candidate = candidates[c];
        if (candidate.w + candidate.d < minPotentialWeight) {
          selection          = candidate;
          minPotentialWeight = candidate.w + candidate.d;
          selectionIndex     = c;
        }
      }

      selections.push(selection);
      candidates.splice(selectionIndex, 1);

      if (selection.d === 0 || (stopNextToTarget && selection.d < 1.5)) {
        if (reachingPath === undefined || selection.w < reachingPath.w) {
          reachingPath = selection;
          closestPath  = selection;

          var trimmedCandidates = [];
          for (var tc = 0; tc < candidates.length; tc += 1) {
            var tcandidate = candidates[tc];
            if (tcandidate.w + tcandidate.d < reachingPath.w) {
              trimmedCandidates.push(tcandidate);
            } else {
              this.grid[tcandidate.i][tcandidate.j].candidateRef = undefined;
            }
          }
          candidates = trimmedCandidates;
        }
      } else {
        if (selection.d < closestPath.d) {
          closestPath = selection;
        }
      }
    }

    // Clean up candidateRef on remaining candidates
    for (var rc = 0; rc < candidates.length; rc += 1) {
      var rcandidate = candidates[rc];
      this.grid[rcandidate.i][rcandidate.j].candidateRef = undefined;
    }

    for (var rs = 0; rs < selections.length; rs += 1) {
      var rsel = selections[rs];
      this.grid[rsel.i][rsel.j].candidateRef = undefined;
    }

    // Unmark occupied cells
    for (var uk = 0; uk < cellKeys.length; uk++) {
      var uoCellId = parseFloat(cellKeys[uk]);
      cellPos = this.getMapPoint(uoCellId);
      this.grid[cellPos.x + 1][cellPos.y + 1].weight -= OCCUPIED_CELL_WEIGHT;
    }

    var shortestPath = [];
    var cp = closestPath;
    while (cp !== undefined) {
      shortestPath.unshift(this.getCellId(cp.i - 1, cp.j - 1));
      cp = cp.path;
    }

    return shortestPath;
  };

  PathFinder.prototype.addCandidate = function (c, w, di, dj, candidates, path) {
    var i = c.i;
    var j = c.j;

    var distanceToDestination = Math.sqrt((di - i) * (di - i) + (dj - j) * (dj - j));
    w = w / c.speed + c.weight;

    if (c.candidateRef === undefined) {
      var candidateRef = new CellPathCandidate(i, j, path.w + w, distanceToDestination, path);
      candidates.push(candidateRef);
      c.candidateRef = candidateRef;
    } else {
      var currentWeight = c.candidateRef.w;
      var newWeight     = path.w + w;
      if (newWeight < currentWeight) {
        c.candidateRef.w    = newWeight;
        c.candidateRef.path = path;
      }
    }
  };

  PathFinder.prototype.addCandidates = function (path, di, dj, candidates, allowDiagonals) {
    var i = path.i;
    var j = path.j;
    var c = this.grid[i][j];

    var c01 = this.grid[i - 1][j];
    var c10 = this.grid[i][j - 1];
    var c12 = this.grid[i][j + 1];
    var c21 = this.grid[i + 1][j];

    var weightStraight = 1;

    if (this.areCommunicating(c, c01)) this.addCandidate(c01, weightStraight, di, dj, candidates, path);
    if (this.areCommunicating(c, c21)) this.addCandidate(c21, weightStraight, di, dj, candidates, path);
    if (this.areCommunicating(c, c10)) this.addCandidate(c10, weightStraight, di, dj, candidates, path);
    if (this.areCommunicating(c, c12)) this.addCandidate(c12, weightStraight, di, dj, candidates, path);

    var c00 = this.grid[i - 1][j - 1];
    var c02 = this.grid[i - 1][j + 1];
    var c20 = this.grid[i + 1][j - 1];
    var c22 = this.grid[i + 1][j + 1];

    var weightDiagonal = Math.sqrt(2);

    if (allowDiagonals) {
      if (this.canMoveDiagonallyTo(c, c00, c01, c10)) this.addCandidate(c00, weightDiagonal, di, dj, candidates, path);
      if (this.canMoveDiagonallyTo(c, c20, c21, c10)) this.addCandidate(c20, weightDiagonal, di, dj, candidates, path);
      if (this.canMoveDiagonallyTo(c, c02, c01, c12)) this.addCandidate(c02, weightDiagonal, di, dj, candidates, path);
      if (this.canMoveDiagonallyTo(c, c22, c21, c12)) this.addCandidate(c22, weightDiagonal, di, dj, candidates, path);
    }
  };

  PathFinder.prototype.getCellId = function (x, y) {
    return this.mapPoints[x + '_' + y];
  };

  PathFinder.prototype._generateMapPoints = function () {
    this.mapPoints = {};
    for (var cellId = 0; cellId < CELL_NUMBER; cellId++) {
      var pt = this.getMapPoint(cellId);
      this.mapPoints[pt.x + '_' + pt.y] = cellId;
    }
  };

  PathFinder.prototype._generateGrid = function () {
    this.grid = [];
    for (var i = 0; i < WIDTH; i += 1) {
      var row = [];
      for (var j = 0; j < HEIGHT; j += 1) {
        row[j] = new CellPathData(i, j);
      }
      this.grid[i] = row;
    }
  };

  PathFinder.prototype.getMapPoint = function (cellId) {
    var row = (cellId % 14) - ~~(cellId / 28);
    var x   = row + 19;
    var y   = row + ~~(cellId / 14);
    return { x: x, y: y };
  };

  PathFinder.prototype.areCommunicating = function (c1, c2, oldMovementSystem) {
    if (oldMovementSystem === undefined) oldMovementSystem = false;
    var sameFloor = c1.floor === c2.floor;
    var sameZone  = c1.zone  === c2.zone;
    if (sameFloor) return true;
    if (!sameZone) return false;
    return oldMovementSystem || c1.zone !== 0 || Math.abs(c1.floor - c2.floor) <= ELEVATION_TOLERANCE;
  };

  PathFinder.prototype.canMoveDiagonallyTo = function (c1, c2, c3, c4) {
    return (
      this.areCommunicating(c1, c2, this.useOldMovementSystem) &&
      (
        this.areCommunicating(c1, c3, this.useOldMovementSystem) ||
        this.areCommunicating(c1, c4, this.useOldMovementSystem)
      )
    );
  };

  // ---------------------------------------------------------------------------
  // Mover — map-change navigation using the PathFinder above
  // ---------------------------------------------------------------------------

  function getTopCells() {
    return [1, 15, 2, 16, 3, 17, 4, 18, 5, 19, 6, 20, 7, 21, 8, 22, 9, 23, 10, 24, 11, 25, 12, 26, 13];
  }

  function getBottomCells() {
    return [
      533, 547, 534, 548, 535, 549, 536, 550, 537, 551, 538, 552, 539, 553, 540, 554, 541, 555, 542, 556, 543, 557, 544,
      558, 545, 559
    ];
  }

  function getLeftCells() {
    return [
      0, 14, 28, 42, 56, 70, 84, 98, 112, 126, 140, 154, 168, 182, 196, 210, 224, 238, 252, 266, 280, 294, 308, 322,
      336, 350, 364, 378, 392, 406, 420, 434, 448, 462, 476, 490, 504, 518, 532, 546
    ];
  }

  function getRightCells() {
    return [
      13, 27, 41, 55, 69, 83, 97, 111, 125, 139, 153, 167, 181, 195, 209, 223, 251, 279, 307, 321, 335, 349, 363, 377,
      391, 405, 419, 433, 447, 475, 489, 503, 517, 531, 545, 559
    ];
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Single shared PathFinder instance (matches the reference client's this.pathFinder pattern)
  var pathFinder = new PathFinder();

  function isMobOnCell(cellId) {
    var occupiedCells = window.isoEngine.actorManager._occupiedCells;
    if (occupiedCells[cellId]) {
      for (var j = 0; j < occupiedCells[cellId].length; j++) {
        if (occupiedCells[cellId][j].actorId < 0) {
          return true;
        }
      }
    }
    return false;
  }

  function isCellOnMap(cellId) {
    return !!window.isoEngine.mapRenderer.map.cells[cellId];
  }

  function isCellWalkable(cellId) {
    return window.isoEngine.mapRenderer.isWalkable(cellId);
  }

  function getClosestCellToChangeMapRandomised(cells, direction) {
    var occupiedCells  = window.isoEngine.actorManager._occupiedCells;
    var currentCellId  = window.isoEngine.actorManager.userActor.cellId;
    if (currentCellId === null || currentCellId === undefined) {
      return undefined;
    }
    var canMoveDiagonally = window.isoEngine.actorManager.userActor.canMoveDiagonally;

    var tableau = [];

    for (var i = 0; i < cells.length; i++) {
      var cellId = cells[i];
      if (!window.isoEngine.mapRenderer.getChangeMapFlags(cellId)[direction]) {
        continue;
      }
      if (isMobOnCell(cellId) || !isCellOnMap(cellId) || !isCellWalkable(cellId)) {
        continue;
      }
      pathFinder.resetPath();
      pathFinder.fillPathGrid(window.isoEngine.mapRenderer.map);
      var path = pathFinder.getPath(currentCellId, cellId, occupiedCells, canMoveDiagonally, false);

      if (path[path.length - 1] === cellId) {
        tableau.push([path, path[path.length - 1]]);
      }
    }

    if (tableau.length === 0) {
      return undefined;
    }

    tableau.sort(function (a, b) {
      return a[0].length - b[0].length;
    });

    if (tableau.length > 5) {
      return tableau[getRandomInt(0, 5)][1];
    } else {
      return tableau[getRandomInt(0, tableau.length - 1)][1];
    }
  }

  function onMapChange(callback, fail) {
    var previousMap   = window.isoEngine.mapRenderer.mapId;
    var cm            = window.dofus.connectionManager;

    var changeTimeout = setTimeout(function () {
      if (fail) fail('Map change timeout');
    }, 15000);

    var onChange = function () {
      cm.removeListener('MapComplementaryInformationsWithCoordsMessage', onChange);
      cm.removeListener('MapComplementaryInformationsDataMessage', onChange);
      clearTimeout(changeTimeout);

      var changeMapRetry = function () {
        if (
          window.isoEngine.actorManager.getActor(window.isoEngine.actorManager.userId).moving ||
          previousMap === window.isoEngine.mapRenderer.mapId
        ) {
          setTimeout(changeMapRetry, 300);
        } else {
          setTimeout(callback, 100 + Math.random() * 700);
        }
      };
      setTimeout(changeMapRetry, 1200);
    };

    cm.once('MapComplementaryInformationsWithCoordsMessage', onChange);
    cm.once('MapComplementaryInformationsDataMessage', onChange);
  }

  function move(direction, success, fail) {
    if (window.gui.fightManager.fightState < 0) {
      var cells = null;
      switch (direction) {
        case 'top':    cells = getTopCells();    break;
        case 'bottom': cells = getBottomCells(); break;
        case 'left':   cells = getLeftCells();   break;
        case 'right':  cells = getRightCells();  break;
        default:
          if (fail) fail('The given direction is wrong.');
          return;
      }

      var cell = getClosestCellToChangeMapRandomised(cells, direction);

      if (cell == null) {
        console.warn('[dtd/map-mover] No Cell Found.');
        return;
      }

      var doMove = function () {
        var scenePos = window.isoEngine.mapRenderer.getCellSceneCoordinate(cell);
        var pos      = window.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);
        window.isoEngine.gotoNeighbourMap(direction, cell, Math.floor(pos.x), Math.floor(pos.y));
      };

      onMapChange(success, fail);

      if (window.isoEngine.actorManager.userActor.moving) {
        window.isoEngine.actorManager.userActor.cancelMovement(doMove);
      } else {
        doMove();
      }
    } else {
      if (fail) fail('character in fight');
    }
  }

  // ---------------------------------------------------------------------------
  // Expose global API
  // ---------------------------------------------------------------------------
  window.__dtdMapMover = {
    move: move
  };

  console.log('[dtd] helper map-mover active');
})();
