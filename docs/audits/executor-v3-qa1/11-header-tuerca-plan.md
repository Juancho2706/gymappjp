# QA1 Ejecutor V3 · Unidad 11 — Header + tuerca de ajustes + vista Plan

**Auditor:** fidelidad visual (mockup vs implementación web/RN)
**Componentes:** `ExecHeaderV3`, `ExecSettingsSheet`, `ExecListMapV3` (web) · `ExecHeaderV3`, `ExecSettingsSheet`, `ExerciseListV3` (RN)
**Contrato visual:** `concepto-a-v3-core.html` (header Fuerza/Cardio + peek "Plan completo" en descanso), `concepto-a-v3-tipos.html` (sheet Ajustes de la tuerca).

## Veredicto (2 líneas)

El **header legacy SÍ queda oculto** (`display:none`) en V3 y nunca aparece — correcto. Pero el **header web usa botones "glassy" (`bg-white/[0.06]` + `border-white/10`) en vez del chip sólido del mockup (`#1a1a22` + `1.5px #2f2f3a`)** — este es el "resto del ejecutor viejo" que ve el CEO (RN sí lo respeta), y la **vista Plan** reemplaza el vocabulario del mockup (icono estado + palabra de estado) por otro (número/dots/pill/flecha) con **tres títulos distintos** entre mockup/web/RN. Hay además un delta estructural: mockup = header de **1 fila**, implementación = **2 filas** con back + "Ver todo" + meta añadidos.

Severidad máxima: **MAYOR** (no hay BLOCKER: fondo, gradiente, dots, toggles y sheet de ajustes son fieles; el legacy no se filtra).

---

## Deltas

### HEADER (ExecHeaderV3)

**[MAYOR] Botones del header web son translúcidos "glassy", no el chip sólido del mockup**
- **Mockup:** `.a3a-gear` → `36×36`, `border-radius:11px`, `background:#1a1a22`, `border:1.5px solid #2f2f3a`, `color:#b7b7c2`, `svg 19px` (core L96-101).
- **Web:** `ExecHeaderV3.tsx:55` (salir), `:82` (Ver todo), `:93` (settings) → `border border-white/10 bg-white/[0.06] text-on-dark-muted`. Es decir borde `1px` translúcido y relleno blanco al 6% sobre el gradiente → material "vidrio" del ejecutor viejo, no el chip cálido sólido. Radio `rounded-[11px]` sí correcto.
- **RN:** FIEL — `ExecHeaderV3.tsx:63-64` y `:74-75` → `backgroundColor: s.surface` (`#1a1a22`) + `borderWidth:1.5, borderColor: s.borderStrong` (`#2f2f3a`). RN es la referencia correcta.
- **Fix (web):** cambiar los 3 botones a `bg-[#1a1a22] border-[1.5px] border-[#2f2f3a] text-[#b7b7c2]` (o tokens equivalentes), no `white/*`. Igualar a RN.

**[MAYOR] Estructura del header: 1 fila (mockup) vs 2 filas + chrome extra (implementación)**
- **Mockup:** UNA fila `.a3a-progress` = `dots (flex:1)` + `"Ejercicio 3 de 8"` + `gear`. Sin botón atrás, sin botón "Ver todo", sin cronómetro/series/volumen en el header (core L756-770).
- **Web:** `ExecHeaderV3.tsx:50-97` fila 1 = `[atrás] [dots] [Ver todo] [gear]`; `:99-117` fila 2 = `EJERCICIO N de M` + `series · volumen · elapsed`. Se añaden botón atrás (`:51`), pill "Ver todo" (`:77`) y toda una meta-fila no presentes en el contrato.
- **RN:** `ExecHeaderV3.tsx:49-90` también 2 filas (fila1 dots+List+gear; fila2 count+elapsed). Sin botón atrás; añade botón List (icono) y elapsed. Menos chrome que web pero igual 2 filas.
- **Fix:** aceptar 2 filas como necesidad funcional PERO alinear composición: quitar el botón "Ver todo"/List del header si se puede (el mockup navega el plan desde el peek de descanso), y en web NO uppercasear ni meter series/volumen en el header si el CEO quiere el look de 1 sola métrica; como mínimo documentar la desviación.

