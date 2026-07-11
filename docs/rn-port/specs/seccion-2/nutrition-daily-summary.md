# Spec §12 — Nutrición de hoy (widget dashboard)

**key:** `nutrition-daily-summary`
**Unidad:** SOLO el widget del home del alumno (NO la tab `nutricion.tsx`).

## Fuentes de verdad (web)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/nutrition/NutritionDailySummary.tsx` (Server Component, líneas 19-196)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/nutrition/MacroBar.tsx` (Client, líneas 1-43)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/nutrition/MealCompletionRow.tsx` (Client, líneas 1-125)
- Queries: `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:243-279` y `_data/heroComplianceBundle.ts:276-300`

## Contraparte RN
- `apps/mobile/components/alumno/home/NutritionDailySummary.tsx:1-176`
- Montaje/gate: `apps/mobile/app/alumno/(tabs)/home.tsx:399-404` (gate `data?.client && nutritionEnabled`)

---

## 1. Gate del dominio (montaje)

- **Web** `NutritionDailySummary.tsx:22-23`: `getDashboardNutritionDomainEnabled(userId)`; si `false` → `return null` (el widget entero desaparece, no esqueleto — evita el pitfall NN/g). La query real (`heroComplianceBundle.ts:278-289`) lee `clients.coach_id/team_id/org_id` y resuelve via `resolveNutritionDomainEnabled`.
- **RN** `home.tsx:57` `const { nutritionEnabled } = useEntitlements()`; `home.tsx:399` `{data?.client && nutritionEnabled ? (...) : null}`. El propio componente NO re-chequea el gate (comentario RN líneas 26-28 lo confirma: "el shell no la monta si nutrition esta OFF"). **Paridad correcta** (adaptación: RN usa entitlements client-side en vez de query server; el efecto visible es idéntico — sin gate, sin widget).
- **cambiosShell:** ninguno para el gate; `home.tsx` no es archivo de esta unidad pero ya está correcto.

---

## 2. Layout y jerarquía (contenedor)

Orden vertical dentro de un `Card padding="md"` con `gap-4` (web `:141`) / `gap:16` (RN `:104`):
1. Header row (icono + plan + "Ver todo →")
2. Aviso condicional "¡Registra tu primera comida…"
3. Hero kcal row (número grande + /target + badge restantes)
4. 3× MacroBar (Proteína, Carbos, Grasas)
5. Lista de comidas del día (filas con check)
6. CTA "Ver plan completo con macros →"

**GOTCHA de gap (Ola 0 P?, líneas 2837-2841):** web separa las 3 barras con `space-y-2` = **8px** entre barras (`MacroBar.tsx` no aporta gap externo; el wrapper `NutritionDailySummary.tsx` las lista como hijos directos del Card `gap-4`=16px, PERO cada `MacroBar` tiene `space-y-1`=4px interno). En RN las barras heredan el `gap:16` del Card (`:104`, `:134`) → 16px entre barras vs el espaciado web. Ver §7.

---

## 3. Header row

**Web `:142-155`** / **RN `:105-118`**:
- Row: `flex items-center justify-between gap-2` / `flexDirection:row, alignItems:center, justifyContent:space-between, gap:8`.
- Izquierda: `flex min-w-0 items-center gap-2` / `flexShrink:1, minWidth:0, gap:8`.
  - Badge de icono cuadrado: web `h-9 w-9 rounded-control bg-ember-100 text-ember-700` con `<Apple className="h-[18px] w-[18px]" />` (`:144-146`). RN `width:36,height:36,borderRadius:10, backgroundColor: EMBER_500+'1A'` con `<Apple size={18} color={EMBER_500} strokeWidth={2.25} />` (`:107-109`). `EMBER_500='#FF6A3D'` (`types.ts:101`). **Adaptación:** web usa `ember-100`/`ember-700` (par de tokens claro/oscuro); RN usa `EMBER_500` con alpha `1A` (~10%) de fondo y ember sólido de icono. `rounded-control`=10 confirmado por radio RN 10.
  - Texto: `plan.name` en `truncate text-sm font-bold text-strong` (`:148`) / `numberOfLines={1}, fontSize:14, text-strong font-sans-bold` (`:111`). Debajo: label **"Hoy"** `text-[10px] font-bold uppercase tracking-wide text-subtle` (`:149`) / `FONT.uiBold, fontSize:10, uppercase, letterSpacing:0.6, text-subtle` (`:112`). Copy VERBATIM: "Hoy".
