export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const TARGET_SCORE = 80;
export const TARGET_COMPLETED = 4;
export const TOTAL_TILES = 36;
export const key = (x, y) => `${x},${y}`;

// Each group is a distinct connected feature. Edges run clockwise from north.
export const TEMPLATES = [
  { id: 'straight', name: '乡间小路', edges: 'FRFR', groups: [{ type: 'road', edges: [1, 3] }], count: 5 },
  { id: 'bend', name: '林间转弯', edges: 'RRFF', groups: [{ type: 'road', edges: [0, 1] }], count: 5 },
  { id: 'junction', name: '三岔驿站', edges: 'RRRF', groups: [{ type: 'road', edges: [0] }, { type: 'road', edges: [1] }, { type: 'road', edges: [2] }], count: 2 },
  { id: 'gate', name: '城门小径', edges: 'CRFF', groups: [{ type: 'city', edges: [0] }, { type: 'road', edges: [1] }], count: 3 },
  { id: 'cap', name: '古城一角', edges: 'CFFF', groups: [{ type: 'city', edges: [0] }], count: 5 },
  { id: 'city-bend', name: '弧形城墙', edges: 'CCFF', groups: [{ type: 'city', edges: [0, 1] }], count: 3 },
  { id: 'city-bridge', name: '长街城堡', edges: 'CFCF', groups: [{ type: 'city', edges: [0, 2] }], count: 2 },
  { id: 'city-three', name: '王国腹地', edges: 'CCCF', groups: [{ type: 'city', edges: [0, 1, 2] }], count: 2 },
  { id: 'two-cities', name: '双子城镇', edges: 'CFCF', groups: [{ type: 'city', edges: [0] }, { type: 'city', edges: [2] }], count: 2 },
  { id: 'city-road', name: '城外大道', edges: 'CRFR', groups: [{ type: 'city', edges: [0] }, { type: 'road', edges: [1, 3] }], count: 3 },
  { id: 'cloister', name: '静谧修道院', edges: 'FFFF', groups: [{ type: 'cloister', edges: [] }], count: 3 },
  { id: 'cloister-road', name: '朝圣之路', edges: 'FFRF', groups: [{ type: 'cloister', edges: [] }, { type: 'road', edges: [2] }], count: 1 },
];

export function createTile(template, rotation = 0) {
  const source = typeof template === 'string' ? TEMPLATES.find(t => t.id === template) : template;
  return {
    id: source.id, name: source.name, rotation,
    edges: Array.from({ length: 4 }, (_, d) => source.edges[(d - rotation + 4) % 4]),
    groups: source.groups.map(g => ({ type: g.type, edges: g.edges.map(e => (e + rotation) % 4) })),
  };
}

export function rotateTile(tile) { return createTile(tile.id, (tile.rotation + 1) % 4); }

export function createGame(random = Math.random) {
  const deck = TEMPLATES.flatMap(t => Array.from({ length: t.count }, () => createTile(t)));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const starter = { ...createTile('city-road'), x: 0, y: 0, claim: null };
  return {
    board: { '0,0': starter }, deck, hand: deck.splice(0, 3), score: 0,
    meeples: 5, completed: 0, placed: 0, swaps: 3, phase: 'place', pending: null,
    lastResult: [], history: [], finished: false,
  };
}

export function canPlace(board, tile, x, y) {
  if (board[key(x, y)]) return false;
  let touches = false;
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DIRECTIONS[d];
    const neighbor = board[key(x + dx, y + dy)];
    if (!neighbor) continue;
    touches = true;
    if (tile.edges[d] !== neighbor.edges[(d + 2) % 4]) return false;
  }
  return touches;
}

export function legalPositions(board, tile) {
  const candidates = new Map();
  for (const t of Object.values(board)) {
    for (const [dx, dy] of DIRECTIONS) {
      const x = t.x + dx, y = t.y + dy;
      if (canPlace(board, tile, x, y)) candidates.set(key(x, y), { x, y });
    }
  }
  return [...candidates.values()];
}

export function hasAnyMove(game) {
  return game.hand.some(t => {
    for (let r = 0; r < 4; r++) if (legalPositions(game.board, createTile(t.id, r)).length) return true;
    return false;
  });
}

