# SPEC — Unidad `directory-screen` (Directorio: pantalla `clientes.tsx` + `directory-shared`)

> Seccion 3 (Dashboard COACH) · PORT 1:1. **Web = fuente de verdad.** Cada afirmacion cita `archivo:linea`.
> Archivos PROPIOS de esta unidad:
> - `apps/mobile/app/coach/(tabs)/clientes.tsx` (640 L)
> - `apps/mobile/components/coach/directory/directory-shared.ts` (78 L)
>
> READ-ONLY (montados por `clientes.tsx`, de otras unidades): `DirRowCard`, `ClientCard`, `DirectorySummary`, `DirectoryAlertBanner`, `DirectoryFilterSheet`, `DirectoryOptionSheet`, `ClientActionsSheet`, `CreateClientModal`, `ImportClientsForm`.

---

## 0. Cadena de orquestacion web (para ubicar el equivalente movil)

- RSC `apps/web/src/app/coach/clients/page.tsx:19-64` — fetch `getCoachClientsWithPrograms` + `getCoachClientsPulse` + `resolveToolsEnabled` en `Promise.all` (`page.tsx:45-50`); envuelve en `<div ... max-w-[1600px] space-y-12 mb-24 md:mb-0 ...>` (`page.tsx:60`) y monta `<CoachClientsShell>` (`page.tsx:61`).
- `CoachClientsShell.tsx:19-68` — estado `riskFilter` (`:20`); `rosterMode` via `useRosterView()` (`:25`, solo desktop); construye `pulseByClientId` (`:32-36`); monta **`CoachWarRoom` SOLO movil** (`div mb-8 md:hidden` `:43-53`) + `ClientsDirectoryClient` (`:54-65`).
- `ClientsDirectoryClient.tsx:105-346` — orquesta filtros/orden/vista y renderiza, para **movil (`<md`)**, la **action bar + tarjetas/tabla + FAB** (`:247-324`). **Esta es la region que porta `clientes.tsx`.** El master-detail (`:224-232`) y `DesktopRosterTable` (`:238-245`) son **desktop-only** y NO tienen espejo movil (por diseno; ver §7).

**Mapeo web(movil)→RN de ESTA unidad:**
| Region web (movil) | Archivo/lineas web | Espejo RN |
|---|---|---|
| Action bar (search + Filtros/Orden/Vista + chips + conteo) | `DirectoryActionBar.tsx` completo | `clientes.tsx:383-405` + chips/conteo `:302-322` + `BarButton` `:517-560` |
| Lista row-cards (vista "cards") | `ClientsDirectoryClient.tsx:298-311` (`DirRowCard`) | `clientes.tsx:436-463` (`FlatList`+`DirRowCard`, viewMode `list`) |
| Tabla densa (vista "table") | `DirTableMobile.tsx` | **SIN espejo** — RN sustituye por grid `ClientCard`+parallax (`clientes.tsx:407-435`) → §7 D2 |
| Empty cero-alumnos | `ClientsDirectoryEmpty.tsx` | `clientes.tsx:326-338` (`emptyNode`, sin CTAs) → §5 |
| Empty filtro-vacio | `ClientsDirectoryClient.tsx:266-284` | `clientes.tsx:326-338` (mismo `emptyNode`) → §5 |
| FAB "Nuevo alumno" | `ClientsDirectoryClient.tsx:313-322` | `clientes.tsx:465-474` |
| Importar (icon-button header) | WarRoom header (R5 §2.3) | `clientes.tsx:369-378` icon-button + `NativeDialog` `:503-511` |
| Sheets Filtros/Orden | `DirectoryActionBar.tsx:266-367` | `clientes.tsx:477-495` (`DirectoryOptionSheet`=orden, `DirectoryFilterSheet`=filtros) |

---

## 1. Layout / jerarquia (RN propio) vs web

