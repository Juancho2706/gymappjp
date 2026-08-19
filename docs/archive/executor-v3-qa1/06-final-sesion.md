# QA1 · Ejecutor V3 "Impulso" — Fidelidad visual · Unidad 06: FINAL DE SESIÓN (celebración + resumen)

**Auditor:** subagente de fidelidad visual · **Fecha:** 2026-07-22
**Contrato visual:** `docs/research/executor-redesign/mockups/concepto-a-v2.html` (pantalla "5 · FINAL", CSS `.a2-final*` líneas 463-527, markup líneas 894-993). La pantalla de celebración/resumen NO vive en `concepto-a-v3-core.html` (ese archivo solo tiene splash/inicio/fuerza/descanso/cardio); el contrato del cierre es el bloque "Final nueva" de `concepto-a-v2.html`, tal como declaran los propios comentarios de la implementación.
**Implementación web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionCompleteV3.tsx` (+ `use-session-summary.ts`, `WeeklyStreakDots.tsx`, `weekly-streak.ts`, `Ticker.tsx`, `../MuscleMapSvg.tsx`, tokens en `apps/web/src/app/globals.css`).
**Implementación RN:** `apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx` (+ `WeekStreakDots.tsx`, `NumberTicker.tsx`, `exec-theme.ts`, `../MuscleMapSvg`).

---

## Veredicto (2 líneas)

La coreografía (clima → stats con tickers), el PR dorado con medalla, el mapa muscular, la racha y los dos CTA **existen en ambas plataformas** y la lógica de negocio es fiel. Pero hay **1 BLOCKER** de identidad: el fondo de la pantalla final en web es un **plano frío `#0B0E13` (`--ink-950`)** que tapa el degradado cálido del mockup (`#1c1c24→#16161d→#121218`) que sí muestra el resto del flujo V3 — exactamente el "color de fondo distinto" que reportó el CEO — más una tanda de MAYORES por uso de tokens genéricos fríos de EVA-DS en vez de las superficies cálidas del mockup (web) y por chrome perdido / labels sin uppercase / stats coloreados con la marca (RN).

**Severidad máxima: BLOCKER.**

---

## Deltas

### BLOCKER

**[B-1] Fondo de la pantalla final (web) plano y frío en vez del degradado cálido del contrato.**
- **Mockup:** el `.a2-screen` (fondo de TODA la pantalla) es `radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%)` — un gris cálido con vida (v2 línea 60). El root V3 web lo reproduce idéntico: `globals.css:1424-1425` (`[data-exec-v3] { background: radial-gradient(...#1c1c24...#16161d...#121218...) fixed }`) y el resto de pantallas V3 (SessionStart, SessionIntro) son `fixed inset-0` **sin fondo propio**, dejando ver ese degradado.
- **Web:** `SessionCompleteV3.tsx:133` — el contenedor es `fixed inset-0 z-[9999] ... bg-[var(--ink-950)]`, y `--ink-950 = #0B0E13` (`globals.css:378`), un negro-azulado frío y plano que **pinta encima** del degradado del root. La pantalla de cierre queda visiblemente más oscura, más azul y sin degradado que el resto del ejecutor y que el mockup.
- **RN:** `SessionCompleteV3.tsx:195` — `backgroundColor: s.appBg` con `s.appBg = '#16161d'` (`exec-theme.ts:66`). Es plano (pierde el degradado) pero usa el **stop cálido correcto** del mockup, así que RN NO tiene el problema de color, solo el matiz de "falta el degradado" (ver M-11).
- **Fix:** en web, quitar `bg-[var(--ink-950)]` del contenedor raíz de `SessionCompleteV3` (dejar que herede el degradado de `[data-exec-v3]`) o setear explícitamente `bg-transparent`; si se quiere fondo propio, usar el mismo `radial-gradient(...#1c1c24...#16161d...#121218...)`. Nunca `--ink-950`.

---

### MAYOR

