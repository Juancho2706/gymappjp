# Auditoría de fidelidad visual — Ejecutor V3 "Impulso" · Unidad 05 · CARDIO

**Fecha:** 2026-07-22 · **Auditor:** subagente QA fidelidad · **Alcance:** pantalla Cardio (continuo, distancia e intervalos) + fuente FC/sensor.

## Veredicto (2 líneas)
La identidad cardio (nombre + chip + mini-media), el anillo coloreado por zona y los colores FIJOS de zona/fase (Z1–Z5, trabajo ámbar / recupera verde) están BIEN portados y los tokens de zona nunca se re-tiñen. PERO falta el bloque que MÁS define la pantalla del mockup — la grilla de **chips de métricas** (BPM latiendo, distancia con mini-barra, ritmo, pisos, cadencia, intervalo) — en web y RN; además el **botón juicy "Pausar"** no existe en web (se reemplazó por el anillo-toggle), los anillos se ven **más delgados** que el mockup, y hay divergencias de color de chip (RN usa un naranja fuera de contrato; web deja el chip de intervalo en verde marca en vez de ámbar).

**Severidad máxima: BLOCKER.**

---

## Contrato visual (spec extraído de los mockups)

Fuentes: `concepto-a-v3-core.html` (sección `a3a` · cardio pro), `concepto-a-v31-cardio-wheel.html` (iteración final `a3c` · identidad), `concepto-a-v32-momentos.html` (sección `a3e` · intervalo en fase).

Orden vertical del mockup (cardio continuo, `a3c`/`a3a`):
1. Header: dots de progreso + "Ejercicio 6 de 8" + engranaje (compartido).
2. **Identidad**: nombre `Escaladora` (exname 26px/900) + chip `Cardio — Maquina` + **mini-media 84×84** animada (silueta escaladora).
3. **Anillo countdown**: `a3a` 236×236 (num 62px), `a3c` 196×196 (num 54px). Máscara `radial closest-side transparent 78% / #000 79%` ⇒ **banda del anillo ~20–26px de grosor**. `a3a` = conic marca; `a3c` = conic **z2 verde**. Track `#26262f`. `cardnum` 900/ls −.04em con **animación breathe 2.8s**. `cardsub` "Restante" 11px/800/ls .16em/uppercase/`#8f8f9c`.
4. **Chip de zona**: padding 10px 18px, radio 999, fondo `color-mix(z2 16% #16161d)`, borde 2px `color-mix(z2 40%)`, 16px/900; `zd` punto 12×12 z2 + halo `0 0 0 4px z2 25%` con **animación pulse 1.8s (encoge+desvanece)**; `zt` "Z2" color z2; `zk` "Manten el ritmo" `#cbd5c9`/700/13px.
5. **Grilla de chips de métricas** (2 col, gap 8): `a3a` = BPM (corazón z5 latiendo 1s) · Intervalo (barras) · distancia `1,24 / 2,00 km` + mini-barra · ritmo `5'52"/km`. `a3c` = BPM · Pisos (escalera) · Intervalo `3 de 6` (wide). Chip: fondo `#1a1a22`, borde 1.5px `#2a2a34`, radio 14, `cv` 15px/900, `cl` 9px/800/ls .08em/uppercase/`#7f7f8c`.
6. **Fila de fuente FC (source)**: fondo `#15151c`, borde 1.5px `#24242e`, radio 12, 11px/700/`#8f8f9c`. `a3a`: reloj + "Reloj conectado · **Apple Watch** o **Galaxy Watch**". `a3c`: reloj-clock + "Sensor conectado — **cinta o reloj** (BLE)".
7. **Botón juicy "Pausar"**: full-width, alto 58, radio 16, 16px/900, borde 2px `color-mix(marca 55% #000)`, `box-shadow 0 5px 0 color-mix(marca 55% #000)`, ícono dos barras `#072100`, **animación breathe 2.6s**.

Intervalo en fase (`a3e`): título `Bici estática` 21px/900 + **chip ámbar** `Cardio · Intervalos` (z4). Anillo 228×228 conic **z4** (track `#2a2431`). `phaselbl` "Trabajo" 15px/900/ls .2em/uppercase z4. `phasenum` 60px/900. `phasesub` "Restante en fase" 10px/800/ls .14em. **Pastilla "Luego: Recupera 0:45"** (fondo `color-mix(z2 12%)`, borde 1.5px `color-mix(z2 30%)`, punto `dt` z2). Barra segmentada (8 seg, alto 10, gap 5, `cur` con **halo `0 0 0 3px z4 22%`**) + "Intervalo **3 de 8**". Chips: BPM z4 · Cadencia RPM.

