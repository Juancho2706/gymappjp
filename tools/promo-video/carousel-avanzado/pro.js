/* EVA carousel #2 — "Nivel avanzado": double progression + HR-zone intervals. ?s=1..8, render(t) deterministic. */
const SLIDE = Math.max(1, Math.min(8, +(new URLSearchParams(location.search).get('s') || 1)));
const DUR = 6;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  lin: x => x, o3: x => 1 - Math.pow(1 - x, 3), o5: x => 1 - Math.pow(1 - x, 5),
  oExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)), i3: x => x * x * x,
  io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  oBack: x => { const s = 1.9; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  oElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3.2) + 1),
};
const P = (t, a, b, e = E.o5) => e(clamp((t - a) / (b - a)));
const pulse = (t, c, w = 0.1) => Math.max(0, 1 - Math.abs(t - c) / w);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function tf(el, o = {}) {
  const { x = 0, y = 0, s = 1, r = 0, rx = 0, ry = 0 } = o; const sx = o.sx ?? s, sy = o.sy ?? s;
  el.style.transform = `perspective(1400px) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${r.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  if (o.o !== undefined) { el.style.opacity = o.o.toFixed(4); el.style.visibility = o.o <= 0.001 ? 'hidden' : 'visible'; }
  if (o.blur !== undefined) el.style.filter = o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
const op = (el, o) => { el.style.opacity = o.toFixed(4); el.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; };
const h = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
const rc = el => el.getBoundingClientRect();
const ctr = el => { const r = rc(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
function diagClip(k) {
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]], u = p => p[0] + (1 - p[1]) - k, out = [];
  for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4], ua = u(a), ub = u(b); if (ua <= 0) out.push(a); if ((ua <= 0) !== (ub <= 0)) { const f = ua / (ua - ub); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } }
  return out.length < 3 ? 'polygon(0 0,0 0,0 0)' : 'polygon(' + out.map(p => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`).join(',') + ')';
}
const check = (c = '#05070D', w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ZC = { 1: '#5C9DFF', 2: '#18ABD4', 3: '#1FB877', 4: '#F5A524', 5: '#FF4D4D' };
// Karvonen for a 30-year-old, resting HR 60 → FCmax (Tanaka) 187, reserve 127
const ZONES = [[1, 124, 136], [2, 136, 149], [3, 149, 162], [4, 162, 174], [5, 174, 187]];

/* ------------------------------------------------------------ COPY */
const A = ['#FF6A3D', '#F5A524'], B = ['#00F7F7', '#2680FF'], X = ['#00F7F7', '#FF6A3D'];
const SL = {
  1: { chap: '', ct: '2 FUNCIONES QUE PARECEN DIFÍCILES', l1: 'LO DIFÍCIL,', l2: 'HECHO FÁCIL.', sub: 'Doble progresión y cardio por zonas de FC. Así se hacen en EVA.', acc: X, big: '2', foot: 'DOBLE PROGRESIÓN · ZONAS FC' },
  2: { chap: 'A', ct: 'FUERZA', step: 1, l1: 'DOBLE', l2: 'PROGRESIÓN.', sub: 'Primero suben las <b>reps</b>. Cuando llena el rango, sube el <b>peso</b>.', acc: A, big: 'A', foot: 'CAP. A · EL CONCEPTO' },
  3: { chap: 'A', ct: 'FUERZA', step: 2, l1: 'ACTÍVALA', l2: 'EN 3 TOQUES.', sub: 'Dentro del bloque del ejercicio, en el builder de rutinas.', acc: A, big: 'A', foot: 'CAP. A · CÓMO SE HACE' },
  4: { chap: 'A', ct: 'FUERZA', step: 3, l1: 'EVA LLEVA', l2: 'LA CUENTA.', sub: 'Tu alumno registra sus series. EVA sabe cuándo toca subir.', acc: A, big: 'A', foot: 'CAP. A · EL RESULTADO' },
  5: { chap: 'B', ct: 'CARDIO', step: 1, l1: 'ZONAS DE FC', l2: 'A SU MEDIDA.', sub: 'Z4 no es igual para todos. EVA calcula los <b>bpm</b> de cada alumno.', acc: B, big: 'B', foot: 'CAP. B · EL CONCEPTO' },
  6: { chap: 'B', ct: 'CARDIO', step: 2, l1: 'UN HIIT,', l2: 'EN UN TOQUE.', sub: 'Aplica una plantilla de intervalos y el bloque se arma solo.', acc: B, big: 'B', foot: 'CAP. B · CÓMO SE HACE' },
  7: { chap: 'B', ct: 'CARDIO', step: 3, l1: 'TU ALUMNO', l2: 'SIGUE EL RITMO.', sub: 'El timer lo guía fase por fase, con su zona objetivo en pantalla.', acc: B, big: 'B', foot: 'CAP. B · EL RESULTADO' },
  8: { chap: '', ct: 'PRUEBA EVA GRATIS', l1: 'LO DIFÍCIL,', l2: 'RESUELTO.', sub: 'Fuerza y cardio de nivel pro, en la app con tu marca.', acc: X, big: '', foot: 'EVA-APP.CL' },
};
const C = SL[SLIDE];
const stage = $('#stage');
stage.style.setProperty('--acc', C.acc[0]); stage.style.setProperty('--acc2', C.acc[1]);

/* ------------------------------------------------------------ COMMON BUILD */
$('#idx .n').innerHTML = `0${SLIDE}<span> / 08</span>`;
$('#bigL').textContent = C.big;
const badge = $('#chap .badge');
if (C.chap) { badge.textContent = C.chap; badge.style.background = `linear-gradient(135deg,${C.acc[0]},${C.acc[1]})`; $('#chap .ct').textContent = `CAPÍTULO ${C.chap} · ${C.ct}`; for (let i = 1; i <= 3; i++) $('#chap .steps').appendChild(h(`<i style="${i <= C.step ? `background:${C.acc[0]}` : ''}"></i>`)); }
else { badge.style.display = 'none'; $('#chap .ct').textContent = C.ct; $('#chap .ct').style.color = C.acc[0]; }
function chars(line, text, cls) { return [...text].map(c => { const s = h(`<span class="ch ${cls}">${c}</span>`); line.appendChild(s); return s; }); }
const l1 = h('<span class="ln"></span>'), l2 = h('<span class="ln"></span>'); $('#head').append(l1, l2);
const C1 = chars(l1, C.l1, ''), C2 = chars(l2, C.l2, 'acc');
$('#sub').innerHTML = C.sub;
$('#fl').textContent = C.foot;
if (SLIDE === 8) { $('#fr').textContent = 'LINK EN LA BIO'; $('#fa').style.display = 'none'; }
const scene = $('#scene');

/* ------------------------------------------------------------ CURSOR + FX */
let MOVES = [], CLICKS = [], CUR_START = [1150, 1420], CUR_VIS = [];
function cursorPos(t) { let p = CUR_START.slice(); for (const [a, b, fn, arc] of MOVES) { if (t <= a) break; const to = fn(), e = E.io3(clamp((t - a) / (b - a))); const dx = to[0] - p[0], dy = to[1] - p[1], L = Math.hypot(dx, dy) || 1, bump = Math.sin(Math.PI * e) * arc; p = [lerp(p[0], to[0], e) + (-dy / L) * bump, lerp(p[1], to[1], e) + (dx / L) * bump]; } return p; }
const fx = $('#fx').getContext('2d');
const BURSTS = [];
const hexrgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join(',');
function burst(t0, at, n, seed, cols, spd = 700, life = 0.8) { const r = rng(seed); BURSTS.push({ t0, at, life, ps: Array.from({ length: n }, () => ({ a: r() * 6.283, v: spd * (0.3 + r() * 0.7), s: 2 + r() * 5, c: cols[Math.floor(r() * cols.length)], sq: r() < 0.5 })) }); }
const ACC = [hexrgb(C.acc[0]), hexrgb(C.acc[1]), '255,255,255'];
let FLASHES = [];

/* ------------------------------------------------------------ SLIDES */
let SCENE = () => { };

if (SLIDE === 1) {
  scene.innerHTML = `
  <div class="panel" id="ca" style="left:60px;top:640px;width:468px;height:480px;padding:32px;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="width:62px;height:62px;border-radius:18px;background:linear-gradient(135deg,#FF6A3D,#F5A524);display:flex;align-items:center;justify-content:center;font:900 28px 'Unbounded';color:#05070D">A</div><div class="lab">FUERZA</div></div>
    <div style="font:800 34px/1.1 'Unbounded';margin-top:26px;letter-spacing:-.02em">Doble<br>progresión</div>
    <svg width="404" height="200" style="position:absolute;left:32px;bottom:30px" id="aSvg"></svg>
  </div>
  <div class="panel" id="cb" style="left:552px;top:640px;width:468px;height:480px;padding:32px;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="width:62px;height:62px;border-radius:18px;background:linear-gradient(135deg,#00F7F7,#2680FF);display:flex;align-items:center;justify-content:center;font:900 28px 'Unbounded';color:#05070D">B</div><div class="lab">CARDIO</div></div>
    <div style="font:800 34px/1.1 'Unbounded';margin-top:26px;letter-spacing:-.02em">HIIT por<br>zonas de FC</div>
    <div id="zb" style="position:absolute;left:32px;right:32px;bottom:30px;height:200px;display:flex;align-items:flex-end;gap:12px">${[1, 2, 3, 4, 5].map(z => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px"><div class="zbar" style="width:100%;height:${40 + z * 28}px;border-radius:12px;background:${ZC[z]};opacity:${z === 4 ? 1 : .35};transform-origin:50% 100%;${z === 4 ? `box-shadow:0 0 30px ${ZC[4]}` : ''}"></div><div style="font:700 15px 'JetBrains Mono';color:${z === 4 ? '#fff' : 'var(--muted)'}">Z${z}</div></div>`).join('')}</div>
  </div>`;
  // stepped strength bars
  const svg = $('#aSvg'); let g = '';
  const W = [[80, 10], [80, 11], [80, 12], [82.5, 8], [82.5, 10], [82.5, 12], [85, 8]];
  W.forEach((w, i) => { const hgt = 30 + i * 22; g += `<rect class="sb" x="${i * 58}" y="${170 - hgt}" width="44" height="${hgt}" rx="10" fill="${i === 3 || i === 6 ? 'url(#ag)' : 'rgba(255,106,61,.35)'}" style="transform-origin:${i * 58 + 22}px 170px"/>`; });
  g += `<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5A524"/><stop offset="1" stop-color="#FF6A3D"/></linearGradient></defs>`;
  g += `<text x="${3 * 58 + 22}" y="${170 - 96 - 12}" text-anchor="middle" fill="#F5A524" font-family="JetBrains Mono" font-weight="700" font-size="15">+2,5</text><text x="${6 * 58 + 22}" y="${170 - 162 - 12}" text-anchor="middle" fill="#F5A524" font-family="JetBrains Mono" font-weight="700" font-size="15">+2,5</text>`;
  svg.innerHTML = g;
  const sbs = $$('.sb', svg), zbars = $$('.zbar');
  SCENE = t => {
    const a = P(t, 0.55, 1.4, E.oExpo), b = P(t, 0.75, 1.6, E.oExpo);
    tf($('#ca'), { x: (1 - a) * -300, ry: (1 - a) * 35 + Math.sin(t * 0.9) * 2, y: Math.sin(t * 1.3) * 5, o: a });
    tf($('#cb'), { x: (1 - b) * 300, ry: (1 - b) * -35 - Math.sin(t * 0.9) * 2, y: Math.cos(t * 1.3) * 5, o: b });
    sbs.forEach((s, i) => { const q = P(t, 1.2 + i * 0.1, 1.7 + i * 0.1, E.oBack); s.style.transform = `scaleY(${q.toFixed(3)})`; });
    zbars.forEach((z, i) => tf(z, { sy: P(t, 1.4 + i * 0.09, 1.95 + i * 0.09, E.oBack) * (i === 3 ? 1 + 0.05 * Math.sin(t * 7) : 1) }));
  };
}

