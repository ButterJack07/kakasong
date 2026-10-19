import {
  createGame, createTile, legalPositions, placeTile, undoPlacement, chooseClaim,
  endTurn, claimOptions, exchangeTile, finishEarly, hasAnyMove, completionPreview,
  TARGET_SCORE, TARGET_COMPLETED, TOTAL_TILES, key,
} from './engine.js';
import { tileArt, icon, meeple, claimPosition } from './art.js';

const STORAGE = 'little-lands-v1';
const CELL = 100;
const labels = { road: '道路', city: '城镇', cloister: '修道院' };
let game, selected = 0, rotation = 0;
let best = Number(safeGet('little-lands-best')) || 0;
let muted = safeGet('little-lands-sound') !== 'on';
let camera = { x: 0, y: 0, zoom: 1 };
let toastTimer, audioContext, modal = null;
let showResult = false;

function safeGet(name) { try { return localStorage.getItem(name); } catch { return null; } }
function safeSet(name, value) { try { localStorage.setItem(name, value); } catch { /* Play remains available without storage. */ } }
try {
  const saved = JSON.parse(safeGet(STORAGE));
  if (saved?.version === 1 && saved.game?.board && Array.isArray(saved.game.hand)) {
    game = saved.game;
    selected = Math.min(saved.selected || 0, Math.max(0, game.hand.length - 1));
    rotation = saved.rotation || 0;
    showResult = game.finished;
  }
} catch { /* An invalid save starts a new game. */ }
game ||= createGame();

function save() {
  safeSet(STORAGE, JSON.stringify({ version: 1, game, selected, rotation }));
  if (game.score > best) { best = game.score; safeSet('little-lands-best', String(best)); }
}