Zonas FIJAS (nunca re-teñidas por marca): `--z1 #38bdf8 · --z2 #4ade80 · --z3 #facc15 · --z4 #fb923c · --z5 #f87171`.

---

## Deltas

Leyenda: **[SEV]** descripción — *mockup* — **web** `file:line` — **RN** `file:line` — *fix*.

### BLOCKER

**D1 — [BLOCKER] Falta toda la grilla de "chips de métricas pro" (BPM / distancia / ritmo / pisos / cadencia / intervalo).**
Es el bloque de mayor densidad visual de la pantalla y hace que el contrato se vea "lleno"; su ausencia deja la pantalla vacía respecto al mockup (justo la queja del CEO).
- *mockup:* `a3a` líneas 967–987 (4 chips: BPM 142 · Intervalo · `1,24/2,00 km`+barra · `5'52"/km`); `a3c` 439–452 (3 chips: BPM · Pisos · Intervalo wide); `a3e` 647–656 (BPM·Zona4 · Cadencia RPM). CSS `a3a` `.a3a-cchips/.a3a-cchip` líneas 513–529.
- **web:** `CardioStepV3.tsx` — `ContinuousFace` (198–279) NO renderiza ningún chip de métrica; `IntervalFace` (281–369) tampoco. La única métrica es el chip de BPM en vivo (`exec-v3-hrlive`, 124–140) y SOLO si hay sensor BLE conectado (Chrome/Edge Android). En iOS/desktop/sin sensor la grilla NO existe.
- **RN:** `CardioScreenV3.tsx` — mismo caso: heros (315–481) sin grilla; solo el chip `chip-bpm-vivo` (223–248) cuando hay stream BLE nativo (oculto en Expo Go).
- *causa raíz honesta:* distancia/ritmo/pisos/cadencia salen de la máquina de cardio y la app no las lee; BPM sin sensor sería "inventado". El equipo eligió NO mostrar datos falsos (bullet del propio mockup: "nada de números inventados"). *Fix propuesto:* como el mockup es el contrato aprobado, decidir con el CEO una de dos vías: (a) **chips de captura manual** con el mismo look (`.a3a-cchip`: fondo `#1a1a22`, borde 1.5px `#2a2a34`, radio 14, `cv` 15/900, `cl` 9/800/uppercase) que el alumno rellena o que reflejan lo prescrito (p.ej. `Intervalo 3 de 6`, distancia objetivo, ritmo objetivo) — así la pantalla recupera densidad sin inventar sensores; o (b) aceptar formalmente el recorte y actualizar el mockup-contrato para que QA no lo relea como regresión. Al menos el chip **"Intervalo N de M"** y **distancia objetivo** son derivables del plan hoy y deberían mostrarse siempre.

### MAYOR

**D2 — [MAYOR] Web: no existe el botón juicy "Pausar"; el control se movió a "toca el anillo".**
- *mockup:* `a3a` 994 / `a3c` 459 — `.a3a-juicy.a3a-pause` full-width 58px, box-shadow `0 5px 0`, breathe 2.6s, ícono dos barras.
- **web:** `CardioStepV3.tsx:244–275` — el anillo ES el botón toggle; el play/pausa es un ícono chico dentro del anillo (`exec-v3-hold-icon`, `globals.css:3310`). No hay botón juicy inferior.
- **RN:** CUMPLE — `CardioScreenV3.tsx:483–508` `PauseButton` con `JuicyButton` alto 56 (`Pausar`/`Reanudar`).
- *fix:* en web, añadir el botón juicy `Pausar/Reanudar` (reusar patrón `.exec-v3-juicy`, alto 58, breathe) bajo el anillo/zona, como RN; el toggle-en-anillo puede quedar como atajo pero el botón es la identidad.

