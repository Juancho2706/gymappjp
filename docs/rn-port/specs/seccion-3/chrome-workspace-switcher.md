# SPEC — Chrome: conmutador de workspace (`WorkspaceSwitcherSheet`)

> Unidad key: `chrome-workspace-switcher` · Seccion 3 (COACH) · PORT 1:1.
> Web = fuente de verdad. Cada afirmacion cita `archivo:linea` del codigo real leido.
> Archivos leidos:
> - Web sheet: `apps/web/src/app/coach/dashboard/_components/sheets/WorkspaceSwitchSheet.tsx` (1-119)
> - Web trigger movil: `apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx` (120-225)
> - Web trigger desktop (ref): `apps/web/src/components/coach/CoachTopBar.tsx` (170-291)
> - Web tipos: `apps/web/src/domain/auth/types.ts` (11-73)
> - Web servicio: `apps/web/src/services/auth/workspace.service.ts` (22-124, 234-242)
> - Web action: `apps/web/src/app/workspace/select/select.actions.ts` (9-40)
> - Web destino: `apps/web/src/app/workspace/select/workspace-home.ts` (3-10)
> - RN sheet (PROPIO): `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` (1-80)
> - RN store: `apps/mobile/lib/workspace.ts` (1-298) + `apps/mobile/lib/workspace-core.ts` (1-355)
> - RN Sheet: `apps/mobile/components/Sheet.tsx` (48-381)
> - RN ListRow: `apps/mobile/components/ListRow.tsx` (26-141)
> - RN mount (READ-ONLY): `apps/mobile/components/coach/CoachDashboardSections.tsx` (85-87, 1763-1833)

---

## 0. Resumen de alcance

Esta unidad = **el bottom-sheet de cambio de espacio de trabajo** del coach (standalone ↔ team ↔ org).
UNICO archivo propio: `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` (80 L).
El **trigger** (avatar/chip que abre el sheet) NO es de esta unidad: vive en `CoachDashboardSections.tsx:1823-1833` (propiedad de `dashboard-sections`); esta unidad solo recibe `open`/`onClose` por props.

Web tiene DOS puntos de vista del mismo flujo:
- **Desktop** (`CoachTopBar.tsx:258-287`): el avatar con chevron `ChevronsUpDown` navega a la pagina `/workspace/select` (link, no sheet).
- **Movil <md** (`DashboardShell.tsx:135-146` + `216-222`): el avatar-tile abre el **bottom-sheet** `WorkspaceSwitchSheet` — ESTE es el espejo directo de la unidad RN.

El espejo 1:1 correcto de la unidad RN es el **`WorkspaceSwitchSheet.tsx` web (movil)**. El topbar desktop es referencia solo del trigger/affordance.

---

## 1. Layout / jerarquia (web movil — fuente de verdad)

Fuente: `WorkspaceSwitchSheet.tsx:48-117`.

```
Sheet (open, onOpenChange)                         :49
└─ SheetContent side=bottom, showCloseButton=false :50-54
   className: max-h-[min(80dvh,80svh)] gap-0 rounded-t-sheet
              border-subtle bg-surface-card p-0 text-body
   └─ div  flex-col overflow-y-auto overscroll-contain
           px-[18px] pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]  :55
      ├─ div  drag handle: mx-auto mb-3.5 h-1 w-[38px] shrink-0
      │        rounded-pill bg-[var(--ink-200)] aria-hidden                :56-59
      ├─ SheetHeader  border-0 bg-transparent p-0                          :60
      │   ├─ SheetTitle  font-display text-[19px] font-extrabold
      │   │              text-strong                                       :61-63
      │   │   "¿En qué espacio quieres trabajar?"
      │   └─ SheetDescription  mt-1 text-[12.5px] text-subtle              :64-66
      │       "Cada espacio separa datos, marca y permisos."
      └─ div  mt-4 flex-col gap-2  (lista de workspaces)                   :69
         └─ button (por cada ws)                                          :76-111
```

