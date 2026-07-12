# SPEC · Ficha: Nutrición + Facturación (oculto D2) — `ficha-nutricion-facturacion`

PORT 1:1 Sección 3 (COACH). **Web = fuente de verdad.** Cada afirmación cita `archivo:línea` del código real leído línea por línea. NO se especifica de memoria.

Unidad = **tab Nutrición** de la ficha del alumno (el panel más denso, 1723 L web) + **tab Facturación** (existe en RN pero NO montado — RULING D2).

## Archivos

**Web (verdad):**
- `apps/web/src/app/coach/clients/[clientId]/NutritionTabB5.tsx` (1723 L) — panel Nutrición.
- `apps/web/src/app/coach/clients/[clientId]/CoachNutrientTargetsEditor.tsx` (304 L) — Zona C editor de micros.
- `apps/web/src/app/coach/clients/[clientId]/CoachPrivateNotesPanel.tsx` (141 L) — Zona C nota privada.
- `apps/web/src/app/coach/clients/[clientId]/ClientFoodRestrictionsCard.tsx` (341 L) — Zona C restricciones (AUSENTE en RN).
- `apps/web/src/app/coach/clients/[clientId]/NutritionCheckinContextCard.tsx` (71 L) — Zona C check-in↔nutrición.
- `apps/web/src/app/coach/clients/[clientId]/NutritionCoachAlertsPanel.tsx` (46 L) — panel de alertas.
- `apps/web/src/app/coach/clients/[clientId]/NutritionCycleHistorySection.tsx` (422 L) — Zona C ciclos + historial (AUSENTE en RN).
- `apps/web/src/app/coach/clients/[clientId]/_nutrition-tab/presentationals.tsx` (174 L) — leaf legacy (NO importado por B5; ver nota).
- `apps/web/src/app/coach/clients/[clientId]/BillingTabB8.tsx` (414 L) — panel Facturación.

**RN PROPIOS (esta unidad edita):**
- `apps/mobile/components/coach/clientDetail/NutricionTab.tsx` (703 L).
- `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` (108 L).

**READ-ONLY (otras unidades — NO tocar):**
- `apps/mobile/components/coach/clientDetail/shared.tsx` (owner `ficha-shell-hero`) — `StatCard`/`CardHeader`/`MetricBox`/`Pill`/`cd`/`formatDate`/`formatCurrency`/`relativeDays`/`adherenceColor`.
- `apps/mobile/app/coach/cliente/[clientId].tsx` (owner `ficha-shell-hero`) — monta `NutricionTab` (L292-293), calcula badge "!" nutrición (L227), NO monta `FacturacionTab`.
- `apps/mobile/lib/coach-client-detail.ts` (data-layer; leído para citar tipos/queries — no owner de esta unidad).

> **Nota `_nutrition-tab/presentationals.tsx`:** el brief lo lista como webFile, pero `NutritionTabB5.tsx` NO lo importa (imports L1-76 no referencian `_nutrition-tab/`). B5 define sus PROPIOS `SectionTitle`/`CardHeading`/`MacroBar`/`ZoneHeader`/`heatmapCellColor`/`DetailAccordion` inline (L170-295). El archivo `presentationals.tsx` es una versión leaf legacy con tokens antiguos (`bg-primary/10`, `GlassCard`, `bg-emerald-500/35`) — **NO es la verdad visual de este panel**. Verdad = las funciones inline de B5.

---

## 1. Arquitectura del panel Nutrición (orden de render)

Web `NutritionTabB5` return principal (L1534-1563), en este orden:
1. **Early-return dominio OFF** (L1505-1532) — si `!nutritionDomainEnabled`.
2. `zoneAProgreso` (L1536-1537 → def L555-727) — Progreso.
3. `zoneBPlan` (L1540 → def L730-865) + `mealsList` (L1541 → def L868-964) — Plan y comidas.
4. `zoneCContexto` (L1544 → def L990-1130) — Alertas y contexto (coach-only).
5. `DetailAccordion "Detalle · gráficos densos"` (L1547-1549) — colapsado.
6. `DetailAccordion "Detalle · historial de logs"` (L1550-1552) — colapsado.
7. CTA final `<Link> "Abrir plan nutricional"` (L1555-1561).

RN `NutricionTab` return (L92-204), orden actual:
1. Alertas de coach (L95-107).
2. Card "Plan activo" (L110-122).
3. Card "Hoy" con 2 rings (L125-136).
4. Grid 3 MetricBox (7d/30d/Racha) (L139-143).
5. Heatmap 30d (L146-153).
6. `BarComposed` timeline (L156-162).
7. `DayNutritionDetail` (L165-171 → def L207-284) — navegador de día + hábitos.
8. Contexto de check-ins (L174-185).
9. Favoritos (L188-199).
10. `CoachNutritionZoneC` (L202 → def L300-331).

Divergencia estructural: RN **no tiene** early-return de dominio, ni Zona A/B/C con `ZoneHeader` A y B (solo C tiene header, L324), ni los dos `DetailAccordion`, ni el CTA final `<Link>` (RN pone el "Editar" en la card de plan). El panel de Detalle denso (charts + tabla historial + pies) está fusionado/ausente.

---

## 2. Layout, tokens y tipografía (verdad web B5)

### Helpers presentacionales inline (B5)
- `SectionTitle` (L170-176): `font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong`.
- `CardHeading` (L179-185): `flex items-center gap-2 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong`.
- `MacroBar` (L188-215): label `text-xs font-bold text-body`; meta `text-[11px] font-bold tabular-nums text-muted` "`{round(value)} / {round(target)} {unit}`"; track `h-2 overflow-hidden rounded-pill bg-surface-sunken`; fill `h-full rounded-pill` con `background: color`, `width: pct%` donde `pct = target>0 ? min(100, round(value/target*100)) : 0` (L201).
- `ZoneHeader` (L217-239): badge `h-7 w-7 rounded-control bg-sport-100 text-xs font-black text-sport-600` con la letra; título `SectionTitle`; subtítulo `text-[11px] font-medium text-muted`.
- `heatmapCellColor` (L242-247): sin log / pct null → `var(--ink-200)`; `>=80` → `var(--success-500)`; `>=60` → `var(--warning-500)`; resto → `var(--danger-500)`.
- `DAY_LETTERS = ['D','L','M','X','J','V','S']` (L249).
- `DetailAccordion` (L253-295): `Card padding="none" overflow-hidden`; botón `px-5 py-4 hover:bg-sport-100`, título `text-xs font-black uppercase tracking-widest text-muted`, chevron Up/Down; cuerpo framer-motion `height 0→auto`, `duration reduceMotion ? 0 : 0.22`, `border-t border-subtle`, `space-y-6 p-5`.

### `MACRO_COLORS` (B5 L160-165)
`cal: 'var(--sport-500)'`, `prot: 'var(--color-macro-protein)'`, `carb: 'var(--color-macro-carbs)'`, `fat: 'var(--color-macro-fats)'`.

RN `MACRO_COLORS` viene de `components/MacroRingSummary` (NutricionTab L7); NutricionTab usa `theme.primary` para kcal (L116,128) — NO `--sport-500` directo (equivalente de marca). Claro/oscuro: web via tokens semánticos; RN via `useTheme()` (`theme.foreground/mutedForeground/primary/success/destructive/border/secondary/card`), correcto para ambos esquemas.

---

## 3. Zona A · Progreso (web L555-727) — mapa de elementos

