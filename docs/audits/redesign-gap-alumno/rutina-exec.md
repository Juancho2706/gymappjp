# Gap de fidelidad — Alumno › Rutina / Ejecución (rutina-exec)

**KIT:** `docs/design-source/ui_kits/eva-app/screens/alumno-rutina.jsx` (componente `Rutina` + `Rut_Target` / `Rut_TargetGrid` / `Rut_LogRow`).
**APP:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/**` + `workout-history/**`.

Alcance por instrucción: la estructura dark-inmersiva + superseries intercaladas es **intencional reciente** (commit 3e87f9ad + F2). Se audita SOLO deuda de tokens/detalle. Diferencias de color por white-label (rampa sport = color del coach) y de datos (mocks vs data real) NO se reportan.

Verificación de tokens (globals.css): `--radius-sm:10px`=`rounded-sm`, `--radius-md:14px`=`rounded-control`, `--radius-lg/card:20px`=`rounded-card`, `--border-inverse:rgba(255,255,255,0.10)`, `--ink-950/900`, rampas `--sport-*`/`--ember-*`, `--warning-500:#F5A524`, `@utility text-on-dark(-muted)` — todos presentes y mapeados 1:1 con el kit. El grid de objetivos, la tabla de registro, la barra de progreso, el chip "sesión anterior", el botón de completar serie (`--sport-500` al hacer done), el chip de objetivo (`bg-white/[0.05]` + `border-inverse` + valor `font-mono 15px`), la Zona FC ember highlight, el botón play 48×48 y el nombre de ejercicio `font-black tracking-[-0.02em]` están todos correctos. Deuda encontrada abajo.

---

## P1

### [P1] Los timers flotantes usan superficies claras legacy sobre la pantalla inmersiva oscura
- **Kit:** `alumno-rutina.jsx` — barra de timer **inline dentro de la card**, líneas 228-240. Estado descanso activo = `background: rgba(245,107,82,0.18)` (ember), icono `var(--ember-300)`, cuenta regresiva `eva-mono 18px` en `var(--ember-200)`; idle = `rgba(38,128,255,0.12)` (sport). Todo sobre `--ink-900`/`--ink-950`.
- **App:** `RestTimer.tsx:229`, `IntervalTimer.tsx:126`, `HoldTimer.tsx:74`, `Stopwatch.tsx:66` — widget flotante `bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl`, texto `text-foreground`/`text-muted-foreground`, anillo de progreso `stroke="var(--theme-primary)"`, flash de fin `bg-emerald-500/10`.
- **Diferencia concreta:** la pantalla de ejecución fuerza `bg-[var(--ink-950)]` pero NO aplica la clase `.dark` (el layout `/c` es claro por defecto: `layout.tsx:302` `dark:bg-background`). Por eso `--card = --surface-card = var(--white)` (globals.css:212/393) y `--foreground = --ink-800`: los cuatro timers renderizan como una **tarjeta blanca con texto oscuro** flotando sobre la pantalla ink-950, con anillo azul/sport y flash verde-esmeralda — en vez de la barra ember oscura del kit. Es el único bloque de la pantalla que quedó con tokens claros shadcn (no se re-skineó al kit inmersivo).
- **Fix propuesto:** re-skin de los 4 widgets al palette inmersivo: contenedor `bg-[var(--ink-900)]/95` + `border-[var(--border-inverse)]`, texto `text-on-dark`/`text-on-dark-muted`, y usar `--ember-500/300/200` para el estado de descanso/trabajo activo (anillo y countdown), reservando sport sólo para idle. Alternativa mínima: forzar contexto `dark` alrededor del portal de timers para que los tokens semánticos flipeen.
- **Verdict:** CONFIRMED — El árbol `/c` corre en tema claro por defecto: root `apps/web/src/app/layout.tsx:143` `defaultTheme="light"` + `enableSystem={false}`, y NO hay `forcedTheme="dark"` en `/c` (el único forced-dark es `/admin`). La pantalla fuerza `bg-[var(--ink-950)]` SIN aplicar `.dark` (`WorkoutExecutionClient.tsx:925`), y `WorkoutTimerProvider.tsx:114-126` renderiza los 4 timers `fixed` sin envoltorio `.dark`. Por eso en `:root`/light `--card = --surface-card = var(--white)` (globals.css:393) y `--foreground = --ink-800` → los 4 widgets (`bg-card/95` + `text-foreground` + anillo `var(--theme-primary)` + flash `bg-emerald-500/10`) son tarjetas blancas sobre la pantalla ink-950. Verificado 1:1 en RestTimer.tsx:229/286/235, IntervalTimer.tsx:126, HoldTimer.tsx:74/86/77, Stopwatch.tsx:66. Ningún contexto dark lo rescata — refutación descartada.

### [P1 → DOWNGRADED a P2] El callout "Nota del coach" está en ámbar en vez del azul/sport del kit
- **Kit:** `alumno-rutina.jsx:211-216` — `b.notes` renderiza con `background: rgba(38,128,255,0.10)` (tinte sport/primary), `border: 1px rgba(38,128,255,0.2)`, icono quote `var(--sport-300)`, texto `text-on-dark` opacity 0.92. Es el ÚNICO callout de nota y es azul.
- **App:** `WorkoutExecutionClient.tsx:1224-1232` (loose) y `:646-651` (superserie) — `border-amber-400/30 bg-amber-400/10`, icono `text-amber-300`, título "Nota del coach" `text-amber-300`, texto `text-amber-100/90`.
- **Diferencia concreta:** la app pintó el callout de nota del coach en ámbar/amarillo, mientras el kit lo tiene en azul/sport. (La app además lo separó de `instructions`, que sí quedó azul: `:1215-1223` usa `bg-primary/[0.10]` + `text-[var(--sport-300)]`, 1:1 con el tinte del kit — o sea el azul del kit terminó en el bloque equivocado.)
- **Fix propuesto:** cambiar el callout de nota a los tokens sport del kit: `border border-primary/20 bg-primary/[0.10]`, icono/título `text-[var(--sport-300)]`, texto `text-on-dark/90`. Si se quiere conservar una jerarquía visual, dejar ámbar sólo como acento del título pero el fondo/borde en sport.
- **Verdict:** DOWNGRADED → P2 — El hecho es exacto (verificado: kit `alumno-rutina.jsx:211-216` = callout único de nota en sport/azul `rgba(38,128,255,0.10)`; app `WorkoutExecutionClient.tsx:1224-1232` = `border-amber-400/30 bg-amber-400/10` + `text-amber-300`/`text-amber-100/90`). Pero NO es un token sin re-skinear: el callout ámbar está deliberadamente diseñado con paleta coherente (tres shades amber armónicos, no un leftover shadcn), y el bloque hermano `instructions` (`:1215-1223`) SÍ clava el sport-blue del kit 1:1 (`bg-primary/[0.10]` + `text-[var(--sport-300)]` + `text-on-dark/90`). La app partió el callout único del kit en dos conceptos — Instrucciones técnicas (azul = kit) / Nota del coach (ámbar = atención) — jerarquía/riqueza intencional que cae bajo la exclusión "riqueza extra de la app". Divergencia de color real pero de magnitud un-solo-elemento (mismo tier que los P2 "chip sin icono" / "back sin fondo"), no un quiebre de skin inmersivo como los timers.

---

## P2

### [P2] El chip de tipo de bloque perdió el icono tipado y el label coloreado
- **Kit:** `alumno-rutina.jsx:9-14` (`RUT_TYPEMETA` con campo `icon`: `dumbbell`/`heart-pulse`/`move`/`git-commit`) y `:183` — chip `rgba(255,255,255,0.06)` con `Ic(meta.icon, {size:13})` + label, **ambos en `meta.color`**.
- **App:** `WorkoutExecutionClient.tsx:149-154` (`RUT_TYPE_META` sólo `label`+`color`, sin `icon`) y `:1098-1101` / `:587-590` — mismo pill `bg-white/[0.06]` pero con un **punto genérico** `h-1.5 w-1.5 rounded-full` en `meta.color` + label en `text-on-dark` (blanco).
- **Diferencia concreta:** el kit muestra un icono específico por tipo (mancuerna, corazón, etc.) y el texto del label coloreado; la app lo reemplazó por un punto neutro y label blanco → se pierde la iconografía de tipo y el color del label.
- **Fix propuesto:** re-agregar `icon` a `RUT_TYPE_META` y renderizar `<Icon className="w-3 h-3" style={{color: meta.color}} />` + label `style={{color: meta.color}}` en el chip.

### [P2] Botón "atrás" (y tuerca) del header sin fondo soft
- **Kit:** `alumno-rutina.jsx:160` back = `40×40`, `borderRadius: var(--radius-md)`, `background: rgba(255,255,255,0.08)`, chevron 20; `:166` settings = mismo cuadro con fondo persistente.
- **App:** `WorkoutExecutionClient.tsx:934` back = `<ArrowLeft className="w-6 h-6" />` dentro de `p-2 -ml-2 text-on-dark-muted` — icono pelado, sin cuadro/fondo. `:962-969` settings = `h-10 w-10 rounded-control` pero fondo sólo en `hover:bg-white/[0.08]` (no persistente).
- **Diferencia concreta:** el kit tiene botones-cuadro `rgba(255,255,255,0.08)` siempre visibles; la app deja el back como icono suelto y la tuerca sin fondo hasta hover.
- **Fix propuesto:** envolver el back en `flex h-10 w-10 items-center justify-center rounded-control bg-white/[0.08]` y quitar el `hover:` condicional de la tuerca (fondo `bg-white/[0.08]` base) para igualar el par de botones del kit.

### [P2] Micro-deuda de tipografía/espaciado en la card de bloque
- **Kit vs App:**
  - Nombre de ejercicio: kit `fontSize 23` (`:189`); app `text-[19px]` loose (`:1110`) y `text-[17px]` en miembros de superserie (`:583`). Escala reducida para la lista apilada (razonable dado el layout no-carousel), pero por debajo del kit.
  - Label del chip de objetivo: kit `letterSpacing: 0.06em` (`:20`); app `tracking-wide` ≈0.025em (`:246`, `:1149`).
  - Padding de la card de bloque: kit `padding: 20` (`:180`); app `p-4` = 16px en el wrapper de grupo (`:1048`) y `p-3` en la card de ejercicio (`:1089`).
- **Diferencia concreta:** nombre más chico, tracking del label de objetivo más apretado y padding de card ligeramente menor que el kit.
- **Fix propuesto:** subir el nombre loose a ~21-23px, usar `tracking-[0.06em]` en el label del `Rut_Target`, y padding `p-5` (20px) en la card de ejercicio para clavar los valores del kit. Baja prioridad (no rompe lectura).

---

Notas de no-hallazgo (verificados OK, no reportados): barra de progreso (`h-1.5` sport-500 + track `white/10` + fila mono 11px `:973-991`); grid de objetivos tipado con `rounded-sm`+`border-inverse`+`bg-white/[0.05]`+valor `font-mono 15px` y Zona FC ember highlight (`:234-251`); chip "sesión anterior" strength-only (`:1233-1248`); tabla de registro y botón de completar serie `--sport-500` (`LogSetForm.tsx:589-590`); botón play 48×48 `rounded-control` bg `meta.color` (`:1135-1142`); `workout-history/**` usa DS limpio (`bg-surface-sunken`, `text-strong`, `rounded-pill`, `font-display`) sin deuda. `IntervalTimer`/`HoldTimer`/`Stopwatch` comparten la deuda P1 de superficies claras (ya cubierta).

**Verificado 1:1**