### 1.1 Fila de workspace (`button`) — web `:76-111`

- Contenedor `button`: `flex min-h-[56px] items-center gap-3.5 rounded-card border p-3 text-left transition-colors disabled:opacity-60` (`:82`).
  - Activo (`isCurrent`): `border-[var(--sport-300)] bg-[var(--sport-100)]` (`:84`).
  - Inactivo: `border-subtle bg-surface-card hover:bg-surface-sunken` (`:85`).
- Icono (`span`, `:88-97`): `flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-control`.
  - Activo: `style={{ background: 'var(--sport-500)', color: 'var(--text-on-sport)' }}` → **caja rellena color marca, icono en on-sport** (`:92`).
  - Inactivo: `style={{ background: 'var(--surface-sunken)', color: 'var(--ink-700)' }}` (`:93`).
  - Icono lucide `h-5 w-5` (20px) (`:96`).
- Textos (`div min-w-0 flex-1`, `:98-103`):
  - Titulo `p`: `truncate text-[14.5px] font-bold text-strong` = `ws.label` (`:99`).
  - Subtitulo `p`: `mt-0.5 truncate text-[11.5px] capitalize text-subtle` = `ws.type.replace(/_/g, ' ')` (`:100-102`), es decir el TIPO CRUDO con guiones→espacios y capitalize CSS (ej. "coach standalone", "enterprise coach").
- Trailing condicional (`:104-110`):
  - Activo → `span inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-sport-600` con `<Check className="size-3.5" /> Actual` (icono + texto **"Actual"**).
  - Cambiando (`isSwitching`) → `<Loader2 className="size-4 shrink-0 animate-spin text-subtle" />` (spinner).
  - Ninguno → `null`.

### 1.2 Iconografia por tipo — web `iconFor()` `:16-22`

| `ws.type` | Icono web |
|---|---|
| `enterprise_staff` | `UserCog` |
| `enterprise_coach` | `Building2` |
| `coach_standalone` | `Dumbbell` |
| `coach_team` | `UsersRound` |
| _default_ (student_*) | `GraduationCap` |

---

## 2. Tokens / tipografia / claro-oscuro

Todo el chrome usa tokens DS (no hex crudos), asi el modo oscuro y el white-label resuelven en runtime:
- Superficie: `bg-surface-card` (`:53`), handle `bg-[var(--ink-200)]` (`:57`).
- Activo: `--sport-300` (borde), `--sport-100` (fondo fila), `--sport-500` (caja icono), `--text-on-sport` (icono), `text-sport-600` (label "Actual").
- Inactivo: `border-subtle`, `--surface-sunken`, `--ink-700`.
- Texto: `text-strong` (titulo/label), `text-subtle` (descripcion/subtitulo).
- Tipografia: titulo `font-display text-[19px] font-extrabold` (`:61`), descripcion `text-[12.5px]` (`:64`), label fila `text-[14.5px] font-bold` (`:99`), subtitulo `text-[11.5px] capitalize` (`:100`), "Actual" `text-[11px] font-extrabold` (`:105`).
- Radios: `rounded-t-sheet` (sheet, `:53`), `rounded-pill` (handle, `:57`), `rounded-card` (fila, `:82`), `rounded-control` (caja icono, `:89`).

Claro/oscuro: no hay literales; los tokens flipan solos. Verificar en RN que la caja de icono activa use el token de marca y el icono el token on-sport (ver Estado RN actual, divergencia D3).

---

## 3. Elementos interactivos + handlers exactos

Fuente: `WorkspaceSwitchSheet.tsx:30-46`, `DashboardShell.tsx:135-222`, `select.actions.ts`, `workspace-home.ts`.

### 3.1 Trigger (fuera de esta unidad, documentado para el cableado)

