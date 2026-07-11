# Port 1:1 — PWA/responsive (apps/web) → React Native (apps/mobile)

> Documento maestro del esfuerzo de paridad. Escrito al cierre de la Sección 1
> (11-jul-2026). Complementa a `docs/porting-status.md` (estado vivo y residuos
> por unidad) y `docs/rn-port/ola0-hallazgos.json` (corpus de auditoría).
> **Branch de trabajo: `rnmobiledenuevo`** (absorbió a `claude/new-branch-rnmobile-x6qxw6` el 2026-07-11; aquella rama fue eliminada).

---

## 1. La visión

La app React Native (`apps/mobile`, Expo Router + NativeWind) debe ser un
**espejo 1:1 de la PWA/responsive web** (`apps/web`, Next.js): misma jerarquía
visual, mismos tokens de diseño, misma tipografía, mismos estados (vacío /
carga / error / claro / oscuro), mismos flujos y el mismo comportamiento de
cada elemento interactivo — con las únicas divergencias siendo **adaptaciones
idiomáticas de plataforma** (Pressable vs hover, BottomSheet vs Dialog,
háptica) que preserven lo que el usuario ve y puede hacer.

**Regla de oro: el web manda.** `apps/web` es la fuente de verdad. Ninguna
pantalla RN se escribe "de memoria" ni desde descripciones: se escribe contra
una spec extraída del código web real, con citas `archivo:línea`.

Por qué así: el intento original de port falló en detalles (ej. la card de
sets del workout perdió las barras RIR/RPE) porque se portó desde resúmenes
funcionales, no desde el código. La lección estructural: **sin evidencia
obligatoria y sin verificación adversarial, los detalles se pierden en
silencio.**

## 2. La metodología (olas por sección)

Cada sección de la app se porta con este pipeline; es replicable tal cual
para las secciones restantes:

```
a) INVENTARIO   — agentes mapean pantallas/rutas/modales/flujos de la sección
                  en apps/web (y localizan las contrapartes RN existentes).
b) SPEC         — 1 agente por unidad lee el código web LÍNEA POR LÍNEA y
                  produce una spec donde CADA afirmación cita archivo:líneas:
                  layout, tokens, tipografía, claro/oscuro, cada handler
                  (¿modal? ¿navega? ¿toast?), estados, validaciones, datos.
c) PORT         — 1 agente por unidad implementa CONTRA LA SPEC (no contra su
                  imaginación), leyendo el RN existente y modificándolo (no
                  duplicando), verificando consumidores antes de cambiar APIs.
d) VERIFICACIÓN — agentes DISTINTOS comparan spec vs RN elemento por elemento
   ADVERSARIAL    y reportan toda diferencia con evidencia de ambos lados.
                  Cada hallazgo dispara una ronda de fix. Se repite hasta
                  converger o hasta el tope de rondas (6).
e) CALIDAD      — `npx tsc --noEmit` (apps/mobile) + `node
                  scripts/check-token-parity.mjs` deben pasar.
f) CHECKPOINT   — commit descriptivo + push SIEMPRE antes de la siguiente
                  sección; docs/porting-status.md actualizado.
```

### Reglas duras del pipeline

- Prohibido especificar o portar de memoria: sin cita de código, no cuenta.
- Prohibido eliminar funcionalidad RN existente sin anotarlo.
- Usar tokens del theme; no introducir valores hardcodeados nuevos.
- No tocar `apps/mobile/global.css` ni `tailwind.config.js` desde agentes de
  pantalla (el token layer se gobierna aparte; gate `pnpm check:tokens`).

### Tiering de modelos (lección de costos)

- **Fable**: SOLO orquesta — diseña olas, lee resúmenes, decide, checkpointea.
  Nunca trabajo O(n) sobre pantallas/componentes.
- **Opus**: el músculo — specs, ports, verificación adversarial.
- **Sonnet** (opcional): fases mecánicas — docs de estado, gates, extracción.

### Lecciones aprendidas (para no repetir)

1. **Criterio de convergencia**: exigir "2 rondas consecutivas en cero
   absoluto" hace que auditores perfeccionistas nunca cierren (rascan P2
   infinitos). Usar **"cero P0/P1"** como criterio y tope de rondas como
   correa. Los P2 se listan y se decide en frío.
