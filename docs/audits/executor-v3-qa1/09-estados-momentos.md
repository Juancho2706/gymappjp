# Auditoría de fidelidad visual — Ejecutor V3 "Impulso" · Unidad 09: Estados y Momentos (v3.2)

Contrato: `concepto-a-v32-estados.html` (sin señal / máquina ocupada / ver todo) + `concepto-a-v32-momentos.html` (PR en vivo / intervalo en fase / conectar sensor / ronda cerrada).
Ámbito de esta unidad: **PR celebración**, **aviso offline**, **flujo de sustitución (máquina ocupada)**, **ronda cerrada** y **conectar sensor**. (El "Ver todo/lista" y el "Intervalo en fase" se auditan en profundidad en las unidades de mapa y cardio; aquí sólo se anota su presencia.)

## Veredicto (2 líneas)
Dos estados del contrato NO se implementaron con su diseño V3: la **sustitución "Máquina ocupada"** usa el sheet VIEJO en ambas plataformas (título, tarjetas, preselección con check y CTA "Cambiar por hoy" ausentes) y el **aviso offline** es la barra ámbar de alarma del ejecutor viejo en vez de la píldora oscura calmada del mockup (copy además distinta). Lo demás — PR en vivo (web fiel; RN aceptable pero distribuido), conectar sensor (fiel en ambas) y ronda cerrada — cumple, salvo detalles (web usa check SIMPLE donde el mockup pide check DOBLE).

**Severidad máxima: BLOCKER** (dos hallazgos BLOCKER: sustitución no rediseñada + sin disparador de sustitución en web V3).

---

## Deltas

### [BLOCKER] La pantalla "Máquina ocupada" (sustitución) NO se rediseñó — se usa el sheet del ejecutor viejo en web y RN
- **Mockup** (`concepto-a-v32-estados.html` L621-668): bottom-sheet 72% alto, `bg #1b1b23`, `border-top 2px #33333f`, radio superior 24px. Título **"Máquina ocupada"** (font 20px/900/-.02em) precedido de un **badge "?" ámbar** (`a3d-sheettl .q`, 26×26, fondo color-mix ámbar 18%, borde ámbar 40%, texto `--amber-a3d #f5b04a`). Subtítulo **"Cambia solo por hoy — mismo músculo."** 3 tarjetas alternativas (`a3d-alt`: `bg #17171f`, `border 2px #2a2a34`, radio 16px), la **primera PRESELECCIONADA** (`.sel` → borde marca + glow `0 0 0 3px` + tinte + **check circular** relleno de marca 26×26). CTA **juicy verde "Cambiar por hoy"** (icono swap, 58px) + nota con icono info **"Tu coach lo vera en el registro"**.
- **Web**: `_components/SubstituteExerciseSheet.tsx` (importado en `WorkoutExecutionClient.tsx:46`). Eyebrow "Cambiar ejercicio" (sport-300) + nombre prescrito como título (NO "Máquina ocupada" ni badge "?"). Subtítulo `L84-86`: "{músculo} · Máquina ocupada — el cambio vale solo por hoy y no toca tu plan." Cada tarjeta es tap-para-confirmar con pill **"Usar"** (`L170-177`) — **sin radio-preselección, sin check circular, sin CTA juicy "Cambiar por hoy", sin nota "Tu coach lo vera"**. Colores genéricos `--ink-950` / `white/[0.03]` / `--sport-*`, no el scope `[data-exec-v3]` ni el `#17171f/#2a2a34` del mockup. Thumb 56×56 de catálogo en vez de la mini-media 52×52.
- **RN**: `apps/mobile/components/alumno/workout/SubstituteExerciseSheet.tsx` — documentado como **"Puerto 1:1 del SubstituteExerciseSheet web (Fase L)"** (`L23-37`). Mismos deltas que web (eyebrow "Cambiar ejercicio", nombre prescrito, pill "Usar", sin preselección/CTA/nota).
- **Fix**: construir un `MaquinaOcupadaSheetV3` bajo `[data-exec-v3]` (web) / con `exec.surface` (RN): título "Máquina ocupada" + badge "?" ámbar, subtítulo "Cambia solo por hoy — mismo músculo", tarjetas `a3d-alt` con selección tipo radio (primera preseleccionada) y check circular de marca, CTA juicy "Cambiar por hoy" + nota "Tu coach lo verá en el registro". Reusar el data-layer existente (`getExerciseSubstitutionsAction` / `fetchSubstituteCandidates`), sólo re-piel + patrón de confirmación en 2 pasos (elegir → CTA).

