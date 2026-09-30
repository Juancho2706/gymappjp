/* EVA — "Crea una rutina en 30 segundos". Deterministic timeline: render(t) paints frame at t seconds. */
const DUR = 30;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  lin: x => x,
  o2: x => 1 - (1 - x) * (1 - x),
  o3: x => 1 - Math.pow(1 - x, 3),
  o4: x => 1 - Math.pow(1 - x, 4),
  o5: x => 1 - Math.pow(1 - x, 5),
  oExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  iExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  i3: x => x * x * x,
  i2: x => x * x,
  io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  io4: x => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  ioExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  oBack: x => { const s = 1.9; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  oElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3.2) + 1),
};
const P = (t, a, b, e = E.o4) => e(clamp((t - a) / (b - a)));
const win = (t, a, b) => t >= a && t < b;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

function tf(el, o = {}) {
  const { x = 0, y = 0, z = 0, s = 1, r = 0, rx = 0, ry = 0 } = o;
  const sx = o.sx ?? s, sy = o.sy ?? s;
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotate(${r.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  if (o.o !== undefined) { el.style.opacity = o.o.toFixed(4); el.style.visibility = o.o <= 0.001 ? 'hidden' : 'visible'; }
  if (o.blur !== undefined) el.style.filter = o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
}
const op = (el, o) => { el.style.opacity = o.toFixed(4); el.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; };
const rc = el => el.getBoundingClientRect();
const ctr = el => { const r = rc(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };

/* half-plane clip along the leap diagonal: region u = x + (1-y) < k, k∈[0,2] */
function diagClip(k) {
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]], u = p => p[0] + (1 - p[1]) - k, out = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], ua = u(a), ub = u(b);
    if (ua <= 0) out.push(a);
    if ((ua <= 0) !== (ub <= 0)) { const f = ua / (ua - ub); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  }
  if (out.length < 3) return 'polygon(0 0,0 0,0 0)';
  return 'polygon(' + out.map(p => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`).join(',') + ')';
}

/* ------------------------------------------------------------ DATA */
const C = { cua: '#F59E0B', isq: '#D97706', glu: '#F97316', pan: '#EA580C', pec: '#3B82F6', hom: '#8B5CF6', tri: '#DC2626', dor: '#10B981', esp: '#059669', del: '#7C3AED', bic: '#EF4444' };
const DAYS = [
  { k: 'LUN', n: 'Pierna', chip: 0, ex: [['Sentadilla trasera', 'Cuádriceps', C.cua, '3×10 · 60s'], ['Peso muerto rumano', 'Isquiotibiales', C.isq, '3×10 · 90s'], ['Hip thrust', 'Glúteos', C.glu, '3×12 · 60s'], ['Zancada búlgara', 'Cuádriceps', C.cua, '3×10 · 60s']] },
  { k: 'MIÉ', n: 'Empuje', chip: 2, ex: [['Press banca', 'Pectorales', C.pec, '4×6-8 · 2min'], ['Press militar', 'Hombros', C.hom, '3×8 · 90s'], ['Fondos', 'Tríceps', C.tri, '3×10 · 60s'], ['Aperturas', 'Pectorales', C.pec, '3×12 · 60s']] },
  { k: 'VIE', n: 'Tirón', chip: 4, ex: [['Dominadas', 'Dorsales', C.dor, '4×6-8 · 2min'], ['Remo con barra', 'Espalda alta', C.esp, '3×8 · 90s'], ['Face pull', 'Deltoides', C.del, '3×15 · 45s'], ['Curl bíceps', 'Bíceps', C.bic, '3×12 · 45s']] },
];
const CAT_A = [...DAYS[0].ex, ['Elevación de talones', 'Pantorrillas', C.pan, '']];
const CAT_B = [['Press banca', 'Pectorales', C.pec], ['Dominadas', 'Dorsales', C.dor], ['Press militar', 'Hombros', C.hom], ['Remo con barra', 'Espalda alta', C.esp], ['Fondos', 'Tríceps', C.tri]];
const STEPS = [
  { a: 4.0, b: 8.5, n: '01', t: 'Configura', s: 'Estructura, duración y fases de tu programa.', l: 'CONFIGURA' },
  { a: 8.5, b: 12.5, n: '02', t: 'Construye', s: 'Elige los días y arma el tablero de tu semana.', l: 'CONSTRUYE' },
  { a: 12.5, b: 18.5, n: '03', t: 'Añade', s: 'Busca en el catálogo. Arrastra o toca para agregar.', l: 'AÑADE' },
  { a: 18.5, b: 23.0, n: '04', t: 'Prescribe', s: 'Series, reps, RIR, tempo y descanso. Con progresión.', l: 'PRESCRIBE' },
  { a: 23.0, b: 27.7, n: '05', t: 'Asigna', s: 'Guarda y tu alumno la recibe al instante en su app.', l: 'ASIGNA' },
];
const TC1 = 3.95, TC2 = 27.7; // wipe centres
const dumb = c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>`;
const check = (c = '#00132A', w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/* ------------------------------------------------------------ BUILD */
function words(el, text, cls = '') {
  const out = [];
  text.split(' ').forEach((w, i) => {
    const hl = w.startsWith('*'); if (hl) w = w.slice(1);
    const wrap = h(`<span class="word"><span class="${hl ? 'grad ' : ''}${cls}">${w}</span></span>`);
    el.appendChild(wrap); el.appendChild(document.createTextNode(' '));
    out.push(wrap.firstChild);
  });
  return out;
}
function chars(el, text) {
  const line = h(`<span class="line"></span>`); el.appendChild(line);
  return [...text].map(c => { const s = h(`<span class="ch">${c}</span>`); line.appendChild(s); return s; });
}

const introWords = words($('#introTag'), 'Crea una rutina en *30 *segundos');
const out1 = words($('#outroTag1'), 'Tú entrenas a tus alumnos.');
const out2 = words($('#outroTag2'), '*EVA *lleva *el *resto.');

// steps HUD
const stepEls = STEPS.map((st, i) => {
  const el = h(`<div class="stepTxt"><div class="kicker"><span>PASO ${st.n}</span><i></i></div><div class="title"></div><div class="sub"></div></div>`);
  $('#steps').appendChild(el);
  return { el, kick: $('.kicker', el), ch: chars($('.title', el), st.t), w: words($('.sub', el), st.s) };
});
// progress
const segW = (1700 - 4 * 18) / 5;
const segs = STEPS.map((st, i) => {
  const el = h(`<div class="seg" style="left:${i * (segW + 18)}px;width:${segW}px"><div class="lbl">${st.n}  ${st.l}</div><div class="trk"><div class="fill"></div></div></div>`);
  $('#progress').appendChild(el); return { el, lbl: $('.lbl', el), fill: $('.fill', el) };
});

// config card
$('#cfg').innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between" class="r">
    <div><div class="lab">Nuevo programa</div><div class="disp" style="font:800 34px Archivo;margin-top:8px;letter-spacing:-.02em">Configurar</div></div>
    <div class="chip b" style="height:44px;font-size:17px">⚙&nbsp; Estructura · Duración · Fases</div>
  </div>
  <div class="row r"><div class="lab">Nombre del programa</div><div class="input" id="cfgName"><span id="cfgNameT"></span><i class="caret" id="cfgCaret"></i></div></div>
  <div class="row r"><div class="lab">Estructura</div><div class="segc"><div class="pill" id="cfgPill"></div><div class="opt" id="optW">Semanal</div><div class="opt" id="optC">Ciclo N-días</div></div></div>
  <div class="row r"><div class="lab">Duración</div><div class="durRow"><div class="durNum" id="durNum"><div id="dn0">1</div><div id="dn1">2</div></div><div class="durUnit">semanas</div><div class="pips">${Array.from({ length: 8 }, (_, i) => `<div class="pip"><div class="pf"></div><span>S${i + 1}</span></div>`).join('')}</div></div></div>
  <div class="row r"><div class="lab">Fases</div><div class="phases">
    ${[['Adaptación', 'S1–2', 2, '#18ABD4,#57C7E6'], ['Hipertrofia', 'S3–5', 3, '#1462DC,#5C9DFF'], ['Fuerza', 'S6–7', 2, '#112656,#2B6EA5'], ['Deload', 'S8', 1, '#E8511E,#FF8C66']]
      .map(p => `<div class="ph" style="flex:${p[2]}"><div class="pbar" style="background:linear-gradient(90deg,${p[3]})"></div><div class="pt">${p[0]}</div><div class="ps">${p[1]}</div></div>`).join('')}
  </div></div>`;
const cfgRows = $$('#cfg .r'), pips = $$('#cfg .pip'), phs = $$('#cfg .ph');

// board
$('#board').innerHTML = `
  <div id="bHead"><div class="bt">Hipertrofia · Bloque A</div><div class="chip b">Semanal · 8 sem</div><div class="chip" id="exCount"><span id="exN">0</span>&nbsp;ejercicios</div><div class="sp"></div>
    <div class="btn gh">Vista previa</div>
    <div class="btn pri" id="saveBtn" style="position:relative;overflow:hidden;width:170px"><span id="saveA">Guardar</span><span id="saveB" class="abs" style="inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#1FB877,#0E7A50)">${check('#fff', 20)} Guardado</span></div></div>
  <div id="chips">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="dchip"><div class="dcf"></div><span>${d}</span></div>`).join('')}<div id="chipsNote">3 DÍAS / SEMANA</div></div>
  ${DAYS.map((d, i) => `<div class="col" style="left:${28 + i * 270}px"><div class="ch1">${d.k}</div><div class="ch2"></div><div class="ch3"><span class="cnt">0</span> ejercicios</div>
     <div class="slots"><div class="drop">Arrastra aquí</div>${d.ex.map(e => `<div class="slot"><div class="blk"><div class="bar" style="background:${e[2]}"></div><div class="bn">${e[0]}</div><div class="bm">${e[3]}</div><div class="bmu" style="background:${e[2]};box-shadow:0 0 10px ${e[2]}"></div><div class="glow"></div></div></div>`).join('')}</div></div>`).join('')}
  <div class="col" id="addCol" style="left:${28 + 3 * 270}px"><div class="plus">+</div>Añadir día</div>`;
const dchips = $$('#board .dchip'), cols = $$('#board .col:not(#addCol)');
const colT = cols.map(c => $('.ch2', c)), colCnt = cols.map(c => $('.cnt', c)), drops = cols.map(c => $('.drop', c));
const slots = cols.map(c => $$('.slot', c)), blks = cols.map(c => $$('.blk', c));

// catalog
const itemHTML = (e, i) => `<div class="item" style="top:${i * 96}px"><div class="ic" style="background:${e[2]}22;border:1px solid ${e[2]}55">${dumb(e[2])}</div><div><div class="nm">${e[0]}</div><div class="mu">${e[1]}</div></div><div class="add">+</div><div class="hl"></div></div>`;
$('#catalog').innerHTML = `
  <div class="ttl">Catálogo <span class="mono" style="font:600 14px 'JetBrains Mono';color:var(--muted);letter-spacing:.1em">ARRASTRA · TOCA</span></div>
  <div class="search"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#98A2B0" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span id="sq"></span><i class="caret" id="sCaret" style="height:26px;margin-left:-8px"></i></div>
  <div class="fchips"><div class="chip" id="fc0">Todos</div><div class="chip" id="fc1">Pierna</div><div class="chip">Empuje</div><div class="chip">Tirón</div></div>
  <div class="list"><div id="listA">${CAT_A.map(itemHTML).join('')}</div><div id="listB" class="abs" style="inset:0">${CAT_B.map(itemHTML).join('')}</div></div>`;
const itemsA = $$('#listA .item'), itemsB = $$('#listB .item');

// sheet
$('#sheet').innerHTML = `<div class="inner" id="shIn">
  <div class="sh-head"><div class="sh-bar"></div><div><div class="lab">Día 1 · Pierna · Bloque 1</div><div class="sh-t">Sentadilla trasera</div></div><div style="flex:1"></div>
    <div class="chip" style="color:#FCD34D;background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.45)">Cuádriceps</div><div class="chip b">Fuerza</div></div>
  <div class="fields">
    <div class="fld" style="flex:1"><div class="lab">Series</div><div class="v" id="fvS"><div id="fs0">3</div><div id="fs1">4</div></div><div class="stp"><div id="plusBtn">+</div><div>−</div></div><div class="fg"></div></div>
    <div class="fld" style="flex:1.1"><div class="lab">Reps</div><div class="v"><span id="fvR"></span></div><div class="fg"></div></div>
    <div class="fld" style="flex:.8"><div class="lab">RIR</div><div class="v"><span id="fvI"></span></div><div class="fg"></div></div>
    <div class="fld" style="flex:1.45"><div class="lab">Tempo</div><div class="v" style="font-size:46px;margin-top:22px"><span id="fvT"></span></div><div class="fg"></div></div>
    <div class="fld" style="flex:1.1"><div class="lab">Descanso</div><div class="v"><span id="fvD"></span></div><div class="fg"></div></div>
  </div>
  <div class="lab" style="margin-top:30px">¿Cómo sube el peso?</div>
  <div class="prog"><div class="popt" id="po0"><div class="pt1">Cada semana</div><div class="pt2">+2,5 kg automático por semana</div><div class="rad"><i></i></div><div class="pg"></div></div>
    <div class="popt" id="po1"><div class="pt1">Al completar las reps</div><div class="pt2">Sube cuando llena el rango (doble progresión)</div><div class="rad"><i></i></div><div class="pg"></div></div></div>
  <div id="chart"><svg width="984" height="230" style="position:absolute;left:0;top:0" id="chSvg"></svg><div id="kgBadge">+12,5 kg</div></div>
</div>`;
const flds = $$('#sheet .fld'), fglow = $$('#sheet .fg');
// chart
const KG = [80, 80, 82.5, 85, 85, 87.5, 90, 92.5];
const cx = i => 70 + i * 112, cy = v => 196 - (v - 76) / (96 - 76) * 150;
(() => {
  const svg = $('#chSvg'); let g = '';
  g += `<defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#2680FF"/><stop offset="1" stop-color="#00F7F7"/></linearGradient><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00F7F7" stop-opacity=".28"/><stop offset="1" stop-color="#2680FF" stop-opacity="0"/></linearGradient><clipPath id="chClip"><rect id="chClipR" x="0" y="0" width="0" height="230"/></clipPath></defs>`;
  for (let v = 80; v <= 95; v += 5) g += `<line x1="50" x2="930" y1="${cy(v)}" y2="${cy(v)}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 8"/><text x="22" y="${cy(v) + 5}" fill="#5A6573" font-family="JetBrains Mono" font-size="13" font-weight="600">${v}</text>`;
  KG.forEach((_, i) => g += `<text x="${cx(i)}" y="222" fill="#5A6573" text-anchor="middle" font-family="JetBrains Mono" font-size="13" font-weight="700">S${i + 1}</text>`);
  const pts = KG.map((v, i) => `${cx(i)},${cy(v)}`).join(' ');
  g += `<g clip-path="url(#chClip)"><polygon points="${cx(0)},200 ${pts} ${cx(7)},200" fill="url(#ag)"/><polyline points="${pts}" fill="none" stroke="url(#lg)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 8px rgba(0,247,247,.6))"/></g>`;
  KG.forEach((v, i) => g += `<circle class="dot" cx="${cx(i)}" cy="${cy(v)}" r="8" fill="#0A0E14" stroke="${i === 7 ? '#00F7F7' : '#5C9DFF'}" stroke-width="4" style="transform-origin:${cx(i)}px ${cy(v)}px"/>`);
  g += `<text id="kgEnd" x="${cx(7) + 4}" y="${cy(92.5) - 24}" fill="#fff" text-anchor="end" font-family="Archivo" font-size="22" font-weight="800">92,5 kg</text>`;
  svg.innerHTML = g;
})();
const dots = $$('#chSvg .dot');

// balance
$('#balance').innerHTML = `<div style="font:800 26px Archivo">Balance muscular</div><div style="font:500 16px Inter;color:var(--muted);margin-top:6px">Volumen semanal por grupo</div>
  ${[['Piernas', 34, '#F59E0B,#F97316'], ['Empuje', 33, '#3B82F6,#8B5CF6'], ['Tirón', 33, '#10B981,#34D399']].map(b => `<div class="bal"><div class="bh"><span>${b[0]}</span><span class="bv" data-v="${b[1]}">0%</span></div><div class="bt"><div class="bf" style="background:linear-gradient(90deg,${b[2]})"></div></div></div>`).join('')}
  <div class="chip" id="balOk" style="margin-top:34px;color:#6FE3B4;background:rgba(31,184,119,.14);border-color:rgba(31,184,119,.45);height:44px;font-size:17px">${check('#6FE3B4', 18)} Semana balanceada</div>`;
const balF = $$('#balance .bf'), balV = $$('#balance .bv');

// assign
const STU = [['MA', 'María Aguilar', 'Hipertrofia · 3 días', '#2680FF,#00C9E0'], ['JM', 'Joaquín Muñoz', 'Fuerza · 4 días', '#8B5CF6,#2680FF'], ['CP', 'Camila Pérez', 'Recomposición · 3 días', '#FF6A3D,#F5A524']];
$('#assign').innerHTML = `<div style="font:800 32px Archivo;letter-spacing:-.01em">Asignar a alumnos</div><div style="font:500 17px Inter;color:var(--muted);margin-top:6px">Hipertrofia · Bloque A · 8 semanas</div>
  ${STU.map(s => `<div class="arow"><div class="av" style="background:linear-gradient(135deg,${s[3]})">${s[0]}</div><div><div class="an">${s[1]}</div><div class="as">${s[2]}</div></div><div class="cb"><i>${check()}</i></div></div>`).join('')}
  <div class="btn pri" id="asgBtn" style="width:100%;margin-top:26px;height:60px;font-size:20px">Asignar a 3 alumnos</div>`;
const arows = $$('#assign .arow'), cbs = $$('#assign .cb i');

// phone
$('#screen').innerHTML = `<div class="isl"></div>
  <div class="sbar"><span>9:41</span><span style="display:flex;gap:8px;align-items:center">5G <svg width="28" height="14" viewBox="0 0 28 14"><rect x=".5" y=".5" width="24" height="13" rx="4" fill="none" stroke="#fff" opacity=".5"/><rect x="2.5" y="2.5" width="20" height="9" rx="2" fill="#fff"/><rect x="25.5" y="4.5" width="2" height="5" rx="1" fill="#fff" opacity=".5"/></svg></span></div>
  <div id="notif"><div class="ni"><div class="markFill" style="inset:8px;background:#fff"></div></div><div><div class="n1"><span>EVA</span><span>ahora</span></div><div class="n2">Tu coach te asignó un programa:<br><span style="color:#7FF7F7">Hipertrofia · Bloque A</span></div></div></div>
  <div class="pc" id="pGreet" style="top:168px"><div style="font:600 16px Inter;color:var(--muted)">Lunes 5 de octubre</div><div style="font:900 40px Archivo;margin-top:4px;letter-spacing:-.02em">Hola, María</div></div>
  <div class="pc today" id="pToday" style="top:262px"><div class="tk">HOY · SEMANA 1 DE 8</div><div class="tt">Pierna</div><div class="tm">4 ejercicios · 55 min · Adaptación</div><div class="tb" id="pBtn">▶&nbsp; Comenzar entrenamiento</div></div>
  <div class="pc" id="pList" style="top:540px">${DAYS[0].ex.map((e, i) => `<div class="prow"><div class="pd" style="background:${e[2]}"></div><div><div class="pn">${e[0]}</div><div class="pm">${i === 0 ? '4×8-10 · RIR 2 · 90s' : e[3]}</div></div></div>`).join('')}</div>`;
const prows = $$('#pList .prow');

/* ------------------------------------------------------------ BACKGROUND */
const bg = $('#bg').getContext('2d');
const R0 = rng(7);
const parts = Array.from({ length: 90 }, () => ({ x: R0() * 1920, y: R0() * 1080, z: 0.15 + R0() * 0.85, c: R0() < 0.55 ? '0,247,247' : '92,157,255', ph: R0() * 6.28, sp: 0.4 + R0() }));
function glow(x, y, r, c, a) { const g = bg.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); bg.fillStyle = g; bg.fillRect(x - r, y - r, r * 2, r * 2); }
function drawBG(t, energy) {
  bg.globalCompositeOperation = 'source-over';
  bg.fillStyle = '#02040A'; bg.fillRect(0, 0, 1920, 1080);
  const inApp = t > TC1 && t < TC2;
  glow(inApp ? 1350 + Math.sin(t * .3) * 80 : 960, inApp ? 480 : 470, 1100, '17,38,86', 0.85);
  glow(inApp ? 1500 + Math.cos(t * .4) * 120 : 960 + Math.sin(t) * 40, inApp ? 360 : 420, 700, '38,128,255', 0.22 + energy * 0.12);
  glow(inApp ? 250 : 300, 950, 700, '0,247,247', 0.07 + energy * 0.05);
  glow(1800, 1000, 600, '43,110,165', 0.12);
  // perspective floor grid
  bg.save(); bg.globalAlpha = inApp ? 0.55 : 0.9;
  const hz = 690, vx = 960;
  bg.lineWidth = 1;
  for (let i = -16; i <= 16; i++) {
    const g = bg.createLinearGradient(0, hz, 0, 1080); g.addColorStop(0, 'rgba(92,157,255,0)'); g.addColorStop(1, 'rgba(92,157,255,.10)');
    bg.strokeStyle = g; bg.beginPath(); bg.moveTo(vx + i * 30, hz); bg.lineTo(vx + i * 330, 1080); bg.stroke();
  }
  const sc = (t * 0.45) % 1;
  for (let k = 0; k < 14; k++) {
    const d = (k + sc) / 14, y = hz + (1080 - hz) * Math.pow(d, 2.4);
    bg.strokeStyle = `rgba(92,157,255,${(0.11 * d).toFixed(3)})`; bg.beginPath(); bg.moveTo(0, y); bg.lineTo(1920, y); bg.stroke();
  }
  bg.restore();
  // particles
  bg.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const x = (p.x + t * 18 * p.z * p.sp + 2000) % 2000 - 40, y = p.y + Math.sin(t * 0.7 * p.sp + p.ph) * 26 * p.z - t * 9 * p.z;
    const yy = ((y % 1120) + 1120) % 1120 - 20, r = 1 + p.z * 2.6, a = (0.12 + 0.5 * p.z) * (0.6 + 0.4 * Math.sin(t * 2 * p.sp + p.ph));
    bg.fillStyle = `rgba(${p.c},${a.toFixed(3)})`; bg.beginPath(); bg.arc(x, yy, r, 0, 6.283); bg.fill();
    if (p.z > 0.8) glow(x, yy, r * 7, p.c, a * 0.18);
  }
  // diagonal light streaks (brand slash angle)
  const streak = (t0, dur, off, w, col) => {
    const q = (t - t0) / dur; if (q < 0 || q > 1) return;
    const e = E.io3(q), ang = -26.5 * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang);
    const L = 1500, cx0 = 960 + off * -dy, cy0 = 540 + off * dx;
    const hx = cx0 + dx * lerp(-L, L, e), hy = cy0 + dy * lerp(-L, L, e);
    const tx = cx0 + dx * lerp(-L, L, E.i3(q)), ty = cy0 + dy * lerp(-L, L, E.i3(q));
    const g = bg.createLinearGradient(tx, ty, hx, hy); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},.95)`);
    bg.strokeStyle = g; bg.lineWidth = w; bg.lineCap = 'round'; bg.shadowColor = `rgba(${col},1)`; bg.shadowBlur = 30;
    bg.beginPath(); bg.moveTo(tx, ty); bg.lineTo(hx, hy); bg.stroke(); bg.shadowBlur = 0;
  };
  streak(0.05, 0.75, 0, 5, '0,247,247'); streak(0.12, 0.8, 90, 2, '92,157,255'); streak(0.18, 0.8, -140, 1.5, '255,255,255');
  streak(TC1 - 0.35, 0.8, 260, 3, '0,247,247'); streak(TC1 - 0.3, 0.8, -300, 2, '255,255,255');
  streak(TC2 - 0.35, 0.8, -220, 3, '0,247,247'); streak(TC2 - 0.3, 0.8, 320, 2, '255,255,255');
  bg.globalCompositeOperation = 'source-over';
}
// grain tiles
const grainC = $('#grain').getContext('2d');
const grainTiles = Array.from({ length: 6 }, (_, k) => { const r = rng(100 + k); const img = grainC.createImageData(960, 540); for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } return img; });

/* ------------------------------------------------------------ BURSTS / TRAILS */
const fx = $('#burst').getContext('2d');
const BURSTS = [];
function addBurst(t0, at, n, seed, cols, spd = 900, life = 0.8) { const r = rng(seed); BURSTS.push({ t0, at, life, ps: Array.from({ length: n }, () => ({ a: r() * 6.283, v: spd * (0.3 + r() * 0.7), s: 2 + r() * 5, c: cols[Math.floor(r() * cols.length)], sq: r() < 0.4 })) }); }
const saveBtn = $('#saveBtn');
addBurst(24.15, () => ctr(saveBtn), 70, 3, ['0,247,247', '92,157,255', '31,184,119', '255,255,255'], 1000, 0.9);
addBurst(1.47, () => [960 + 250, 700], 50, 9, ['0,247,247', '255,255,255', '38,128,255'], 1300, 0.9);
addBurst(15.25, () => ctr(slots[0][0]), 30, 5, ['0,247,247', '255,255,255'], 600, 0.6);
addBurst(25.85, () => ctr($('#asgBtn')), 40, 11, ['0,247,247', '92,157,255', '255,255,255'], 800, 0.7);

/* ------------------------------------------------------------ FLY (clones) */
const flyL = $('#fly');
const FLY = [];
function mkClone(e, meta) { const el = h(`<div class="blk"><div class="bar" style="background:${e[2]}"></div><div class="bn">${e[0]}</div><div class="bm">${meta}</div><div class="bmu" style="background:${e[2]};box-shadow:0 0 10px ${e[2]}"></div></div>`); flyL.appendChild(el); op(el, 0); return el; }
// drag clone (Sentadilla) handled with cursor; taps:
const LAND = [[], [], []];
LAND[0][0] = 15.25;
[1, 2, 3].forEach((k, i) => { const t0 = 15.55 + i * 0.3; FLY.push({ el: mkClone(DAYS[0].ex[k], DAYS[0].ex[k][3]), a: t0, b: t0 + 0.5, src: () => rc(itemsA[k]), dst: () => rc(slots[0][k]), hi: 170, seed: k }); LAND[0][k] = t0 + 0.5; });
for (let i = 0; i < 8; i++) {
  const d = 1 + (i % 2), k = Math.floor(i / 2), t0 = 16.75 + i * 0.12;
  FLY.push({ el: mkClone(DAYS[d].ex[k], DAYS[d].ex[k][3]), a: t0, b: t0 + 0.55, src: () => rc(itemsB[(i * 3) % 5]), dst: () => rc(slots[d][k]), hi: 120 + (i % 3) * 40, seed: 20 + i });
  LAND[d][k] = t0 + 0.55;
}
const dragEl = mkClone(DAYS[0].ex[0], DAYS[0].ex[0][3]);

/* ------------------------------------------------------------ CURSOR */
const cur = $('#cursor'), ring = $('#cursorRing');
const optW = $('#optW');
const MOVES = [ // [start,end,targetFn,arc]
  [5.55, 6.0, () => ctr(optW), 60],
  [6.25, 6.9, () => [1700, 1060], 40],
  [9.55, 9.9, () => ctr(dchips[0]), 50],
  [10.0, 10.25, () => ctr(dchips[2]), 30],
  [10.35, 10.6, () => ctr(dchips[4]), 30],
  [10.8, 11.4, () => [1560, 1000], 40],
  [13.55, 14.25, () => { const r = rc(itemsA[0]); return [r.left + 150, r.top + 44]; }, 80],
  [14.45, 15.2, () => { const r = rc(slots[0][0]); return [r.left + 130, r.top + 40]; }, 180],
  [15.3, 15.52, () => ctr($('.add', itemsA[1])), 40],
  [15.62, 15.82, () => ctr($('.add', itemsA[2])), 20],
  [15.92, 16.12, () => ctr($('.add', itemsA[3])), 20],
  [16.25, 16.7, () => [1700, 1070], 40],
  [19.05, 19.55, () => ctr($('#plusBtn')), 70],
  [19.75, 21.05, () => { const r = rc($('#po1')); return [r.left + r.width * 0.6, r.top + r.height * 0.55]; }, 60],
  [21.3, 21.8, () => [1880, 1080], 30],
  [23.55, 24.08, () => ctr(saveBtn), 90],
  [24.35, 24.9, () => [1300, 900], 40],
  [25.2, 25.78, () => ctr($('#asgBtn')), 60],
  [26.0, 26.6, () => [1100, 1100], 40],
];
const CUR_START = [1720, 1120];
const CUR_VIS = [[5.5, 6.9], [9.5, 11.4], [13.5, 16.7], [19.0, 21.8], [23.5, 24.9], [25.1, 26.6]];
const CLICKS = [6.05, 9.95, 10.3, 10.65, 15.57, 15.87, 16.17, 19.6, 21.1, 24.15, 25.85];
const HOLD = [14.28, 15.25];
function cursorPos(t) {
  let p = CUR_START.slice();
  for (const [a, b, fn, arc] of MOVES) {
    if (t <= a) break;
    const to = fn(), q = clamp((t - a) / (b - a)), e = E.io3(q);
    const nx = lerp(p[0], to[0], e), ny = lerp(p[1], to[1], e);
    const dx = to[0] - p[0], dy = to[1] - p[1], L = Math.hypot(dx, dy) || 1, bump = Math.sin(Math.PI * e) * arc;
    p = [nx + (-dy / L) * bump, ny + (dx / L) * bump];
  }
  return p;
}

/* ------------------------------------------------------------ helpers for typed text */
function typed(el, str, t, a, cps = 22) { const n = clamp(Math.floor((t - a) * cps), 0, str.length); const s = t < a ? '' : str.slice(0, n); if (el._s !== s) { el.textContent = s; el._s = s; } return n >= str.length; }
function roll(el0, el1, from, to, q, H) { el0.textContent = from; el1.textContent = to; const e = E.oBack(q); tf(el0, { y: -H * e, o: 1 - clamp(q * 1.6) }); tf(el1, { y: H * (1 - e), o: clamp(q * 1.6) }); }
const SHAKES = [[0.5, 6], [1.2, 7], [1.32, 8], [1.44, 12], [15.25, 7], [24.15, 9], [28.0, 5], [28.1, 5], [28.2, 7]];

/* ------------------------------------------------------------ RENDER */
function render(t) {
  // energy for bg
  let energy = 0; for (const [ti, A] of SHAKES) if (t > ti) energy += Math.exp(-(t - ti) * 4) * A / 10;
  drawBG(t, energy);
  // camera shake
  let sx = 0, sy = 0;
  SHAKES.forEach(([ti, A], i) => { if (t > ti) { const d = Math.exp(-(t - ti) * 14) * A; sx += Math.sin((t - ti) * 83 + i) * d; sy += Math.cos((t - ti) * 71 + i * 2) * d; } });
  tf($('#world'), { x: sx, y: sy });

  /* ---- scene visibility + wipe-through push */
  const intro = $('#intro'), app = $('#app'), outro = $('#outro');
  op(intro, t < TC1 ? 1 : 0); op(app, t >= TC1 && t < TC2 ? 1 : 0); op(outro, t >= TC2 ? 1 : 0);
  wipe(t);

  let fl = 0; [[0.52, .22], [1.46, .35], [TC1, .18], [TC2, .18], [28.2, .2]].forEach(([ti, A]) => { if (t > ti) fl += Math.exp(-(t - ti) * 9) * A; });
  op($('#flash'), fl);

  if (t < TC1 + 0.05) renderIntro(t);
  if (t >= TC1 - 0.05 && t < TC2 + 0.05) renderApp(t);
  if (t >= TC2 - 0.05) renderOutro(t);

  // cursor
  let cv = 0; for (const [a, b] of CUR_VIS) if (t > a - 0.2 && t < b + 0.2) cv = Math.max(cv, Math.min(P(t, a - 0.2, a + 0.05), 1 - P(t, b - 0.05, b + 0.2)));
  const [px, py] = cursorPos(t);
  let press = 0; for (const c of CLICKS) press = Math.max(press, 1 - Math.abs(t - c) / 0.09);
  if (t > HOLD[0] && t < HOLD[1]) press = Math.max(press, P(t, HOLD[0], HOLD[0] + 0.1) * (1 - P(t, HOLD[1] - 0.05, HOLD[1] + 0.05)));
  tf(cur, { x: px - 5, y: py - 4, s: 1 - 0.18 * clamp(press), o: cv });
  let rp = -1; for (const c of CLICKS.concat([HOLD[0]])) if (t >= c && t < c + 0.5) rp = (t - c) / 0.5;
  if (rp >= 0 && cv > 0) tf(ring, { x: px - 40, y: py - 40, s: 0.2 + E.o3(rp) * 1.1, o: (1 - rp) * 0.9 }); else op(ring, 0);

  // bursts & trails
  fx.clearRect(0, 0, 1920, 1080); fx.globalCompositeOperation = 'lighter';
  for (const b of BURSTS) {
    const q = (t - b.t0) / b.life; if (q < 0 || q > 1) continue;
    const [ox, oy] = b.at();
    for (const p of b.ps) {
      const d = p.v * (1 - Math.pow(1 - q, 3)) * b.life * 0.45, x = ox + Math.cos(p.a) * d, y = oy + Math.sin(p.a) * d + q * q * 120;
      fx.fillStyle = `rgba(${p.c},${(1 - q).toFixed(3)})`;
      if (p.sq) { fx.save(); fx.translate(x, y); fx.rotate(p.a + q * 6); fx.fillRect(-p.s, -p.s * 0.4, p.s * 2.4, p.s * 0.8); fx.restore(); }
      else { fx.beginPath(); fx.arc(x, y, p.s * (1 - q * 0.6), 0, 6.283); fx.fill(); }
    }
    if (q < 0.5) { const rr = E.o3(q * 2) * 190; fx.strokeStyle = `rgba(0,247,247,${(0.8 * (1 - q * 2)).toFixed(3)})`; fx.lineWidth = 3; fx.beginPath(); fx.arc(ox, oy, rr, 0, 6.283); fx.stroke(); }
  }
  fx.globalCompositeOperation = 'source-over';

  // grain
  grainC.putImageData(grainTiles[Math.floor(t * 60) % 6], 0, 0);
}

function wipe(t) {
  const bands = [$('#wb1'), $('#wb2'), $('#wb3')], leads = [230, 115, 0];
  let tc = null; for (const c of [TC1, TC2]) if (Math.abs(t - c) < 0.55) tc = c;
  if (tc === null) { bands.forEach(b => op(b, 0)); return; }
  const q = clamp((t - (tc - 0.55)) / 1.1), e = E.io4(q), y0 = lerp(1141, -3141, e);
  bands.forEach((b, i) => { b.style.top = (y0 - leads[i]) + 'px'; b.style.height = (2000 + 2 * leads[i]) + 'px'; op(b, 1); });
}

/* ---------------- INTRO */
function renderIntro(t) {
  const mw = $('#iMarkWrap');
  const q = P(t, 0.42, 1.5, E.oExpo);
  const exit = P(t, 3.3, TC1, E.i3);
  tf($('#iLock'), { s: lerp(1, 1.035, P(t, 1.6, 3.4, E.io3)) + exit * 0.5, o: 1 - exit * 0.6, blur: exit * 14 });
  tf(mw, { y: lerp(40, 0, q) + (t > 1.6 ? Math.sin((t - 1.6) * 2.2) * 5 : 0), s: lerp(0.84, 1, q), r: lerp(-9, 0, q), o: P(t, 0.4, 0.6, E.lin) });
  const rev = P(t, 0.45, 1.15, E.io3) * 2;
  $('#iMark').style.clipPath = diagClip(rev);
  $('#iMarkOut').style.clipPath = diagClip(rev + 0.35);
  op($('#iMarkOut'), P(t, 0.45, 0.6, E.lin) * (1 - P(t, 1.1, 1.8, E.o2)));
  op($('#iMarkGlow'), P(t, 0.8, 1.3) * 0.35 + Math.max(0, 1 - Math.abs(t - 1.5) * 3) * 0.4 + 0.08 * Math.sin(t * 3));
  const L = [['#wmE', 1.12, -70, 0], ['#wmV', 1.24, 0, 50], ['#wmA', 1.36, 70, 0]];
  for (const [id, a, dx, dy] of L) { const e = P(t, a, a + 0.5, E.oExpo); tf($(id), { x: dx * (1 - e), y: dy * (1 - e), s: lerp(1.9, 1, e), o: P(t, a, a + 0.12, E.lin), blur: (1 - e) * 16 }); }
  const g = $('#iGlint'); g.style.backgroundPosition = `${lerp(100, 0, P(t, 1.75, 2.45, E.io3))}% 0`; op(g, win(t, 1.75, 2.45) ? 1 : 0);
  introWords.forEach((w, i) => { const e = P(t, 1.95 + i * 0.07, 2.65 + i * 0.07, E.oExpo); tf(w, { y: (1 - e) * 70, o: e }); });
}

/* ---------------- OUTRO */
function renderOutro(t) {
  const q = P(t, TC2, TC2 + 1.0, E.oExpo);
  tf($('#oLock'), { s: lerp(1.12, 1, q) + P(t, 28.7, 30, E.lin) * 0.025 });
  const rev = P(t, TC2 + 0.05, TC2 + 0.6, E.io3) * 2;
  $('#oMark').style.clipPath = diagClip(rev);
  tf($('#oMarkWrap'), { y: lerp(30, 0, q) + (t > 28.8 ? Math.sin((t - 28.8) * 2.2) * 4 : 0), r: lerp(-7, 0, q) });
  op($('#oMarkGlow'), P(t, 27.9, 28.5) * (0.45 + 0.1 * Math.sin(t * 3)));
  [['#owE', 27.95, -60, 0], ['#owV', 28.05, 0, 40], ['#owA', 28.15, 60, 0]].forEach(([id, a, dx, dy]) => { const e = P(t, a, a + 0.5, E.oExpo); tf($(id), { x: dx * (1 - e), y: dy * (1 - e), s: lerp(1.8, 1, e), o: P(t, a, a + 0.12, E.lin), blur: (1 - e) * 14 }); });
  const g = $('#oGlint'); g.style.backgroundPosition = `${lerp(100, 0, P(t, 28.55, 29.25, E.io3))}% 0`; op(g, win(t, 28.55, 29.25) ? 1 : 0);
  out1.forEach((w, i) => { const e = P(t, 28.4 + i * 0.06, 29.0 + i * 0.06, E.oExpo); tf(w, { y: (1 - e) * 70, o: e }); });
  out2.forEach((w, i) => { const e = P(t, 28.75 + i * 0.07, 29.35 + i * 0.07, E.oExpo); tf(w, { y: (1 - e) * 70, o: e }); });
  const u = P(t, 29.1, 29.7, E.oExpo); const ue = $('#oUrl'); ue.style.letterSpacing = lerp(0.8, 0.4, u) + 'em'; op(ue, u);
}

/* ---------------- APP */
function renderApp(t) {
  const pushIn = P(t, TC1, TC1 + 0.9, E.oExpo), pushOut = P(t, TC2 - 0.5, TC2, E.i3);
  tf($('#app'), { s: lerp(1.08, 1, pushIn) + pushOut * 0.12, o: 1, blur: pushOut * 8 + (1 - pushIn) * 6 });
  // brand bug
  const bb = P(t, 4.1, 4.8); tf($('#brandBug'), { y: (1 - bb) * -30, o: bb });

  // HUD steps
  STEPS.forEach((st, i) => {
    const S = stepEls[i], a = st.a, b = st.b;
    const vis = t > a - 0.1 && t < b + 0.4;
    op(S.el, vis ? 1 : 0); if (!vis) return;
    const ta = a + 0.12;
    S.ch.forEach((c, j) => {
      const ein = P(t, ta + j * 0.022, ta + j * 0.022 + 0.65, E.oExpo), eout = i < 4 ? P(t, b - 0.28 + j * 0.012, b + 0.05 + j * 0.012, E.i3) : 0;
      tf(c, { y: (1 - ein) * 115 - eout * 115, r: (1 - ein) * 8 });
    });
    const ek = P(t, a + 0.05, a + 0.6, E.oExpo), eko = i < 4 ? P(t, b - 0.3, b, E.i3) : 0;
    tf(S.kick, { x: (1 - ek) * -40, o: ek * (1 - eko) });
    S.w.forEach((w, j) => { const e = P(t, a + 0.35 + j * 0.035, a + 0.95 + j * 0.035, E.oExpo), eo = i < 4 ? P(t, b - 0.3, b - 0.02, E.i3) : 0; tf(w, { y: (1 - e) * 48 - eo * 40, o: e * (1 - eo) }); });
  });
  // big number odometer
  let k = STEPS.findIndex(s => t >= s.a && t < s.b); if (k < 0) k = t < 4 ? 0 : 4;
  const q = P(t, STEPS[k].a, STEPS[k].a + 0.7, E.lin);
  if (k === 0) { roll($('#bn0'), $('#bn1'), '', '01', P(t, 4.0, 4.7, E.lin), 330); }
  else roll($('#bn0'), $('#bn1'), STEPS[k - 1].n, STEPS[k].n, q, 330);
  tf($('#bigNum'), { x: Math.sin(t * 0.5) * 6 });
  // progress
  const pe = P(t, 4.2, 4.9);
  tf($('#progress'), { y: (1 - pe) * 40, o: pe });
  segs.forEach((sg, i) => { const f = clamp((t - STEPS[i].a) / (STEPS[i].b - STEPS[i].a)); sg.fill.style.width = (f * 100).toFixed(2) + '%'; sg.lbl.style.color = t >= STEPS[i].a && t < STEPS[i].b ? '#F4F6F8' : f >= 1 ? '#98A2B0' : '#5A6573'; });

  renderCfg(t); renderBoard(t); renderCatalog(t); renderSheet(t); renderBalance(t); renderAssign(t); renderPhone(t); renderFly(t);
}

function renderCfg(t) {
  const el = $('#cfg');
  if (t > 8.95) { op(el, 0); return; }
  const e = P(t, 4.0, 4.95, E.oExpo), x = P(t, 8.15, 8.85, E.ioExpo);
  tf(el, { x: (1 - e) * 420 - x * 60, y: -x * 140, ry: lerp(-38, -7, e) + Math.sin(t * 0.8) * 1.2 + x * 10, rx: 2 + Math.cos(t * 0.7) * 0.8 + x * 28, s: lerp(1, 0.82, x), o: Math.min(e * 1.4, 1) * (1 - x), blur: x * 6 });
  cfgRows.forEach((r, i) => { const q = P(t, 4.35 + i * 0.09, 5.0 + i * 0.09, E.oExpo); tf(r, { y: (1 - q) * 40, o: q }); });
  // name typing
  const done = typed($('#cfgNameT'), 'Hipertrofia · Bloque A', t, 4.85, 24);
  const typing = t > 4.8 && t < 5.9;
  $('#cfgName').classList.toggle('on', typing);
  op($('#cfgCaret'), typing ? (Math.floor(t * 4) % 2 === 0 || !done ? 1 : 0) : 0);
  // structure pill: starts on Ciclo, clicked to Semanal at 6.05
  const pill = $('#cfgPill'), pp = P(t, 5.25, 5.6, E.oBack), mv = P(t, 6.05, 6.5, E.oBack);
  tf(pill, { x: 472 * (1 - mv), s: lerp(0.6, 1, pp), o: clamp(pp * 2) });
  $('#optW').style.color = mv > 0.5 ? '#fff' : '#98A2B0'; $('#optC').style.color = mv < 0.5 && pp > 0.5 ? '#fff' : '#98A2B0';
  // duration counter 1 → 8
  const dq = clamp((t - 6.45) / 0.9), n = Math.min(8, 1 + Math.floor(dq * 7.999)), prevT = 6.45 + (n - 1) * (0.9 / 7);
  if (t < 6.45) roll($('#dn0'), $('#dn1'), '', '1', P(t, 5.3, 5.7, E.lin), 96);
  else roll($('#dn0'), $('#dn1'), String(Math.max(1, n - 1)), String(n), n === 1 ? 1 : clamp((t - prevT) / 0.13), 96);
  pips.forEach((p, i) => { const pt = 6.45 + i * (0.9 / 7), e = P(t, pt, pt + 0.35, E.oBack); tf($('.pf', p), { s: lerp(0.3, 1, e), o: clamp(e) }); $('span', p).style.color = e > 0.5 ? '#fff' : '#5A6573'; });
  // phases
  phs.forEach((p, i) => { const a = 7.3 + i * 0.16, e = P(t, a, a + 0.5, E.o5); $('.pbar', p).style.width = (e * 100) + '%'; tf($('.pt', p), { x: (1 - e) * -20, o: e }); tf($('.ps', p), { x: (1 - e) * -20, o: P(t, a + 0.15, a + 0.6) }); });
}

function renderBoard(t) {
  const el = $('#board');
  if (t < 8.3 || t > 25.4) { op(el, 0); return; }
  const e = P(t, 8.45, 9.2, E.oExpo);
  const sh = -40 * P(t, 12.5, 13.1, E.io3);
  let T = { x: (1 - e) * 120 + sh, y: (1 - e) * 60, ry: (1 - e) * -16, rx: (1 - e) * 10, s: lerp(0.92, 1, e), o: e, blur: 0 };
  // S4 zoom into slot0
  const z = P(t, 18.55, 19.15, E.io4) * (1 - P(t, 22.55, 23.1, E.io4));
  if (z > 0) { const s = lerp(1, 1.75, z); T = { x: (1 - s) * 154 + sh, y: (1 - s) * 345, s, o: 1 - clamp(z * 1.6), blur: z * 6 }; }
  // S5 exit
  const xo = P(t, 24.65, 25.25, E.ioExpo);
  if (xo > 0) T = { x: -xo * 380 + sh, y: xo * 30, s: lerp(1, 0.84, xo), ry: xo * 14, o: 1 - xo, blur: xo * 8 };
  tf(el, T);
  // day chips
  dchips.forEach((c, i) => {
    const a = 8.95 + i * 0.05, q = P(t, a, a + 0.5, E.oBack); tf(c, { s: lerp(0.3, 1, q), o: clamp(q * 1.5) });
    const act = [9.95, null, 10.3, null, 10.65][i];
    if (act) { const f = P(t, act, act + 0.25, E.oBack); tf($('.dcf', c), { s: lerp(0.4, 1, f), o: clamp(f) }); $('span', c).style.color = f > 0.4 ? '#fff' : ''; c.style.boxShadow = f > 0.4 ? '0 0 26px rgba(38,128,255,.55)' : 'none'; }
  });
  const cn = P(t, 10.7, 11.1); tf($('#chipsNote'), { x: (1 - cn) * -20, o: cn });
  // columns spring out of their chip
  let total = 0;
  cols.forEach((c, i) => {
    const a = [9.98, 10.33, 10.68][i], q = P(t, a, a + 0.7, E.oBack), qo = P(t, a, a + 0.2, E.lin);
    tf(c, { y: (1 - q) * -120, sy: lerp(0.25, 1, q), sx: lerp(0.6, 1, q), o: qo }); c.style.transformOrigin = '50% 0';
    typed(colT[i], DAYS[i].n, t, a + 0.25, 20);
    let cnt = 0;
    blks[i].forEach((b, j) => {
      const L = LAND[i][j]; const landed = L !== undefined && t >= L;
      if (!landed) { op(b, 0); return; }
      cnt++;
      const ql = clamp((t - L) / 0.55), sq = E.oElastic(ql);
      tf(b, { sy: lerp(0.55, 1, sq), sx: lerp(1.12, 1, sq), o: 1 }); b.style.transformOrigin = '50% 100%';
      op($('.glow', b), 1 - E.o2(clamp((t - L) / 0.7)));
    });
    // meta update after prescribing
    const m = $('.bm', blks[0][0]); const nm = t >= 22.9 ? '4×8-10 · 90s' : '3×10 · 60s'; if (m.textContent !== nm) m.textContent = nm;
    if (colCnt[i].textContent !== String(cnt)) colCnt[i].textContent = cnt;
    total += cnt;
    const dz = drops[i]; op(dz, cnt === 0 ? 1 : 0);
    const pulse = t > 11.0 ? 0.28 + 0.25 * (0.5 + 0.5 * Math.sin((t - 11) * 6 - i)) : 0.28;
    dz.style.borderColor = `rgba(0,247,247,${pulse.toFixed(3)})`;
  });
  const ad = P(t, 10.95, 11.5, E.oExpo), adOut = P(t, 12.45, 12.8, E.i3);
  tf($('#addCol'), { y: (1 - ad) * 40 - adOut * 20, x: adOut * 60, o: ad * (1 - adOut) });
  const exN = $('#exN'); if (exN.textContent !== String(total)) { exN.textContent = total; exN._t = t; }
  const cc = $('#exCount'); const bump = exN._t !== undefined ? Math.max(0, 1 - (t - exN._t) / 0.25) : 0;
  tf(cc, { s: 1 + bump * 0.12 }); cc.classList.toggle('b', total > 0);
  // save button
  const sv = P(t, 24.15, 24.45, E.oBack);
  tf($('#saveB'), { y: (1 - sv) * 52 }); tf($('#saveA'), { y: -sv * 52 });
  tf(saveBtn, { s: 1 - 0.08 * Math.max(0, 1 - Math.abs(t - 24.15) / 0.1) });
}

function renderCatalog(t) {
  const el = $('#catalog');
  if (t < 12.4 || t > 18.9) { op(el, 0); return; }
  const e = P(t, 12.5, 13.15, E.oExpo), x = P(t, 18.35, 18.85, E.ioExpo);
  tf(el, { x: (1 - e) * 520 + x * 520, ry: (1 - e) * -25, o: Math.min(1, e * 1.5) * (1 - x) });
  // search: "pierna" then clear
  const sq = $('#sq');
  let s = '';
  if (t < 16.3) { const n = clamp(Math.floor((t - 13.05) * 14), 0, 6); s = 'pierna'.slice(0, t < 13.05 ? 0 : n); }
  else { const n = clamp(6 - Math.floor((t - 16.3) * 40), 0, 6); s = 'pierna'.slice(0, n); }
  if (sq.textContent !== s) sq.textContent = s;
  op($('#sCaret'), Math.floor(t * 3.5) % 2 === 0 ? 1 : 0.2);
  const fA = t >= 13.5 && t < 16.45;
  $('#fc1').classList.toggle('on', fA); $('#fc0').classList.toggle('on', t >= 16.45);
  const swap = P(t, 16.42, 16.62, E.io3);
  itemsA.forEach((it, i) => {
    const q = P(t, 13.5 + i * 0.06, 14.0 + i * 0.06, E.oExpo);
    const grabbed = i === 0 && t > 14.3 && t < 15.3;
    tf(it, { x: (1 - q) * 60 + swap * -40, o: q * (1 - swap) * (grabbed ? 0.35 : 1) });
    const tap = [null, 15.57, 15.87, 16.17][i] ?? 14.3;
    op($('.hl', it), Math.max(0, 1 - Math.abs(t - tap) / 0.2) + (i === 0 && t > 13.9 && t < 14.35 ? P(t, 13.95, 14.2) * 0.6 : 0));
  });
  itemsB.forEach((it, i) => {
    const q = P(t, 16.5 + i * 0.05, 16.95 + i * 0.05, E.oExpo);
    tf(it, { x: (1 - q) * 60, o: q });
    let hl = 0; for (let j = 0; j < 8; j++) if ((j * 3) % 5 === i) hl = Math.max(hl, 1 - Math.abs(t - (16.75 + j * 0.12)) / 0.14);
    op($('.hl', it), hl);
  });
}

function renderFly(t) {
  // drag clone
  const dq = t > 14.3 && t < 15.25;
  if (dq || (t >= 15.25 && t < 15.3)) {
    const [px, py] = cursorPos(t), lift = P(t, 14.3, 14.5, E.oBack), drop = P(t, 15.1, 15.25, E.i3);
    const vx = cursorPos(t)[0] - cursorPos(t - 1 / 60)[0];
    tf(dragEl, { x: px - 130, y: py - 40, s: lerp(1, 1.08, lift) - drop * 0.08, r: clamp(vx * 0.35, -9, 9) + lift * -2, o: t < 15.25 ? 1 : 0 });
    dragEl.style.boxShadow = `0 ${30 * lift}px ${60 * lift}px -10px rgba(0,0,0,.8),0 0 0 2px rgba(0,247,247,${0.7 * lift})`;
  } else op(dragEl, 0);
  // trails canvas uses fx (after bursts cleared in render). Draw here into fx later—collect
  for (const f of FLY) {
    if (t < f.a || t > f.b) { op(f.el, 0); continue; }
    const q = (t - f.a) / (f.b - f.a), e = E.io3(q);
    const S = f.src(), D = f.dst();
    const x = lerp(S.left + S.width / 2, D.left + D.width / 2, e), y = lerp(S.top + S.height / 2, D.top + D.height / 2, e) - Math.sin(Math.PI * e) * f.hi;
    tf(f.el, { x: x - 112, y: y - 39, s: lerp(0.8, 1, E.o3(q)) + Math.sin(Math.PI * e) * 0.1, r: Math.sin(Math.PI * e) * -10, o: clamp(q * 6) });
    f.el.style.boxShadow = `0 24px 50px -12px rgba(0,0,0,.85),0 0 0 2px rgba(0,247,247,.5)`;
    // trail
    fx.save(); fx.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 6; k++) {
      const qq = Math.max(0, q - k * 0.035), ee = E.io3(qq);
      const tx = lerp(S.left + S.width / 2, D.left + D.width / 2, ee), ty = lerp(S.top + S.height / 2, D.top + D.height / 2, ee) - Math.sin(Math.PI * ee) * f.hi;
      fx.fillStyle = `rgba(0,247,247,${(0.16 * (1 - k / 7)).toFixed(3)})`;
      fx.beginPath(); fx.roundRect(tx - 100, ty - 30, 200, 60, 16); fx.fill();
    }
    fx.restore();
  }
}

function renderSheet(t) {
  const el = $('#sheet');
  if (t < 18.55 || t > 23.1) { op(el, 0); return; }
  const F = { x: 720, y: 130, w: 1080, h: 800 };
  const g = P(t, 18.6, 19.2, E.io4) * (1 - P(t, 22.55, 23.05, E.io4));
  const S = rc(slots[0][0]);
  const x = lerp(S.left, F.x, g), y = lerp(S.top, F.y, g), w = lerp(S.width, F.w, g), hh = lerp(S.height, F.h, g);
  el.style.transform = `translate(${(x - F.x).toFixed(2)}px,${(y - F.y).toFixed(2)}px) scale(${(w / F.w).toFixed(4)},${(hh / F.h).toFixed(4)})`;
  op(el, clamp(g * 5) * (t > 23.0 ? 1 - P(t, 23.0, 23.08, E.lin) : 1));
  el.style.borderRadius = (30 / Math.max(0.2, w / F.w)).toFixed(1) + 'px ' + '/ ' + (30 / Math.max(0.1, hh / F.h)).toFixed(1) + 'px';
  el.style.borderColor = `rgba(0,247,247,${(0.5 * (1 - g) + 0.08).toFixed(3)})`;
  const ci = P(t, 19.0, 19.4) * (1 - P(t, 22.5, 22.7, E.lin));
  const shIn = $('#shIn'); op(shIn, ci); tf(shIn, { y: (1 - P(t, 19.0, 19.6, E.oExpo)) * 30, o: ci });
  // fields
  flds.forEach((f, i) => { const q = P(t, 19.1 + i * 0.05, 19.6 + i * 0.05, E.oExpo); tf(f, { y: (1 - q) * 30, o: q }); });
  roll($('#fs0'), $('#fs1'), '3', '4', P(t, 19.6, 19.9, E.lin), 56);
  tf($('#plusBtn'), { s: 1 - 0.2 * Math.max(0, 1 - Math.abs(t - 19.6) / 0.1) });
  typed($('#fvR'), '8-10', t, 19.85, 18); typed($('#fvI'), '2', t, 20.1, 10); typed($('#fvT'), '3-1-X-1', t, 20.3, 26); typed($('#fvD'), '90s', t, 20.6, 16);
  [19.6, 19.85, 20.1, 20.3, 20.6].forEach((a, i) => op(fglow[i], Math.max(0, 1 - Math.abs(t - (a + 0.12)) / 0.35)));
  // progression
  const sel = P(t, 21.1, 21.35, E.oBack);
  tf($('#po1 .rad i'), { s: sel }); op($('#po1 .pg'), clamp(sel)); $('#po1').style.background = sel > 0.3 ? 'rgba(0,247,247,.06)' : '#0A0E14';
  tf($('#po1'), { s: 1 - 0.03 * Math.max(0, 1 - Math.abs(t - 21.1) / 0.12) });
  // chart
  const cp = P(t, 21.35, 22.45, E.io3);
  $('#chClipR').setAttribute('width', (50 + cp * 900).toFixed(1));
  dots.forEach((d, i) => { const at = (cx(i) - 50) / 900; const e = P(cp, at - 0.02, at + 0.1, E.oBack); d.style.transform = `scale(${e.toFixed(3)})`; });
  const kb = P(t, 22.2, 22.5, E.oBack); tf($('#kgBadge'), { s: lerp(0.5, 1, kb), o: clamp(kb) }); op($('#kgEnd'), P(t, 22.15, 22.4));
}

function renderBalance(t) {
  const el = $('#balance');
  if (t < 23.0 || t > 25.4) { op(el, 0); return; }
  const e = P(t, 23.05, 23.6, E.oExpo), xo = P(t, 24.65, 25.25, E.ioExpo);
  tf(el, { x: (1 - e) * 480 - xo * 380, y: xo * 30, s: lerp(1, 0.84, xo), o: Math.min(1, e * 1.4) * (1 - xo), blur: xo * 8 });
  balF.forEach((b, i) => { const q = P(t, 23.35 + i * 0.1, 24.0 + i * 0.1, E.o5), v = +balV[i].dataset.v; b.style.width = (q * v * 2.4) + '%'; balV[i].textContent = Math.round(q * v) + '%'; });
  const ok = P(t, 23.95, 24.25, E.oBack); tf($('#balOk'), { s: lerp(0.6, 1, ok), o: clamp(ok) });
}

function renderAssign(t) {
  const el = $('#assign');
  if (t < 24.8) { op(el, 0); return; }
  const e = P(t, 24.85, 25.45, E.oExpo);
  tf(el, { x: (1 - e) * 200, ry: (1 - e) * -20, s: lerp(0.94, 1, e), o: Math.min(1, e * 1.5) });
  arows.forEach((r, i) => { const q = P(t, 25.0 + i * 0.07, 25.5 + i * 0.07, E.oExpo); tf(r, { y: (1 - q) * 30, o: q }); const c = P(t, 25.3 + i * 0.12, 25.55 + i * 0.12, E.oBack); tf(cbs[i], { s: c }); r.style.borderColor = c > 0.5 ? 'rgba(0,247,247,.35)' : ''; });
  const b = $('#asgBtn'); tf(b, { s: 1 - 0.06 * Math.max(0, 1 - Math.abs(t - 25.85) / 0.1) });
  if (t > 25.85) { b.textContent = '✓  Asignado a 3 alumnos'; b.style.background = 'linear-gradient(135deg,#1FB877,#0E7A50)'; } else { b.textContent = 'Asignar a 3 alumnos'; b.style.background = ''; }
}

function renderPhone(t) {
  const el = $('#phone');
  if (t < 25.8) { op(el, 0); return; }
  const e = P(t, 25.85, 26.75, E.oExpo);
  tf(el, { y: (1 - e) * 950 + Math.sin(t * 1.6) * 5 * e, r: (1 - e) * 10, ry: -6 + Math.sin(t) * 1.5, rx: 3, o: 1 });
  const n = P(t, 26.35, 26.8, E.oBack); tf($('#notif'), { y: (1 - n) * -170, s: lerp(0.9, 1, n) });
  const g = P(t, 26.1, 26.6, E.oExpo); tf($('#pGreet'), { y: (1 - g) * 30, o: g });
  const td = P(t, 26.2, 26.8, E.oExpo); tf($('#pToday'), { y: (1 - td) * 60, s: lerp(0.94, 1, td), o: td });
  prows.forEach((r, i) => { const q = P(t, 26.45 + i * 0.07, 26.95 + i * 0.07, E.oExpo); tf(r, { x: (1 - q) * 40, o: q }); });
  const pb = $('#pBtn'); const pul = t > 26.9 ? 0.5 + 0.5 * Math.sin((t - 26.9) * 7) : 0; pb.style.boxShadow = `0 0 ${(10 + pul * 30).toFixed(1)}px rgba(0,247,247,${(pul * 0.8).toFixed(2)})`;
}

window.render = render;
window.DUR = DUR;
window.__ready = document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => { })))).then(() => { render(0); return true; });