**D3 — [MAYOR] Anillo del hero demasiado delgado vs el anillo "chunky" del mockup.**
El grosor del anillo es rasgo de identidad ("legible a un metro").
- *mockup:* banda ~20px (`a3c` 196px, máscara 78/79%) y ~26px (`a3a` 236px).
- **web:** `globals.css:3252/3259` — `strokeWidth 12` sobre viewBox 208 / contenedor 214px ⇒ ~12px efectivos.
- **RN:** `CardioScreenV3.tsx:335` countdown `strokeWidth 13` (size 196) · `:381` interval `strokeWidth 15` (size 224); `ProgressRing.tsx` respeta el `strokeWidth`.
- *fix:* subir grosor a ~18–20px (web `strokeWidth 18`; RN `strokeWidth 18/20`) para igualar la proporción del mockup.

**D4 — [MAYOR] RN: chip de identidad y mini-media usan un naranja hardcodeado `#FF6A3D` fuera del contrato.**
- *mockup:* `a3c` chip continuo = **marca** (`.a3c-chip` color-mix marca, línea 69–75); `a3e` chip intervalo = **ámbar z4** (`.a3e-chip.amber`, 81–85, `#fb923c`). `#FF6A3D` no es ni marca ni token de zona.
- **RN:** `CardioScreenV3.tsx:173–178` chip fondo/borde/texto `#FF6A3D`; `:181` `TypedMediaV3 ... accent="#FF6A3D"`. Se aplica igual a continuo e intervalo.
- **web:** chip continuo = marca (correcto, ver D5 para intervalo).
- *fix:* RN debe usar `exec.accent` (marca) para el chip continuo y `#fb923c` (z4) para el chip de intervalo; eliminar el `#FF6A3D` inventado.

**D5 — [MAYOR] Web: en intervalos el chip "Cardio · Intervalos" queda en verde-marca, el mockup lo pide ámbar (z4).**
- *mockup:* `a3e:621` `<span class="a3e-chip amber">Cardio · Intervalos</span>` (fondo/borde/texto z4).
- **web:** `CardioStepV3.tsx:97–99` siempre `exec-v3-chip` (marca; `globals.css:1499–1510`), sin variante ámbar.
- **RN:** naranja `#FF6A3D` (ver D4) — tampoco es el z4 del contrato.
- *fix:* cuando `isInterval`, aplicar variante ámbar del chip (color-mix `--zone-z4`).

**D6 — [MAYOR] RN: "Luego: {fase} {tiempo}" es texto plano; falta la PASTILLA + punto de color.**
- *mockup:* `a3e:633–635` `.a3e-next-phase` pastilla (fondo `color-mix(z2 12%)`, borde 1.5px `color-mix(z2 30%)`, radio 999) con punto `dt` z2.
- **web:** CUMPLE — `CardioStepV3.tsx:337–343` + `.exec-v3-nextphase` (`globals.css:3793–3813`) con `--np` por fase y punto.
- **RN:** `CardioScreenV3.tsx:415–420` solo `<Text>` "Luego: …" sin contenedor pastilla ni punto.
- *fix:* envolver en una View-pastilla (fondo/borde `color-mix` del color de la próxima fase) con punto de 9px, igual que web.

**D7 — [MAYOR] RN: el chip de zona no tiene cue textual de respaldo ("Mantén el ritmo") cuando no hay perfil FC.**
- *mockup:* `a3a/a3c` `zk` siempre presente ("Manten el ritmo").
- **web:** CUMPLE — `CardioStepV3.tsx:189–193` muestra rango bpm si existe, si no `ZONE_CUE[zone]` ("Mantén el ritmo", 43–49).
- **RN:** `CardioScreenV3.tsx:206–210` SOLO renderiza texto si `bpmRange` existe; sin perfil FC el chip queda "Z2" pelado, sin cue.
- *fix:* añadir en RN el mismo mapa `ZONE_CUE` como fallback del `zk`.

