import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, createTile, rotateTile, canPlace, legalPositions, featureAt,
  placeTile, chooseClaim, claimOptions, endTurn, undoPlacement, exchangeTile,
  finishEarly, hasAnyMove, completionPreview, key, TOTAL_TILES,
} from '../src/engine.js';

function boardTile(id, x, y, rotation = 0, claim = null) {
  return { ...createTile(id, rotation), x, y, claim };
}
function scenario(tiles, hand) {
  const game = createGame(() => .5);
  game.board = Object.fromEntries(tiles.map(t => [key(t.x, t.y), t]));
  game.hand = hand.map(id => createTile(id));
  game.deck = [];
  return game;
}

test('a new game offers three tiles and a total of 36 playable tiles', () => {
  const g = createGame();
  assert.equal(g.hand.length, 3);
  assert.equal(g.hand.length + g.deck.length, TOTAL_TILES);
  assert.equal(g.meeples, 5);
  assert.ok(hasAnyMove(g));
});

test('rotation carries both terrain edges and connected feature edges', () => {
  const t = createTile('gate');
  const rotated = rotateTile(t);
  assert.equal(rotated.edges.join(''), 'FCRF');
  assert.deepEqual(rotated.groups.map(g => g.edges), [[1], [2]]);
  assert.deepEqual(rotateTile(rotateTile(rotateTile(rotated))), t);
});

test('placement checks every shared edge, adjacency and occupied spaces', () => {
  const g = createGame();
  assert.equal(canPlace(g.board, createTile('cap', 2), 0, -1), true);
  assert.equal(canPlace(g.board, createTile('cloister'), 0, -1), false);
  assert.equal(canPlace(g.board, createTile('cloister'), 0, 1), true);
  assert.equal(canPlace(g.board, createTile('cloister'), 5, 5), false);
  assert.equal(canPlace(g.board, createTile('cloister'), 0, 0), false);
  g.board['1,1'] = boardTile('straight', 1, 1);
  assert.equal(canPlace(g.board, createTile('cloister'), 0, 1), false);
});

test('completing a claimed city scores unique tiles and returns its traveller', () => {
  const g = scenario([boardTile('cap', 0, 0, 0, 0)], ['cap', 'cloister']);
  g.meeples = 4;
  assert.ok(placeTile(g, 0, 2, 0, -1));
  assert.equal(claimOptions(g).length, 0);
  assert.equal(completionPreview(g), 4);
  const results = endTurn(g);
  assert.equal(g.score, 4);
  assert.equal(g.completed, 1);
  assert.equal(g.meeples, 5);
  assert.equal(results[0].type, 'city');
  assert.equal(g.board['0,0'].claim, null);
});

test('a newly completed unclaimed feature can be claimed before settlement', () => {
  const g = scenario([boardTile('cap', 0, 0)], ['cap', 'cloister']);
  placeTile(g, 0, 2, 0, -1);
  assert.ok(chooseClaim(g, 0));
  endTurn(g);
  assert.equal(g.score, 4);
  assert.equal(g.meeples, 5);
});

test('undo refunds a pending traveller without consuming a tile', () => {
  const g = createGame();
  let placed = false;
  for (let r = 0; r < 4 && !placed; r++) {
    const positions = legalPositions(g.board, createTile(g.hand[0].id, r));
    if (positions.length) placed = placeTile(g, 0, r, positions[0].x, positions[0].y);
  }
  assert.ok(placed);
  const option = claimOptions(g)[0];
  if (option) chooseClaim(g, option.index);
  undoPlacement(g);
  assert.equal(g.meeples, 5);
  assert.equal(Object.keys(g.board).length, 1);
  assert.equal(g.hand.length + g.deck.length, TOTAL_TILES);
  assert.equal(g.phase, 'place');
});

test('crossroads end each road independently', () => {
  const g = scenario([boardTile('junction', 0, 0, 0, 0)], ['junction', 'cloister']);
  g.meeples = 4;
  placeTile(g, 0, 2, 0, -1);
  assert.equal(featureAt(g.board, 0, 0, 0).size, 2);
  assert.equal(featureAt(g.board, 0, 0, 0).complete, true);
  assert.equal(featureAt(g.board, 0, 0, 1).complete, false);
  endTurn(g);
  assert.equal(g.score, 2);
  assert.equal(g.meeples, 5);
});

test('separate city segments on a tile remain separate', () => {
  const board = { '0,0': boardTile('two-cities', 0, 0, 0, 0), '0,-1': boardTile('cap', 0, -1, 2) };
  assert.equal(featureAt(board, 0, 0, 0).complete, true);
  assert.equal(featureAt(board, 0, 0, 1).claimed, false);
  assert.equal(featureAt(board, 0, 0, 1).complete, false);
});

test('a cloister completes when its eighth neighbor is added', () => {
  const tiles = [boardTile('cloister', 0, 0, 0, 0)];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    if ((x || y) && !(x === 1 && y === 1)) tiles.push(boardTile('cloister', x, y));
  }
  const g = scenario(tiles, ['cloister', 'cap']);
  g.meeples = 4;
  assert.equal(featureAt(g.board, 0, 0, 0).points, 8);
  placeTile(g, 0, 0, 1, 1);
  endTurn(g);
  assert.equal(g.score, 9);
  assert.equal(g.completed, 1);
  assert.equal(g.meeples, 5);
});

test('final settlement scores incomplete cities at one point per tile', () => {
  const g = scenario([boardTile('city-bridge', 0, 0, 0, 0), boardTile('cloister', 1, 0, 0, 0)], ['cap']);
  g.meeples = 3;
  finishEarly(g);
  assert.equal(g.score, 3);
  assert.equal(g.completed, 0);
  assert.equal(g.meeples, 5);
  assert.equal(g.finished, true);
});

test('exchange preserves tile budget and has a three-use limit', () => {
  const g = createGame();
  for (let i = 0; i < 3; i++) assert.ok(exchangeTile(g, 0));
  assert.equal(exchangeTile(g, 0), false);
  assert.equal(g.deck.length + g.hand.length, TOTAL_TILES);
  assert.equal(g.swaps, 0);
});

test('automated full games preserve traveller counts and reach final settlement', () => {
  for (let seed = 1; seed <= 15; seed++) {
    let state = seed;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
    const g = createGame(random);
    while (!g.finished) {
      let move = null;
      for (let h = 0; h < g.hand.length && !move; h++) for (let r = 0; r < 4 && !move; r++) {
        const positions = legalPositions(g.board, createTile(g.hand[h].id, r));
        if (positions.length) move = { h, r, ...positions[Math.floor(random() * positions.length)] };
      }
      if (!move) {
        if (g.swaps) { exchangeTile(g, 0); continue; }
        finishEarly(g); break;
      }
      assert.ok(placeTile(g, move.h, move.r, move.x, move.y));
      const options = claimOptions(g);
      if (options.length && random() > .3) chooseClaim(g, options[0].index);
      endTurn(g);
      const claims = Object.values(g.board).filter(t => t.claim !== null).length;
      assert.equal(g.meeples + claims, 5);
      assert.equal(g.deck.length + g.hand.length + g.placed, TOTAL_TILES);
      assert.ok(g.score >= 0);
    }
    assert.equal(g.meeples, 5);
    assert.equal(g.phase, 'finished');
  }
});
