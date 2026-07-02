# Auditoría SUPERSERIES — Lente COACH / BUILDER (web)

Fecha: 2026-07-01 · Modo: READ-ONLY (sin cambios de código)
Alcance: cómo se **crean y editan** superseries en el builder web de rutinas
(`apps/web/src/app/coach/builder/[clientId]/**`).

## Archivos clave

- Reducer / modelo: `apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts`
- Render del día + conectores: `apps/web/src/app/coach/builder/[clientId]/components/DayColumn.tsx`
- Render del bloque + badge SS: `apps/web/src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx`
- Orquestación DnD + guardado: `apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`
- Round-trip lectura: `apps/web/src/app/coach/builder/[clientId]/program-read-mappers.ts`
- Agrupación downstream (preview + ejecución alumno): `apps/web/src/lib/workout-block-grouping.ts`
- Vista previa coach: `apps/web/src/app/coach/builder/[clientId]/components/ProgramPreviewDialog.tsx`
- Impresión/PDF: `apps/web/src/app/coach/builder/[clientId]/components/PrintProgramDialog.tsx`
- Tests: `apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.test.ts`

---

## 1. Modelo de interacción

**Representación de datos.** Una superserie NO es una entidad propia: es una **letra**
(`superset_group: 'A' | 'B' | …`) que comparten bloques **contiguos de la misma área**.
El campo vive en `BuilderBlock.superset_group` (`types.ts:38`) y persiste 1:1 a
`workout_blocks.superset_group`. No hay tabla ni id de grupo.

**Invariantes que el reducer intenta mantener** (`usePlanBuilder.ts`, acción `TOGGLE_SUPERSET`):

1. Un grupo = tramo **contiguo** de ≥2 bloques con la misma letra.
2. Todos los miembros comparten la **misma área efectiva** (`effectiveAreaKey`); no se
   permite enlazar calentamiento con principal, etc. (`DayColumn.tsx:412-413`,
   `usePlanBuilder.ts:312`).
3. Singletons se limpian (una letra en un solo bloque no es superserie).
4. Al partir un grupo por el medio, los tramos sobrantes se **re-letran** para no quedar
   no-contiguos con la misma letra (`usePlanBuilder.ts:278-304`).

**Gestos de creación/edición:**

- **Enlazar (link):** conector punteado "Superserie" (icono `Link2`) que aparece **entre**
  dos bloques (`DayColumn.tsx:496-524`). Sólo habilitado si el siguiente bloque existe y es
  de la misma área (`canLinkSuperset`). En desktop el conector está `opacity-0` y se revela
  al hover; en mobile es siempre visible.
- **Extender:** volver a pulsar el conector sobre el **último** miembro de un grupo con un
  siguiente libre amplía el tramo con la misma letra (branch "EXTENDER",
  `usePlanBuilder.ts:249-265`).
- **Quitar (unlink):** (a) botón `Unlink` en el conector de un par ya enlazado
  (`DayColumn.tsx:486-494`), o (b) badge `SS·A` del propio bloque (`ExerciseBlock.tsx:278-291`,
  title "Quitar de la superserie"). Ambos disparan `intent: 'unlink'`.
- **Mobile:** mini-fila con botón `SS` (`ExerciseBlock.tsx:488-501`) que alterna
  link/unlink según el estado del bloque.

**Límites:** no hay tope de tamaño — una superserie de 3, 4, 5+ bloques funciona
(verificado en tests de `quitar del medio de un grupo de 5`). El mínimo es 2 (los singletons
se auto-limpian).

## 2. Representación visual

- **Badge por bloque (`ExerciseBlock.tsx:278-291`):** píldora `SS·<letra>` en color
  `var(--theme-primary)` (marca del coach). Se renderiza **siempre** que
  `block.superset_group` sea truthy, exista o no un compañero contiguo.
- **Conector enlazado (`DayColumn.tsx:476-495`):** línea vertical + líneas horizontales +
  píldora `SS · <letra>` en color `primary` (que resuelve a `--theme-primary`, `globals.css:218`).
- **Conector no-enlazado:** botón punteado "Superserie" con `Link2`, deshabilitado si el
  siguiente es de otra área (con tooltip explicativo).
- **Vista previa coach (`ProgramPreviewDialog.tsx:176-189`):** aquí SÍ hay un **contenedor**
  con borde (`border-primary/25 bg-primary/[0.06]`) que abraza el grupo, con encabezado
  "Superserie · grupo A". Agrupa vía `groupContiguousSupersetRuns` (contigüidad estricta).