- **Web movil** `DashboardShell.tsx:135-146`: si `hasMultiWorkspace` → `<button onClick={() => setWsSheetOpen(true)}>` con `HeaderBrandTile` + badge chevron `ChevronDown size-3` en esquina inf-der (`:143-145`). Si NO multi → `<Link href="/coach/settings">` sin caret (`:147-154`).
- **Web desktop** `CoachTopBar.tsx:258-287`: `<Link href={hasMultiWorkspace ? '/workspace/select' : '/coach/settings'}>`; si multi añade `ChevronsUpDown h-3.5 w-3.5 text-[var(--text-subtle)]` (`:281-286`) y cambia el contenedor a pildora (`:267-272`). Desktop NO usa el sheet: navega a la pagina selectora.
- **RN** `CoachDashboardSections.tsx:1826`: `onPress={hasMultipleWorkspaces ? () => setSwitcherOpen(true) : onAvatar}`; monta `<WorkspaceSwitcherSheet open={switcherOpen} onClose={...} />` (`:1833`). Condicion `hasMultipleWorkspaces = (workspaces?.length ?? 0) > 1` (`:1766`) = espejo de `hasMultiWorkspace` web (`DashboardShell` / `CoachTopBar.tsx:202`).

### 3.2 Tap en una fila de workspace — WEB `handleSwitch` `:34-46`

```
handleSwitch(ws):
  if (ws.isLastUsed) { onOpenChange(false); return }        // activo → solo cierra
  key = workspaceKey(ws)                                     // :39 (workspace.service.ts:234-242)
  setSwitchingKey(key)                                       // marca spinner en esa fila
  startTransition(async () => {                              // pending=true → disabled todas
    fd = FormData; fd.set('workspace_key', key)
    await selectWorkspaceAction(fd)                          // server action
  })
```

`selectWorkspaceAction` (`select.actions.ts:9-40`):
1. `getUser()`; sin user → `redirect('/login')` (`:12-13`).
2. `listUserWorkspaces` + `find(workspaceKey === selectedKey)`; no encontrado → `redirect('/workspace/select')` (`:15-17`).
3. `setLastWorkspace()` (persiste preferencia + audit). Si error → `redirect('/workspace/select?error=persist_failed')` (`:22-27`).
4. Si tipo coach (`coach_standalone|enterprise_coach|coach_team`): actualiza `coaches.active_org_id` (service-role) + `supabase.auth.refreshSession()` para re-emitir claims JWT (`:32-37`).
5. `redirect(workspaceHome(workspace))` (`:39`).

`workspaceHome` destinos (`workspace-home.ts:3-10`):
| type | destino |
|---|---|
| `enterprise_staff` | `/org/{slug}` (o `/org/login`) |
| `coach_standalone` / `enterprise_coach` / `coach_team` | `/coach/dashboard` |
| `student_team` | `/t/{slug}/dashboard` |
| `student_*` (resto) | `/c/{slug}/dashboard` |

→ **En web, cambiar de espacio = navegacion completa + refresh de JWT.** No hay toast; el feedback es el spinner en la fila (`Loader2`) mientras dura la transicion, luego redirige.

### 3.3 Tap en una fila de workspace — RN `handlePick` `:38-41`

```
handlePick(ws):
  if (!ws.isActive) setActiveWorkspace(ws.id)   // :39
  onClose()                                      // :40 — cierra siempre
```

`setActiveWorkspace(id)` (`workspace.ts:247-255`): re-aplica `isActive` sobre la lista YA derivada (`applyActiveWorkspace`, `workspace-core.ts:240-254`) SIN refetch, persiste `ACTIVE_KEY` en AsyncStorage y re-persiste el contexto. `id` desconocido = no-op. **No navega, no refresca JWT, no toast**: el arbol coach que consume `useWorkspace()` re-renderiza con el nuevo `kind/teamId/orgId`.

### 3.4 Cierre del sheet

- Web: `onOpenChange(false)` — via tap en fila activa (`:36`), o gestos del `Sheet` shadcn (backdrop / swipe / Escape). `showCloseButton={false}` (`:52`): NO hay boton X.
- RN: `onClose()` — via tap en cualquier fila (`:40`), o gestos del `components/Sheet` (backdrop tap, swipe-down, boton X — `showCloseButton` default `true`, ver D6). El sheet NO pasa `showCloseButton={false}`, asi que RN muestra un boton X que web NO tiene.