if (SLIDE === 2) {
  scene.innerHTML = `
  <div class="panel" id="pn" style="left:60px;top:640px;width:960px;height:480px;padding:34px 38px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="lab">Sentadilla trasera · 3 series</div><div style="font:800 30px 'Unbounded';margin-top:10px">Semana <span id="wk">1</span></div></div>
      <div style="text-align:right"><div class="lab">Peso</div><div style="display:flex;align-items:baseline;justify-content:flex-end;gap:10px;margin-top:6px"><div id="kg" style="position:relative;height:74px;width:250px;overflow:hidden;font:900 70px/1 'Unbounded';letter-spacing:-.04em"><div id="k0" class="abs" style="right:0"></div><div id="k1" class="abs" style="right:0"></div></div><div style="font:700 22px Inter;color:var(--muted)">kg</div></div></div>
    </div>
    <div style="position:absolute;left:38px;right:38px;top:190px;height:170px" id="rul">
      <div id="band" class="abs" style="top:40px;height:64px;border-radius:14px;background:linear-gradient(90deg,rgba(255,106,61,.18),rgba(245,165,36,.28));border:1.5px solid rgba(245,165,36,.55)"></div>
      <div id="bandLab" class="abs lab" style="top:8px;color:#F5A524">Rango objetivo · 8–12 reps</div>
      <div class="abs" style="left:0;right:0;top:118px;height:2px;background:var(--line2)"></div>
      <div id="ticks"></div>
      <div id="mk" class="abs" style="top:24px;width:0;height:0">
        <div class="abs" style="left:-3px;top:0;width:6px;height:96px;border-radius:3px;background:#fff;box-shadow:0 0 20px #fff"></div>
        <div id="mkl" class="abs" style="left:-54px;top:-44px;width:108px;height:40px;border-radius:12px;background:#fff;color:#05070D;display:flex;align-items:center;justify-content:center;font:800 18px Inter;white-space:nowrap"></div>
      </div>
    </div>
    <div id="done" class="tag" style="left:38px;bottom:34px;background:#F5A524"><b style="color:#F5A524">${check('#F5A524', 16)}</b>Rango completo → sube el peso</div>
    <div class="abs" style="right:38px;bottom:40px;display:flex;gap:10px">${[1, 2, 3, 4].map(i => `<div class="wc" style="height:36px;padding:0 14px;border-radius:10px;border:1.5px solid var(--line2);display:flex;align-items:center;font:700 15px 'JetBrains Mono';color:var(--muted)">S${i}</div>`).join('')}</div>
  </div>`;
  const R0 = 6, R1 = 14, Wd = 884, xr = r => (r - R0) / (R1 - R0) * Wd;
  Object.assign($('#band').style, { left: xr(8) + 'px', width: (xr(12) - xr(8)) + 'px' }); $('#bandLab').style.left = xr(8) + 'px';
  let tk = ''; for (let r = R0; r <= R1; r++) tk += `<div class="abs" style="left:${xr(r) - 1}px;top:110px;width:2px;height:16px;background:${r >= 8 && r <= 12 ? '#F5A524' : 'var(--line2)'}"></div><div class="abs mono" style="left:${xr(r) - 20}px;top:132px;width:40px;text-align:center;font:700 17px 'JetBrains Mono';color:${r >= 8 && r <= 12 ? '#fff' : 'var(--dim)'}">${r}</div>`;
  $('#ticks').innerHTML = tk;
  const STEPS = [[0.9, 8, 1], [1.9, 10, 2], [2.9, 12, 3], [4.0, 8, 4]];
  FLASHES = [[3.2, 0.35]];
  burst(3.2, () => ctr($('#mk')), 44, 5, ['245,165,36', '255,106,61', '255,255,255'], 900, 0.9);
  SCENE = t => {
    const e = P(t, 0.4, 1.2, E.oExpo); tf($('#pn'), { y: (1 - e) * 120, rx: (1 - e) * 18, o: e });
    let rep = 8, wk = 1, from = 8;
    STEPS.forEach(([tt, r, w], i) => { if (t >= tt) { from = i ? STEPS[i - 1][1] : 8; rep = r; wk = w; } });
    const cur = STEPS.filter(s => t >= s[0]).pop(), q = cur ? P(t, cur[0], cur[0] + 0.6, cur[1] < from ? E.io3 : E.oBack) : 1;
    const rv = cur ? lerp(from, rep, q) : 8;
    tf($('#mk'), { x: xr(rv) });
    $('#mkl').textContent = `${Math.round(rv)} reps`;
    $('#wk').textContent = wk;
    const up = P(t, 3.3, 3.75, E.oBack);
    $('#k0').textContent = '80'; $('#k1').textContent = '82,5';
    tf($('#k0'), { y: -80 * up, o: 1 - up }); tf($('#k1'), { y: 80 * (1 - up) }); $('#k1').style.color = up > 0.5 ? '#F5A524' : '#fff';
    const d = P(t, 3.2, 3.6, E.oBack); tf($('#done'), { s: lerp(0.5, 1, d), o: clamp(d * 2) });
    $('#band').style.boxShadow = `0 0 ${(40 * pulse(t, 3.2, 0.5)).toFixed(1)}px rgba(245,165,36,.9)`;
    $$('.wc').forEach((c, i) => { const on = wk === i + 1; c.style.background = on ? '#F5A524' : 'transparent'; c.style.color = on ? '#05070D' : ''; c.style.borderColor = on ? '#F5A524' : ''; });
  };
}

