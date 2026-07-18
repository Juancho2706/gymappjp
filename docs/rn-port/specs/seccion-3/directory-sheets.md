# SPEC — Unidad `directory-sheets` (Seccion 3 · Directorio del coach)

> **Fuente de verdad = web.** Cada afirmacion cita `archivo:linea`.
> **Alcance de archivos propios (RN):**
> - `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx` (165 L)
> - `apps/mobile/components/coach/directory/DirectoryOptionSheet.tsx` (73 L)
> - `apps/mobile/components/coach/directory/ClientActionsSheet.tsx` (118 L)
>
> **Web comparado:**
> - `apps/web/src/app/coach/clients/DirectoryActionBar.tsx` (370 L) — contiene el sheet de Filtros (L266-339) y el sheet de Orden (L342-367), mas los sub-componentes `SheetCheckRow` (L69-102) y `SheetGroupLabel` (L104-110).
> - `apps/web/src/app/coach/clients/ClientActionsSheet.tsx` (399 L) — sheet de acciones por alumno + confirmaciones in-sheet.
> - `apps/web/src/app/coach/clients/EditClientDataModal.tsx` (263 L) — modal de "Editar datos" que dispara la accion `onEdit`.
>
> **READ-ONLY (otras unidades, NO tocar):** `clientes.tsx` (owner `directory-screen`, cablea los 3 sheets), `DirRowCard.tsx` (owner `directory-row-cards`, dispara `ClientActionsSheet`), `directory-shared.ts` (owner `directory-screen`).

---

## 0. Resumen ejecutivo

Los 3 sheets usan **`Modal` RN nativo** (import `Modal` en L1 de cada archivo: `DirectoryFilterSheet.tsx:1`, `DirectoryOptionSheet.tsx:1`, `ClientActionsSheet.tsx:1`). **No usan `@gorhom/bottom-sheet`** → gotcha 6a (bomba -999) NO aplica. Mantener el patron `Modal transparent animationType="slide"`.

Estado global de la unidad:
- **DirectoryFilterSheet**: estructuralmente correcto (3 grupos Estado·Riesgo·Programa, check, footer "Ver resultados", titulo "Filtros"). El fix de wiring de R5 §2.1 **ya esta aplicado** en este worktree (ver §5). Divergencias PX de tono/altura pendientes.
- **DirectoryOptionSheet**: correcto como selector unico; se usa solo para **Orden** (no para Estado). Titulo llega por prop = "Ordenar" (web dice "Ordenar por"). Divergencia de copy cross-unit.
- **ClientActionsSheet**: **el mas divergente.** Faltan 2 acciones espejo web (Editar datos, Archivar/Desarchivar), sobran 3 acciones RN-only (Compartir, Programa de entreno, Nutricion), y las confirmaciones viven en `clientes.tsx` (Alert nativo) en vez de in-sheet. Ver §6 (mapa de acciones) y §7 (Hallazgos Ola 0).

---

## 1. DirectoryFilterSheet — layout, tokens, tipografia, claro/oscuro

### 1.1 Estructura (web `DirectoryActionBar.tsx:266-339` ↔ RN `DirectoryFilterSheet.tsx:85-142`)

| Nivel | Web | RN | Estado |
|---|---|---|---|
| Contenedor sheet | `Sheet side="bottom"` + `SheetContent` `max-h-[min(85dvh,620px)] rounded-t-sheet border-subtle bg-surface-card` (`:267-271`) | `Modal` + `View styles.sheet` `borderTopRadius 28, bg theme.card` (`:86-88,148-154`); **maxHeight NO en el sheet** (esta en el ScrollView, `:92`) | radio 28 = `--radius-sheet` OK; falta maxHeight responsivo |
| Overlay | `sheet.tsx:31` `bg-black/60 backdrop-blur-xl` | `styles.overlay` `rgba(0,0,0,0.5)` sin blur (`:147`) | **DIVERGE** — 0.5 vs 0.6, sin blur |
| Affordance cierre | `showCloseButton` → boton X circular (`:269`, `sheet.tsx:67-81`); sin handle | Handle decorativo `styles.handle` 36×4 (`:89,155`) + tap overlay (`:87`); sin X | Adaptacion idiomatica (handle) aceptable; falta subir overlay |
| Titulo | `SheetTitle` "Filtros" `font-display font-extrabold normal-case tracking-[-0.02em] text-strong` (`:272-276`) | `Text styles.title` "Filtros" fontSize 18, `FONT.displayBold`, color `theme.foreground` (`:90,156`) | Copy VERBATIM OK |
| Cuerpo scroll | `div flex-1 overflow-y-auto px-4 pb-2` (`:277`) | `ScrollView maxHeight 440` `px 16` (`:92,151`) | maxHeight fijo 440 vs `min(85dvh,620px)` — **DIVERGE** |
| Footer | `SheetFooter` + `Button variant="sport" w-full` "Ver resultados" (`:333-337`) | `TouchableOpacity styles.footerBtn` bg `theme.primary`, txt `#fff` "Ver resultados" (`:133-140,163-164`) | Copy VERBATIM OK; height 48 radius 14 |