- Derecha: link **"Ver todo →"** `shrink-0 text-[11px] font-bold text-sport-600`, `href={base}/nutrition` (`:152-154`). RN: `TouchableOpacity testID="nutrition-see-all" onPress={onSeeAll} activeOpacity={0.7}` con `Text text-sport-600 FONT.uiBold fontSize:11` "Ver todo →" (`:115-117`). Copy VERBATIM: "Ver todo →".

**Handler "Ver todo →":** Web navega a `${base}/nutrition` (`getClientBasePath(coachSlug)` + `/nutrition`). RN llama `onSeeAll` que en `home.tsx:402` es `() => router.push('/alumno/nutricion')`. **Paridad correcta** (navega a la sección nutrición del alumno).

---

## 4. Aviso "primera comida" (estado sin log)

- **Web `:156-158`:** `{!dailyLog && totalMeals > 0 ? <p className="text-xs text-muted">¡Registra tu primera comida desde nutrición!</p> : null}`.
- **RN `:120-122`:** `{!data.hasLog && data.meals.length > 0 ? <Text className="text-muted font-sans" style={{fontSize:12}}>¡Registra tu primera comida desde nutrición!</Text> : null}`. Copy VERBATIM. `hasLog` = `!!logData` (`:88`); `totalMeals`/`meals.length` = comidas que aplican hoy. **Paridad correcta.**

---

## 5. Hero kcal

**Web `:160-170`** / **RN `:124-132`**:
- Row `flex items-center justify-between gap-2` / `flexDirection:row, justifyContent:space-between, gap:8`.
- Número consumido: `font-display text-[27px] font-black leading-none tabular-nums text-strong` con `consumedCal.toLocaleString('es-CL')` (`:162-164`). RN: `FONT.displayBlack, fontSize:27, fontVariant:['tabular-nums'], text-strong`, `data.consumedCal.toLocaleString('es-CL')` (`:126`). **Paridad correcta** (formato es-CL con separador de miles).
- "/ {target} kcal": `text-[13px] text-muted` (`:165`) / `fontSize:13, text-muted font-sans` (`:127`). `tCal.toLocaleString('es-CL')`.
- Badge restantes: `<Badge tone="ember" icon={<Flame />}>{Math.max(0, tCal - consumedCal).toLocaleString('es-CL')} restantes</Badge>` (`:167-169`). RN: `<Badge tone="ember" icon={<Flame size={12} color={EMBER_500} strokeWidth={2.5} />}>{Math.max(0, data.targetCal - data.consumedCal).toLocaleString('es-CL')} restantes</Badge>` (`:129-131`). Copy VERBATIM: "restantes". **Paridad correcta** (clamp a 0, formato es-CL).

---

## 6. MacroBar (×3: Proteína, Carbos, Grasas)

**Web** monta 3 `<MacroBar>` (`NutritionDailySummary.tsx:171-173`):
- `label="Proteína" ... colorClass="bg-[color:var(--color-macro-protein)]" delayIndex={0}`
- `label="Carbos" ... colorClass="bg-[color:var(--color-macro-carbs)]" delayIndex={1}`
- `label="Grasas" ... colorClass="bg-[color:var(--color-macro-fats)]" delayIndex={2}`
- Todas `unit="g"`.

**Componente web `MacroBar.tsx`:**
- `pct = target>0 ? Math.min(100, (consumed/target)*100) : 0` (`:20`).
- `over = target>0 && consumed>target` (`:21`).
- Fila label/valor: `flex justify-between text-[11px] font-semibold text-muted` (`:25`); label a la izq; valor `tabular-nums text-body` = `Math.round(consumed)/Math.round(target)` + `unit` (`:27-29`).
- Si `over`: `<AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--danger-500)]" />` junto al valor (`:30`).
- Track: `h-2 overflow-hidden rounded-pill bg-[var(--track)]` (`:33`).
- Fill: `motion.div` `h-full rounded-pill`; color `over ? bg-[var(--danger-500)] : colorClass` (`:35`). Animación: `initial width 0%` → `animate width ${pct}%` cuando `inView` (`useInView once, margin -10%`, `:19,37`); `transition={{ ...springs.lazy, delay: delayIndex*0.08 }}` (`:38`).