### [BLOCKER] En web V3 (stepper) el paso de fuerza NO expone disparador de sustitución — la "Máquina ocupada" es inalcanzable en el flujo guiado
- **Mockup**: el flujo asume un acceso a "cambiar por máquina ocupada" desde el ejercicio en curso.
- **Web**: `ExerciseStepV3.tsx` no recibe `onOpenSubstitute` ni `canSubstitute`. En `WorkoutExecutionClient.tsx:1862-1883` se instancia `ExerciseStepV3` sin esas props; `onOpenSubstitute` sólo se cablea al `SingleExerciseCard` legacy de la vista lista (`L1945`), que no es el flujo por-defecto del stepper V3. Resultado: en el modo guiado V3 no hay botón "Cambiar".
- **RN** (correcto, referencia): `ExerciseScreenV3.tsx:270` renderiza un chip **"Cambiar"** (`btn-substitute-v3`) → `onOpenSubstitute`; y `SupersetScreenV3.tsx:317` lo hace por miembro activo. `ExecutorV3.tsx:776/831/925` cablean `setSubstituteBlockId`.
- **Fix**: pasar `canSubstitute` (`effType==='strength' && doneCount===0`) y `onOpenSubstitute` a `ExerciseStepV3` desde `WorkoutExecutionClient` y renderizar el chip "Cambiar" junto al nombre/chip del ejercicio (espejo del RN `ExerciseScreenV3.tsx:270`).

### [MAYOR] Aviso offline: barra ámbar de alarma del ejecutor viejo en vez de la píldora oscura calmada del mockup (+ copy distinta), en ambas plataformas
- **Mockup** (`concepto-a-v32-estados.html` L122-130, L489-495): píldora **calmada** DENTRO del cuerpo del paso, arriba de los dots. `a3d-offline`: `bg #1b1b23`, `border 1.5px #2f2f3a`, radio 12px, texto `#c1c1cc` (bold `#e8e8ee`), icono wifi-off gris `#9a9aa6`. Copy: **"Sin conexión — guardando en tu teléfono"** (negrita en "guardando en tu teléfono"). La intención de diseño es CALMA ("nada se bloquea", bullets L574-576).
- **Web**: `WorkoutExecutionClient.tsx:2286-2290` — barra sticky full-bleed **`bg-amber-500/90` texto `amber-950`**, `WifiOff`, copy **"Sin conexión — los datos se guardarán al reconectar."** Es explícitamente estilo del ejecutor viejo (alarma ámbar), fuera del scope `[data-exec-v3]`, posicionada bajo el header (no inline en el paso).
- **RN**: `ExecutorV3.tsx:1183-1187` monta `<OfflineBanner prominent message="Sin conexión — los datos se guardarán al reconectar." />`; `OfflineBanner.tsx:35-43` en `prominent` = franja sólida **`bg-warning-500/90` texto on-warning** con `WifiOff` — el propio archivo dice "espejo de la barra offline del ejecutor de entreno en web" (`L21-24`). Mismo delta que web.
- **Fix**: en modo V3 reemplazar por una píldora `[data-exec-v3]` / `exec.surface` calmada (`#1b1b23`, borde `#2f2f3a`, radio 12, texto `#c1c1cc`, wifi-off gris) inline arriba del paso, con copy **"Sin conexión — guardando en tu teléfono"**. Mantener la barra ámbar sólo para el ejecutor legacy.