if (SLIDE === 3) {
  scene.innerHTML = `
  <div class="panel" id="pn" style="left:60px;top:620px;width:960px;height:520px;padding:30px 34px">
    <div style="display:flex;align-items:center;gap:16px"><div style="width:10px;height:56px;border-radius:6px;background:#F59E0B"></div><div><div class="lab">Bloque · Día 1 · Pierna</div><div style="font:800 32px 'Unbounded';margin-top:6px;letter-spacing:-.02em">Sentadilla trasera</div></div></div>
    <div style="display:flex;gap:14px;margin-top:26px">
      <div class="fld" style="flex:1"><div class="lab">Series</div><div class="v">3</div></div>
      <div class="fld" style="flex:1"><div class="lab">RIR</div><div class="v">2</div></div>
      <div class="fld" style="flex:1"><div class="lab">Descanso</div><div class="v">90s</div></div>
      <div class="fld" id="fR" style="flex:1.3"><div class="lab">Reps</div><div class="v"><span id="vR"></span><i id="car" style="display:inline-block;width:4px;height:32px;background:#F5A524;margin-left:3px;vertical-align:-3px"></i></div><div class="glow"></div></div>
    </div>
    <div class="lab" style="margin-top:28px">¿Cómo sube el peso?</div>
    <div style="display:flex;gap:14px;margin-top:14px">
      <div class="fld" style="flex:1;height:100px"><div style="font:800 21px Inter">Cada semana</div><div style="font:500 15px Inter;color:var(--muted);margin-top:6px">+X kg automático por semana</div></div>
      <div class="fld" id="fD" style="flex:1;height:100px"><div style="font:800 21px Inter">Al completar las reps</div><div style="font:500 15px Inter;color:var(--muted);margin-top:6px">Sube cuando llena el rango (doble progresión)</div><div id="rad" class="abs" style="right:16px;top:16px;width:28px;height:28px;border-radius:50%;background:#F5A524;display:flex;align-items:center;justify-content:center">${check('#05070D', 16)}</div><div class="glow"></div></div>
      <div class="fld" id="fK" style="flex:.8;height:100px"><div class="lab">Incremento</div><div class="v" style="display:flex;align-items:center;gap:10px"><span id="vK">+0</span><span style="font:700 16px Inter;color:var(--muted)">kg</span><span id="plus" style="margin-left:auto;width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font:600 22px Inter">+</span></div><div class="glow"></div></div>
    </div>
  </div>
  <div class="tag" id="t1" style="left:0;top:0"><b>1</b>Define el rango</div>
  <div class="tag" id="t2" style="left:0;top:0"><b>2</b>Doble progresión</div>
  <div class="tag" id="t3" style="left:0;top:0"><b>3</b>Cuánto sube</div>`;
  const fR = $('#fR'), fD = $('#fD'), fK = $('#fK');
  MOVES = [[1.05, 1.45, () => ctr(fR), 60], [2.2, 2.7, () => ctr(fD), 50], [3.4, 3.85, () => ctr($('#plus')), 50], [4.6, 5.3, () => [1150, 1420], 40]];
  CLICKS = [1.5, 2.75, 3.9, 4.15, 4.4]; CUR_VIS = [[1.0, 5.3]];
  const TG = [[$('#t1'), fR, 1.5], [$('#t2'), fD, 2.75], [$('#t3'), fK, 3.9]];
  SCENE = t => {
    const e = P(t, 0.4, 1.2, E.oExpo); tf($('#pn'), { y: (1 - e) * 120, rx: (1 - e) * 18, o: e });
    const n = clamp(Math.floor((t - 1.6) * 14), 0, 4); $('#vR').textContent = t < 1.6 ? '' : '8-12'.slice(0, n);
    op($('#car'), t > 1.5 && t < 2.2 ? (Math.floor(t * 4) % 2 ? 1 : 0.2) : 0);
    const sel = P(t, 2.75, 3.05, E.oBack); tf($('#rad'), { s: sel, o: clamp(sel * 2) }); fD.style.borderColor = sel > 0.5 ? '#F5A524' : '';
    const k = [3.9, 4.15, 4.4].filter(c => t >= c).length; $('#vK').textContent = ['+0', '+1', '+2', '+2,5'][k];
    tf($('#plus'), { s: 1 - 0.2 * Math.max(pulse(t, 3.9), pulse(t, 4.15), pulse(t, 4.4)) });
    TG.forEach(([tag, fld, at]) => { const r = rc(fld), q = P(t, at + 0.05, at + 0.45, E.oBack); tag.style.left = (r.left + 12) + 'px'; tag.style.top = (r.top - 58) + 'px'; tf(tag, { y: (1 - q) * 20, s: lerp(0.6, 1, q), o: clamp(q * 2) }); op($('.glow', fld), clamp(q) * (0.7 + 0.3 * Math.sin(t * 5))); });
  };
}