### 1.2 Los 3 grupos

**Estado** (web `:278-296` ↔ RN `STATUS_ROWS :13-18`, render `:93-104`):

| valor | label web (`:281-284`) | label RN (`:14-17`) | badge |
|---|---|---|---|
| `active` | Activo | Activo | — |
| `paused` | Pausado | Pausado | — |
| `pending_sync` | Pendiente sync | Pendiente sync | — |
| `archived` | Archivados | Archivados | `archivedCount` (web `:284`; RN `:100`) |

Toggle: reclick del activo vuelve a `'any'` (web `:293` `statusFilter === it.v ? 'any' : it.v`; RN `:102` identico).

**Riesgo** (web `:298-313` ↔ RN `RISK_ROWS :19-24`, render `:107-117`):

| valor | label web (`:301-304`) | label RN (`:20-23`) |
|---|---|---|
| `urgent` | Atención urgente | Atención urgente |
| `review` | En riesgo | En riesgo |
| `on_track` | On track | On track |
| `nutrition_low` | Nutrición baja (<60%) | Nutrición baja (<60%) |

Toggle a `'all'` (web `:311`; RN `:115`).

**Programa** (web `:315-331` ↔ RN `PROGRAM_ROWS :25-29`, render `:120-130`):

| valor web (`:318-320`) | label web | valor RN (`:26-28`) | label RN |
|---|---|---|---|
| `with_program` | Con programa | `with_program` | Con programa |
| `no_program` | Sin programa | `no_program` | Sin programa |
| `expired` | Vencido | `expired_program` | Vencido |

> **DIVERGENCIA ESTRUCTURAL (documentada, cross-unit):** en **web** el grupo Programa escribe un estado **independiente** `programFilter` (`:327 onProgramFilterChange`, activo `:326 programFilter === it.v`), separado de `riskFilter` (`:311`) y `statusFilter` (`:293`) — permite combinar Riesgo **Y** Programa a la vez. En **RN** los grupos Riesgo y Programa **comparten el mismo `riskFilter`** (`:115` y `:128` ambos `onRiskChange`; activo `:114` y `:127` ambos `riskFilter === it.v`). El modelo combinado esta documentado en el header del componente (`DirectoryFilterSheet.tsx:8-10`). Consecuencia: en RN seleccionar un item de Programa **desmarca** cualquier item de Riesgo y viceversa (single-select entre los dos grupos). `filterClients` (`clients-directory.ts:238,240,241`) sabe resolver los valores `expired_program`/`no_program`/`with_program` desde `riskFilter`. **PENDIENTE-DECISION-CEO:** ¿se acepta el single-select combinado RN, o se separa `programFilter` para paridad de gesto con web? Es un cambio de capacidad (combinar 2 filtros) — no auto-sancionable.

### 1.3 `CheckRow` (fila de check) — web `SheetCheckRow :69-102` ↔ RN `CheckRow :31-64`