- **Impresión/PDF (`PrintProgramDialog.tsx:69,132-134`):** tag por bloque `Superset A` con
  color **azul hardcodeado** (`#dbeafe`/`#1d4ed8`) y texto en inglés; sin agrupación visual.

Observación: el tablero del día usa **conectores por hueco** (no un bracket que abrace todo
el grupo), mientras que la vista previa sí usa un contenedor. Inconsistencia de metáfora
entre las dos superficies del propio coach.

## 3. Reordenar / mover entre días / duplicar / A-B

- **Reordenar dentro del día (`MOVE_BLOCK` → `arrayMove`, `usePlanBuilder.ts:81-87`):** NO
  toca `superset_group`. Si el coach arrastra un bloque **libre al medio** de una superserie
  (o mueve un miembro fuera / junto a otro grupo), quedan letras iguales **no contiguas**.
- **Mover entre días (`TRANSFER_BLOCK`, `usePlanBuilder.ts:89-110`):** copia el bloque con
  `superset_group` **intacto** (`{ ...activeBlock, dayId: overDayId }`, línea 106) y lo
  **appendea al final** del día destino. Rompe el grupo origen (queda no-contiguo) y, en
  destino, o deja una letra huérfana o **se fusiona** con un grupo que casualmente termine en
  la misma letra.
- **Cambiar de área (`SET_BLOCK_AREA`, `usePlanBuilder.ts:181-191`):** rompe la superserie
  **completa** del bloque movido (intencional y documentado; correcto).
- **Duplicar día (`COPY_DAY`, `usePlanBuilder.ts:118-156`):** re-letra los grupos copiados a
  letras libres del destino para no fusionar en la costura (fix con test). Correcto.
- **Modo A/B (`WeeklyPlanBuilder.tsx:137-139`):** son dos instancias `usePlanBuilder`
  independientes; cada variante mantiene sus propias superseries y letras aisladas.
  No hay fuga entre A y B. Correcto.

## 4. Edge cases UI

- **Superserie de 3+:** OK — badges en cada bloque + conectores entre cada par. Sin bracket
  único; con muchos miembros la lectura se apoya sólo en la letra repetida.
- **Bloques de tipos distintos:** el único guard es **misma área**; NO se valida el
  `exercise_type`. Se puede meter un `strength` y un `cardio` en la misma superserie si están
  en la misma área. Puede ser deseable, pero no hay aviso.
- **Descanso dentro de superserie:** no existe "bloque descanso"; el descanso es el chip
  `rest_time` de cada ejercicio. No hay concepto de descanso entre rondas de la superserie.
- **Letra huérfana:** un bloque con letra pero sin compañero contiguo muestra el badge `SS·A`
  igual (síntoma visible de los bugs de drag). El conector NO se dibuja (requiere `linkedToNext`).

## 5. Downstream / persistencia

`builder.actions.ts` (guardado) **no sanea** `superset_group`: persiste verbatim lo que haya
en el estado, incluyendo grupos no-contiguos u huérfanos producidos por drag. `order_index`
se reasigna secuencial al guardar (`WeeklyPlanBuilder.tsx:933`), por lo que
`groupContiguousSupersetRuns` (que exige `order_index === prev+1` **y** misma letra) partirá un
grupo no-contiguo en **superseries degeneradas de un solo bloque**, ambas etiquetadas con la
misma letra, tanto en la vista previa como en la ejecución del alumno.

---

## Hallazgos (severidad)

### ALTA

**H1 — Mover bloque entre días (`TRANSFER_BLOCK`) arrastra `superset_group` y corrompe grupos.**
`usePlanBuilder.ts:106`. El bloque llega al día destino con su letra intacta y appendeado al
final: (a) rompe el grupo del día origen dejándolo no-contiguo, (b) deja una letra huérfana en
destino, o (c) si el día destino termina en un bloque con la misma letra, **fusiona** dos
ejercicios sin relación en una superserie fantasma. Silencioso; se guarda tal cual.
Comparar con `SET_BLOCK_AREA`, que sí limpia la superserie al mover.

**H2 — Reordenar por drag (`MOVE_BLOCK`/`arrayMove`) no repara superseries → letras no
contiguas.** `usePlanBuilder.ts:81-87`. Arrastrar un bloque libre al medio de una superserie,
o mover un miembro junto a otro grupo, produce mismo-letra-no-contiguo. Al guardar,
`groupContiguousSupersetRuns` lo degrada a superseries de un solo bloque en preview y en la app
del alumno. El reducer cuida esta invariante en `TOGGLE_SUPERSET` pero el drag la evade.