if (SLIDE === 4) {
  const ROWS = [['S1', '80', [10, 9, 8], 'En progreso'], ['S2', '80', [11, 10, 10], 'En progreso'], ['S3', '80', [12, 12, 12], 'Rango completo'], ['S4', '82,5', [8, 8, 8], '+2,5 kg automático']];
  scene.innerHTML = `
  <div class="panel" id="pn" style="left:60px;top:620px;width:960px;height:520px;padding:28px 30px">
    <div style="display:grid;grid-template-columns:90px 150px 1fr 1fr 1fr 250px;gap:10px" class="lab"><div>Sem.</div><div>Peso</div><div>Serie 1</div><div>Serie 2</div><div>Serie 3</div><div>Estado</div></div>
    ${ROWS.map((r, i) => `<div class="row" style="display:grid;grid-template-columns:90px 150px 1fr 1fr 1fr 250px;gap:10px;align-items:center;height:92px;margin-top:12px;border-radius:18px;padding:0 0;position:relative">
      <div class="rbg abs" style="inset:0 -14px;border-radius:18px;background:${i === 3 ? 'linear-gradient(90deg,rgba(255,106,61,.22),rgba(245,165,36,.12))' : 'rgba(255,255,255,.03)'};border:1px solid ${i === 3 ? 'rgba(245,165,36,.5)' : 'var(--line)'}"></div>
      <div style="position:relative;font:800 24px 'Unbounded'">${r[0]}</div>
      <div style="position:relative;font:800 30px 'Unbounded';color:${i === 3 ? '#F5A524' : '#fff'}">${r[1]}<span style="font:600 15px Inter;color:var(--muted)"> kg</span></div>
      ${r[2].map(v => `<div class="cell" style="position:relative;height:62px;border-radius:14px;background:#080B11;border:1.5px solid var(--line2);display:flex;align-items:center;justify-content:center;font:800 28px 'Unbounded'" data-v="${v}">0</div>`).join('')}
      <div class="st" style="position:relative;font:800 17px Inter;color:${i === 2 ? '#F5A524' : i === 3 ? '#05070D' : 'var(--muted)'};${i === 3 ? 'background:#F5A524;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center' : ''}">${i === 2 ? '✓ ' : ''}${r[3]}</div>
    </div>`).join('')}
  </div>`;
  const rows = $$('.row'), T0 = [0.9, 1.6, 2.3, 3.5];
  burst(3.1, () => ctr(rows[2]), 36, 8, ['245,165,36', '255,255,255'], 800, 0.8);
  burst(3.9, () => { const r = rc($('.st', rows[3])); return [r.left + r.width / 2, r.top + r.height / 2]; }, 40, 9, ['245,165,36', '255,106,61', '255,255,255'], 900, 0.9);
  FLASHES = [[3.9, 0.3]];
  SCENE = t => {
    const e = P(t, 0.35, 1.1, E.oExpo); tf($('#pn'), { y: (1 - e) * 120, rx: (1 - e) * 18, o: e });
    rows.forEach((r, i) => {
      const q = P(t, T0[i], T0[i] + 0.5, E.oExpo); tf(r, { x: (1 - q) * -80, o: q });
      $$('.cell', r).forEach((c, j) => { const cq = P(t, T0[i] + 0.15 + j * 0.1, T0[i] + 0.5 + j * 0.1, E.o3); c.textContent = Math.round(+c.dataset.v * cq); const top = i === 2 && t > 3.05; c.style.borderColor = top ? '#F5A524' : ''; c.style.color = top ? '#F5A524' : ''; c.style.boxShadow = top ? `0 0 ${(24 * (0.6 + 0.4 * Math.sin(t * 5 + j))).toFixed(1)}px rgba(245,165,36,.5)` : 'none'; });
      tf($('.st', r), { s: i >= 2 ? lerp(0.6, 1, P(t, [0, 0, 3.05, 3.9][i], [0, 0, 3.35, 4.25][i], E.oBack)) : 1, o: i >= 2 ? P(t, [0, 0, 3.05, 3.9][i], [0, 0, 3.2, 4.05][i]) : q });
    });
  };
}

