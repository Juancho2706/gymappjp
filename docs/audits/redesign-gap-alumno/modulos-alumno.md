# Auditoría de fidelidad visual — LADO ALUMNO · área `modulos-alumno`

Rediseño EVA · vista alumno de los módulos **Movimiento** (screening 7 patrones) y
**Composición corporal** (BIA / ISAK), ambos read-only.

- **KIT (mobile/PWA <760, primario):** `docs/design-source/ui_kits/eva-app/screens/coach-modules.jsx`
  - `MovimientoModule({ readOnly })` — líneas 317-489 (la ruta del alumno pasa `readOnly`).
  - `ComposicionModule({ readOnly })` — líneas 496-743.
  - `TrendChart` (barras) — líneas 524-539.
  - Entradas en `alumno.jsx` (AlumnoMas): líneas 942-944 → `go('movimiento')` / `go('composicion')`.
  - `SegmentedControl` del DS — `docs/design-source/_ds_bundle.js`.
- **APP:**
  - `apps/web/src/app/c/[coach_slug]/movimiento/page.tsx` → `components/movement/StudentMovementView.tsx`
    (+ `AssessmentReportCard.tsx`, `EvolutionCharts.tsx`, `MovementDisclaimer.tsx`).
  - `apps/web/src/app/c/[coach_slug]/bodycomp/page.tsx` → `components/bodycomp/StudentBodyCompositionView.tsx`
    (+ `StudentBiaSummary.tsx`, `StudentIsakSummary.tsx`, `StudentBiaTrend.tsx`, `StudentIsakTrend.tsx`, `CountUpValue.tsx`).

## Veredicto de estructura

**Sin P0.** Ambos módulos reproducen 1:1 la estructura del kit:

- **Movimiento:** hero oscuro (`Card variant="inverse"`) con semáforo de banda + compuesto `/21` + badges
  Dolor/Asimetría ✓ · tabla de 7 patrones con celdas I/D/Ú y cuadro de puntaje final coloreado ✓ · notas del
  coach ✓ · Evolución con barras del compuesto **+** comparativa por patrón (primera vs última con flechas) ✓ ·
  disclaimer ✓ · empty-states (`needTwo`, sin evaluaciones) ✓. El historial + acciones (solo coach) correctamente
  ausente en la vista read-only.
- **Composición:** switcher de método gateado a `hasBoth` ✓ · resumen BIA (grid de métricas con delta vs medición
  previa) ✓ · resumen ISAK (headlines % grasa + somatotipo, barra apilada Kerr 5C `--viz-1..5` + leyenda + línea
  Σ masas/peso/dif) ✓ · tendencia con toggle de serie ✓ · disclaimer read-only ✓. La captura del coach
  (BiaCapture/IsakCapture) correctamente ausente.

Los hallazgos son deuda de estilo/token, no estructural.

---

## Hallazgos

### P1 — Headlines del resumen ISAK des-jerarquizados vs el kit
- **Kit:** `coach-modules.jsx:682-685` — % grasa y somatotipo se renderizan como dos números **grandes y
  desnudos** (`className="eva-metric"`, `fontSize: 26`) uno al lado del otro (`flex`, `gap: 22`), con la etiqueta
  chica (`11px`) debajo. Sin caja ni borde: son el "hero" del resumen.
- **App:** `StudentIsakSummary.tsx:53-74` — los envuelve en dos tiles en `grid grid-cols-2` con
  `rounded-control border border-subtle bg-surface-sunken px-3 py-2.5` y **encoge** los números: % grasa a
  `text-lg` (18px) y somatotipo a `text-sm` (14px). Se pierde la prominencia del headline del kit.
- **Diferencia concreta:** el número protagonista pasa de 26px desnudo a 18px/14px encajonado → jerarquía visual
  degradada en el elemento más importante de la card ISAK.
- **Fix:** renderizar % grasa y somatotipo como métricas desnudas grandes (`font-display`/`.eva-metric`, ~26px,
  `text-strong`) en un `flex gap-[22px]`, con la etiqueta chica debajo, sin `border`/`bg-surface-sunken`. Mantener
  `CountUpValue`. Las tiles boxeadas del kit son solo para el grid BIA (allí sí es fiel), no para estos headlines.