2. **Orden de la cola**: en pipelines grandes, las auditorías saturan la
   concurrencia y los fixes quedan atrás. Secciones acotadas (10-15 unidades)
   convergen; olas de 120+ componentes no.
3. **El caché de resume** (`resumeFromRunId`) reutiliza resultados solo si
   prompt+opciones son idénticos: cambiar el modelo a mitad de ola re-ejecuta
   todo. Decidir el tier ANTES de lanzar.
4. **QA visual humano es insustituible**: los agentes leen código, no píxeles.
   Cada sección cerrada debe validarse con una build real en dispositivo
   (los 3 P0 del dashboard los encontró el usuario, no la flota).
5. **La verificación adversarial de paridad no caza bugs de lógica/estado**:
   comparar spec vs RN elemento por elemento encuentra deltas visuales, pero
   se le escapan races, guardas ausentes y early-returns muertos — una pasada
   externa con **lente de lógica** (no de paridad) fue la que cazó los 3 bugs
   de estado de la Sección 1 (ver `porting-status.md` §Bugs de lógica). Cada
   sección debe incluir además ese lente. Y al cierre de cada sección,
   **re-verificar los claims del doc contra HEAD antes de commitear**: los
   P1 #1/#2 de la Sección 1 quedaron declarados abiertos en el doc estando ya
   arreglados en código (el fix precedía al commit del doc por ~25 min).

## 3. Lo hecho (cronología)

### Ola 0 — Fundación (10-jul, cortada a propósito tras capturar su valor)

- ✅ **Tokens no-color** auditados y corregidos web→RN: radios (escala entera
  desalineada: `lg` 12→20 etc.), tipografía, sombras, motion. Pusheado
  (`c193a68a`); gate de 86 tokens de color intacto.
- ✅ **Mapa de 132 componentes compartidos** web→RN (41 alta / 82 media / 9 baja).
- ✅ **1,293 discrepancias documentadas con evidencia** en
  `docs/rn-port/ola0-hallazgos.json` — SIN aplicar (ver §4).

### Sección 1 — Ejecutor de workout del alumno (10/11-jul, cerrada con residuos)

156 agentes Opus, 11 unidades (card de sets KG/reps + escalas RPE/RIR, teclado
numérico, orquestador de sesión, superseries, timers, resumen/finalizar,
sustitución, stepper, video, historial), cada una con spec-con-evidencia +
port + hasta 6 rondas de verificación adversarial.

- El flujo del ejecutor quedó **usable y fiel en lo visible**; los residuos
  P2 son deltas sub-pixel, compromisos de design-system o adaptaciones
  idiomáticas sancionadas (detalle por unidad en `docs/porting-status.md`).
- **3 P1 funcionales — ✅ RESUELTOS** (verificado 2026-07-11): el badge
  "Semana A/B" sin gate por `ab_mode` y el historial previo/detección de PR
  con el anti-patrón que web ya corrigió ya estaban arreglados en código
  desde el commit `8725b033` (el doc había quedado desactualizado, no el
  código); `expo-audio` resultó un falso gap de entorno local — el paquete
  está resuelto en `pnpm-lock.yaml` (1.0.16) e instalado, y el audio funciona
  en build CI fresco. Detalle en `porting-status.md` §P1 resueltos.
- **Bug sistémico de fundación — ✅ RESUELTO** (mini-ola 2026-07-11):
  `border-default` (y `border-subtle`/`border-strong`, mismo defecto) sin
  alpha compilaban a color opaco en dark (web: blanco@13%). Fix aplicado por
  la vía web (alpha horneado en el token, no theme imperativo):
  `tailwind.config.js` + `global.css` claro/oscuro + `lib/theme.ts`. Detalle
  en `porting-status.md` §Historial de entrenos.
- **3 bugs de lógica/estado encontrados por verificación adversarial externa
  con lente de lógica** (no de paridad pixel), arreglados en la misma
  mini-ola: race del auto-avance del modo Pasos en `ExecutorV2.tsx`;
  doble-commit por el botón "Listo" del keypad sin guarda; `syncError`/
  "Reintentar" inalcanzable en series tipadas (estos dos últimos en
  `SetRow.tsx`). Detalle en `porting-status.md` §Bugs de lógica.
