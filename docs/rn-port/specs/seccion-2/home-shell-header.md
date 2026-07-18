# SPEC — Sección 2 · Unidad `home-shell-header`

**Shell del dashboard + DashboardHeader/saludo (P0-3 saludo duplicado) + SectionTitle/types**

Web = fuente de verdad. Cada afirmación cita `archivo:linea`. RN objetivo: `apps/mobile`.

Archivos web leídos línea por línea:
- `apps/web/src/app/c/[coach_slug]/dashboard/page.tsx` (integrador)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/DashboardShell.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/DashboardHeader.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/header/ClientGreeting.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/shared/SectionTitle.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/DashboardPullToRefresh.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/dashboard-skeletons.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/loading.tsx` + `_components/BrandClientLoadingShell.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/error.tsx`

RN contraparte:
- `apps/mobile/app/alumno/(tabs)/home.tsx`
- `apps/mobile/components/alumno/home/DashboardHeader.tsx`
- `apps/mobile/components/alumno/home/SectionTitle.tsx`
- `apps/mobile/components/alumno/home/types.ts`

---

## 0. Alcance de la unidad y disciplina de archivos

**POSEE (edita esta unidad):** `DashboardHeader.tsx`, `SectionTitle.tsx`, `types.ts`, y la porción de shell/loading/greeting de `home.tsx` (composición §2, estado loading, cómputo del `greeting`).

**RENDERIZA pero NO posee** (primitivos compartidos — solo consumir): `AppBackground` (`home.tsx:12,277,291`), `Skeleton` (`home.tsx:13,280-283`), `WelcomeModal` (`home.tsx:14,409-417` — su spec vive en la unidad WelcomeModal), `OrgAnnouncementBanner`, y las 12 secciones §1,§3..§13 (cada una es su propia unidad).

**Compartidos que otras unidades consumen:** `SectionTitle.tsx` lo importa MomentumCard y todas las secciones; `types.ts` lo consumen todas las secciones (`Program`, `Plan`, `MomentumDay`, `WEEK_LETTERS`, `EMBER_500`, `AQUA_700`, etc.). Cualquier cambio de firma en estos dos archivos afecta a otras unidades → si se necesita, reportar en `cambiosShell`, NO cambiar firmas a la ligera.

---

## 1. Integrador / composición (`page.tsx` web ↔ `home.tsx` RN)

### 1.1 Árbol web (móvil `<div className="flex flex-col gap-3.5 md:hidden">`, `page.tsx:80-161`)

Orden vertical verbatim (columna única, `gap-3.5` = 14px):

| § | Web | `page.tsx` | RN sección | `home.tsx` |
|---|-----|-----------|------------|-----------|
| 1 | OrgAnnouncementBanner (condicional `announcements.length>0`) | `77` | OrgAnnouncementBanner | `304` |
| 2 | **DashboardHeader** (Suspense→`DashboardHeaderSkeleton`) | `81-87` | **DashboardHeader** | `299-300` |
| 3 | StreakRibbonSection | `90-92` | StreakRibbon | `306-307` |
| 4 | CheckInBanner | `95-97` | CheckInBanner (condicional `ciVariant`) | `309-312` |
| 5 | HeroAndComplianceGroup | `100-102` | HeroSection | `314-326` |
| 6 | CoachPresenceCard | `105-111` | CoachPresenceCard (condicional `coachName`) | `328-329` |
| 7 | MomentumCard | `114-116` | MomentumCard | `331-343` |
| 8 | `SectionTitle "Tu programa"` + ActiveProgramSection | `119-124` | ídem (condicional `program`) | `345-359` |
| 9 | `SectionTitle "Peso y records" accent=--sport-500` + WeightWidget + PersonalRecordsCard | `127-137` | ídem | `361-380` |
| 10 | RecentWorkoutsSection (título dentro del componente) | `140-142` | `SectionTitle "Actividad reciente" action="Historial"` + RecentWorkouts | `382-388` |
| 11 | `SectionTitle "Hábitos de hoy" accent=--aqua-700` + HabitsTrackerWidget | `145-150` | ídem `accent={AQUA_700}` | `390-396` |
| 12 | `SectionTitle "Nutrición de hoy" accent=--ember-500 action="Ver nutrición"` + NutritionDailySummary | `153-160` | ídem `accent={EMBER_500}` (gate `nutritionEnabled`) | `398-404` |
| 13 | WelcomeModal (fuera del shell, dentro de `DashboardPullToRefresh`) | `174-180` | WelcomeModal (fuera del ScrollView) | `408-417` |

**Divergencia estructural de §10 documentada (Ola 0, P1):** web pone el `SectionTitle "Actividad reciente"` DENTRO de `RecentWorkoutsSection` y con 0 logs retorna `null` ocultando el título completo (`RecentWorkoutsSection.tsx:10`). RN lo pone en el shell (`home.tsx:383-388`), incondicional cuando hay `client` → con 0 registros el alumno ve el título "ACTIVIDAD RECIENTE" + link "Historial" y nada debajo. NO es de esta unidad resolverlo (es de la unidad RecentWorkouts), pero afecta el shell: si esa unidad mueve el título adentro, `home.tsx:382-388` debe dejar de renderizar el `SectionTitle`. **Reportar en cambiosShell.**

### 1.2 Datos: 1 fetch + derive

- Web es RSC: cada sección hace su propio fetch server-side vía `Suspense`. RN hace **UN** fetch en `home.tsx:load()` (`home.tsx:68-184`) + `derived` memo (`home.tsx:191-269`), documentado como paridad de datos válida (`home.tsx:49-54`). Esto es adaptación de plataforma legítima (RSC no existe en RN), NO tocar.
- El `coachData` (`home.tsx:103-107`) trae `brand_name, welcome_message, welcome_modal_*` desde `coaches` filtrando `id = client.coachId` — alimenta el header (`coachName`, `coachWelcome`) y el WelcomeModal.

### 1.3 Contexto team/pool (web `page.tsx:62-72`) — NO implementado en RN

Web deriva `greetingBrandName`/`greetingWelcomeMessage`/`welcomeModalEnabled` de headers `x-workspace-brand-source`/`x-client-base-path`/`x-coach-brand-name` (`page.tsx:66-72`): en contexto team usa el nombre del team para el saludo y **suprime** el WelcomeModal personal del coach. RN no tiene ese proxy `/t`→`/c` con headers de team; usa siempre `coachData.brand_name` (`home.tsx:170`). **Divergencia de plataforma, NO resolver en esta unidad** (mobile no expone workspaces team al alumno vía headers). Anotar y no eliminar el brandName actual.

---

## 2. DashboardShell (`DashboardShell.tsx`)

- Contenedor raíz: `min-h-dvh bg-background` (`DashboardShell.tsx:12`).
- Inner móvil (`<760`): `mx-auto w-full max-w-xl px-5 pt-2 pb-[calc(1.5rem+var(--mobile-content-bottom-offset))]` (`:13`). = centrado, ancho máx `max-w-xl` (36rem/576px), padding horizontal 20px (`px-5`), top 8px (`pt-2`), bottom `24px + offset de nav`.
- Hijos envueltos en `flex flex-col gap-3.5` (`:14`) = columna, gap 14px.
- Desktop (`md:` = 760px): `max-w-[1240px] px-8 pb-11 pt-7` (`:13`) — **fuera de alcance** (RN es solo móvil).

**RN equivalente:** el ScrollView de `home.tsx:292-298` + `styles.scroll` (`paddingBottom:120`, `home.tsx:424`) + `styles.content` (`paddingHorizontal:16, gap:14, paddingTop:14`, `home.tsx:425`). RN usa 16px horizontal vs web 20px (`px-5`); `gap:14` = `gap-3.5` ✔; `paddingBottom:120` cubre el nav flotante (equivale a `--mobile-content-bottom-offset`). Header full-bleed va ANTES de `styles.content` (`home.tsx:299-300`) para ir a borde completo. Adaptación válida.

---

## 3. DashboardHeader (`DashboardHeader.tsx` web ↔ RN) — núcleo de la unidad

### 3.1 Layout y jerarquía (web `DashboardHeader.tsx:20-33`)

`<header>` con clases (`:21`):
```
sticky left-0 right-0 top-0 z-40 border-b border-subtle bg-surface-app/95 pt-safe backdrop-blur-xl
lg:static lg:z-auto lg:border-none lg:bg-transparent lg:pt-0 lg:backdrop-blur-none
```
Inner (`:22`): `flex h-14 items-center justify-between gap-3 px-4 lg:px-0` (altura fija 56px, padding-x 16px).

Columna de texto (`:23` `min-w-0 flex-1`), 4 líneas en orden:
1. **Eyebrow brandName** (condicional `brandName`, `:24-26`): `<p className="truncate text-[10px] font-bold uppercase tracking-widest text-subtle">` → 10px, peso 700, uppercase, tracking `widest`=0.1em (→1.0px), color `text-subtle`, 1 línea truncada.
2. **ClientGreeting** (`:27`, `key={iso}`) — ver §4.
3. **welcomeMessage** (condicional, `:28-30`): `<p className="mt-0.5 truncate text-[11px] text-muted">` → margin-top 2px, 11px, `text-muted`, 1 línea truncada.

### 3.2 Datos (web `DashboardHeader.tsx:11-18`)

- `firstName = client?.full_name?.split(' ')[0] ?? 'Atleta'` (`:13`) — **fallback `'Atleta'`** cuando falta nombre.
- `greet = timeGreetingSantiago()` (`:14`) — cortes 5/12/19 (`Buenos días`/`Buenas tardes`/`Buenas noches`), idénticos a RN `date-utils.ts:111-116`.
- `dateLabel = formatLongDateSantiago()` (`:15`) — `es-CL` weekday+day+month, idéntico a RN `date-utils.ts:118-120`.
- `iso = getTodayInSantiago().iso` (`:16`) → usado como `key` del ClientGreeting.
- `greeting = `${greet}, ${firstName}`` (`:18`) — SIEMPRE con nombre (o "Atleta").

### 3.3 Tipografía / tokens — paridad ya confirmada (Ola 0 `notes` 6449)

Orden eyebrow→fecha→saludo→welcome, tamaños 10/10/25/11px, familias Archivo_900Black (=`font-display font-black`) para el saludo, Hanken pesos para el resto, uppercase, `numberOfLines=1`, tokens `text-subtle/text-muted/text-strong`, `bg-surface-app`, `border-subtle` — todo en paridad exacta. El saludo RN `textStyle('2xl', FONT.displayBlack, {lh:'snug', ls:'tighter'})` (`DashboardHeader.tsx:51`) = 25px / `-0.75` letterSpacing = web `text-[25px] tracking-[-0.03em]` exacto.

### 3.4 Claro / oscuro

Tokens gobiernan el modo automáticamente: `text-subtle`, `text-muted`, `text-strong`, `bg-surface-app`, `border-subtle` (className NativeWind) invierten por `.dark`. Cero valores crudos nuevos. El saludo web usa `text-strong` (ClientGreeting.tsx:18,33); RN `text-strong` (`DashboardHeader.tsx:50`). ✔

### 3.5 Interactividad

El header NO tiene elementos interactivos (ni web ni RN). No hay onPress, navegación ni toast. Es puramente presentacional.

### 3.6 Accesibilidad

- Web: `<h1>` semántico para el saludo (ClientGreeting.tsx:18,32). RN no tiene roles heading nativos aquí; el `<Text>` del saludo (`DashboardHeader.tsx:48-54`) podría llevar `accessibilityRole="header"` (mejora opcional, no bloqueante — web usa h1).
- `numberOfLines={1}` en las 4 líneas RN (`DashboardHeader.tsx:35,43,50,56`) = `truncate` web.

---

## 4. ClientGreeting (`ClientGreeting.tsx`) — animación del saludo

**Web (`ClientGreeting.tsx:11-46`):**
- `reduce = useReducedMotion()` (`:12`). Con reduce-motion (`:14-21`): dateLabel `<p>` estático + `<h1>` estático, sin animación.
- Sin reduce (`:22-45`):
  - dateLabel `<motion.p>` fade `initial opacity:0 → animate opacity:1`, `transition springs.snappy` (`:24-31`).
  - `<motion.h1 variants={staggerContainer(0.04)} initial="hidden" animate="show">` (`:32-37`) — contenedor con stagger de 40ms.
  - Cada palabra `greeting.split(' ')` (`:13`) → `<motion.span variants={fadeSlideUp} transition={springs.snappy} className="mr-1 inline-block">` (`:38-42`) — entrada palabra por palabra (opacity+translateY).
- dateLabel: `truncate text-[10px] font-semibold uppercase tracking-widest text-muted` (`:17,25`) — 10px, peso 600, uppercase, tracking 0.1em, `text-muted`.
- h1/saludo: `truncate font-display text-[25px] font-black tracking-[-0.03em] text-strong` (`:18,33`) — 25px, Archivo black, tracking -0.03em, `text-strong`.
- `DashboardHeader.tsx:27` `key={iso}` re-monta la animación al cambiar el día en Santiago.

**RN estado actual:** `DashboardHeader.tsx:41-54` renderiza `<Text>` estáticos — **la animación stagger está AUSENTE** (Ola 0 P2, item 6420-6425). RN además fusiona dateLabel+saludo en el mismo componente (no hay ClientGreeting separado). Copiar la animación es P2 (opcional en esta ronda); si se implementa: Reanimated `FadeIn` para dateLabel + entrada escalonada 40ms/palabra (`translateY`+`opacity` tipo `fadeSlideUp`, spring 'snappy'), respetando `AccessibilityInfo.isReduceMotionEnabled`, re-disparo al cambiar `iso`.

---

## 5. P0-3 (QA CEO): saludo duplicado / marquee — CONDUCTA WEB QUE LO RESUELVE

### 5.1 Síntoma reportado
Saludo "Buenas tardes, {nombre}" percibido como **duplicado / marquee** (dos capas o texto que salta). Anclas asignadas: `home.tsx:271-272` arma `greeting`; se renderiza DOS veces — en loading (`home.tsx:278`) y cargado (`home.tsx:300`); `DashboardHeader.tsx:48-54` lo pinta con `FONT.displayBlack`, `numberOfLines=1`.

### 5.2 Causa raíz (evidencia RN)
1. **Doble texto de saludo en transición loading→loaded.** RN calcula `greeting` una sola vez por render (`home.tsx:271-272`) PERO lo usa en dos ramas de render distintas:
   - Rama loading (`home.tsx:274-287`): `data` es `null` → `firstName = ''` (`home.tsx:271`) → `greeting = 'Buenas tardes'` (sin nombre), y además pasa `greeting || 'Hola'` (`home.tsx:278`).
   - Rama cargada (`home.tsx:289-419`): `data` presente → `greeting = 'Buenas tardes, {Nombre}'` (`home.tsx:300`).
   
   Al pasar loading→loaded, el header se **desmonta y remonta** con un texto de saludo distinto ("Buenas tardes" o "Hola" → "Buenas tardes, Nombre"). Con `numberOfLines=1` y fuente `Archivo_900Black`, ese swap se lee como salto/duplicado.
2. **Fallback de fuente que solapa capas.** `Archivo_900Black` (`DashboardHeader.tsx:51` vía `FONT.displayBlack`, `typography.ts:39`) se carga async en `_layout.tsx`. Antes de cargar, RN pinta con la cara de sistema (más ancha); al resolver la fuente re-mide y re-pinta el mismo `<Text>` → parpadeo/solape momentáneo de la línea del saludo, agravado por el remonte del punto 1.

### 5.3 Conducta web EXACTA que lo resuelve
La web **nunca** muestra dos textos de saludo en secuencia para una misma carga:
- Es RSC: el `greeting` se computa server-side **una vez** con el `firstName` real (`DashboardHeader.tsx:13,18`) y se pinta ya final.
- Durante la carga, el fallback del `<Suspense>` es `DashboardHeaderSkeleton` (`page.tsx:81`), que **NO contiene texto de saludo** — solo barras `BrandSkeleton` (`dashboard-skeletons.tsx:19-28`: `h-5 w-36` + pill `h-7 w-20` + cuadro `h-9 w-9`). No hay ninguna cadena "Hola"/"Buenas tardes" placeholder.
- `ClientGreeting` re-anima solo por `key={iso}` (cambio de día), no por cambio de datos (`DashboardHeader.tsx:27`).

**Resolución RN (comportamiento a lograr, sin prescribir código):**
1. En la rama loading (`home.tsx:274-287`) **NO renderizar un DashboardHeader con saludo placeholder**. Renderizar en su lugar un **skeleton de header sin texto de saludo** (paridad con `DashboardHeaderSkeleton` web: barras `Skeleton` para eyebrow/fecha/saludo). Así el saludo textual aparece **una sola vez**, ya con el `firstName` final, al terminar la carga. Esto elimina el swap "Hola/Buenas tardes" → "Buenas tardes, Nombre" que produce el efecto duplicado.
2. Adoptar el fallback web del nombre: `firstName ... ?? 'Atleta'` (web `DashboardHeader.tsx:13`) en `home.tsx:271` en vez de `?? ''` → el saludo cargado siempre es `${greet}, ${Nombre|Atleta}`, idéntico al web (Ola 0 P2 item 6427-6432).
3. Mitigar el fallback de fuente: garantizar que el saludo solo se monte cuando la fuente esté lista (el gate de fuentes ya vive en `_layout.tsx`; si el header de loading es skeleton, el saludo real no se pinta hasta loaded, cuando las fuentes ya cargaron). No introducir estilos condicionales por focus (Gotcha Fabric #45798 — no aplica aquí porque no hay TextInput, pero mantener el árbol del `<Text>` estable, sin remonte por estado).

> **NOTA de disciplina:** el cambio (1) toca SOLO `home.tsx` (rama loading) y opcionalmente añade un skeleton local; (2) toca SOLO `home.tsx:271`. Ambos dentro de esta unidad. Si se prefiere un componente `DashboardHeaderSkeleton` RN reutilizable, crearlo bajo `components/alumno/home/` (propiedad de esta unidad). El primitivo `Skeleton` (`components/Skeleton.tsx`) se consume, no se modifica.

---

## 6. SectionTitle (`SectionTitle.tsx` web ↔ RN) — compartido, editable solo por esta unidad

### 6.1 Estructura (web `SectionTitle.tsx:19-31`)
- Contenedor: `mx-0.5 mb-2.5 mt-5 flex items-center justify-between` (`:20`) = margin-x 2px, mt 20px, mb 10px, row space-between.
- Grupo izquierdo `<span className="inline-flex items-center gap-2">` (`:21`, gap 8px):
  - Barra de acento `<span aria-hidden className="h-3 w-[3px] shrink-0 rounded-sm" style={{background: accent}}>` (`:22`) = **12×3px**, rounded-sm, color = `accent`.
  - Label `<span className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-subtle">` (`:23`) = **11px, peso 800**, uppercase, tracking 0.07em (0.77px), `text-subtle`.
