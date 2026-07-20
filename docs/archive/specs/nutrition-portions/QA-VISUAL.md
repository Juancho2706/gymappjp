# QA-VISUAL — Auditoria estatica del criterio 11 (T5.3, adaptada)

> 2026-07-17 · Auditoria de codigo (sin app corriendo: migraciones 20260718140000/150000
> SIN aplicar). El QA visual real en device es fase de operacion del CEO — checklist
> exacta al final. Alcance: archivos NUEVOS de porciones de olas 1-2 (web + mobile).

## Criterios auditados

| # | Criterio |
|---|---|
| C1 | Tokens semanticos (surface-card / border-border-subtle / text-strong / text-muted / rounded-control / ring) — sin hardcodes indebidos |
| C2 | Light/dark: cada color con par correcto |
| C3 | White-label: acciones/progreso = `primary`; color de grupo SOLO en el circulito con letra blanca |
| C4 | 360 px sin overflow horizontal (flex + truncate + scroll-x) |
| C5 | Targets tactiles >= 44 px |
| C6 | A11y (SPEC UX-b): roles/aria, segmentos decorativos `aria-hidden` |
| C7 | Copy 100% desde `PORTIONS_COPY` (tabla UX-d) |

## Matriz superficie x criterio

`OK` = pasa · `FIX` = violacion corregida en esta pasada · `H#` = hallazgo reportado (sin tocar)

| Superficie | Archivo | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|---|---|---|---|---|---|---|---|---|
| Builder paso 2 — seccion porciones | `apps/web/.../builder/_components/PortionsSection.tsx` | OK | **FIX** (F1) | OK | OK | OK | OK | H3 |
| Builder — circulito de grupo | `.../builder/_components/PortionsGroupDot.tsx` | OK | OK | OK | OK | n/a | OK | n/a |
| Builder — picker de grupos | `.../builder/_components/PortionsGroupPicker.tsx` | OK | OK | OK | OK | OK | OK | H3 |
| Builder paso 1 — derivar objetivos | `.../builder/_components/PortionsDeriveCard.tsx` | OK | OK | OK | OK | OK | OK | OK |
| Builder paso 3 — revision | `.../builder/_components/PortionsReviewChips.tsx` | OK | OK | OK | OK | n/a | OK | OK |
| Quick-edit web — porciones | `apps/web/.../_quick-edit/EditablePortionsCard.tsx` | OK | OK | OK | OK | OK | OK | H3 |
| Ficha alumno (coach) — cobertura dia | `apps/web/.../[clientId]/PortionDayCoverageCard.tsx` | OK | OK | OK | OK | n/a | H5 | OK |
| Alumno Hoy — fila "Porciones de hoy" | `apps/web/.../c/.../_components/PortionCoverageRow.tsx` | OK | OK | OK | OK | n/a | H5 | OK |
| Alumno Hoy — chips de franja + confirm extra | `apps/web/.../c/.../_components/PortionSlotSection.tsx` | OK | OK | OK | H4 | OK | H5 | H3 |
| Alumno — sheet equivalencias web | `apps/web/.../c/.../_components/PortionEquivalencesSheet.tsx` | OK | OK | OK | OK | OK | H5 | H3 |
| Alumno — estado marcar-porcion (toasts) | `apps/web/.../c/.../_components/PortionMarks.tsx` | n/a | n/a | n/a | n/a | n/a | n/a | H3 |
| RN alumno — chip + segmentos | `apps/mobile/components/alumno/nutrition-v2/PortionChip.tsx` | OK | OK | OK | H4 | OK | OK | OK |
| RN alumno — seccion de franja + confirm extra | `.../alumno/nutrition-v2/PortionSlotSection.tsx` | OK | OK | OK | OK | OK | OK | H3 |
| RN alumno — fila del dia | `.../alumno/nutrition-v2/PortionDayCoverageRow.tsx` | OK | OK | OK | OK | n/a | OK | OK |
| RN alumno — sheet equivalencias | `.../alumno/nutrition-v2/PortionEquivalencesSheet.tsx` | OK | OK | OK | OK | OK | OK | H3 |
| RN alumno — snackbar | `.../alumno/nutrition-v2/PortionSnackbar.tsx` | OK | OK | OK | OK | OK | OK | n/a |
| RN quick-edit — porciones | `apps/mobile/components/nutrition-v2/quick-edit/EditablePortionsSection.tsx` | OK | OK | OK | OK | **FIX** (F2) | OK | H3 |