| Prop | Web | RN | Estado |
|---|---|---|---|
| Contenedor | `button min-h-[44px] w-full gap-2.5 rounded-[--radius-sm] px-3 py-2 text-left`; activo `bg-surface-sunken` else `bg-transparent` (`:84-87`) | `TouchableOpacity styles.row` `minHeight 44 gap 10 borderRadius 10 px 12 py 8`; activo `theme.muted` else `transparent` (`:51,158`) | `bg-surface-sunken` (web) vs `theme.muted` (RN) — **verificar mapping** |
| Marca de check | `span w-4 text-sport-600` + `Check h-[15px]` solo si activo (`:89-91`) | `View width 18` + `Check size 15 color theme.primary` solo si activo (`:53`) | color **sport-600 (web) vs theme.primary≡sport-500 (RN)** — un paso mas claro |
| Label | `flex-1 text-[13.5px] text-strong`, activo `font-bold` else `font-medium` (`:92-94`) | `styles.rowLabel flex 1 fontSize 13.5 color theme.foreground`, activo `FONT.uiBold` else `FONT.uiMedium` (`:54,159`) | OK |
| Badge | solo si `>0`: `rounded-pill bg-surface-sunken px-[7px] py-px text-[11px] font-bold text-subtle` (`:95-99`) | solo si `>0`: `styles.badge` `bg theme.muted` + `badgeTxt fontSize 11 FONT.uiBold color theme.mutedForeground` (`:57-61,160-161`) | OK |
| activeOpacity | (hover web) | `0.7` (`:50`) | idiomatico |

### 1.4 `SheetGroupLabel` — web `:104-110` ↔ RN `styles.groupLabel :157`

Web: `px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-subtle`. RN: `fontSize 10.5 FONT.uiBold textTransform uppercase letterSpacing 0.63 (=10.5×0.06) px 12 pt 6 pb 4 color theme.mutedForeground`. `text-subtle` (web) vs `mutedForeground` (RN) — mapeo aceptado.

### 1.5 Divisores entre grupos

Web: `div my-1 h-px bg-[var(--border-subtle)]` (`:297,314`). RN: `styles.divider height hairline marginVertical 6 marginHorizontal 4 bg theme.border` (`:106,119,162`). `border-subtle` (web) vs `theme.border` (RN) — verificar.

---

## 2. DirectoryOptionSheet — selector unico (usado para Orden)

Web NO tiene un componente separado: el sheet de Orden esta inline en `DirectoryActionBar.tsx:342-367`. RN lo factoriza en `DirectoryOptionSheet.tsx` (generico: title/options/selected/onSelect).

| Nivel | Web (sheet Orden `:342-367`) | RN (`DirectoryOptionSheet.tsx`) | Estado |
|---|---|---|---|
| Contenedor | `SheetContent side="bottom" max-h-[min(85dvh,520px)] rounded-t-sheet bg-surface-card` (`:343-347`) | `Modal` + `View styles.sheet` radius 28 bg `theme.card` px 20 (`:27-29,60-68`) | radio OK; sin maxHeight |
| Overlay | `bg-black/60 backdrop-blur-xl` | `rgba(0,0,0,0.5)` (`:28,60`) | **DIVERGE** overlay |
| Cierre | `showCloseButton` X (`:345`) | handle decorativo `:30,69` + tap overlay `:28` | falta X |
| Titulo | "Ordenar por" `font-display font-extrabold normal-case tracking-[-0.02em] text-strong` (`:348-351`) | `{title}` (prop) fontSize 18 `FONT.displayBold` (`:31,70`) — **`clientes.tsx:479` pasa `title="Ordenar"`** | **DIVERGE COPY** — "Ordenar" vs "Ordenar por" (literal en `clientes.tsx`, cross-unit) |
| Opciones | `SORT_OPTIONS.map` → `SheetCheckRow` `active={sortKey===opt.value}` (`:354-364`) | `options.map` → `TouchableOpacity styles.option` `active={selected===opt.value}` (`:32-52`) | estructura OK |
| Marca check | `span text-sport-600 Check h-[15px]` (`SheetCheckRow`) | `View width 18` + `Check size 16 color theme.primary` (`:41`) | 16 vs 15; sport-600 vs primary |
| Label opcion | `text-[13.5px]`, activo `font-bold` else `font-medium` | `styles.optionText fontSize 15`, activo `FONT.uiBold` else `FONT.uiMedium` (`:42-49,72`) | **PX** — 15 (RN) vs 13.5 (web) |
| onPress | `onSortChange(opt.value); setSortOpen(false)` (`:359-362`) | `onSelect(opt.value); onClose()` (`:39`) | mismo gesto OK |
| Fila activa bg | `bg-surface-sunken` | `theme.muted` (`:38`) | mapeo |