### [MAYOR] Ronda cerrada (web): el banner usa check SIMPLE donde el mockup pide check DOBLE
- **Mockup** (`concepto-a-v32-momentos.html` L360-365, L739-741): `a3e-dblcheck` = **DOS** palomitas (`::before` + `::after`) en verde marca dentro del pill "Ronda N lista".
- **Web**: `RestInterstitialV3.tsx:195-197` — clase `exec-v3-dblcheck` pero renderiza **un solo** `<Check strokeWidth={3.5}>`. La clase promete doble; el glifo es simple.
- **RN** (correcto): `RestInterstitialV3.tsx:222` usa `<CheckCheck strokeWidth={3}>` (palomita doble) — fiel.
- **Fix**: en web usar el icono `CheckCheck` de lucide (o duplicar la palomita en CSS `exec-v3-dblcheck`) para igualar el check doble del mockup y del RN.

### [MAYOR] PR en vivo (RN): es un toast tipo píldora superpuesto, no el banner-card inline del mockup; falta el kicker "Nuevo récord"
- **Mockup** (`concepto-a-v32-momentos.html` L561-587): banner rectangular redondeado (radio 15px) con medalla + **kicker "¡PR! Nuevo récord"** (línea `.k`) + valor "62,5 kg — tu mejor marca" (`.v`), y DEBAJO una `a3e-prcard` (tarjeta de valores con borde dorado pulsante) + chip `a3e-prev` "Anterior 60 kg / Superado".
- **RN**: `PrCelebration.tsx:157-181` es un **pill** (`borderRadius 999`) `pointerEvents="none"` superpuesto; título "¡PR! {kg} kg" y sub "tu mejor marca" — **sin el kicker "Nuevo récord"** y sin la `prcard` dorada. Atenuante: el borde dorado de la fila y el chip "Anterior/Superado" SÍ viven en la pantalla de fuerza (`ExerciseScreenV3.tsx:222-223` `pr`/`prColor`, `L345-365` tachado + `ArrowUp`), por lo que el contenido está distribuido, no perdido.
- **Web** (referencia fiel): `PrCelebration.tsx` (web) reproduce banner rect (radio 14) + medalla estrella + kicker "¡PR! Nuevo récord"/"Mejor 1RM" + "Anterior/Superado" con flecha; el borde dorado va como `exec-pr-ring` sobre el chip recap (`LogSetForm.tsx:706`).
- **Fix (RN)**: convertir el banner de pill (999) a rect redondeado (~14-15px) y añadir el kicker "Nuevo récord" (línea superior) sobre "62,5 kg — tu mejor marca", para acercarlo al banner del mockup y al web.

### [MENOR] "Recap de sincronización" (Serie 1 Guardada / Serie 2 Por sincronizar) no existe como tira dedicada
- **Mockup** (`concepto-a-v32-estados.html` L199-214, L536-550): tira de 2 columnas `a3d-synced` sobre los valores — "Serie 1 · Guardada" (check verde) y "Serie 2 · Por sincronizar" (spinner ámbar `--amber-a3d`, borde/tinte ámbar).
- **Web/RN**: el estado se realiza **por-serie** en el chip recap del `LogSetForm.tsx:724-728` (`CloudOff` + "Sin sincronizar", ámbar). Funcionalmente equivalente pero no la tira de recap dedicada del mockup.
- **Fix**: opcional — el chip por-serie cubre la intención; si se quiere paridad literal, agrupar los recaps en una tira de 2 columnas cuando hay pendientes offline.

### [MENOR] Ronda cerrada (web): color de texto del banner casi-blanco vs verde-marca del mockup
- **Mockup**: `a3e-roundban` texto `color-mix(brand 88%, #fff)` (verde tintado).
- **Web**: `globals.css:2911` `color: #eef0ee` (casi blanco).
- **RN**: `RestInterstitialV3.tsx:223` `hexToRgba(exec.accent, 0.95)` (marca tintada) — más cercano.
- **Fix**: cambiar `#eef0ee` por `color-mix(in srgb, var(--exec-brand) 88%, #fff)`.