---

## 4. Estados (vacio / carga / error)

- **≤1 workspace (vacio-trivial):**
  - Web: `DashboardShell` NO monta el sheet salvo `hasMultiWorkspace` (`:216`), y el avatar con 1 solo es Link a `/coach/settings` (`:147-154`). El sheet nunca aparece.
  - RN: guard propio `if (workspaces.length <= 1) return null` (`WorkspaceSwitcherSheet.tsx:36`). Mismo efecto. **Paridad OK.**
- **Carga:** ni web ni RN muestran skeleton dentro del sheet — la lista llega por props/contexto ya resuelto. RN: `useWorkspace()` hidrata de cache + revalida (`workspace.ts:179-231`); el sheet consume `workspaces` sincronico.
- **Cambio en curso:** web muestra `Loader2` en la fila + `disabled` en todas (`:80,108-110`); RN es instantaneo (sin red) → sin spinner (divergencia D5).
- **Error de persistencia:** web redirige a `/workspace/select?error=persist_failed` (`select.actions.ts:22-27`). RN: `setActiveWorkspace` es best-effort local (AsyncStorage `.catch(() => {})`, `workspace.ts:253-254`) — no hay ruta de error visible; la revalidacion posterior reafirma via `preferredId`.

---

## 5. Validaciones

- Web `handleSwitch` valida `ws.isLastUsed` (no re-selecciona el activo, `:35`). Servidor revalida `workspaceKey` contra `listUserWorkspaces` (`select.actions.ts:16-17`).
- RN `handlePick` valida `!ws.isActive` antes de `setActiveWorkspace` (`:39`); `setActiveWorkspace` valida `id` presente en la lista (no-op si ausente, `workspace-core.ts:241-242`). **Paridad de la guarda "no re-seleccionar activo" OK.**

---

## 6. Queries / datos (tablas, filtros, claves de dia)

- **SIN claves de dia** (no hay logica de calendario). Gotcha 6d NO aplica.
- **Web:** `listUserWorkspaces(db, userId)` (`workspace.service.ts:22-124`) deriva de `coaches`, `organization_members`, `teams`, `clients`, `organizations`; labels compuestos:
  - `coach_standalone`: `brand_name || full_name || 'Mi negocio EVA'` (`:36`).
  - `enterprise_coach`: `` `${org.name} - Coach` `` (`:54`).
  - `enterprise_staff`: `` `${org.name} - Admin` `` (`:66`).
  - `coach_team`: `` `${team.name} - Equipo` `` (`:80`).
- **RN:** `useWorkspace().workspaces` (`workspace.ts:288-297`), derivado por PostgREST RLS del coach en `fetchRawWorkspaceData` (`workspace.ts:116-163`): lee `coaches` (`id, full_name, brand_name, slug, subscription_status, active_org_id`), `team_members` join `teams`, y `organizations.name` por `app_metadata.org_id`. `buildWorkspaceRefs` (`workspace-core.ts:167-212`) arma labels:
  - `standalone`: `brand_name || full_name || 'Mi negocio EVA'` (`:177`) — **coincide con web**.
  - `enterprise`: `orgName || 'Organización'` (`:189`) — web usa `"{org.name} - Admin"` o `"{org.name} - Coach"` (divergencia D2).
  - `team`: `name || 'Equipo'` (`:203`) — web usa `"{team.name} - Equipo"` (divergencia D2).
- **Estrategia de frescura RN (gotcha 6b):** el sheet NO hace fetch propio; consume el store `useWorkspace()`, que revalida en foreground (`AppState 'active'`, `workspace.ts:260-261`) y ante auth-change (`:263-269`). Por eso **NO se congela** aunque las tabs de expo-router no se desmonten. **Gotcha 6b: cumplido por diseño del store** (el sheet no introduce fetch de un disparo).