> **Nota de datos (cross-unit):** la lista de `SORT_OPTIONS` que se renderiza no es de esta unidad (llega por prop `options` desde `clientes.tsx:480`, definida en `directory-shared.ts:52-59`). Sus labels/valores difieren de la web (`directory-types.ts:22-29`): RN "Última sesión/Días plan restantes/Adherencia/Peso: mayor cambio" vs web "Última actividad/Adherencia ↓/Peso: mayor cambio/Días programa". **No es de esta unidad** — anotado para el owner `directory-screen`.

---

## 3. ClientActionsSheet — acciones por alumno

### 3.1 Contenedor y header (web `:387-398` ↔ RN `:59-96`)

| Nivel | Web | RN | Estado |
|---|---|---|---|
| Sheet | `SheetContent side="bottom" showCloseButton aria-label` `max-h-[min(88dvh,620px)] rounded-t-sheet border-subtle bg-surface-card` (`:388-393`) | `Modal transparent slide` + `View styles.sheet` radius 28 bg `theme.card` (`:60-62,102-108`); **sin maxHeight ni ScrollView** | **DIVERGE** — 8 filas sin scroll pueden desbordar (Ola0 P2, §7) |
| Overlay | `bg-black/60 backdrop-blur-xl` | `rgba(0,0,0,0.5)` (`:61,101`) | **DIVERGE** |
| Cierre | X circular `showCloseButton` (`:390`) | handle `:63,109` + tap overlay `:61` | falta X |
| Header avatar | `span h-[42px] w-[42px] rounded-full bg-[var(--ink-900)] font-display text-[15px] font-extrabold text-sport-400` + iniciales (`:345-347`) | `View styles.avatar 42×42 radius 21 bg theme.foreground` + `Text color theme.primary FONT.displayBold 15` (`:66-68,111-112`) | **DIVERGE dark** — web fondo `ink-900` (constante), RN `theme.foreground` (se invierte en dark → fondo claro). Ola0 P2 §7 |
| Iniciales | `name.split(' ').map(w=>w[0]).slice(0,2).join('')` (`:133-137`) | igual + `.toUpperCase()` (`:41-46`) | `.toUpperCase()` extra RN, inocuo |
| Nombre / email | `truncate text-[15.5px] font-bold text-strong` + `text-[12.5px] text-muted` (`:349-352`) | `numberOfLines=1 styles.name 15.5 FONT.uiBold` + `styles.email 12.5 FONT.ui mutedForeground` (`:70-73,113-114`) | OK |
| Divisor | `border-t border-subtle` (`:355`) | `styles.divider hairline` bg `theme.border` (`:77,115`) | OK |

### 3.2 Fila de accion (web `:356-378` ↔ RN `:79-93`)

Web: `button min-h-[48px] w-full gap-3 rounded-control px-2 py-3 text-left`; icono `h-[19px]` con `style color=tone`; label `text-[14.5px] font-semibold`, danger `text-[var(--danger-600)]` (`:363-375`).
RN: `TouchableOpacity styles.action minHeight 48 gap 12 radius 14 px 8 py 12`; `Icon size 19 color danger?DANGER:tone`; label `styles.actionLabel 14.5 FONT.uiSemibold`, danger color `DANGER` (`:82-91,116-117`).
Geometria 1:1 (radio 14=`--radius-control`, minHeight 48, gap 12, icon 19, label 14.5). OK.

### 3.3 Set de acciones — DIVERGENCIA MAYOR (ver §6 mapa completo)

Web `actions[]` (`:172-235`): **ficha · WhatsApp(cond) · Editar datos · Reset · Pausar/Reactivar · Archivar/Desarchivar · Eliminar**.
RN `actions[]` (`:48-57`): **ficha · WhatsApp(cond) · Compartir acceso · Programa de entreno · Nutrición · Reset · Pausar/Activar · Eliminar**.

- **FALTAN en RN:** `Editar datos` (web `:201-209`, Ola0 P1), `Archivar/Desarchivar` (web `:222-227`, Ola0 P1).
- **SOBRAN en RN (NO eliminar, regla 2):** `Compartir acceso` (`:51`), `Programa de entreno` (`:52`), `Nutrición` (`:53`) — sin contraparte web (Ola0 P2, `:6910-6916`).
- **Copy/icono divergentes:** toggle RN "Activar acceso" (`:55`) vs web "Reactivar acceso" (`:218`); iconos RN `Pause/Play` vs web `PauseCircle/PlayCircle`; ficha RN `Eye` vs web `IdCard`; WhatsApp RN `Smartphone` vs web `MessageCircle` (Ola0 P2).