**D8 — [MAYOR] Fila de fuente/sensor: ambas plataformas divergen del copy del mockup ("Reloj conectado · Apple Watch o Galaxy Watch").**
Misma raíz que D1: el mockup pinta un estado idealizado "sensor conectado + métricas"; la app entrega "FC manual" por defecto (honesto). Se marca por si el CEO quiere el encuadre del mockup.
- *mockup:* `a3a:989–992` "Reloj conectado · **Apple Watch** o **Galaxy Watch**" (fila boxed `.a3a-source`); `a3c:454–457` "Sensor conectado — **cinta o reloj** (BLE)".
- **web:** `CardioStepV3.tsx:142–152` "FC **manual** — compárala con tu reloj o app y regístrala abajo." + botón "Conectar sensor" (solo si Web Bluetooth).
- **RN:** `CardioScreenV3.tsx:212–214` sub-texto inline "Compara con tu reloj o pulsómetro" (Watch) — ni siquiera es la fila boxed del mockup.
- *fix:* decisión de producto. Mínimo, unificar RN a una fila boxed estilo `.a3a-source` (fondo `#15151c`, borde `#24242e`, radio 12) para consistencia con web y con el look del contrato; y consensuar el copy honesto vs el del mockup.

### MENOR

**D9 — [MENOR] Tamaño del anillo web unificado a 214px para ambos modos; el mockup usa 196/236 (continuo) y 228 (intervalo).** — web `globals.css:3261` (214 fijo). RN más fiel: 196 countdown / 224 interval (`CardioScreenV3.tsx:335,381`). *Fix:* web 196 continuo, ~224 intervalo.

**D10 — [MENOR] Número del hero 52px (web+RN) vs 54 (`a3c`)/62 (`a3a`) continuo y 56 (RN) vs 60 (`a3e`) intervalo.** — web `globals.css:3292` (52); RN `CardioScreenV3.tsx:337` (52) / `:406` (56). *Fix:* subir a 54–60.

**D11 — [MENOR] Web: color de track del anillo `#262c31`, el mockup usa `#26262f`.** — web `globals.css:3273`. RN CUMPLE (`#26262f`, `CardioScreenV3.tsx:335/384`). *Fix:* web `stroke #26262f`.

**D12 — [MENOR] Web: `exec-v3-holdlbl` letter-spacing .14em; el mockup `cardsub` usa .16em.** — web `globals.css:3305`. *Fix:* `.16em`.

**D13 — [MENOR] Web: chip de zona más chico que el mockup (padding 9/16, font 15) vs mockup (10/18, 16).** — web `globals.css:3769,3773`. RN font 16 (fiel) pero padding 9/16 (`CardioScreenV3.tsx:203`). *Fix:* padding 10/18 y font 16.

**D14 — [MENOR] Falta la animación "breathe" del número del hero de cardio.** — *mockup:* `.a3c-cardnum/.a3a-cardnum` breathe 2.8s (core `:336`/`:577`). **web:** `exec-v3-holdnum` sin animación (`globals.css:3291`; el breathe 2.6s existe pero solo para `exec-v3-bignum` del roller/rest, `:2775`). **RN:** número sin `MotiView` breathe. *Fix:* aplicar breathe suave (scale 1↔1.02) al número del anillo cardio en ambas.

**D15 — [MENOR] Punto de zona (`zonedot`): animación distinta a la del mockup y keyframe duplicado en web.** — *mockup:* `pulse` 1.8s (encoge a .7 + opacidad .4). **web:** usa `exec-v3-beat` (crece), y hay **dos** `@keyframes exec-v3-beat` (`globals.css:1449` scale 1.3+asentamiento y `:3603` scale 1.14) — la segunda pisa a la primera para TODOS los usos (dots de progreso incluidos). **RN:** el punto de zona NO tiene pulse ni halo (`CardioScreenV3.tsx:204`). *Fix:* web — renombrar/unificar el keyframe duplicado y dar al zonedot un `pulse` propio (encoge+desvanece); RN — animar el punto y añadir el halo `0 0 0 4px` (via shadow/box).

**D16 — [MENOR] RN: el segmento de intervalo ACTUAL no lleva el halo (`box-shadow 0 0 0 3px z4 22%`); se distingue solo por opacidad.** — *mockup:* `.a3e-seg.cur` con halo. **web:** CUMPLE (`.exec-v3-seg.is-cur`, `globals.css:3831–3834`). **RN:** `CardioScreenV3.tsx:433` solo `opacity`. *Fix:* añadir shadow/anillo al segmento actual en RN.

**D17 — [MENOR] Web: el corazón del chip de BPM en vivo no late (mockup: corazón beat 1s).** — **web:** `exec-v3-hrlive-pulse` sin animación (`globals.css:3521–3526`). **RN:** CUMPLE — el punto late con `MotiView` (`CardioScreenV3.tsx:232–237`). *Fix:* animar el pulso del corazón en web (beat 1s).