if (SLIDE === 5) {
  scene.innerHTML = `
  <div class="panel" id="pa" style="left:60px;top:620px;width:430px;height:520px;padding:30px">
    <div class="lab">Perfil del alumno</div>
    <div style="display:flex;gap:12px;margin-top:16px"><div class="fld" style="flex:1"><div class="lab">Edad</div><div class="v">30</div></div><div class="fld" style="flex:1"><div class="lab">FC reposo</div><div class="v">60</div></div></div>
    <div class="lab" style="margin-top:26px">FC máxima · Tanaka</div>
    <div id="f1" class="mono" style="font:700 24px 'JetBrains Mono';margin-top:12px;white-space:nowrap"></div>
    <div id="fmax" style="font:900 72px/1 'Unbounded';margin-top:14px;letter-spacing:-.04em;background:linear-gradient(95deg,#00F7F7,#2680FF);-webkit-background-clip:text;background-clip:text;color:transparent">0</div>
    <div class="lab" style="margin-top:4px">lpm máx.</div>
    <div class="lab" style="margin-top:22px">Rangos · Karvonen</div><div id="f2" class="mono" style="font:700 19px 'JetBrains Mono';margin-top:10px;color:var(--muted);white-space:nowrap"></div>
  </div>
  <div class="panel" id="pb" style="left:510px;top:620px;width:510px;height:520px;padding:30px 28px">
    <div class="lab">Zonas de María</div>
    <div style="margin-top:14px">${ZONES.slice().reverse().map(([z, a, b]) => `<div class="zr" style="position:relative;height:74px;margin-bottom:10px;border-radius:16px;display:flex;align-items:center;padding:0 16px;gap:14px;overflow:hidden;${z === 4 ? 'border:2px solid #F5A524;box-shadow:0 0 30px -6px #F5A524' : 'border:1px solid var(--line)'}">
      <div class="zf abs" style="left:0;top:0;bottom:0;width:${40 + z * 12}%;background:linear-gradient(90deg,${ZC[z]}55,${ZC[z]}10);transform-origin:0 50%"></div>
      <div style="position:relative;width:46px;height:46px;border-radius:12px;background:${ZC[z]};display:flex;align-items:center;justify-content:center;font:900 17px 'Unbounded';color:#05070D">Z${z}</div>
      <div style="position:relative;font:800 26px 'Unbounded'"><span class="za">0</span>–<span class="zb">0</span></div><div style="position:relative;font:600 15px Inter;color:var(--muted)">bpm</div>
      ${z === 4 ? `<div style="position:relative;margin-left:auto;font:800 13px 'JetBrains Mono';letter-spacing:.14em;color:#F5A524">SERIES</div>` : ''}
    </div>`).join('')}</div>
  </div>`;
  const zr = $$('.zr'), ZR = ZONES.slice().reverse();
  burst(3.3, () => ctr(zr[1]), 30, 3, ['245,165,36', '255,255,255'], 700, 0.8);
  SCENE = t => {
    const a = P(t, 0.35, 1.1, E.oExpo), b = P(t, 0.55, 1.3, E.oExpo);
    tf($('#pa'), { x: (1 - a) * -200, ry: (1 - a) * 30, o: a }); tf($('#pb'), { x: (1 - b) * 200, ry: (1 - b) * -30, o: b });
    const s1 = '208 − 0,7 × 30', n1 = clamp(Math.floor((t - 1.0) * 30), 0, s1.length); $('#f1').textContent = t < 1 ? '' : s1.slice(0, n1);
    $('#fmax').textContent = Math.round(187 * P(t, 1.5, 2.3, E.o3));
    const s2 = '(187 − 60) × % + 60', n2 = clamp(Math.floor((t - 2.2) * 30), 0, s2.length); $('#f2').textContent = t < 2.2 ? '' : s2.slice(0, n2);
    zr.forEach((r, i) => { const at = 2.4 + (4 - i) * 0.12, q = P(t, at, at + 0.5, E.oBack); tf(r, { x: (1 - q) * 60, o: clamp(q * 1.5) }); tf($('.zf', r), { sx: P(t, at, at + 0.7, E.o5) }); const c = P(t, at, at + 0.7, E.o3); $('.za', r).textContent = Math.round(ZR[i][1] * c); $('.zb', r).textContent = Math.round(ZR[i][2] * c); if (ZR[i][0] === 4) tf(r, { x: (1 - q) * 60, s: 1 + 0.03 * pulse(t, 3.3, 0.3), o: clamp(q * 1.5) }); });
  };
}

if (SLIDE === 6) {
  const TPL = ['8×400m @ Z4', '6×1min @ Z5', '20min Z2 continuo', 'Fartlek 10×30/30', 'HYROX run + estación'];
  const CFG = [['Calentamiento', '10 min'], ['Repeticiones', '8'], ['Trabajo', '400 m'], ['Recuperación', '90 s'], ['Vuelta a la calma', '5 min']];
  scene.innerHTML = `
  <div class="panel" id="pa" style="left:60px;top:620px;width:420px;height:520px;padding:26px">
    <div class="lab">Aplicar plantilla…</div>
    <div style="margin-top:14px">${TPL.map((n, i) => `<div class="tp" style="position:relative;height:74px;border-radius:16px;margin-bottom:10px;display:flex;align-items:center;padding:0 16px;gap:12px;border:1px solid var(--line);background:rgba(255,255,255,.02)"><div style="width:10px;height:10px;border-radius:50%;background:${ZC[[4, 5, 2, 4, 4][i]]}"></div><div style="font:800 19px Inter;white-space:nowrap">${n}</div><div class="glow"></div></div>`).join('')}</div>
  </div>
  <div class="panel" id="pb" style="left:500px;top:620px;width:520px;height:520px;padding:26px 28px">
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="lab">Bloque · Intervalos</div><div id="zc" style="height:40px;padding:0 14px;border-radius:12px;background:#F5A524;color:#05070D;display:flex;align-items:center;font:800 16px Inter;gap:8px"><b style="font:900 15px 'Unbounded'">Z4</b> 162–174 bpm</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px">${CFG.map(([l, v], i) => `<div class="fld cf" style="${i === 0 ? 'grid-column:span 2;' : ''}height:96px"><div class="lab">${l}</div><div class="v cv" data-v="${v}"></div><div class="glow"></div></div>`).join('')}</div>
    <div id="pz" class="mono" style="margin-top:16px;font:700 16px 'JetBrains Mono';color:#F5A524">Z4 · 162–174 bpm para este alumno</div>
  </div>`;
  const tps = $$('.tp'), cfs = $$('.cf');
  MOVES = [[1.2, 1.75, () => ctr(tps[0]), 60], [2.6, 3.3, () => [1150, 1420], 40]];
  CLICKS = [1.8]; CUR_VIS = [[1.15, 3.3]];
  burst(1.85, () => ctr(tps[0]), 30, 12, ['0,247,247', '38,128,255', '255,255,255'], 700, 0.7);
  SCENE = t => {
    const a = P(t, 0.35, 1.1, E.oExpo), b = P(t, 0.55, 1.3, E.oExpo);
    tf($('#pa'), { x: (1 - a) * -200, ry: (1 - a) * 30, o: a }); tf($('#pb'), { x: (1 - b) * 200, ry: (1 - b) * -30, o: b });
    tps.forEach((p, i) => { tf(p, { x: (1 - P(t, 0.6 + i * 0.07, 1.1 + i * 0.07, E.oExpo)) * -40, o: P(t, 0.6 + i * 0.07, 1.0 + i * 0.07), s: i === 0 ? 1 - 0.04 * pulse(t, 1.8) : 1 }); if (i === 0) { op($('.glow', p), P(t, 1.8, 2.0)); p.style.background = t > 1.8 ? 'rgba(0,247,247,.08)' : ''; } else p.style.opacity = t > 1.9 ? (0.45 + 0.55 * (1 - P(t, 1.9, 2.2))).toFixed(3) : p.style.opacity; });
    cfs.forEach((c, i) => { const at = 2.0 + i * 0.14, q = P(t, at, at + 0.4, E.oBack); const v = $('.cv', c); v.textContent = t >= at ? v.dataset.v : '—'; tf(v, { y: (1 - q) * 20, o: t >= at ? clamp(q * 2) : 0.3 }); op($('.glow', c), Math.max(0, 1 - Math.abs(t - at - 0.2) / 0.4)); });
    const z = P(t, 2.85, 3.2, E.oBack); tf($('#zc'), { s: lerp(0.4, 1, z), o: clamp(z * 2) });
    tf($('#pz'), { x: (1 - P(t, 3.1, 3.5, E.oExpo)) * -30, o: P(t, 3.1, 3.4) });
  };
}