### 3.4 Handler de cada fila

Web (in-sheet): navega o `setConfirm(kind)` → renderiza `ConfirmBody` in-sheet (`:42-115`) con icono tonal, titulo, body, CTA, pending "Guardando…", error inline, y (delete) TextInput que exige escribir el nombre (`:82-97`, `ok = typed===confirmName`, `:69`). Reset exitoso muestra clave temporal copiable (`:239-259`).
RN (fire-and-forget): `onPress={() => { onClose(); a.on() }}` (`:87`) — cierra el sheet y delega al callback del padre. **Las confirmaciones viven en `clientes.tsx` (READ-ONLY)** como `Alert.alert` nativo: pausar/activar (`:203-218`), reset (`:219-235`, muestra clave en 2º Alert de texto plano sin copiar), delete (`:236-241`, sin guard de nombre). El componente sheet no participa (documentado `:11-12`).

> **PENDIENTE-DECISION-CEO (gesto/flujo):** el borrado web exige **escribir el nombre** (friccion anti-error, `:82-97`); RN usa Alert de 2 botones sin friccion (`clientes.tsx:236-241`). Elevar el borrado a confirm in-sheet con TextInput cambia el flujo → no auto-sancionable. Idem el reset exitoso: web muestra clave copiable in-sheet; RN muestra clave en Alert de texto plano sin boton copiar.

---

## 4. Estados, validaciones, datos, animaciones, accesibilidad

### 4.1 Estados
- **Vacio/carga/error:** los 3 sheets **no tienen** estados de carga/vacio/error propios — solo renderizan seleccion/acciones sobre props ya cargados. El vacio/carga/error del roster vive en `clientes.tsx` (`:326-347`, owner `directory-screen`). El error de las acciones RN se muestra por `Alert` en `clientes.tsx` (`:214,231,239`); en web es inline en `ConfirmBody` (`:98,379-381`).
- **Reset exitoso (web):** estado `tempPassword` (`:127`) → vista de exito (`:239-259`). RN: no hay estado, va por Alert.

### 4.2 Validaciones
- **Delete web:** `ok = !confirmName || typed.trim().toLowerCase() === confirmName.toLowerCase()` (`ClientActionsSheet.tsx:69`); CTA `disabled={!ok || pending}` (`:107`). RN: sin validacion.
- **Editar datos (modal aparte, web `EditClientDataModal.tsx`):** campos `full_name` (required, `:105`), phone, weight_kg, height_cm, goals(select `:162-174`), experience_level(select `:181-191`), availability(select `:198-210`), injuries(textarea), medical_conditions(textarea); errores de campo `state.fieldErrors` (`:108-110`). En RN el equivalente vive en el detalle del alumno `cliente/[clientId].tsx:307` (Ola0 `:6836`), NO en el sheet.

### 4.3 Queries / RPC / claves de dia
- Los sheets **no leen datos ni tienen claves de dia** — solo emiten seleccion (filtro/orden) o disparan acciones. El filtrado lo hace `filterClients` (`clients-directory.ts:213-249`), el orden `sortClients` (`:251-283`) — ambos owner `directory-screen`.
- Acciones RN → helpers de `client-actions.ts` via callbacks del padre: `setClientStatus`, `resetClientPassword`, `deleteClient`, `openWhatsApp`, `shareLogin`, `clientLoginUrl` (importados en `clientes.tsx:58`). Web → server actions `archiveClientAction/unarchiveClientAction/deleteClientAction/resetClientPasswordAction/toggleClientStatusAction` (`ClientActionsSheet.tsx:22-28`).
- **gotcha 6d (claves de dia):** N/A — ningun sheet usa fechas/`getSantiagoIsoYmdForUtcInstant`.
- **gotcha 6e (notificaciones):** N/A.

### 4.4 Animaciones
- Los 3 sheets: `Modal animationType="slide"` (RN `:86,27,60`) ≈ el slide-up del `Sheet side="bottom"` web. Sin animaciones internas. `activeOpacity` en Touchables (0.7-0.9).