**[M-2] Superficies de las cards (web) usan tokens fríos de EVA-DS en vez de los grises cálidos del mockup.** "Restos del ejecutor viejo / DS genérico".
- **Mockup:** `.a2-stat` bg `#1a1a22`, borde `1.5px #2a2a34`, radio `16px` (v2 líneas 469-471). `.a2-muscle` bg `#15151c`, borde `1.5px #24242e`, radio `16px` (488-491). PR gradient base sobre `#16161d`/`#17171f` (476).
- **Web:**
  - StatTile: `bg-[var(--ink-900)]` = `#12161D` (frío) vs `#1a1a22`; `border border-[var(--border-inverse)]` = `rgba(255,255,255,0.10)` a **1px** vs `1.5px #2a2a34` — `SessionCompleteV3.tsx:350`.
  - Card mapa muscular: `bg-white/[0.03]` (translúcido, ~`rgba(255,255,255,0.03)`) vs sólido `#15151c`; mismo borde `--border-inverse` — `:263`.
  - Card PR: gradient `linear-gradient(135deg, color-mix(GOLD 20%, var(--ink-900)), var(--ink-900))` — base `#12161D` frío vs `#16161d/#17171f` cálido del mockup — `:226`.
- **RN:** usa los literales cálidos del mockup vía `EXEC_SURFACE` (`#1a1a22`/`#2a2a34`/`#15151c`), **fiel** salvo el sub-matiz M-8b.
- **Fix web:** reemplazar los tokens `--ink-900`/`--border-inverse`/`white/[0.03]` de este componente por los literales cálidos del contrato (`#1a1a22`, `1.5px #2a2a34`, `#15151c`, `#24242e`), idealmente exponiéndolos como vars locales bajo `[data-exec-v3]` (igual que ya hace `.exec-v3-plan { background:#1a1a22 }` en `globals.css:1517`). El componente Final es hoy el único de la rama V3 web escrito con tokens DS en vez de la piel del ejecutor.

**[M-3] Radio de las cards (web) 20px vs 16px del mockup.**
- **Mockup:** `.a2-stat`/`.a2-muscle`/`.a2-stat.pr` todas `border-radius: 16px` (v2 470, 490, y PR hereda).
- **Web:** `rounded-card` = `--radius-card: 20px` (`globals.css:130`) en StatTile (`:350`), card PR (`:223`) y card mapa (`:263`). Esquinas visiblemente más redondas que el contrato.
- **RN:** StatTile `borderRadius:14` (`:411`), PR `16` (`:272`), mapa `18` (`:311`) — dispares entre sí y ninguno es exactamente 16, aunque más cerca.
- **Fix:** web → `rounded-[16px]` (o var local `--exec-radius-card:16px`); RN → unificar StatTile/PR/mapa a 16.

**[M-4] Oro del PR (web) hardcodeado `#F4B740` en vez del oro del mockup / token `--exec-pr` `#f5c451`.**
- **Mockup:** `--gold: #f5c451` (v2 línea 6); medalla, `sv` y `sl` del PR usan ese oro (474-486).
- **Web:** `const GOLD = '#F4B740'` (`SessionCompleteV3.tsx:32`), usado en borde, gradiente, medalla y textos del PR (`:225-253`). Es un oro **distinto** (más ámbar) y además **ignora el token `--exec-pr: #f5c451`** que el propio proyecto definió para esto (`globals.css:1423`) y que el PR-en-vivo (`PrCelebration.tsx:19-25`) sí respeta. Incoherencia dentro de la misma app.
- **RN:** `gold = exec.pr` con `EXEC_PR_GOLD = '#f5c451'` (`exec-theme.ts:32,116/135`) — **fiel** al mockup.
- **Fix web:** borrar la constante `GOLD` y usar `var(--exec-pr)` (o `#f5c451`) en todo el bloque PR.