### A1 · Banner de riesgo (L558-568)
`atRisk = !!plan && kcal > 0 && headlineAdherencePct < 60` (L460). Card `border-l-[3px] border-l-[var(--danger-500)] bg-[var(--danger-100)]` + `AlertTriangle` `text-[var(--danger-600)]` + texto `text-sm font-bold text-[var(--danger-700)]` "Adherencia nutricional en riesgo (`{round(headlineAdherencePct)}`%)".
- `headlineAdherencePct` (L454-459): `nutritionAdherence30dAllDays ?? nutritionMonthlyAvgPct ?? nutritionWeeklyAvgPct`.
- **RN: ausente** como banner dedicado; solo `deriveNutritionCoachAlerts` (L95-107). (Ola0 IDX108 #7, P2.)

### A2 · Card "Hoy (Santiago)" (L573-605)
Solo si `plan && kcal > 0` (L570). Header `CardHeading "Hoy (Santiago)"` + `text-xs text-muted` "`{mealsDoneToday}/{mealsTotalToday}` comidas" (L574-578, `todayRow` = `nutritionTimeline.find(r => r.log_date === santiagoTodayIso)`, L486-491).
- Si `!hasTodayNutritionLog` (L580): `<p class="py-6 text-center text-sm text-muted">No ha registrado comidas hoy (sin log diario).`
- Si sí: kcal `font-display text-2xl font-black tabular-nums text-strong` `{round(tm.calories).toLocaleString('es-CL')}` + `text-sm text-muted` "/ `{kcal.toLocaleString('es-CL')}` kcal" (L586-591); barra kcal `h-2 rounded-pill bg-surface-sunken` fill `bg-[var(--success-500)]` width `kcalPct%` (`kcalPct = kcal>0 ? min(100, round(tm.calories/kcal*100)) : 0`, L492); luego 3 `MacroBar` (Proteína/Carbohidratos/Grasas) desde `todayMacroBars` (L541-545), colores `MACRO_COLORS.prot/carb/fat`.
- **RN divergencia (P0 IDX108 #0):** RN card "Hoy" (L125-136) usa `today = nutritionTimeline.find(t => t.date === todayIso) ?? nutritionTimeline[0]` (L80) → si hoy NO tiene log muestra datos de OTRO día bajo el título "Hoy". Web NUNCA hace fallback. Además RN muestra 2 `ComplianceRing` (kcal + Comidas) + una línea de texto — NO el desglose consumido/meta por macro (P1 IDX108 #4). Fix: eliminar `?? nutritionTimeline[0]`, render vacío verbatim, agregar 3 `ProgressBar` con macro colors.

### A3 · Card "Adherencia · 30 días" (L608-678)
Header `CardHeading` con `<Utensils h-4 w-4/>` + "Adherencia · 30 días" + `<MetricInfo term="adherencia" iconClassName="text-sport-600"/>` (L610-613). Cifra `font-display text-xl font-black tabular-nums`, color `atRisk ? var(--danger-600) : var(--success-600)`, `{round(headlineAdherencePct)}%`.
- Captions: `text-[10px] font-medium text-muted` "Promedio de 30 días; incluye los días sin registro como 0%." (L621-623) y "Color según % de comidas del plan completadas ese día." (L624-626).
- **Heatmap** (L627-652): grid `grid-cols-[repeat(15,minmax(0,1fr))] gap-1`, `role="grid"`; 30 celdas desde `heatmapDays` (L462-483 = `eachDayOfInterval({start: subDays(end,29), end})`, `end = parseISO(santiagoTodayIso + 'T12:00:00')`), `motion.div role="gridcell"` `aspect-square rounded-[3px]` bg `heatmapCellColor(d)`, `whileHover scale 1.12` (spring stiffness 400 damping 22); `aria-label`/`title` = hasLog ? "`{dateKey}: {mealsDone}/{mealsTotal} comidas · {compliancePct??0}%`" : "`{dateKey}: sin registro`".
- **3 tiles** (L653-677) `rounded-control bg-surface-sunken px-2.5 py-2`: (1) "Prom. mensual" `nutritionMonthlyAvgPct != null ? {n}% : '—'`; (2) "Racha de nutrición ≥80%" `{nutritionStreakDays} d`; (3) "Sem vs ant." `flex items-center gap-1` con `WeekIcon` (TrendingUp/Down/Minus según `weekDelta = nutritionWeeklyAvgPct - nutritionPrevWeeklyAvgPct >1/<-1/else`, L537-538), color `weekDelta>=0 ? success-600 : danger-600`, texto `{weekDelta>=0?'+':''}{round(weekDelta)}%`.
- **RN divergencias:** heatmap RN (L146-153) usa `asc.slice(-30)` = últimas 30 FILAS con log (no 30 días calendario), umbral color via `adherenceColor` (shared L100-105: `>=80 success / >=50 amber / >0 destructive / else border`) — **umbral 50 vs web 60** (P1 IDX108 #5). RN NO tiene tile "Sem vs ant." ni guard de null en `${nutritionMonthlyAvgPct}%` (L141 renderiza "null%") (P1 IDX108 #6). RN label es solo "Racha" (pierde "≥80%") (P2 IDX108 #18). RN sin `MetricInfo` ni captions (P2 IDX108 #18). Fix: 30 días calendario desde `todayIso`, sin-log en `theme.border`/muted, umbrales 80/60, guard null → '—'.

### A4 · Card "Últimos 7 días · kcal vs meta" (L689-725)
Solo si `plan` (L689). `CardHeading "Últimos 7 días · kcal vs meta"` + caption "Consumo estimado según comidas del plan marcadas como hechas." Contenedor `h-[110px]`: línea meta punteada `border-t-[1.5px] border-dashed border-[var(--ink-400)]` en `top: max(0, 100-(kcal/chart7dScale)*100)%` (L696-700). Barras desde `chart7d` (L507-523 = 7 días calendario `subDays(end,6)..end`, `consumed = row.consumed_calories ?? 0`, `target = row.target_calories || kcal`): `w-full rounded-t-[4px] bg-[var(--sport-500)]` height `(consumed/chart7dScale)*100%`, letra debajo `text-[9px] text-subtle` (`DAY_LETTERS[getDay()]`). `chart7dScale = max(kcal, ...consumed, 1)*1.12` (L526-529). Leyenda `text-[11px] text-subtle` "Meta `{kcal.toLocaleString('es-CL')}` kcal" con muestra de línea punteada.
- **RN divergencia (P2 IDX108 #9):** RN tiene un solo `BarComposed` sobre TODA la timeline con barras=consumidas y línea=objetivo (L156-162); NO existe la vista 7d con letras de día ni la banda de % adherencia. Consolidación aceptable pero falta la serie `compliancePct`.

### Empty A (L680-686)
Si `!(plan && kcal>0)`: Card `<p class="py-6 text-center text-sm text-muted">Asigna un plan de nutrición con meta calórica para ver el progreso del alumno.`
- RN: si `!activeNutrition` early-return con `EmptyState icon={Apple} title="Sin plan de nutrición" subtitle="Este alumno no tiene un plan activo."` + botón "Asignar plan de nutrición" + `CoachNutritionZoneC` (L70-78). **COPY divergente** vs web.

---

## 4. Zona B · Plan y comidas (web L730-964)

`ZoneHeader letter="B" title="Plan y comidas" subtitle="Plan activo, edición y lista de comidas"` (L732).

### B1 · Favoritos del alumno (L735-754)
Solo si `clientFavoriteFoods.length > 0`. Header `<Heart fill-[var(--ember-500)] text-[var(--ember-500)]/>` + `text-[11px] font-black uppercase tracking-widest text-subtle` "Alimentos favoritos del alumno"; caption `text-[11px] text-muted` "Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo."; chips en `flex max-h-28 flex-wrap gap-2 overflow-y-auto` → `<Badge tone="neutral" size="sm" class="max-w-full truncate">{f.name}`.
- **RN divergencia (P2 IDX108 #16):** RN (L188-199) `favoriteFoods.slice(0, 12)` (13+ invisibles), chips en `theme.destructive` (rojo, no neutral), corazón `theme.destructive`, SIN caption. En RN esta card va al final (después de check-ins), no en Zona B. Fix: quitar slice o "+N más", chips neutrales, agregar caption.

### B2 · Card del plan activo (L757-862)
Solo si `plan`. Header: `<Apple text-sport-600/>` + `truncate text-[15px] font-black text-strong` "Plan · `{plan.name}`" (L762-765); si `kcal>0` sub `text-xs text-muted` "`{kcal.toLocaleString('es-CL')}` kcal / día" (L767-769); Badge derecha `tone={isCustom?'warning':'sport'} variant="soft" size="sm"` texto `CUSTOM`/`SYNCED` (`isCustom = !!plan.is_custom`, L428, L771-773).
- Instrucciones (L776-780): si `plan.instructions?.trim()`, `text-xs font-medium leading-relaxed whitespace-pre-wrap text-muted`.
- 3 tiles macro (L782-794) desde `macroShare` (L548-552): `flex-1 rounded-control bg-surface-sunken p-2 text-center`, gramos `font-display text-[15px] font-black tabular-nums` + `text-[10px]` "g", label `text-[10px] text-muted` "`{name}` · `{round(m.kcal/macroKcalTotal*100)}`%" (`macroKcalTotal = pCal+cCal+fCal || 1`, L433).
- Acciones (L796-825): `<Link href="/coach/nutrition-plans/client/{clientId}">` botón `buttonVariants sport sm` `<Pencil/>` "Editar plan"; `<Button variant="secondary" size="sm" onClick={handleOpenDuplicate}>` `<Copy/>` "Copiar"; si `coachSlug` `<a href="/c/{coachSlug}/nutrition" target="_blank" rel="noopener noreferrer" class="ml-auto ... text-xs font-bold text-sport-600 hover:underline">` `<ExternalLink/>` "Ver como alumno".
- **RN divergencia (P1 IDX108 #2, #3, #19):** card RN (L110-122) muestra solo nombre + `MacroPill` de valores absolutos (kcal/P/C/G) + botón "Editar / asignar plan". FALTA: badge CUSTOM/SYNCED, instructions, % de kcal por macro, botón "Copiar" (flujo duplicar), link "Ver como alumno".

### B3 · Diálogo "Copiar plan a otro alumno" (L827-861 + handlers L346-373)
`handleOpenDuplicate` (L352-359): abre `dupOpen`, resetea `dupTargetId`, si `dupClients` vacío → `getCoachClientsLite(coachId)` filtrando `c.id !== clientId`. Dialog `sm:max-w-sm`, título `text-base font-black uppercase` "Copiar plan a otro alumno"; párrafo `text-sm text-muted` "El plan se copiará como **CUSTOM** al alumno destino. El historial de este alumno y el plan origen no se modifican."; `<Select>` placeholder "Seleccionar alumno…" (loading item "Cargando alumnos…"); botón `h-10 w-full font-bold` disabled sin target/loading, texto `dupLoading ? 'Copiando…' : 'Confirmar copia'`.
- `handleDuplicate` (L361-373): `duplicatePlanToClient(coachId, sourcePlanId, dupTargetId)`; éxito → `toast.success('Plan copiado correctamente.')` + cierra; error → `toast.error(res.error ?? 'Error al duplicar el plan.')`.
- **RN: ausente por completo** (IDX108 #2, P1). Fix: acción "Copiar" en card plan → ActionSheet/modal con lista de alumnos + mismo action de duplicado.

### B4 · Lista de comidas del PLAN — `mealsList` (L868-964)
Solo si `mealDetails && length>0`. `Card padding="none" overflow-hidden`. Por comida:
- Suma P/C/G/kcal desde `meal.food_items` (`food.protein_g/carbs_g/fats_g/calories * quantity`, L874-887).
- Botón fila `px-3.5 py-3 hover:bg-sport-100`: nombre `text-sm font-bold text-strong`; si `hasMacros` sub `text-[10px] font-bold text-muted` "P `{round(p)}`g · C `{round(c)}`g · G `{round(f)}`g"; kcal derecha `font-mono text-xs text-subtle` "`{round(mealKcal)}` kcal"; `<ChevronRight>` que rota `rotate-90` al abrir (`openMealId` toggle, L338, L894).
- Cuerpo colapsable (framer-motion): `meal.description` `text-[11px] text-muted`; si 0 items `text-[10px] italic text-muted` "Sin alimentos enlazados"; cada alimento `flex justify-between border-b border-subtle pb-2 text-[10px]`: nombre `font-bold text-body`, derecha `font-medium text-muted` "`{quantity}{unit}` · `{round(calories)}` kcal".
- **RN divergencia (P1 IDX108 #8):** RN NO tiene lista de comidas del PLAN. RN muestra comidas del DÍA seleccionado (`dayDetail.nutritionMeals`, L242-264) con check binario + nombre + foods "nombre — cantidad unidad" (L256-258), SIN macros P/C/G ni kcal por comida ni descripción. Nota: `ClientDayDetail.nutritionMeals` en RN (`coach-client-detail.ts` L207-211) es `{name, completed, foods[]}` — no trae macros; portar requiere sumar desde food_items o extender el data-layer (fuera de esta unidad → anotar en cambiosShell).

---

## 5. Zona C · Alertas y contexto (web L990-1130)

`ZoneHeader letter="C" title="Alertas y contexto" subtitle="Señales del coach, check-ins y ciclos del plan"` (L992-996). Orden:
1. `ClientFeaturePrefsPanel` (L999-1009) — solo si `nutritionOverrideContext`.
2. `NutritionCoachAlertsPanel` (L1010).
3. `NutritionCheckinContextCard` (L1011-1014).
4. `ClientFoodRestrictionsCard` (L1018).
5. Hilo `NotesThread` (L1021-1033) — solo si `showSection('notes')`.
6. `CoachNutrientTargetsEditor` (L1036-1042) — solo si `showMicros`.
7. `CoachPrivateNotesPanel` (L1045).
8. `NutritionCycleHistorySection` (L1047-1055).
9. Card "Hábitos del día" (L1058-1128) — solo si `showSection('habits')`.

`showSection(key)` (L333-334): `nutritionSectionFlags ? flags[key]===true : true`. `showMicros = showSection('micros_base') || showSection('micros_advanced')` (L337).

RN `CoachNutritionZoneC` (NutricionTab L300-331): carga su propio contexto vía `getCoachNutritionZoneC(clientId, todayIso)` en `useEffect(reload)` (L305-314). `showSection` (L319): `zc.prefsEnabled ? zc.effective[k]===true : true`. Monta solo: `FeaturePrefsOverridePanel` (L325), `MealCommentsThread` si `notes` (L326), `NutrientTargetsEditor` si `showMicros` (L327), `PrivateNotePanel` (L328). Subtítulo reescrito a "Señales del coach y funciones del alumno" (L324). **FALTAN** en RN: `NutritionCoachAlertsPanel` (RN pone alertas en Zona A L95-107 — mismo `deriveNutritionCoachAlerts`), `NutritionCheckinContextCard` dedicado (RN tiene sustituto simple en Zona A L174-185), `ClientFoodRestrictionsCard`, `NutritionCycleHistorySection`, y la card "Hábitos del día" gated por flag (RN la pone en `DayNutritionDetail` sin gating).

### C1 · Panel de override de features — `ClientFeaturePrefsPanel` (web) ↔ `FeaturePrefsOverridePanel` (RN L547-627)
Ola0 IDX120 confirma paridad exacta de lógica: draft/saved auto-inherit (web `client_feature_prefs` :77-85 vs RN L558-566), dirty por `JSON.stringify` (RN L555), tri-state heredar/mostrar/ocultar.
- RN header colapsable (L580-589): `<SlidersHorizontal WARNING/>` + "Funciones para este alumno`{overrideCount ? ' · N' : ''}`" color `WARNING`; sub "Sobrescribe el default `{baseLabel}` solo para este alumno" (`baseLabel = useTeamBase ? 'del equipo' : 'tuyo (coach)'`, L576); chevron rota 180.
- Fila "Mostrar Nutrición" (L592-598) = `DOMAIN_ENABLED_KEY`, hint "Apaga toda la nutrición de este alumno. No borra su historial." + `<Switch>`.
- Toggleables (L599-618): `NUTRITION_SECTIONS.filter(!core)`; si `locked` (module no entitled) → fila con `<Lock>` + "Pro"; si no → `<Switch checked>`, label con " •" si override activo.
- Footer (L619-622): "Restaurar heredado" (`RotateCcw`, `setDraft({})`) + "Guardar" (`Save`, `setClientNutritionOverride`). Error → `Alert.alert`.
- `WARNING = '#F59E0B'` (L30) — literal centralizado porque el DS mobile no expone token semántico warning (comentario L28-29). **Adaptación idiomática documentada.**

### C2 · `NutritionCoachAlertsPanel` (web L19-45)
`alerts.length===0 → null`. `<ul>` por alerta: `flex gap-2.5 rounded-control border-l-[3px] px-3 py-2.5 text-xs`; `iconByVariant` danger/warning=AlertTriangle, info=Info; `toneByVariant` danger(danger-500/100/700/600), warning(warning-500/100/700/600), info(sport-500/100/700/600); título `font-bold {tone.text}`, desc `text-[11px] text-muted`.
- RN espejo (NutricionTab L95-107, en Zona A): `styles.alert` `borderWidth 1 borderRadius 12 px12 py10`, bg `c+'14'` border `c+'40'`, título `FONT.uiBold` color c, desc `theme.foreground`. `alertColor` (L32-34): danger→`theme.destructive`, warning→`WARNING`, else→`theme.primary`. Mismo `deriveNutritionCoachAlerts` (L57-68). **Divergencia visual:** web usa `border-l-[3px]` + fondo tokenizado por variante; RN usa borde completo + alpha. Aceptable pero anotado.

### C3 · `NutritionCheckinContextCard` (web L20-70)
`rows` = check-ins con `weight != null`, `slice(0,5)`, label `format 'd MMM yyyy'`. Header `<Scale text-sport-600/>` + `CardHeading` "Check-in y nutrición" + `<Apple text-[var(--success-600)] ml-auto/>`. Párrafo `text-[11px] text-muted` "Cruzamos el peso declarado en check-in con la adherencia a comidas de esta semana (~`{round(nutritionWeeklyAvgPct)}`%). Los datos son autodeclarados por el alumno." Empty "Aún no hay check-ins con peso registrado." Lista `<li>` `flex justify-between text-[11px]`: fecha `text-muted`, `{kg.toFixed(1)} kg` `font-bold`. **`caution`** (L63-67): `coachCheckinNutritionCaution(weightsNewest, nutritionWeeklyAvgPct)` → si existe, caja `bg-[var(--warning-100)] text-[var(--warning-700)] text-[11px]`.
- **RN divergencia (P2 IDX108 #17):** RN sustituto (L174-185, en Zona A): `recentWeights = checkIns.slice(0,3)`, filas fecha + peso; texto fijo "Cruzá la adherencia con la evolución de peso para ajustar el plan." NO recibe `nutritionWeeklyAvgPct`, NO calcula `caution`, muestra 3 (no 5). Nota: copy "Cruzá" = voseo (regla 5 pide latino neutro sin voseo → **corregir a "Cruza"** al portar). Fix: portar los campos y el aviso `caution`.

### C4 · `ClientFoodRestrictionsCard` (web L52-340) — AUSENTE EN RN
Card colapsable (`AlertTriangle` en caja `bg-danger-100 text-danger-600` si hay alergias) "Restricciones alimentarias" + badge count + sub "Alergias / intolerancias que el plan debe respetar". Al abrir: `radiogroup` de tipo (`TYPE_META`: allergy "Alergia" danger, intolerance "Intolerancia" warning, dislike "No le gusta" neutral, L29-48); búsqueda con debounce 300ms `searchCoachFoodLibrary(coachId, {search, pageSize:20, page:0})` (L96-105), término ≥2 chars; resultados `add(food, type)` optimista + `setClientFoodRestriction` + `toast.success('{name}: {label}')` (L114-135); chips actuales agrupados por tipo con botón quitar (`remove` → `setClientFoodRestriction(...preferenceType:null)`, L137-150); empty "Sin restricciones. Marca alergias o intolerancias para que el plan las respete."
- Data self-contained: `getClientFoodRestrictions(clientId)` al montar (L72-83).
- **RN: ausente por completo** (P1 IDX108 #10). Fix: portar. **PENDIENTE-DECISIÓN-CEO:** feature grande con búsqueda + escritura; confirmar si entra en esta ola o se difiere (anotar en resumen).

### C5 · Hilo `NotesThread` (web L1021-1033) ↔ `MealCommentsThread` (RN L349-396)
Solo si `showSection('notes')`. Web `CardHeading` `<MessageSquare/>` "Conversación de nutrición · hoy" + `<NotesThread comments currentRole="coach" onSubmit={handleCoachReply} emptyHint="Sin comentarios del alumno hoy. Puedes escribirle una nota."/>`. `handleCoachReply` (L978-987): `addCoachMealComment({clientId, logDate: santiagoTodayIso, body})`, error → `toast.error`.
- RN espejo (Ola0 IDX130 confirma paridad tras fixes: acento proteína #5E9FD6, alpha burbuja ~12%, maxWidth 85%, padding 12/8): `MealCommentsThread` `StatCard` header `<MessageSquare>` "Conversación de nutrición · hoy"; burbujas `alignSelf` según `authorRole==='coach'`, rol "Tú"/"Alumno"; empty "Sin comentarios del alumno hoy. Puedes escribirle una nota."; composer `TextInput` multiline + botón `Send`. `send()` → `addCoachMealComment(clientId, logDate, body)`, error → `Alert.alert`. **Paridad razonable.**
- **Gotcha 6c (Fabric 45798):** el `composerInput` (L382-389) NO tiene estilo condicional por focus en el wrapper → OK, respetar.

### C6 · `CoachNutrientTargetsEditor` (web L128-303) ↔ `NutrientTargetsEditor` (RN L410-491)
Solo si `showMicros`. Catálogo:
- `BASE_NUTRIENTS` (web L44-63 / RN L400-403): sodium_mg "Sodio" mg cap `[target,ceiling]` hint "Tope diario sugerido ~2300 mg. Define el techo a no superar."; fiber_g "Fibra" g aimup `[floor,target]` hint "Meta diaria sugerida 25–30 g. Define el piso/meta a alcanzar."
- `PRO_NUTRIENTS` (web L66-94 / RN L404-408): sugar_g "Azúcar" cap; saturated_fat_g "Grasa saturada" cap; unsaturated_fat_g "Grasa insaturada" aimup. (Hints RN ligeramente truncados vs web — web L74/83/92.)
- `nutrients = proEnabled ? [...BASE, ...PRO] : BASE` (web L134 / RN L412).
- `byKey` prioriza fila del alumno (`client_id === clientId`) sobre default coach (`client_id null`) (web L139-149 / RN L414-421).
- Web card: header `font-display text-[17px] font-extrabold text-strong` "Umbrales de micronutrientes" + `<InfoTooltip>`. Por nutriente `motion.div` `rounded-control border-subtle bg-surface-sunken p-4`: label `text-xs font-black uppercase text-foreground` + pill intent `cap→bg-warning-100 text-warning-700 "Tope"` / `aimup→bg-success-100 text-success-700 "Meta"` + `<InfoTooltip hint>`; **`<NutrientRangeBar>` preview redundante** (color+palabra+ícono+posición, L241-249); grid-cols-3 inputs Piso/Meta/Techo (`type=number inputMode=decimal min=0 step=any` `disabled` si campo no aplica, `h-11 tabular-nums`); botón `<Save>` "Guardar"/"Guardando…". Save (L165-193): valida `≥1 umbral` (`toast.error('Define al menos un umbral.')`), `upsertClientNutrientTarget({...intent, provenance:'manual'})`, éxito `toast.success('{label}: umbral guardado.')`. Footer si `!proEnabled` "Nutrición Pro desbloquea umbrales para más micros (azúcar, grasas)." (L296-300).
- RN `NutrientRow` (L433-491): `intentPill` `WARNING+'22'`/`success+'22'` "Tope"/"Meta"; hint `theme.mutedForeground`; 3 `TextInput` `keyboardType="decimal-pad"` `editable` por campo, `textAlign:'center'`, placeholder = unidad o "—"; botón `<Save>` outline. `save()` (L440-453): `upsertCoachNutrientTarget`, error → `Alert.alert` (NO valida "≥1 umbral" ni toast de éxito). `parse` (L439): trim, `Number`, `≥0` o null.
- **Divergencias:** RN NO tiene `<NutrientRangeBar>` preview (barra redundante color+palabra+ícono — accesibilidad); RN NO valida "define al menos un umbral"; RN usa `Alert` en vez de toast éxito. Fix: agregar preview redundante o anotar; agregar validación.
- **Gotcha 6c (Fabric 45798):** `nutrientInput` (L475-483) sin estilo condicional por focus → OK.
- **Gotcha 6a (BOMBA -999):** el editor NO usa `@gorhom/bottom-sheet` — es inline en la Zona C (no hay sheet). Riesgo -999 N/A aquí.

### C7 · `CoachPrivateNotesPanel` (web L44-140) ↔ `PrivateNotePanel` (RN L494-544)
`MAX_LEN = 5000` (web L22 / RN `maxLength={5000}` L519). Header `<Lock text-[var(--warning-600)]/>` "Nota privada" + `<InfoTooltip>`; badge `bg-warning-100 text-warning-700 text-[10px] uppercase` "Privada — el alumno no la ve"; `<Textarea min-h-28>` placeholder "Observaciones internas: adherencia, ajustes pendientes, contexto del alumno…"; contador `{body.length}/{MAX_LEN}`; botón `<Save>` "Guardar nota"/"Guardando…" disabled sin body; "Última actualización: `{fmtDate}`" si `latest.updated_at`; sección "Notas anteriores" (`notes.slice(1)`) cada una `rounded-control border-subtle bg-surface-sunken`, body `whitespace-pre-wrap text-xs text-muted`, fecha `text-[9px] font-black uppercase`.
- `handleSave` (web L50-64): trim, vacío → `toast.error('La nota no puede estar vacía.')`, `upsertCoachPrivateNote({clientId, body})`, éxito `toast.success('Nota privada guardada.')`.
- RN `PrivateNotePanel` (L494-544): `latest = notes[0]`; badge `WARNING+'22'` "Privada — el alumno no la ve"; `TextInput multiline maxLength 5000 textAlignVertical:'top'`; footer contador `{body.length}/5000` + botón "Guardar nota"; save (L499-507) trim, vacío → `Alert.alert('Nota vacía', 'La nota no puede estar vacía.')`, `upsertCoachPrivateNote(clientId, trimmed)`, error → `Alert.alert`; "Notas anteriores" (`notes.slice(1)`) con `formatDate(dateIso.slice(0,10))`. **Paridad razonable** (toast→Alert idiomático; RN sin "Última actualización" del latest).
- **Gotcha 6c:** `noteInput` (L515-523) sin estilo condicional por focus → OK.

### C8 · `NutritionCycleHistorySection` (web L75-421) — AUSENTE EN RN
`if (!planId) return null`. Card "Ciclo de dieta" (`<Calendar text-sport-600/>` + `CardHeading` + `<InfoTooltip>`) con vista previa del bloque activo según `resolveNutritionCycleBlockForDate` (L107-116); botón "Editar ciclo"/"Definir ciclo"; empty por casos (sin plantillas / sin ciclo activo). Sección "Historial del plan (autosave)" (L231-263): lista `historyEntries` con botón "Restaurar" → `AlertDialog` "¿Restaurar esta versión?" → `restoreClientNutritionPlanFromHistory` + `toast.success('Plan restaurado desde el historial')`. Dialog "Nuevo/Editar ciclo" (L266-400): nombre, fecha inicio, bloques (semanas desde/hasta, etiqueta, plantilla `<Select>`), agregar/quitar fila, `upsertNutritionPlanCycle` + `toast.success('Ciclo guardado')`.
- **RN: ausente por completo** (P1 IDX108 #11). El subtítulo Zona C RN fue reescrito eliminando "y ciclos del plan" (L324). Fix: portar ciclo activo + historial. **PENDIENTE-DECISIÓN-CEO:** feature grande (ciclos por fases + restore de snapshots con AlertDialog); confirmar si entra o se difiere.

### C9 · Card "Hábitos del día" (web L1058-1128)
Solo si `showSection('habits') && habitsForDate && (algún campo no-null)`. `CardHeading` `<Droplets/>` "Hábitos del día". Grid `grid-cols-2 sm:grid-cols-4`: Agua (`<Droplets sport-600/>`, `water_ml>=1000 ? '{L} L' : '{ml} ml'`), Pasos (`<Footprints/>`, `toLocaleString('es-CL')`), Sueño (`<Moon/>`, "`{h} h`"), Ayuno (`<Timer/>`, "`{h} h`"). Suplementos (L1111-1118): "Suplementos: `{join(' · ')}`". Nota del alumno (L1119-1126): caja `bg-surface-sunken` con `<MessageSquare>` "**Nota del alumno:** `{notes}`".
- `habitsForDate` cargado por `getClientHabitsForDate(clientId, date)` (L344, L377, L382) reactivo a la fecha del navegador de historial.
- **RN divergencia (P2 IDX108 #12):** RN card "Hábitos del día" (L271-281, dentro de `DayNutritionDetail`) SIN gating por `showSection('habits')`; agua siempre en ml (L275); SIN suplementos ni nota del alumno; ícono Ayuno es `Activity` (L278) en vez de `Timer`. Nota: `HabitsDayEntry` en RN (`coach-client-detail.ts` L213-220) SÍ trae `supplements` + `notes` — el UI los descarta. Fix: gating + suplementos + nota + agua en L si ≥1000 + ícono Timer.

---

## 6. Detalle denso + historial (web L1132-1501, en 2 `DetailAccordion` colapsados)

### D1 · `detailCharts` (L1200-1356)
- `macroMetaPieDetail` (L1132-1197): donut recharts "Macros meta (kcal)" con labels "Prot: Xkcal" + tooltip tokenizado.
- Card "Objetivo kcal vs adherencia" (L1203-1289): `ComposedChart` 30d (`chartRows` L494-505), barras `target_calories` `fill rgba(38,128,255,0.32)` + línea `compliancePct` `stroke var(--success-500)` + `ReferenceArea y1=80 y2=100 var(--success-500) op .08` + tooltip con log_date/objetivo/adherencia/consumidas/plan.
- Card "Consumido hoy (kcal por macro)" (L1291-1354): donut `pieConsumed` gated por `hasTodayNutritionLog && pieConsumed.length>0`.
- **RN: ausente** (P2 IDX108 #15). Sin pies de macro (solo MacroPill gramos). Fix opcional: donut SVG o `MacroRingSummary`.

### D2 · `detailHistory` (L1359-1501)
- Card "Último día registrado" (L1361-1414): `latest` = log más reciente; header `<Calendar/>`; eyebrow "`{log_date} · {compliancePct}% · {mealsDone}/{mealsTotal} comidas [· {consumed_calories} kcal consumidas (estim.)]`"; cada `mealLog` ordenado por `order_index`: completada `border-success-500/30 bg-success-100` + `<CheckCircle2>`, pendiente `border-subtle bg-surface-sunken` + `<Clock>`.
- Card "Historial de logs (30)" (L1416-1473): tabla Fecha/Plan/Obj.kcal/Cons.kcal/Adher./Comidas; filas `<60%` resaltadas `border-l-2 border-l-danger-500 bg-danger-100`; adher. color 80/60 (`success-600`/`warning-700`/`danger-600`).
- Card "Ver día específico" (L1476-1499): `<DayNavigator selectedDate onDateChange={handleHistoryDateChange} adherenceDates={activityDates} isLoading={isPending}/>`; `handleHistoryDateChange` (L380-393): si `date === santiagoTodayIso` limpia; si no `getClientNutritionForDate(clientId, date)` en `startTransition`. Estados: `isPending` "Cargando…"; `historyLoaded && !historyData` "Sin registros de nutrición para este día."; `historyData` → `<NutritionDayReadOnly>`.
- `NutritionDayReadOnly` (L1569-1721): resumen macros del día (Kcal/P/C/G via `calculateFoodItemMacros`), "Satisfacción prom. X/5" (`avgSatisfaction`, L1638-1653), por comida pill "Comió X%"/"Completa 100%"/"No completada" (`mealConsumedPct`, L1672-1692), lista alimentos, "Swaps aplicados" (`bg-info-100 text-info-600`, L1703-1715).
- **RN divergencias:** RN `DayNutritionDetail` (L207-284) navega SOLO fechas presentes en la timeline (`days = timeline.map(t=>t.date)`, flechas deshabilitadas en bordes, L216-222) — web `DayNavigator` va a CUALQUIER fecha con marcadores. RN muestra check binario + nombre + foods; SIN macros del día, SIN satisfacción, SIN % porción, SIN swaps (P1 IDX108 #13). RN NO tiene tabla "Historial de logs (30)" ni card "Último día registrado" (P2 IDX108 #14). Nota: `ClientDayDetail` RN no trae satisfacción/porción/swaps → extender data-layer (cambiosShell).

---

## 7. Early-return dominio OFF (web L1505-1532) — P0

Si `!nutritionDomainEnabled`: card centrada `<Utensils text-muted/>` + `text-sm font-black uppercase text-strong` "Nutrición desactivada para este alumno" + `text-xs text-muted` "Apagaste el módulo de nutrición para este alumno en tus preferencias. Sus datos se conservan; vuelve a activarlo para ver plan, macros y adherencia." + (si `nutritionOverrideContext`) `<ClientFeaturePrefsPanel>` como escape hatch. La tab completa se oculta; historial nunca se borra.
- **RN divergencia (P0 IDX108 #1):** RN NO tiene chequeo de dominio; la tab siempre renderiza. Solo Zona C consulta flags (L319). Fix: elevar `zc.effective`/`domainEnabledBase` (ya cargados por `getCoachNutritionZoneC`) y early-return con nota compacta + `FeaturePrefsOverridePanel`.

---

## 8. Tab Facturación (web `BillingTabB8` L50-414) ↔ RN `FacturacionTab` L23-100 — OCULTO D2

**Estado montaje:** RN `FacturacionTab` NO está montado. El tab bar de la ficha (`app/coach/cliente/[clientId].tsx` L222-228) define 5 tabs (Resumen/Progreso/Entreno/Programa/Nutrición) SIN Facturación — comentario explícito L220-221 "sin Facturacion — removida del chrome, RULING D2". El componente RN existe pero es código muerto reachable-vía-nada. **Regla 2: conservar, no borrar.** `onAddPayment`/`onOpenPhoto`/`reload` esperados por props no están cableados (parent no lo monta).

### Web BillingTabB8 (verdad, para cuando D2 se revierta o para paridad de re-skin)
- Header info (L147-152): `<Info/>` + `text-[11.5px]` "Pagos del alumno hacia ti · independiente de tu suscripción EVA".
- 3 KPI cards (L154-194): "Total cobrado" `formatMoney(totalPaid)` `text-[var(--success-700)]` + "Suma de pagos marcados como pagados"; "Último pago" `formatDistanceToNow(...locale es)` + fecha·monto; "Próx. renovación (estim.)" `nextRenewalLabel` (`addMonths(lastPaidDate, months)` si `period_months>0`, L74-86) + "Desde último pago + periodo en meses".
- `formatMoney` (L18-24): `Intl.NumberFormat('es-CL', currency CLP, maxFractionDigits 0)`.
- `isPaidStatus` (L26-29): `paid|pagado|completed`. `isPendingStatus` (L31-33): `pending`.
- Card "Línea de tiempo" (L196-411): header `<CreditCard/>` "Línea de tiempo" + botón `<Plus/>` "Nuevo pago" (`setAddOpen(true)`). Dialog "Registrar pago" (L209-319): form `onAddPayment` (L104-143) — Monto (`type=number min=1`), Fecha (`type=date`, default hoy), Concepto (required), Meses (opcional). Validaciones: monto finito >0 "Indica un monto válido."; fecha "Indica la fecha del pago."; concepto "Indica un concepto (ej. mensualidad)."; meses "Periodo en meses debe ser un número ≥ 1 o vacío." → `addPayment({client_id, amount, payment_date, service_description, period_months, status:'paid'})`; catch "No se pudo registrar el pago…". Botones "Cancelar"/"Confirmar" ("Guardando…").
- Timeline (L322-410): empty `<Receipt/>` "No hay pagos registrados."; línea vertical `bg-[var(--border-subtle)]`; por pago punto de color (paid→success-500, pending→warning-500, else→ink-400), card con `formatMoney(amount)` + `service_description || 'Sin descripción'` + fecha (`<Calendar/>` `format 'd MMM yyyy' es`) + `{period_months} mes(es)`; Badge `tone paid?'success':pending?'warning':'neutral'` "Pagado"/"Pendiente"/status; botón `<Trash2>` → `onDelete` (`window.confirm('¿Eliminar este pago del historial?')` + `deletePayment(paymentId, clientId)` + `router.refresh()`); si `receipt_image_url` thumbnail `<Image>` 12×12 + `<Receipt sport-600/>` "Comprobante" (link `target=_blank`).

### RN FacturacionTab (L23-100)
- `statusInfo` (L9-15): paid/aprobado/approved/`''` → success "Pagado"; pending/pendiente → `#F59E0B` "Pendiente"; failed/rechazado/rejected → destructive "Rechazado"; else mutedForeground.
- `addMonths` (L17-21): `d.setMonth(+months)`, ISO slice.
- 3 `MetricBox` (L58-62): "Total cobrado" (`formatCurrency`, `theme.success`, `totalCobrado` suma solo pagados L39), "Último pago" (`relativeDays(last.payment_date)`), "Próx. renovación" (`addMonths` si `period_months`).
- Botón "Registrar pago" (`<CreditCard>`, `onAddPayment` full) L64 — **delegado al parent (no montado → sin form real).** Web tiene el Dialog+form inline; RN NO reimplementa el formulario. **Gap si D2 se revierte.**
- `StatCard` "Historial de pagos" (L66-94): por pago dot color `statusInfo` + `formatCurrency(amount)` (`Archivo_800ExtraBold`) + `Pill` estado + sub `formatDate · service_description · {period_months} mes(es)`; si `receipt_url` `<Image expo-image>` 38×38 tap → `onOpenPhoto([receipt_url],0)`; `<Trash2>` → `confirmDelete` (`Alert.alert('Borrar pago', ...)` + `deleteCoachClientPayment(client.id, p.id)` + `reload`). Empty `EmptyState icon={CreditCard} "Sin pagos" "Aún no hay pagos registrados."`.
- Data: `PaymentEntry` (`coach-client-detail.ts` L111-119): `id/amount/payment_date/service_description/status/period_months/receipt_url`. Query `client_payments` limit 20, order `payment_date desc` (L688).
- **Divergencias vs web:** RN usa `Pill` (no Badge timeline con punto sobre línea vertical); RN NO tiene los 3 textos-caption de las KPI cards; RN NO tiene el header `<Info>`; RN NO tiene el formulario de alta (delegado). Copy "Registrar pago" (RN) vs "Nuevo pago" (web botón) / "Registrar pago" (web dialog title). **Money-safety (regla brief):** enlaces de dinero = link-out; el alta/borrado de pagos aquí es registro manual del coach (no cobros MP/Flow), consistente en ambos.
- **Regla 2:** mantener oculto del tab bar salvo decisión CEO. Si se re-skina, no montar.

---

## 9. Datos, queries y claves de día (gotcha 6d)

- Web recibe casi todo por props desde el RSC (`NutritionTabB5Props` L103-158): `activeNutritionPlan`, `nutritionTimeline`, `mealDetails`, `todayMacros`, `nutritionMonthlyAvgPct`, `nutritionStreakDays`, `nutritionWeeklyAvgPct`/`Prev`, `clientFavoriteFoods`, `recentCheckIns`, `nutritionPlanCycles`, `nutritionTemplatesLite`, `nutritionPlanHistoryEntries`, `coachNutrientTargets`, `coachPrivateNotes`, `coachMealComments`, flags de sección/dominio/override. `santiagoTodayIso` viene del server (L107).
- Web self-fetch: `getClientNutritionActivityDates`/`getClientHabitsForDate` (`useEffect` L375-378), `getClientNutritionForDate` (navegador de día, L389), `getCoachClientsLite` (duplicar, L356).
- RN `NutricionTab` recibe `data: CoachClientDetailData` por props (`activeNutrition`, `nutritionTimeline`, `nutritionMonthlyAvgPct`, `nutritionStreakDays`, `compliance`, `favoriteFoods`, `checkIns`, L54) + `dayDetail`/`dayLoading` (fetch en parent `getCoachClientDayDetail`, `[clientId].tsx` L91-101). `todayIso = getTodayInSantiago().iso` (L55) — **cumple gotcha 6d** (día Santiago, no UTC).
- **Freezing (gotcha 6b):** `CoachNutritionZoneC` (L300-331) hace fetch propio (`getCoachNutritionZoneC`) en `useEffect(() => { reload() }, [reload])` (L314) — one-shot. La ficha es una **pantalla pushed** (`app/coach/cliente/[clientId].tsx`), NO un tab de `expo-router` que permanezca montado, así que el riesgo de congelamiento por tab oculto es menor; PERO si el parent recarga (`load()`), la Zona C NO se refresca (solo se refresca vía sus propios `onSaved`). **Riesgo anotado:** si esta unidad toca la carga de Zona C, preferir `useFocusEffect` + señal de recarga del parent en vez de `useEffect` one-shot.
- `nutrient_targets` query (`getCoachNutritionZoneC` L1153): `eq('coach_id', coachId).or('client_id.eq.{clientId},client_id.is.null')` — prioriza fila del alumno sobre default coach.
- `nutrition_meal_comments` query (L1152): `eq('log_date', logDate)` con `logDate = todayIso` (día Santiago). **Cumple 6d.**
- `meal_id` cascade-safety: la propagación de plantillas es web/service (CLAUDE.md); RN solo lee — no tocar.

---

## 10. Animaciones y accesibilidad

- Web: framer-motion en heatmap (`whileHover scale 1.12`, spring), `DetailAccordion`/`mealsList`/`CoachNutrientTargetsEditor`/`CoachPrivateNotesPanel`/`ClientFoodRestrictionsCard` (height/opacity, respetan `useReducedMotion`). `heatmap role="grid"`/`gridcell` con `aria-label` por celda; `radiogroup`/`radio` en restricciones; `role="status" aria-live="polite"` en resultados de búsqueda.
- RN: rotaciones via `transform:[{rotate}]` (chevrons L251, L588), sin framer-motion. Heatmap RN estático sin hover (touch). Accesibilidad: RN no expone `role`/`aria` equivalentes (limitación de plataforma; anotar, no bloquear).

---

## 11. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

**IDX 108** — auditoría línea-por-línea B5 (1723 L) vs NutricionTab (703 L) + shared.tsx. 20 discrepancias:

| # | Sev | Elemento | Fix |
|---|-----|----------|-----|
| 0 | P0 | Card "Hoy": fallback `?? nutritionTimeline[0]` muestra otro día | Quitar fallback; render vacío verbatim |
| 1 | P0 | Gating dominio: sin early-return `!nutritionDomainEnabled` | Elevar `zc.domainEnabledBase`, early-return |
| 2 | P1 | Flujo "Copiar plan a otro alumno" ausente | Acción Copiar + modal lista alumnos |
| 3 | P1 | Card plan: sin badge CUSTOM/SYNCED, instructions, % kcal/macro | Pill + instructions + share % |
| 4 | P1 | Barras de macros de HOY ausentes (solo 2 rings) | 3 ProgressBar macro |
| 5 | P1 | Heatmap: `slice(-30)` filas vs 30 días calendario; umbral 50 vs 60 | 30 días calendario; umbrales 80/60 |
| 6 | P1 | "Sem vs ant." ausente; `null%` sin guard | MetricBox delta + guard '—' |
| 7 | P2 | Banner de riesgo (<60%) ausente | Reusar styles.alert destructive |
| 8 | P1 | Lista comidas del PLAN con macros por comida ausente | Sumar food_items + mostrar |
| 9 | P2 | Chart 7d con letras + serie %adherencia ausente | 2º BarComposed compliancePct |
| 10 | P1 | Zona C `ClientFoodRestrictionsCard` ausente | Portar restricciones |
| 11 | P1 | Zona C `NutritionCycleHistorySection` ausente | Portar ciclos + historial |
| 12 | P2 | Hábitos: sin gating flag, sin suplementos/nota, agua ml, ícono Activity | Gating + campos + Timer |
| 13 | P1 | Detalle día: sin macros/satisfacción/%porción/swaps | Extender ClientDayDetail |
| 14 | P2 | Tabla "Historial de logs (30)" + "Último día registrado" ausentes | Lista scrollable 30 logs |
| 15 | P2 | Pies "Macros meta"/"Consumido hoy" ausentes | Donut SVG / MacroRingSummary |
| 16 | P2 | Favoritos `slice(0,12)`, chips rojos, sin caption | Quitar slice, chips neutrales, caption |
| 17 | P2 | Check-in context simplificado (3 pesos, sin adherencia/caution) | Portar campos + caution |
| 18 | P2 | Labels: "Racha" pierde "≥80%"; sin MetricInfo/captions | Renombrar + captions |
| 19 | P2 | Link "Ver como alumno" ausente | Linking.openURL opcional |

**IDX 120** — `FeaturePrefsOverridePanel` + `PrefRow` (NutricionTab L546-640): paridad exacta de lógica confirmada (draft/saved auto-inherit, dirty por JSON.stringify) tras fixes previos.
**IDX 130** — `MealCommentsThread`: paridad confirmada tras fixes (acento proteína #5E9FD6, alpha burbuja ~12%, maxWidth 85%, padding 12/8, metaRow gap/timestamps).
**IDX 49** — `NotesThread`: el lado coach RN existe como implementación propia (`MealCommentsThread`); lado alumno tiene mirror fiel aparte.
**IDX 48** — `MacroBars.tsx` compartido web NO se importa en coach; B5 usa clon local `MacroBar` (L188-215).
**IDX 11** — `MetricInfo`/glosario: `METRIC_GLOSSARY`/`TERM_TITLES` centralizados web ausentes en mobile; B5 L612 usa `<MetricInfo term="adherencia" iconClassName="text-sport-600"/>`.

> **Facturación:** Ola 0 NO auditó `BillingTabB8`/`FacturacionTab` (no hay item de billing en `discrepancias_por_resultado`; el sweep fue nutrición-céntrico). Billing especificado en §8 desde lectura directa del código.

---

## 12. Hallazgos ronda 5

`docs/audits/rn-parity-qa/r5-audit-coach-core.md §3.4` (L128): "Paneles de tabs (Overview/Progreso/Entreno/Programa/**Nutrición**) + dossier — **no auditados a fondo (R5.3)**. Cada `clientDetail/*Tab.tsx` requiere pasada propia vs su panel web (…`NutritionTabB5`)." → confirma que `NutricionTab` NUNCA tuvo auditoría pixel dedicada; la sustantiva es Ola 0 IDX108.

`docs/audits/rn-parity-qa/r5-audit-coach-nutricion.md` audita el **hub/builder de nutrición** (`coach/nutrition-plans/*`), NO el panel de la ficha — fuera del alcance de esta unidad. Hallazgos sistémicos transferibles: **S1** (labels uppercase = `font-black`/900 en web, no `font-sans` 400 — L27-33), **S2** (notices Pro = warning ámbar en web, no ember en RN — L35-39), **S3** (split macros P/C/G = ember-500/sport-600/aqua-500 — L41-44). Aplicar S1/S2/S3 como guía de tokens si esta unidad toca labels/notices/macros.

---

## 13. Estado RN actual (divergencias con cita)

- **P0** Card "Hoy" fallback a otro día — `NutricionTab.tsx:80` `?? nutritionTimeline[0]`.
- **P0** Sin early-return de dominio OFF — `NutricionTab.tsx:36-204` (solo Zona C lee flags, L319).
- **P1** Card plan sin CUSTOM/SYNCED/instructions/%macro/Copiar/Ver-como-alumno — `NutricionTab.tsx:110-122`.
- **P1** Sin barras de macro de HOY (solo 2 rings) — `NutricionTab.tsx:125-136`.
- **P1** Heatmap por filas no días calendario, umbral 50 vs 60 — `NutricionTab.tsx:84-87,148-152` + `shared.tsx:100-105`.
- **P1** Sin tile "Sem vs ant." + `null%` sin guard — `NutricionTab.tsx:139-143`.
- **P1** Sin lista de comidas del PLAN con macros — `NutricionTab.tsx:242-264` (muestra comidas del DÍA).
- **P1** Zona C sin `ClientFoodRestrictionsCard` ni `NutritionCycleHistorySection` — `NutricionTab.tsx:322-330`.
- **P1** Detalle de día sin macros/satisfacción/%porción/swaps — `NutricionTab.tsx:239-268`; `ClientDayDetail` no trae esos campos (`coach-client-detail.ts:207-227`).
- **P2** Check-in context simplificado, "Cruzá" (voseo) — `NutricionTab.tsx:174-185,183`.
- **P2** Favoritos slice(0,12), chips destructive, sin caption — `NutricionTab.tsx:188-199`.
- **P2** Hábitos sin gating/suplementos/nota, agua ml, ícono Activity — `NutricionTab.tsx:271-281`.
- **FacturacionTab** existe pero NO montado (D2) — `[clientId].tsx:222-228`; sin form de alta (delegado) — `FacturacionTab.tsx:64`.
- **Paridad razonable:** alertas de coach (mismo `deriveNutritionCoachAlerts`), `FeaturePrefsOverridePanel`, `MealCommentsThread`, `NutrientTargetsEditor`, `PrivateNotePanel`.

---

## 14. Mapa de interacciones (todos los tocables web → efecto)

### Nutrición (NutritionTabB5)
| Tocable | Ubicación | Efecto | RN |
|---|---|---|---|
| Heatmap cell (hover/title) | L632-651 | tooltip fecha/comidas/% | RN celda estática sin tooltip |
| Fila de comida del plan (toggle) | L892-914 | expande/colapsa `openMealId`, chevron rota 90° | RN toggle en comidas del DÍA (L247) |
| Botón "Editar plan" (Link) | L797-803 | navega `/coach/nutrition-plans/client/{clientId}` | RN `onEditNutrition` → `/coach/nutrition-builder` (L112,121) |
| Botón "Copiar" | L804-813 | abre Dialog duplicar (`handleOpenDuplicate`) | **ausente** |
| Select alumno destino | L838-850 | set `dupTargetId` | ausente |
| Botón "Confirmar copia" | L851-858 | `duplicatePlanToClient` → toast + cierra | ausente |
| Link "Ver como alumno" | L814-824 | abre `/c/{coachSlug}/nutrition` (`_blank`) | **ausente** |
| CTA "Abrir plan nutricional" | L1555-1561 | navega editor | RN usa botón en card plan |
| `DetailAccordion` toggle ×2 | L1547,1550 | expande gráficos / historial | **ausente** (sin accordions) |
| `DayNavigator` (fecha) | L1480-1485 | `handleHistoryDateChange` → fetch día | RN flechas ‹/› solo días con log (L233-235) |
| Panel override toggle | RN L580-589 | expande prefs | RN presente |
| Switch por sección | RN L615 / web ClientFeaturePrefsPanel | `setKey` override | presente |
| "Restaurar heredado" | RN L620 | `setDraft({})` | presente |
| "Guardar" prefs | RN L621 | `setClientNutritionOverride` | presente |
| Composer enviar comentario | RN L390-392 | `addCoachMealComment` → reload | presente |
| Input micros + "Guardar" | web L282-291 / RN L488 | `upsert...NutrientTarget` (web valida ≥1 + toast; RN solo Alert error) | presente (sin validación/preview bar) |
| Textarea nota + "Guardar nota" | web L95-104 / RN L526 | `upsertCoachPrivateNote` | presente |
| Restricciones: radiogroup tipo | web L207-226 | set `addType` | **ausente** |
| Restricciones: búsqueda alimento | web L229-248 | debounce `searchCoachFoodLibrary` | ausente |
| Restricciones: add/remove chip | web L266-330 | `setClientFoodRestriction` + toast | ausente |
| Ciclo: "Definir/Editar ciclo" | web L191-200 | abre Dialog ciclo | **ausente** |
| Ciclo: bloques add/quitar/select | web L288-390 | edita `formBlocks` | ausente |
| Ciclo: "Guardar ciclo" | web L395 | `upsertNutritionPlanCycle` + toast | ausente |
| Historial: "Restaurar" | web L249-258 | abre AlertDialog | ausente |
| AlertDialog "Restaurar" | web L402-418 | `restoreClientNutritionPlanFromHistory` + toast | ausente |

### Facturación (BillingTabB8) — oculto D2
| Tocable | Ubicación | Efecto | RN |
|---|---|---|---|
| Botón "Nuevo pago"/"Registrar pago" | web L201-208 / RN L64 | abre Dialog (web) / `onAddPayment` delegado (RN, no montado) | RN sin form real |
| Form: Monto/Fecha/Concepto/Meses | web L231-298 | valida + `addPayment` status paid | **ausente en RN** |
| Botón "Confirmar" | web L309-315 | submit form | ausente |
| Botón "Cancelar" | web L300-307 | cierra + reset | ausente |
| Trash pago | web L372-381 / RN L88-90 | web `window.confirm`+`deletePayment`; RN `Alert.alert`+`deleteCoachClientPayment` | presente |
| Thumbnail comprobante | web L384-403 / RN L83-86 | web link `_blank`; RN `onOpenPhoto` lightbox | presente (patrón nativo) |

---

## 15. Riesgos / gotchas de clase para esta unidad

- **6a (BOMBA -999):** NutricionTab NO usa `@gorhom/bottom-sheet` — Zona C (editor micros, override, comentarios, nota) es todo inline en `StatCard`. Sin sheets críticos → riesgo N/A. Si al portar Copiar/Ciclos/Restricciones se agrega un sheet crítico (editar targets, seleccionar alumno destino), usar `nativeModal` de `components/Sheet.tsx`.
- **6b (congelamiento):** `CoachNutritionZoneC` fetch propio one-shot (`useEffect`, L314). Ficha = pantalla pushed (no tab persistente) → riesgo menor, pero no refresca al recargar el parent. Si se toca, migrar a `useFocusEffect` + señal.
- **6c (Fabric 45798):** `TextInput` de micros (L475-483), nota (L515-523), composer (L382-389) — NINGUNO con estilo condicional por focus. Mantener. Nuevos inputs (form de pago si D2 se revierte) deben cumplir.
- **6d (día Santiago):** `todayIso = getTodayInSantiago().iso` (L55); `logDate` de comentarios/hábitos = día Santiago. Cumple. Cualquier clave de día nueva vía `getSantiagoIsoYmdForUtcInstant`, nunca UTC.
- **6e (notificaciones):** N/A (esta unidad no agenda notificaciones).
- **Nutrición Pro por-alumno (memoria):** el gate de micros avanzados (`showMicros`/`proEnabled`) es por-alumno; respetar el gating compartido de `getCoachNutritionZoneC`. Editar plantilla NO lo muestra — no es bug.

---

## 16. Adaptaciones idiomáticas RN (documentadas)

- `toast.*` (web sonner) → `Alert.alert` (RN) en errores/confirmaciones — preserva el mensaje visible. Nota: RN pierde el `toast.success` de "umbral guardado"/"Nota privada guardada"/"Plan copiado" → considerar toast RN si existe, o Alert de éxito.
- `window.confirm` (web) → `Alert.alert` con acciones (RN) — preserva el gesto de confirmación destructiva.
- framer-motion (web) → sin animación / `transform rotate` (RN) — preserva estados abierto/cerrado.
- Copy voseo a corregir a latino neutro: **"Cruzá"** (NutricionTab L183) → "Cruza".

### PENDIENTE-DECISIÓN-CEO
- **Alcance de esta ola:** `ClientFoodRestrictionsCard` (búsqueda + escritura) y `NutritionCycleHistorySection` (ciclos por fases + restore con AlertDialog) son features grandes AUSENTES en RN. Portarlas ahora vs diferir = decisión de alcance CEO.
- **GESTO — navegador de día:** web `DayNavigator` salta a CUALQUIER fecha (calendario con marcadores); RN solo recorre días con log vía flechas ‹/›. Cambiar RN a un calendario/date-picker altera el gesto de navegación → NO auto-sancionar; decisión CEO.
- **Facturación D2:** mantener `FacturacionTab` oculto del tab bar. Si CEO revierte, falta portar el formulario de alta de pago (web L209-319). No montar sin decisión.