### 4.5 Accesibilidad
- **Web:** `SheetTitle`/`SheetContent aria-label` (ClientActions `:392`); botones con label semantico.
- **RN filter/option sheets:** las `CheckRow`/opciones tienen `testID` pero **sin `accessibilityRole`/`accessibilityLabel`** (`DirectoryFilterSheet.tsx:47-52`, `DirectoryOptionSheet.tsx:35-40`). ClientActionsSheet filas tienen `testID` sin `accessibilityRole` (`:82-88`). Gap menor a anotar (el trigger MoreVertical si tiene `accessibilityRole/Label` en `DirRowCard.tsx:113-114`, read-only).

---

## 5. Hallazgos ronda 5 (r5-audit-coach-core.md §2.1 / §2.2)

- **§2.1 (`:73`) "Sheet Filtros — UN sheet, 3 grupos Estado+Riesgo+Programa, check sport-600, footer 'Ver resultados', titulo 'Filtros' — marcado EST (Filtrar abria solo Estado via DirectoryOptionSheet)":** **YA CORREGIDO en este worktree.** `clientes.tsx:486-495` cablea `DirectoryFilterSheet` (3 grupos) al boton Filtrar; `DirectoryOptionSheet` quedo **solo para Orden** (`:477-485`). El DirectoryFilterSheet propio cumple: 3 grupos (`:93-130`), check (`:53`), footer "Ver resultados" (`:139`), titulo "Filtros" (`:90`). → Verificado presente. Residual: check `theme.primary`≡sport-500 vs web sport-600 (PX).
- **§2.1 (`:71`) "Boton barra activo relleno-ink vs tint-marca":** el `BarButton` es de `clientes.tsx` (owner directory-screen), no de esta unidad.
- **§2.2 (`:83`) "Control trailing MoreVertical → abre ClientActionsSheet vs ChevronRight decorativo — EST":** **YA CORREGIDO.** `DirRowCard.tsx:111-120` usa `MoreVertical` que abre `ClientActionsSheet` (`:123-136`). El trigger es de `directory-row-cards`; el sheet es de esta unidad y esta cableado.
- **Nota R5 (`:134`):** "sheets de acciones (ClientActionsSheet vs DirectoryOptionSheet)" listado como pendiente R5.x → resuelto en cuanto a wiring; residual = set de acciones (§3.3, §6).

> `DirectoryOptionSheet` **NO queda sin uso** tras el fix de wiring: sigue sirviendo el sheet de Orden (`clientes.tsx:477-485`). No hay que borrarlo.

---

## 6. Mapa de interacciones (TODOS los tocables — el lente de cableado verifica contra esta lista)

### 6.1 DirectoryFilterSheet (`DirectoryFilterSheet.tsx`)
| # | Tocable | Ubicacion | Efecto | Espejo web |
|---|---|---|---|---|
| F1 | Overlay `Pressable` | `:87` | `onClose()` (cierra sin aplicar; los filtros ya se aplicaron en cada tap) | tap overlay web `sheet.tsx` |
| F2 | Estado × 4 (`active/paused/pending_sync/archived`) | `:94-104` | `onStatusChange(statusFilter===it.v ? 'any' : it.v)` | `DirectoryActionBar.tsx:292-294` |
| F3 | Riesgo × 4 (`urgent/review/on_track/nutrition_low`) | `:108-117` | `onRiskChange(riskFilter===it.v ? 'all' : it.v)` | `:311` |
| F4 | Programa × 3 (`with_program/no_program/expired_program`) | `:121-130` | `onRiskChange(riskFilter===it.v ? 'all' : it.v)` **(colisiona con F3 — single-select combinado)** | web usa `onProgramFilterChange` independiente `:327` |
| F5 | Footer "Ver resultados" | `:133-140` | `onClose()` | `DirectoryActionBar.tsx:334` `setFiltersOpen(false)` |

### 6.2 DirectoryOptionSheet (`DirectoryOptionSheet.tsx`) — instancia Orden
| # | Tocable | Ubicacion | Efecto | Espejo web |
|---|---|---|---|---|
| O1 | Overlay `Pressable` | `:28` | `onClose()` | — |
| O2 | Opcion × N (SORT_OPTIONS) | `:35-51` | `onSelect(opt.value); onClose()` → `setSortKey` en `clientes.tsx:482` | `DirectoryActionBar.tsx:359-362` `onSortChange + setSortOpen(false)` |