**[M-5] "Volver al inicio" (RN) es texto plano, no el botón secundario del mockup.**
- **Mockup:** `.a2-finalsec` es un BOTÓN con chrome: `height 52px`, `border-radius 15px`, `background #1c1c24`, `border 2px #2f2f3a`, `color #e8e8ee`, `font 15px/800`, centrado (v2 521-525).
- **RN:** `SessionCompleteV3.tsx:347-355` — `Pressable` con solo `<Text ... fontSize:14, color:s.textMuted>` y `paddingVertical:12`. Sin borde, sin fondo, sin radio: parece un link tenue, no un botón. Pierde la jerarquía y el "juicy" secundario.
- **Web:** `:316-322` — sí es botón (`h-[50px] border-2 rounded-control bg-white/[0.04] font-extrabold`), aunque con borde `--border-inverse` (ver M-2) y color de fondo distinto; conceptualmente fiel.
- **Fix RN:** envolver "Volver al inicio" en una vista botón: `backgroundColor:'#1c1c24', borderWidth:2, borderColor:'#2f2f3a', borderRadius:15, height:52, color:'#e8e8ee', fontWeight 800`.

**[M-6] Labels de los stats (RN) sin MAYÚSCULAS y con peso 600.**
- **Mockup:** `.a2-stat .sl` = `font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#7f7f8c` → "DURACION", "VOLUMEN", "SERIES" (v2 473).
- **RN:** StatTile label `fontFamily:FONT.uiSemibold` (600), `fontSize:11`, **sin `textTransform:'uppercase'`**, sin letter-spacing (`SessionCompleteV3.tsx:413`) → renderiza "Duración"/"Volumen" en minúsculas y más liviano.
- **Web:** `:353` — `text-[10px] font-extrabold uppercase tracking-widest text-on-dark-muted` → fiel (uppercase + 800), salvo color (ver M-10).
- **Fix RN:** `textTransform:'uppercase', letterSpacing:0.8, fontFamily:FONT.uiExtra (800), fontSize:10`.

**[M-7] Números de los stats (RN) coloreados con la marca; el mockup los pinta en blanco.**
- **Mockup:** `.a2-stat .sv` = blanco por defecto (`#f4f4f6`), solo `.a2-stat.pr .sv` es dorado (v2 472, 485). Duración/Volumen/Series van en blanco.
- **RN:** Duración `color: brand` (`:228`), Volumen `brand={brand}` (`:234`), fallback series `color: brand` (`:240`). Es decir, 2-3 stats en color de marca en vez de blanco → rompe el contraste "números blancos, PR dorado".
- **Web:** `text-on-dark` (blanco) en los tres (`:166,177,202`) — **fiel**.
- **Fix RN:** usar `s.text` (blanco) en Duración/Volumen/Series; reservar el color solo para el PR (dorado).

**[M-8] "Series" (RN) es una fila completa centrada, no un tile de la grilla como el mockup.**
- **Mockup:** Series es el **3.er tile** de la grilla 2×2 (`.a2-stat` con `sv "24 / 24"` + `sl "Series"`), mismo tratamiento que Duración/Volumen (v2 916).
- **RN:** la grilla superior solo tiene 2 tiles (Duración, Volumen); "Series" se saca a una fila full-width centrada `N / M series` con "series" en minúscula inline (`SessionCompleteV3.tsx:247-260`). Layout distinto al contrato.
- **Web:** Series es el 3.er `StatTile` de la grilla (`:201-203`) → **fiel** (la grilla queda 2 arriba + Series + celda vacía, y el PR va full-width debajo, equivalente al mockup).
- **Fix RN:** mover Series a un 3.er `StatTile` dentro de una grilla de 2 columnas con `sl "Series"` en uppercase.
- **[M-8b · MENOR-MAYOR]** RN StatTile bg = `s.surfaceSunken` `#15151c` (`:411`) vs mockup `.a2-stat` `#1a1a22` (`s.surface`). Debería usar `s.surface`.