### 1.1 Contenedor raiz
- **RN** `clientes.tsx:349-350`: `<SafeAreaView edges={[]} style={[container,{backgroundColor:theme.background}]}>` + `<AppBackground/>` (`:351`). `container={flex:1}` (`:563`).
- **Web** movil: `<div className="space-y-4 md:hidden">` (`ClientsDirectoryClient.tsx:248`).

### 1.2 Header
- **RN** `ScreenHeader` (`clientes.tsx:352-381`): `title="Alumnos"`, `subtitle="Tu seguimiento de hoy"` (`:353-354`), `trailing` = copiar-portal (`LinkIcon`/`Check`, `:357-368`) + importar (`FileUp`, `:369-378`). `headerIconBtn={40x40,radius12,bw1}` (`:593`).
- **Web** (WarRoom header, R5 §2.3): eyebrow "Tu seguimiento de hoy" + h1 "Alumnos" `text-[26px] font-black`; IconButtons copiar-portal (LinkIcon) + importar (FileUp). **Copy + set de botones YA COINCIDEN** en RN actual (R5 §2.3 STALE en este punto; §6/§7.1).

### 1.3 `headerNode` (ListHeaderComponent) — `clientes.tsx:251-324`
Orden vertical:
1. **Card Herramientas** (cond. `toolsEnabled`, `:254-270`) — `TouchableOpacity` full-width: tile `38x38 radius11 bg=hexToRgba(primary,0.12)` (`:261,595`) `LayoutGrid 19 primary` (`:262`); titulo "Herramientas" `14 uiBold` (`:265,596`); sub "Cardio · Movimiento · Composicion" `11.5 ui` (`:266,597`); `ChevronRight 18` (`:268`). `toolsCard={bw1,radius18,mh16,mb12,ph13,pv11,gap12}` (`:594`). `onPress→router.push('/coach/tools')` (`:258`).
2. **`DirectorySummary`** (otra unidad, `:273-280`).
3. **Alert banners** (`DirectoryAlertBanner`, otra unidad, `:283-294`) + banner reintento pulse propio (`:295-300`).
4. **Chips filtros activos** (`:302-315`, §4.4).
5. **Linea conteo/orden** (`sortRow :317-322`, §4.5).
- **Web:** mismo bloque repartido en WarRoom (summary+banners+card Herramientas) + `DirectoryActionBar` (chips+conteo). La card Herramientas se movio al tope de `headerNode` RN (propia); estructura tile+titulo+sub+chevron coincide.

### 1.4 Action bar — `clientes.tsx:383-405`
`actionBar={row,alignItems:center,gap8,ph16,pb10}` (`:564-570`): `Input`(flex:1) + 3 `BarButton`. **Web** `DirectoryActionBar.tsx:212-239`: `flex gap-2` con `Input pl-10`(flex-1) + 3 `BarButton`. **1:1.**

### 1.5 Lista + FAB + sheets
FlatList (`:407-463`); FAB (`:465-474`); `DirectoryOptionSheet`=orden (`:477-485`); `DirectoryFilterSheet`=filtros (`:486-495`); `CreateClientModal` (`:496-501`); `NativeDialog`+`ImportClientsForm` (`:503-511`).

---

## 2. Tokens / tipografia / claro-oscuro

Colores de `clientes.tsx` via `useTheme().theme` (`:82`); sin hex crudos salvo `#fff` en labels sobre relleno marca/danger (`fabLabel :639`, `barBadgeTxt :591`, `footerBtnTxt`). Familias `FONT.*` (`lib/typography`, `:60`).

`directory-shared.ts` — literales de estado NO-brand (excepcion documentada del token-contract §1, `:9-11`): `SUCCESS=#1FB877` `WARNING=#F5A524` `DANGER=#F4365A` `EMBER=#FF6A3D` `INFO=#2680FF` (`:13-17`); `SEV_HEX` (`:18`); `hexToRgba` (`:20-25`). Consumidos por `clientes.tsx` para tintes de banner (`DANGER+'14'`/`+'40'` `:296`; colores de `DirectoryAlertBanner` `:284-293`).