### MEDIA

**H3 — El conector "Superserie" entre dos grupos distintos adyacentes (A|B) desagrupa el
primero en vez de fusionar/extender.** `usePlanBuilder.ts:249-306` + `DayColumn.tsx:496-524`.
Con `m1=A, m2=A, m3=B, m4=B` el conector entre m2 y m3 aparece habilitado; al pulsarlo (intent
`link`) el branch EXTENDER se salta (m3 ya tiene letra) y cae en QUITAR, borrando el grupo A.
El botón promete "Agrupar como superserie con el siguiente" y hace lo contrario.

**H4 — Descubribilidad del gesto en desktop.** `DayColumn.tsx:497` (`opacity-0
md:hover:opacity-100`). El afford​ance de crear superserie es **invisible** hasta hacer hover
justo en el hueco entre dos bloques; combinado con el badge `SS·A` diminuto, la feature es
difícil de encontrar. Además esos botones invisibles siguen en el DOM y son focuseables
(ruido de teclado/a11y).

**H5 — El guardado no normaliza superseries.** `builder.actions.ts` (sin lógica de
`superset_group`). Cualquier estado inconsistente (H1/H2) se persiste; no hay red de
seguridad server-side que colapse huérfanos ni re-letre no-contiguos.

### BAJA

**H6 — Todas las superseries usan el mismo color y no hay bracket único.** `DayColumn.tsx:481`,
`ExerciseBlock.tsx:282`. Dos grupos adyacentes (A y B) se ven casi idénticos: sólo difieren en
la letra pequeña. Para superseries de 3+ no hay contenedor que abrace el grupo en el tablero
(la vista previa sí lo tiene → inconsistencia entre superficies del coach).

**H7 — Impresión/PDF: tag azul hardcodeado, texto en inglés y sin agrupar.**
`PrintProgramDialog.tsx:69,133-134`. Ignora el color de marca del coach (siempre azul), dice
"Superset" (resto de la app: "Superserie") y muestra un tag por bloque sin bracket ni orden de
ejecución de la superserie.

**H8 — No se valida el tipo de ejercicio al enlazar.** `usePlanBuilder.ts:312`. Sólo exige
misma área; permite superserie mixta strength+cardio sin advertencia. Posiblemente intencional,
pero sin señal al coach.

**H9 — El badge `SS·A` se pinta aunque el bloque no tenga compañero contiguo.**
`ExerciseBlock.tsx:278`. Etiqueta de superserie sobre un ejercicio solo — es el síntoma visible
de H1/H2 y confunde incluso sin bug si un import externo dejó datos sueltos.

---

## Mejoras propuestas (priorizadas)

1. **(H1/H2) Reparar superseries tras cada drag.** Añadir un normalizador puro
   `sanitizeSupersets(blocks)` (colapsa singletons, re-letra tramos no-contiguos) y llamarlo al
   final de `MOVE_BLOCK`, `TRANSFER_BLOCK` y del reorder en `handleDragEnd`. En `TRANSFER_BLOCK`,
   por defecto **limpiar** `superset_group` del bloque movido (como hace `SET_BLOCK_AREA`), o
   insertarlo respetando contigüidad. Reusar la lógica de re-letrado que ya existe en
   `TOGGLE_SUPERSET`.
2. **(H5) Sanear en el guardado.** Correr la misma normalización en `mapDays`
   (`WeeklyPlanBuilder.tsx:880-936`) o en `builder.actions.ts` antes de persistir, como red de
   seguridad server-side idempotente.
3. **(H3) Arreglar la semántica del conector entre grupos distintos.** O deshabilitar el
   conector "link" cuando ambos lados ya pertenecen a grupos (con tooltip "ya están en
   superseries"), o implementar **merge** real de A y B en una sola letra.
4. **(H4) Mejorar descubribilidad en desktop.** Mostrar el conector con baja opacidad
   persistente (no `opacity-0`), o un affordance "+" siempre visible entre bloques enlazables;
   quitar del tab-order los botones ocultos.
5. **(H6) Diferenciar grupos y abrazarlos visualmente.** Bracket/contenedor por superserie en
   el tablero (como la vista previa) y alternar tinte/estilo por letra para distinguir A de B.
6. **(H7) Unificar impresión con la marca e idioma.** Usar el color de tema, "Superserie" y un
   bracket agrupador con orden de ejecución.
7. **(H8) Aviso opcional al mezclar tipos** muy dispares en una superserie (informativo, no
   bloqueante).
