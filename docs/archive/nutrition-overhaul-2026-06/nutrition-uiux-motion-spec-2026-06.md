# Nutrición EVA — Spec de UI/UX y Motion (Desktop + Responsive/PWA, Junio 2026)

> **Cómo leer este documento.** Las líneas marcadas con *Por qué* están escritas para que los socios (no técnicos) las entiendan. Las líneas con clases, props, ms y easings son para el ingeniero frontend, que debería poder construir directamente desde aquí. Todo está anclado a componentes reales de EVA (rutas exactas). Stack: Next 16 / React 19, Tailwind v4 (`@theme` en CSS), `framer-motion ^12.38` (import `motion`), `recharts ^3.8`, `react-circular-progressbar ^2.2`, `canvas-confetti ^1.9`, `sonner`, `@dnd-kit`, `vaul`/`@base-ui`, `lucide`, `tw-animate-css`. PWA via `public/sw.js`; `h-dvh`/`pl-safe`/`pt-safe`; `apps/mobile` = Expo + NativeWind v4 + Moti/Reanimated.

---

## 1. Principios de diseño

1. **Claridad sobre decoración.** Cada pantalla responde una pregunta de un vistazo: el alumno pregunta "¿cuánto me queda hoy?", el coach pregunta "¿quién va mal?". Todo lo demás es secundario y se difiere.
2. **El movimiento explica, no adorna.** Una animación solo existe si comunica un cambio de estado real (una comida se marcó, un anillo se llenó, un día cambió). Re-animar en cada render entrena al usuario a ignorar el movimiento (Apple Fitness gana delight *por ser raro*).
3. **Un número por concepto.** Nunca dos formas de leer lo mismo compitiendo. Las calorías se leen como "restante / meta"; los macros como "consumido / objetivo" (la proteína es un piso a alcanzar, no un techo). Semánticas distintas → encuadres distintos.
4. **Mobile-first, desktop se expande.** *Un componente, varios contenedores.* La misma vista de nutrición refluye por **espacio disponible**, no escondiendo datos. El alumno vive en PWA vertical; el coach vive en escritorio denso. Mismo `MacroRingSummary`, mismo `AdherenceStrip`.
5. **El color nunca carga el significado solo.** Cada macro y cada estado (en meta / excedido) lleva *hue + posición + etiqueta de texto o ícono*. ~8% de hombres tienen daltonismo rojo-verde; un esquema verde=bien/rojo=mal es el fallo más común de las apps de nutrición (WCAG 1.4.1).
6. **Optimista por defecto, deshacer siempre.** Marcar una comida actualiza la UI al instante (`useOptimistic`, ya en el stack) con un toast "Registrado — Deshacer". Convierte "confirmar antes de actuar" en "actuar y deshacer": la app se siente instantánea incluso con red lenta.
7. **Accesible y reduce-motion como rama de primera clase.** Cada animación tiene una variante reducida que **conserva el significado** (el check, el tinte verde, el valor final) y elimina solo viaje y rebote. Nunca un kill-switch global.

---

## 2. Sistema visual

### 2.1 Paleta de macros (el cambio más urgente)

**Problema actual:** hay **drift de color de macro** entre componentes. `MacroRingSummary` usa proteína=`#f97316` (naranja), carbos=`#3b82f6` (azul), grasas=`#eab308` (amarillo); `MealCard` usa P=`text-orange-500`, C=`text-blue-500`, G=`text-yellow-500`; `NutritionDailySummary` usa P=`bg-rose-500`, C=`bg-amber-500`, G=`bg-emerald-500` (¡grasas en verde, que es el color de "completado"!); `NutritionTabB5.MACRO_COLORS` usa prot=`#10b981`, carb=`#f59e0b`, fat=`#ef4444`. **Cuatro paletas distintas para tres macros.** Esto fuerza re-aprendizaje en cada superficie y rompe la regla de color-con-significado-estable.

**Paleta canónica EVA (lock app-wide), de la investigación previa, ajustada para AA y dark mode:**

| Macro | Light (`--macro-*`) | Dark desaturado | Label corta | Ícono lucide |
|---|---|---|---|---|
| Proteína | `#5E9FD6` (azul) | `#7FB3E0` | `P` | `Beef` / `Drumstick` |
| Carbohidratos | `#FFB74D` (ámbar) | `#FFC97A` | `C` | `Wheat` |
| Grasas | `#81C784` (verde salvia) | `#A0D6A3` | `G` | `Droplet` |
| Calorías (energía) | `var(--theme-primary)` (brand del coach, fallback `#007AFF`) | igual | `kcal` | `Flame` |
| Excedido (over) | `#EF4444` / `#F87171` dark | — | `+N` + "excedido" | `AlertTriangle` |
| En meta / completado | `#10B981` (brand EVA) | `#34D399` | — | `CheckCircle2` |

> **Aviso de conflicto resuelto:** las grasas pasan de "amarillo/verde-emerald" a **verde salvia `#81C784`**, claramente distinto del `#10B981` de "completado". Y el verde-emerald queda **reservado exclusivamente** para estado de éxito/adherencia, nunca para un macro. Azul+ámbar es el par de 2 colores más seguro para daltonismo; el verde salvia se separa por posición fija (siempre tercero) + label `G` + ícono. Pasar la paleta por un simulador CVD antes de mergear.

**Regla de redundancia (obligatoria):** todo segmento de macro lleva las **tres** codificaciones a la vez: hue + orden fijo (P→C→G siempre) + label de texto con gramos (`P 92g`). El estado over/under nunca solo por color: hue + signo (`+18`) + palabra ("meta"/"excedido") + ícono.

### 2.2 Tipografía de números