Tipografia `clientes.tsx` (`:562-640`): `barBadgeTxt uiExtra 10` (`:591`); `toolsCardTitle uiBold 14` (`:596`); `toolsCardSub ui 11.5` (`:597`); `filterChipText uiSemibold 12.5` (`:615`); `clearLink uiBold 12.5 underline` (`:616`); `sortLabel uiMedium 12` (`:618`); `pulseErrTxt uiSemibold 12` (`:620`); `pulseErrAction uiBold 12 upper ls0.4` (`:621`); `emptyTitle displayBlack 22 ls-0.5` (`:626`); `emptySub ui 13 lh20` (`:627`); `fabLabel uiBold 15 #fff` (`:639`).

**Divergencias token vs web (PX):**
- Separador "·" del conteo: web `text-[var(--border-strong)]` (`DirectoryActionBar.tsx:261`) vs RN `theme.border` (`clientes.tsx:320`) — **border vs border-strong**.
- Chip activo: web `bg-[var(--ink-950)] text-white` (`DirectoryActionBar.tsx:30`) vs RN `theme.foreground`/`theme.card` (`clientes.tsx:306-307`) — ink solido, **OK**.

---

## 3. Datos / queries (tablas, filtros, limites, claves de dia)

### 3.1 Carga (`load` `clientes.tsx:128-136`)
- `getCoachDirectoryClients()` (`lib/clients-directory.ts:114-197`) = roster. Espejo `getCoachClientsWithPrograms` (`clients.queries.ts:22-42`).
- `loadPulse()` (`clientes.tsx:140-145`) → `getCoachDirectoryPulse()` (`clients-directory.ts:84-91`) via `apiFetch('/api/mobile/coach/clients/pulse')`. Espejo `getCoachClientsPulse`→`getCachedDirectoryPulse` (`clients.queries.ts:44-46`).
- Error del pulse NO se traga: `setPulseError(true)` → banner reintento (`clientes.tsx:143-144,295-300`).

### 3.2 Query roster RN (`clients-directory.ts:114-197`)
- Tablas: `clients` (select explicito con embed `workout_programs(...)` `:123`), `workout_logs` (`>=sevenDaysAgo` `:133-137`), `check_ins` (`>=thirtyDaysAgo` `:138-142`), `Promise.all` (`:125`).
- **Scoping org (TX-4):** `getCoachOrgContext()` → `.eq('org_id',orgId)` o `.is('org_id',null)`, con `selectWithFallback` si la columna no existe (`:120-132`). Espejo del scoping web (`clients.queries.ts:32-38`) **pero RN NO scoping por team** (web maneja `activeTeamId` `:34-37`) → §7 D12.

### 3.3 Attention score (`clients-directory.ts:168-190`)
Local: INACTIVO+10 (`:171`), PENDIENTE_SYNC+10 (`:172`), SIN_PROGRAMA+20 (`:173`), PLAN_VENCIDO+30 (`:174`), SIN_WORKOUT_7D+30 (`:175`), SIN_CHECKIN_1M+20 (`:176`), cap 100 (`:190`). **`buildStats`+`filterClients` de riesgo usan este score LOCAL** (`:204-208,235-241`); web filtra por `pulse.attentionScore` del SERVIDOR (`ClientsDirectoryClient.tsx:50-53`) → §7 D13. `nutrition_low` usa pulse en ambos (`clients-directory.ts:242-244`; web `:64`).

### 3.4 `buildStats` (`clients-directory.ts:199-211`) — gotcha 6d
Agrega sobre `nonArchived` (`:200`) por `attentionScore`/`planDaysRemaining`/flags. **No computa claves de dia.** Verificacion 6d: OK (sin TZ del device en `buildStats`).