---

## 7. Animaciones / accesibilidad

- **Web:** `transition-colors` en fila (`:82`); `animate-spin` en `Loader2` (`:109`). Accesibilidad: `aria-current={isCurrent ? 'true' : undefined}` (`:81`), handle `aria-hidden` (`:58`), `SheetTitle`/`SheetDescription` nombran el dialogo.
- **RN:** animaciones del `components/Sheet` (backdrop fade + spring slide-up si `nativeModal`, o gorhom si no). `ListRow` da haptic Light en press-in (`ListRow.tsx:118-119`) + tinte `bg-surface-sunken` en pressed (`:80`). Accesibilidad: `accessibilityLabel={`${ws.label}${ws.isActive ? ', activo' : ''}`}` (`WorkspaceSwitcherSheet.tsx:59`), `testID` por fila (`:58`), `title`/`description` del Sheet nombran el dialogo. **RN tiene mejor a11y de fila (label con estado + haptic).**

---

## 8. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Grep `"WorkspaceSwitch" / "Workspace" / "CoachTopBar"`:

1. **Falta el caret de multi-workspace en el avatar (P2, repetido 3x).** Lineas 1755-1759, 6822-6826, 9061-9065. Web (`DashboardShell.tsx:143-145` badge `ChevronDown`; `CoachTopBar.tsx:281-286` `ChevronsUpDown`) muestra un indicador visual de que el avatar abre el switcher; RN (`CoachDashboardSections.tsx:1823-1830`) renderiza `<Avatar>` **sin chevron/caret**. → **FUERA de esta unidad** (el avatar vive en `dashboard-sections`), pero el cableado del switcher depende de ese trigger. Anotar en `cambiosShell` como dependencia, no tocar aqui.
2. **Nota estructural (1762, 9068):** `CoachTopBar` es chrome SOLO-desktop (`hidden md:flex`); su contraparte movil real es el header por pantalla + el sheet, no `CoachMobileChrome`. El auditor confirma que el flujo avatar→switcher multi-workspace esta cableado en RN (`CoachDashboardSections.tsx:1823-1833` + `WorkspaceSwitcherSheet.tsx:31-39`) con la MISMA condicion `length > 1`. La UNICA discrepancia reportada del par es el caret (hallazgo 1). **No hay hallazgo Ola 0 contra el CONTENIDO del sheet** (labels/iconos/copy) — esta spec los detecta nuevos (seccion 9).
3. Inventario (10063-10068, 10700): confirma que en movil el switcher vive concentrado en `CoachDashboardSections.tsx`.

---

## 9. Estado RN actual (divergencias con cita)

RN: `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx:1-80`. Web movil: `WorkspaceSwitchSheet.tsx:1-119`.