export function featureAt(board, x, y, groupIndex) {
  const tile = board[key(x, y)];
  const group = tile?.groups[groupIndex];
  if (!group) return null;
  if (group.type === 'cloister') {
    let neighbors = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if ((dx || dy) && board[key(x + dx, y + dy)]) neighbors++;
    }
    return { type: 'cloister', nodes: [{ x, y, groupIndex }], size: 1, complete: neighbors === 8,
      points: neighbors + 1, claimed: tile.claim === groupIndex, signature: `${x},${y}:${groupIndex}` };
  }
  const stack = [{ x, y, groupIndex }], visited = new Set(), nodes = [], tiles = new Set();
  let open = 0, claimed = false;
  while (stack.length) {
    const node = stack.pop();
    const nodeKey = `${node.x},${node.y}:${node.groupIndex}`;
    if (visited.has(nodeKey)) continue;
    visited.add(nodeKey); nodes.push(node); tiles.add(key(node.x, node.y));
    const current = board[key(node.x, node.y)];
    if (current.claim === node.groupIndex) claimed = true;
    for (const edge of current.groups[node.groupIndex].edges) {
      const [dx, dy] = DIRECTIONS[edge], nx = node.x + dx, ny = node.y + dy;
      const neighbor = board[key(nx, ny)];
      if (!neighbor) { open++; continue; }
      const index = neighbor.groups.findIndex(g => g.type === group.type && g.edges.includes((edge + 2) % 4));
      if (index >= 0) stack.push({ x: nx, y: ny, groupIndex: index });
    }
  }
  return { type: group.type, nodes, size: tiles.size, complete: open === 0,
    points: tiles.size * (group.type === 'city' ? 2 : 1), claimed,
    signature: [...visited].sort().join('|') };
}

export function claimOptions(game) {
  if (game.phase !== 'claim' || game.meeples <= 0) return [];
  const { x, y } = game.pending;
  return game.board[key(x, y)].groups.map((_, i) => ({ index: i, feature: featureAt(game.board, x, y, i) }))
    .filter(o => !o.feature.claimed);
}

export function placeTile(game, handIndex, rotation, x, y) {
  if (game.phase !== 'place' || !game.hand[handIndex]) return false;
  const tile = createTile(game.hand[handIndex].id, rotation);
  if (!canPlace(game.board, tile, x, y)) return false;
  game.board[key(x, y)] = { ...tile, x, y, claim: null };
  game.pending = { x, y, handIndex };
  game.phase = 'claim';
  return true;
}

export function undoPlacement(game) {
  if (game.phase !== 'claim') return;
  const { x, y } = game.pending;
  if (game.board[key(x, y)].claim !== null) game.meeples++;
  delete game.board[key(x, y)];
  game.pending = null;
  game.phase = 'place';
}

export function chooseClaim(game, index) {
  if (game.phase !== 'claim') return false;
  const tile = game.board[key(game.pending.x, game.pending.y)];
  if (tile.claim !== null) { game.meeples++; tile.claim = null; }
  if (index === null) return true;
  if (!claimOptions(game).some(o => o.index === index)) return false;
  tile.claim = index; game.meeples--;
  return true;
}

function settle(game, final = false) {
  const results = [], seen = new Set();
  for (const tile of Object.values(game.board)) {
    if (tile.claim === null) continue;
    const feature = featureAt(game.board, tile.x, tile.y, tile.claim);
    if (seen.has(feature.signature) || (!feature.complete && !final)) continue;
    seen.add(feature.signature);
    const points = final && !feature.complete && feature.type === 'city' ? feature.size : feature.points;
    game.score += points;
    if (feature.complete) game.completed++;
    for (const node of feature.nodes) {
      const member = game.board[key(node.x, node.y)];
      if (member.claim === node.groupIndex) { member.claim = null; game.meeples++; }
    }
    results.push({ type: feature.type, points, complete: feature.complete, x: tile.x, y: tile.y });
  }
  return results;
}

export function endTurn(game) {
  if (game.phase !== 'claim') return [];
  const { handIndex } = game.pending;
  game.hand.splice(handIndex, 1);
  if (game.deck.length) game.hand.splice(handIndex, 0, game.deck.shift());
  game.placed++;
  game.pending = null;
  game.phase = 'place';
  const results = settle(game);
  if (!game.hand.length) {
    results.push(...settle(game, true));
    game.phase = 'finished'; game.finished = true;
  }
  game.lastResult = results;
  game.history.push(...results);
  return results;
}

export function exchangeTile(game, index) {
  if (game.phase !== 'place' || !game.hand[index] || game.swaps <= 0) return false;
  // Cycling a tile back into the deck preserves the 36-tile construction budget.
  if (game.deck.length) {
    game.deck.push(game.hand[index]);
    game.hand[index] = game.deck.shift();
  } else {
    const current = game.hand[index];
    const viable = TEMPLATES.filter(t => Array.from({ length: 4 }, (_, r) => createTile(t, r))
      .some(t => legalPositions(game.board, t).length));
    const replacement = viable.find(t => t.id !== current.id) || viable[0];
    if (!replacement) return false;
    game.hand[index] = createTile(replacement);
  }
  game.swaps--;
  return true;
}

export function finishEarly(game) {
  if (game.phase !== 'place') return;
  game.lastResult = settle(game, true);
  game.phase = 'finished'; game.finished = true;
}

export function completionPreview(game) {
  if (game.phase !== 'claim') return 0;
  const seen = new Set(); let points = 0;
  for (const tile of Object.values(game.board)) {
    if (tile.claim === null) continue;
    const f = featureAt(game.board, tile.x, tile.y, tile.claim);
    if (f.complete && !seen.has(f.signature)) { points += f.points; seen.add(f.signature); }
  }
  return points;
}