### 6.3 ClientActionsSheet (`ClientActionsSheet.tsx`)
| # | Tocable | Ubicacion | Efecto RN | Espejo web (`ClientActionsSheet.tsx` web) |
|---|---|---|---|---|
| A0 | Overlay `Pressable` | `:61` | `onClose()` | overlay + X (`:390`) |
| A1 | Ver ficha completa (`Eye`) | `:49` | `onClose(); onProfile()` → `router.push(/coach/cliente/{id})` (`clientes.tsx:243`) | ficha `IdCard` → `router.push(/coach/clients/{id})` (`:180-186`) |
| A2 | Enviar WhatsApp (`Smartphone`, cond `onWhatsApp`) | `:50` | `onClose(); onWhatsApp()` → `openWhatsApp` (`clientes.tsx:188-191`) | `MessageCircle` cond → `window.open(wa.me)` (`:188-200`) |
| A3 | Compartir acceso (`Share2`) **RN-only** | `:51` | `onShare()` → `shareLogin` (`clientes.tsx:192-195`) | **sin espejo** |
| A4 | Programa de entreno (`Dumbbell`, tone primary) **RN-only** | `:52` | `onWorkout()` → `router.push(/coach/program-builder…)` (`clientes.tsx:244`) | **sin espejo** |
| A5 | Nutrición (`Apple`, tone EMBER) **RN-only** | `:53` | `onNutrition()` → `router.push(/coach/nutricion)` (`clientes.tsx:245`) | **sin espejo** |
| A6 | Resetear contraseña (`KeyRound`, tone INFO) | `:54` | `onReset()` → Alert confirm (`clientes.tsx:219-235`) | `setConfirm('reset')` → ConfirmBody + vista clave copiable (`:238-272`) |
| A7 | Pausar/Activar acceso (`Pause/Play`, tone WARNING) | `:55` | `onToggle()` → Alert (`clientes.tsx:203-218`) | `setConfirm('pause')`, label "Reactivar acceso" (`:217-221,273-298`) |
| A8 | Eliminar alumno (`Trash2`, danger) | `:56` | `onDelete()` → Alert sin guard (`clientes.tsx:236-241`) | `setConfirm('delete')` → ConfirmBody con TextInput de nombre (`:325-340`) |
| — | **FALTA Editar datos** | (ausente) | — | `UserPen` → `onEdit({id,name})` abre `EditClientDataModal` (`:201-209`) |
| — | **FALTA Archivar/Desarchivar** | (ausente) | — | `Archive/ArchiveRestore` → `setConfirm('archive')` (`:222-227,299-324`) |

---

## 7. Hallazgos Ola 0 (`ola0-hallazgos.json`)

Entrada catalogo: `ClientActionsSheet` (`:10718-10725`, priority media). Bloque de discrepancias `:6831-6918` (12 items):

| # | Elemento | Sev | Cita |
|---|---|---|---|
| 1 | Falta accion "Editar datos" | **P1** | `:6834-6838` (web `:201-209`) |
| 2 | Falta "Archivar/Desarchivar" + confirmaciones | **P1** | `:6840-6845` (web `:222-227,299-324`) |
| 3 | Delete sin guard de nombre escrito | **P1** | `:6847-6852` (web `:325-340,82-97`) |
| 4 | Reset exitoso: falta clave copiable in-sheet | **P1** | `:6854-6859` (web `:239-259`) |
| 5 | ConfirmBody (copys/icono tonal/pending/error inline) → RN usa Alert | P2 | `:6861-6866` |
| 6 | Toggle: icono `Pause/Play` vs `PauseCircle/PlayCircle`; "Activar" vs "Reactivar" | P2 | `:6868-6873` |
| 7 | Iconos ficha/WhatsApp: `Eye/Smartphone` vs `IdCard/MessageCircle` | P2 | `:6875-6880` |
| 8 | Avatar header: `theme.foreground` (se invierte dark) vs `ink-900` constante | P2 | `:6882-6887` |
| 9 | Tono iconos: rampa 500 (RN) vs 600 (web) | P2 | `:6889-6894` |
| 10 | Sheet sin maxHeight/ScrollView (8 filas pueden desbordar) | P2 | `:6896-6901` |
| 11 | Overlay 0.5 sin blur vs 0.6 + blur; sin X | P2 | `:6903-6908` |
| 12 | Acciones extra RN (share/workout/nutrition) sin espejo — **NO eliminar** | P2 | `:6910-6916` |