## Fixes aplicados (solo clases/estilos, cero comportamiento)

### F1 — Par dark faltante en el hover destructivo del builder
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PortionsSection.tsx:263`
El boton eliminar tenia `hover:text-rose-600` SIN par dark, mientras sus hermanos del
mismo feature (`EditablePortionsCard.tsx:162`) y el patron fuente del quick-edit
(`EditableItemRow.tsx:108`) llevan `dark:hover:text-rose-400`.
**Fix**: se agrego `dark:hover:text-rose-400` a la clase. Solo clases.

### F2 — Targets tactiles de 32 px en el quick-edit RN
`apps/mobile/components/nutrition-v2/quick-edit/EditablePortionsSection.tsx:148,158`
Los botones Nota y Quitar eran `h-11 w-8` = 44x32 px (< 44 px de ancho efectivo).
**Fix**: `hitSlop={6}` en ambos Pressable (area tactil efectiva 44x56 px, cero cambio
de layout; mismo recurso que `hitSlop` en `PortionChip`/`PortionSnackbar`).

Gates focalizados tras los fixes:
- `pnpm --filter @eva/mobile exec tsc --noEmit` -> limpio.
- `npx vitest run .../builder/_components/portions-state.test.ts` -> 13/13 verde.

## Hallazgos reportados (NO tocados — en duda, se reporta)

### H3 — Strings de UI fuera de `PORTIONS_COPY` (sin clave en la tabla UX-d)
Ninguno es un string de la tabla UX-d hardcodeado (esos estan 100% via `PORTIONS_COPY`,
verificado archivo por archivo). Son microcopy NUEVA que la tabla no define — agregar
claves es decision de copy del jefe, no de esta pasada:

| Archivo:linea | String |
|---|---|
| web `PortionSlotSection.tsx:245,255` | "Cancelar" / "Marcar" (botones del confirm de exceso) |
| RN `PortionSlotSection.tsx:149,153,157` | "Marcar extra" / "Cancelar porción extra" / "Cancelar" — **diverge del web** ("Marcar" vs "Marcar extra") |
| web `PortionSlotSection.tsx:169` | `title="Guardando…"` del puntito pending |
| web `PortionEquivalencesSheet.tsx:88,132` | "Cerrar" (aria de backdrop y boton X) |
| web `PortionEquivalencesSheet.tsx:180,183` | "Buscar alimento equivalente" / "Buscar alimento" |
| web `PortionEquivalencesSheet.tsx:194-195` | "Sin resultados para tu búsqueda." / "Aún no hay alimentos clasificados en este grupo…" |
| RN `PortionEquivalencesSheet.tsx:194` | "Aún no hay alimentos de referencia para este grupo." — **texto distinto al web** para el mismo estado |
| web `EditablePortionsCard.tsx:118` | toast "Grupo {x} eliminado" |
| web `PortionMarks.tsx:143,155` | "No se pudo deshacer la porción." (x2) |
| web `PortionsGroupPicker.tsx:106` | "Cargando grupos…" (el "No pudimos cargar los grupos." + "Reintentar" SI son literales del SPEC UX-c) |
| RN `EditablePortionsSection.tsx` | "Restar/Sumar media porción de {g}", "Nota (opcional)", "Nota para {g}" (labels a11y + placeholder) |

Recomendacion: unificar web/RN (confirm de exceso y empty-state del sheet) y subir todo
a `PORTIONS_COPY` en una pasada de copy unica antes del release.

### H4 — Sin cap visual de segmentos con prescripciones grandes
`segmentsForTarget` (web `portion-marks.logic.ts:148`) y `buildPortionCoverageView`
(RN `nutrition-v2-portions.ts:443`) pintan UN segmento por porcion prescrita sin tope;
el contenedor de segmentos es `shrink-0` (web `PortionSlotSection.tsx:171`). Con targets
realistas (1-6 por grupo/franja) el chip cabe sobrado en 360 px; con >=10 porciones en
un grupo (el CHECK de DB admite hasta 99) los segmentos comprimen el nombre a cero y
pueden desbordar el chip. Cambiarlo toca logica compartida (prohibido en esta pasada).
Recomendacion F2: cap visual (~8 segmentos) + solo contador `n/N` por encima del cap.
**Punto explicito del QA en device: probar una franja con 10 porciones de un grupo.**

### H5 — Detalles a11y menores (semantica, no bloqueantes)
- `PortionCoverageRow.tsx:71` y `PortionDayCoverageCard.tsx:43`: `aria-label` sobre un
  `<span>` sin `role` — muchos lectores lo ignoran. Mitigado: el contador `n/N` es texto
  real. Sugerencia: `role="img"` o quitar el aria-label.
- web `PortionSlotSection.tsx:233`: `role="alertdialog"` en un confirm inline NO modal y
  sin manejo de foco — semantica excesiva; `role="group"` + `aria-live="polite"` seria
  mas honesto.
- web `PortionEquivalencesSheet.tsx:103`: `role="dialog" aria-modal` sin focus-trap.
  Es el espejo exacto del patron V1 (`ExchangeEquivalencesSheet.tsx:56`, misma clase
  `rounded-t-3xl ... md:bottom-4`) — deuda heredada del patron, no regresion de porciones.
- Tabs del sheet: web usa `aria-pressed` (toggle), RN usa `accessibilityRole="tab"` +
  `selected`. Ambos validos; inconsistencia cosmetica entre plataformas.

## Verificaciones que PASAN (evidencia, para no re-litigar)

- **`bg-primary/100`** (web sheet tab activa): NO es un typo — es el patron deliberado
  del repo (`NutritionV2Motion.tsx:27,146`, `NutritionV2Kit.tsx:431`; gotcha
  `--theme-primary-rgb` con comas). `text-white` sobre `primary` = convencion del kit
  en web y RN (`NutritionMotionButton` RN usa `#FFFFFF` como iconColor del tono primary).