- Acción (condicional `action && actionHref`, `:25-29`): `<Link href={actionHref} className="text-[12.5px] font-bold text-sport-600">` = 12.5px, peso 700, color `sport-600`.
- Default `accent = 'var(--sport-500)'` (`:10`).

### 6.2 Props web
`children: ReactNode`, `accent?: string` (default `var(--sport-500)`), `action?: string`, `actionHref?: string` (`:8-18`). Bajo white-label `--sport-500` = color de marca verbatim.

### 6.3 Divergencias RN (Ola 0) a corregir en esta unidad
| Elemento | Web | RN actual | Sev | Fix |
|---|---|---|---|---|
| Color del link acción | `text-sport-600` (#1462DC claro / #7FB0FF oscuro) — `SectionTitle.tsx:26` | `theme.primary` = sport-500 (#2680FF) — `SectionTitle.tsx:40` | **P1** | usar clase `text-sport-600` (existe en `apps/mobile/global.css:43,174`, recoloreada por `brandVars` `theme.ts:258`) en vez de `theme.primary`. Máx impacto en dark. |
| Tipografía label | 11px / peso 800 — `SectionTitle.tsx:23` | `TYPE.eyebrow` = 12px / Hanken 700 (`typography.ts:113,48`) + `letterSpacing:0.8` — `SectionTitle.tsx:34` | P2 | override sobre `TYPE.eyebrow`: `fontSize:11` (`TYPE_SCALE['3xs']`) + `fontFamily:FONT.uiExtra` (Hanken_800ExtraBold), mantener `letterSpacing:0.8`. |
| Altura barra acento | `h-3` = 12px — `SectionTitle.tsx:22` | `height:13` — `SectionTitle.tsx:33` | P2 | `height:12` (y corregir el comentario `:7` que dice "3×13"). |
| Acento default dark bajo branding | `var(--sport-500)` verbatim — `SectionTitle.tsx:10` | `theme.primary` = `t.accent` con contrast-clamp por modo (`theme.ts:217-222`) — `SectionTitle.tsx:27` | P2 | usar canal sport-500 del theme/brandVars (equivalente exacto de `var(--sport-500)`) como fallback, no `theme.primary`. |

### 6.4 Paridades confirmadas (NO tocar — Ola 0 `notes` 6482)
`mx-0.5/mt-5/mb-2.5` (2/20/10px exactos, `:20` vs RN `:30`), gap 8 (`:21` vs `:32`), ancho barra 3px, uppercase+`text-subtle` del label, fontSize 12.5 + bold de la acción (`font-sans-bold`=Hanken700=web `font-bold`). Adaptaciones idiomáticas válidas: `Link href`→`TouchableOpacity onPress activeOpacity 0.7` (misma condición `action && handler`), props aditivas `style`/`actionTestID`, `children:string` vs `ReactNode`.

### 6.5 GOTCHA de firma (disciplina de archivos)
Web usa `action`+`actionHref` (navegación declarativa). RN usa `action`+`onAction`+`actionTestID` (`SectionTitle.tsx:38-44`) porque la navegación en RN es imperativa (`router.push`). Esta divergencia de firma **ya está consumida por otras unidades** (home §10/§12 pasan `onAction`). NO cambiar la firma RN a `actionHref`. Si se agregara una prop, hacerlo aditivo y reportar en `cambiosShell`.

---

## 7. types.ts (`types.ts`) — compartido, editable solo por esta unidad

- Contrato de datos del dashboard (`HomeData` `:64-81`, `Program`/`Plan`/`HeroBlock` `:12-43`, `PlanDayView`/`PendingDay`/`DayStatus` `:83-97`, `WelcomeModalConfig` `:56-62`, `CheckInPoint` `:51-54`, `RecentWorkout` `:45-49`).
- Constantes de acento DS FIJAS (`:99-108`): `EMBER_500='#FF6A3D'`, `EMBER_600`, `EMBER_700`, `AQUA_700='#0A6E8D'`, `DANGER_600/500`, `WARNING_500`, `SUCCESS_500`. Comentario `:99-100` aclara que son rampas constantes (nunca white-label); sport sigue la marca vía `theme.primary`. **Paridad de tokens:** `AQUA_700` = web `var(--aqua-700, #0A6E8D)` (`page.tsx:146`) ✔; `EMBER_500` = web `var(--ember-500)` (`page.tsx:154`) — verificar que `#FF6A3D` = valor de `--ember-500` en `global.css` (fuera de alcance; el contrato lo declara fijo).
- Etiquetas de día (`:110-112`): `WEEK_LETTERS = ['L','M','X','J','V','S','D']` (Lun..Dom), `DAY_SHORT = ['','Lun','Mar','Mié','Jue','Vie','Sáb','Dom']` (dbDay 1..7). Copy verbatim del diseño.
- **Estas constantes las importan otras unidades** (MomentumCard usa `WEEK_LETTERS`; home usa `AQUA_700`/`EMBER_500`/`DAY_SHORT`). NO renombrar ni cambiar valores sin reportar en `cambiosShell`.

---

## 8. Pull-to-refresh (`DashboardPullToRefresh.tsx` web ↔ RN `RefreshControl`)

- Web (`DashboardPullToRefresh.tsx:7-66`): gesto touch custom — `onTouchStart/Move/End`, dispara `router.refresh()` cuando `dist>=60` (`:33-35`), timeout 800ms (`:36-39`), spinner `Loader2` centrado con `color:var(--theme-primary)`, `animate-spin` mientras refresca (`:50-61`).
- RN (`home.tsx:292-298,186-189`): usa `RefreshControl refreshing={refreshing} onRefresh={onRefresh}` nativo; `onRefresh` re-llama `load()` (`home.tsx:186-189`). **Adaptación idiomática válida** (RN tiene RefreshControl nativo; el gesto touch custom web no aplica). El spinner nativo reemplaza el `Loader2`. NO recrear el gesto manual. El `router.refresh()` web ≈ `load()` RN (re-fetch). Paridad de comportamiento: pull → re-fetch → spinner. **Esta unidad no debe tocarlo salvo verificar que el color del RefreshControl siga el theme** (RN `RefreshControl` default; opcional `tintColor`/`colors` = `theme.primary` para paridad con `var(--theme-primary)` web `:60`).

---

## 9. Estados (vacío / carga / error / éxito)

### 9.1 Carga
- Web móvil: `loading.tsx` → `BrandClientLoadingShell` (`loading.tsx:1-5`, `BrandClientLoadingShell.tsx:20-33`) = loader de ruta brandeado (logo coach/EVA, texto custom desde headers `x-coach-loader-*`). Adicionalmente cada sección tiene su `<Suspense>` fallback (skeletons `page.tsx:81-160`); el header usa `DashboardHeaderSkeleton` (barras, **sin texto de saludo**).
- RN: `home.tsx:274-287` renderiza `AppBackground` + `DashboardHeader` (con saludo placeholder — **ESTO es la causa del P0-3, ver §5**) + 4 `Skeleton` (72/200/64/160, radios 20/22/22/22, `home.tsx:280-283`). **Resolución P0-3:** reemplazar el DashboardHeader-con-saludo por un skeleton de header sin texto.
- No hay loader de ruta brandeado RN equivalente al `BrandClientLoadingShell` (no exigible en esta unidad; RN carga in-app).

### 9.2 Error
- Web: `error.tsx` (`error.tsx:11-48`) — error boundary del dashboard: `Card padding="lg"`, ícono `AlertTriangle` color `var(--danger-500)`, `<h2>` "No pudimos cargar tu panel" (`font-display text-xl font-black`), texto "Hubo un problema al mostrar tu información. Intenta recargar en un momento." (`text-sm text-muted`), `error.digest` opcional (`text-[11px] tabular-nums text-subtle`), botón "Reintentar" (`RotateCcw` + `bg-[var(--cta-fill)] text-on-sport active:scale-[0.97]`) que llama `reset()`. Captura a Sentry (`error.tsx:18-20`).
- RN: `home.tsx:65` `load().catch(() => setLoading(false))` y `onRefresh` `.catch(() => setRefreshing(false))` (`home.tsx:188`) — **NO hay UI de error dedicada**; un fallo deja el dashboard renderizado con `data=null` (secciones condicionales ocultas, header con saludo sin nombre). **Divergencia (no P0 de esta unidad):** no existe error boundary RN equivalente. Anotar como gap; construir un error state RN está fuera del scope explícito de esta unidad salvo que se decida (reportar). El copy verbatim para un eventual error state: título "No pudimos cargar tu panel", cuerpo "Hubo un problema al mostrar tu información. Intenta recargar en un momento.", botón "Reintentar".

### 9.3 Vacío
- El shell no tiene empty-state propio: cada sección lo maneja. §10 tiene el bug de título huérfano (ver §1.1). El header nunca está vacío (siempre saludo+fecha).

### 9.4 Éxito
- Render final: header (saludo+fecha+brand+welcome) + 12 secciones según datos (condicionales por `program`/`coachName`/`ciVariant`/`nutritionEnabled`/`client`).

---

## 10. Onboarding gate (RN-only, `home.tsx:64`)

`getOnboardingStatus().then((done) => { if (!done) router.replace('/alumno/onboarding') })` (`home.tsx:64`). Redirige a onboarding si no está completo. NO tiene equivalente en `page.tsx` (web lo gestiona en otra capa). **Funcionalidad RN existente — NO eliminar.** Fuera del alcance de re-skin de esta unidad; preservar.

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Grep por `DashboardHeader`, `SectionTitle`, `WelcomeModal` (esta última renderizada, no poseída).

### DashboardHeader (bloque 6418-6449)
1. **P2** Animación de entrada del saludo AUSENTE (stagger palabra-por-palabra + fade dateLabel + re-disparo `key={iso}` + reduced-motion). Web `ClientGreeting.tsx:24-43,12-21`; RN `DashboardHeader.tsx:41-54` estático. (Ver §4.)
2. **P2** Fallback del nombre: web `?? 'Atleta'` (`DashboardHeader.tsx:13,18`); RN `?? ''` → sin nombre solo "Buenas tardes" y "Hola" en loading (`home.tsx:271-272,278`). Fix: usar `'Atleta'`. **Ligado al P0-3 (§5.3.2).**
3. **P2** letterSpacing eyebrow brandName: web `tracking-widest`=1.0px a 10px (`DashboardHeader.tsx:25`); RN `letterSpacing:1.4` (0.14em, `DashboardHeader.tsx:36`). Fix: `letterSpacing:1` (consistente con el dateLabel `:44` que ya usa 1). Valor 1.4 no corresponde a ningún token.
4. **P2** Header sticky translúcido con blur en web móvil (`bg-surface-app/95 backdrop-blur-xl`, `DashboardHeader.tsx:21`) vs RN sólido que scrollea con el contenido (`DashboardHeader.tsx:27-30`, montado en ScrollView `home.tsx:299-300`). **Divergencia intencional aprobada por el CEO** (documentada en `DashboardHeader.tsx:8-11`). NO tocar.
- **Nota Ola 0:** `useTheme()` en `DashboardHeader.tsx:25` es dead code (se destructura `theme` y no se usa). Limpieza opcional.
- Paridades confirmadas (no tocar): orden eyebrow→fecha→saludo→welcome, 10/10/25/11px, familias/pesos, uppercase, truncate, tokens, `px-4`=16px, `mt-0.5`=2px, `pt-safe`=insets.top, cortes 5/12/19, formato es-CL Santiago, saludo 25px/-0.75ls exacto, minHeight56+pv8 vs h-14 (adaptación válida).

### SectionTitle (bloque 6451-6482) — ver tabla §6.3
1. **P1** Color acción `theme.primary`(sport-500) vs web `text-sport-600`. Máx impacto en dark.
2. **P2** Label 12px/700 vs web 11px/800.
3. **P2** Barra acento height 13 vs web 12.
4. **P2** Acento default dark: `theme.primary` clamp vs web `var(--sport-500)` verbatim.
- También item independiente (bloque 5980-6045): mismos hallazgos de tamaño/peso/altura + el título huérfano de §10 (P1, no de esta unidad) + color link Historial P1.

### WelcomeModal (bloque ~6320-6416) — RENDERIZADO, no poseído por esta unidad
Múltiples discrepancias (P2): validación de content vacío ausente (`WelcomeModal.tsx:32-36`), Vimeo no soportado, jerarquía de título distinta, autoplay/overlay "Activar sonido" ausente, mute control ausente, backdrop no cierra al tap, bordes header/footer ausentes, copy "No mostrar de nuevo" recortado, checkbox color `#fff` hardcodeado (viola tokens), sombra/blur ausentes. **Todo esto pertenece a la unidad WelcomeModal** — esta unidad solo lo renderiza (`home.tsx:409-417`). Listado aquí solo por trazabilidad del grep; NO resolver aquí.

---

## Estado RN actual — divergencias más obvias (con citas RN)

1. **P0-3 saludo duplicado/marquee** — `home.tsx:271-272` computa `greeting`; loading (`home.tsx:278`, "Hola"/"Buenas tardes" sin nombre) y loaded (`home.tsx:300`, "Buenas tardes, Nombre") pintan textos de saludo distintos que se swapean al montar/desmontar el header → efecto duplicado, agravado por el fallback de `Archivo_900Black` (`DashboardHeader.tsx:51`). **Resolución en §5.3.**
2. **Fallback de nombre divergente** — RN `?? ''` (`home.tsx:271`) vs web `?? 'Atleta'` (`DashboardHeader.tsx:13`).
3. **SectionTitle P1** — color de la acción usa `theme.primary`=sport-500 (`SectionTitle.tsx:40`) en vez de `sport-600`; label 12px/700 (`SectionTitle.tsx:34`) vs 11px/800; barra height 13 (`SectionTitle.tsx:33`) vs 12.
4. **letterSpacing eyebrow 1.4** — `DashboardHeader.tsx:36` (debería ser 1).
5. **Animación del saludo ausente** — `DashboardHeader.tsx:41-54` estático (P2).
6. **Sin error boundary RN** — `home.tsx:65,188` solo `.catch(()=>setLoading(false))`; no hay UI equivalente a `error.tsx`.
7. **§10 título huérfano** (bug de plataforma, no de esta unidad pero afecta el shell): `home.tsx:383-388` renderiza `SectionTitle "Actividad reciente"` incondicional → con 0 logs queda cabecera vacía (web la oculta). Reportar en cambiosShell.

---

## Resumen de cambios propuestos DENTRO de esta unidad
1. `home.tsx` — rama loading (`:274-287`): reemplazar `DashboardHeader`-con-saludo por skeleton de header sin texto de saludo (resuelve P0-3).
2. `home.tsx:271` — `firstName ... ?? 'Atleta'` (paridad web).
3. `DashboardHeader.tsx:36` — `letterSpacing:1`.
4. `DashboardHeader.tsx:41-54` — (opcional P2) animación stagger con Reanimated + reduced-motion + re-disparo por `iso`.
5. `SectionTitle.tsx:40` — color acción → `text-sport-600`.
6. `SectionTitle.tsx:34` — label `fontSize:11` + `FONT.uiExtra`.
7. `SectionTitle.tsx:33` — barra `height:12` (+ corregir comentario `:7`).
8. `SectionTitle.tsx:27` — fallback de barra → canal sport-500 del brandVars en vez de `theme.primary` (dark).
9. (opcional) `RefreshControl` `tintColor={theme.primary}` para paridad de color con web spinner.

## cambiosShell (cambios necesarios FUERA de esta unidad — reportar, no ejecutar)
- **§10 título huérfano:** cuando la unidad RecentWorkouts mueva el `SectionTitle "Actividad reciente"` dentro del componente (paridad `RecentWorkoutsSection.tsx:10`), `home.tsx:382-388` debe dejar de renderizar ese `SectionTitle` en el shell. Coordinar con la unidad RecentWorkouts.
- **WelcomeModal:** todas las discrepancias P2 listadas en Ola 0 (bloque 6320-6416) son de la unidad WelcomeModal, no de aquí.
- **Error boundary RN:** decidir si se construye un error state para `home.tsx` (copy verbatim en §9.2); no está en el scope de re-skin de esta unidad.