**[MAYOR] "EJERCICIO N" va en MAYÚSCULAS y `font-mono 11px` en web (mockup: caja normal, 12px, sans peso 800)**
- **Mockup:** `.a3a-count` → `font-size:12px; font-weight:800; color:#8f8f9c`, texto "Ejercicio 3 de 8" en caja normal, system-ui (core L112).
- **Web:** `ExecHeaderV3.tsx:99-103` → `font-mono text-[11px]` + span `font-bold uppercase tracking-wide text-on-dark` → lo pone en MAYÚSCULAS, monoespaciado, 11px y "Ejercicio N" en color claro (no muted).
- **RN:** FIEL en caso/tamaño — `ExecHeaderV3.tsx:85-87` → `FONT.uiExtra, fontSize:12`, caja normal (no uppercase); "Ejercicio N" en `s.text`, "de M" en `s.textMuted`.
- **Fix (web):** quitar `uppercase` y `font-mono` del label; usar 12px sans peso 800. El elapsed sí puede ir tabular/mono.

**[MENOR] Gap de los dots y tamaño del icono difieren en web**
- **Mockup:** `.a3a-dots { gap:7px }` (core L105); gear `svg 19px`, `stroke-width:1.8`.
- **Web:** contenedor dots `gap-1.5` = 6px (`ExecHeaderV3.tsx:61`); iconos lucide `h-[18px] w-[18px]` (`:57,:84,:95`) con stroke por defecto (~2).
- **RN:** FIEL — dots `gap:7` (`ExecHeaderV3.tsx:50`), iconos `size={19}` (`:68,:79`).
- **Fix (web):** `gap-[7px]` en el contenedor de dots; iconos a `19px`.

**[MENOR] Header dibuja barra propia (relleno + divisor + blur); el mockup no**
- **Mockup:** el header fluye sobre el gradiente del screen, sin relleno propio ni borde inferior.
- **Web:** `globals.css:1427-1430` `.exec-v3-header { background: color-mix(#16161d 92%, transparent); border-bottom:1px solid rgba(255,255,255,.08) }` + `backdrop-blur` (`ExecHeaderV3.tsx:48`).
- **RN:** `ExecHeaderV3.tsx:46` `borderBottomWidth:1, borderBottomColor: s.borderSubtle (#24242e)` + `backgroundColor: s.appBg (#16161d)`.
- Justificable por ser sticky; nota: el divisor inferior no está en el contrato. Bajar opacidad o quitar borde si el CEO lo nota.

**[CUMPLE] Dots de progreso (forma, colores, latido)**
- Mockup `.a3a-dot` `flex:1; height:9px; radius:999px; #2a2a34`; `.done` = `color-mix(brand 60%, #16161d)`; `.now` = brand + `box-shadow 0 0 0 3px color-mix(brand 25%)`; `@keyframes beat 1.4s: 30%→scale(1.3)` (core L106-111, L611).
- Web `globals.css:1432-1452` reproduce EXACTO (incluye `exec-v3-beat` idéntico). RN `ExecHeaderV3.tsx:100-128` equivalente (glow que late 900ms, gateado por reduce-motion). ✔

---

### TUERCA / SHEET DE AJUSTES (ExecSettingsSheet)

**[MAYOR] Web añade fila "Cronómetro automático" que NO existe en el mockup (y RN no la tiene)**
- **Mockup:** el sheet tiene 7 filas exactas: Sonido del cronómetro / Tono / Volumen / Vibración / Sonidos de celebración / Mantener pantalla encendida / Mostrar RPE/RIR (tipos L950-1004).
- **Web:** `ExecSettingsSheet.tsx:133-139` inserta "Cronómetro automático" como PRIMERA fila (8 filas totales).
- **RN:** FIEL a las 7 filas — `ExecSettingsSheet.tsx:127-267` sin "Cronómetro automático".
- Nota: en web reemplaza el toggle de auto-timer de la tuerca legacy (funcional), pero rompe paridad con RN y con el contrato. **Fix:** decidir CEO — o se añade también a RN, o se saca de web (dejarlo en el otro panel). Debe quedar consistente.

