# Port result — unidad `directory-sheets` (Seccion 3 · Directorio coach)

Fecha: 2026-07-11 · Rama: rnmobiledenuevo

Archivos propios editados (3):
- `apps/mobile/components/coach/directory/ClientActionsSheet.tsx`
- `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx`
- `apps/mobile/components/coach/directory/DirectoryOptionSheet.tsx`

Fuente de verdad web:
- `apps/web/src/app/coach/clients/ClientActionsSheet.tsx`
- `apps/web/src/app/coach/clients/DirectoryActionBar.tsx`

---

## Cambios aplicados (dentro de mis 3 archivos)

### ClientActionsSheet.tsx
1. **P1 — Accion "Editar datos"** (Ola0 #1, web `:201-209`): agregada como prop OPCIONAL
   `onEdit?`. Renderiza `UserPen` "Editar datos" tras WhatsApp, solo si el padre provee
   el callback (mismo patron que `onWhatsApp`). Gated ⇒ no aparece hasta cablear (ver cambiosShell).
2. **P1 — Accion "Archivar/Desarchivar"** (Ola0 #2, web `:222-227`): prop OPCIONAL
   `onArchive?`. Icono `Archive`/`ArchiveRestore` segun `client.isArchived`; copy
   "Archivar alumno"/"Desarchivar" (verbatim web `:224`), ubicada antes de Eliminar. Gated.
3. **Paridad de iconos** (Ola0 #6,#7): ficha `Eye`→`IdCard` (web `:180`); WhatsApp
   `Smartphone`→`MessageCircle` (web `:191`); toggle `Pause`/`Play`→`CirclePause`/`CirclePlay`
   (≡ web `PauseCircle`/`PlayCircle` `:217`; en lucide-react-native 1.16.0 el alias es Circle*).
4. **Copy verbatim** (Ola0 #6): estado pausado ahora "Reactivar acceso" (antes "Activar
   acceso") — web `:218` `paused ? 'Reactivar acceso' : 'Pausar acceso'`. Se usa `paused = !client.isActive`.
5. **P2 — ScrollView** (Ola0 #10): la lista de acciones (hasta 10 filas) va en un
   `ScrollView maxHeight 440` (header fijo arriba), espejo del `flex-1 overflow-y-auto` web
   `:355`. Evita desborde en pantallas chicas.
6. **P2 — Overlay** (Ola0 #11): `rgba(0,0,0,0.5)`→`0.6` (web `bg-black/60`).
7. Orden final de acciones = web para las compartidas (ficha · WhatsApp · Editar · … ·
   Reset · Pausar/Reactivar · Archivar · Eliminar); las 3 RN-only (Compartir · Programa ·
   Nutricion) se PRESERVAN (regla 2) agrupadas tras Editar.

### DirectoryFilterSheet.tsx
1. **P2 — Overlay** `0.5`→`0.6` (web `bg-black/60`).

### DirectoryOptionSheet.tsx (instancia Orden)
1. **P2 — Overlay** `0.5`→`0.6`.
2. **PX** — label opcion `fontSize 15`→`13.5` (web `SheetCheckRow text-[13.5px]`).
3. **PX** — check `size 16`→`15` (web `Check h-[15px]`).

---

## GATE tsc
`npx tsc --noEmit` (apps/mobile): **mis 3 archivos = 0 errores** (verificado por filtro).
La UNICA salida de tsc son 2 errores en `DirRowCard.tsx:100-101` ("Cannot find name
'EMBER'") — archivo READ-ONLY (owner `directory-row-cards`), edicion concurrente
incompleta: importa `{ DANGER, SEV_HEX, WARNING, lastInfo, severityMeta, statusMeta }`
(`:11`) pero usa `EMBER` sin importarlo. NO causado por esta unidad, fuera de mi
propiedad. Fix trivial de ESE owner: agregar `EMBER` al import de `./directory-shared`.

---

## cambiosShell (archivos ajenos — NO tocados)

Para que las acciones P1 "Editar datos" y "Archivar/Desarchivar" APAREZCAN, falta cablear
(owners `directory-screen` + `directory-row-cards`):
- `apps/mobile/app/coach/(tabs)/clientes.tsx` — agregar `handleEdit(c)` (navegar/abrir
  modal de editar datos; el equivalente vive en `cliente/[clientId].tsx`) y `handleArchive(c)`
  (helper de archivar/desarchivar + `load(true)`), y pasarlos a `DirRowCard`.
- `apps/mobile/components/coach/directory/DirRowCard.tsx:123-136` — recibir `onEdit`/`onArchive`
  como props y reenviarlos a `<ClientActionsSheet onEdit={…} onArchive={…} />`.
- `apps/mobile/app/coach/(tabs)/clientes.tsx:479` — titulo del sheet de Orden dice
  `title="Ordenar"`; web `:350` dice "Ordenar por". Copy fix (literal en clientes.tsx).
- `apps/mobile/components/coach/directory/DirRowCard.tsx:11` — (concurrente) falta `EMBER`
  en el import → rompe tsc del arbol. Owner directory-row-cards.

---

## PENDIENTE-DECISION-CEO (cambios de gesto/capacidad — NO auto-sancionados)

1. **Riesgo + Programa comparten `riskFilter`** (DirectoryFilterSheet `:114,127`): en web son
   filtros INDEPENDIENTES (`programFilter` propio, web `:327`) que se COMBINAN; en RN
   seleccionar Programa desmarca Riesgo (single-select). Separar exige nuevo estado
   `programFilter` en clientes.tsx (cross-unit) y cambia la capacidad del filtro.
2. **Borrado sin friccion**: web exige ESCRIBIR el nombre in-sheet (`ConfirmBody` TextInput,
   web `:82-97`); RN usa `Alert` de 2 botones (`clientes.tsx:236-241`). Elevar a confirm
   in-sheet con TextInput cambia el flujo (y requiere clientes.tsx + gotcha 6c en el TextInput).
3. **Reset — clave copiable**: web muestra clave temporal con boton Copy in-sheet (`:239-259`);
   RN la muestra en `Alert` de texto plano sin copiar (`clientes.tsx:230`). Portar la vista de
   exito in-sheet cambia el flujo (requiere estado + clientes.tsx).

---

## Divergencias P2 DOCUMENTADAS (no fixeadas — riesgo de token / regla 3 "cero valores crudos")

- **Avatar header dark** (Ola0 #8, ClientActionsSheet `:66`): web usa `bg-[var(--ink-900)]`
  CONSTANTE (fondo oscuro en ambos temas) + `text-sport-400`; RN usa `theme.foreground`
  (se invierte en dark → fondo claro). Fix 1:1 requiere un constante ink-900/surface-inverse
  que el `Theme` imperativo NO expone + `resolveSportRamp().sport400`. Introduce plumbing de
  token fragil ⇒ se deja documentado en vez de clavar un raw (regla 3).
- **Tono del check** (Ola0 #9, filter+option): web `sport-600`; RN `theme.primary` (≡ sport-500,
  un paso mas claro). `sport-600` flipea en dark y no esta expuesto limpio en el `Theme`
  imperativo (solo via `brandVars` CSS-var) ⇒ documentado.
- **Overlay blur**: web `backdrop-blur-xl`; RN sin blur (solo se subio opacidad a 0.6). Un
  `BlurView` sobre Modal a pantalla completa es costo/complejidad no justificada aca.
- **maxHeight responsivo**: filter sheet ScrollView fijo 440 vs web `min(85dvh,620px)`; se
  mantiene 440 (idiomatico, ya presente).
- **Accesibilidad**: filas de filtro/opcion/accion con `testID` pero sin `accessibilityRole`/
  `accessibilityLabel` (el trigger MoreVertical si los tiene, en DirRowCard read-only).

## Gotchas de clase
- 6a (bomba -999): **N/A** — los 3 sheets usan `Modal` RN nativo (no `@gorhom`). Patron mantenido.
- 6b/6c/6d/6e: **N/A** — sin fetch propio, sin TextInput (los sheets no tienen input), sin fechas,
  sin notificaciones. (Si algun dia se porta el delete-confirm con TextInput in-sheet → aplicar 6c.)

## Regla 2 (no eliminar funcionalidad RN)
Preservadas las 3 acciones RN-only (Compartir acceso · Programa de entreno · Nutricion). Nada
borrado. `DirectoryOptionSheet` sigue en uso (sheet de Orden, `clientes.tsx:477`).