### 3.5 Claves de dia (gotcha 6d)
Ventanas 7d/30d por resta de ms sobre `Date.now()` (`clients-directory.ts:118-119`), **relativas** (no dia-calendario). `calcPlanDaysRemaining` (`:104-112`), `subscriptionDaysRemaining` (`:76-81`), `lastInfo` (`directory-shared.ts:43-50`) idem. **Consistente con el web**, que en la tabla movil usa `differenceInDays(new Date(),...)` crudo (`DirTableMobile.tsx:135`). `getSantiagoIsoYmdForUtcInstant` NO aplica al roster coach (aplica al arbol ALUMNO). **NO es bug.** `todayIso` de dismiss (`:170`) es UTC pero es persistencia local RN-additive sin equivalente web.

### 3.6 Perfil coach (`clientes.tsx:115`)
`getCoachProfile()` → `coachSlug` + `maxClients`. Persistencia `viewMode` en `eva_alumnos_view` (`:114,120`); `dismissed` alerts en `eva_alumnos_alerts_dismissed` (`:123,178`).

---

## 4. Mapa de interacciones (CADA tocable → handler) — el lente de cableado verifica contra esta lista

### 4.1 Header
| # | Tocable (testID) | Linea | Efecto |
|---|---|---|---|
| I1 | copiar-portal `[directory-copy-portal]` | `:358-367` | `handleCopyPortal` (`:197-202`): `Clipboard.setStringAsync(clientLoginUrl(coachSlug))` → `setCopied(true)` 2s (icono `Check` marca) luego `LinkIcon`. Solo si `coachSlug` (`:357`). |
| I2 | importar `[directory-import-btn]` | `:369-378` | `setShowImport(true)` → `NativeDialog` "Importar alumnos" + `ImportClientsForm` (`:503-511`). |
| I3 | card Herramientas `[directory-tools-card]` | `:255-269` | `router.push('/coach/tools')`. Solo si `toolsEnabled` (`:254`). |

### 4.2 Banners (montan `DirectoryAlertBanner`; handlers propios)
| # | Tocable (testID) | Linea | Efecto |
|---|---|---|---|
| B1 | `[directory-alert-urgent]` | `:283-285` | `onPress→setRiskFilter('urgent')`; `onDismiss→dismissAlert('urgent',stats.urgentCount)`. |
| B2 | `[directory-alert-expired]` | `:286-288` | `setRiskFilter('expired_program')`; dismiss `('expired',...)`. |
| B3 | `[directory-alert-sync]` | `:289-291` | `setRiskFilter('password_reset')`; dismiss `('sync',...)`. |
| B4 | `[directory-alert-nutrition]` | `:292-294` | `setRiskFilter('nutrition_low')`; dismiss `('nutrition_low',...)`. |
| B5 | `[directory-pulse-retry]` | `:296-300` | `loadPulse()`. Visible si `pulseError`. |
- `dismissAlert`/`isDismissed` compara `date===todayIso && count` (`:171-179`).

### 4.3 Action bar (`Input` + `BarButton`)
| # | Tocable (testID) | Linea | Efecto |
|---|---|---|---|
| A1 | search `[directory-search-input]` | `:385-395` | `onChangeText→setSearch`. `leftIcon=Search`, `clearButtonMode="while-editing"`, autoCap/Correct off. `Input` hardened (6c OK, §8). |
| A2 | Filtrar `[directory-filter-btn]` | `:396-398` | `setShowFilterSheet(true)` (abre `DirectoryFilterSheet` 3 grupos). `active=hasActiveFilters` (`:181`), `badge=activeFilterCount` (`:182`). `SlidersHorizontal 16`. |
| A3 | Ordenar `[directory-sort-btn]` | `:399-401` | `onPress→setShowSortSheet(true)`. **`onLongPress→setSortDir(toggle asc/desc)`** (§7 D3). `ArrowUpDown 16`. |
| A4 | Vista `[directory-view-toggle]` | `:402-404` | `toggleView` (`:117-121`): alterna `list↔cards`, persiste. `LayoutGrid`/`List` 16. |