> Coincidencias verificadas (no reportadas), `ola0 :6918`: radio 28=`--radius-sheet`, radio fila 14=`--radius-control`, minHeight 48/gap 12/icon 19/label 14.5, avatar 42px, gating WhatsApp por telefono+loginUrl, navegacion a ficha, divisor header/lista. `TouchableOpacity` vs `eva-press` y `Modal slide` vs `Dialog` = adaptaciones idiomaticas legitimas.
>
> **`DirectoryFilterSheet`/`DirectoryOptionSheet`: sin entrada propia en `ola0-hallazgos.json`** (grep confirma solo hits en la seccion ClientActionsSheet y catalogo). Sus divergencias estan cubiertas por R5 §2.1 (§5 arriba) y por comparacion directa (§1-§2).

---

## 8. Estado RN actual (divergencias obvias con citas)

1. **ClientActionsSheet set de acciones** — 8 acciones RN (`:48-57`) ≠ 7 web (`:172-235`). Faltan 2 (Editar, Archivar), sobran 3 (Share, Workout, Nutrition). Ver §6.
2. **Confirmaciones fuera del sheet** — RN delega a `Alert` en `clientes.tsx` (`:203-241`); web las hace in-sheet (`ConfirmBody :42-115`). Delete sin guard de nombre; reset sin clave copiable.
3. **DirectoryFilterSheet Riesgo+Programa comparten `riskFilter`** (`:115,128`) vs web `programFilter` independiente (`:327`) → single-select combinado (PENDIENTE-DECISION-CEO, §1.2).
4. **Copy titulo Orden** — "Ordenar" (`clientes.tsx:479`) vs "Ordenar por" (web `:350`).
5. **Overlays** — los 3 sheets `rgba(0,0,0,0.5)` sin blur vs `bg-black/60 backdrop-blur-xl`.
6. **maxHeight** — filter sheet ScrollView fijo 440 (`:92`); ClientActionsSheet sin scroll; web `min(85dvh,620px)`/`min(88dvh,620px)`.
7. **Tono check** — `theme.primary`≡sport-500 vs web `sport-600` (filter+option sheets).
8. **Avatar header dark** — `theme.foreground` se invierte en dark (`:66`) vs `ink-900` constante web.
9. **Accesibilidad** — filas de filtro/opcion/accion sin `accessibilityRole/Label` (solo `testID`).

**NO se elimina funcionalidad RN existente** (regla 2): las 3 acciones RN-only (share/workout/nutrition) se preservan; el long-press de sortDir, copy-portal, import, FAB, banners, chips viven en `clientes.tsx` (fuera de scope).

---

## 9. Gotchas de clase (checklist)
- **6a (bomba -999):** N/A — los 3 sheets usan `Modal` RN nativo (`:1` de cada archivo), no `@gorhom`. Mantener el patron `Modal`.
- **6b (fetch congelado):** N/A — los sheets no hacen fetch propio (reciben props/callbacks).
- **6c (Fabric 45798):** N/A — no hay estilos condicionales por focus en wrapper de `TextInput` (los sheets no tienen TextInput; el TextInput de delete-confirm vive en web `ConfirmBody`; si se porta, aplicar 6c).
- **6d (claves de dia):** N/A.
- **6e (notificaciones):** N/A.

## 10. Disciplina de archivos
Archivos propios editables: los 3 `.tsx` de `components/coach/directory/{DirectoryFilterSheet,DirectoryOptionSheet,ClientActionsSheet}.tsx`. Cualquier fix que requiera tocar `clientes.tsx` (confirmaciones in-sheet, nuevos callbacks `onEdit`/`onArchive`, titulo "Ordenar por") o `DirRowCard.tsx` (pasar nuevas props) va a **cambiosShell** — NO se toca aqui. Coordinar con `directory-screen` y `directory-row-cards`.