- **Verdict:** DOWNGRADED → P2. La descripción es factualmente CONFIRMADA (el kit `coach-modules.jsx:682-685`
  usa dos `eva-metric` desnudos a 26px con `flex gap:22`; la app `StudentIsakSummary.tsx:53-74` los boxea en
  `grid grid-cols-2` con `rounded-control border border-subtle bg-surface-sunken` y encoge a `text-lg`/`text-sm`).
  PERO la severidad P1 está inflada: (1) `StudentBiaSummary.tsx:66-77` usa el patrón de tile IDÉNTICO — la app
  **armonizó** intencionalmente los resúmenes BIA e ISAK en un solo sistema de tiles (el kit es internamente
  inconsistente: BIA boxeado / ISAK desnudo); (2) dentro de la jerarquía propia de la app, el % grasa a `text-lg`
  (18px) sigue siendo la métrica MÁS grande de la pantalla (mayor que las tiles BIA a `text-base` 16px) → el foco
  se conserva, solo no llega al pico de 26px del kit; (3) ambos mantienen `font-black text-strong tabular-nums` +
  `CountUpValue` (riqueza de movimiento que el kit no tiene). Es una divergencia de tamaño+caja de la misma
  categoría de token/estilo que los P2 (densidad de grid, color de badge, forma de toggle), no un quiebre
  estructural ni de jerarquía focal que justifique P1.

### P2 — Densidad del grid de métricas BIA (2-col en mobile vs 3-col del kit)
- **Kit:** `coach-modules.jsx:671` — `gridTemplateColumns: '1fr 1fr 1fr'`, **3 columnas fijas en todos los
  viewports** (incluido el mobile <760, primario).
- **App:** `StudentBiaSummary.tsx:58` — `grid grid-cols-2 sm:grid-cols-3` → **2 columnas por debajo de 640px**,
  3 recién en `sm`. En el viewport primario del alumno se ven 2 tiles por fila en vez de 3.
- **Diferencia concreta:** densidad de las métricas BIA distinta en el viewport que más importa; el layout "respira"
  distinto al del kit.
- **Fix:** usar `grid-cols-3` desde base (opcionalmente `grid-cols-2` solo bajo un breakpoint muy angosto si la
  legibilidad lo exige) para igualar la densidad 3-col del kit.

### P2 — Color del badge "Módulo" en el header de Composición (success/verde vs sport/tema)
- **Kit:** `coach-modules.jsx:633-635` — `TopBar` con `trailing={<Badge tone="sport" variant="soft">Módulo</Badge>}`
  (paleta sport/tema).
- **App:** `StudentBodyCompositionView.tsx:61-63` — pill hardcodeado en verde:
  `bg-[var(--success-100)] ... text-[var(--success-700)]`.
- **Diferencia concreta:** el badge del módulo es verde en la app y sport (azul/tema) en el kit. Además rompe el
  white-label: el kit `tone="sport"` deriva del tema del coach; el verde fijo no.
- **Fix:** usar tokens sport/soft (`bg-sport-100 text-sport-600`, o el `Badge tone="sport" variant="soft"` del DS)
  para igualar el kit y respetar el theming. (Nota: la ListRow de Composición en `alumno.jsx:944` sí usa success,
  pero el header del módulo en el kit es sport — la fuente de verdad para esta pantalla es `ComposicionModule`.)

### P2 — Toggle de serie de la Tendencia: activo tinta-tema/rounded vs neutro-negro/pill del kit
- **Kit:** `coach-modules.jsx:713-717` — botones toggle grasa/músculo con activo
  `background: var(--ink-950)` + texto blanco, `borderRadius: 999` (pill neutro casi-negro).
- **App:** `StudentBiaTrend.tsx:69-84` y `StudentIsakTrend.tsx:74-89` — activo
  `backgroundColor: var(--theme-primary)` + `text-primary-foreground`, `rounded-control` (~10-12px).
- **Diferencia concreta:** el chip activo es rectangular y del color del tema en la app; en el kit es una píldora
  neutra negra. Difieren color **y** forma.
- **Fix:** activo `bg-[var(--ink-950)]` + texto blanco + `rounded-pill` para igualar el toggle neutro del kit. (Si
  se quiere conservar el tinte de tema como flourish white-label, al menos alinear la forma a `rounded-pill`.)

### P2 — Visualización de Tendencia: AreaChart (recharts) vs barras simples del kit
- **Kit:** `coach-modules.jsx:524-539` (`TrendChart`) y su uso en `719-724` — gráfico de **barras verticales
  simples** con el valor mono sobre cada barra y la primera barra en color acento; mismo lenguaje visual que las
  barras de Evolución de Movimiento (`404-446`).
- **App:** `StudentBiaTrend.tsx:87-121` y `StudentIsakTrend.tsx:92-126` — **recharts `AreaChart`** con ejes X/Y,
  gridlines, gradiente de relleno, tooltip y draw-in.
- **Diferencia concreta:** la app usa un lenguaje de gráfico distinto (área con ejes) al minimalista del kit
  (barras), y también distinto a su propio Movimiento/EvolutionCharts (que sí replica las barras del kit) →
  inconsistencia interna.