### 4.4 Chips filtros (`chips[]` `:247-249`)
- `risk` si `riskFilter!=='all'` (label `RISK_LABELS[riskFilter]`, clear→`'all'`); `status` si `statusFilter!=='any'` (label `STATUS_OPTIONS.find().label`, clear→`'any'`).
| # | Tocable (testID) | Linea | Efecto |
|---|---|---|---|
| C1 | chip `[directory-chip-risk]`/`[directory-chip-status]` | `:305-309` | `onPress→c.onClear()`. `X 12` opacity 0.7 (`:308`). |
| C2 | `[directory-clear-filters]` | `:311-313` | `setRiskFilter('all'); setStatusFilter('any')`. "Limpiar" underline. |
- **Web** (`DirectoryActionBar.tsx:170-198`) chips incluyen tambien `program` + `search`; `clearAll` resetea program+search (`:200-205`) → §7 D7.

### 4.5 Conteo (`:318-322`)
`{displayed.length} alumno{s} · {sortLabel}`; `sortLabel=SORT_OPTIONS.find(o=>o.value===sortKey).label ?? 'Urgencia'` (`:183`). Web anexa " archivados" si `statusFilter==='archived'` (`DirectoryActionBar.tsx:260`) → §7 D9.

### 4.6 Vista `list` (default, `DirRowCard`) `:437-462`
`FlatList data=displayed`. Handlers a `DirRowCard`:
| Prop | Handler | Linea |
|---|---|---|
| `onOpen` | `goProfile`=`router.push('/coach/cliente/'+c.id)` (useCallback) | `:243,448` |
| `onWhatsApp` | `handleWhatsApp` si `phone&&coachSlug`, else `undefined` | `:188-191,449` |
| `onShare` | `handleShare`=`shareLogin(fullName,clientLoginUrl(slug))` | `:192-195,450` |
| `onWorkout` | `goWorkout`=`router.push('/coach/program-builder?clientId=..&clientName=..')` | `:244,451` |
| `onNutrition` | `goNutrition`=`router.push('/coach/nutricion')` | `:245,452` |
| `onReset` | `handleReset` (Alert→`resetClientPassword`) | `:219-235,453` |
| `onToggle` | `handleToggle` (Alert→`setClientStatus`→`load(true)`) | `:203-218,454` |
| `onDelete` | `handleDelete` (Alert→`deleteClient`→`load(true)`) | `:236-241,455` |
- `ListHeaderComponent=headerNode`, `ListEmptyComponent=emptyNode`, `onRefresh→load(true)` (`:456-461`).

### 4.7 Vista `cards` (`ClientCard`+parallax) `:407-435`
`Animated.FlatList`; `StackCardItem` (parallax `:67-77`) envuelve `ClientCard` con `onPress→goProfile`, `onWhatsApp`(cond), `onShareLogin→handleShare`, `onToggleStatus→handleToggle`, `onResetPw→handleReset`, `onDelete→handleDelete`, `onWorkout→goWorkout`, `onNutrition→goNutrition` (`:413-424`). `onScroll` anima `scrollY` (`:110,429`); header mide `headerH` (`:433`).

### 4.8 FAB + Sheets + Modales
| # | Tocable (testID) | Linea | Efecto |
|---|---|---|---|
| F1 | FAB `[directory-fab-new-client]` | `:466-474` | `setShowCreate(true)` → `CreateClientModal` (`:496-501`, `onCreated→load()`). Pill `theme.primary`+`GLOWS.sport`, `UserPlus 19`, "Nuevo alumno". |
| S1 | `DirectoryOptionSheet` (orden) | `:477-485` | `options=SORT_OPTIONS`, `selected=sortKey`, `onSelect→setSortKey`, close→`setShowSortSheet(false)`. |
| S2 | `DirectoryFilterSheet` (filtros) | `:486-495` | `statusFilter/onStatusChange/riskFilter/onRiskChange/archivedCount`. 3 grupos (§6). |
| M1 | `CreateClientModal` | `:496-501` | `onCreated→load()`. |
| M2 | `NativeDialog`+`ImportClientsForm` | `:503-511` | `maxClients`, `activeCount=clients.filter(!isArchived).length`, `onDone→{setShowImport(false); load()}`. |

