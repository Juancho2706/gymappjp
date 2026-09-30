/* EVA carousel — 8 animated slides (1080×1350). ?s=1..8 picks the slide; render(t) is deterministic. */
const SLIDE = Math.max(1, Math.min(8, +(new URLSearchParams(location.search).get('s') || 1)));
const DUR = 6;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  lin: x => x, o3: x => 1 - Math.pow(1 - x, 3), o4: x => 1 - Math.pow(1 - x, 4), o5: x => 1 - Math.pow(1 - x, 5),
  oExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)), i3: x => x * x * x,
  io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  io4: x => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  oBack: x => { const s = 1.9; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  oElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3.2) + 1),
};
const P = (t, a, b, e = E.o4) => e(clamp((t - a) / (b - a)));
const pulse = (t, c, w = 0.1) => Math.max(0, 1 - Math.abs(t - c) / w);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function tf(el, o = {}) {
  const { x = 0, y = 0, s = 1, r = 0, rx = 0, ry = 0 } = o; const sx = o.sx ?? s, sy = o.sy ?? s;
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${r.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  if (o.o !== undefined) { el.style.opacity = o.o.toFixed(4); el.style.visibility = o.o <= 0.001 ? 'hidden' : 'visible'; }
  if (o.blur !== undefined) el.style.filter = o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
const op = (el, o) => { el.style.opacity = o.toFixed(4); el.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; };
const h = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
const rc = el => el.getBoundingClientRect();
const ctr = el => { const r = rc(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, x) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], x))).join(',')})`; };
function diagClip(k) {
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]], u = p => p[0] + (1 - p[1]) - k, out = [];
  for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4], ua = u(a), ub = u(b); if (ua <= 0) out.push(a); if ((ua <= 0) !== (ub <= 0)) { const f = ua / (ua - ub); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } }
  return out.length < 3 ? 'polygon(0 0,0 0,0 0)' : 'polygon(' + out.map(p => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`).join(',') + ')';
}
const check = (c = '#fff', w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICON = {
  dumb: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>`,
  food: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8M4.5 3v5a2.5 2.5 0 005 0V3M7 11v10M17 21V3c-2.2 1-3.5 3.5-3.5 7h3.5"/></svg>`,
  up: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>`,
  brush: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4-4-7.6-9-7.6z"/><circle cx="7.5" cy="11" r="1.2" fill="${c}"/><circle cx="11" cy="7.5" r="1.2" fill="${c}"/><circle cx="15.5" cy="8.5" r="1.2" fill="${c}"/></svg>`,
  users: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.8.7 2.8 2.4 3 5.2"/></svg>`,
  trophy: c => `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1.5A3.5 3.5 0 007.5 11M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z"/></svg>`,
};

/* ------------------------------------------------------------ SLIDE COPY */
const SL = {
  1: { kick: 'PARA PERSONAL TRAINERS', l1: 'TU COACHING,', l2: 'EN UNA SOLA APP.', sub: 'Así funciona EVA, paso a paso.', num: '' },
  2: { kick: 'PASO 01 · TU MARCA', l1: 'TU LOGO. TU COLOR.', l2: 'TU APP.', sub: 'Tus alumnos instalan una app con tu marca.', num: '01' },
  3: { kick: 'PASO 02 · ALUMNOS', l1: 'SUMA ALUMNOS', l2: 'CON UN CÓDIGO.', sub: 'Tu alumno ingresa tu código y entra directo a tu app.', num: '02' },
  4: { kick: 'PASO 03 · RUTINAS', l1: 'ARMA LA RUTINA', l2: 'EN MINUTOS.', sub: 'Arrastra ejercicios, prescribe y asígnala.', num: '03' },
  5: { kick: 'PASO 04 · NUTRICIÓN', l1: 'LA DIETA,', l2: 'SIN PLANILLAS.', sub: 'Macros, comidas y porciones calculadas al instante.', num: '04' },
  6: { kick: 'PASO 05 · ENTRENAMIENTO', l1: 'TU ALUMNO', l2: 'ENTRENA GUIADO.', sub: 'Series, descansos y registros desde su celular.', num: '05' },
  7: { kick: 'PASO 06 · PROGRESO', l1: 'MIDE EL PROGRESO', l2: 'SIN ABANDONOS.', sub: 'Check-ins, gráficos e insignias que motivan a volver.', num: '06' },
  8: { kick: 'EMPIEZA HOY', l1: 'PRUEBA EVA', l2: 'GRATIS.', sub: 'Rutinas, nutrición, alumnos y tu propia app. Todo en un solo lugar.', num: '' },
};
const C = SL[SLIDE];
const stage = $('#stage');
if (SLIDE === 8) stage.classList.add('cta');

/* ------------------------------------------------------------ COMMON BUILD */
$('#kick span').textContent = C.kick;
$('#bigNum').textContent = C.num;
function words(el, text, cls = '') { return text.split(' ').map(w => { const s = h(`<span class="w"><span class="${cls}">${w}</span></span>`); el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s.firstChild; }); }
const l1 = h('<span class="ln"></span>'), l2 = h('<span class="ln"></span>');
$('#head').append(l1, l2);
const W1 = words(l1, C.l1), W2 = words(l2, C.l2, SLIDE === 8 ? '' : 'g');
const WS = words($('#sub'), C.sub);
$('#prog .n').textContent = `${SLIDE}/8`;
for (let i = 0; i < 8; i++) $('#prog .dashes').appendChild(h('<div class="d"><i></i></div>'));
const dashes = $$('#prog .d i');
$('#pill .tag').textContent = SLIDE === 8 ? 'PRUEBA GRATIS' : 'CÓMO FUNCIONA';

// background blobs
const B = [['#b1', 700, '#C5DCFF', 820, -120], ['#b2', 560, '#BEE8F4', -180, 760], ['#b3', 420, '#E8F1FF', 600, 900]];
for (const [id, s, c, x, y] of B) Object.assign($(id).style, { width: s + 'px', height: s + 'px', background: SLIDE === 8 ? 'rgba(255,255,255,.55)' : c, left: x + 'px', top: y + 'px' });
if (SLIDE === 8) {
  $('#kick').style.background = '#0B0E13'; $('#kick').style.color = '#fff'; $('#kick b').style.background = '#00F7F7';
  $('#bigNum').style.webkitTextStroke = '2.5px rgba(11,14,19,.08)';
  $('#dots').style.backgroundImage = 'radial-gradient(rgba(11,14,19,.1) 1.6px,transparent 1.8px)';
  $('#sub').style.color = '#07313A';
  $('#track .tl').style.background = 'linear-gradient(90deg,rgba(11,14,19,.1),#0B0E13)';
  $('#track .hd').style.borderColor = '#0B0E13'; $('#track .hd').style.boxShadow = '0 0 0 6px rgba(11,14,19,.12)';
  $('#foot .url').style.color = '#0B0E13';
  $('#swT').textContent = 'LINK EN LA BIO'; $('#swA').style.display = 'none';
  $('#under').style.background = '#0B0E13';
}
const scene = $('#scene');

/* ------------------------------------------------------------ CURSOR */
let MOVES = [], CLICKS = [], CUR_START = [1120, 1400], CUR_VIS = [];
function cursorPos(t) {
  let p = CUR_START.slice();
  for (const [a, b, fn, arc] of MOVES) {
    if (t <= a) break;
    const to = fn(), e = E.io3(clamp((t - a) / (b - a)));
    const dx = to[0] - p[0], dy = to[1] - p[1], L = Math.hypot(dx, dy) || 1, bump = Math.sin(Math.PI * e) * arc;
    p = [lerp(p[0], to[0], e) + (-dy / L) * bump, lerp(p[1], to[1], e) + (dx / L) * bump];
  }
  return p;
}
const fx = $('#fx').getContext('2d');
const BURSTS = [];
function burst(t0, at, n, seed, cols, spd = 700, life = 0.8) { const r = rng(seed); BURSTS.push({ t0, at, life, ps: Array.from({ length: n }, () => ({ a: r() * 6.283, v: spd * (0.3 + r() * 0.7), s: 3 + r() * 6, c: cols[Math.floor(r() * cols.length)], sq: r() < 0.5 })) }); }

/* ------------------------------------------------------------ SLIDES */
let SCENE = () => { };

if (SLIDE === 1) {
  scene.innerHTML = `
  <svg class="abs" style="left:0;top:0" width="1080" height="1350"><ellipse id="orbit" cx="540" cy="905" rx="440" ry="190" fill="none" stroke="rgba(38,128,255,.35)" stroke-width="2.5" stroke-dasharray="6 12"/></svg>
  <div id="lock" class="abs" style="left:0;top:0;width:1080px;height:1350px">
    <div id="cMark" class="mk abs" style="left:445px;top:640px;width:190px;height:231px"></div>
    <div id="cEva" class="abs" style="left:0;right:0;top:880px;text-align:center;font-size:170px;line-height:1"><span class="eva" style="display:inline-flex"><span id="e1">E</span><span id="e2">V</span><span id="e3">A</span></span></div>
  </div>
  ${[['Rutinas', '#2680FF', 'dumb'], ['Nutrición', '#FF6A3D', 'food'], ['Progreso', '#1FB877', 'up'], ['Tu marca', '#8B5CF6', 'brush']].map(([n, c, ic]) =>
    `<div class="card orb" style="left:0;top:0;width:250px;height:84px;border-radius:24px;display:flex;align-items:center;gap:14px;padding:0 18px"><div style="width:52px;height:52px;border-radius:16px;background:${c}1f;display:flex;align-items:center;justify-content:center">${ICON[ic](c)}</div><div><div style="font:800 21px Inter">${n}</div><div style="font:600 14px 'JetBrains Mono';color:${c};margin-top:3px">✓ INCLUIDO</div></div></div>`).join('')}`;
  const orbs = $$('.orb'), orbit = $('#orbit'), L = 2 * Math.PI * Math.sqrt((440 * 440 + 190 * 190) / 2);
  orbit.style.strokeDasharray = `${L}`;
  SCENE = t => {
    orbit.style.strokeDashoffset = (L * (1 - P(t, 0.9, 1.9, E.io3))).toFixed(1);
    orbit.style.strokeDasharray = t > 1.9 ? '6 12' : `${L}`;
    const m = $('#cMark'), q = P(t, 0.35, 1.3, E.oExpo);
    m.style.clipPath = diagClip(P(t, 0.35, 1.0, E.io3) * 2);
    tf(m, { y: lerp(40, 0, q) + Math.sin(t * 2) * 5 * P(t, 1.3, 1.8), s: lerp(0.85, 1, q), r: lerp(-8, 0, q) });
    ['#e1', '#e2', '#e3'].forEach((id, i) => { const e = P(t, 0.8 + i * 0.11, 1.3 + i * 0.11, E.oExpo); tf($(id), { x: [-60, 0, 60][i] * (1 - e), y: [0, 40, 0][i] * (1 - e), s: lerp(1.8, 1, e), o: P(t, 0.8 + i * 0.11, 0.92 + i * 0.11, E.lin), blur: (1 - e) * 14 }); $(id).style.display = 'inline-block'; });
    orbs.forEach((o, i) => {
      const a = i * Math.PI / 2 - 0.6 + t * 0.32, x = 540 + Math.cos(a) * 440, y = 905 + Math.sin(a) * 190, d = Math.sin(a);
      const e = P(t, 1.35 + i * 0.14, 1.95 + i * 0.14, E.oBack);
      tf(o, { x: x - 125, y: y - 42, s: (0.86 + 0.16 * (d + 1) / 2) * lerp(0.2, 1, e), o: clamp(e * 2) });
      o.style.zIndex = d > 0 ? 3 : 0; $('#lock').style.zIndex = 1; o.style.filter = d < -0.2 ? `blur(${((-d - 0.2) * 2).toFixed(2)}px)` : 'none';
    });
  };
  burst(1.28, () => [540, 960], 46, 4, ['38,128,255', '0,201,224', '11,14,19'], 900, 0.9);
}

if (SLIDE === 2) {
  const SW = ['#2680FF', '#8B5CF6', '#1FB877', '#FF6A3D', '#0B0E13'];
  scene.innerHTML = `
  <div class="card" id="bc" style="left:60px;top:640px;width:500px;height:520px;padding:34px">
    <div class="lab">Tu marca</div>
    <div style="display:flex;align-items:center;gap:20px;margin-top:22px">
      <div id="logoTile" style="width:108px;height:108px;border-radius:28px;display:flex;align-items:center;justify-content:center;font:900 44px 'ArchivoW';font-stretch:80%;color:#fff">AT</div>
      <div><div style="font:800 26px Inter">Logo</div><div id="upl" style="font:700 16px Inter;color:#1FB877;margin-top:6px;display:flex;gap:6px;align-items:center">${check('#1FB877', 18)} atlas-logo.png</div></div>
    </div>
    <div class="lab" style="margin-top:34px">Color principal</div>
    <div style="display:flex;gap:16px;margin-top:18px">${SW.map(c => `<div class="sw" style="width:66px;height:66px;border-radius:50%;background:${c};position:relative"><div class="swr" style="position:absolute;inset:-8px;border-radius:50%;border:3px solid ${c};opacity:0"></div></div>`).join('')}</div>
    <div class="lab" style="margin-top:34px">Nombre de la app</div>
    <div style="margin-top:14px;height:66px;border-radius:18px;border:2px solid var(--line);display:flex;align-items:center;padding:0 20px;font:800 24px Inter"><span id="appName"></span><i id="car" style="display:inline-block;width:3px;height:30px;background:var(--sport);margin-left:3px"></i></div>
  </div>
  <div class="phone" id="ph" style="left:612px;top:586px;width:340px;height:610px"><div class="scr" id="scr">
    <div class="isl"></div><div class="sb"><span>9:41</span><span>●●●</span></div>
    <div style="position:absolute;left:24px;right:24px;top:62px;display:flex;align-items:center;gap:12px"><div class="bcol" style="width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font:900 20px 'ArchivoW';color:#fff">AT</div><div><div style="font:600 13px Inter;color:var(--muted)">Atlas Training</div><div style="font:900 24px Archivo;letter-spacing:-.02em">Hola, María</div></div></div>
    <div class="bgrad" style="position:absolute;left:20px;right:20px;top:134px;border-radius:26px;padding:22px;color:#fff">
      <div style="font:700 12px 'JetBrains Mono';letter-spacing:.2em;opacity:.8">HOY · LUNES</div><div style="font:900 44px/1 Archivo;margin-top:8px;letter-spacing:-.03em">Pierna</div>
      <div style="font:600 14px Inter;opacity:.85;margin-top:6px">4 ejercicios · 55 min</div><div class="btxt" style="margin-top:16px;height:46px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font:800 15px Inter">▶ Comenzar</div></div>
    <div style="position:absolute;left:20px;right:20px;top:346px;display:flex;gap:12px">${['Proteína', 'Agua', 'Pasos'].map((n, i) => `<div style="flex:1;height:106px;border-radius:20px;background:#fff;border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="18" fill="none" stroke="#E6E9ED" stroke-width="6"/><circle class="bring" cx="23" cy="23" r="18" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="113" stroke-dashoffset="${[34, 56, 20][i]}" transform="rotate(-90 23 23)"/></svg><div style="font:700 12px Inter;color:var(--muted)">${n}</div></div>`).join('')}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:74px;background:#fff;border-top:1px solid var(--line);display:flex;justify-content:space-around;align-items:center">${[0, 1, 2, 3].map(i => `<div class="${i === 0 ? 'bcol' : ''}" style="width:${i === 0 ? 46 : 26}px;height:${i === 0 ? 30 : 26}px;border-radius:10px;background:${i === 0 ? '' : '#E6E9ED'}"></div>`).join('')}</div>
    <div id="wipe" style="position:absolute;border-radius:50%;pointer-events:none"></div>
  </div></div>`;
  const sws = $$('.sw'), swr = $$('.swr');
  const SEQ = [[0, 0], [1.6, 1], [2.55, 2], [3.5, 3]];
  const colorAt = t => { let c = SW[0]; for (let i = 1; i < SEQ.length; i++) { const [tt, k] = SEQ[i]; if (t >= tt) { const q = P(t, tt, tt + 0.35, E.io3); c = mix(SW[SEQ[i - 1][1]].startsWith('#') ? SW[SEQ[i - 1][1]] : c, SW[k], q); } } return c; };
  MOVES = [[1.1, 1.55, () => ctr(sws[1]), 60], [1.75, 2.5, () => ctr(sws[2]), 30], [2.7, 3.45, () => ctr(sws[3]), 30], [3.9, 4.6, () => [1150, 1420], 40]];
  CLICKS = [1.6, 2.55, 3.5]; CUR_VIS = [[1.0, 4.6]];
  SCENE = t => {
    const e = P(t, 0.45, 1.25, E.oExpo); tf($('#bc'), { x: (1 - e) * -120, ry: (1 - e) * 20, o: e });
    const p = P(t, 0.6, 1.5, E.oExpo); tf($('#ph'), { y: (1 - p) * 500 + Math.sin(t * 1.7) * 6 * p, r: (1 - p) * 8 + Math.sin(t * 1.1) * 0.6, o: 1 });
    const c = colorAt(t);
    $$('.bcol').forEach(x => x.style.background = c); $('#logoTile').style.background = c; $('.bgrad').style.background = `linear-gradient(145deg,${c},${mix('#0B0E13', '#0B0E13', 0)})`;
    $('.bgrad').style.background = `linear-gradient(150deg,${c} 0%,${c} 45%,#0B0E13 140%)`; $('.btxt').style.color = c; $$('.bring').forEach(x => x.style.stroke = c);
    let k = 0; SEQ.forEach(([tt, kk]) => { if (t >= tt) k = kk; });
    swr.forEach((r, i) => { const on = i === k; op(r, on ? 1 : 0); tf(sws[i], { s: 1 + (on ? 0.08 : 0) - 0.12 * Math.max(...CLICKS.map(cc => pulse(t, cc, 0.1) * (SEQ.find(s => s[0] === cc)[1] === i ? 1 : 0))) }); });
    // ripple wipe inside phone from the tap
    const w = $('#wipe'); let last = SEQ.filter(s => t >= s[0] && s[0] > 0).pop();
    if (last && t - last[0] < 0.6) { const q = E.o3((t - last[0]) / 0.6), R = q * 900; Object.assign(w.style, { left: (160 - R) + 'px', top: (300 - R) + 'px', width: 2 * R + 'px', height: 2 * R + 'px', background: SW[last[1]], opacity: (0.35 * (1 - q)).toFixed(3) }); } else w.style.opacity = 0;
    const nm = 'Atlas Training', n = clamp(Math.floor((t - 1.0) * 22), 0, nm.length); $('#appName').textContent = t < 1 ? '' : nm.slice(0, n);
    op($('#car'), Math.floor(t * 3) % 2 ? 1 : 0.15);
    tf($('#upl'), { x: (1 - P(t, 0.9, 1.3, E.oBack)) * -20, o: P(t, 0.9, 1.2) });
  };
}

if (SLIDE === 3) {
  const STU = [['MA', 'María Aguilar', '#2680FF,#00C9E0'], ['JM', 'Joaquín Muñoz', '#8B5CF6,#2680FF'], ['CP', 'Camila Pérez', '#FF6A3D,#F5A524']];
  scene.innerHTML = `
  <div class="card" id="code" style="left:60px;top:630px;width:960px;height:200px;padding:32px 36px;display:flex;align-items:center;justify-content:space-between">
    <div><div class="lab">Tu código de coach</div><div id="cd" style="font:800 78px/1 'JetBrains Mono';letter-spacing:.06em;margin-top:16px"></div></div>
    <div class="btn" id="cpy" style="width:210px;position:relative;overflow:hidden"><span id="cpA">Copiar</span><span id="cpB" class="abs" style="inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#1FB877,#0E7A50)">${check()} Copiado</span></div>
  </div>
  <div class="card" id="ros" style="left:60px;top:860px;width:960px;height:320px;padding:26px 30px">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="font:800 26px Inter">Alumnos activos</div><div style="display:flex;align-items:baseline;gap:8px"><div id="cnt" style="font:900 52px/1 'ArchivoW';font-stretch:80%;height:52px;overflow:hidden;position:relative;width:70px;text-align:right"><div id="c0" class="abs" style="right:0"></div><div id="c1" class="abs" style="right:0"></div></div></div></div>
    <div style="position:relative;margin-top:14px;height:230px;overflow:hidden">${STU.map((s, i) => `<div class="row abs" style="left:0;right:0;top:${i * 78}px;height:70px;display:flex;align-items:center;gap:16px;padding:0 10px;border-radius:18px"><div class="av" style="background:linear-gradient(135deg,${s[2]})">${s[0]}</div><div style="font:700 22px Inter">${s[1]}</div><div class="new chip" style="margin-left:auto;background:#DBF5EA;color:#0E7A50">${check('#0E7A50', 18)} Se unió ahora</div></div>`).join('')}</div>
  </div>`;
  const rows = $$('.row'), news = $$('.new');
  MOVES = [[1.25, 1.75, () => ctr($('#cpy')), 60], [2.1, 2.8, () => [1150, 1420], 40]];
  CLICKS = [1.8]; CUR_VIS = [[1.2, 2.8]];
  const JOIN = [2.25, 2.7, 3.15];
  JOIN.forEach((j, i) => burst(j, () => ctr(news[i]), 18, 10 + i, ['31,184,119', '38,128,255'], 420, 0.6));
  SCENE = t => {
    const e = P(t, 0.45, 1.2, E.oExpo); tf($('#code'), { y: (1 - e) * 80, s: lerp(0.94, 1, e), o: e });
    const e2 = P(t, 0.6, 1.35, E.oExpo); tf($('#ros'), { y: (1 - e2) * 120, o: e2 });
    // scramble decode
    const target = 'ATLAS-24', A = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', r = rng(Math.floor(t * 30) + 1);
    $('#cd').textContent = [...target].map((ch, i) => { const done = t > 0.7 + i * 0.09; return ch === '-' ? '-' : done ? ch : A[Math.floor(r() * A.length)]; }).join('');
    const cp = P(t, 1.8, 2.1, E.oBack); tf($('#cpB'), { y: (1 - cp) * 62 }); tf($('#cpA'), { y: -cp * 62 }); tf($('#cpy'), { s: 1 - 0.07 * pulse(t, 1.8) });
    rows.forEach((row, i) => { const q = P(t, JOIN[i], JOIN[i] + 0.55, E.oBack); tf(row, { y: (1 - q) * 90, o: clamp(q * 1.6) }); row.style.background = `rgba(38,128,255,${(0.1 * Math.max(0, 1 - (t - JOIN[i]) / 0.8) * (t > JOIN[i] ? 1 : 0)).toFixed(3)})`; tf(news[i], { s: P(t, JOIN[i] + 0.2, JOIN[i] + 0.5, E.oBack), o: P(t, JOIN[i] + 0.2, JOIN[i] + 0.35) }); });
    let n = 12 + JOIN.filter(j => t >= j).length, last = JOIN.filter(j => t >= j).pop();
    const q = last ? P(t, last, last + 0.35, E.oBack) : 1;
    $('#c0').textContent = n - 1; $('#c1').textContent = n; tf($('#c0'), { y: -52 * q, o: 1 - q }); tf($('#c1'), { y: 52 * (1 - q) });
    if (!last) { $('#c1').textContent = 12; tf($('#c0'), { o: 0 }); }
  };
}

if (SLIDE === 4) {
  const D = [['LUN', 'Pierna', [['Sentadilla trasera', '#F59E0B'], ['Peso muerto rumano', '#D97706'], ['Hip thrust', '#F97316']]],
  ['MIÉ', 'Empuje', [['Press banca', '#3B82F6'], ['Press militar', '#8B5CF6'], ['Fondos', '#DC2626']]],
  ['VIE', 'Tirón', [['Dominadas', '#10B981'], ['Remo con barra', '#059669'], ['Face pull', '#7C3AED']]]];
  scene.innerHTML = `
  <div class="card" id="brd" style="left:60px;top:630px;width:960px;height:550px;padding:26px">
    <div style="display:flex;gap:18px">${D.map(d => `<div style="flex:1;height:498px;border-radius:24px;background:#F4F6F8;padding:18px 14px">
      <div class="lab">${d[0]}</div><div style="font:900 34px 'ArchivoW';font-stretch:80%;margin-top:4px">${d[1]}</div>
      <div style="margin-top:14px">${d[2].map(e => `<div class="blk" style="position:relative;height:94px;margin-bottom:12px;border-radius:18px;background:#fff;border:1px solid var(--line);padding:16px 16px 0 22px;box-shadow:0 10px 20px -14px rgba(11,30,70,.4);overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:7px;background:${e[1]}"></div><div style="font:800 19px Inter;white-space:nowrap">${e[0]}</div><div class="bm" style="font:600 15px 'JetBrains Mono';color:var(--muted);margin-top:8px">3×10 · 60s</div><div class="bg" style="position:absolute;inset:0;border-radius:18px;box-shadow:inset 0 0 0 3px #2680FF;opacity:0"></div></div>`).join('')}</div></div>`).join('')}</div>
  </div>
  <div class="card" id="det" style="left:110px;top:900px;width:860px;height:250px;padding:28px 32px">
    <div style="display:flex;align-items:center;gap:14px"><div style="width:10px;height:56px;border-radius:6px;background:#F59E0B"></div><div><div class="lab">Lunes · Bloque 1</div><div style="font:900 40px 'ArchivoW';font-stretch:80%;margin-top:4px">SENTADILLA TRASERA</div></div></div>
    <div style="display:flex;gap:12px;margin-top:24px">${[['SERIES', '4'], ['REPS', '8-10'], ['RIR', '2'], ['DESCANSO', '90s']].map(([l, v]) => `<div class="fv" style="flex:1;height:84px;border-radius:18px;background:#F4F6F8;padding:12px 16px"><div class="lab" style="font-size:12px">${l}</div><div style="font:900 34px/1 'ArchivoW';font-stretch:80%;margin-top:8px">${v}</div></div>`).join('')}
      <div class="fv" style="flex:1.5;height:84px;border-radius:18px;background:#E8F1FF;padding:12px 16px;display:flex;align-items:center;justify-content:space-between"><div><div class="lab" style="font-size:12px;color:#1462DC">PROGRESIÓN</div><div style="font:800 18px Inter;margin-top:6px;color:#1462DC">Doble</div></div><div id="tg" style="width:56px;height:32px;border-radius:16px;background:#CDD3DB;position:relative"><i id="tk" style="position:absolute;left:4px;top:4px;width:24px;height:24px;border-radius:50%;background:#fff"></i></div></div></div>
  </div>`;
  const blks = $$('.blk'), bgs = $$('.bg'), fvs = $$('.fv');
  MOVES = [[2.1, 2.55, () => ctr(blks[0]), 60], [3.0, 3.5, () => ctr($('#tg')), 50], [3.8, 4.5, () => [1150, 1420], 40]];
  CLICKS = [2.6, 3.55]; CUR_VIS = [[2.0, 4.5]];
  const order = [0, 3, 6, 1, 4, 7, 2, 5, 8];
  SCENE = t => {
    const e = P(t, 0.45, 1.2, E.oExpo); tf($('#brd'), { y: (1 - e) * 90, o: e, s: lerp(0.95, 1, e) });
    order.forEach((b, k) => { const a = 0.85 + k * 0.1, q = P(t, a, a + 0.5, E.io3), land = P(t, a + 0.45, a + 0.9, E.oElastic); const arc = Math.sin(Math.PI * q) * 120;
      tf(blks[b], { x: (1 - q) * 700, y: -arc * (1 - q) - (1 - q) * 80, r: (1 - q) * 14, sy: q >= 1 ? lerp(0.8, 1, land) : 1, o: clamp(q * 3) }); blks[b].style.transformOrigin = '50% 100%'; op(bgs[b], Math.max(0, 1 - (t - a - 0.5) / 0.6) * (t > a + 0.5 ? 1 : 0)); });
    const d = P(t, 2.65, 3.2, E.oBack); tf($('#det'), { y: (1 - d) * 300, s: lerp(0.9, 1, d), o: clamp(d * 1.5) });
    fvs.forEach((f, i) => tf(f, { y: (1 - P(t, 2.8 + i * 0.06, 3.2 + i * 0.06, E.oBack)) * 30, o: P(t, 2.8 + i * 0.06, 3.0 + i * 0.06) }));
    const tg = P(t, 3.55, 3.8, E.oBack); tf($('#tk'), { x: tg * 24 }); $('#tg').style.background = mix('#CDD3DB', '#2680FF', clamp(tg));
    $('.bm', blks[0]).textContent = t > 3.2 ? '4×8-10 · 90s' : '3×10 · 60s';
  };
}

if (SLIDE === 5) {
  const M = [['Proteína', 160, 'g', '#2680FF'], ['Carbos', 250, 'g', '#18ABD4'], ['Grasas', 70, 'g', '#FF6A3D']];
  const MEALS = [['Desayuno', 520, 'Avena · Plátano · Whey', '#F5A524'], ['Almuerzo', 780, 'Pollo · Arroz · Palta', '#1FB877'], ['Snack', 310, 'Yogur · Nueces', '#8B5CF6'], ['Cena', 740, 'Salmón · Papas · Ensalada', '#2680FF']];
  scene.innerHTML = `
  <div class="card" id="nc" style="left:60px;top:630px;width:960px;height:550px;padding:30px 34px">
    <div style="display:flex;align-items:center;gap:40px">
      <div style="position:relative;width:230px;height:230px;flex:none"><svg width="230" height="230" viewBox="0 0 230 230">
        <circle cx="115" cy="115" r="96" fill="none" stroke="#EEF1F4" stroke-width="22"/>
        ${M.map((m, i) => `<circle class="arc" cx="115" cy="115" r="96" fill="none" stroke="${m[3]}" stroke-width="22" stroke-linecap="round" transform="rotate(-90 115 115)"/>`).join('')}</svg>
        <div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div id="kc" style="font:900 58px/1 'ArchivoW';font-stretch:78%">0</div><div class="lab" style="margin-top:6px">KCAL / DÍA</div></div></div>
      <div style="flex:1">${M.map(m => `<div class="mb" style="margin-bottom:22px"><div style="display:flex;justify-content:space-between;font:800 21px Inter"><span>${m[0]}</span><span class="mv mono" style="font-family:'JetBrains Mono'">0 ${m[2]}</span></div><div style="margin-top:10px;height:16px;border-radius:9px;background:#EEF1F4;overflow:hidden"><div class="mf" style="height:100%;width:0;border-radius:9px;background:${m[3]}"></div></div></div>`).join('')}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px">${MEALS.map(m => `<div class="meal" style="height:104px;border-radius:20px;background:#F4F6F8;padding:16px 18px;position:relative"><div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;align-items:center;gap:10px;font:800 21px Inter"><i style="width:12px;height:12px;border-radius:50%;background:${m[3]}"></i>${m[0]}</div><div style="font:700 17px 'JetBrains Mono';color:var(--muted)">${m[1]} kcal</div></div><div style="font:500 16px Inter;color:var(--muted);margin-top:12px">${m[2]}</div></div>`).join('')}</div>
  </div>`;
  const arcs = $$('.arc'), mfs = $$('.mf'), mvs = $$('.mv'), meals = $$('.meal'), Cc = 2 * Math.PI * 96;
  const share = [0.27, 0.43, 0.27], gap = 0.012;
  SCENE = t => {
    const e = P(t, 0.45, 1.2, E.oExpo); tf($('#nc'), { y: (1 - e) * 90, o: e, s: lerp(0.95, 1, e) });
    let start = 0;
    arcs.forEach((a, i) => { const q = P(t, 1.0 + i * 0.25, 1.7 + i * 0.25, E.io3), len = Math.max(0.001, (share[i] - gap) * q) * Cc; a.style.strokeDasharray = `${len} ${Cc}`; a.style.strokeDashoffset = (-start * Cc).toFixed(1); start += share[i] + gap / 3; });
    const k = P(t, 1.0, 2.3, E.o3); $('#kc').textContent = Math.round(2350 * k).toLocaleString('es-CL');
    M.forEach((m, i) => { const q = P(t, 1.1 + i * 0.15, 1.9 + i * 0.15, E.o5); mfs[i].style.width = (q * [72, 86, 58][i]) + '%'; mvs[i].textContent = Math.round(m[1] * q) + ' ' + m[2]; });
    meals.forEach((m, i) => { const q = P(t, 1.9 + i * 0.12, 2.5 + i * 0.12, E.oBack); tf(m, { y: (1 - q) * 50, s: lerp(0.9, 1, q), o: clamp(q * 1.5) }); });
  };
}

if (SLIDE === 6) {
  const SETS = [['80', '10'], ['80', '9'], ['80', '8'], ['82,5', '8']];
  scene.innerHTML = `
  <div class="phone" id="ph" style="left:90px;top:586px;width:350px;height:610px"><div class="scr">
    <div class="isl"></div><div class="sb"><span>9:41</span><span>●●●</span></div>
    <div style="position:absolute;left:22px;right:22px;top:62px"><div class="lab" style="font-size:12px;color:#1462DC">PIERNA · BLOQUE 1</div><div style="font:900 30px/1.05 Archivo;letter-spacing:-.02em;margin-top:6px">Sentadilla<br>trasera</div><div style="font:600 14px 'JetBrains Mono';color:var(--muted);margin-top:6px">4 × 8-10 · RIR 2 · 90s</div></div>
    <div style="position:absolute;left:18px;right:18px;top:196px">${SETS.map((s, i) => `<div class="set" style="height:64px;border-radius:18px;background:#fff;border:1px solid var(--line);margin-bottom:8px;display:flex;align-items:center;padding:0 14px;gap:12px;position:relative;overflow:hidden"><div class="sbg abs" style="inset:0;background:#DBF5EA;opacity:0"></div><div style="position:relative;width:34px;height:34px;border-radius:10px;background:#F4F6F8;display:flex;align-items:center;justify-content:center;font:800 16px Inter">${i + 1}</div><div style="position:relative;font:800 22px Inter">${s[0]}<span style="font:600 14px Inter;color:var(--muted)"> kg</span> × ${s[1]}</div><div class="ck" style="position:relative;margin-left:auto;width:36px;height:36px;border-radius:50%;background:#1FB877;display:flex;align-items:center;justify-content:center">${check('#fff', 20)}</div></div>`).join('')}</div>
    <div style="position:absolute;left:18px;right:18px;bottom:20px;height:58px;border-radius:18px;background:linear-gradient(135deg,#2680FF,#1462DC);color:#fff;display:flex;align-items:center;justify-content:center;font:800 17px Inter">Registrar serie</div>
  </div></div>
  <div class="card" id="tm" style="left:490px;top:640px;width:530px;height:250px;padding:28px 32px;display:flex;align-items:center;gap:30px">
    <div style="position:relative;width:180px;height:180px;flex:none"><svg width="180" height="180" viewBox="0 0 180 180"><circle cx="90" cy="90" r="76" fill="none" stroke="#EEF1F4" stroke-width="16"/><circle id="tr" cx="90" cy="90" r="76" fill="none" stroke="url(#tgd)" stroke-width="16" stroke-linecap="round" transform="rotate(-90 90 90)" stroke-dasharray="477.5"/><defs><linearGradient id="tgd" x1="0" x2="1"><stop offset="0" stop-color="#2680FF"/><stop offset="1" stop-color="#00C9E0"/></linearGradient></defs></svg>
      <div id="tt" class="abs" style="inset:0;display:flex;align-items:center;justify-content:center;font:900 48px 'ArchivoW';font-stretch:78%">1:30</div></div>
    <div><div class="lab">Descanso</div><div id="tmsg" style="font:900 34px/1.05 'ArchivoW';font-stretch:80%;margin-top:10px">RESPIRA.<br>VIENE LA 4ª</div></div>
  </div>
  <div class="card" id="pr" style="left:520px;top:930px;width:500px;height:190px;padding:26px 30px;display:flex;align-items:center;gap:22px;background:linear-gradient(135deg,#0B0E13,#1B2129);color:#fff">
    <div style="width:84px;height:84px;border-radius:24px;background:rgba(245,165,36,.18);display:flex;align-items:center;justify-content:center;flex:none">${ICON.trophy('#F5A524')}</div>
    <div><div class="lab" style="color:#F5A524">Nuevo récord</div><div style="font:900 40px/1 'ArchivoW';font-stretch:80%;margin-top:8px">+2,5 KG</div><div style="font:600 17px Inter;color:#A8B1BD;margin-top:6px">Sentadilla · Semana 4</div></div>
  </div>`;
  const sets = $$('.set'), cks = $$('.ck'), sbg = $$('.sbg');
  const DONE = [1.15, 1.45, 1.75, 4.25];
  DONE.forEach((d, i) => burst(d, () => ctr(cks[i]), 14, 20 + i, ['31,184,119', '38,128,255'], 380, 0.55));
  burst(3.6, () => ctr($('#pr')), 40, 30, ['245,165,36', '38,128,255', '11,14,19'], 800, 0.9);
  SCENE = t => {
    const p = P(t, 0.45, 1.3, E.oExpo); tf($('#ph'), { y: (1 - p) * 520 + Math.sin(t * 1.6) * 5 * p, r: (1 - p) * -8, o: 1 });
    sets.forEach((s, i) => tf(s, { x: (1 - P(t, 0.8 + i * 0.07, 1.2 + i * 0.07, E.oExpo)) * -40, o: P(t, 0.8 + i * 0.07, 1.1 + i * 0.07) }));
    cks.forEach((c, i) => { const q = P(t, DONE[i], DONE[i] + 0.3, E.oBack); tf(c, { s: q, o: clamp(q * 2) }); op(sbg[i], clamp(q) * 0.9); });
    const e = P(t, 1.9, 2.5, E.oBack); tf($('#tm'), { x: (1 - e) * 200, s: lerp(0.85, 1, e), o: clamp(e * 1.5) });
    const rt = clamp((t - 2.3) / 1.8), left = Math.round(90 * (1 - rt));
    $('#tr').style.strokeDashoffset = (477.5 * rt).toFixed(1);
    $('#tt').textContent = t < 4.1 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '¡YA!';
    $('#tmsg').innerHTML = t < 4.1 ? 'RESPIRA.<br>VIENE LA 4ª' : '¡A LA<br>SIGUIENTE!';
    tf($('#tt'), { s: 1 + 0.18 * pulse(t, 4.15, 0.2) });
    const r = P(t, 3.5, 4.0, E.oBack); tf($('#pr'), { y: (1 - r) * 160, s: lerp(0.8, 1, r), r: (1 - r) * -6, o: clamp(r * 1.6) });
  };
}

if (SLIDE === 7) {
  const WK = [58, 64, 71, 69, 80, 86, 90, 94];
  const BD = [['constancia', 'Constancia'], ['mes-constante', 'Mes constante'], ['meta-proteina', 'Meta de proteína']];
  scene.innerHTML = `
  <div class="card" id="ch" style="left:60px;top:630px;width:960px;height:300px;padding:26px 32px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="lab">Adherencia semanal</div><div style="font:800 20px Inter;margin-top:8px;color:var(--muted)">María Aguilar · 8 semanas</div></div><div style="text-align:right"><div id="pct" style="font:900 64px/1 'ArchivoW';font-stretch:78%;color:#1462DC">0%</div><div class="chip" id="up" style="margin-top:6px;height:34px;font-size:15px;background:#DBF5EA;color:#0E7A50">▲ +36 pts</div></div></div>
    <div style="position:absolute;left:32px;right:32px;bottom:26px;height:140px;display:flex;align-items:flex-end;gap:14px">${WK.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px"><div class="bar" style="width:100%;height:${v * 1.1}px;border-radius:12px 12px 6px 6px;background:${i === 7 ? 'linear-gradient(180deg,#00C9E0,#2680FF)' : 'linear-gradient(180deg,#93BEFF,#5C9DFF)'};transform-origin:50% 100%"></div><div style="font:700 13px 'JetBrains Mono';color:var(--dim)">S${i + 1}</div></div>`).join('')}</div>
  </div>
  <div class="card" id="bgd" style="left:60px;top:960px;width:960px;height:220px;padding:20px 26px;display:flex;align-items:center;justify-content:space-around">
    ${BD.map(b => `<div class="bdg" style="display:flex;flex-direction:column;align-items:center;gap:8px;position:relative"><div class="glw abs" style="left:50%;top:70px;width:180px;height:180px;margin:-90px 0 0 -90px;border-radius:50%;background:radial-gradient(circle,rgba(245,165,36,.45),transparent 65%)"></div><img src="${b[0]}.webp" style="width:140px;height:140px;position:relative"><div style="font:800 17px Inter;position:relative">${b[1]}</div></div>`).join('')}
  </div>
  <div class="chip abs" id="strk" style="left:640px;top:915px;height:50px;font-size:19px;background:#0B0E13;color:#fff;box-shadow:0 14px 30px -12px rgba(11,14,19,.6);z-index:3"><span style="color:#FF8C66">●</span> 12 días seguidos</div>`;
  const bars = $$('.bar'), bdg = $$('.bdg'), glw = $$('.glw');
  [2.3, 2.6, 2.9].forEach((b, i) => burst(b, () => { const r = rc($('img', bdg[i])); return [r.left + r.width / 2, r.top + r.height / 2]; }, 26, 40 + i, ['245,165,36', '255,106,61', '38,128,255'], 600, 0.8));
  SCENE = t => {
    const e = P(t, 0.45, 1.2, E.oExpo); tf($('#ch'), { y: (1 - e) * 90, o: e });
    bars.forEach((b, i) => tf(b, { sy: P(t, 0.9 + i * 0.08, 1.5 + i * 0.08, E.oBack) }));
    $('#pct').textContent = Math.round(94 * P(t, 0.9, 1.9, E.o3)) + '%';
    tf($('#up'), { s: P(t, 1.8, 2.1, E.oBack), o: P(t, 1.8, 1.95) });
    const e2 = P(t, 1.6, 2.2, E.oExpo); tf($('#bgd'), { y: (1 - e2) * 90, o: e2 });
    bdg.forEach((b, i) => { const a = 2.3 + i * 0.3, q = P(t, a - 0.15, a + 0.45, E.oBack); tf(b, { s: lerp(0.2, 1, q), r: (1 - q) * -40 + Math.sin(t * 2 + i) * 2 * q, y: Math.sin(t * 1.8 + i * 1.3) * 4 * q, o: clamp(q * 2) }); op(glw[i], clamp(q) * (0.6 + 0.4 * Math.sin(t * 3 + i))); });
    const s = P(t, 3.3, 3.7, E.oBack); tf($('#strk'), { s: lerp(0.4, 1, s), o: clamp(s * 2), r: (1 - s) * 8 });
  };
}

if (SLIDE === 8) {
  scene.innerHTML = `
  <div class="abs" id="cbt" style="left:60px;top:640px;height:96px;padding:0 44px;border-radius:30px;background:#0B0E13;color:#fff;display:flex;align-items:center;gap:18px;font:800 32px Inter;box-shadow:0 24px 50px -18px rgba(11,14,19,.6)">Crea tu cuenta gratis <svg width="40" height="22" viewBox="0 0 44 20"><path d="M2 10h36M30 3l8 7-8 7" fill="none" stroke="#00F7F7" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div id="lock" class="abs" style="left:0;top:0;width:1080px;height:1350px">
    <div id="cMark" class="mk abs" style="left:430px;top:790px;width:190px;height:231px"></div>
    <div id="cEva" class="abs" style="left:0;right:0;top:1020px;text-align:center;font-size:150px;line-height:1"><span class="eva" style="display:inline-flex"><span id="e1">E</span><span id="e2">V</span><span id="e3">A</span></span></div>
  </div>`;
  burst(1.55, () => [540, 1080], 50, 7, ['11,14,19', '255,255,255', '38,128,255'], 900, 0.9);
  SCENE = t => {
    const b = P(t, 0.55, 1.1, E.oBack); tf($('#cbt'), { x: (1 - b) * -80, s: lerp(0.8, 1, b) * (1 + 0.025 * Math.sin(Math.max(0, t - 2) * 5)), o: clamp(b * 2) });
    const m = $('#cMark'), q = P(t, 0.8, 1.7, E.oExpo);
    m.style.clipPath = diagClip(P(t, 0.8, 1.4, E.io3) * 2);
    tf(m, { y: lerp(40, 0, q) + Math.sin(t * 2) * 5 * P(t, 1.7, 2.2), s: lerp(0.85, 1, q), r: lerp(-8, 0, q) });
    ['#e1', '#e2', '#e3'].forEach((id, i) => { const e = P(t, 1.2 + i * 0.11, 1.7 + i * 0.11, E.oExpo); $(id).style.display = 'inline-block'; tf($(id), { x: [-60, 0, 60][i] * (1 - e), y: [0, 40, 0][i] * (1 - e), s: lerp(1.8, 1, e), o: P(t, 1.2 + i * 0.11, 1.32 + i * 0.11, E.lin), blur: (1 - e) * 14 }); });
  };
}

/* ------------------------------------------------------------ COMMON ANIM */
const grainC = $('#grain').getContext('2d');
const grainTiles = Array.from({ length: 4 }, (_, k) => { const r = rng(100 + k); const img = grainC.createImageData(540, 675); for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } return img; });
const cur = $('#cursor'), ring = $('#ring');

function render(t) {
  // bg motion
  tf($('#b1'), { x: Math.sin(t * 0.6) * 40, y: Math.cos(t * 0.5) * 30 });
  tf($('#b2'), { x: Math.cos(t * 0.4) * 50, y: Math.sin(t * 0.7) * 30 });
  tf($('#b3'), { x: Math.sin(t * 0.8 + 1) * 30, y: Math.cos(t * 0.6) * 40 });
  tf($('#dots'), { y: (t * 8) % 30 });
  const bn = P(t, 0, 1.2, E.oExpo); tf($('#bigNum'), { x: (1 - bn) * 120 + Math.sin(t * 0.5) * 8, o: bn });
  // header progress
  dashes.forEach((d, i) => d.style.width = (i < SLIDE - 1 ? 100 : i === SLIDE - 1 ? 100 * P(t, 0, DUR - 0.2, E.lin) : 0) + '%');
  // kicker + headline
  const k = P(t, 0.02, 0.5, E.oExpo); tf($('#kick'), { x: (1 - k) * -40, o: k });
  W1.concat(W2).forEach((w, i) => { const e = P(t, 0.08 + i * 0.07, 0.75 + i * 0.07, E.oExpo); tf(w, { y: (1 - e) * 130, r: (1 - e) * 6 }); });
  // gradient shine on accent line
  if (SLIDE !== 8) W2.forEach(w => { const q = clamp((t - 3.0) / 0.9); w.style.backgroundImage = `linear-gradient(100deg,transparent ${(q * 160 - 40).toFixed(1)}%,rgba(255,255,255,.85) ${(q * 160 - 30).toFixed(1)}%,transparent ${(q * 160 - 20).toFixed(1)}%),linear-gradient(95deg,#2680FF 0%,#18ABD4 60%,#0B8FB0 100%)`; });
  const u = P(t, 0.55 + W1.length * 0.07, 1.1 + W1.length * 0.07, E.o5); tf($('#under'), { sx: Math.max(0.001, u) });
  WS.forEach((w, i) => { const e = P(t, 0.4 + i * 0.03, 0.95 + i * 0.03, E.oExpo); tf(w, { y: (1 - e) * 50, o: e }); });
  // track
  const x0 = SLIDE === 1 ? 60 : 0, x1 = SLIDE === 8 ? 540 : 1110, tq = P(t, 0.3, DUR - 0.4, SLIDE === 8 ? E.o3 : E.lin);
  const hx = lerp(x0, x1, tq); $('#track .tl').style.left = x0 + 'px'; $('#track .tl').style.width = Math.max(0, hx - x0) + 'px';
  tf($('#track .hd'), { x: hx - 8, s: 1 + 0.15 * Math.sin(t * 6) });
  // swipe hint
  tf($('#swA'), { x: Math.max(0, Math.sin(t * 4)) * 10 });
  SCENE(t);
  // cursor
  let cv = 0; for (const [a, b] of CUR_VIS) if (t > a - 0.2 && t < b + 0.2) cv = Math.max(cv, Math.min(P(t, a - 0.2, a + 0.05), 1 - P(t, b - 0.05, b + 0.2)));
  const [px, py] = cursorPos(t); let pr = 0; CLICKS.forEach(c => pr = Math.max(pr, pulse(t, c, 0.09)));
  tf(cur, { x: px - 5, y: py - 4, s: 1 - 0.18 * pr, o: cv });
  let rp = -1; CLICKS.forEach(c => { if (t >= c && t < c + 0.5) rp = (t - c) / 0.5; });
  if (rp >= 0 && cv > 0) tf(ring, { x: px - 42, y: py - 42, s: 0.2 + E.o3(rp) * 1.1, o: (1 - rp) * 0.9 }); else op(ring, 0);
  // bursts
  fx.clearRect(0, 0, 1080, 1350);
  for (const b of BURSTS) { const q = (t - b.t0) / b.life; if (q < 0 || q > 1) continue; const [ox, oy] = b.at();
    for (const p of b.ps) { const d = p.v * (1 - Math.pow(1 - q, 3)) * b.life * 0.45, x = ox + Math.cos(p.a) * d, y = oy + Math.sin(p.a) * d + q * q * 140;
      fx.fillStyle = `rgba(${p.c},${(1 - q).toFixed(3)})`; if (p.sq) { fx.save(); fx.translate(x, y); fx.rotate(p.a + q * 7); fx.fillRect(-p.s, -p.s * 0.35, p.s * 2.2, p.s * 0.7); fx.restore(); } else { fx.beginPath(); fx.arc(x, y, p.s * (1 - q * 0.5), 0, 6.283); fx.fill(); } }
    if (q < 0.5) { fx.strokeStyle = `rgba(38,128,255,${(0.7 * (1 - q * 2)).toFixed(3)})`; fx.lineWidth = 3; fx.beginPath(); fx.arc(ox, oy, E.o3(q * 2) * 170, 0, 6.283); fx.stroke(); } }
  grainC.putImageData(grainTiles[Math.floor(t * 30) % 4], 0, 0);
}

function layout() {
  const r2 = rc(l2), hb = rc($('#head'));
  // underline under the accent line (width = text width)
  let w = 0; W2.forEach(s => { const r = rc(s.parentNode); w = Math.max(w, r.right - 62); });
  Object.assign($('#under').style, { top: (r2.bottom + 4) + 'px', width: Math.min(956, w) + 'px' });
  $('#sub').style.top = (r2.bottom + 42) + 'px';
}
window.render = render; window.DUR = DUR;
window.__ready = document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => { })))).then(() => { layout(); render(0); return true; });