- **Fix:** es **más rico** que el kit, así que por la regla de "riqueza extra se mantiene" es defendible dejarlo.
  Se reporta como divergencia de fidelidad para decisión del orquestador: si se prioriza fidelidad estricta,
  cambiar a barras estilo `TrendChart`; si no, aceptar como enriquecimiento consciente.

### P2 — Posición del disclaimer en Movimiento (mid-page vs último del kit)
- **Kit:** `coach-modules.jsx:485` — `<MovementDisclaimer />` se renderiza al **final** del módulo, después del
  bloque de Evolución.
- **App:** `AssessmentReportCard.tsx:188` — el disclaimer vive **dentro** de `AssessmentReportCard` (tras las
  notas); en `StudentMovementView.tsx:49-51` la card del reporte se renderiza antes que `EvolutionCharts`, así que
  el disclaimer queda **entre** el reporte y la evolución, no al final.
- **Diferencia concreta:** el disclaimer aparece a mitad de página en la app; en el kit cierra la pantalla.
- **Fix:** sacar `<MovementDisclaimer />` de `AssessmentReportCard` y renderizarlo en `StudentMovementView`
  después de `EvolutionCharts` (mantener el disclaimer en el empty-state como ya está).

---

## Notas (no reportadas como gap)

- **Switcher de método (bia/isak):** la app tinta el texto del segmento activo con `var(--theme-primary)`
  (`StudentBodyCompositionView.tsx:88`) mientras el `SegmentedControl` del kit usa `text-strong` neutro. Se
  considera flourish white-label intencional (regla 2 · color derivado del tema) → no es gap.
- **Tendencia ISAK con 3 series** (grasa/músculo/adiposa) vs 2 del kit, y **métrica de agua corporal** extra en el
  grid BIA: riqueza de datos real de la app (regla 3) → no es gap.
- **Header como icon-circle + back-link/chevron** en vez del `TopBar` del kit: patrón de shell equivalente de la
  app, consistente con el resto de pantallas alumno → no es gap.
- **Barra Kerr y colores de banda/semáforo:** usan `--viz-1..5` y `--danger/warning/success-*` idénticos al kit;
  verificados 1:1.

**Verificado 1:1.**

## Fix log (2026-07-02)

Implementado (vista alumno read-only; motores/CountUp/charts intactos):

- **[P1→P2 DOWNGRADED] Headlines ISAK desnudos** — `StudentIsakSummary.tsx`: % grasa y somatotipo salen del `grid grid-cols-2` de tiles boxeadas (`rounded-control border bg-surface-sunken`, `text-lg`/`text-sm`) a métricas hero desnudas en `flex flex-wrap gap-x-[22px]` a `font-display text-[26px] font-black tabular-nums tracking-[-0.03em] text-strong`, con la etiqueta chica (11px) debajo (kit `coach-modules.jsx §682`). `CountUpValue` conservado en % grasa. Nota: esto reintroduce la asimetría del kit (BIA boxeado / ISAK desnudo) a propósito — es lo que hace el kit; el verdict DOWNGRADED confirmó el hecho y lo mantuvo como divergencia válida.
- **[P2] Badge "Módulo" verde → sport soft (white-label)** — `StudentBodyCompositionView.tsx`: `bg-[var(--success-100)] text-[var(--success-700)]` → `bg-sport-100 text-sport-600` (deriva del tema del coach, kit `Badge tone="sport" variant="soft"`).
- **[P2] Grid BIA 3-col en móvil** — `StudentBiaSummary.tsx`: `grid-cols-2 sm:grid-cols-3` → `grid-cols-3` (densidad del kit en el viewport primario).
- **[P2] Toggle de serie de Tendencia = pill ink-950** — `StudentBiaTrend.tsx` y `StudentIsakTrend.tsx`: activo `text-primary-foreground` + `backgroundColor: var(--theme-primary)` + `rounded-control` → `bg-[var(--ink-950)] text-white rounded-pill` (píldora neutra del kit §713; tinte de tema inline eliminado).
- **[P2] Disclaimer de Movimiento al final** — `AssessmentReportCard.tsx` gana prop opcional `showDisclaimer` (default `true` → la vista del coach `ClientMovementReport` queda byte-idéntica). `StudentMovementView.tsx` pasa `showDisclaimer={false}` y renderiza `<MovementDisclaimer />` DESPUÉS de `EvolutionCharts` → cierra la pantalla como el kit §485, ya no a mitad de página.

No implementado (defendible como "riqueza extra" según el propio informe): Tendencia AreaChart (recharts) vs barras del kit — se deja el enriquecimiento consciente.
