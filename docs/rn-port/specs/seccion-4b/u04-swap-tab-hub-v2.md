# 4B-04 — SWAP: el tab "Nutrición" del coach abre el Centro V2 (P0 de ruteo)

Archivos RN: `apps/mobile/app/coach/(tabs)/nutricion.tsx` (decisión V1/V2),
`apps/mobile/app/coach/nutrition-v2/index.tsx` (entrada), posible `(tabs)/_layout.tsx`,
helper puro nuevo + test. Unidad SOLITARIA en su wave (colisión con 4B-05 en `index.tsx`).
Referencia web: `apps/web/src/app/coach/nutrition-plans/page.tsx:38-40` +
`_lib/nutrition-v2-swap.ts:19-31` (swap) y `nutrition-v2/page.tsx:35-42` (redirect inverso).

## Hallazgo (P0)

- Web: nav coach → `/coach/nutrition-plans` evalúa `shouldSwapCockpitToNutritionV2` (mismo gate
  `isNutritionV2Enabled({surface:'webCoach'})`) y con gate ON redirige a `/coach/nutrition-v2`
  (Centro V2). El hub V2 redirige de vuelta si el gate está OFF. Rollout en `mode=on` ⇒ el coach
  web SIEMPRE ve V2.
- RN: el tab (`CoachMobileChrome.tsx:30` → `/coach/nutricion`) abre el hub V1
  (`(tabs)/nutricion.tsx`) sin ningún check de `nutritionV2Coach`; el hub V2
  (`app/coach/nutrition-v2/index.tsx`) está HUÉRFANO (solo deep-links internos: self `:304`,
  builder `:221`, ficha vía `coach-nutrition-v2-tab-logic.ts:159-160`). El hub V2 ya se
  auto-gatea fail-closed (`index.tsx:81` `entitlements.ready && isEnabled('nutritionV2Coach')` +
  scope de workspace `:73-79`).

## Cierre

1. `(tabs)/nutricion.tsx` decide V1/V2 espejo del swap web: con entitlements listos y
   `isEnabled('nutritionV2Coach')` ON → el tab muestra el Centro V2; OFF → shell V1 intacto
   (rollback puro, decisión owner: V1 al olvido, sin trabajo nuevo sobre él). Mientras
   entitlements no estén listos: loader, NUNCA flashear V1 y saltar.
2. Mecanismo: espejar el patrón que 4A-01 usó para el tab del alumno (estudiar cómo
   `alumno/(tabs)/nutricion.tsx` resuelve V1/V2 con cápsula y replicarlo). Los deep-links
   existentes a `/coach/nutrition-v2` deben seguir funcionando; si se agregan o mueven rutas,
   corre el gate de export Android.
3. La decisión V1/V2 va en helper puro testeable (flag + ready → 'loading' | 'v1' | 'v2') con
   test; reusar/extender `tests/mobile-coach-nutrition-v2-tab-logic.test.ts` si corresponde.
4. Fuera de alcance de esta unidad: header/eyebrow/CTA del hub (4B-05), tabs
   Alimentos/Curación (4B-06/07). El canary por-alumno NO abre el hub global (espejo web:
   el swap resuelve por coach/workspace); documentar.

## Comprobación objetiva

Con flag ON: tocar el tab "Nutrición" del coach aterriza en el Centro V2 (roster) conservando la
navegación de la cápsula; con flag OFF (Edge Config), el mismo tab muestra el hub V1 como hoy.
Deep-links previos a `/coach/nutrition-v2` siguen operativos.

## Cierre ejecutado (2026-07-21)

**Mecanismo elegido: render INLINE del hub dentro del tab (no `router.replace`).** Se estudió el
patrón del alumno 4A-01 (`alumno/(tabs)/nutricion.tsx` → `router.replace('/alumno/nutrition-v2')`):
ahí el V2 vive DENTRO de `(tabs)` como rutas ocultas (`(tabs)/nutrition-v2/*`, `href:null`) y
`AlumnoMobileChrome` pliega `nutrition-v2/*` al tile "Nutrición", por eso el replace conserva la
cápsula. En el coach el hub V2 vive FUERA de `(tabs)` (`coach/nutrition-v2/index.tsx`) junto a
`[clientId].tsx` y `builder/[clientId].tsx`; un `replace` a esa ruta abandonaría el navegador de
tabs (la cápsula `CoachMobileTabBar` solo se monta bajo `(tabs)/_layout.tsx`) → cápsula perdida.
Mover las tres rutas a `(tabs)` exigiría además tocar `CoachMobileChrome` para plegar
`nutrition-v2/*` al tile — fuera de la propiedad de esta unidad. Se verificó que la cápsula del
coach es un overlay flotante (`StyleSheet.absoluteFill` + `position:absolute`) cuyo tile activo
deriva del **nombre de la tab** (`activeName`, `CoachMobileChrome.tsx:79,111`): mientras la tab
activa sea `nutricion`, el tile "Nutrición" queda resaltado sin importar si el cuerpo del tab pinta
V1 o V2. Por eso el render inline del hub dentro de `(tabs)/nutricion.tsx` cumple la comprobación
objetiva (Centro V2 con cápsula intacta y tile activo) **sin mover rutas** → no se corrió el gate de
export (no aplica).

**Decisión pura + fail-closed.** `resolveCoachNutritionTabMode({ entitlementsReady, nutritionV2CoachEnabled })
→ 'loading' | 'v1' | 'v2'` en `apps/mobile/lib/coach-nutrition-v2-tab-logic.ts` (mismo flag
`nutritionV2Coach`, default `false` en el bundle). `'loading'` mientras entitlements no estén listos
(loader `EvaLoaderScreen`, mismo componente que 4A-01, NUNCA flashea V1). El hub conserva intacto su
propio fail-closed más estricto (`index.tsx:81` entitlements + `:73-79` scope de workspace): el swap
solo elige QUÉ superficie montar, no autoriza datos. Test: 3 casos nuevos en
`tests/mobile-coach-nutrition-v2-tab-logic.test.ts` (6/6 verdes).

**Canary por-alumno (espejo web).** `fetchNutritionV2CoachFlagForClient`/`useNutritionV2CoachFlagForClient`
(`entitlements.ts:225,254`) resuelven el flag POR ALUMNO solo para que un canary acotado alcance la
ficha/constructor del coach; **no** abren este hub global. El swap del tab usa exclusivamente el flag
global `isEnabled('nutritionV2Coach')`, igual que el swap web resuelve por coach/workspace.

**Archivos tocados:** `apps/mobile/app/coach/(tabs)/nutricion.tsx` (nuevo default `CoachNutricionTab`
con la decisión; el shell V1 se conserva íntegro renombrado a `CoachNutricionV1Screen`, rollback puro),
`apps/mobile/lib/coach-nutrition-v2-tab-logic.ts` (+helper), test (+3). `index.tsx` y `(tabs)/_layout.tsx`
**sin cambios** (el mecanismo inline no los exige). Gates: `tsc --noEmit` 0 errores; vitest 6/6;
eslint 0 errores (4 warnings preexistentes del shell V1, ajenos a esta unidad).