- Gates al cierre: `tsc --noEmit` limpio; paridad de tokens 86/86 OK.

### CI / infraestructura (10-jul)

- Cherry-pick `bfe42530` (PR #119): profile production emite **AAB** + submit
  automático a Google Play internal + gitignore del service account.
- Fix `mobile-build.yml`: el step de inyección de `EXPO_PUBLIC_SUPABASE_*`
  ahora cubre también el profile **production** (antes solo `prodpreview`,
  lo que producía AABs que crasheaban al abrir con `supabaseUrl is required`).

## 4. Lo que falta (explícito, por sección)

> Orden recomendado. Cada sección = una ola con el pipeline de §2.

| # | Sección | Alcance web (fuente de verdad) | Entrada ya pagada |
|---|---------|-------------------------------|-------------------|
| 2 | **Dashboard del alumno** | `c/[coach_slug]/dashboard`, `perfil`, `check-in` | **3 P0 del QA del usuario** (tab bar con franja blanca en dark; overlay "Entrenamiento completado" sin scrim; header saludo con texto duplicado) + hallazgos de HeroSection, WeightWidget, AdherenceStrip, StreakWidget, NutritionDailySummary en `ola0-hallazgos.json` |
| 3 | **Dashboard del coach** | `coach/dashboard`, nav (sidebar/topbar/búsqueda), directorio `coach/clients`, ficha de cliente | Hallazgos de CoachSidebar, CoachTopBar, CoachGlobalSearch, PulseHero/KPIs/Agenda, DirRowCard, ProfileOverviewB3 en `ola0-hallazgos.json` |
| 4 | **Nutrición (alumno y coach)** | `c/[coach_slug]/nutrition*`, `coach/nutrition-*`, `foods`, `recipes`, `meal-groups` | Hallazgos de MealCard, MealIngredientRow, MacroRingSummary, NutritionTabB5 |
| 5 | **Builder del coach** | `coach/builder`, `program-builder`, `workout-programs`, `templates` | Hallazgos de BlockEditSheet, ExerciseBlock |
| 6 | **Resto** (inventariar) | bodycomp, cardio, movement, exercises, settings, onboarding, auth, tools, support… | Mapa de rutas web ya conocido |

### Deuda transversal (no pertenece a una sección)

> Los 3 P1 de la Sección 1 (badge A/B, historial/PR, expo-audio) y el bug
> sistémico de `border-default` en dark **ya están resueltos** (verificado
> 2026-07-11 — ver §3 arriba y `porting-status.md`). La deuda restante de la
> Sección 1 es sólo la de los ítems 1 y 3 de abajo.

1. **1,293 discrepancias de la Ola 0 sin aplicar** — se consumen por sección
   (grep por componente en `ola0-hallazgos.json` al tocar cada pantalla); las
   de primitivas compartidas (Button/Card/Sheet/Dialog…) convendría aplicarlas
   en una **mini-ola de primitivas** antes de la Sección 3, porque benefician
   a todas las secciones a la vez.
2. **91 componentes media/baja sin auditar** de la Ola 0 — los cubren las
   secciones al llegar a sus pantallas.
3. **Residuos P2 de la Sección 1 + verificación en device** — lista completa
   por unidad en `porting-status.md`; decidir en frío cuáles residuos P2
   valen la pena (muchos son compromisos deliberados de design-system).
4. **QA visual humano por sección** — build por Google Play internal tras
   cada cierre de sección; lo que el usuario vea se registra como P0 de la
   sección siguiente (así se hizo con el dashboard).

## 5. Cómo retomar

1. Leer `docs/porting-status.md` (estado vivo, "Dónde retomar").
2. Lanzar la siguiente sección con el pipeline de §2 (el script de la
   Sección 1 sirve de plantilla: inventario→spec→port→verify con tope de
   rondas; ajustar el criterio de convergencia a "cero P0/P1").
3. Checkpoint + push al cierre; actualizar `porting-status.md`; build + QA
   visual humano; los hallazgos del QA entran como P0 de la ola siguiente.