**[M-9] Racha semanal: dots por día de semana (7, ~10px) en vez de dots por sesión planificada (mockup: 4 grandes de 16px con borde+glow).**
- **Mockup:** `.a2-streak` = label "Racha semanal" + count "3 de 4" + `.a2-sdots` con **4 dots** (uno por día con plan, M): `.a2-sd` = `16px`, `#26262f` + borde `2px #33333f`; `.a2-sd.on` = fill marca + borde `color-mix(marca 55% #000)` + `box-shadow 0 0 0 3px color-mix(marca 20%)` (v2 168-175, markup 977-983). Layout: label izquierda, count, dots empujados a la derecha (`margin-left:auto`).
- **Web:** `WeeklyStreakDots.tsx` — **7 dots Lun→Dom** de `2.5` (=10px) (`:46`), `done` = marca + glow 3px, `today` = anillo, `rest/todo` = `rgba(255,255,255,0.14)`. Layout `flex ... justify-center` → **todo centrado**, no repartido (label izq / dots der).
- **RN:** `WeekStreakDots.tsx` — 7 dots Lun→Dom de `10px` (`done`) / `6px` (`rest`) (`:71-85`), layout con `marginLeft:'auto'` en los dots (fiel al reparto), pero **envuelto en una card** (`surfaceSunken` + borde + radio, `:52-65`) que el mockup NO tiene (`.a2-streak` es solo una fila).
- **Nota:** es una evolución deliberada (E4.4 "7 puntos Lun→Dom" sin guilt-copy), pero **diverge del contrato aprobado**: dots más chicos, 7 en vez de M, y sin el borde/glow gordo. Si el CEO exige fidelidad 1:1, hay que decidir explícitamente si se acepta el cambio.
- **Fix (si se pide fidelidad):** subir el tamaño del dot `done`/`today` a ~16px con borde+glow; en web repartir con `justify-between`/`margin-left:auto` en los dots en vez de centrar; en RN quitar la card contenedora en la Final (dejar la fila suelta, como el Inicio compact).

**[M-10] CTA "Compartir logro" más pequeño que el mockup (web).**
- **Mockup:** `.a2-finalcta` = `height 60px`, `font 17px` (v2 508, 176-ref juicy).
- **Web:** `exec-v3-juicy h-[52px] ... text-[15px]` (`:309`). 52 vs 60 (−13%) y 15 vs 17px. CTA principal menos "gigante".
- **RN:** `JuicyButton height={52} fontSize={16}` (`:342-343`) — también algo más chico (52/16 vs 60/17).
- **Fix:** subir a `h-[60px]` / `text-[17px]` (web) y `height={60} fontSize={17}` (RN).

---

### MENOR

**[m-11] RN pierde el degradado radial del fondo (usa `#16161d` plano).** Mockup `.a2-screen` radial `#1c1c24→#16161d→#121218`; RN `SafeAreaView backgroundColor:'#16161d'` (`:195`). Color cálido correcto pero sin el degradado sutil. Fix: fondo con `expo-linear-gradient` o `react-native-svg` reproduciendo el radial. (Web ya tiene el degradado disponible en el root, ver B-1.)

**[m-12] Título 30px en ambos vs 28px del mockup; letter-spacing web `-0.03em` / RN `-0.8px` vs `-0.02em`.** Mockup `.a2-finaltitle` `28px/900/-.02em` (v2 466). Web `text-[30px] font-black tracking-[-0.03em]` (`:140`); RN `fontSize:30, letterSpacing:-0.8` (`:211`). 2px más grande y algo más apretado. Fix: 28px / `-0.02em`.

**[m-13] Copy del título (web) usa el nombre completo del plan; el mockup usa la etiqueta corta del día.** Mockup "¡Dia 3 completo!" (v2 910). Web `"¡{planTitle} completo!"` con `planTitle={plan.title}` (`SessionCompleteV3.tsx:142`, invocado en `WorkoutExecutionClient.tsx:2434`). RN usa `completionLabel` ("Día 3") (`:212`), fiel. El web no tiene prop `completionLabel`, así que muestra el título del plan (potencialmente largo). Fix web: pasar/usar una etiqueta de día corta.

