---
status: in-progress
owner: product-engineering
last_verified: "2026-09-07"
canonical: false
---

# TASKS — Plan vivo y guardado honesto

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**
Push, deploy y OTA solo a pedido del owner.

## W0 · Decisiones del owner (2026-09-07)

- [x] W0.1 D1-A — retirar hoy la UI del sync en RN, sin reescribir el algoritmo.
- [x] W0.2 D2-A — plan inactivo: avisar y ofrecer salida; se sigue pudiendo editar y guardar.
- [x] W0.3 D3-A — nombres: solo identidad en pantalla, cero cambios en la base.

## A · Retirar el sync destructivo de la app (R4)

- [x] A1 `ProgramCard.tsx:67-69` — quitar el item `sync` del menú y la prop `onSync`; limpiar el
      import de `GitMerge` si queda sin uso.
- [x] A2 `ProgramPreviewCard.tsx:134-136` — quitar el botón y su prop `onSync`.
- [x] A3 `(tabs)/builder.tsx` — borrar `confirmSync` (`:383-405`), el `onSync` del preview (`:615`),
      el import de `syncProgramFromTemplate` (`:36`) y el estado `sync-…` de `actionBusy` si queda huérfano.
- [x] A4 `library-actions.ts:109` — dejar `syncProgramFromTemplate` exportada y sin callers, con
      comentario de cabecera que explique el retiro y apunte al SPEC (espejo de
      `ProgramPreviewPanel.tsx:363-366` en web).
- [x] A5 `pnpm lint:mobile` + `pnpm typecheck` en verde.

## B · Que se note qué es cada cosa (R1.3, R2.1, R2.2)

- [x] B1 `ProgramRow.tsx:38-56` (`StatusBadge`) y `:133-144` (`CardBadge`) — «Inactivo» pasa a
      **«Ya no está en uso»** con tono de peligro; «Activo» pasa a **«En uso»**.
- [x] B2 `ProgramRow.tsx` — el nombre de una copia se rotula `Plan de <alumno>`; la plantilla lleva
      su chip `Plantilla`.
- [x] B3 `ProgramRow.tsx` — la fila de una copia con `source_template_id` muestra
      `Copia de «<plantilla>»` en la metadata. Requiere resolver el nombre de la plantilla madre
      desde las filas ya cargadas (todas viven en la misma lista, sin query nueva).
- [x] B4 `ProgramPreviewPanel.tsx:360-451` — mismo trato en el header del panel; el botón principal
      de un programa inactivo deja de ser la acción destacada.
- [x] B5 `WorkoutProgramsClient.tsx:257-259` + `LibraryToolbar.tsx:75-85` — cablear el filtro
      «Estado», hoy hardcodeado a `'all'` y con la UI sin importar.
- [x] B6 `libraryStats.ts:68-71` — `templateLabel` es código muerto: conectarlo al nuevo copy o
      borrarlo. No dejarlo a medias.
- [x] B7 Tests nuevos en `libraryStats.test.ts` (no existe): etiqueta por estado, y
      `matchesProgramFilters` con `filterStatus` real.

## C · El builder honesto (R1.1, R1.2, R2.1, R2.2, R3)

- [x] C1 `_data/builder.queries.ts:85-113` — devolver `programIsActive` y, solo si el programa
      abierto está inactivo y hay `clientId`, el `activeProgram` del alumno (`id`, `name`) con el
      mismo scope de workspace que el resto de la query.
- [x] C2 `page.tsx` — pasar ambos al componente.
- [x] C3 `WeeklyPlanBuilder.tsx` — banner fijo de plan inactivo dentro del `<header>`, junto a
      `showBuilderHint` (`:1424-1438`), con tokens `var(--danger-*)`, **sin botón de cerrar**, con el
      copy del PLAN y el link al programa activo.
- [x] C4 `WeeklyPlanBuilder.tsx:1148-1150` y su gemelo móvil `:1174-1178` — subtítulo pasa de
      `Cliente: X` a `Plan de X` / `Plantilla`, más `Copia de «…»` cuando hay `source_template_id`.
- [x] C5 `WeeklyPlanBuilder.tsx:1415-1419` y `:1813` — etiqueta única `Guardar cambios`.
- [x] C6 `WeeklyPlanBuilder.tsx:1405-1420` — el botón de guardar cambia de aspecto con
      `hasUnsavedChanges` (hoy solo reacciona a `isPending` y a nombre vacío).
- [x] C7 Guard de salida: cubrir `popstate` además del `beforeunload` ya existente (`:447-455`),
      reusando `shouldConfirmExit` de `packages/plan-builder/exit-guard.ts:44`. El comentario
      `:443-446` que declara el hueco se actualiza a la realidad nueva.
- [x] C8 Tests: el copy del banner y la regla «inactivo ⇒ se muestra» en un test nuevo del builder.

## D · Cierre

- [x] D1 Revisión de los tres diffs contra este documento (jefe).
- [x] D2 `pnpm docs:check` · `pnpm lint` · `pnpm typecheck` · `pnpm check:tokens`.
- [x] D3 Vitest de los tres directorios tocados.
- [x] D4 Commit `95817804` en `rnmobiledenuevo`.
- [x] D5 Push a `rnmobiledenuevo` y `master` (08-09), deploy web `dpl_HNXWcBmC…` READY (humo `www.eva-app.cl` y `/login` 200) y OTA 1.1.2 canal `production`: android `fa85b4c7-996d-46f7-857f-9bf420c68d4f` (run 34182217975) / ios `34245c78-ab31-4939-b505-bf3a6f58d150` (run 34182225023).
- [ ] D6 **Owner**: responder a Angela (borrador listo).
- [ ] D7 **Owner**: QA en device.

## Hallazgos al margen (NO se tocaron hoy)

- `apps/mobile/components/coach/programs/ProgramCard.tsx` **no lo importa nadie** en toda la app
  (la lista usa `ProgramRow.tsx`). Se le aplicó A1 igual, pero conviene decidir aparte si se borra.
- `packages/profile-analytics/overview.test.ts` falla **desde antes de este trabajo** y por el reloj:
  `isoDaysAgo` arma fechas con `toISOString()` (UTC) y `buildProfileActivityCalendar` acota la
  ventana con `new Date()` (local). Entre las 21:00 y la medianoche en Chile, UTC ya cambió de día
  y la racha esperada da 2 en vez de 3. `git status` sobre ese paquete está limpio: ningún cambio
  de hoy lo alcanza. Va a poner el job `unit` de CI en rojo en cualquier corrida nocturna.
- El filtro «Estado» de la biblioteca **móvil** (`(tabs)/builder.tsx:138-140`) sigue hardcodeado,
  igual que estaba el de web. Es la paridad natural de B5, fuera del alcance de hoy.
- Cambio de producto de B5 que conviene mirar en QA: la pestaña «Asignados» ahora incluye las
  copias inactivas (antes exigía `is_active`), y el estado lo separa el filtro nuevo. El conteo de
  esa pestaña, por lo tanto, ya no dice «cuántas rutinas en curso».