- **`tabular-nums` global** en todo dígito que cambie en vivo: centro de anillo, lecturas de gramos, totales kcal, celdas de tablas semanales del coach. Ya está bien aplicado en `MacroRingSummary` (`tabular-nums`), `NutritionDailySummary`, `KpiTile`, `NutritionTabB5`. **Falta:** auditar `MealCard` línea de macros y la tabla `logRowsDesc` de `NutritionTabB5` (ya tiene `tabular-nums` en celdas numéricas, OK). Añadir `font-variant-numeric: tabular-nums` como utilidad por defecto en `@theme` para counters.
- **Jerarquía de números (un número manda):**
  - Hero kcal (centro/título): `text-4xl font-black tracking-tight tabular-nums` (ya en `MacroRingSummary`, mantener).
  - Porcentaje secundario: `text-2xl font-black tabular-nums`.
  - Gramos en anillo de macro: `text-sm font-black tabular-nums`.
  - Label de unidad: `text-[10px] font-black uppercase tracking-widest text-muted-foreground` (consistente con el patrón ya existente).
- **Fuente:** mantener `system-ui`/Inter (ya trae `tnum` sólido). No introducir fuente nueva.

### 2.3 Spacing y touch targets

- **Targets táctiles ≥44px** en todo lo tappable. Ya correcto: botón toggle de `MealCard` (`w-11 h-11`), chevrons de `DayNavigator` (`w-11 h-11`). **A corregir:** celdas de `AdherenceStrip` (`h-2` en mobile) — el visual puede ser pequeño pero el *hit-area* debe padearse a ≥44px si se vuelven tappables (hoy son decorativas, OK mientras no reciban `onClick`). Chips de satisfacción (`flex-1 py-2`) → garantizar min-height 44.
- **Botones de porción 25/50/75/100** (`MealCard`): hoy `min-w-[2.75rem]` (44px ancho) con `py-1.5` → subir a `py-2.5` para 44px de alto.
- Ritmo vertical: `space-y-5` en shells mobile (ya en `NutritionShell`), `space-y-6`/`gap-6` en grids de coach.

### 2.4 Tokens en `@theme` Tailwind v4 + `@eva/brand-kit`

Añadir al bloque `@theme` del CSS global (web) y espejar en `@eva/brand-kit` para `apps/mobile` (NativeWind lee las mismas clases):

```css
@theme {
  /* Macros — canónicos, light */
  --color-macro-protein: #5E9FD6;
  --color-macro-carbs:   #FFB74D;
  --color-macro-fats:    #81C784;
  --color-macro-over:    #EF4444;
  --color-macro-goal:    #10B981;   /* éxito/adherencia — NUNCA un macro */
  /* Data-viz dark variants (desaturadas) */
  --color-macro-protein-dark: #7FB3E0;
  --color-macro-carbs-dark:   #FFC97A;
  --color-macro-fats-dark:    #A0D6A3;
  /* Anillos */
  --ring-track: color-mix(in srgb, currentColor 12%, transparent);
  --ring-track-strong: color-mix(in srgb, currentColor 20%, transparent);
}
```

> Hoy `ComplianceRing` ya usa `--compliance-ring-trail` / `--compliance-ring-text`; unificar todos los tracks bajo `--ring-track`. Reemplazar los hex hardcodeados (`MACRO_COLORS`, props `color="#f97316"`) por `var(--color-macro-*)`.

### 2.5 Dark mode para data-viz

- Charts (`recharts`) ya reciben `chartGridColor`/`chartAxisColor`/`tooltipBg...` por props desde el server — bien. Extender: pasar también `--color-macro-*-dark` cuando `prefers-color-scheme: dark`.
- Tracks de anillo siempre visibles con contraste ≥3:1 (WCAG 1.4.11): el `stroke-muted-foreground/25` actual de `MacroRingSummary` es borderline en dark; subir a `/30`.
- Confetti: usar partículas con los colores brand (`#10B981`, `#007AFF`) que contrastan en ambos temas.

---

## 3. Sistema de movimiento (Motion) — Catálogo reusable

Cada animación es un **token reusable**. Centralizar en `@/lib/animation-presets.ts` (ya existe `springs`, `staggerContainer`, `fadeSlideUp`, `fadeSlideLeft`, `scaleIn`). Añadir las que faltan abajo. Todo trigger tiene su rama `prefers-reduced-motion` vía `useReducedMotion()`.

**Convención de dos pistas (M3):** propiedades **espaciales** (x, y, scale, layout) → **spring**; propiedades **visuales** (opacity, color, fill) → **ease con duración**. Springs en opacity/color se ven turbios; ease en posición se ve robótico.

