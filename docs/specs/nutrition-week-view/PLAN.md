# PLAN — Semana completa de nutrición (week view)

## Arquitectura
Clean Architecture intacta: la composición de la semana es lógica PURA en `packages/nutrition-v2`
(una sola verdad web+RN, patrón `day-variants.ts`); las superficies solo llaman servicios que ya
existen y pintan.

```
packages/nutrition-v2/week-view.ts        ← buildNutritionWeek() + NutritionWeekDayState (puro)
packages/nutrition-v2/week-view.test.ts   ← espejo de day-variants.test.ts

apps/web/src/components/nutrition-v2/WeekDayNav.tsx      ← 7 chips Lu-Do interactivos (client)
apps/mobile/components/nutrition-v2/WeekDayNav.tsx       ← gemelo RN (Pressable, 44pt)

alumno web   apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx (+ TodayExperience)
alumno RN    apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx
coach web    apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx (?date=)
coach RN     apps/mobile/app/coach/nutrition-v2/[clientId].tsx
```

## Contrato del helper
```ts
buildNutritionWeek({
  variants,            // plan.dayVariants (las 7 ya viajan)
  history,             // items dispersos del history / recentDays
  weekStartIso,        // lunes de la semana mostrada
  todayIso,
}): NutritionWeekCell[]  // SIEMPRE 7, orden NUTRITION_WEEK_ORDER (Lu..Do)
```
Reglas: variante por `resolveNutritionDayVariantForDow` (puede ser null → "sin plan ese día",
no se inventa la default); `targets` = history si la fila existe, si no proyección; `consumed`
= history o `null`; `state` derivado de fecha vs hoy + presencia de registro.

## Estado por superficie
- **Alumno web**: día seleccionado en `searchParams` (`?dow=` en Plan, `?date=` en Hoy) para que
  sobreviva al back y sea compartible. RSC recompone; `unstable_noStore` ya está.
- **Alumno RN**: estado local del contenedor; `load(date)` ya funciona contra
  `/api/mobile/nutrition-v2/read` (acepta cualquier fecha ≤ hoy+1 para today; plan sin límite).
  Días pasados leen del history ya fetchable; futuros se proyectan sin fetch.
- **Coach web**: `?date=` + el payload actual (`detail.plan.dayVariants` + `recentDays`) — cero
  llamadas nuevas. Aplicar el recorte Pro (`filterHistoryDaysToBaseWindow`) ANTES de componer.
- **Coach RN**: ídem sobre `clientDetail` cacheado (TTL 10 min, sin tocar cache).

## Craft (reglas de estilo que el juez revisa)
- Chips 44pt, `NUTRITION_WEEK_ORDER`, hoy SIEMPRE marcado aunque no esté seleccionado; dot de
  estado (verde cumplido / ámbar parcial / hueco futuro); `tabular-nums` en números.
- El strip nunca se desmonta al cambiar de día; skeleton solo en el cuerpo (umbral 300 ms).
- Pasado: banner sobrio, cero rojo, cero culpa. Futuro: preview sin ningún control de registro.
- Tokens runtime de marca (white-label), nada de hex; dark premium (superficies + hairlines).
- RN: jamás `className` + `style`-función en el mismo elemento; `accessibilityLabel` con día +
  estado; ScrollView horizontal simple (7 ítems, sin FlashList).

## Riesgos y mitigaciones
- Semana que cruza cambio de versión del plan → regla "snapshot gana" cubre el 90%; opción B
  (RPC `get_nutrition_week_v2`) documentada en factibilidad si QA lo exige.
- Cache RN techo 750 KB/entrada → no se agregan bytes al payload (misma data reordenada).
- Colisión de gesto swipe con carruseles internos → v1 sin swipe: solo chips (el gesto se evalúa
  después, NN/G: el chip enseña, el swipe acelera).

## Orden de ejecución (waves)
1. **W1**: `week-view.ts` + tests (bloqueante de todo).
2. **W2**: `WeekDayNav` web + RN (bloqueante de superficies).
3. **W3** (paralelo): alumno web · alumno RN · coach web · coach RN.
4. Juicio Fable por diff + gates (`lint`, `typecheck`, `test`, `tsc` mobile).