| # | Divergencia | Web (cita) | RN (cita) | Severidad |
|---|---|---|---|---|
| **D0** | **BOMBA -999 (gotcha 6a) — sheet critico en path gorhom.** El `<Sheet>` RN NO pasa `nativeModal`, asi que usa el path `@gorhom/bottom-sheet` (default `nativeModal=false`, `Sheet.tsx:171,332-379`) con `snapPoints={['50%','80%']}` FIJOS (`dynamicSizing` no seteado). Bajo reanimated 4 / Fabric el primer `present()` puede resolver contra `containerHeight=-999` (sheet off-screen) — documentado en `Sheet.tsx:117-144`. El cambio de workspace es **critico** (un coach org/team no opera sin cambiar de contexto). | `WorkspaceSwitchSheet.tsx:49` shadcn `Sheet` (estable en web) | `WorkspaceSwitcherSheet.tsx:44-50` `<Sheet snapPoints={['50%','80%']}>` sin `nativeModal` | **ALTA — accion: migrar a `nativeModal` (patron ronda 7)** |
| **D1** | Copy del TITULO diverge. | `:62` "¿En qué espacio quieres trabajar?" | `:47` "Cambiar de espacio" | Media (regla 5: copy verbatim) |
| **D1b** | Copy de la DESCRIPCION diverge. | `:65` "Cada espacio separa datos, marca y permisos." | `:48` "Elige el espacio de trabajo que quieres administrar." | Media |
| **D2** | Labels de workspace sin sufijo de rol. Web añade `" - Coach"/" - Admin"/" - Equipo"`; RN usa el nombre pelado. | `workspace.service.ts:54,66,80` | `workspace-core.ts:189,203` | Media (regla 5) |
| **D3** | Caja de icono ACTIVA: web = RELLENA marca (`sport-500` bg + icono on-sport); RN = tenue (`sport-100` bg + icono `theme.primary`). | `:92` | `WorkspaceSwitcherSheet.tsx:65-68` | Media (visual) |
| **D3b** | Fila ACTIVA sin tinte de fondo/borde. Web tinta la fila entera (`sport-100` bg + `sport-300` borde); RN via `ListRow` NO tinta la fila (bg siempre `surface-card`, `ListRow.tsx:80`). | `:84` | usa `ListRow` (sin prop de tinte activo) | Media (visual) |
| **D4** | Subtitulo de fila: web = tipo CRUDO (`ws.type.replace(/_/g,' ')` capitalize, ej. "coach standalone"); RN = copy localizado (`KIND_META.subtitle`, ej. "Tu negocio personal"). RN es mas legible pero DIVERGENTE. | `:100-102` | `WorkspaceSwitcherSheet.tsx:19-24,53` | Baja (RN mejor; decidir si igualar) |
| **D5** | Sin estado "cambiando" (spinner). Web muestra `Loader2` + disabled durante la transicion server; RN es instantaneo local (sin red) → no aplica spinner. | `:80,108-110` | `handlePick` sincronico `:38-41` | Baja (adaptacion idiomatica, ver seccion 11) |
| **D5b** | Trailing activo sin texto "Actual". Web = `Check + "Actual"`; RN = solo `Check`. | `:104-107` | `:71-73` | Baja |
| **D6** | RN muestra boton X de cierre; web lo oculta (`showCloseButton={false}`). El `<Sheet>` RN no pasa `showCloseButton`, default `true` (`Sheet.tsx:161`). | `:52` | `WorkspaceSwitcherSheet.tsx:44-50` (sin `showCloseButton`) | Baja |
| **D7** | Iconos por tipo distintos. Web: `Dumbbell`(standalone)/`UsersRound`(team)/`Building2`(enterprise)/`UserCog`(staff). RN: `User`(standalone)/`Users`(team)/`Building2`(enterprise). | `iconFor` `:16-22` | `KIND_META` `:19-24` | Baja (visual) |

Nota D0: el gotcha 6b (congelamiento) NO aplica — el sheet consume el store `useWorkspace` que revalida en foreground/auth (seccion 6), no hace fetch de un disparo.

---

## 10. Mapa de interacciones (todos los tocables — el lente de cableado verifica contra esta lista)

| Tocable | Ubicacion web | Efecto web | Ubicacion RN | Efecto RN esperado |
|---|---|---|---|---|
| Trigger avatar (multi) | `DashboardShell.tsx:136-146` | abre sheet (`setWsSheetOpen(true)`) | `CoachDashboardSections.tsx:1826` (READ-ONLY) | `setSwitcherOpen(true)` → `open` |
| Fila workspace ACTIVO | `WorkspaceSwitchSheet.tsx:35-36` | cierra sheet, no navega | `WorkspaceSwitcherSheet.tsx:39-40` | `onClose()` (no llama setActive) |
| Fila workspace INACTIVO | `:37-45` | `selectWorkspaceAction` → persiste pref + refresh JWT + **redirect** a `workspaceHome` (`/coach/dashboard`, `/org/{slug}`, `/t/{slug}/dashboard`, `/c/{slug}/dashboard`) | `:39-40` | `setActiveWorkspace(ws.id)` (flip de contexto in-place, sin navegar) + `onClose()` |
| Backdrop / swipe-down / Escape | shadcn `Sheet` (`onOpenChange`) | cierra | `components/Sheet` gestos | `onClose()` |
| Boton X | (ausente, `showCloseButton={false}`) | — | `components/Sheet` default `true` (`Sheet.tsx:254-264`) | `onClose()` — **RN tiene X extra (D6)** |
| Handle drag | `:56` decorativo | — | `Sheet.tsx:244-248` | swipe-down cierra (`Sheet.tsx:301-302` si nativeModal) |