| # | Nombre | Trigger | Qué se mueve | Duración / spring | Librería | Reduced-motion |
|---|---|---|---|---|---|---|
| A1 | **Relleno de anillo** | Datos asientan (log nuevo / primera carga con datos reales) | `stroke-dashoffset` de full→target | 700–900ms, ease `cubic-bezier(.22,1,.36,1)` **o** spring low-bounce. *Hoy `MacroRingSummary` usa `[0.34,1.56,0.64,1]` (overshoot fuerte 1.56) → bajar a `.22,1,.36,1` o spring bounce 0.15* | `framer-motion` (`motion.circle`) o `react-circular-progressbar` + `AnimatedProgressProvider` con `pathTransition:'none'` | Set offset final instantáneo, sin sweep |
| A2 | **Count-up de número** | Mismo evento que A1, en lockstep | Entero mostrado prev→next | **Idéntico** a A1 (700ms, mismo ease). `useMotionValue`+`animate`+`useTransform(round→toLocaleString)`. `tabular-nums` obligatorio | `framer-motion` | Render valor final directo, sin tween |
| A3 | **Crecimiento de barra** | Mount / log | `width`/`scaleX` 0→pct, stagger 60–80ms | 400–600ms ease-out. *`MacroBar` ya usa `springs.lazy` + `delay: i*0.15` — el 0.15 (150ms) es un pelo lento para 3 barras; bajar a `i*0.08`* | `framer-motion` | Snap a width final, sin stagger |
| A4 | **Completar comida (check+scale+tint)** | Tap en toggle de `MealCard`/`MealCompletionRow` | checkbox scale 0.8→1.12→1 (spring `stiffness 500 damping 22`); check `pathLength` 0→1 (180ms ease-out); fila tinte verde 200ms | <250ms total, **optimista** (`useOptimistic`) | `framer-motion` (`springs.elastic` ya usado) | Sin scale/draw; check + tinte verde instantáneo (opacity 120ms) |
| A5 | **Celebración (confetti)** | **Solo** hitos raros: día completo, hito de racha, plan completado | 80–100 partículas, spread 70, dos ráfagas (55°+125°), `disableForReducedMotion:true` | one-shot | `canvas-confetti` | Sin confetti; badge de éxito fade-in 200ms + haptic si hay |
| A6 | **Skeleton shimmer** | Pantalla data-bound cargando | gradiente translateX(-100%→100%) | 1.3s **linear** loop (único uso aceptable de linear) | `tw-animate-css` / CSS | Bloque estático o pulse opacity ≤0.8Hz |
| A7 | **Transición de barras/charts** | Mount o cambio de rango (día/semana/mes) | bars crecen desde baseline; line draw | `isAnimationActive`, `animationDuration 450ms`, `ease-out`, stagger series 0/80/160ms | `recharts` | `isAnimationActive=false`, final instantáneo |
| A8 | **Transición entre días (swipe)** | Swipe o chevron en `DayNavigator` | slide+fade del contenedor de comidas, x ±24px | 200–250ms ease-out. *Hoy `NutritionShell` ya usa `fadeSlideLeft` + `AnimatePresence mode="wait"` con `[0.16,1,0.3,1]` 0.22s — bien; falta el gesto swipe real (ver §5)* | `framer-motion` `AnimatePresence` | Crossfade ≤100ms, sin x |
| A9 | **Bottom-sheet present** | Abrir food-search / equivalencias / quick-add | translateY 100%→0, spring `stiffness 320 damping 34 mass 0.9`; backdrop opacity 0→1 200ms | ~350–400ms percibido | `vaul`/`@base-ui` o `framer-motion drag` | translateY→opacity fade 200ms; sin drag |
| A10 | **Bottom-sheet velocity dismiss** | Soltar drag | `offset.y > 0.4*h` **o** `velocity.y > 800` → cerrar con inertia; si no, spring back `stiffness 500 damping 40` | gesto | `framer-motion` | Umbral → fade 200ms, sin throw |
| A11 | **Reorder/insert/exit de lista** | Alimento logueado (insert) o borrado | `AnimatePresence`: enter `{opacity:0,height:0,y:-8}`→full spring `stiffness 400 damping 30`; exit `{opacity:0,height:0}` 200ms. `layoutScroll` en el scroll container | spring | `framer-motion` | opacity-only 150ms, sin height/y |
| A12 | **Stagger inicial de lista** | Lista monta con items | parent `staggerChildren 0.035 delayChildren 0.05`; child `{opacity:0,y:12}`→full | ~250ms c/u, clamp último <400ms | `framer-motion` (`staggerContainer` ya existe) | `staggerChildren:0`, todos juntos 150ms |
| A13 | **Toast + undo** | Commit de log | nuevo item slide/fade desde arriba 180ms + highlight 1s; toast sube desde bottom-safe, 3s, auto-out | — | `sonner` + `framer-motion` | Crossfade; toast opacity sin slide |
| A14 | **Heatmap reveal stagger** | `AdherenceStrip` entra en viewport | celdas fade-in escalonadas | 40–60ms entre celdas, ≤1s total | `framer-motion` `whileInView` | Render final, sin stagger |
| A15 | **Pulse over-goal (one-shot)** | Consumido cruza la meta | cross-fade a rojo/ámbar + scale 1.05 250ms, **no loop** | 250ms | `framer-motion` | Solo cambio de color estático |
| A16 | **Micro-tap botón/toggle** | Cualquier botón primario | `whileTap scale 0.96` spring `stiffness 600 damping 30` | 80–150ms | `framer-motion` `whileTap` | Solo cambio color/opacity |
| A17 | **KPI delta count-up (coach)** | KPI strip monta | número count-up + flecha delta fade-in al final, stagger cards 40–60ms | 300–500ms | `framer-motion` | Número final directo |
| A18 | **At-risk flag pulse (coach)** | Roster carga, cliente cruza umbral | 1× pulse highlight 600ms, **no loop** | 600ms | `framer-motion` | Badge estático |
| A19 | **Period-toggle crossfade (coach)** | Cambio día/semana/mes | crossfade + leve y-shift entre datasets | 150–250ms | `framer-motion`/`recharts` | Swap instantáneo |

**Presets nuevos a agregar en `animation-presets.ts`:**
```ts
export const easings = {
  ringFill: [0.22, 1, 0.36, 1] as const,   // A1/A2 — reemplaza el 1.56 overshoot
  dirSlide: [0.16, 1, 0.3, 1] as const,    // A8 — ya usado inline
}
export const springsSheet = { enter: { type:'spring', stiffness:320, damping:34, mass:0.9 } }
export const springsRow = { type:'spring', stiffness:400, damping:30 } as const
```

---

## 4. Por superficie

### ALUMNO (PWA, mobile-first)

#### 4.1 `NutritionShell` (contenedor) — `c/[coach_slug]/nutrition/_components/NutritionShell.tsx`

**Layout desktop + responsive.** Hoy: una sola columna `max-w-lg mx-auto` dentro de `page.tsx`. **Nuevo:**
- **Mobile (base):** columna única, orden actual: banner offline → `WorkoutContextBanner` → `DayNavigator` (sticky) → `NutritionStreakBanner` → `MacroRingSummary` → comidas → `HabitsTracker` → export → `AdherenceStrip`.
- **`md:` (≥768px):** shell de 2 columnas `md:grid md:grid-cols-[1fr_20rem] md:gap-6`. Columna izquierda = comidas + hábitos; **columna derecha sticky** = `MacroRingSummary` (full, sin colapsar) + `AdherenceStrip` + streak. Esto realiza el patrón "resumen pinneado en sidebar en desktop, colapsable en mobile" de la investigación.
- **Mini-wireframe (desktop):**
```
┌───────────────────────────┬───────────────┐
│ DayNavigator (mini-week)  │  ░ STICKY ░   │
│ [Comida 1] ▸              │  Energía 1840 │
│ [Comida 2] ✓              │  (P)(C)(G)    │
│ [Comida 3] ▸              │  ───────────  │
│ HabitsTracker             │  Adherencia30 │
│ [Copiar][Copiar][PDF]     │  🔥 5 días    │
└───────────────────────────┴───────────────┘
```