### [MENOR] PR en vivo (web): micro-diferencias métricas del banner
- **Mockup** vs **web** (`globals.css:2581-2695`): banner radio 15→**14**px, padding 11/14→**10/13**; medalla 34→**32**px; chip "Anterior" borde 2px dashed → **1.5px**, padding 10/14→**7/13**, radio 14→**12**px. Confetti 7 partículas (coincide) y token `--exec-pr: #f5c451` (`globals.css:1423`) = `--gold-a3e #f5c451` (coincide).
- **Fix**: igualar radios/paddings/tamaño de medalla si se busca paridad px exacta (impacto visual bajo).

---

## Cumple (fiel — no re-tocar)

- **Token del PR**: `--exec-pr: #f5c451` (`globals.css:1423`) == `--gold-a3e #f5c451` del mockup. RN `exec.pr` / `GOLD_TINTS[0]='#f5c451'`. ✔
- **PR en vivo (web)**: estructura banner + medalla estrella + kicker "¡PR! Nuevo récord"/"Mejor 1RM" + "62,5 kg — tu mejor marca" + "Anterior/Superado" con flecha arriba + confetti de UNA oleada (7, posiciones fijas) + borde dorado pulsante (`exec-pr-ring`, `exec-pr-goldpulse`). Inline, NO modal, auto-descartado ~1,5s (`LogSetForm.tsx:678-753`). Fiel al contrato. ✔
- **Conectar sensor (web)**: `SensorSheetV3.tsx` + `globals.css:3552-3762` — radar de anillos que laten desde `HeartPulse` (`--zone-z5 #f87171`), tarjeta `exec-v3-dev.is-on` con BLE + BPM por zona, CTA "Conectar", nota honesta "Bluetooth estándar · Apple Watch y Galaxy Watch llegan con la app del reloj". Honesto sobre la limitación de Web Bluetooth (selector nativo). ✔
- **Conectar sensor (RN)**: `ConnectSensorSheet.tsx` — radar (corazón `#f87171` + 3 anillos), **lista de dispositivos escaneados** con barras de señal (más cercano al mockup Polar/Garmin que web), preselección + check, CTA "Conectar", misma nota honesta. Título "Conectar sensor de pulso". ✔
- **Ronda cerrada (estructura, ambos)**: banner "Ronda N lista" pill (radio 999, `10px 18px`, brand 15%/40%) + `is-pulse` brandpulse, dots de ronda (previas llenas / actual late `is-fill`+`is-beat` / futuras vacías) + "N / M", tag `grouptag` "Solo al cerrar la ronda completa", anillo 02:00 "Descanso de grupo", tarjeta "Siguiente ronda" con `nextTag` (ej. "A3"). `RestInterstitialV3.tsx:192-214` (web) / `205-238` (RN). RN además usa check DOBLE correcto. ✔ (salvo el check simple de web, arriba).
- **PR distribuido (RN)**: borde dorado de la fila + "Anterior" tachada con `ArrowUp` en `exec.pr` (`ExerciseScreenV3.tsx:222-223, 345-365`). ✔
- **Intervalo en fase / Conectar-sensor "detrás" atenuado**: presentes en la superficie de cardio (`.exec-v3-nextphase`, barra segmentada en `globals.css:3792+`; `CardioStepV3`/`useIntervalRunner`). Auditar en detalle en la unidad de cardio; aquí sólo se confirma su existencia. ✔ (parcial)

## Notas de método
- No se editó ningún archivo de código; sólo lectura + este informe.
- Rutas web bajo `apps/web/src/app/c/[coach_slug]/workout/[planId]/` (v3/ y raíz). Rutas RN bajo `apps/mobile/components/alumno/workout/` (v3/ y raíz).
- Los dos BLOCKER y el aviso offline son los candidatos más probables detrás del QA del CEO ("restos del ejecutor viejo visible" = sheet de sustitución legacy + barra offline ámbar legacy).