**RN `MacroBar` local `:162-175`:**
- Recibe `{label, value, target, color}` (sin `unit`, sin `delayIndex`).
- `pct = target>0 ? Math.min(100, (value/target)*100) : 0` (`:163`). **Paridad de fórmula correcta.**
- Fila: `flexDirection:row, justifyContent:space-between`; label `text-muted FONT.uiSemibold fontSize:11` (`:167`); valor `text-strong FONT.uiSemibold fontSize:11 tabular-nums` = `Math.round(value)/Math.round(target)g` (`:168`).
- Track: `bg-surface-sunken, height:8, borderRadius:999, overflow:hidden` (`:170`).
- Fill: `View height:8, borderRadius:999, width:${pct}%, backgroundColor:color` (`:171`). **Estático, sin animación.**
- Colores RN via `MACRO_COLORS` (`MacroRingSummary.tsx:12`): protein `#FF6A3D`, carbs `#126BE1`, fats `#18ABD4` (`NutritionDailySummary.tsx:82-84`).

**Divergencias RN vs web (ver §7 y Ola 0):**
- (a) Sin estado `over`: RN no calcula `over`, no muestra AlertTriangle, y el fill siempre usa `color` con `pct` clamp a 100 → una macro excedida se ve idéntica a una al 100%. (Ola 0 líneas 2803-2806.)
- (b) Sin animación de reveal del width. (Ola 0 líneas 2810-2813.)
- (c) `MACRO_COLORS.carbs='#126BE1'` NO es sport-500 (`#2680FF`). (Ola 0 líneas 2797-2799.)
- (d) Track: web `bg-[var(--track)]`; RN `bg-surface-sunken` (token distinto; `ring-track` no existe en mobile). (Ola 0 líneas 2824-2825.)
- (e) Tipografía del valor: web `text-body` 11px semibold; RN `text-strong` 11px semibold. (Web widget dashboard usa `text-body`; RN usa `text-strong`.)
- (f) Sin a11y `progressbar`. (Ola 0 líneas 2817-2820.)

> **NOTA de alcance de tokens:** los tokens `--color-macro-*` NO existen en el contrato mobile (`global.css`/`tailwind.config.js` gobernados aparte; PROHIBIDO tocar por regla 4). El fix de color canónico requiere añadir tokens macro al contrato — **fuera de esta unidad**, reportar en cambiosShell, no editar aquí.

---

## 7. Lista de comidas (filas de completado)

**Web** `NutritionDailySummary.tsx:174-187`: `<div className="space-y-2">` con `mealsToday.map` → `<MealCompletionRow>` por comida, props `mealId, name, completed=!!doneByMeal.get(m.id), clientId, planId, dailyLogId, coachSlug`.

**Componente web `MealCompletionRow.tsx` (INTERACTIVO — toggle real):**
- Es un `<button>` con `useOptimistic` + `useTransition` (`:37-38`).
- `onClick={onToggle}` (`:96`): `next=!optimistic`; `setOptimistic(next)`; llama `toggleMealCompletion(clientId, planId, mealId, next, dailyLogId, coachSlug, targetDate)` (server action, `:46-54`).
  - Si `!res.success` → `toast.error('No se pudo registrar la comida')` (`:56`).
  - Éxito → `trackNutritionEvent('nutrition_meal_toggled', {source:'dashboard', completed, date_is_today:1})` + `router.refresh()` (`:59-67`).
  - Catch offline (`isLikelyOfflineError`) → `enqueueNutritionOfflineToggle(...)` + `trackNutritionEvent('nutrition_meal_toggle_queued',...)` + `toast('Sin conexión — se sincronizará al volver la señal', {icon:'📶'})` (`:69-83`).
  - Otro error → `console.error` + `toast.error('Error al registrar comida')` (`:85-86`).
- Estilos: `flex w-full items-center gap-3 rounded-control border border-subtle bg-surface-card px-3 py-2 text-left transition-colors hover:bg-surface-sunken`, `pending && opacity-60` (`:97-100`).
- Checkbox: `h-8 w-8 rounded-control border-[1.5px]`; `optimistic ? border-transparent bg-[var(--success-500)] text-white : border-strong bg-surface-sunken` (`:102-106`). Si `pending` → `<Loader2 animate-spin>`; si no → SVG check con animación `pathLength` (`:108-120`).
- Nombre: `min-w-0 flex-1 text-sm font-semibold`; `optimistic ? text-subtle line-through : text-strong` (`:122`).