**Microinteracciones / catálogo:** A8 (cambio de día, ya parcial), A4 (toggle comida), A5 (confetti día completo — ya implementado: `dayCompleteConfettiRef`, 45 partículas, 1×/fecha, respeta `reduceMotion` ✓).

**4 estados:**
- **Cargando:** `loading.tsx` con skeletons shape-matched (A6) — anillo placeholder circular + 3 cards de comida. Hoy existe `loading.tsx`; verificar que tenga formas, no spinner.
- **Vacío:** `NutritionNoPlanFromServer` (sin plan) — ya existe. Asegurar CTA "Pídele un plan a tu coach" + ilustración, no vacío frío.
- **Error:** toast `sonner` (`toast.error('Error al registrar comida')` ya presente) + refetch del día.
- **Offline:** banner ámbar `role="status"` ya implementado + cache local del read-model (`readNutritionReadModelCache`) ✓. Mantener; añadir punto "sincronizando" por item (ver A13/§5).

#### 4.2 `MacroRingSummary` — hero ring + macros

**Cambio estructural (investigación 2026):** hoy es **barra de calorías horizontal arriba + 3 anillos de macro abajo**. El patrón ganador es **un anillo hero de calorías** (no barra) con el número que manda al centro, y macros como sub-barras o 3 anillos pequeños debajo. **Decisión EVA:** conservar los 3 anillos de macro (funcionan, ya tienen ARIA), pero **promover calorías de barra a anillo hero** de 160px con el número kcal al centro número-primero.

- **Encuadre "remaining":** el centro del hero muestra **kcal restante** (`target − consumed`) como número grande cuando va bajo presupuesto; flip a `+N excedido` (rojo + `AlertTriangle` + palabra) al pasar. Línea secundaria `1840 / 2200`. Hoy muestra consumido — cambiar a restante para calorías (encuadre accionable), mantener consumido-hacia-meta para macros.
- **Construcción SVG:** dos `<circle>` (track `var(--ring-track)` + arco `stroke-dasharray=circumference`, `stroke-linecap:round`, rotado -90°). Ya está así ✓.
- **Animación:** A1 (bajar overshoot de `1.56`→`.22,1,.36,1`) + A2 (count-up acoplado, **falta hoy**: el número aparece estático mientras el anillo barre — agregar `useMotionValue` lockstep). A15 al cruzar meta.
- **ARIA:** `MacroRing` ya usa `role="img"` + `aria-label` con frase completa ✓. La barra de kcal ya es `role="progressbar"` con `aria-valuetext` ✓. Al pasar a anillo hero, mantener `role="progressbar"` + `aria-valuetext='1840 de 2200 kcal, 84 por ciento, quedan 360'`.

**Layout responsive:** mobile = hero ring grande + 3 anillos `grid-cols-3`; desktop (en sidebar) = igual pero sticky. El hero ring escala a 180px en `md:`.

**Estados:** cargando = anillo skeleton (track gris + pulse); vacío = anillo a 0% con "Aún sin registros hoy"; sin meta = `target<=0` ya manejado (`'sin meta definida'`).

#### 4.3 `MealCard` — toggle / parcial / satisfacción / swaps / chips

Componente más rico. Hoy ya tiene: toggle con `springs.elastic` + check `pathLength` (A4 ✓), expand/collapse `height auto` 0.25s, botones parcial 25/50/75/100/Plan-completo, satisfacción 1-3 emoji, swaps via `MealIngredientRow`, chips de intercambio (`exchangeContent`). `layout` prop ya presente ✓.

**Mejoras:**
- **Vibración háptica:** ya hace `navigator.vibrate(50)` en toggle ✓. Gatearlo tras `!reduceMotion` y detección coarse-pointer (no en desktop).
- **Colores de macro:** la línea `P/C/G` usa `text-orange-500 / text-blue-500 / text-yellow-500` → migrar a `text-[color:var(--color-macro-protein)]` etc. para consistencia.
- **Touch target porción:** subir `py-1.5`→`py-2.5` (44px alto).
- **Container query:** envolver en `@container` para que la card en sidebar desktop angosto renderice su variante 1-columna (la investigación insiste en `cq` sobre la card, no viewport).
- **Desktop:** en grid coach o vista alumno desktop, las cards fluyen en `grid-cols-[repeat(auto-fit,minmax(20rem,1fr))]`.

**Animaciones del catálogo:** A4 (toggle), A11 (al expandir food rows si fueran dinámicas), A16 (micro-tap en chips de porción).

**Estados:** completada = tinte `bg-emerald-500/[0.04] border-emerald-500/25` + `line-through` ✓; pending = `disabled` + opacity; sin alimentos = "Esta comida no tiene alimentos especificados" ✓; histórico = `Lock` ícono + `opacity-50` toggle ✓.

#### 4.4 `DayNavigator`

Hoy: chevron izq / fecha tappable "Volver a hoy" / chevron der, todos `w-11 h-11` ✓, `aria-label` ✓, `disabled` en día futuro ✓.

**Falta (investigación):** **swipe horizontal real** entre días (gesto natural del logging) **+ el fallback de chevrons ya existe** (WCAG 2.5.1). Hacer el header **sticky** (`sticky top-[env(safe-area-inset-top)]`) para que la fecha quede anclada al hacer scroll de comidas. Tap en fecha → calendar bottom-sheet (mobile) o popover (desktop). Desktop: mini-week strip inline (7 días visibles) ya que hay ancho.