### 4.9 Acciones por alumno (Alert nativo)
- `handleToggle` (`:203-218`): Alert pausar/activar, onPress→`setClientStatus(id,{is_active:!isActive})`→`load(true)`; catch Error.
- `handleReset` (`:219-235`): Alert confirm → `resetClientPassword(id)` → Alert temp password; catch Error.
- `handleDelete` (`:236-241`): Alert "No se puede deshacer" → `deleteClient(id)` → `load(true)`; catch Error.
- `handleWhatsApp` (`:188-191`): `openWhatsApp(phone,fullName,clientLoginUrl(slug))`. `handleShare` (`:192-195`): `shareLogin`.

---

## 5. Estados (vacio / carga / error)

### 5.1 Carga (`:340-347`)
`if (loading)` → `SafeAreaView` + `ScreenHeader title="Alumnos" subtitle="Cargando..."` + `EvaLoaderScreen subtitle="Cargando alumnos…"`.

### 5.2 Vacio (`emptyNode :326-338`) — UN nodo para ambos casos
- Icono `Users 32` en tile 72 `hexToRgba(primary,0.1)` (`:328-329`).
- Titulo: `search||hasActiveFilters ? 'Sin resultados' : 'Sin alumnos aún'` (`:331-333`).
- Sub: `search||hasActiveFilters ? 'Prueba ajustando los filtros o la búsqueda.' : 'Usa el botón Nuevo alumno para agregar tu primer alumno.'` (`:334-336`).
- **Web tiene DOS nodos:** cero-alumnos → `ClientsDirectoryEmpty.tsx:12-45` ("Suma tu primer alumno", tile `bg-sport-100`, CTAs "Crear alumno"+"Importar cartera" `:28-40`); filtro-vacio → `ClientsDirectoryClient.tsx:266-284` (`SearchX`, "Sin resultados", "Ningun alumno coincide con estos filtros.", boton "Limpiar filtros" `clearFilters :150-155`). → §7 D4/D5.

### 5.3 Error pulse (`:295-300`) — RN-additive
Banner `[directory-pulse-retry]`: "No se pudieron cargar las metricas (peso/adherencia)." + "Reintentar". Web no lo tiene (pulse server-side).

---

## 6. Sheets — wiring reality (aclara pregunta del brief sobre `DirectoryFilterSheet`)

**Pregunta del brief: ¿`DirectoryFilterSheet` esta cableado o muerto? → CABLEADO y VIVO.**
- `clientes.tsx:486-495` monta `DirectoryFilterSheet` (`showFilterSheet`), abierto por **Filtrar** (`:396`).
- `DirectoryOptionSheet` (`:477-485`) se usa **solo para ORDEN** (`title="Ordenar"`, `options=SORT_OPTIONS`), abierto por **Ordenar** (`:399`).
- `DirectoryFilterSheet.tsx` (read-only) tiene **3 grupos**: Estado (`:93-104`), Riesgo (`:107-117`), Programa (`:120-130`) + footer "Ver resultados" (`:133-140`) + titulo "Filtros" (`:90`). Estado→`statusFilter` (`:102`); Riesgo y Programa→ el mismo `riskFilter` (modelo combinado RN: Programa usa `with_program`/`no_program`/`expired_program` `:25-29,127`).
- **Web** `DirectoryActionBar.tsx:266-339`: un sheet, 3 grupos (Estado `:278-296` / Riesgo `:298-313` / Programa `:315-331`) + footer "Ver resultados". **1:1.**
- **Conclusion:** R5 §2.1 "Filtrar abre SOLO Estado (DirectoryOptionSheet)" esta **STALE** — el wiring completo YA landeo. **No hay fix de wiring pendiente en esta unidad.**

Copy verbatim (muestreo): Riesgo urgent "Atencion urgente" (web `:301`/RN `:20`); review "En riesgo" (`:302`/`:21`); nutrition_low "Nutricion baja (<60%)" (`:304`/`:23`); Programa expired "Vencido" (`:320`/`:28`); Estado pending_sync "Pendiente sync" (`:283`/`:16`). Todos **OK**.