**D18 — [MENOR] Copy del chip de identidad: separador/detalle distinto al mockup `a3c` "Cardio — Maquina".** — implementaciones usan "Cardio · {Intervalos|Distancia|Continuo}" (web `CardioStepV3.tsx:98`; RN `cardioDetailLabel`, `typed-screen-model.ts:99–109`). Coincide con `a3a/a3e` (middot) pero no con el em-dash + "Maquina" de `a3c`. Cosmético; alinear el vocabulario si se quiere el naming del contrato.

---

## Cumple (no re-tocar)

- **Zonas FIJAS correctas y sin re-teñir por marca.** web `globals.css:438–442` (`--zone-z1..z5` = `#38bdf8/#4ade80/#facc15/#fb923c/#f87171`); RN `typed-screen-model.ts:27–33` `ZONE_HEX` idéntico + comentario "el color ES la zona". Anillo coloreado por zona (`zoneRingColor`/`--ring-c`), fiel a la iteración `a3c` (anillo verde z2).
- **Colores FIJOS de fase de intervalo:** trabajo ámbar `#fb923c` (=z4), recupera verde `#4ade80` (=z2), warmup/cooldown neutro. web `CardioStepV3.tsx:52–56`; RN `PHASE_COLORS` `typed-screen-model.ts:61–66`.
- **Fila de identidad** (nombre 26/900 + chip + mini-media 84×84 borde 2px `#2f2f3a`, fondo `linear-gradient(160deg,#202029,#17171f)`): web `.exec-v3-cardio-id/-mini` `globals.css:3439–3457`; RN `CardioScreenV3.tsx:168–183`. Coincide con `.a3c-idrow/.a3c-minimedia`.
- **Anillo de fase de intervalo:** label uppercase 15/900/ls .2em en color de fase + número grande + "Restante en fase". web `CardioStepV3.tsx:323–331` + `.exec-v3-phaselbl` (`globals.css:3317`); RN `CardioScreenV3.tsx:398–410`.
- **Barra segmentada + "Intervalo N de M"** en z4. web `CardioStepV3.tsx:345–357` + `globals.css:3814–3843`; RN `CardioScreenV3.tsx:422–441`.
- **Pastilla "Luego: {fase} {tiempo}"** con color por fase — solo web (ver D6 para RN). `globals.css:3793–3813`.
- **Chip de zona** con estructura correcta (punto + "Z{n}" en color de zona + rango bpm cuando el perfil viaja). web `ZoneChip` `CardioStepV3.tsx:181–196`; RN `CardioScreenV3.tsx:201–211`.
- **Header de progreso (dots + "Ejercicio N de M" + engranaje)**: provisto por `ExecHeaderV3` compartido (integrado en `WorkoutExecutionClient.tsx:2134`), no duplicado en la pantalla cardio. Correcto.
- **FC honesta (manual / BLE opcional Ola 6), sin BPM inventado** — coincide con el bullet del mockup "nada de números inventados"; el auto-prellenado de `actual_avg_hr` es editable y no pisa ediciones.
- **RN: botón juicy "Pausar" presente** (`JuicyButton`, alto 56) y **track `#26262f` correcto** — más fiel que web en estos dos puntos.
- **Track del anillo como `<circle>` + arco que drena** (traducción válida del conic-gradient enmascarado) con transición lineal; se detiene bajo reduced-motion en ambas.

---

## Resumen de acción sugerida (orden de impacto)
1. **D1** (BLOCKER): decidir grilla de chips de métricas — reintroducir al menos "Intervalo N de M" y distancia/ritmo objetivo (derivables hoy) con el look `.a3a-cchip`, o actualizar el contrato.
2. **D2**: web — reponer botón juicy "Pausar".
3. **D3**: engrosar anillos (~18–20px) en ambas.
4. **D4/D5**: color de chip — RN quitar `#FF6A3D` (usar marca/ z4); web dar variante ámbar al chip de intervalo.
5. **D6/D7**: RN — pastilla "Luego:" + cue de zona de respaldo.
6. Pulir MENORES (tamaños de anillo/número, track web `#26262f`, breathe del número, keyframe duplicado, halos de punto/segmento, beat del corazón en vivo).