**Animación:** A8 (slide+fade del contenido al cambiar día) + haptic tick en swipe.

**Estados:** loading = skeleton de la fecha (`animate-pulse bg-muted` ya presente ✓).

#### 4.5 `AdherenceStrip` — heatmap 30d

Hoy: grid `grid-cols-10`, color por `pct` (emerald/amber/red/muted), `role="grid"`+`gridcell` con `aria-label` por día ✓, leyenda con color+texto ✓ (cumple no-color-solo).

**Mejoras:** A14 (reveal stagger al entrar en viewport — hoy entra sin animación). Contraste del `bg-muted/60` en dark → subir. Desktop: el strip vive sticky en sidebar.

**Estados:** vacío = "Sin reg." gris ya manejado; loading = grid de skeletons.

#### 4.6 `NutritionStreakBanner` — llama, ≥2 días

Hoy: `Flame` naranja + "N días de racha" + `InfoTooltip` con fórmula + entra con `opacity/y` ✓. Solo aparece `streak >= 2` ✓.

**Mejoras (NEW grace-day streak):** introducir **día de gracia** — si la racha se rompe por *un* día, mostrar estado "racha en riesgo" (llama ámbar pulsante one-shot A18-style) en vez de reset duro, dando 1 día para recuperar. Hito de racha (7, 30) dispara A5 confetti. Animar la llama con un sutil flicker solo en hitos, no loop.

**Estados:** <2 días = no renderiza (correcto). En riesgo = variante ámbar. Loading = no aplica (deriva de adherence ya cargada).

#### 4.7 `HabitsTracker` — agua/pasos/sueño/ayuno/suplementos

Hoy: acordeón colapsable, chips de opciones (`WATER_OPTIONS`, etc.), guarda optimista por patch, solo editable `isToday`. Iconos `Droplets/Footprints/Moon/Timer/Pill`.

**Mejoras:** A16 micro-tap en cada chip; A4-light (check verde) al confirmar guardado; toast `sonner` discreto. Desktop: expandir a grid 2-col de secciones en vez de acordeón. Touch targets de chips ≥44px.

**Estados:** loading = `getDailyHabits` resuelve → skeleton de chips; histórico = read-only (`!isToday` no guarda); vacío = chips sin selección.

#### 4.8 Dashboard: `NutritionDailySummary` + `MacroBar` + `MealCompletionRow` + `ComplianceRing`

- **`NutritionDailySummary`** (RSC): card resumen con barra kcal + 3 `MacroBar` + filas de comida + CTA "Ver plan completo". **Bug de color a corregir:** `MacroBar` grasas usa `bg-emerald-500` (colisiona con éxito) → `var(--color-macro-fats)`. Proteína `bg-rose-500`→`var(--color-macro-protein)`, carbos `bg-amber-500`→`var(--color-macro-carbs)`.
- **`MacroBar`:** A3 (ya con `useInView` once + `springs.lazy`); bajar `delay` a `i*0.08`. Over-goal ya con `AlertTriangle` ✓.
- **`MealCompletionRow`:** A4 ya implementado (check `pathLength` 0.25s, optimista, `Loader2` en pending, `line-through`) ✓. Migrar el spinner pending a un "punto sincronizando" sutil para coherencia offline.
- **`ComplianceRing`:** usa `react-circular-progressbar` + `useSpring` (stiffness 60 damping 20) + estado `empty` con "Sin datos" ✓. Cumple A1. Mantener.

**Estados** (todos los del dashboard): sin plan = card `Apple` "Sin plan nutricional" ✓; sin log = "¡Registra tu primera comida!" ✓; loading = skeletons; offline = optimista + cola.

#### 4.9 NEW: Off-plan quick-add (search + recents + favorites + copy-meal)

Superficie nueva, **bottom-sheet** (mobile) / **slide-over derecho o modal** (desktop). Implementa el patrón de logging rápido sin cámara de la investigación.

- **Layout (sheet):** drag-handle → tabs `[Buscar] [Reciente] [Favoritos] [Copiar comida]`. Antes de teclear: Favoritos (scroll horizontal arriba) → "go-tos por hora" → "Recientes" (vertical). Cada fila tiene `+` que añade la **porción recordada** a un "Plate" acumulador persistente; "Registrar (N)" commitea todo en un write optimista.
- **Search-as-you-type:** debounce 200ms, grupos `Historial / Personalizado / Común`, `aria-live="polite"` con conteo de resultados.
- **Quick Add:** punch de kcal/macros sin alimento (escape hatch — mantiene la racha viva).
- **Copy-meal / copiar-ayer:** ítem de menú explícito (desktop) / swipe bajo el nombre de comida (mobile).
- **Animaciones:** A9/A10 (sheet), A13 (insert + toast undo), "add-to-plate fly" (`+` scale 1→1.15→1 + count-up del badge del Plate, 200–260ms).
- **Estados:** vacío día-uno = empty state que siembra ("Copia ayer" / favoritos sugeridos); error = item queda pending + retry; offline = cola IndexedDB (reusar `nutrition-offline-queue`).

> **Nota de scope:** EVA es plan-driven (el coach arma el plan). El off-plan quick-add es aditivo: registra consumo fuera del plan que el coach ve como contexto. Aterrizar como módulo, reusando `foods` catalog y `client_food_preferences` (favoritos ya existen: `getClientFoodFavoritesForClient`).

#### 4.10 NEW: Week view (MacroBars apilados + tendencia)

Tab/scroll separado del día. 7 barras kcal (hoy resaltado, línea de meta punteada) + 3 mini-`MacroBar` apilados por día + sparkline de tendencia. `recharts` `ComposedChart` (mismo motor que coach). A7 al montar/cambiar rango. Mobile = sin tooltips hover → valores inline como texto. Desktop = ejes + tooltips on-focus (no solo hover, WCAG 1.4.13).

---

### COACH (desktop-denso + responsive) — `coach/clients/[clientId]`