---

## 7. Estado RN actual — divergencias con el web

### 7.1 Ya-resueltos vs R5 (marcar STALE en `r5-audit-coach-core.md` §2.1/§2.3/§2.4)
| Hallazgo R5 | Estado RN | Evidencia |
|---|---|---|
| §2.1 boton activo tint-marca vs ink | **RESUELTO** — RN `theme.foreground` solido | `clientes.tsx:544-546` |
| §2.1 iconos 18 vs 16 | **RESUELTO** — 16 | `:397,400,403` |
| §2.1 chip X sin opacity-70 | **RESUELTO** — `opacity:0.7` | `:308` |
| §2.1 sheet filtros incompleto | **RESUELTO** — 3 grupos cableados | `:486-495`; §6 |
| §2.1 conteo "N resultados"+flecha | **RESUELTO** — "N alumnos · orden" sin flecha | `:318-322` |
| §2.3 header sin copiar-portal, importar=FAB | **RESUELTO** — copiar-portal+importar icon-buttons | `:357-378` |
| §2.4 doble-FAB | **RESUELTO** — un solo FAB; Importar=header icon | `:465-474` vs `:369-378` |

### 7.2 Divergencias abiertas (esta unidad)
| # | Divergencia | RN | Web | Severidad |
|---|---|---|---|---|
| D1 | **FREEZE (gotcha 6b) — CRITICO** | `useEffect(()=>{load()},[])` single-shot (`:112`); **NO** `useFocusEffect` | Web RSC siempre fresco; al volver de la ficha tras archivar/pausar/eliminar, RN queda CONGELADO | **ALTO — reparacion central** |
| D2 | 2a vista distinta (patron/gesto) | `viewMode 'cards'`=grid `ClientCard`+parallax `StackCardItem` (`:407-435,67-77`) | `view 'table'`=tabla densa 9-col scroll-h `DirTableMobile.tsx` | **PENDIENTE-DECISION-CEO** |
| D3 | Gesto extra oculto en Ordenar | `onLongPress→toggle sortDir` (`:399`) | sin toggle manual (usa `defaultSortDir`) | **PENDIENTE-DECISION-CEO** |
| D4 | Empty sin CTAs ni "Limpiar filtros" | texto solo (`:326-338`) | Crear+Importar (`ClientsDirectoryEmpty`) + "Limpiar filtros" | **EST** |
| D5 | Copy zero-state | "Sin alumnos aún" / "Usa el botón Nuevo alumno..." (`:331-336`) | "Suma tu primer alumno" / "Ningun alumno coincide con estos filtros." | **copy** |
| D6 | Labels de orden | "Última sesión"(`shared:54`), "Adherencia"(`:57`), "Días plan restantes"(`:56`) | "Última actividad"(`types:25`), "Adherencia ↓"(`:26`), "Días programa"(`:28`) | **copy** |
| D7 | Chips: sin chip busqueda ni programa | solo risk+status (`:247-249`) | + program + `"query"` (`ActionBar:185-198`) | **EST** |
| D8 | Copy de chips (risk/status) | risk "Riesgo"/"Atencion" (`shared:70-71`); status "Cambio de contrasena pendiente" (`:65`) | risk "Atencion urgente"/"En riesgo" (`ActionBar:151-152`); "Pendiente sync" (`:161`) | **copy** |
| D9 | Conteo sin " archivados" | `:318-322` | anexa " archivados" si `statusFilter==='archived'` (`ActionBar:260`) | **PX/copy** |
| D10 | Badge Filtrar parcial | `activeFilterCount`=risk+status (`:182`) | `chips.length`=risk+status+program+search (`ActionBar:222,224`) | **PX** |
| D11 | Sin "Cargar mas" | FlatList virtualiza todo `displayed` | `visibleCount=48`+"Cargar mas (N restantes)" (`Client:126,202-215`) | **EST idiomatico RN** (aceptable) |
| D12 | Sin scoping por team en roster | solo org/standalone (`shared/clients-directory:120-132`) | maneja `activeTeamId` (`queries:34-37`) | **datos** (motor compartido) |
| D13 | Fuente del score de riesgo | `attentionScore` LOCAL (`:204-208,235-241`) | `pulse.attentionScore` SERVIDOR (`Client:50-53`) | **datos** |
| D14 | Placeholder search | "Buscar alumno..." (3 puntos, `:388`) | "Buscar alumno…" (ellipsis, `ActionBar:216`) | **PX/copy** |