if (SLIDE === 7) {
  scene.innerHTML = `
  <div id="ph" class="abs" style="left:78px;top:596px;width:360px;height:560px;border-radius:58px;background:#000;padding:12px;box-shadow:0 0 0 2px #2A323D,0 60px 110px -30px rgba(0,0,0,.9),0 0 90px -20px rgba(0,247,247,.35)">
    <div style="position:relative;width:100%;height:100%;border-radius:47px;overflow:hidden;background:radial-gradient(120% 70% at 50% 0%,#0B2233 0%,#07090E 60%)">
      <div class="abs" style="left:50%;top:12px;width:104px;height:30px;border-radius:16px;background:#000;transform:translateX(-50%)"></div>
      <div class="abs" style="left:24px;right:24px;top:56px;display:flex;justify-content:space-between" ><span class="lab" style="font-size:12px">8×400M @ Z4</span><span class="lab" style="font-size:12px" id="elap">12:40</span></div>
      <div id="phase" class="abs U" style="left:24px;top:92px;font:800 30px 'Unbounded';letter-spacing:-.02em">TRABAJO</div>
      <div id="rep" class="abs mono" style="left:24px;top:134px;font:700 16px 'JetBrains Mono';color:var(--muted)">Serie 3 de 8</div>
      <div class="abs" style="left:0;right:0;top:170px;display:flex;justify-content:center"><div style="position:relative;width:230px;height:230px"><svg width="230" height="230" viewBox="0 0 230 230"><circle cx="115" cy="115" r="98" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="16"/><circle id="rg" cx="115" cy="115" r="98" fill="none" stroke="#F5A524" stroke-width="16" stroke-linecap="round" transform="rotate(-90 115 115)" stroke-dasharray="615.8"/></svg>
        <div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div id="big" style="font:900 58px/1 'Unbounded';letter-spacing:-.04em">400</div><div id="unit" class="lab" style="margin-top:6px">metros</div></div></div></div>
      <div id="zch" class="abs" style="left:24px;right:24px;top:418px;height:48px;border-radius:14px;background:rgba(245,165,36,.15);border:1.5px solid rgba(245,165,36,.6);display:flex;align-items:center;justify-content:center;gap:10px;font:800 16px Inter;color:#F5A524"><b style="font:900 15px 'Unbounded'">Z4</b>162–174 bpm</div>
      <div id="btn" class="abs" style="left:24px;right:24px;top:476px;height:52px;border-radius:16px;background:linear-gradient(135deg,#00F7F7,#2680FF);color:#05070D;display:flex;align-items:center;justify-content:center;font:800 17px Inter">Completé 400 m</div>
    </div>
  </div>
  <div class="panel" id="pb" style="left:470px;top:640px;width:550px;height:480px;padding:28px">
    <div class="lab">La sesión, fase por fase</div>
    <div style="font:800 28px 'Unbounded';margin-top:10px;letter-spacing:-.02em">8×400m @ Z4</div>
    <div id="strip" style="position:relative;margin-top:26px;height:96px;display:flex;gap:4px"></div>
    <div id="play" class="abs" style="top:0;width:3px;height:120px;background:#fff;box-shadow:0 0 16px #fff"></div>
    <div style="display:flex;gap:18px;margin-top:22px;font:700 14px 'JetBrains Mono';color:var(--muted);letter-spacing:.1em">
      <span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#1FB877;vertical-align:-1px"></i> CALENT.</span><span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#F5A524;vertical-align:-1px"></i> TRABAJO</span><span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#2680FF;vertical-align:-1px"></i> RECUP.</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px">
      <div class="fld"><div class="lab">Series hechas</div><div class="v"><span id="done">2</span> / 8</div></div>
      <div class="fld"><div class="lab">Recuperación</div><div class="v">90 s</div></div></div>
  </div>`;
  // strip: warmup(10min) + 8×(work ~1.5min, rec 1.5min) + cooldown 5min → proportional widths
  const segs = [['#1FB877', 10]]; for (let i = 0; i < 8; i++) { segs.push(['#F5A524', 1.6]); segs.push(['#2680FF', 1.5]); } segs.push(['#1FB877', 5]);
  const tot = segs.reduce((a, s) => a + s[1], 0);
  $('#strip').innerHTML = segs.map(s => `<div class="sg" style="flex:${s[1]};border-radius:6px;background:${s[0]};opacity:.25"></div>`).join('');
  const sgs = $$('.sg');
  MOVES = [[1.4, 1.9, () => ctr($('#btn')), 50], [2.3, 3.0, () => [1150, 1420], 40]];
  CLICKS = [1.95]; CUR_VIS = [[1.35, 3.0]];
  burst(1.98, () => ctr($('#btn')), 26, 14, ['0,247,247', '38,128,255', '255,255,255'], 600, 0.7);
  SCENE = t => {
    const p = P(t, 0.35, 1.2, E.oExpo); tf($('#ph'), { y: (1 - p) * 500 + Math.sin(t * 1.6) * 5 * p, r: (1 - p) * -8, o: 1 });
    const b = P(t, 0.6, 1.4, E.oExpo); tf($('#pb'), { x: (1 - b) * 220, ry: (1 - b) * -30, o: b });
    const rec = t >= 1.98, rt = clamp((t - 2.1) / 3.6);
    $('#phase').textContent = rec ? 'RECUPERACIÓN' : 'TRABAJO'; $('#phase').style.color = rec ? '#5C9DFF' : '#fff';
    $('#rep').textContent = rec ? 'Siguiente: serie 4 de 8' : 'Serie 3 de 8';
    const left = Math.max(0, Math.round(90 * (1 - rt)));
    $('#big').textContent = rec ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '400'; $('#unit').textContent = rec ? 'descanso' : 'metros';
    $('#rg').style.stroke = rec ? '#2680FF' : '#F5A524';
    $('#rg').style.strokeDashoffset = rec ? (615.8 * rt).toFixed(1) : (615.8 * (0.35 + 0.1 * Math.sin(t * 2))).toFixed(1);
    op($('#zch'), rec ? 0.35 : 1); op($('#btn'), rec ? 0.35 : 1); tf($('#btn'), { s: 1 - 0.05 * pulse(t, 1.95), o: rec ? 0.35 : 1 });
    $('#done').textContent = rec ? 3 : 2;
    $('#elap').textContent = `12:${String(40 + Math.floor(t * 3) % 20).padStart(2, '0')}`;
    // strip lights up to current segment (index 6 = work #3 → 7 = rec #3)
    const curIdx = rec ? 6 : 5;
    sgs.forEach((s, i) => { const on = i < curIdx || (i === curIdx); s.style.opacity = (i < curIdx ? 0.9 : i === curIdx ? 0.6 + 0.4 * Math.sin(t * 6) : 0.22) * P(t, 0.9 + i * 0.03, 1.2 + i * 0.03, E.lin); });
    const sr = rc(sgs[curIdx]), br = rc($('#pb')); const frac = rec ? rt : 0.5 + 0.1 * Math.sin(t);
    tf($('#play'), { x: sr.left - br.left + sr.width * frac - 1, y: 0, o: P(t, 1.1, 1.4) }); $('#play').style.left = '0px'; $('#play').style.top = (sr.top - br.top - 12) + 'px';
  };
}