#### 4.11 Tab Nutrición consolidada (3 zonas) + `NutritionTabB5` (en split)

`NutritionTabB5` hoy es un mega-componente (1400 líneas) que mezcla todo. **Reorganizar en 3 zonas** (la investigación de dashboards clínicos: roster→cliente→detalle, inverted-pyramid):

- **Zona 1 — Progreso (hot-zone arriba-izquierda):** KPI strip de cliente (`avg kcal vs meta`, `proteína adh %`, `compliance semanal %`, `peso`) cada uno con headline + sparkline + **delta vs semana anterior** (ya hay `nutritionWeeklyAvgPct` vs `nutritionPrevWeeklyAvgPct` + `WeekIcon` TrendingUp/Down ✓). Debajo: `MacroShareRing` (×3) + `MacroRingSummary` read-only "Hoy" + `ComposedChart 7d`. A17 (KPI count-up stagger), A1 (rings).
- **Zona 2 — Plan y comidas:** card "Plan activo" (badge CUSTOM/SYNCED) + acciones (editar/ver-como-alumno/copiar) + `mealDetails` acordeón + `AdherenceStrip` 30d + heatmap fallback (`HeatmapCell`, ya con `whileHover scale 1.08`). 
- **Zona 3 — Alertas + contexto:** `NutritionCoachAlertsPanel` (auto-tag at-risk) + `NutritionCheckinContextCard` + `NutritionCycleHistorySection` + tabla "Historial de logs (30)" (ya con borde rojo en filas `<60%` ✓) + "Ver día específico" (`DayNavigator` + `NutritionDayReadOnly`).

**Period toggle (NEW):** un solo toggle `día | semana | mes` que re-escopa todos los charts (A19 crossfade). Hoy hay charts de 7d y 30d separados; unificar bajo el toggle.

**Layout responsive:** desktop = `xl:grid-cols-2` (ya usado) en charts, sidebar nav preserva ancho. Mobile (coach on-the-go) = zonas apiladas, comparación semana-vs-anterior vertical, tabla→cards.

**Estados:** sin plan = no renderiza zonas de plan; sin log hoy = "No ha registrado comidas hoy" ✓; sin logs recientes = "Sin logs recientes" ✓; loading = `isPending` con "Cargando…" pulse (mejorar a skeleton).

#### 4.12 `MacroShareRing` / `ComposedChart 7d` / `NutritionCoachAlertsPanel` / `NutritionCheckinContextCard` / `NutritionCycleHistorySection`

- **`MacroShareRing`:** `react-circular-progressbar` 72px, % kcal share. Migrar `MACRO_COLORS` a tokens canónicos (hoy prot=`#10b981` que es el verde-éxito → cambiar a `var(--color-macro-protein)`). 
- **`ComposedChart 7d`:** barras consumidas + línea meta. A7. Migrar fills a tokens. Añadir tabla/text-summary equivalente (WCAG 1.1.1): "Promedio 1.840 kcal/día, 12% bajo meta".
- **`NutritionCoachAlertsPanel`:** at-risk **nunca solo por color** — pairear con badge texto "En riesgo" + ícono (ya hay `deriveNutritionCoachAlerts`). A18 pulse one-shot al cargar.
- **Cycle history / Check-in context:** tablas con identidad congelada + sparklines inline si aplica.

#### 4.13 Dashboard coach: `KpiStrip` + `ClientStatsSheet`

- **`KpiStrip`** (`coach/dashboard`): 4 `KpiTile` (Ingresos, Alumnos, En riesgo, Adherencia con `Nutrición: N%`). A17 count-up + delta. "En riesgo" → badge + texto, no solo número rojo.
- **`ClientStatsSheet`:** bottom-sheet (mobile) / slide-over (desktop). A9/A10.

---

## 5. Responsive / PWA

### 5.1 Breakpoints — la MISMA vista
- **Switch único a 768px (`md:`).** Base = mobile/PWA, `md:`/`lg:` = desktop. Container queries (`@container`) sobre las **data cards** (`MealCard`, KPI tiles) para que sean correctas dentro de un rail angosto sin breakpoint extra.
- **Navegación:** alumno = **bottom-nav fija** en thumb-zone (Hoy / Nutrición / Entreno / Progreso) — sobrevive al chrome standalone iOS; coach = **sidebar persistente** ≥768px. Hamburguesa solo para secundarios.
- **Lista de comidas:** mobile = card-stack 1-col; desktop = `grid auto-fit minmax(20rem,1fr)`.
- **Resumen de macros:** mobile = colapsa a strip sticky fino al scrollear; desktop = pinneado full en sidebar (decisión §4.1).
- **Flujos secundarios:** mobile = bottom-sheet; desktop = slide-over/popover — **mismo contenido, contenedor distinto**.

### 5.2 Safe-area / dvh
- `viewport-fit=cover` en meta (sin esto, `env(safe-area-inset-*)`=0 e iOS letterboxea).
- Header sticky: `pt-safe` (ya en `page.tsx` header ✓). Bottom-nav: `pb-safe`. Toast/sheet: `pb-safe`.
- `min-h-dvh` en shells (ya `min-h-dvh` en `page.tsx` ✓), **nunca `h-screen`/`100vh`** fuera de `md:`.
- `overscroll-behavior-y: contain` en scroll containers (mata pull-to-refresh accidental en el diario); `overscroll-behavior:none` en root (sin rubber-band en standalone). `overflow-x: clip` en `html`.

### 5.3 Install prompt
- **Android:** capturar `beforeinstallprompt`, `preventDefault()`, stash, mostrar afordancia custom (estilo `PushNotificationBanner`, que ya existe) **solo tras momento de valor** (primer registro de comida / check-in) y solo si `display-mode: browser`. Cooldown de dismiss.
- **iOS:** sin `beforeinstallprompt` → detectar Safari + non-standalone → hint one-time "Agregar a inicio vía Compartir" con ícono share. Específico de Safari (Chrome/Edge iOS no pueden instalar).