**[MAYOR] Tono: web es un `<select>` nativo sin opción "Del sistema"; el mockup muestra pill "Del sistema" + caret**
- **Mockup:** valor `Del sistema` en pill `.a3b-selval` (`#24242e`, `1.5px #3a3a45`, radio 10, `13px/800`) + caret triangular; subtítulo "o elige: Campana · Beep · Digital" (tipos L511-516, L962-964).
- **Web:** `ExecSettingsSheet.tsx:156-168` usa `<select class="exec-v3-selval">` con Digital/Campana/Clásico/Boxeo — **sin "Del sistema"**; subtítulo `:154` "Campana · Digital · Clásico · Boxeo". Flecha nativa del SO en vez del caret propio.
- **RN:** FIEL a la intención — `ExecSettingsSheet.tsx:148-188` pill `currentToneLabel` ("Del sistema" en Android) + `ChevronDown`, y chips que incluyen "Del sistema" (`:178-186`).
- **Fix (web):** ofrecer "Del sistema" (al menos Android) y alinear subtítulo; idealmente pill custom con caret en vez de `<select>` desnudo.

**[MAYOR] Volumen: web usa `<input type=range>` nativo — se pierde el knob "juicy" del mockup**
- **Mockup:** track `8px #2a2a34`, fill 70% brand, knob `22px` blanco con `border:4px brand` + `box-shadow 0 2px 6px` (tipos L521-527).
- **Web:** `ExecSettingsSheet.tsx:177-187` + `globals.css:3222-3225` = `<input type=range>` con solo `accent-color: brand`; el thumb es el del navegador (genérico, no el knob blanco+aro).
- **RN:** FIEL — `ExecSettingsSheet.tsx:454-462` track `8px`, fill brand, thumb `20px` `accentText`(blanco) `border:2px accent`. (knob 20 vs 22, aro 2 vs 4 — MENOR).
- **Fix (web):** estilar el thumb (`::-webkit-slider-thumb`/`::-moz-range-thumb`) como el knob del mockup (blanco, aro brand, sombra) y el track a `8px #2a2a34` con fill.

**[MENOR] Layout del slider de Volumen en RN difiere del mockup**
- **Mockup / Web:** fila slider a lo ancho (`.a3b-setrow.slider` / `exec-v3-setrow.is-slider`), con "Volumen" + `%` arriba y barra full-width abajo (tipos L518-522; `globals.css:3139-3143`).
- **RN:** `ExecSettingsSheet.tsx:191-202` mete el slider en la columna derecha (`width:150`) con "Volumen" como nombre de fila a la izquierda → barra corta, no full-width.
- **Fix (RN):** usar layout de fila-slider full-width con `%` arriba-derecha, como web/mockup.

**[MENOR] Toggle RN: color de reposo distinto al mockup**
- **Mockup:** off `background:#2a2a34`, knob `#c9c9d2`; on brand + knob `#072100` (tipos L501-509).
- **Web:** FIEL EXACTO — `globals.css:3162-3189` (`#2a2a34`, knob `#c9c9d2`, on brand, knob `#072100`).
- **RN:** `ExecSettingsSheet.tsx:501,511` off `backgroundColor: s.surfaceRaised` = `#1c1c24` (mockup `#2a2a34`) y knob `s.textMuted` = `#8f8f9c` (mockup `#c9c9d2`). Se ve más apagado.
- **Fix (RN):** off bg `#2a2a34` y knob `#c9c9d2`.

**[MENOR] Padding de fila y caret**
- Mockup `.a3b-setrow { padding:11px 2px }`; web `globals.css:3133` `padding:12px 2px` (+1px). Trivial.
- Mockup usa caret triangular propio; web/select usa flecha nativa. Ver delta Tono.