**RN `NutritionDailySummary.tsx:136-148` (READ-ONLY):**
- `<View gap:8>` con `data.meals.map`.
- Cada fila es `<TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={{flexDirection:row, alignItems:center, gap:10}}>` (`:140`) — **NO togglea, navega a nutrición.**
- Checkbox: `width:24,height:24,borderRadius:12` (círculo); `done ? backgroundColor:EMBER_500, borderWidth:0 : transparent, borderWidth:1.5, borderColor:theme.border` (`:141`); si `done` → `<Check size={14} color="#fff" strokeWidth={3} />` (`:142`).
- Nombre: `numberOfLines={1}, flex:1, FONT.uiSemibold, fontSize:13.5`; `done ? text-muted : text-strong` (`:144`). **Sin line-through.**

**DESVIACIÓN documentada (RN líneas 29-31):** RN hace las filas read-only; el toggle optimista + cola offline vive en la pantalla de Nutrición (`/alumno/nutricion`). Esto es una **pérdida de funcionalidad interactiva vs web** (regla 2 — anotado explícitamente): en web puedes marcar una comida como completada DESDE el widget del dashboard; en RN no. Además diferencias visuales del checkbox: web cuadrado `rounded-control` verde `success-500`; RN círculo `borderRadius:12` naranja `EMBER_500`. Web usa check SVG animado + Loader2 en pending; RN check estático sin pending. Web tacha el nombre (`line-through`) al completar; RN solo cambia color a muted.

> **Decisión de port (recomendación):** para paridad idiomática RN puede: (opción A, mínima) mantener read-only pero corregir el look del checkbox (cuadrado, `success-500`, line-through) para igualar la semántica visual web; (opción B, paridad plena) portar el toggle optimista con `toggleMealCompletion` + cola offline. **Ambas tocan endpoint/server-action → aplica regla 8 (fallback local fail-invisible: si `toggleMealCompletion` no existe en la rama, la fila debe no romper, solo navegar).** Esta spec documenta la conducta web exacta para habilitar la opción B; la decisión final es del jefe.

---

## 8. CTA final "Ver plan completo con macros →"

- **Web `:188-193`:** `<Link href={base}/nutrition className="animate-pulse-cta block rounded-control bg-ember-100 px-4 py-2.5 text-center text-xs font-bold text-ember-700 ring-1 ring-ember-500/40 transition-colors hover:bg-ember-200">Ver plan completo con macros →</Link>`.
- **RN `:150-157`:** `<TouchableOpacity onPress={onSeeAll} activeOpacity={0.82} className="rounded-control" style={{paddingHorizontal:16, paddingVertical:10, alignItems:center, borderWidth:1, borderColor:EMBER_500+'55', backgroundColor:EMBER_500+'1A'}}><Text FONT.uiBold fontSize:12 color:EMBER_500>Ver plan completo con macros →</Text></TouchableOpacity>`.
- Copy VERBATIM: "Ver plan completo con macros →". Navega a nutrición (`onSeeAll`). **Paridad correcta** en función/copy. **Divergencia:** web tiene `animate-pulse-cta` (pulso de atención) que RN no reproduce; RN usa `EMBER_500` con alpha (`1A` fondo, `55` borde) vs web `ember-100`/`ember-700`/`ring-ember-500/40`. `px-4 py-2.5`=16/10px coincide con RN.

---

## 9. Estado sin plan (empty)

- **Web `:29-37`:** si `!plan` → `<Card padding="lg" className="text-center">` con `<Apple className="mx-auto h-10 w-10 text-muted" />`, `<p className="font-bold text-strong">Sin plan nutricional</p>`, `<p className="-mt-2 text-xs text-muted">Pídele un plan a tu coach</p>`.
- **RN `:92-100`:** si `noPlan` → `<Card padding="lg" style={{alignItems:center}}>` con `<Apple size={40} color={theme.mutedForeground} strokeWidth={1.75} />`, `Text fontSize:14 marginTop:8 text-strong "Sin plan nutricional"`, `Text fontSize:12 marginTop:2 text-muted "Pídele un plan a tu coach"`. Copy VERBATIM en ambas líneas. **Paridad correcta** (Apple 40px=h-10w-10, centrado, textos idénticos).

---

## 10. Estado de carga

- **Web:** Server Component; no hay skeleton propio — se resuelve en el server antes de renderizar (Suspense del padre si aplica).
- **RN `:35,101`:** `data===null && !noPlan` → `return null` (nada, sin skeleton). Carga via `useEffect(load, [clientId])` (`:38-40`). **Adaptación idiomática aceptada** (RN carga client-side; el widget aparece cuando `data` está listo). No hay estado de error explícito en RN (`load` no maneja catch — divergencia menor, ver §11).

---

## 11. Datos / queries