### 5.4 Offline / sync optimista
- Log optimista (`useOptimistic`, ya en stack) + cola IndexedDB (`nutrition-offline-queue` ya existe ✓, + `OfflineNutritionQueueSync` ✓).
- **Indicador por-item "sincronizando"** (punto/reloj) en vez de spinner bloqueante. Banner offline global solo si `navigator.onLine===false` (ya implementado en `NutritionShell` ✓).
- Background Sync donde exista (Chrome/Edge/Samsung) como enhancement; fallback retry-on-reconnect (Safari/iOS no tienen Background Sync) — ya hay listeners `online`/`offline` ✓.

### 5.5 Gestos
- Todo gesto con **fallback no-gesto visible** (WCAG 2.5.1): swipe-día + chevrons; swipe-to-delete + menú `•••`. Gatear gestos en `reduce-motion` **y** coarse-pointer. Haptics solo si soportado (iOS Safari PWA parcial) y no en `reduce-motion`.

---

## 6. Accesibilidad + reduced-motion

- **Baseline WCAG 2.2 AA.**
- **Anillos:** `role="progressbar"` + `aria-valuemin/now/max` + `aria-valuetext` frase ("Proteína: 92 de 140 g, 66%") **o** `<svg role="img" aria-label>` con arcos `aria-hidden`. Nunca SVG desnudo. `MacroRing` ya usa `role="img"`+label ✓; la barra kcal ya es `progressbar` ✓.
- **Barras/charts:** región focusable, Arrow-key roving-tabindex entre puntos, focus visible ≥3:1 offset 2px, focus preservado tras sort/filter/period-switch, resultados anunciados `aria-live="polite"`. **Tabla/text-summary equivalente para cada chart no trivial** (la tabla "Historial de logs" ya cumple para los charts del coach).
- **Color:** nunca único canal. Cada macro = hue + posición + label+gramos; over/under = hue + signo + palabra + ícono. Paleta pasada por simulador CVD.
- **Contraste:** números/labels ≥4.5:1; arcos/barras/líneas/markers/ejes/focus ≥3:1 vs adyacente. Subir tracks `/25`→`/30` en dark.
- **Touch:** AA mínimo 24×24; target 44×44 en primarios (toggle, period toggle, chevrons, hit-area de anillo padeada). 
- **Dynamic Type / reflow:** layout sobrevive 200% zoom y font system grande sin clipping ni scroll horizontal — `rem`/`dvh`, `tabular-nums`, labels que envuelven, no números horneados en `<text>` SVG de tamaño fijo.
- **Reduced-motion (opt-in, fail-safe):** estilos base SIN animación, sweep solo dentro de `@media (prefers-reduced-motion: no-preference)`. `useReducedMotion()` para ramificar variantes (ya usado en `NutritionShell`, `MacroRingSummary`, `MealCard`, `HabitsTracker`, `NutritionTabB5`, `ComplianceRing` ✓). `disableForReducedMotion:true` en confetti (ya gateado por `!reduceMotion` ✓). Reduced = valor final instantáneo, solo progress-indicators / fades ≤200ms; cero parallax/zoom/loop/confetti. El check, tinte verde y valor final SIEMPRE presentes estáticamente y en el accessible name. Achievements anunciados `aria-live="polite"`.
- **No bloquear interacción:** el check-pop optimista no debe retrasar el handler real.

---

## 7. Tabla "Viejo → Nuevo"

| Componente (ruta) | Visual: cambia | Motion: cambia |
|---|---|---|
| **`NutritionShell`** | 1-col → shell `md:grid-cols-[1fr_20rem]` con resumen sticky en sidebar desktop. Header sticky. | Swipe real entre días (A8 + haptic), conservando chevrons. Confetti día-completo ya OK. |
| **`MacroRingSummary`** | Barra kcal → **anillo hero 160px** número-primero, encuadre **"restante"** + flip "+N excedido". 3 anillos macro a tokens canónicos. | Count-up acoplado al anillo (A2, **falta hoy**). Bajar overshoot `1.56`→`.22,1,.36,1`. A15 al cruzar meta. |
| **`MealCard`** | Línea P/C/G y todos los colores → `var(--color-macro-*)`. Porción `py-1.5`→`py-2.5` (44px). `@container`. | A4 ya OK; háptico gateado por coarse-pointer + `!reduceMotion`. |
| **`DayNavigator`** | Sticky `top-safe`; desktop mini-week strip; tap → calendar sheet/popover. | **Swipe horizontal** (A8) + haptic tick. Fallback chevrons ya existe. |
| **`AdherenceStrip`** | `bg-muted/60` más contrastado en dark; sticky en sidebar desktop. | A14 reveal stagger al entrar en viewport (hoy sin animación). |
| **`NutritionStreakBanner`** | NEW **grace-day** (racha en riesgo ámbar en vez de reset). | Flicker de llama solo en hitos; A5 confetti en racha 7/30. |
| **`HabitsTracker`** | Acordeón → grid 2-col secciones en desktop; chips ≥44px; tokens. | A16 micro-tap por chip; A4-light al guardar. |
| **`NutritionDailySummary`** | **Fix color:** grasas `bg-emerald-500`→`var(--color-macro-fats)` (colisión éxito), prot/carb a tokens. | — (A3 vive en `MacroBar`). |
| **`MacroBar`** | Colores a tokens. | A3 `delay i*0.15`→`i*0.08`. Over-goal `AlertTriangle` ya OK. |
| **`ComplianceRing`** | Unificar track bajo `--ring-track`. | Ya cumple A1 (`useSpring` 60/20) + estado `empty`. Mantener. |
| **`NutritionTabB5`** | Split en 3 zonas (Progreso / Plan / Alertas). Period toggle único día/sem/mes. `MACRO_COLORS` a tokens (prot deja de ser `#10b981`). Text-summary bajo charts. | A17 KPI count-up stagger, A18 at-risk pulse, A19 period crossfade, A7 charts. |
| **`AdherenceStrip` (coach)** | Reusa el de alumno; leyenda contraste dark. | A14. |
| **`ComposedChart` (coach)** | Fills a tokens; tabla equivalente. | A7 (`isAnimationActive`, 450ms, stagger series). |
| **`KpiStrip` (coach)** | "En riesgo" = badge+texto, no solo número rojo. | A17 count-up + delta fade-in stagger 40–60ms. |

