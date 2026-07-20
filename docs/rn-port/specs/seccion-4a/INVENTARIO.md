# Ola 4A — Inventario: Nutrición V2 del alumno (web responsive → RN)

> Fuente de verdad: `apps/web/src/app/c/[coach_slug]/nutrition-v2/**` + `apps/web/src/components/nutrition-v2/**`
> (variante responsive). La superficie V1 (`.../nutrition/**`) quedó OBSOLETA el 2026-07-18:
> `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx:80` redirige a `/nutrition-v2` cuando el rollout
> está activo (mode=on para todos). El plan §Ola 4A apuntaba a V1; este inventario lo reemplaza.

## 0. Hallazgo P0 de ruteo (contexto de todo lo demás)

- Web: el ítem "Nutrición" del nav del alumno apunta a `/nutrition` (`apps/web/src/components/client/ClientNav.tsx:120`)
  y esa página **redirige a `/nutrition-v2`** con rollout activo (`nutrition/page.tsx:67-80`). El alumno web SIEMPRE ve V2.
- RN: el tab `nutricion` de la cápsula (`apps/mobile/components/alumno/AlumnoMobileChrome.tsx:105`) abre
  `apps/mobile/app/alumno/(tabs)/nutricion.tsx`, que es el shell V1 completo (plan V1 `nutrition_meals`,
  toggles, exchanges V1) **sin ningún check del flag `nutritionV2Student`** (grep confirmado: 0 matches en el archivo).
  La pantalla V2 RN existe (`apps/mobile/app/alumno/nutrition-v2/index.tsx`) pero solo se alcanza desde el
  widget de Inicio (`home.tsx:479-480`) y vive FUERA de `(tabs)` → al entrar se pierde la cápsula de navegación
  (mismo problema que 2R-1 resolvió para movimiento/bodycomp).

## 1. Mapa de pantallas y componentes

| Superficie web (responsive) | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Página hub (shell, toolbar Hoy/Plan/Historial, Suspense por vista) | `nutrition-v2/page.tsx:61-140` | `app/alumno/nutrition-v2/index.tsx:1127-1224` | EXISTE con deltas (eyebrow, header, ruteo, chrome) |
| Vista Hoy (badges, lag banner, hero, CTAs, plan de hoy, consumido hoy, diálogos) | `page.tsx:142-187` + `_components/TodayExperience.tsx` | `index.tsx:131-1115` (`TodayTab`) | EXISTE con deltas estructurales grandes |
| Hero AURA (anillo energía + 3 mini-anillos + celebración meta) | `_components/AuraHero.tsx` | `components/nutrition-v2/AuraHero.tsx` | EXISTE; paleta de macros INCORRECTA (carbs azul fijo) |
| Fila "Porciones de hoy" | `_components/PortionCoverageRow.tsx` | `components/alumno/nutrition-v2/PortionDayCoverageRow.tsx` | Cerca de paridad; deltas finos |
| Sección porciones por franja (chips, exceso, [Equivalencias]) | `_components/PortionSlotSection.tsx` | `components/alumno/nutrition-v2/PortionSlotSection.tsx` + `PortionChip.tsx` | Cerca de paridad; deltas finos |
| Sheet de equivalencias de porciones | `_components/PortionEquivalencesSheet.tsx` | `components/alumno/nutrition-v2/PortionEquivalencesSheet.tsx` | EXISTE; FALTA buscador; tabs/CTAs difieren |
| Hook marcar-porción (optimista + deshacer + idempotencia) | `_components/PortionMarks.tsx` + `portion-marks.logic.ts` | `components/alumno/nutrition-v2/usePortionMarks.ts` + `lib/nutrition-v2-portions.ts` | Paridad de contrato; snackbar RN = adaptación del toast sonner |
| Diálogo Registrar alimento (búsqueda + favoritos + cantidad/unidad/franja + aviso dup) | `TodayExperience.tsx:645-938` (`RegisterFoodDialog`) | `app/alumno/nutrition-v2/add-food-v2.tsx` (pantalla) | EXISTE como pantalla (adaptación); FALTA selector de franja y unidades porción/unidad; FALTA aviso dup |
| Diálogo Editar cantidad (motivo obligatorio) | `TodayExperience.tsx:940-1004` | `index.tsx:1025-1115` (`EntryActionSheet`) | EXISTE; FALTA campo motivo y copy |
| Diálogo Retirar registro (motivo obligatorio) | `TodayExperience.tsx:1006-1062` | `index.tsx:1025-1115` (mismo sheet) | EXISTE; FALTA motivo + explicación + confirmación |
| Scanner (página + cámara + código manual + resultado + registro) | `scanner/page.tsx` + `components/nutrition-v2/FoodScannerClient.tsx` | `app/alumno/nutrition-v2/scanner.tsx` | EXISTE; registro sin diálogo cantidad/franja; copys distintos; sin ilustraciones |
| Vista Plan (encabezado, metas, reglas, variantes, franjas, guía por ítem) | `page.tsx:193-416` | `index.tsx:1230-1480` (`PlanTab`) | EXISTE; faltan subtotales, targets de franja, guía de ítems, notas dentro del header |
| Vista Historial (lista de días, legado, paginación) | `page.tsx:418-497` | `index.tsx:1486-1880` (`HistoryTab`) | EXISTE; RN trae EXTRAS no-web (macros por día, detalle expandible) |
| Kit compartido V2 (Card, StatePanel, Skeleton, FoodRow, badges, Sync, MotionButton, Header, Toolbar) | `components/nutrition-v2/NutritionV2Kit.tsx` + `NutritionV2Motion.tsx` | `components/nutrition-v2/NutritionV2Kit.tsx` + `NutritionCard.tsx` | EXISTE; FALTAN ilustraciones del CEO en StatePanel; tonos de botón divergen |
| MacroChipRow | `components/nutrition-v2/MacroChipRow.tsx` | `components/nutrition-v2/MacroChipRow.tsx` | Cerca de paridad (paddings sm) |
| NutritionFoodRow del alumno (miniatura icono de categoría) | `_components/NutritionFoodRow.tsx` + `food-result-image.ts` | RN usa `FoodRow` del kit + `foodCategoryEmojiFromName` | Delta: web = icono estático sobre `bg-primary/10`; RN = emoji |
| Ilustraciones de estado (8 estados del CEO) | `components/nutrition-v2/state-illustration.ts` | — | FALTA por completo en RN |
| loading.tsx del segmento (skeleton toolbar+hero+cards) | `nutrition-v2/loading.tsx` | `NutritionSkeleton` del kit RN | Aproximado (skeleton genérico); aceptable con nota |
| Compartir día (texto compartido) | `TodayExperience.tsx:147-181` (`buildNutritionDayShareText`) | `index.tsx:496-529` | PARIDAD (helper compartido; Share nativo = adaptación legítima) |
| Celebraciones (confeti meta de energía 1×/día) | `AuraHero.tsx:70-104` (sessionStorage + canvas-confetti) | `CelebrationOverlay.tsx` + `lib/nutrition-v2-celebrations*` | RN EXTRA: celebra además meal-logged, day-close y scanner-hit (no existen en web) |