- **Amber/emerald**: todos los usos en porciones llevan par dark explicito
  (`dark:bg-amber-950/*`, `dark:text-amber-300`, `dark:border-emerald-700/50`, etc.),
  identica convencion de los componentes nutrition-v2 existentes (`TodayExperience.tsx:869`,
  `HubRoster.tsx:341`). Cero `var(--ink-700)` ni hex crudos de superficie/texto.
- **RN `warning-700`/`danger-700`/`success`**: tokens CSS-var theme-aware
  (`apps/mobile/global.css:72` light `143 90 5` -> `:170` dark `#FFD489`) — flipean solos.
- **White-label (C3)**: el hex del grupo (`exchangeGroupColor`) aparece SOLO como
  `backgroundColor` del circulito con letra blanca en TODAS las superficies (5 GroupDot
  auditados); relleno de segmentos y barras de progreso = `bg-primary` (o `bg-primary/70`
  para derivadas, `bg-primary/50` pending RN); acciones = `text-primary`/tonos del kit.
  Jamas texto coloreado con el hex del grupo.
- **Segmentos decorativos (C6)**: web `aria-hidden="true"` en el contenedor
  (`PortionSlotSection.tsx:171`); RN `accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"` (`PortionChip.tsx:149-150`). El chip
  interactivo lleva `role="button"` + `chipAria`/`halfChipAria` de PORTIONS_COPY en ambos.
- **360 px (C4)**: filas del builder/quick-edit = nombre `min-w-0 flex-1 truncate` +
  stepper de ancho fijo (SPEC UX-a); filas de cobertura = `overflow-x-auto` (web) /
  `ScrollView horizontal` (RN). Unica excepcion: H4.
- **Targets (C5)**: steppers y botones icono 44 px (`h-11 w-11`); CTAs `min-h-11`;
  triggers ghost `min-h-9` (patron bendecido por el criterio 11); opciones de picker
  `min-h-12`. Tras F2 no queda ningun target < 44 px efectivos.
- **Capa invisible (UX-c)**: todas las superficies retornan `null` sin targets
  (`rows.length === 0`, `portionGroups.length === 0 && ...`, `slotHasPortionTargets`).

---

## Checklist EXACTA para el QA en device del CEO (fase operacion)

Pre-requisitos: migraciones aplicadas, un plan `structured` con porciones publicado
(idealmente el de Alan convertido), un coach con white-label de color claro (p.ej.
amarillo/lima) y otro con el primary por defecto. Cada bloque se corre 4 veces:
**light / dark / white-label claro / 360 px** (DevTools o device chico).