---

## 8. Checklist de implementación por fases

**Fase 0 — Tokens + primitivas + motion base** *(desbloquea todo, sin cambio visible de feature)*
- [ ] Agregar `--color-macro-*` (+ `-dark`) y `--ring-track` a `@theme` global y `@eva/brand-kit`.
- [ ] Reemplazar TODOS los hex/clases de macro hardcodeados por tokens (`MacroRingSummary`, `MealCard`, `NutritionDailySummary`, `MacroBar`, `NutritionTabB5.MACRO_COLORS`, `MacroShareRing`). **Fix crítico:** grasas fuera de emerald; proteína coach fuera de `#10b981`.
- [ ] Ampliar `animation-presets.ts`: `easings.ringFill/dirSlide`, `springsSheet`, `springsRow`. Bajar overshoot del anillo.
- [ ] Construir primitivas compartidas: `AdherenceRing`, `MacroBars`, `MacroRings`, `MealAdherenceList`, `ConsumedVsTarget`, `NutritionProgressZone` (extraídas de `NutritionTabB5`, reusables alumno+coach).
- [ ] Auditar `tabular-nums` faltantes; subir tracks dark `/25`→`/30`.

**Fase 1 — Logging UX + estados**
- [ ] Count-up acoplado en `MacroRingSummary` (A2).
- [ ] Swipe real en `DayNavigator` (A8) + header sticky + fallback chevrons.
- [ ] A14 reveal stagger en `AdherenceStrip`.
- [ ] Touch targets ≥44px (porción, chips hábitos, satisfacción).
- [ ] 4 estados completos (skeletons shape-matched A6 en `loading.tsx`, vacío sembrado, error toast, offline indicador por-item) en cada superficie alumno.
- [ ] Indicador "sincronizando" por-item (reemplaza spinner en `MealCompletionRow`).

**Fase 2 — Pro (features nuevas)**
- [ ] Off-plan quick-add (sheet/slide-over): search-debounce + favorites/recents/go-tos + Plate acumulador + Quick Add + copy-meal/copiar-ayer (A9/A10/A13 + add-to-plate fly).
- [ ] Week view alumno (7 barras + sparkline + meta punteada, A7).
- [ ] Grace-day streak en `NutritionStreakBanner`.
- [ ] Coach: split `NutritionTabB5` en 3 zonas + period toggle día/sem/mes (A19) + KPI count-up (A17) + at-risk pulse (A18) + text-summary bajo charts.
- [ ] Shell `md:grid` 2-col con resumen sticky (alumno desktop).

**Fase 3 — Pulido / paridad mobile (`apps/mobile`)**
- [ ] Espejar tokens en NativeWind; A1/A2/A4 con Moti+Reanimated (`withTiming`/`withSpring`), A9/A10 con react-modal-sheet o gesture-handler.
- [ ] `prefers-reduced-motion` + reduce-haptics OS en RN; confetti `disableForReducedMotion`.
- [ ] Install prompt: Android `beforeinstallprompt` diferido post-valor; iOS hint Safari A2HS.
- [ ] safe-area/dvh/overscroll discipline en todos los sticky/bottom-nav nuevos.
- [ ] Pase final CVD simulator + NVDA/VoiceOver en anillos y charts; verificar 200% zoom / Dynamic Type.

---

### Fuentes clave citadas inline
- Apple HIG Activity Rings + react-activity-rings (construcción `stroke-dashoffset`, VoiceOver `role=progressbar`).
- MacroFactor / MyFitnessPal / Cronometer (quick-add, favorites/recents, copy-meal, Plate multi-add, remaining vs consumed).
- Material Design 3 Expressive (spring espacial vs ease visual; bottom-sheets).
- `canvas-confetti` (catdad) — "use sparingly", `disableForReducedMotion`.
- `react-circular-progressbar` (kevinsqi) — `AnimatedProgressProvider`, `pathTransition:'none'`.
- Wong/Okabe-Ito + Tableau colorblind-safe (azul+ámbar par más seguro; evitar rojo-verde adyacente).
- WCAG 2.2 AA: 1.4.1, 1.4.3, 1.4.11, 1.4.13, 2.3.3, 2.5.1, 2.5.8, 2.4.11.
- Trainerize/Everfit (compliance compuesta all-or-nothing, auto-tag at-risk, roster→cliente→detalle).
- firt.dev PWA tips + web.dev customize-install (viewport-fit=cover, deferred install).

---

**Archivos reales mapeados (rutas absolutas para el ingeniero):**
- Alumno: `apps/web/src/app/c/[coach_slug]/nutrition/_components/{NutritionShell,MacroRingSummary,MealCard,DayNavigator,AdherenceStrip,NutritionStreakBanner,HabitsTracker,MealIngredientRow,ExchangeMealChips,ExchangeEquivalencesSheet}.tsx` + `page.tsx` + `loading.tsx`
- Dashboard alumno: `apps/web/src/app/c/[coach_slug]/dashboard/_components/nutrition/{NutritionDailySummary,MacroBar,MealCompletionRow}.tsx` + `compliance/ComplianceRing.tsx`
- Coach: `apps/web/src/app/coach/clients/[clientId]/{NutritionTabB5,NutritionCoachAlertsPanel,NutritionCheckinContextCard,NutritionCycleHistorySection}.tsx` + `apps/web/src/app/coach/dashboard/_components/kpi/{KpiStrip,KpiTile}.tsx` + `sheets/ClientStatsSheet.tsx`
- Motion/tokens: `apps/web/src/lib/animation-presets.ts` (+ `@theme` en el CSS global) y `@eva/brand-kit` para `apps/mobile`.