if (SLIDE === 8) {
  scene.innerHTML = `
  <div id="lk" class="abs" style="left:0;top:0;width:1080px;height:1350px">
    <div id="glw" class="abs" style="left:290px;top:600px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(0,247,247,.35),rgba(255,106,61,.12) 45%,transparent 70%);filter:blur(10px)"></div>
    <div id="cM" class="mk abs" style="left:445px;top:640px;width:190px;height:231px"></div>
    <div class="abs" style="left:0;right:0;top:885px;text-align:center;font-size:150px;line-height:1"><span class="eva" style="display:inline-flex"><span id="e1" style="display:inline-block">E</span><span id="e2" style="display:inline-block">V</span><span id="e3" style="display:inline-block">A</span></span></div>
    <div id="cta" class="abs" style="left:50%;top:1068px;height:82px;padding:0 38px;border-radius:26px;background:linear-gradient(95deg,#00F7F7,#2680FF 55%,#FF6A3D);color:#05070D;display:flex;align-items:center;gap:14px;font:800 26px Inter;white-space:nowrap;transform-origin:50% 50%">Prueba gratis en eva-app.cl
      <svg width="36" height="20" viewBox="0 0 44 20"><path d="M2 10h36M30 3l8 7-8 7" fill="none" stroke="#05070D" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  </div>`;
  burst(1.3, () => [540, 960], 60, 7, ['0,247,247', '255,106,61', '255,255,255', '38,128,255'], 1000, 1.0);
  FLASHES = [[1.3, 0.3]];
  SCENE = t => {
    const m = $('#cM'), q = P(t, 0.35, 1.2, E.oExpo);
    m.style.clipPath = diagClip(P(t, 0.35, 0.95, E.io3) * 2);
    tf(m, { y: lerp(40, 0, q) + Math.sin(t * 2) * 5 * P(t, 1.3, 1.8), s: lerp(0.85, 1, q), r: lerp(-8, 0, q) });
    ['#e1', '#e2', '#e3'].forEach((id, i) => { const e = P(t, 0.8 + i * 0.11, 1.3 + i * 0.11, E.oExpo); tf($(id), { x: [-60, 0, 60][i] * (1 - e), y: [0, 40, 0][i] * (1 - e), s: lerp(1.8, 1, e), o: P(t, 0.8 + i * 0.11, 0.92 + i * 0.11, E.lin), blur: (1 - e) * 14 }); });
    op($('#glw'), P(t, 0.8, 1.6) * (0.75 + 0.25 * Math.sin(t * 2.4)));
    const c = P(t, 1.6, 2.2, E.oBack); const cw = $('#cta').offsetWidth;
    tf($('#cta'), { x: -cw / 2, y: (1 - c) * 40, s: lerp(0.7, 1, c) * (1 + 0.02 * Math.sin(Math.max(0, t - 2.4) * 5)), o: clamp(c * 2) });
  };
}

/* ------------------------------------------------------------ BACKGROUND + ECG */
const bg = $('#bg').getContext('2d'), ecg = $('#ecg').getContext('2d');
const R0 = rng(11); const parts = Array.from({ length: 70 }, () => ({ x: R0() * 1080, y: R0() * 1350, z: 0.2 + R0() * 0.8, ph: R0() * 6.28 }));
function glow(ctx, x, y, r, c, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
// global ECG across all 8 slides: beat every 540px of the combined strip, so swipes line up
const BEAT = 540, BASE = 1222;
function ecgY(gx) {
  const u = ((gx % BEAT) + BEAT) % BEAT / BEAT; let y = 0;
  const bump = (c, w, a) => a * Math.exp(-Math.pow((u - c) / w, 2));
  y += bump(0.30, 0.025, -10); y += bump(0.40, 0.006, 16); y += bump(0.42, 0.008, -64); y += bump(0.445, 0.007, 26); y += bump(0.60, 0.035, -14);
  return BASE + y;
}
const segCol = gx => { const s = Math.floor(gx / 1080) + 1; return s === 1 || s === 8 ? [0, 247, 247] : s <= 4 ? [255, 106, 61] : [0, 247, 247]; };
function drawBG(t) {
  bg.fillStyle = '#05070D'; bg.fillRect(0, 0, 1080, 1350);
  const a0 = hexrgb(C.acc[0]), a1 = hexrgb(C.acc[1]);
  glow(bg, 900 + Math.sin(t * 0.5) * 60, 260 + Math.cos(t * 0.4) * 40, 700, a0, 0.16);
  glow(bg, 140 + Math.cos(t * 0.45) * 50, 1050, 650, a1, 0.12);
  glow(bg, 540, 880, 520, '17,38,86', 0.5);
  bg.globalCompositeOperation = 'lighter';
  for (const p of parts) { const x = (p.x + t * 10 * p.z) % 1080, y = (p.y - t * 14 * p.z + 1350) % 1350, a = (0.08 + 0.35 * p.z) * (0.6 + 0.4 * Math.sin(t * 2 + p.ph)); bg.fillStyle = `rgba(${a0},${a.toFixed(3)})`; bg.beginPath(); bg.arc(x, y, 0.8 + p.z * 1.8, 0, 6.283); bg.fill(); }
  bg.globalCompositeOperation = 'source-over';
  // ECG
  ecg.clearRect(0, 0, 1080, 1350);
  const off = (SLIDE - 1) * 1080, head = lerp(-100, 1180, clamp(t / (DUR - 0.3)));
  ecg.lineJoin = 'round'; ecg.lineCap = 'round';
  ecg.beginPath(); for (let x = 0; x <= 1080; x += 2) { const y = ecgY(off + x); x ? ecg.lineTo(x, y) : ecg.moveTo(x, y); }
  ecg.strokeStyle = 'rgba(255,255,255,.14)'; ecg.lineWidth = 2; ecg.stroke();
  for (let x = 0; x <= 1080; x += 3) {
    const d = head - x; if (d < 0 || d > 420) continue; const a = Math.pow(1 - d / 420, 2), c = segCol(off + x);
    ecg.strokeStyle = `rgba(${c.join(',')},${a.toFixed(3)})`; ecg.lineWidth = 3 + a * 2; ecg.shadowColor = `rgba(${c.join(',')},1)`; ecg.shadowBlur = 18 * a;
    ecg.beginPath(); ecg.moveTo(x, ecgY(off + x)); ecg.lineTo(x + 3, ecgY(off + x + 3)); ecg.stroke();
  }
  ecg.shadowBlur = 0;
  if (head >= 0 && head <= 1080) { const c = segCol(off + head).join(','); glow(ecg, head, ecgY(off + head), 40, c, 0.9); ecg.fillStyle = '#fff'; ecg.beginPath(); ecg.arc(head, ecgY(off + head), 5, 0, 6.283); ecg.fill(); }
}
const grainC = $('#grain').getContext('2d');
const grainTiles = Array.from({ length: 4 }, (_, k) => { const r = rng(200 + k); const img = grainC.createImageData(540, 675); for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } return img; });
const cur = $('#cursor'), ring = $('#ring');