**[m-14] Peso/apretado del número de stat (web) más suave que el mockup.** Mockup `.a2-stat .sv` `900/-.03em` (v2 472). Web `eva-metric` = `font-display, 800, -0.01em` (`globals.css:1351-1355`) a `text-[24px]` (`:166`). 800 vs 900 y `-0.01` vs `-0.03em`. Fix: clase/inline con `font-weight:900; letter-spacing:-0.03em` para los stats.

**[m-15] Leyenda del mapa muscular: "Menos → Más" (4 niveles) vs "Fuerte / Medio / Leve" (3) del mockup.** Mockup `.a2-legend` con `l3 Fuerte / l2 Medio / l1 Leve`, swatches en verde marca (v2 501-506, 970-974) y dos figuras chicas separadas (74×132) con captions "Frente"/"Espalda" **debajo** de cada una. Impl (`MuscleMapSvg.tsx`, compartido web+RN): un solo SVG anatómico con "FRENTE"/"ESPALDA" **dentro** del svg (`:180-181`) y leyenda de 4 swatches "Menos → Más" (`:186-201`). Es un mapa más rico (aceptable/mejor), pero la leyenda y el encuadre no son 1:1. Fix (si fidelidad estricta): leyenda a 3 niveles "Fuerte/Medio/Leve".

**[m-16] Falta la animación "breathe" continua de los números.** Mockup: `.a2-stat .sv { animation: breathe 3s }`, `.a2-stat.pr .medal { animation: pop 3.2s }`, `.a2-mm-strong { animation: glow 2.6s }` (v2 570-572). Impl sustituye el breathe por un **count-up ticker** (Ticker/NumberTicker) — decisión de la épica, aceptable — pero pierde el latido continuo posterior y el `pop` de la medalla / `glow` del músculo. Menor. Fix opcional: añadir `pop`/`glow` sutil a medalla y regiones fuertes.

**[m-17] Colores de texto atenuado ligeramente distintos.** Subtítulo mockup `#a8a8b3` (v2 467); web `text-on-dark-muted = #939DAB` (`globals.css:463`), RN `#8f8f9c`. Labels mockup `#7f7f8c`/`#8f8f9c`; web `#939DAB`, RN `#8f8f9c`. Diferencias sutiles de matiz (web tira a azul-gris frío). Fix: alinear a `#8f8f9c`/`#a8a8b3` cálidos.

**[m-18] RN centra el contenido del StatTile; el mockup lo alinea a la izquierda.** Mockup `.a2-stat { text-align:left }` (v2 470). RN StatTile `alignItems:'center'` (`:411`). Web `text-left` (`:350`), fiel. Fix RN: `alignItems:'flex-start'`.

**[m-19] RN añade una medalla-héroe (círculo 64px dorado con icono) sobre el título; no existe en el mockup.** RN `:208-210`. El mockup solo tiene confeti + título. Web no la añade (fiel). Menor/decorativo. Fix (si fidelidad): quitarla o dejarla como decisión explícita.

**[m-20] Elementos extra fuera del contrato (aceptables, paridad V2).** Web añade el nudge "Lo que viene / Sigue tu progreso en {programa}" (`:285-304`); RN añade la fila de check-in post-entreno (`:328-332`). No están en el mockup Final, pero son paridad con V2 y se auto-ocultan sin dato. Documentar como decisión, no bug.

---

## Cumple (fiel al contrato — no re-tocar)