### 1. Builder coach (web, paso 2)
- [ ] La seccion "Porciones a elección" aparece bajo "+ Alimento" dentro de la card de franja.
- [ ] Circulito del grupo: color del catalogo, letra blanca LEGIBLE en light Y dark.
- [ ] Stepper: - deshabilitado en 0,5; pasos de 0,5; coma decimal ("1,5"); tap en el valor abre edicion.
- [ ] 360 px: nombre del grupo trunca con "…", el stepper NO se comprime, sin scroll-x de pagina.
- [ ] Hover del tacho: rosa visible en light (rose-600) y en dark (rose-400) [F1].
- [ ] Picker "+ Agregar grupo": popover en desktop, bottom sheet en movil; 9 system primero; usados deshabilitados ("Ya está en esta comida"); badge "Valores referenciales" legible en ambos temas.
- [ ] Simular fallo de red al abrir el picker: estado "No pudimos cargar los grupos." + Reintentar; los items fijos de la franja siguen editables.

### 2. Builder paso 1 y paso 3 (web)
- [ ] Con porciones en el draft, card "Tus porciones suman ~… kcal" en tono primary/10 del coach (white-label) + boton "Usar como objetivos" precarga y NO sobrescribe sin tap.
- [ ] Paso Revisar: chips "2C · 1,5V" por franja; banner ambar si hay grupo con macros referenciales — contraste OK en dark.

### 3. Quick-edit coach (web y RN)
- [ ] Seccion visible SOLO si el plan tiene porciones; plan sin porciones = cero UI nueva.
- [ ] Alta/baja/step cuentan en la barra "N cambios sin publicar" (1 cambio = 1).
- [ ] Eliminar grupo -> toast con Deshacer restaura en el mismo indice.
- [ ] RN: stepper SOLO botones (jamas teclado numerico); campo Nota no queda tapado por el teclado; botones Nota/tacho responden en todo su alto y con margen lateral [F2].

### 4. Alumno "Hoy" (PWA y RN)
- [ ] AuraHero intacto como heroe; "Porciones de hoy" como fila compacta debajo; scroll-x de chips en 360 px SIN scroll horizontal de pagina.
- [ ] Chip de franja: tap llena el siguiente segmento con el PRIMARY del coach (probar con white-label claro: el relleno cambia de color, el circulito NO).
- [ ] Media porcion = semicirculo final; contador "n/N" con coma es-CL.
- [ ] Snackbar "Porción marcada · Deshacer" 5 s; Deshacer revierte contador Y anillos de macros.
- [ ] Grupo completo: check verde; tap extra pide "¿Marcar una porción extra?" y el "+n" sale en ambar — legible en dark.
- [ ] Registrar un alimento clasificado del grupo en la franja: segmento derivado con anillo fino, distinguible del marcado a mano; tooltip/aria "Cubierta por {alimento}".
- [ ] **Stress H4**: franja con 10 porciones de un grupo en 360 px — el chip no debe romper el layout de la card.
- [ ] Offline (PWA): tap muestra "Sin conexión…" sin marca fantasma. Offline (RN): segmento pending (opacidad + puntito ambar) y sincroniza al volver la senal; deshacer offline no duplica al re-marcar.
- [ ] VoiceOver/TalkBack: el chip anuncia "Marcar 1 porción de {grupo}. Llevas n de N."; los segmentos NO se anuncian.

### 5. Sheet de equivalencias (PWA y RN)
- [ ] Abre desde [Equivalencias] y con long-press en el chip; tap corto JAMAS abre el sheet.
- [ ] Tabs si hay varios grupos (activa = primary del coach); lista alimento — medida — g; buscador filtra (web).
- [ ] Badge "Valores referenciales" si aplica; grupo sin foods clasificados muestra empty-state y deja marcar igual.
- [ ] CTAs: "Marcar 1 porción" (con confirm de exceso) y "Registrar alimento" preseleccionando la franja + aviso anti-duplicado si ya hay marcadas del grupo.
- [ ] RN: sheet nativeModal fluido (gotcha gorhom/reanimated), footer visible sobre el safe-area.

### 6. Ficha alumno (coach, web)
- [ ] Card "Porciones" read-only bajo los macros del dia: chips n/N con circulito, check al completar, "+n" en exceso; nota "La cobertura derivada…" visible.
- [ ] Alumno sin porciones ese dia -> la card NO aparece.

### 7. Transversales
- [ ] Toggle light->dark en caliente en cada superficie: ningun texto ilegible ni fondo sin flip.
- [ ] White-label claro: letra blanca del circulito sigue legible (los 9 colores system); progreso/acciones toman el primary del coach.
- [ ] Zoom del navegador 200% (PWA) y font-scale grande (RN): sin solapes en las filas de stepper.