## 2. Estados de dominio / loading / empty / error / offline

| Estado | Web | RN | Veredicto |
|---|---|---|---|
| Rollout V2 OFF | redirect a `/nutrition` V1 (`page.tsx:56`) | `index.tsx:1142-1161`: StatePanel "Nutrición todavía no está disponible…" + botón volver | Adaptación aceptable (RN no puede redirect server-side); copy documentar |
| Dominio nutrición OFF (master switch coach) | nav oculta el ítem (`ClientNav.tsx:44,120`) | cápsula oculta el tile (`AlumnoMobileChrome.tsx:143`); V1 además muestra `NutritionDomainOff` | PARIDAD en nav; la pantalla V2 RN NO chequea `nutritionEnabled` (deep-link desde widget muestra V2 igual) → delta |
| Sin plan publicado (Hoy) | reemplaza TODA la vista: StatePanel ilustración `sin-plan`, "Tu plan todavía no está publicado" (`page.tsx:153-162`) | muestra hero + CTAs + panel al FINAL "Aún no hay comidas prescritas para hoy" (`index.tsx:795-800`) | DELTA estructural + copy |
| Lag de plan (nuevo plan publicado, registro del día en plan anterior) | banner Info con 2 variantes de copy (`page.tsx:164-177`) | no existe | FALTA |
| Día cerrado (snapshotId) | chip "Día registrado" esmeralda (`TodayExperience.tsx:194-199`) | no existe | FALTA |
| Sin franjas para hoy | (no aplica en Hoy web: franjas sin items simplemente no se listan; `PrescribedSection` retorna null `TodayExperience.tsx:582`) | StatePanel "Sin franjas para hoy" (`index.tsx:771-777`) | RN-extra; revisar contra web |
| Sin registros consumidos | StatePanel "Todavía no registras alimentos" (`TodayExperience.tsx:279-284`) | no existe (sección Consumido vive por franja) | FALTA (cae con la reestructura del Hoy) |
| Plan tab vacío | StatePanel ilustración `sin-plan` "No hay un plan vigente" (`page.tsx:195-203`) | igual copy sin ilustración + variante offline (`index.tsx:1322-1337`) | Paridad de copy; falta ilustración |
| Historial vacío | StatePanel ilustración `historial-vacio` (`page.tsx:430-438`) | mismo copy sin ilustración + variante offline (`index.tsx:1659-1670`) | Paridad de copy; falta ilustración |
| Loading (segmento) | `loading.tsx` skeleton toolbar+hero+cards; `ViewSkeleton` por vista (`page.tsx:104-113`) | `NutritionSkeleton` variant today/history (`index.tsx:585-591,1314-1320,1638-1644`) | Aproximado, aceptable |
| Error de escritura | banner rosa dentro de la vista + `DialogError` DENTRO del diálogo, copy humanizado (`TodayExperience.tsx:216-225,427-439`) | `Alert.alert` nativo (`index.tsx:383,415,477`) | Adaptación parcial; copy/ubicación documentar |
| Offline | web SIN cola: porciones muestran toast "sin conexión" sin optimismo (`PortionMarks.tsx:181-185`); intake falla honesto | RN: cola offline completa + overlay optimista + chip `SyncOfflineState` + fila "N pendientes" (`index.tsx:718-724`) | Adaptación nativa legítima YA construida; los ELEMENTOS visibles extra (chip permanente, subtítulo) se documentan |
| Refresco por foco | RSC: `router.refresh()` tras cada mutación + revalidatePath | `useFocusEffect` + `AppState` → `load(true)` (`index.tsx:250-262`) | PARIDAD (adaptación correcta) |

## 3. Restricción de archivos para las waves

`app/alumno/nutrition-v2/index.tsx` contiene shell + Hoy + Plan + Historial (1.880 líneas). Las unidades
4A-02/03/04 comparten ese archivo: NO pueden correr en la misma wave. Orden sugerido en `RANKING.md`.