document.querySelector('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="田园之间首页"><span class="brand-mark">${icon('leaf')}</span><span><strong>田园之间<span class="brand-dot">.</span></strong><small>LITTLE LANDS</small></span></a>
    <div class="header-caption"><span class="online-dot"></span> 一个人，也有一整个世界</div>
    <nav class="header-actions" aria-label="游戏工具">
      <button class="icon-button" id="sound" title="开启音效" aria-label="开启音效"></button>
      <button class="icon-button mobile-goals" id="goals" title="目标与手记" aria-label="目标与手记">${icon('target')}</button>
      <button class="icon-button" id="help" title="玩法说明" aria-label="玩法说明">${icon('help')}</button>
      <span class="nav-divider"></span>
      <button class="new-game" id="new-game">${icon('reset')}<span>新旅程</span></button>
    </nav>
  </header>
  <main class="workspace">
    <section class="map-section" aria-label="地图区域">
      <div class="map-heading"><div><span class="eyebrow">YOUR LITTLE KINGDOM</span><h1>把日子，拼成田园。</h1></div><div class="chapter"><span>CHAPTER 01</span><strong>初见原野</strong></div></div>
      <div class="stats" id="stats"></div>
      <div class="board-wrap" id="board-wrap">
        <div class="board-grain"></div>
        <div class="map-topline"><span>${icon('compass')} 无垠原野</span><span id="map-count"></span></div>
        <div class="board-viewport" id="viewport" role="region" aria-label="可拖动和缩放的游戏地图">
          <div id="world" class="world"></div>
        </div>
        <div class="board-tip" id="board-tip" aria-live="polite"></div>
        <div class="placement-hint" id="placement-hint" aria-live="polite"></div>
        <div class="map-controls"><button class="map-button" id="zoom-out" aria-label="缩小">${icon('minus')}</button><span id="zoom-label">100%</span><button class="map-button" id="zoom-in" aria-label="放大">${icon('plus')}</button><span class="control-divider"></span><button class="map-button" id="recenter" aria-label="居中地图" title="居中地图">${icon('target')}</button></div>
        <div class="map-signature">a little land, a little peace.</div>
      </div>
      <footer class="map-footer"><span><span class="legend-dot"></span> 可放置位置</span><span class="desktop-hint">拖动浏览 · 滚轮缩放 · R 旋转</span><span class="mobile-hint">拖动地图 · 双指缩放</span><span class="saved-hint">${icon('check')} 自动保存</span></footer>
    </section>
    <aside class="sidebar" aria-label="回合操作">
      <section class="hand-section" id="hand-section"></section>
      <section class="objectives" id="objectives"></section>
      <section class="journal" id="journal"></section>
      <div class="sidebar-bottom">慢一点，好风景值得等待。${icon('leaf')}</div>
    </aside>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div id="modal-root"></div>
`;

const $ = s => document.querySelector(s);
const viewport = $('#viewport'), world = $('#world');

function render() {
  const tile = game.hand[selected];
  const points = completionPreview(game);
  $('#stats').innerHTML = `
    <div class="stat"><span class="stat-label">${icon('leaf')} 当前得分</span><div><strong>${game.score}</strong><span class="stat-unit">分</span></div></div>
    <div class="stat"><span class="stat-label"><span class="tiny-meeple">${meeple()}</span> 可用旅人</span><div><strong>${game.meeples}</strong><span class="stat-unit">/ 5</span><span class="meeple-row">${Array.from({ length: 5 }, (_, i) => `<span class="${i >= game.meeples ? 'away' : ''}">${meeple()}</span>`).join('')}</span></div></div>
    <div class="stat"><span class="stat-label">${icon('city')} 剩余板块</span><div><strong>${TOTAL_TILES - game.placed}</strong><span class="stat-unit">/ ${TOTAL_TILES}</span></div></div>
    <div class="stat best-stat"><span class="stat-label">个人最佳</span><div><strong>${Math.max(best, game.score)}</strong><span class="stat-unit">分</span></div></div>`;
  $('#map-count').textContent = `${Object.keys(game.board).length} 块土地 · 第 ${Math.min(game.placed + 1, TOTAL_TILES)} 回合`;
  const blocked = game.phase === 'place' && !hasAnyMove(game);
  $('#board-tip').innerHTML = game.finished ? `${icon('leaf')} 这一片原野，留下了你的故事` : game.phase === 'claim'
    ? `${icon('check')} 已放置${points ? ` · 可得 ${points} 分` : ' · 选择旅人去向'}`
    : blocked ? `${icon('swap')} 暂无合适落点，试试换牌` : `${icon('plus')} 点击虚线位置，种下一片风景`;
  $('#placement-hint').textContent = '';
  $('.workspace').classList.toggle('claiming', game.phase === 'claim');
  $('#hand-section').innerHTML = `
    <div class="section-title"><span class="step-number">${game.phase === 'claim' ? '02' : '01'}</span><h2>${game.finished ? '旅程已完成' : game.phase === 'claim' ? '让旅人出发' : '选择一块风景'}</h2><span class="section-tag">${game.phase === 'claim' ? '可选' : '三选一'}</span></div>
    <p class="section-subtitle">${game.finished ? '每一块土地，都成为了故事。' : game.phase === 'claim' ? '占领建筑，完工后得分并收回旅人。' : '道路接道路，城镇接城镇，草地接草地。'}</p>
    <div class="tile-hand ${game.phase !== 'place' ? 'hand-inactive' : ''}">
      ${game.hand.map((t, i) => `<button class="tile-card ${i === selected ? 'selected' : ''}" data-hand="${i}" ${game.phase !== 'place' ? 'disabled' : ''} aria-label="选择${t.name}" aria-pressed="${i === selected}"><span class="tile-card-art">${tileArt(createTile(t.id, i === selected ? rotation : 0))}<span class="selection-check">${icon('check')}</span></span><span class="tile-name">${t.name}</span><span class="tile-number">0${i + 1}</span></button>`).join('')}
    </div>
    ${game.phase === 'place' ? `
      <div class="tile-tools"><button id="rotate" class="secondary-button">${icon('rotate')} 旋转板块 <kbd>R</kbd></button><button id="exchange" class="text-button" ${game.swaps <= 0 ? 'disabled' : ''} title="替换选中的板块">${icon('swap')} 换牌 <span>${game.swaps}</span></button></div>
      <div class="placement-note"><span class="pulse-dot"></span><span id="placement-count">${tile ? legalPositions(game.board, createTile(tile.id, rotation)).length : 0}</span> 个可放置位置<span class="note-end">${rotation * 90}°</span></div>
      ${blocked ? `<button id="finish-early" class="secondary-button blocked-finish">提前结算</button>` : ''}` : ''}
    ${game.phase === 'claim' ? renderClaim() : ''}
    ${game.finished ? `<button id="show-result" class="primary-button">查看旅程总结 ${icon('arrow')}</button>` : ''}
  `;
  const wonScore = game.score >= TARGET_SCORE, wonBuildings = game.completed >= TARGET_COMPLETED;
  $('#objectives').innerHTML = `
    <div class="objective-heading"><h2>${icon('target')} 原野小愿望</h2><span>${Number(wonScore) + Number(wonBuildings)} / 2</span></div>
    <div class="objective ${wonScore ? 'done' : ''}"><div class="objective-icon">${icon(wonScore ? 'check' : 'leaf')}</div><div class="objective-info"><div><strong>让原野生机盎然</strong><span>${game.score}<em> / ${TARGET_SCORE} 分</em></span></div><div class="progress"><i style="width:${Math.min(100, game.score / TARGET_SCORE * 100)}%"></i></div></div></div>
    <div class="objective ${wonBuildings ? 'done' : ''}"><div class="objective-icon">${icon(wonBuildings ? 'check' : 'city')}</div><div class="objective-info"><div><strong>为旅人建一个家</strong><span>${game.completed}<em> / ${TARGET_COMPLETED} 处</em></span></div><div class="progress"><i style="width:${Math.min(100, game.completed / TARGET_COMPLETED * 100)}%"></i></div></div></div>
    <p class="objective-footnote">完成并计分的道路、城镇和修道院均计入。</p>`;
  $('#journal').innerHTML = `<div class="journal-title"><span>原野手记</span><span>FIELD NOTES</span></div>${game.history.length
    ? `<div class="journal-entries">${game.history.slice(-3).reverse().map(r => `<div class="journal-entry">${icon(r.type)}<span>${labels[r.type]}${r.complete ? '完工，旅人归来' : '获得旅程结算'}</span><strong>+${r.points}</strong></div>`).join('')}</div>`
    : `<p>第一条小路，会通向哪里？<br>你的故事，从这块土地开始。</p><div class="journal-sketch">${icon('cloister')}${icon('road')}${icon('city')}</div>`}`;
  renderBoard();
  updateSound();
  bindPanel();
  save();
  if (showResult) { showResult = false; openModal('result'); }
}

function renderClaim() {
  const placed = game.board[key(game.pending.x, game.pending.y)];
  const current = placed.claim;
  // Temporarily release the current claim so other options remain selectable.
  if (current !== null) { placed.claim = null; game.meeples++; }
  const options = claimOptions(game);
  if (current !== null) { placed.claim = current; game.meeples--; }
  return `<div class="claim-options">${options.length ? options.map(({ index, feature }) => `<button class="claim-button ${current === index ? 'active' : ''}" data-claim="${index}" aria-pressed="${current === index}">${icon(feature.type)}<span>${labels[feature.type]}${placed.groups.filter(g => g.type === feature.type).length > 1 ? ` ${index + 1}` : ''}</span>${current === index ? icon('check') : `<small>${feature.complete ? `+${feature.points} 分` : '派遣'}</small>`}</button>`).join('') : `<p class="no-claims">${game.meeples === 0 ? '旅人都在忙碌，这回合先铺一片土地。' : '这里的建筑已有旅人，继续拓展吧。'}</p>`}</div>
    <div class="turn-actions"><button id="undo" class="undo-button" title="撤回当前板块">${icon('reset')} 撤回</button><button id="end-turn" class="primary-button">${current !== null ? '确认派遣' : '不派遣，继续'} ${icon('arrow')}</button></div>`;
}

function renderBoard() {
  let html = '';
  const touchPreview = matchMedia('(pointer: coarse)').matches && game.phase === 'place' && game.hand[selected];
  if (touchPreview) html += '<div class="touch-preview" id="touch-preview" aria-hidden="true"></div>';
  if (game.phase === 'place' && game.hand[selected]) {
    const tile = createTile(game.hand[selected].id, rotation);
    for (const { x, y } of legalPositions(game.board, tile)) {
      html += `<button class="legal-cell ${x === 0 && y === 0 ? 'preview-anchor' : ''}" data-x="${x}" data-y="${y}" style="left:${x * CELL}px;top:${y * CELL}px" aria-label="放置在坐标 ${x},${y}" title="点击放置"><span class="legal-plus">+</span><span class="hover-tile">${tileArt(tile, { ghost: true })}</span></button>`;
    }
  }
  for (const tile of Object.values(game.board)) {
    const pending = game.pending?.x === tile.x && game.pending?.y === tile.y;
    html += `<div class="board-tile ${pending ? 'pending-tile' : ''}" style="left:${tile.x * CELL}px;top:${tile.y * CELL}px" title="${tile.name}">${tileArt(tile)}${tile.claim !== null ? (() => {
      const [x, y] = claimPosition(tile, tile.claim);
      return `<span class="board-meeple" style="left:${x}%;top:${y}%">${meeple('#f8d38d')}</span>`;
    })() : ''}${tile.x === 0 && tile.y === 0 ? '<span class="starter-dot" title="起始板块"></span>' : ''}</div>`;
  }
  world.innerHTML = html;
  updateCamera();
  world.querySelectorAll('.legal-cell').forEach(button => {
    button.addEventListener('click', () => {
      if (button.classList.contains('preview-anchor') && $('#touch-preview')?.classList.contains('preview-visible')) return;
      if (suppressClick) return;
      commitPlacement(Number(button.dataset.x), Number(button.dataset.y));
    });
  });
  if (touchPreview) {
    const preview = $('#touch-preview');
    preview.innerHTML = `${tileArt(createTile(game.hand[selected].id, rotation), { ghost: true })}<span class="preview-label">可放置</span>`;
    preview.hidden = true;
    preview.style.position = 'absolute';
    preview.style.left = '0'; preview.style.top = '0';
    preview.style.width = `${CELL}px`; preview.style.height = `${CELL}px`;
    preview.addEventListener('pointerdown', event => event.stopPropagation());
    preview.addEventListener('click', () => {
      if (suppressClick || preview.hidden) return;
      const x = Number(preview.dataset.x), y = Number(preview.dataset.y);
      commitPlacement(x, y);
    });
  }
  const activePointer = pointers.values().next().value;
  if (touchPreview && activePointer) updateTouchPreview(activePointer.x, activePointer.y);
}

function commitPlacement(x, y) {
  if (!placeTile(game, selected, rotation, x, y)) return;
  sound('place'); render();
  if (window.innerWidth < 760) ensurePendingVisible();
}

function bindPanel() {
  document.querySelectorAll('[data-hand]').forEach(button => button.addEventListener('click', () => {
    selected = Number(button.dataset.hand); rotation = 0; sound('select'); render();
  }));
  $('#rotate')?.addEventListener('click', rotate);
  $('#exchange')?.addEventListener('click', () => {
    if (exchangeTile(game, selected)) { rotation = 0; render(); toast('换一片风景，换一种可能。'); sound('select'); }
  });
  $('#undo')?.addEventListener('click', () => { undoPlacement(game); render(); sound('select'); });
  document.querySelectorAll('[data-claim]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.claim);
    const tile = game.board[key(game.pending.x, game.pending.y)];
    chooseClaim(game, tile.claim === index ? null : index);
    render(); sound('select');
  }));
  $('#end-turn')?.addEventListener('click', () => {
    const results = endTurn(game);
    selected = Math.min(selected, Math.max(0, game.hand.length - 1)); rotation = 0;
    if (results.length) {
      const points = results.reduce((sum, r) => sum + r.points, 0);
      toast(`+${points} 分 · ${results.some(r => r.complete) ? '建筑完工，旅人归来！' : '旅程结算'}`);
      sound('score');
    } else sound('place');
    showResult = game.finished;
    render();
    if (!game.finished && !hasAnyMove(game)) toast('三块板块都没有落点。可以换牌，或提前结算。');
  });
  $('#finish-early')?.addEventListener('click', () => openModal('finish'));
  $('#show-result')?.addEventListener('click', () => openModal('result'));
}

function rotate() {
  if (game.phase !== 'place') return;
  rotation = (rotation + 1) % 4; sound('select'); render();
}

function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

function updateSound() {
  $('#sound').innerHTML = icon(muted ? 'mute' : 'sound');
  $('#sound').title = $('#sound').ariaLabel = muted ? '开启音效' : '关闭音效';
}
function sound(kind) {
  if (muted) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const notes = kind === 'score' ? [523, 659, 784] : kind === 'place' ? [262, 392] : [440];
    notes.forEach((frequency, i) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      const time = audioContext.currentTime + i * .08;
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.07, time + .01);
      gain.gain.exponentialRampToValueAtTime(.001, time + .2);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(time); osc.stop(time + .22);
    });
  } catch { /* Sound is optional. */ }
}

function updateCamera() {
  world.style.transform = `translate(${viewport.clientWidth / 2 + camera.x}px,${viewport.clientHeight / 2 + camera.y}px) scale(${camera.zoom})`;
  $('#zoom-label').textContent = `${Math.round(camera.zoom * 100)}%`;
}
function zoomBy(factor, px = viewport.clientWidth / 2, py = viewport.clientHeight / 2) {
  const next = Math.max(.3, Math.min(1.8, camera.zoom * factor));
  const ratio = next / camera.zoom;
  camera.x = (camera.x - px + viewport.clientWidth / 2) * ratio + px - viewport.clientWidth / 2;
  camera.y = (camera.y - py + viewport.clientHeight / 2) * ratio + py - viewport.clientHeight / 2;
  camera.zoom = next; updateCamera();
}
function recenter(fit = true) {
  const tiles = Object.values(game.board);
  const minX = Math.min(...tiles.map(t => t.x)), maxX = Math.max(...tiles.map(t => t.x));
  const minY = Math.min(...tiles.map(t => t.y)), maxY = Math.max(...tiles.map(t => t.y));
  if (fit) camera.zoom = Math.max(.3, Math.min(window.innerWidth < 760 ? .78 : 1, viewport.clientWidth / ((maxX - minX + 3) * CELL), viewport.clientHeight / ((maxY - minY + 3) * CELL)));
  camera.x = -(minX + maxX + 1) / 2 * CELL * camera.zoom;
  camera.y = -(minY + maxY + 1) / 2 * CELL * camera.zoom;
  updateCamera();
}
function ensurePendingVisible() {
  const { x, y } = game.pending;
  const sx = viewport.clientWidth / 2 + camera.x + (x + .5) * CELL * camera.zoom;
  const sy = viewport.clientHeight / 2 + camera.y + (y + .5) * CELL * camera.zoom;
  if (sx < 50 || sx > viewport.clientWidth - 50 || sy < 55 || sy > viewport.clientHeight - 65) {
    camera.x = -(x + .5) * CELL * camera.zoom;
    camera.y = -(y + .5) * CELL * camera.zoom;
    updateCamera();
  }
}

const pointers = new Map();
let gesture = null, suppressClick = false;
function pointerMetrics() {
  const values = [...pointers.values()];
  return { x: values.reduce((s, p) => s + p.x, 0) / values.length,
    y: values.reduce((s, p) => s + p.y, 0) / values.length,
    distance: values.length > 1 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0 };
}
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  gesture = pointerMetrics();
  // Preserve clicks on tile buttons until a real drag starts.
});
viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  const old = gesture;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const next = pointerMetrics();
  const dx = next.x - old.x, dy = next.y - old.y;
  if (!suppressClick && Math.hypot(dx, dy) < 3 && pointers.size === 1) return;
  updateTouchPreview(next.x, next.y);
  suppressClick = true;
  if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
  camera.x += dx; camera.y += dy;
  if (pointers.size > 1 && old.distance > 0) {
    const rect = viewport.getBoundingClientRect();
    zoomBy(next.distance / old.distance, next.x - rect.left, next.y - rect.top);
  } else updateCamera();
  gesture = next;
  viewport.classList.add('dragging');
});
viewport.addEventListener('pointermove', event => {
  if (pointers.has(event.pointerId)) return;
  updateTouchPreview(event.clientX, event.clientY);
});
viewport.addEventListener('pointerleave', () => {
  if (pointers.size) return;
  const preview = $('#touch-preview');
  if (preview) preview.hidden = true;
});
function updateTouchPreview(clientX, clientY) {
  const preview = $('#touch-preview');
  if (!preview || game.phase !== 'place' || !game.hand[selected]) return;
  const rect = viewport.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left - rect.width / 2 - camera.x) / camera.zoom / CELL);
  const y = Math.floor((clientY - rect.top - rect.height / 2 - camera.y) / camera.zoom / CELL);
  const legal = legalPositions(game.board, createTile(game.hand[selected].id, rotation));
  const position = legal.find(p => p.x === x && p.y === y);
  if (!position) {
    preview.hidden = true;
    preview.classList.remove('preview-visible');
    $('#placement-hint').classList.remove('invalid-placement');
    if (Object.hasOwn(game.board, key(x, y))) {
      $('#placement-hint').textContent = '这格已有板块';
      $('#placement-hint').classList.add('invalid-placement');
    } else if (legal.length && isAdjacent(game.board, x, y)) {
      $('#placement-hint').textContent = '地形边缘不匹配，旋转板块试试';
      $('#placement-hint').classList.add('invalid-placement');
    } else $('#placement-hint').textContent = '';
    return;
  }
  preview.style.left = `${position.x * CELL}px`;
  preview.style.top = `${position.y * CELL}px`;
  preview.dataset.x = String(position.x);
  preview.dataset.y = String(position.y);
  preview.style.zIndex = '4';
  preview.hidden = false;
  preview.classList.add('preview-visible');
  $('#placement-hint').textContent = '松开手指放置';
  $('#placement-hint').classList.remove('invalid-placement');
}
function isAdjacent(board, x, y) {
  return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => Object.hasOwn(board, key(x + dx, y + dy)));
}
function releasePointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size) gesture = pointerMetrics();
  else {
    gesture = null; viewport.classList.remove('dragging');
    setTimeout(() => { suppressClick = false; }, 100);
  }
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
viewport.addEventListener('wheel', event => {
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  zoomBy(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
$('#zoom-in').addEventListener('click', () => zoomBy(1.2));
$('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
$('#recenter').addEventListener('click', () => recenter());
$('#sound').addEventListener('click', () => { muted = !muted; safeSet('little-lands-sound', muted ? 'off' : 'on'); updateSound(); sound('select'); });
$('#help').addEventListener('click', () => openModal('help'));
$('#goals').addEventListener('click', () => openModal('notes'));
$('#new-game').addEventListener('click', () => openModal('restart'));
window.addEventListener('keydown', event => {
  if (modal) { if (event.key === 'Escape') closeModal(); return; }
  if (event.target.matches('input,textarea,select')) return;
  if (event.key.toLowerCase() === 'r') rotate();
  if (['1', '2', '3'].includes(event.key) && game.phase === 'place' && game.hand[Number(event.key) - 1]) {
    selected = Number(event.key) - 1; rotation = 0; render();
  }
});
const resizeObserver = new ResizeObserver(() => updateCamera());
resizeObserver.observe(viewport);

let previousFocus;
function openModal(type) {
  previousFocus = document.activeElement;
  modal = type;
  const won = game.score >= TARGET_SCORE && game.completed >= TARGET_COMPLETED;
  let content = '';
  if (type === 'notes') content = `
    <span class="eyebrow">FIELD NOTES</span><h2>原野小愿望</h2>
    <div class="objective ${game.score >= TARGET_SCORE ? 'done' : ''}"><div class="objective-icon">${icon(game.score >= TARGET_SCORE ? 'check' : 'leaf')}</div><div class="objective-info"><div><strong>让原野生机盎然</strong><span>${game.score}<em> / ${TARGET_SCORE} 分</em></span></div><div class="progress"><i style="width:${Math.min(100, game.score / TARGET_SCORE * 100)}%"></i></div></div></div>
    <div class="objective ${game.completed >= TARGET_COMPLETED ? 'done' : ''}"><div class="objective-icon">${icon(game.completed >= TARGET_COMPLETED ? 'check' : 'city')}</div><div class="objective-info"><div><strong>为旅人建一个家</strong><span>${game.completed}<em> / ${TARGET_COMPLETED} 处</em></span></div><div class="progress"><i style="width:${Math.min(100, game.completed / TARGET_COMPLETED * 100)}%"></i></div></div></div>
    <p class="objective-footnote">完成并计分的道路、城镇和修道院均计入。</p>
    <div class="journal modal-journal"><div class="journal-title"><span>原野手记</span><span>FIELD NOTES</span></div>${game.history.length
      ? `<div class="journal-entries">${game.history.slice(-5).reverse().map(r => `<div class="journal-entry">${icon(r.type)}<span>${labels[r.type]}${r.complete ? '完工，旅人归来' : '获得旅程结算'}</span><strong>+${r.points}</strong></div>`).join('')}</div>`
      : '<p>第一条小路，会通向哪里？</p>'}</div>
    <button class="primary-button modal-confirm" data-close>继续旅程 ${icon('arrow')}</button>`;
  else if (type === 'help') content = `
    <span class="eyebrow">A SMALL GUIDE</span><h2>欢迎来到田园之间</h2><p class="modal-lead">36 块土地，5 位旅人，一段属于自己的旅程。</p>
    <div class="help-step"><span>01</span><div><h3>选择、旋转、拼接</h3><p>从三块候选中选择一块，点击地图上的虚线格放置。相邻边的道路、城镇或草地必须一致。可拖动地图、缩放查看。</p></div></div>
    <div class="help-step"><span>02</span><div><h3>派出你的旅人</h3><p>放置后，可派 1 位旅人到该板块上的建筑。连通区域已有旅人时不能再次派遣；草地不计分。确认回合前可撤回板块。</p></div></div>
    <div class="help-step"><span>03</span><div><h3>完工得分，旅人归来</h3><p>道路所有出口封闭：每块 1 分；城镇所有边界围合：每块 2 分；修道院周围 8 格填满：9 分。只有派了旅人的建筑才得分。</p></div></div>
    <div class="help-step"><span>04</span><div><h3>完成原野小愿望</h3><p>用完板块时达到 80 分，并完成至少 4 处有旅人的建筑，即可通关。未完工道路每块 1 分、城镇每块 1 分、修道院按自身及周围已有板块计分。</p></div></div>
    <div class="help-note">每局可换牌 3 次。选中板块放回牌库底部，补入新板块；牌库空时会补一块可用的新板块。无路可走时可以提前结算。进度和最高分自动保存在当前浏览器。</div>
    <button class="primary-button modal-confirm" data-close>去种一片风景 ${icon('arrow')}</button>`;
  else if (type === 'result') content = `
    <div class="result-emblem">${icon(won ? 'leaf' : 'compass')}</div><span class="eyebrow">A JOURNEY TO REMEMBER</span><h2>${won ? '原野，因你而丰盛。' : '每一步，都是好风景。'}</h2><p class="modal-lead">${won ? '两个小愿望都实现了。恭喜完成初见原野！' : '这次旅程已收好，下一片原野正在等你。'}</p>
    <div class="result-score">${game.score}<span>分</span></div><div class="result-grid"><div><strong>${game.completed}</strong><span>建筑完工</span></div><div><strong>${game.placed}</strong><span>板块铺设</span></div><div><strong>${Math.max(best, game.score)}</strong><span>个人最佳</span></div></div>
    <div class="result-objectives"><span class="${game.score >= TARGET_SCORE ? 'achieved' : ''}">${icon(game.score >= TARGET_SCORE ? 'check' : 'target')} 得分达到 80 分</span><span class="${game.completed >= TARGET_COMPLETED ? 'achieved' : ''}">${icon(game.completed >= TARGET_COMPLETED ? 'check' : 'target')} 完成 4 处建筑</span></div>
    <button class="primary-button modal-confirm" id="confirm-restart">开启新的旅程 ${icon('arrow')}</button><button class="text-button result-back" data-close>再看看我的地图</button>`;
  else content = `<span class="eyebrow">${type === 'finish' ? 'END THIS CHAPTER' : 'A FRESH START'}</span><h2>${type === 'finish' ? '在这里，为旅程收尾？' : '出发去一片新原野？'}</h2><p class="modal-lead">${type === 'finish' ? '将结算所有未完工建筑，结束当前对局。' : '当前地图将被新的旅程替代，个人最高分会保留。'}</p><div class="modal-actions"><button class="secondary-button" data-close>再想一想</button><button class="primary-button" id="${type === 'finish' ? 'confirm-finish' : 'confirm-restart'}">${type === 'finish' ? '确认结算' : '开始新旅程'} ${icon('arrow')}</button></div>`;
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal ${type === 'result' ? 'result-modal' : ''}" role="dialog" aria-modal="true" aria-label="${type === 'help' ? '玩法说明' : type === 'result' ? '旅程总结' : '确认操作'}" tabindex="-1"><button class="modal-close icon-button" data-close aria-label="关闭">${icon('close')}</button>${content}</section></div>`;
  $('#modal-root').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  $('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
  $('#confirm-restart')?.addEventListener('click', () => {
    game = createGame(); selected = 0; rotation = 0; closeModal(); render(); recenter(); toast('新的旅程，从一片原野开始。');
  });
  $('#confirm-finish')?.addEventListener('click', () => { closeModal(); finishEarly(game); showResult = true; render(); });
  $('.modal').focus();
  $('.modal').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...$('.modal').querySelectorAll('button:not(:disabled)')];
    if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === $('.modal'))) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  });
}
function closeModal() { modal = null; $('#modal-root').innerHTML = ''; previousFocus?.focus(); }

render();
requestAnimationFrame(() => {
  if (Object.keys(game.board).length > 1) recenter();
  else { camera = { x: 0, y: 0, zoom: 1 }; updateCamera(); }
});