**[MENOR] RN usa el chrome del `Sheet` del DS (handle/título/X), no el sheet custom del mockup**
- **Web:** FIEL — `exec-v3-handle` (40×5 #45454f), `exec-v3-settings-t` (16/900), `exec-v3-settings-x` (30 círculo #26262f border 1.5 #3a3a45) reproducen `a3b-handle/.t/.a3b-x` (mockup tipos L481-491; `globals.css:3031-3124`).
- **RN:** `ExecSettingsSheet.tsx:116-124` delega en `<Sheet title=... snapPoints={['80%']}>`; el handle/título/cierre salen del primitivo DS, no del custom. Aceptable si el DS coincide, pero no garantiza el X de 30px círculo ni el handle #45454f exactos. Verificar en device.

**[CUMPLE] Contenedor del sheet (fondo/borde/radio/sombra), toggles web, filas nombre/subtítulo**
- `exec-v3-settings`: `#1a1a22`, `border-top:2px #33333f`, `radius 24 24 0 0`, `padding 10 16 …`, `shadow 0 -22px 46px -18px` = mockup `.a3b-sheet` exacto (`globals.css:3075-3090`; mockup L474-479). Web añade variante desktop centrada (correcto).
- `exec-v3-setname` 14/800 #eaeaf0 ls -.01em y `exec-v3-setsub` 11.5/600 #8f8f9c lh1.35 = mockup exacto. ✔
- Copys de filas fieles: "Sonido del cronómetro / Suena al terminar el descanso", "Sonidos de celebración / El resto de la app permanece en silencio", "Mostrar RPE/RIR en fuerza". ✔

---

### VISTA PLAN (ExecListMapV3 / ExerciseListV3)

**Contexto:** el peek "Plan completo" del descanso (mockup `.a3a-sheet` + `.a3a-srow`) se implementa en web reutilizando `ExecListMapV3` dentro de `RestInterstitialV3.tsx:376`, y también como página "Ver todo". El encabezado del peek (`exec-v3-restsheet-t` "Plan completo" 14/900 + count) SÍ es fiel al mockup; el problema son las FILAS y el título interno del mapa.

**[MAYOR] Título de la vista Plan: tres textos distintos, ninguno = "Plan completo" del mockup**
- **Mockup:** cabecera `"Plan completo"` `14px/900` + count `"2 / 8"` `11px/800 #8f8f9c` (core L471-472, L907-909).
- **Web:** `ExecListMapV3.tsx:35` imprime `"Ver todo"` con `globals.css:2309-2315` `11px/800 uppercase ls .1em`, **sin count**. Peor: dentro del peek "Plan completo" (RestInterstitialV3:368) queda un DOBLE encabezado "Plan completo" seguido de "Ver todo".
- **RN:** `ExerciseListV3.tsx:67-68` título `"Todos los ejercicios"` `20px displayBlack`.
- **Fix:** en el peek, `ExecListMapV3` NO debe imprimir su propio "Ver todo" (pasar prop para ocultarlo o mover el título afuera). Unificar copy a "Plan completo" y unificar RN.

**[MAYOR] Vocabulario de fila: mockup usa icono-estado + palabra de estado; implementación usa número/dots/pill/flecha**
- **Mockup `.a3a-srow`:** `sstate` icono `20px` (done=brand+check, now=aro brand+punto, todo=caja gris) + `snm` nombre `13/800 #d4d4dc` + `ssub` palabra ("✓ 4/4" / "ahora" / "pendiente") con color por estado; fila `is-now` con fondo `brand 10%` radio 12 (core L473-488, L911-925).
- **Web `ExecListMapV3`:** fila = **número** `exec-v3-map-idx` (`:50`) + nombre + **dots por serie** + count "2/4" (`:53-63`) + **pill "AHORA"** (`:65`) + **icono flecha** `ArrowLeftRight` (`:66`). No hay icono done/now/todo ni la palabra de estado; fondo de fila propio `#1b1b23` (`globals.css:2334`).
- **RN `ExerciseListV3`:** fila = **check-o-fracción** (`:121-131`, no el icono de 3 estados) + nombre `15px` + **dots por serie** + **chip de TIPO** (`:139-151`, que web no tiene) + **AHORA / chevron** (`:156-164`).
- Resultado: web y RN divergen entre sí (número vs check/fracción; web sin chip de tipo, RN con chip) y ambos del mockup.
- **Fix:** decidir contrato único. Si el peek debe replicar el mockup: icono estado (check/punto/gris) + nombre + palabra de estado, sin flecha ni pill; el chip de tipo/dots por serie es de la vista "Ver todo" enriquecida — mantener las dos vistas visualmente separadas y consistentes entre plataformas.

**[MENOR] Fila `is-now`: mockup solo tiñe fondo (sin borde); implementación añade borde de marca**
- Mockup `.a3a-srow.is-now` = fondo `brand 10%`, radio 12, sin borde (core L483).
- Web `globals.css:2341-2344` `is-now` = `border-color brand 55%` + `background brand 12%`. RN `ExerciseListV3.tsx:109-112` `borderWidth:2` accent-60 + bg accent-10. Añaden borde no presente en el mockup. MENOR.

**[MENOR] Contenedor del mapa web vs peek**
- El mapa web (`globals.css:2303-2307`) es una card `radius 16 border 1.5 #26262f bg #131318`; en el peek se envuelve en `exec-v3-restsheet`. La versión página "Ver todo" no es un bottom-sheet — correcto para esa vista. Solo cuidar el doble título (ver arriba).

**[CUMPLE] Encabezado del peek "Plan completo" en descanso (web)**
- `RestInterstitialV3.tsx:366-372` + `globals.css:3038-3061`: handle `40×5 #45454f`, título "Plan completo" `14/900 #f4f4f7`, count `doneCount / total` `11/800 #8f8f9c` = mockup `.a3a-sheethd .t/.c` exacto. ✔ (el defecto está en las filas y el título interno del mapa, no en este encabezado.)

---

## Confirmaciones clave para el CEO

- **El header legacy NO se filtra en V3.** `WorkoutExecutionClient.tsx:2176-2183`: el header sticky viejo se renderiza con `className cn(..., execV3Active && 'hidden')` → `display:none` cuando V3 está activo. No se borra (por diseño), pero jamás se ve. ✔
- **Fondo del ejecutor = gradiente del mockup.** `globals.css:1418-1426` `[data-exec-v3] { background: radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%) fixed }` = `.a3a-screen` del mockup (core L59). RN `EXEC_SURFACE` (`exec-theme.ts:65-78`) calibra los mismos literales (`#16161d/#121218/#1a1a22/#2f2f3a/#8f8f9c/#f4f4f6`). ✔ (El "fondo distinto" que reporta el CEO en esta unidad apunta a los **botones glassy del header**, no al gradiente de pantalla.)
- **Tuerca funcional y cableada** (sonido/tono/volumen reales, vibración, celebración OFF, pantalla, RPE/RIR) tanto en web como RN.

## Resumen de prioridad de fixes (esta unidad)

1. **[MAYOR·web]** Botones del header a chip sólido `#1a1a22` / `1.5px #2f2f3a` / `#b7b7c2` (igualar a RN). — el delta que más "canta".
2. **[MAYOR·web]** Quitar `uppercase`/`font-mono` del label "Ejercicio N" (12px sans 800, caja normal).
3. **[MAYOR·web/RN]** Unificar título y filas de la vista Plan al vocabulario del mockup y entre plataformas; evitar el doble título "Plan completo" + "Ver todo" en el peek.
4. **[MAYOR·web]** Volumen: estilar el thumb como el knob juicy del mockup (no range desnudo).
5. **[MAYOR·web/RN]** Decidir "Cronómetro automático" (web tiene fila extra, RN no) y "Del sistema" en Tono (web no lo ofrece, RN sí).
6. **[MENOR]** gap dots web 7px, icono 19px; layout slider RN full-width; toggle RN off `#2a2a34`/knob `#c9c9d2`.