---

## 8. Gotchas de clase (checklist verificador)
- **6a (@gorhom/nativeModal):** N/A — `clientes.tsx` no monta sheets `@gorhom`; `DirectoryFilterSheet`/`DirectoryOptionSheet` usan `Modal` RN nativo (`DirectoryFilterSheet.tsx:1,86`). Sin bomba -999. **OK.**
- **6b (congelamiento):** **VIOLADO (D1)** — `useEffect(()=>{load()},[])` (`:112`) de un disparo; falta `useFocusEffect`. Reparacion probable central.
- **6c (Fabric 45798):** search usa `Input` que aplica `borderColor` por `style` con className estable (`Input.tsx:103,143`, hardened `:13-25`). **OK.**
- **6d (claves de dia):** roster usa ventanas relativas por ms (`clients-directory.ts:118-119`), consistente con el web (`DirTableMobile.tsx:135`). No aplica Santiago al roster coach. **OK (documentado).**
- **6e (notificaciones):** N/A.

---

## 9. Accesibilidad
- `directory-copy-portal` role=button + label "Copiar portal de alumnos" (`:360-361`).
- `directory-import-btn` role=button + label "Importar alumnos" (`:371-372`).
- `BarButton` role=button + `accessibilityLabel=label` (Filtrar/Ordenar/"Ver como tarjetas") (`:538-540`).
- Chips/banners/FAB: `TouchableOpacity` con `activeOpacity`, sin aria-label (paridad con web, cuyos chips `<button>` tampoco tienen aria-label).

---

## 10. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)
- `"DirRowCard"` (L~10711, **alta**): "Roster de clientes... La tabla desktop (ClientsDirectoryTable/DesktopRosterTable) **no tiene espejo: mobile usa cards**." → confirma D2.
- `"ClientActionsSheet"` (L~10719, media): "Sheet de acciones por cliente." → en RN las acciones por fila van por props `onReset/onToggle/onDelete/...` que `clientes.tsx` pasa a `DirRowCard`/`ClientCard` (§4.6/4.7); `ClientActionsSheet.tsx` RN pertenece a `directory-sheets`.
- `"DirectoryActionBar"`/`"WarRoom"` = 0 hits → cubierto por R5 §2 (§11).

## 11. Hallazgos ronda 5 (`r5-audit-coach-core.md` §2)
- §2.1 Action bar: 5 diffs — **4/5 resueltos** (§7.1); residual: conteo sin " archivados" (D9) + badge parcial (D10).
- §2.2 DirRowCard → `directory-row-cards` (READ-ONLY).
- §2.3 WarRoom/Summary: header alineado (§7.1); metricas/colapsable → `directory-summary` (READ-ONLY).
- §2.4 doble-FAB: **resuelto**.

## 12. Sancion / decisiones
- **D1 (freeze):** fix tecnico obligado (no cambia lo que el usuario ve; lo mantiene fresco) — auto-sancionable.
- **D2 (2a vista cards-parallax vs tabla densa)** y **D3 (long-press orden):** cambian GESTO/patron → **PENDIENTE-DECISION-CEO** (regla 8), NO auto-sancionar.
- **D4-D10, D14:** re-skin/copy/PX sancionables como port 1:1. **D11-D13:** notas de idioma RN / motor de datos compartido (no re-skin puro).

## 13. GATE
Unidad SPEC-only: no se modifico codigo `apps/mobile`. Baseline tsc sin cambios por esta unidad (no aplica compilacion de un .md).
