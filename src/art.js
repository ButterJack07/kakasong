import { TEMPLATES } from './engine.js';

export const meeple = (color = 'currentColor') => `<svg viewBox="0 0 32 36" fill="${color}" aria-hidden="true"><path d="M16 2a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 16 2ZM10 13h12l8 11-5 3-5-6 5 13h-8l-1-8-1 8H7l5-13-5 6-5-3Z" stroke="rgba(0,0,0,.08)" stroke-width="1" stroke-linejoin="round"/></svg>`;

export function claimPosition(tile, index) {
  const g = tile.groups[index];
  if (g.type === 'cloister') return [50, 45];
  if (g.type === 'city' && g.edges.length > 1) return [50, 43];
  const points = [[50, 17], [83, 50], [50, 83], [17, 50]];
  if (g.edges.length === 1) return points[g.edges[0]];
  return [50, 54];
}

export function tileArt(tile, { ghost = false } = {}) {
  const template = TEMPLATES.find(t => t.id === tile.id);
  let city = '', roads = '';
  for (const g of template.groups.filter(g => g.type === 'city')) {
    if (g.edges.length === 1) {
      city += `<g transform="rotate(${g.edges[0] * 90} 50 50)"><path d="M-2-2H102V12Q50 47-2 12Z" fill="#d8a57e"/><path d="M0 15Q50 48 100 15" fill="none" stroke="#9b7356" stroke-width="4"/><path d="M0 12Q50 45 100 12" fill="none" stroke="#f5dbb4" stroke-width="4" stroke-dasharray="7 4"/><path d="m37 7 7-5 7 5v10H37Zm20 0 6-4 6 4v9H57Z" fill="#b77c5d"/></g>`;
    } else {
      const paths = [
        'M-2-2H102V12L65 52H35L-2 12Z',
        'M88-2H102V102H88L48 65V35Z',
        'M102 88V102H-2V88L35 48H65Z',
        'M12 102H-2V-2H12L52 35V65Z',
      ];
      city += `<g fill="#d8a57e">${g.edges.map(e => `<path d="${paths[e]}"/>`).join('')}<circle cx="50" cy="50" r="20"/></g>`;
      const open = [0, 1, 2, 3].filter(e => !g.edges.includes(e));
      city += open.map(e => `<g transform="rotate(${e * 90} 50 50)"><path d="M12 0Q50 80 88 0" fill="none" stroke="#9b7356" stroke-width="4"/><path d="M12 0Q50 75 88 0" fill="none" stroke="#f5dbb4" stroke-width="4" stroke-dasharray="7 4"/></g>`).join('');
      city += `<path d="M40 42h19v19H40Z" fill="#edd1a4"/><path d="m36 43 13-12 14 12Z" fill="#ad7155"/><path d="M47 51h6v10h-6Z" fill="#856a50"/>`;
    }
  }
  const ends = [[50, -2], [102, 50], [50, 102], [-2, 50]];
  for (const g of template.groups.filter(g => g.type === 'road')) {
    const paths = g.edges.map(e => `M${ends[e][0]} ${ends[e][1]}Q50 50 50 50`).join('');
    roads += `<path d="${paths}" fill="none" stroke="#b6a984" stroke-width="13"/><path d="${paths}" fill="none" stroke="#f3e7c7" stroke-width="9"/><path d="${paths}" fill="none" stroke="#d4c59d" stroke-width=".7" stroke-dasharray="2 5"/>`;
  }
  const hasRoad = template.groups.some(g => g.type === 'road');
  const junction = template.id === 'junction' || template.id === 'gate';
  const monastery = template.groups.some(g => g.type === 'cloister');
  return `<svg class="tile-art ${ghost ? 'ghost-art' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="#b7c69b"/>
    <path d="M0 28Q21 19 40 32T100 25M0 78Q35 65 60 81T100 76" fill="none" stroke="#a9bd8d" stroke-width="15" opacity=".4"/>
    <g fill="#d5dcb6" opacity=".8"><circle cx="13" cy="24" r="1.3"/><circle cx="75" cy="79" r="1.4"/><circle cx="25" cy="69" r="1"/><circle cx="82" cy="34" r="1.4"/><circle cx="61" cy="16" r="1"/></g>
    <g transform="rotate(${tile.rotation * 90} 50 50)">
      ${roads}${city}
      ${junction ? '<circle cx="50" cy="50" r="12" fill="#d1c49e"/><path d="M43 46h14v12H43Z" fill="#eaddbb"/><path d="m40 47 10-9 10 9Z" fill="#a16f52"/>' : ''}
      ${hasRoad && !junction && !monastery && template.groups.filter(g => g.type === 'road').some(g => g.edges.length === 1) ? '<circle cx="50" cy="50" r="5" fill="#e8d9b3" stroke="#b6a984" stroke-width="2"/>' : ''}
      ${monastery ? '<rect x="28" y="25" width="44" height="47" rx="3" fill="#9aab83"/><path d="M34 39h32v28H34Z" fill="#ece0bc"/><path d="m29 40 21-17 21 17Z" fill="#a8765a"/><path d="M45 29h10v32H45Z" fill="#e9d9b0"/><path d="m42 29 8-14 8 14Z" fill="#8d654e"/><path d="M47 48h6v13h-6Z" fill="#736e54"/><path d="M38 48h5v7h-5Zm19 0h5v7h-5Z" fill="#a8ad8a"/><path d="M44 68h12v7H44Z" fill="#e7d8b3"/>' : ''}
      <g fill="#648969" stroke="#527b5b" stroke-width=".6"><path d="m13 73-5 10h10Z"/><path d="m17 80-6 11h12Z"/><path d="m84 66-5 10h10Z"/></g>
      <g fill="#dce2bc"><path d="m30 18 2-3 2 3m40 70 2-3 2 3" stroke="#dce2bc" stroke-width="1"/></g>
    </g>
    <rect x=".7" y=".7" width="98.6" height="98.6" rx="2" fill="none" stroke="#fff9df" stroke-opacity=".35" stroke-width="1.4"/>
  </svg>`;
}

export const icons = {
  leaf: '<path d="M20 4c-9-1-16 3-15 9 1 8 13 7 15-9Z"/><path d="M4 21 15 10"/>',
  rotate: '<path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 3M12 17h.01"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  swap: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  road: '<path d="m8 3-4 18M16 3l4 18M12 4v3m0 4v3m0 4v3"/>',
  city: '<path d="M4 21V7h4V3h3v4h3V3h3v4h3v14ZM10 21v-6h4v6"/>',
  cloister: '<path d="M5 21V11l7-6 7 6v10ZM12 2v6m-3-3h6M10 21v-6h4v6"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