Diferencia estructural del EFECTO (no gesto): en web el tap-inactivo **navega a otra ruta** (arboles `/coach` vs `/org` vs `/t` separados); en RN **cambia el contexto `useWorkspace` in-place** y el mismo arbol coach re-renderiza. Ambos = "el usuario elige el espacio en que trabaja". Ver seccion 11.

---

## 11. Adaptaciones idiomaticas RN

- **Navegacion vs flip de contexto (idiomatica, NO CEO-gate).** Web redirige a rutas separadas por espacio; RN tiene UN arbol coach que consume `useWorkspace()`, asi que el switcher cambia el contexto activo (`setActiveWorkspace`, `workspace.ts:247-255`) sin navegar. Preserva lo que el usuario VE y PUEDE hacer (operar en el espacio elegido) y el GESTO es identico (un tap en la fila). No cambia gesto → no requiere decision CEO.
- **Sin spinner de transicion (D5).** El cambio RN es local/sincronico (no server action), asi que no hay ventana de "cambiando"; el sheet cierra al instante. Preserva el resultado. Documentada.
- **Subtitulo localizado (D4).** RN muestra frases DS ("Tu negocio personal", "Equipo · lo gestionas", "Organización") en vez del tipo crudo web. Mejora legibilidad; NO cambia gesto. Decidir en implementacion si igualar a web o mantener (recomendacion: mantener el localizado, es superior y ya en latino neutro).

**Ningun cambio de gesto/flujo detectado → no hay PENDIENTE-DECISION-CEO en esta unidad.**

---

## 12. Hallazgos ronda 5

El brief no cita tablas r5 para esta unidad. No aplica.

---

## 13. Checklist de implementacion (para la unidad de cableado)

- [ ] **P0 (D0):** pasar `nativeModal` al `<Sheet>` del switcher (path Modal RN, evita bomba -999). El cambio de workspace es critico para el flujo.
- [ ] D1/D1b: copy verbatim → titulo "¿En qué espacio quieres trabajar?", descripcion "Cada espacio separa datos, marca y permisos.".
- [ ] D2: labels con sufijo de rol (`" - Coach"/" - Admin"/" - Equipo"`) para paridad — requiere cambio en `workspace-core.ts:189,203` (archivo compartido/READ-ONLY: anotar a `cambiosShell`, coordinar).
- [ ] D3/D3b: caja de icono activa RELLENA (`sport-500`/on-sport) + tinte de fila activa (`sport-100` bg + `sport-300` borde) — `ListRow` no expone tinte activo; evaluar prop nueva o render custom.
- [ ] D5b: añadir texto "Actual" junto al `Check` en la fila activa.
- [ ] D6: pasar `showCloseButton={false}` para igualar web (web no muestra X).
- [ ] D7: revisar iconos por tipo (`Dumbbell`/`UsersRound`/`UserCog`) si se busca paridad estricta; `KIND_META` no cubre `enterprise_staff` (el store coach no lo deriva — no aplica en mobile coach).
- [ ] GATE: `npx tsc --noEmit` limpio en `apps/mobile`.

> Nota disciplina de archivos: el UNICO archivo propio es `WorkspaceSwitcherSheet.tsx`. D2 toca `workspace-core.ts` (compartido, READ-ONLY de otra unidad) → va a `cambiosShell`, no se toca aqui sin coordinacion. El trigger/caret (`CoachDashboardSections.tsx`) es de `dashboard-sections`.