**Web** (server, `dashboard.queries.ts`):
- `getActiveNutritionPlan(clientId)` (`:243-252`): `nutrition_plans` select `id,name,daily_calories,protein_g,carbs_g,fats_g` where `client_id=clientId AND is_active=true` `.maybeSingle()`.
- `getTodayNutritionBundle(clientId, planId, today)` (`:254-279`): en paralelo —
  - `daily_nutrition_logs` select `id, log_date, target_*_at_log, nutrition_meal_logs(id,is_completed,meal_id,consumed_quantity), nutrition_meal_food_swaps(meal_id,original_food_id,swapped_food_id,swapped_quantity,swapped_unit)` where `client_id, plan_id, log_date=today` `.maybeSingle()`.
  - `nutrition_meals` select `id,name,order_index,day_of_week, food_items(id,quantity,unit,swap_options, foods(id,name,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit))` where `plan_id` order `order_index asc`.
- Filtro del día: `nutritionMealAppliesOnIsoYmdInSantiago(m, today)` (`:64`).
- Cálculo consumido: `normalizeMealForMacros` → `applyMealFoodSwaps` (aplica swaps de comida) → `portionPctMapFromMealLogs` → `calculateConsumedMacrosWithCompletionFallback(mealsForMacros, completedIds, goals, portionMap)` (`:79-134`). `consumedCal=Math.round(realConsumed.calories)` (`:135`).

**RN** (client, `NutritionDailySummary.tsx:42-90`):
- `nutrition_plans` select `id,name,daily_calories,protein_g,carbs_g,fats_g, nutrition_meals(id,name,order_index,day_of_week, nutrition_meal_food_items:food_items(id,quantity,unit,swap_options, foods(...)))` where `client_id, is_active=true` `.maybeSingle()` (`:44-54`). **Un solo query anidado** en vez de plan+bundle separados.
- `daily_nutrition_logs` select `id, nutrition_meal_logs(meal_id,is_completed,consumed_quantity)` where `client_id, plan_id, log_date=todayIso` `.maybeSingle()` (`:60-66`).
- Filtro del día: `nutritionMealApplies(m, todayIso)` (`:58`).
- Cálculo: `normalizeMealForMacros({id, day_of_week, food_items})` → `calculateConsumedMacrosWithCompletionFallback(normalized, completed, goals)` (`:71-75`).

**DIVERGENCIA de datos (regla 1, citada):** RN **NO aplica swaps de comida** — no lee `nutrition_meal_food_swaps` ni llama `applyMealFoodSwaps`, y **NO pasa `portionMap`** (`portionPctMapFromMealLogs`) al cálculo. Web sí (`:79-134`). Efecto: si el alumno cambió un alimento (swap) o registró una porción parcial, los macros/kcal consumidos del widget RN divergen de web. `nutrition-utils` es motor compartido (`@eva/nutrition-engine`), así que la fórmula base coincide; la divergencia viene de los inputs omitidos en RN. **Anotar como gap de paridad de datos.**

---

## 12. Animaciones / transiciones

- Web: MacroBar fill anima con `springs.lazy` + stagger `delayIndex*0.08` gateado por `useInView` (`MacroBar.tsx:37-38`). MealCompletionRow: check SVG `pathLength` 0.25s easeOut (`:110-118`); `transition-colors` hover. CTA `animate-pulse-cta`.
- RN: **ninguna** de estas animaciones (barras estáticas, check estático, sin pulse). Ver §6(b), §7, §8. (Ola 0 líneas 2810-2813 lista la del MacroBar como P? de animación.)

---

## 13. Accesibilidad

- Web MacroBar del **widget dashboard** (`MacroBar.tsx`) NO tiene `role=progressbar` (a diferencia del componente compartido `components/nutrition/MacroBars.tsx` que sí, ver Ola 0). El texto label+valor es leído directamente.
- RN: `testID="nutrition-see-all"` en el link "Ver todo →" (`:115`). Sin `accessibilityRole="progressbar"` en las barras (Ola 0 líneas 2817-2820). Filas de comida sin label descriptivo de estado completado.

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Grep por `alumno/home/NutritionDailySummary.tsx` = **29 hits**. Los relevantes a ESTA unidad (widget), citados por línea del JSON:

- **2788-2792 (MacroBars en superficie coach):** contexto — señala que la ÚNICA implementación de barra de macro mobile es la local en `alumno/home/NutritionDailySummary.tsx:162-175`; no existe componente compartido `MacroBars` en mobile (grep 0 hits). fixHint: extraer compartido `apps/mobile/components/nutrition/MacroBars.tsx`. → **cambiosShell** (crear primitivo compartido, fuera de esta unidad).
- **2797-2799 (MACRO_COLORS.carbs):** `#126BE1` hardcodeado ≠ sport-500 `#2680FF`; consumido por `NutritionDailySummary.tsx:83`. fixHint: corregir en `MacroRingSummary.tsx:12` (archivo compartido → cambiosShell).
- **2803-2806 (estado `over` ausente):** RN MacroBar no calcula `over`, no muestra AlertTriangle, fill siempre `color`; macro excedida se ve como 100%. Conducta web exacta: `MacroBar.tsx:21,30,35`.
- **2810-2813 (animación ausente):** RN fill estático sin reveal. Web `MacroBar.tsx:37-38` spring + stagger.
- **2817-2820 (a11y progressbar ausente):** RN barras sin `accessibilityRole/Value/Label`.
- **2824-2825 (token track):** RN `bg-surface-sunken` vs web `--track`/`--ring-track-strong`; `ring-track` no existe en mobile.
- **2831-2834 (tipografía valor):** RN valor `text-strong` 11px semibold vs web widget `text-body`/`text-muted`.
- **2837-2841 (gap entre barras):** RN 16px (hereda `gap:16` del Card) vs web 8px (`space-y-2`).
- **2844 (nota de mapeo):** confirma que `alumno/home/NutritionDailySummary.tsx:162-175` es "la contraparte más cercana" a `MacroBars.tsx` y se comparó elemento a elemento; enumera coincidencias verificadas (labels default, clamp pct 100, formato `{round(v)}/{round(t)}g` tabular, track 8px, colores protein/fats).
- **4358-4360 / 4489 / 4495-4496 (MACRO_COLORS global):** paleta RN naranja/azul/cian ≠ web; raíz en `MacroRingSummary.tsx:12`; corregir coordinado con el token-contract (cambiosShell).

**Nombres del inventario buscados** ("NutritionDailySummary (widget dashboard)", "MacroBars", "MacroRingSummary"): confirmados como los elementos cuyos webEvidence apuntan a este RN file; los P? de macro-bar (over/anim/a11y/token/gap/tipografía) son la carga principal de esta unidad.

---

## Estado RN actual — divergencias más obvias (citadas)

1. **Filas de comida read-only** (`RN :140` `onPress={onSeeAll}`) — pérdida vs toggle interactivo web (`MealCompletionRow.tsx`). Regla 2: anotado. Ver §7.
2. **Sin swaps ni portionMap en el cálculo** (`RN :71-75` vs web `:79-134`) — divergencia de macros consumidos. Ver §11.
3. **MacroBar sin estado `over`, sin animación, sin a11y** (`RN :162-175`). Ver §6, §12, §13.
4. **Colores macro hardcodeados** `MACRO_COLORS` (`MacroRingSummary.tsx:12`), carbs `#126BE1`≠sport-500 (cambiosShell).
5. **Gap 16px entre barras** vs 8px web (`RN :104,134`).
6. **Checkbox de comida**: círculo naranja `EMBER_500` (`RN :141`) vs cuadrado `rounded-control` verde `success-500` web; sin line-through en el nombre.
7. **CTA sin `animate-pulse-cta`** (`RN :150-157`).
8. **Sin manejo de error de carga** en `load()` (`RN :42-90`) — web resuelve en server.

## P0 QA asignado
No hay P0 QA específico marcado para esta unidad en las notas de inventario. Los hallazgos macro (over/anim/color/gap/a11y/tipografía) son P?/P1 de refinamiento. La conducta web exacta que los resolvería está documentada en §6, §7, §11, §12, §13 con citas archivo:línea.

## cambiosShell (cambios necesarios fuera de esta unidad — NO tocados)
- `apps/mobile/components/MacroRingSummary.tsx:12` — `MACRO_COLORS.carbs` `#126BE1`→ sport-500 `#2680FF` (o derivar de token). Afecta múltiples superficies; coordinar con token-contract.
- `apps/mobile/global.css` / `tailwind.config.js` — añadir tokens `--color-macro-*` y `--color-macro-over` (para estado `over`) — gobernados aparte (regla 4), reportar al jefe.
- (Opción B §7) server-action/endpoint `toggleMealCompletion` + cola offline para RN — cross-unit; aplica regla 8 (fallback local fail-invisible).
- `home.tsx:399-404` (shell, no de esta unidad) — gate ya correcto; sin cambios.