- **Coreografía en dos fases** (clima celebratorio → stats en stagger) presente en web (`phase 'climate'→'stats'`, `:89,105`) y RN (`CLIMATE_MS`, `:168-181`). reduced-motion arranca directo en `stats` con valores directos en ambos.
- **Confeti sutil al cerrar, solo en sesión real** (el componente se monta al completar), más denso si hubo PRs: web `canvas-confetti` 120/60/60 con PR vs 80 sin (`:98-104`); RN `react-native-fast-confetti` 160 vs 90 (`:199`). El háptico "épico" en RN está gateado por el host (`cel.celebrate('sesion_completada')`), no se re-dispara aquí.
- **Números "tipo ticker" que cuentan** (easeOutCubic ~0.9s) en Duración/Volumen/Series: web `Ticker.tsx`, RN `NumberTicker.tsx`. Cumple el bullet "numeros grandes tipo ticker".
- **Resumen de sesión completo:** Duración, Volumen (adaptativo → Distancia si cardio → Series si tipado), Series `N / M` ("24 / 24"), reutilizando `useSessionSummary`/`summarizeSessionByKind` (una sola verdad de negocio compartida con V2). Fiel a los datos del mockup.
- **PR dorado con medalla, separado del resto** ("para que se sienta ganado"), tappable → share-card de récord (`PRShareCardModal` web / `ShareCardPreview variant="record"` RN). Estructura y copy "PR · {ejercicio}" fieles. (El color del oro falla solo en web, ver M-4.)
- **Mapa muscular frente/espalda con intensidades + leyenda** dentro de card "Trabajado hoy" (`MuscleMapSvg` compartido). El encuadre es más rico que el mockup pero cumple el bullet "dos siluetas frente/espalda con glow" (leyenda difiere, m-15).
- **Racha semanal** con label "Racha semanal" + count "N de M" + dots, y **auto-oculta honestamente** sin dato (`streak.planned>0` web / `streak.hasSignal` RN). Copy sin guilt. (El estilo de los dots diverge, M-9.)
- **CTA "Volver al inicio" siempre visible tras la fase 1** (skippable) y **"Compartir logro"** como acción destacada, en el orden del mockup (compartir juicy arriba, volver secundario abajo). (Estilos: web fiel salvo tokens; RN pierde chrome, M-5.)
- **Token `--exec-celebration: #ff6a3d`** correctamente definido (`globals.css:1421`) y coincide con `EVA_EXEC_CELEBRATION = '#FF6A3D'` (RN `exec-theme.ts:24`). La pantalla Final **no** lo usa (usa marca + oro), igual que el mockup, que tampoco tiene ember aquí — correcto.
- **Token `--exec-pr: #f5c451`** = `--gold` del mockup — bien definido y respetado por RN; solo el Final web lo ignora (M-4).
- **Superficies cálidas en RN** (`EXEC_SURFACE`: `#16161d/#1a1a22/#2a2a34/#15151c/#24242e`) calcadas del mockup — la piel RN es sustancialmente más fiel que la web.

---

## Resumen de acción para el equipo

1. **BLOCKER B-1 (web):** quitar `bg-[var(--ink-950)]` de `SessionCompleteV3.tsx:133` → dejar ver el degradado cálido del root. Es el "color de fondo distinto" del CEO.
2. **MAYORES web:** repintar cards/bordes/gradiente PR con literales cálidos del contrato en vez de `--ink-900`/`--border-inverse`/`white/[0.03]` (M-2); radio 16px (M-3); oro `#f5c451`/`--exec-pr` (M-4); CTA 60px/17px (M-10).
3. **MAYORES RN:** botón real para "Volver al inicio" (M-5); labels uppercase 800 (M-6); números de stat en blanco, no marca (M-7); "Series" como tile de grilla (M-8) con bg `#1a1a22` (M-8b); CTA 60/17 (M-10).
4. **Decisión de producto:** ¿se acepta la racha de 7 dots Lun→Dom (M-9) y el mapa anatómico con leyenda "Menos→Más" (m-15) como evolución, o se vuelve al patrón exacto del mockup? Requiere OK explícito del CEO antes de tocar.