function render(t) {
  drawBG(t);
  tf($('#grid'), { y: (t * 6) % 54 });
  const bl = P(t, 0, 1.4, E.oExpo); tf($('#bigL'), { x: (1 - bl) * 160 + Math.sin(t * 0.4) * 10, y: Math.cos(t * 0.5) * 8, o: bl });
  // chapter line
  const c = P(t, 0.02, 0.5, E.oExpo); tf($('#chap'), { x: (1 - c) * -40, o: c });
  $$('#chap .steps i').forEach((s, i) => tf(s, { sx: i + 1 === C.step ? 1 + 0.25 * Math.sin(t * 5) : 1 }));
  // headline: chars flip up
  C1.concat(C2).forEach((ch, i) => { const e = P(t, 0.1 + i * 0.022, 0.8 + i * 0.022, E.oExpo); tf(ch, { y: (1 - e) * 70, rx: (1 - e) * -90, o: clamp(e * 1.6) }); });
  // scanline sweeps the headline once, then a slow idle sweep
  const sc = $('#scan'), s1 = P(t, 0.15, 1.1, E.io3), s2 = clamp((t - 3.2) / 1.6);
  if (t < 1.15) { sc.style.top = lerp(250, 470, s1) + 'px'; op(sc, Math.sin(Math.PI * s1) * 0.9); } else if (t > 3.2 && t < 4.8) { sc.style.top = lerp(250, 1180, E.io3(s2)) + 'px'; op(sc, Math.sin(Math.PI * s2) * 0.5); } else op(sc, 0);
  const sb = P(t, 0.55, 1.2, E.oExpo); tf($('#sub'), { y: (1 - sb) * 30, o: sb, blur: (1 - sb) * 6 });
  tf($('#fa'), { x: Math.max(0, Math.sin(t * 4)) * 10 });
  SCENE(t);
  // cursor
  let cv = 0; for (const [a, b] of CUR_VIS) if (t > a - 0.2 && t < b + 0.2) cv = Math.max(cv, Math.min(P(t, a - 0.2, a + 0.05, E.lin), 1 - P(t, b - 0.05, b + 0.2, E.lin)));
  const [px, py] = cursorPos(t); let pr = 0; CLICKS.forEach(k => pr = Math.max(pr, pulse(t, k, 0.09)));
  tf(cur, { x: px - 5, y: py - 4, s: 1 - 0.18 * pr, o: cv });
  let rp = -1; CLICKS.forEach(k => { if (t >= k && t < k + 0.5) rp = (t - k) / 0.5; });
  if (rp >= 0 && cv > 0) tf(ring, { x: px - 42, y: py - 42, s: 0.2 + E.o3(rp) * 1.1, o: (1 - rp) * 0.9 }); else op(ring, 0);
  // bursts
  fx.clearRect(0, 0, 1080, 1350); fx.globalCompositeOperation = 'lighter';
  for (const b of BURSTS) { const q = (t - b.t0) / b.life; if (q < 0 || q > 1) continue; const [ox, oy] = b.at();
    for (const p of b.ps) { const d = p.v * (1 - Math.pow(1 - q, 3)) * b.life * 0.45, x = ox + Math.cos(p.a) * d, y = oy + Math.sin(p.a) * d + q * q * 120;
      fx.fillStyle = `rgba(${p.c},${(1 - q).toFixed(3)})`; if (p.sq) { fx.save(); fx.translate(x, y); fx.rotate(p.a + q * 7); fx.fillRect(-p.s, -p.s * 0.35, p.s * 2.4, p.s * 0.7); fx.restore(); } else { fx.beginPath(); fx.arc(x, y, p.s * (1 - q * 0.5), 0, 6.283); fx.fill(); } }
    if (q < 0.5) { fx.strokeStyle = `rgba(${ACC[0]},${(0.8 * (1 - q * 2)).toFixed(3)})`; fx.lineWidth = 3; fx.beginPath(); fx.arc(ox, oy, E.o3(q * 2) * 180, 0, 6.283); fx.stroke(); } }
  fx.globalCompositeOperation = 'source-over';
  let fl = 0; FLASHES.forEach(([ti, A]) => { if (t > ti) fl += Math.exp(-(t - ti) * 9) * A; }); op($('#flash'), fl);
  grainC.putImageData(grainTiles[Math.floor(t * 30) % 4], 0, 0);
}

function layout() {
  // auto-fit each headline line to 956px
  [l1, l2].forEach(l => { const w = l.scrollWidth; if (w > 956) l.style.transform = `scale(${(956 / w).toFixed(4)})`; });
  const hb = rc(l2); $('#sub').style.top = (262 + 2 * 90 + 34) + 'px';
}
window.render = render; window.DUR = DUR;
window.__ready = document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => { })))).then(() => { layout(); render(0); return true; });
