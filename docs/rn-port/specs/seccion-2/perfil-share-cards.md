# SPEC — Perfil del alumno + tarjetas para compartir (`perfil-share-cards`)

**Seccion 2 · Dashboard del alumno.** Fuente de verdad = web `/c/[coach_slug]/perfil/*`.
Cada afirmacion cita `archivo:linea`. Copy = verbatim del web.

## 0. Archivos fuente

| Rol | Archivo |
|---|---|
| Server page (data fetch) | `apps/web/src/app/c/[coach_slug]/perfil/page.tsx` |
| Client shell | `apps/web/.../perfil/_components/ProfileClient.tsx` |
| Modal card Progreso | `apps/web/.../perfil/_components/ProgressShareCardModal.tsx` |
| Modal card Racha | `apps/web/.../perfil/_components/StreakShareCardModal.tsx` |
| Modal card Mensual | `apps/web/.../perfil/_components/MonthlySummaryShareCardModal.tsx` |
| Motor canvas 1080×1350 (4 cards) | `apps/web/src/lib/workout-pr-card-canvas.ts` |
| Query resumen mensual | `apps/web/.../perfil/_data/monthly-recap.queries.ts` |
| **RN pantalla** | `apps/mobile/app/alumno/(tabs)/perfil.tsx` (419→703 lineas reales) |
| **RN motor share** | `apps/mobile/components/ShareCard.tsx` |
| **RN card mensual (huerfana, ver §9)** | `apps/mobile/components/alumno/MonthlySummaryShareCard.tsx` |
| **RN query mensual** | `apps/mobile/lib/monthly-summary.ts` |

---

## 1. Data fetch (server) — `page.tsx`

- Guard sesion: `getClientDashboardUser()` → sin user `redirect(base+'/login')` (`page.tsx:27-28`); `getClientProfile(user.id)` → sin client redirect login (`page.tsx:30-31`).
- `Promise.all` de 6 fuentes (`page.tsx:33-42`): `getDashboardStreak(client.id)`, `getWorkoutHistoryDayCounts(client.id, 365)` (comentario: cada dia con series = 1 entreno, ventana 1 año agregada en DB — `page.tsx:35`), `getActiveProgram(client.id)`, `getStudentMovementNavEnabled()`, `getStudentBodyCompositionNavEnabled()`, `getMonthlyRecap(client.id)` (mes calendario Santiago — `page.tsx:40`).
- `totalWorkouts = dayCounts.length` (`page.tsx:59`).
- `brandName` team-aware: header `x-coach-brand-name` → `coachBranding.brand_name` → `'tu coach'` (`page.tsx:47-49`). `coaches` puede ser array o fila (normaliza `page.tsx:47-48`).
- Metadata title `'Mi perfil'` (`page.tsx:17`).
- Props a `ProfileClient` (`page.tsx:52-63`): `fullName` (fallback `'Alumno'`), `brandName`, `programName` (`program?.name ?? null`), `streak`, `totalWorkouts`, `showMovement`, `showBodyComposition`, `monthlyRecap`.

### Query mensual — `monthly-recap.queries.ts`
- `getMonthlyRecap` es `cache(...)` (`:22`). Lee `getSantiagoMonthPrefix()` (`:24`).
- 2 RPC en paralelo (`:26-29`): `get_client_workout_day_counts` (`p_client_id`, `p_days_back:31`) y `get_client_daily_tonnage` (`p_client_id`, `p_max_days:31`). Ambos con GRANT a `authenticated` + guard IDOR 3-vias, agregados en Santiago (`:16-21` docblock).
- Reduce via `reduceMonthlyRecap(dayCounts, tonnage, monthPrefix)` → `{sessions, volumeKg}` (`:34`); `monthLabel = formatSantiagoMonthLabel()` (`:36`).
- Retorno `{sessions, volumeKg, monthLabel}` (`:36`). `MonthlyRecap` interface `:7-14`.

---

## 2. Layout y jerarquia del shell — `ProfileClient.tsx`

Contenedor: `div.mx-auto.w-full.max-w-2xl.px-5.pb-8.pt-safe` (`:236`).

Orden vertical de secciones:
1. **Header** — `<header className="flex items-center py-4">` con `<h1 class="font-display text-[22px] font-black tracking-[-0.02em] text-text-strong">Mi perfil</h1>` (`:237-239`).
2. **Hero identidad** (Card inverse) — `:242-264`.
3. **Stats grid 2-col** — `:267-270`.
4. **Comparte tu logro** (CTA) — `:273-290`.
5. **Apariencia** — `SectionTitle` + Card con `Tema` + `<ThemeToggle/>` (`:293-299`).
6. **Preferencias** — `SectionTitle` + Card con "Alarma de descanso" + `<Select>` (`:302-322`).
7. **Modulos** (condicional `hasModules`) — `:325-366`.
8. **Cuenta** — `:369-376`.
9. **Zona de peligro** — `:379-400`.
10. **Footer version** — `:402`.
11. Sheet selector + 3 modales condicionales — `:405-472`.

### 2.1 Hero identidad (`:242-264`)
- Contenedor `flex items-center gap-4 rounded-card p-5` + `style background: var(--surface-inverse)` (`:242-245`).
- Avatar = iniciales, `span h-16 w-16 rounded-full font-display text-xl font-black` con `background: var(--sport-100)`, `color: var(--sport-600)`, `boxShadow: 0 0 0 2.5px var(--sport-500)` (ring) (`:246-251`). `initials()` = 1 palabra → 2 chars upper; 2+ → iniciales de primeras 2 palabras; vacio → `'A'` (`:56-61`).
- Nombre: `div.truncate.font-display.text-[22px].font-black.text-on-dark` = `{fullName}` (`:253`).
- Linea coach: `div.mt-0.5.truncate.text-[13px].text-on-dark-muted` = `Coach: {brandName}` (`:254`).
- Pill programa (solo si `programName`): `span.mt-2 ... rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-white` bg `var(--sport-500)` = `{programName}` (`:255-262`).
- **El hero web NO muestra email.**

### 2.2 Stats grid (`:267-270`)
- `div.mb-4.grid.grid-cols-2.gap-3`.
- `StatCard label="Entrenos" value={totalWorkouts} icon={Dumbbell} accent="var(--sport-500)"` (`:268`).
- `StatCard label="Racha" value={streak} unit="días" icon={Flame} accent="var(--ember-500)"` (`:269`).
- `StatCard` (`:63-91`): Card `rounded-card border border-border-subtle bg-surface-card p-4`; chip `h-9 w-9 rounded-[var(--radius-sm)]` con `background: color-mix(in oklab, {accent} 14%, transparent)`, `color: {accent}`, icono `h-[18px] w-[18px]`; valor `font-display text-2xl font-black text-text-strong`; unit `text-xs font-bold text-text-muted`; label `mt-1 text-[12.5px] font-semibold text-text-muted`.

### 2.3 CTA "Comparte tu logro" (`:273-290`)
- `<button>` `mb-4 flex w-full items-center gap-3.5 rounded-card p-4 text-left transition-transform active:scale-[0.99]`, `style background: var(--sport-100)`, `border: 1px solid var(--sport-200)` (`:276-277`).
- Icono chip `h-[42px] w-[42px] rounded-[var(--radius-md)] text-white`, `background: var(--sport-500)`, `boxShadow: var(--glow-sport)`, `<Share2 h-5 w-5>` (`:279-284`).
- Titulo `text-[14.5px] font-extrabold text-text-strong` = **"Comparte tu logro"** (`:286`).
- Subtitulo `text-[12.5px] text-text-muted` = **"Elige una tarjeta con la marca de tu coach"** (`:287`).
- Chevron `h-[18px] w-[18px]` color `var(--sport-600)` (`:289`).
- `onClick` → `setPickerOpen(true)` (`:275`).

### 2.4 Apariencia (`:293-299`)
- `SectionTitle`=**"Apariencia"** (`:293`).
- Card `overflow-hidden rounded-card border border-border-subtle bg-surface-card` con fila `min-h-[52px] px-3.5 py-2.5`: label `text-sm font-semibold text-body` = **"Tema"** + `<ThemeToggle/>` (`:294-298`).
- `ThemeToggle` (`ThemeToggle.tsx:8-55`): boton `w-10 h-10 rounded-xl bg-secondary border border-border`; alterna `light`↔`dark` (`:26`), aria-label `'Cambiar a modo claro'`/`'Cambiar a modo oscuro'` (`:28`); Sun `text-amber-400` en dark, Moon `text-slate-600` en light; `framer-motion` rotacion ±90° opacity fade 0.2s (`:32-51`); guard `mounted` → placeholder pulse (`:14-18`).

### 2.5 Preferencias (`:302-322`)
- `SectionTitle`=**"Preferencias"** (`:302`).
- Card + fila `min-h-[52px] gap-3 px-3.5 py-2.5`: label con `<Volume2 h-4 w-4 text-text-muted>` + `<span class="truncate">` **"Alarma de descanso"** (`:305-308`).
- `<Select value={restSound}>` trigger `h-10 w-[9.5rem] rounded-control`, aria-label `"Sonido de la alarma de descanso"` (`:309-321`).
- Opciones = `REST_SOUND_LABELS` (`:33-38`): `digital`→**"Digital (Beep)"**, `bell`→**"Campana"**, `classic`→**"Clásico"**, `boxing`→**"Boxeo"**.
- Estado inicial `'digital'` (`:204`); al montar lee `localStorage 'restTimerSound'` si valido (`:216-219`).
- `handleRestSoundChange` (`:221-226`): set estado, `localStorage.setItem('restTimerSound', next)`, y `playTimerSound(next, volumen guardado 'restTimerVolume' || 1.0)` como preview.

### 2.6 Modulos (`:325-366`) — condicional `hasModules = showMovement || showBodyComposition` (`:209`)
- `SectionTitle`=**"Módulos"** (`:327`).
- Fila Movimiento (`:329-345`): `Row` icono `PersonStanding`, `leadingClass="bg-[var(--sport-100)] text-[var(--sport-600)]"`, titulo **"Movimiento"**, subtitulo **"Screening · solo lectura"**, `href={base}/movimiento`, trailing pill `rounded-pill px-2 py-0.5 text-[11px] font-bold` bg `sport-100` color `sport-600` = **"Ver"**.
- Divisor `mx-3.5 h-px bg-border-subtle` solo si ambos (`:346`).
- Fila Composicion (`:347-363`): icono `Gauge`, `leadingClass="bg-[var(--success-100)] text-[var(--success-700)]"`, titulo **"Composición"**, subtitulo **"BIA / ISAK · solo lectura"**, `href={base}/bodycomp`, pill **"Ver"** con `success-100`/`success-700`.
- `Row` (`:94-147`): chip `h-9 w-9 rounded-[var(--radius-sm)]` (default `bg-surface-sunken text-[var(--ink-700)]`); titulo `truncate text-[14.5px] font-bold text-text-strong`; subtitulo `truncate text-[12.5px] text-text-muted`; chevron `text-[var(--ink-300)]`; contenedor `flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 hover:bg-surface-sunken`. `href` con `mailto:` → `<a>`, otro → `<Link>`, sin href → `<button onClick>` (`:127-146`).

### 2.7 Cuenta (`:369-376`)
- `SectionTitle`=**"Cuenta"**. Card con 3 filas + divisores:
  - `Row History` titulo **"Historial de entrenos"** `href={base}/workout-history` (`:371`).
  - `Row CircleHelp` titulo **"Ayuda"** `href="mailto:{SALES_EMAIL}?subject=Ayuda"` (`:373`). `SALES_EMAIL` importado de `@/lib/brand-assets`.
  - `Row LogOut` titulo **"Cerrar sesión"** `onClick=handleSignOut` (`:375`).
- `handleSignOut` (`:228-233`): `createClient().auth.signOut()` → `router.push(base+'/login')` → `router.refresh()`.

### 2.8 Zona de peligro (`:379-400`)
- Eyebrow `mx-1 mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em]` color `var(--danger-600)` = **"Zona de peligro"** (`:380`).
- `<a href="mailto:privacidad@eva-app.cl?subject=Solicitud%20de%20baja%20de%20cuenta">` `flex items-center gap-3.5 rounded-card bg-surface-card p-4 hover:bg-surface-sunken`, `border: 1.5px solid var(--danger-100)` (`:383-386`).
- Chip `h-10 w-10 rounded-[var(--radius-md)]` bg `danger-100` color `danger-600` `<Trash2 h-5 w-5>` (`:388-393`).
- Titulo `text-[14.5px] font-bold text-text-strong` = **"Solicitar baja de cuenta"** (`:395`).
- Subtitulo `text-[12.5px] text-text-muted` = **"Pide la eliminación de tus datos (derechos ARCO)"** (`:396`).

### 2.9 Footer (`:402`)
- `<p class="mt-6 text-center text-[10px] text-text-muted">` = **"v1.2.0 · Hecho con ❤️ para tu progreso"**.

### 2.10 SectionTitle web
- `import { SectionTitle } from '../../dashboard/_components/shared/SectionTitle'` (`ProfileClient.tsx:27`). Es el eyebrow DS (barra acento + uppercase 11px extrabold subtle). RN lo replica local en `perfil.tsx:102-114`.

---

## 3. Selector de plantilla (Sheet) — `ProfileClient.tsx:405-446`

- `<Sheet open={pickerOpen} onOpenChange={setPickerOpen}>`; `SheetContent side="bottom" className="max-h-[88dvh] sm:max-w-md"` (`:405-406`).
- Titulo con `<Share2 h-[18px] w-[18px] text-sport-500>` + **"Comparte tu logro"** (`:408-411`).
- Parrafo `mb-1 text-[12.5px] text-text-muted` = **"Cada tarjeta lleva la marca de tu coach. Elige cuál compartir:"** (`:414-416`).
- 3 `ShareTemplateOption` (`:417-443`):
  1. **Progreso** — icon `TrendingUp`, subtitulo **"Tus entrenos totales y tu racha"**; `accentBg var(--sport-100)`, iconBg `var(--sport-500)`, iconColor `#ffffff`; `onSelect pickShare('progress')` (`:417-425`).
  2. **Racha** — icon `Flame`, subtitulo `streak>0 ? "{streak} {día|días} seguidos activo" : "Enciende tu racha"` (`:429`); `accentBg var(--ember-100, color-mix...)`, iconBg `var(--ember-500)`, iconColor `#ffffff` (`:430-432`).
  3. **Resumen mensual** — icon `CalendarDays`, subtitulo `"{monthlyRecap.monthLabel} · sesiones y volumen"` (`:438`); `accentBg var(--surface-sunken)`, iconBg `var(--surface-card)`, iconColor `var(--sport-600)` (`:439-441`).
- `pickShare(t)` (`:211-214`): `setPickerOpen(false)` + `setActiveShare(t)`.
- `ShareTemplateOption` (`:150-187`): boton `flex w-full items-center gap-3.5 rounded-card p-3.5 text-left active:scale-[0.99]`, border `1px solid var(--border-subtle)`; chip `h-11 w-11 rounded-[var(--radius-md)]`; titulo `text-[14.5px] font-extrabold text-text-strong`; subtitulo `text-[12.5px] text-text-muted`; chevron `text-[var(--ink-300)]`.
- Render condicional del modal activo (`:448-472`): `activeShare==='progress'` → `<ProgressShareCardModal data={{fullName, totalWorkouts, streak, programName}}/>`; `'streak'` → `<StreakShareCardModal data={{fullName, streak, brandName, sessionsThisMonth: monthlyRecap.sessions}}/>`; `'monthly'` → `<MonthlySummaryShareCardModal data={{fullName, monthLabel, sessions, volumeKg, streak, brandName}}/>`. Todos `onClose={()=>setActiveShare(null)}`.

---

## 4. Modales de share-card (Progress / Streak / Monthly)

Los 3 modales son **estructuralmente identicos** (`ProgressShareCardModal.tsx`, `StreakShareCardModal.tsx`, `MonthlySummaryShareCardModal.tsx`); solo cambian `fileName`, funcion render, `shareMessage` y aria-label. Se describe el contrato comun con lineas de `ProgressShareCardModal.tsx` (identicas en los otros).

### 4.1 Ciclo de vida / generacion
- `useReducedMotion()` de framer-motion (`:26`).
- Al montar (`useEffect :33-53`): `readShareCardBrand()` → `renderXxxCardToBlob(data, brand)`. Si `!blob` → `toast.error('No pudimos generar la imagen. Intenta de nuevo.')` + `onClose()` (`:40-43`). Si ok → `blobRef.current = blob`, `URL.createObjectURL` → `setPreviewUrl`. Cleanup: `cancelled=true` + `revokeObjectURL` (`:48-52`).

### 4.2 Estados visuales
- **Cargando**: contenedor `aspect-[1080/1350] w-full overflow-hidden rounded-card border border-white/10 bg-[var(--ink-950,#0B0E13)] shadow-2xl` con `<Loader2 h-8 w-8 animate-spin text-white/50>` centrado (`:103-111`).
- **Listo**: `<img src={previewUrl} class="h-full w-full object-cover">` alt `"Vista previa de tu progreso"` / `"...tu racha"` / `"...tu resumen mensual"` (`:105`, Streak`:105`, Monthly`:105`).

### 4.3 Overlay
- `createPortal(..., document.body)` (`:88`).
- `div.fixed.inset-0.z-[10000].flex.flex-col.items-center.justify-center.bg-black/80.backdrop-blur-sm.px-4.pt-safe.pb-safe`, `role="dialog" aria-modal="true"`, aria-label `"Compartir tu progreso"` / `"...tu racha"` / `"...tu resumen mensual"`, `onClick={onClose}` (`:88-94`).
- `motion.div` `w-full max-w-sm flex-col gap-4`, initial (si no reducedMotion) `{opacity:0, scale:0.94, y:12}` → animate `{opacity:1, scale:1, y:0}`, transition `duration 0.28 ease [0.16,1,0.3,1]` (reducedMotion → `duration 0`); `onClick stopPropagation` (`:95-101`).

### 4.4 Botones de accion (`:114-141`)
- `canShare = typeof navigator.share === 'function'` (`:86`).
- **Primario** `h-12 w-full rounded-control font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-60`, `style backgroundColor: var(--theme-primary)`; `disabled={!previewUrl || busy}`; contenido `{busy ? <Loader2 spin> : <Share2>}` + texto `{canShare ? 'Compartir' : 'Guardar imagen'}` (`:114-123`).
- **Secundario "Guardar"** (solo si `canShare`) `h-11 w-full rounded-control border border-white/15 bg-white/[0.06] text-sm font-semibold text-white/90 hover:bg-white/[0.12]`, `<Download h-4 w-4>` + **"Guardar"**, `disabled={!previewUrl}`, `onClick=handleDownload` (`:124-133`).
- **Cerrar** `h-11 w-full rounded-control text-sm font-semibold text-white/60 hover:text-white/90`, `<X h-4 w-4>` + **"Cerrar"**, `onClick=onClose` (`:134-140`).

### 4.5 handleShare / handleDownload
- `handleShare` (`:54-70`): guard `!blob || busy`; `setBusy(true)`; crea `File([blob], fileName, {type:'image/png'})`; `text` = **"Mi progreso 💪"** (Progress `:61`) / **"Mi racha 🔥"** (Streak `:61`) / **"Mi resumen del mes 📅"** (Monthly `:60`); si `canShareFiles([file])` → `share({files, title, text})` (title = `"Mi progreso"`/`"Mi racha"`/`"Mi resumen del mes"`), else `handleDownload()`; finally `setBusy(false)`.
- `handleDownload` (`:72-84`): crea objectURL, `<a download={fileName}>` click, revoke, `toast.success('Imagen guardada')`.
- `fileName`: Progress `'mi-progreso.png'` (`:30`), Streak `'mi-racha.png'` (`:29`), Monthly `'mi-resumen-mensual.png'` (`:29`).

---

## 5. Motor canvas 1080×1350 — `workout-pr-card-canvas.ts`

Constantes (`:11-18`): `WIDTH 1080`, `HEIGHT 1350`, `INK_950 #0B0E13`, `INK_900 #12161D`, `SPORT_500 #2680FF`, `SUCCESS #34D399`, `EMBER_500 #FF6A3D`, `PAD_X 80`.

### 5.1 Marca white-label — `readShareCardBrand()` (`:130-168`)
- Lee del DOM del layout `/c` (los modales se portalean a `document.body`, los data-attrs/CSS-vars viven en la raiz, ya tier-gateados — `:125-129`).
- `brandName` = `[data-brand-name]` → `'EVA'` (`:141-142`).
- Logo cadena de fallback `resolveShareCardLogo(data-logo-dark, data-logo-url)` (`:114-123`, `:145-148`): dark → a sangre; claro → chip blanco backplate (`logoNeedsBackplate`); sin logo → inicial.
- `accent` = `--theme-primary` → `--sport-500` → `SPORT_500` (`:151`); `ember` = `--ember-500` → `EMBER_500` (`:152`).
- `displayFont`: probe con clase `.font-display` para resolver la familia hasheada por next/font (`:155-165`).

### 5.2 Base + glow — `drawCardBase` (`:447-459`)
- Gradiente lineal `INK_950→INK_900` 0,0→W,H (`:448-452`).
- Glow radial en `(W/2, 240)` radio 700, `rgba(glow, 0.3)→0` pintado en `0..960` (`:454-458`). Color glow = acento (progress/monthly) o ember (streak).

### 5.3 Header marca — `drawBrandHeader` (`:464-496`)
- Chip logo `76×76 r20` en `(PAD_X, 88)` (`drawLogoChip :187-216`), o inicial sobre acento (`800 42px display`, centrada) (`:473-483`).
- Nombre marca `rgba(255,255,255,0.88) 800 34px display letterSpacing 1px` en `(PAD_X+100, 140)` uppercase (`:486-491`).
- Badge motivo (icono vectorial) en `(W-PAD_X-42, 126)` size 84 (`:495`). Iconos vectoriales `drawVectorIcon` (`:226-357`): flame/trophy/calendar/barbell/barchart/progress (cero emoji → cero tofu).

### 5.4 Footer marca — `drawBrandFooter` (`:504-559`)
- Divisor `rgba(255,255,255,0.1)` de `(PAD_X,1250)` a `(W-PAD_X,1250)` (`:512-517`).
- Chip logo 52 r15 en `cy=1300`, o inicial (`:522-537`).
- Nombre marca `rgba(...,0.72) 800 30px letterSpacing 1px` ellipsize reservando 150px (`:542-548`).
- **"vía EVA"** derecha `rgba(...,0.4) 600 24px` (`:551-555`). (co-branding por tier; sin URL ni CTA — decision CEO 2026-07, `:498-503`).

### 5.5 Card Progreso — `renderProgressCardToBlob` (`:708-781`)
- icon `'progress'`, glow acento.
- Eyebrow **"MI PROGRESO"** acento `800 38px ls 6px` en `(PAD_X,470)` (`:725-728`).
- Titulo `Constancia con {brandName}` blanco `800 68px` hasta 2 lineas desde y556 step78 (`:731-735`).
- Subtitulo `firstName(fullName)` `rgba .5 600 34px` (`:738-740`).
- Hero `totalWorkouts` acento `800 230px ls -4px` baseline 900 + unit `entreno|entrenos` `rgba .5 800 60px` (`:743-753`).
- Pill racha: `streak>0 ? "Racha · N día|días" (SUCCESS) : "Recién empezando"` en y950 (`:756-761`).
- Fecha `todayLong()` en y1094 (`:764-767`). Pill programa si `programName` en y1134 (`:770-776`).

### 5.6 Card Racha — `renderStreakCardToBlob` (`:787-864`)
- icon `'flame'`, glow ember; `iconColor ember`.
- Eyebrow **"RACHA"** ember en y470 (`:807-811`).
- Titulo `streak>0 ? "Racha encendida" : "Enciende tu racha"` (`:816`).
- Subtitulo `firstName` (`:823`).
- Hero `streak` ember `800 230px` baseline 890 + unit `día|días` (`:826-836`).
- Pill `streak>0 ? "seguidos activo" (ember) : "Empieza hoy tu racha"` en y940 (`:839-843`).
- Pill contexto si `sessionsThisMonth>0`: `"N entreno|entrenos este mes"` en y1012 (`:846-853`).
- Fecha en y1116/1064 segun haya pill mes (`:859`).

### 5.7 Card Mensual — `renderMonthlySummaryCardToBlob` (`:870-943`)
- icon `'calendar'`, glow acento.
- Eyebrow `monthLabel.toUpperCase()` acento `800 38px ls 5px` ellipsized en y456 (`:894-897`).
- Subtitulo `Resumen de {firstName}` `rgba .6 700 40px` en y520 (`:901-903`).
- Hero `sessions` blanco `800 210px ls -4px` baseline 718 + unit `entreno|entrenos` acento `800 58px` (`:906-916`).
- **Grid 3 tiles** (`:918-932`, `drawStatTile :566-608`): tileW = `(W-160-52)/3`, tileH 244, tileY 796: `{barbell, fmtVolume(volumeKg), "Volumen", acento}`, `{barchart, avg=vol/sessions o "—", "Prom/sesión", acento}`, `{flame, streak, "Día de racha"|"Racha", ember}`. Tiles: fondo `rgba(...,0.05)` border `0.08` r26, icono vectorial + valor auto-fit + label `rgba(...,0.62) 600 23px`.
- Fecha en y1118 (`:934-938`).
- `fmtVolume` (`:94-101`): ≥1000 → toneladas 1 decimal coma es-CL (`"45,2 t"`), else `"N kg"`.

---

## 6. RN — motor share `ShareCard.tsx` (POSEO ESTA UNIDAD)

RN no tiene `<canvas>`: arma la card con Views/Text (DS) y rasteriza el nodo a PNG con `captureRef` (react-native-view-shot), luego share nativo (`ShareCard.tsx:35-74` docblock). Canvas **always-dark en ambos temas** (1:1 con web — `:49-57`); literales dark fijos (`INK_950/INK_900 + white alphas`, `:76-87`); lo que sigue la marca es el ACENTO (`useTheme().theme.primary` + `branding` displayName/logoUrl, `:365-375`).

- **Building blocks** (composables): `ShareCardEyebrow` (toneColor/prop, `:146-153`), `ShareCardTitle` (h2 blanco 2 lineas, `:156-162`), `ShareCardSubtitle` (`:165-171`), `ShareCardHero` (value 88px + unit, `:174-184`), `ShareCardPill` (tone neutral/success/accent, `:187-203`), `ShareCardDate` (`:206-208`).
- **Registro de variantes** `SHARE_CARD_VARIANTS` (`:110-116`): `default/record/progress/streak/monthly` con icon+eyebrow+tone. `progress`=TrendingUp/'MI PROGRESO'/brand, `streak`=Flame/'RACHA'/ember, `monthly`=CalendarDays/'RESUMEN DEL MES'/brand. `record`=Trophy/brand **registrado sin consumidor** (`:112` — es el P0 coach, §11).
- **ShareCardCanvas** (`:264-329`): marco `w×aspect(1080/1350) r20 border W10 INK_950`; 2 gradientes (base + glow top `withAlpha(toneColor,0.32→0)`, aprox del radial web, `:283-297`); header (LogoChip 54 r15 + nombre uppercase + MotifIcon 40 toneColor, `:301-308`); body children; footer (divisor W10 + LogoChip 36 + nombre + **"vía EVA"** W40, `:314-323`).
- **LogoChip** (`:213-248`): con logoUrl → backplate blanco padding 0.14 (espejo `needsBackplate` web); sin logo → inicial sobre acento.
- **ShareCardPreview** (`:355-511`): Modal fade transparent; backdrop = `BlurView intensity 24 tint dark` + velo `rgba(0,0,0,0.7)` (espejo web `bg-black/80 backdrop-blur-sm`, `:459-464`); tap fuera cierra; card column `cardWidth = min(340, winW-48)` gap16 (`:375`, `:466`).
  - `handleShare` (`:377-451`): `captureRef` a **1080×1350 FIJO** (`:387` — fix del P2 resolucion Ola0); Haptics light (`:394`); renombra tmpfile a `${fileName}.png` best-effort (`:401-413` — fix del P2 fileName Ola0); iOS `Share.share({url,message})` (imagen+texto), Android `Sharing.shareAsync` PNG; distingue `dismissedAction`=cancelacion→silencio (`:431`); catch captura → `toast.error('No pudimos generar la imagen. Intenta de nuevo.')` (`:391`); catch share → `toast.error('No pudimos compartir la imagen. Intenta de nuevo.')` (`:447`).
  - **Botones (2, no 3)**: **"Compartir"** (accent bg, spinner reemplaza solo el icono, label queda, `:489-502`) + **"Cerrar"** (`:503-506`). Divergencia idiomatica documentada (`:481-488`): web tiene 3er boton "Guardar" (Download) porque el share sheet nativo RN ya incluye "Guardar imagen".

---

## 7. RN — pantalla `perfil.tsx` (POSEO)

Estructura (`:349-701`): `View bg-surface-app` + `<AppBackground/>` + `SafeAreaView`; loading → `<EvaLoaderScreen subtitle="Cargando perfil…">` (`:353-354`), else ScrollView `px20 pb40`.
- Titulo **"Mi perfil"** `font-display-black text-strong 22px ls -0.44` (`:358-360`).
- **Hero** (MotiView fade+translateY 16→0 450ms, `:364-388`): `Card variant="inverse" padding="lg"` con `<Avatar name size="xl" ring="sport">` + fullName `font-display-black text-on-dark 22px` + **email** (`text-on-dark-muted 13px`, si existe) + `Coach: {branding.displayName}` (si branding). **DIVERGENCIA**: RN muestra email; web no. RN usa `branding.displayName`; web usa `brandName` server. RN NO muestra pill programa.
- **Stats** grid 2-col (`:391-398`): `StatCard "Entrenos" totalWorkouts Dumbbell accent="sport"` + `StatCard "Racha" streak unit="días" Flame accent="ember"`.
- **CTA "Comparte tu logro"** (`:401-423`): identico copy web ("Comparte tu logro" / "Elige una tarjeta con la marca de tu coach"), bg `sport-100` border `sport-200`, chip `sport-500` SHADOWS.sm, chevron `sport-600`; `onPress setPickerOpen(true)`.
- **Apariencia** (`:426-429`): `AppearanceToggle` (`:163-200`) = **segmented Claro/Oscuro** (tablist, 2 Pressables, activo bg-surface-card+SHADOWS). DIVERGENCIA idiomatica vs web `ThemeToggle` (icon-button unico) — preserva la funcion (cambiar tema). Wired a `useTheme().toggleTheme`.
- **Seguridad** (solo si `bioAvailable`, `:432-445`): fila `Fingerprint` **"Bloqueo con Face ID / huella"** + `<Switch value={bioEnabled} onValueChange={toggleBio}>`. **RN-only (no existe en web)** — biometrico (`:29`, `:323-336`). NO eliminar (regla 2).
- **Preferencias** (`:448-451`): `<RestAlarmPreference/>` (componente propio RN, `:50`). DIVERGENCIA: web expone selector de TIPO de sonido (Select 4 sonidos + preview `playTimerSound`); RN delega a `RestAlarmPreference` (unidad aparte — NO tocar aqui).
- **Seguimiento** (condicional `showMovement || showBodyComp`, `:455-482`): `SectionTitle "Seguimiento"` (web dice **"Módulos"**); filas `ListRow` a `/alumno/movement` (**"Movimiento"** / "Tu evaluación y evolución") y `/alumno/bodycomp` (**"Composición corporal"** / "Tus mediciones en el tiempo"). DIVERGENCIAS: titulo seccion, subtitulos, y **falta la pill "Ver"** trailing; gating por `useEntitlements().hasModule` (`:246-248`) vs props server web.
- **Información** (`:485-513`): `SectionTitle "Información"` — **seccion RN-only** (no en web): telefono / peso objetivo / miembro desde (`InfoLine :145-159`), o **"Sin datos adicionales"** si `!hasExtras`.
- **Cuenta** (`:516-551`): `History` **"Historial de entrenos"** → `/alumno/history`; `KeyRound` **"Cambiar contraseña"** → `setShowPasswordModal(true)` (**RN-only**); `CircleHelp` **"Ayuda"** → `mailto:{SALES_EMAIL}?subject=Ayuda` (`SALES_EMAIL='contacto@eva-app.cl'` `:54`); `LogOut` **"Cerrar sesión"** → `handleLogout`. `handleLogout` (`:315-321`): `signOutAndCleanup()` + `AsyncStorage.removeItem('eva_user_role')` + `clearBranding()` + `setBranding(null)` + `router.replace('/')`.
- **Zona de peligro** (`:554-581`): copy identico web ("Zona de peligro" / "Solicitar baja de cuenta" / "Pide la eliminación de tus datos (derechos ARCO)"), mailto `privacidad@eva-app.cl`. 1:1.
- **Footer** (`:583-591`): si `coachTier==='free'` → **"Potenciado por EVA"** (RN-only extra); luego **"v1.2.0 · Hecho con ❤️ para tu progreso"**.
- **Sheet selector** (`:597-634`): copy titulo/descripcion identico web; 3 `ShareOption`: Progreso ("Tus entrenos totales y tu racha"), Racha (`streakSubtitle` = `"N día|días seguidos activo"` / "Enciende tu racha", `:345-347`), Resumen mensual (subtitulo dinamico `"{monthLabel}: {sessions} sesión|sesiones · {vol}"` o "Tu mes en números", `:624-628`). DIVERGENCIA subtitulo mensual vs web (`"{monthLabel} · sesiones y volumen"`).
- **Cambiar contraseña** Dialog (`:679-699`, RN-only): Input `secureTextEntry` "Nueva contraseña (mín. 8 caracteres)", botones Cancelar/Guardar. `handleChangePassword` (`:298-313`): valida `>=8` (Alert "Contraseña muy corta"), `supabase.auth.updateUser({password})`, éxito Alert "Listo".

### 7.1 Cards RN inline (`:636-677`) — DIVERGENCIAS de contenido vs web canvas
`perfil.tsx` renderiza 3 `ShareCardPreview` inline:
- **progress** (`:637-648`): eyebrow "MI PROGRESO", title=`firstName`, hero=`totalWorkouts`/"entrenos", pill `"N días de racha"`. Web (§5.5) usa title "Constancia con {coach}" + subtitulo firstName + pill "Racha · N días" + fecha + pill programa. **RN simplificado.**
- **streak** (`:650-661`): eyebrow "RACHA", title=`firstName`, hero=`streak`/"día|días", pill `"N entrenos totales"`. Web (§5.6) title "Racha encendida", subtitulo firstName, pill "seguidos activo" + pill mes + fecha. **RN divergente.**
- **monthly** (`:663-677`): eyebrow "RESUMEN DEL MES", title=`monthLabel`, hero=`sessions`/"sesión|sesiones", pill `"{vol} levantados"`. Web (§5.7) subtitulo "Resumen de {firstName}" + hero sessions "entrenos" + grid 3 tiles. **RN divergente** (single pill, sin grid).
- **shareMessage RN**: progress "Mi progreso en EVA 💪", streak "Mi racha en EVA 🔥", monthly "Mi mes en EVA 📅". **DIVERGENCIA copy** vs web ("Mi progreso 💪" / "Mi racha 🔥" / "Mi resumen del mes 📅"). Regla 6 (copy verbatim) → alinear a web.
- `fileName` RN: "eva-progreso"/"eva-racha"/"eva-mes" (web: "mi-progreso"/"mi-racha"/"mi-resumen-mensual").

---

## 8. RN — query mensual `monthly-summary.ts`
Espejo fiel de la web (`:1-11` docblock): mismos RPC `get_client_workout_day_counts`(31) + `get_client_daily_tonnage`(31), `reduceMonthlyRecap` puro (`:66-79`), `getSantiagoMonthPrefix` (`:39-48`), `formatSantiagoMonthLabel` capitalizado (`:51-58`), `fmtVolume` coma es-CL (`:85-92`). `getMonthlyRecap` **fail-open**: catch → `{sessions:0, volumeKg:0, monthLabel}` (`:99-114`). Paridad OK con `monthly-recap.queries.ts` (§1). En `perfil.tsx:279` se llama fail-open en el `Promise.all` del `load()`.

---

## 9. Estado RN actual — divergencias mas obvias (con citas)

1. **`components/alumno/MonthlySummaryShareCard.tsx` esta HUERFANO.** `perfil.tsx` (imports `:40-47`) NO lo importa; inlinea su propia card monthly (`:663-677`). El componente huerfano usa subtitulo "Resumen de {firstName}" + 2 pills (volumen "de volumen" + racha) (`MonthlySummaryShareCard.tsx:65-69`), mas cercano al web que la version inline del perfil. NO eliminar (regla 2); decidir en implementacion si se consolida.
2. **Copy shareMessage divergente** (RN añade "en EVA") — §7.1. Regla 6.
3. **Contenido de las 3 cards divergente** (RN simplifica vs canvas web; sobre todo monthly sin grid de 3 tiles) — §5 vs §7.1.
4. **Hero muestra email** (RN `:376-380`) — web no; RN usa `branding.displayName` vs web `brandName` server (team-aware).
5. **Seccion "Módulos" web → "Seguimiento" RN**, subtitulos distintos y **sin pill "Ver"** — §7 Seguimiento.
6. **Web NO tiene**: seccion "Información", "Seguridad" biometrica, "Cambiar contraseña", "Potenciado por EVA". Son RN-only (`:432-513`, `:583-587`). NO eliminar.
7. **Apariencia**: web icon-toggle vs RN segmented — idiomatico documentado.
8. **Preferencias**: web Select de sonido de alarma (Digital/Campana/Clásico/Boxeo + preview) vs RN `RestAlarmPreference` (otra unidad) — §7.
9. **Web tiene link "Historial" → `{base}/workout-history`**; RN → `/alumno/history`. Base-path idiomatico.

---

## 10. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Bloque de discrepancias del motor share (`:2400-2438`). Contexto (`notes :2438`): el web `SharePRButton` es el **trigger del flujo COACH** (endpoint `/api/pr-card`, share directo sin preview); `ShareCard.tsx` es el **motor RN** que espeja los 4 modales ALUMNO de web (PRShareCardModal/Streak/Progress/MonthlySummary) — **verificados existentes**. Estado de cada hallazgo respecto al codigo ACTUAL:

- **P0 (`:2406`) — flujo coach "compartir récord de alumno" AUSENTE en mobile.** Datos existen (`coach-client-detail.ts:582/892`) pero ningun `.tsx` los renderiza; `ShareCard` solo se usa en superficies ALUMNO (`perfil.tsx:637-677`, `WorkoutSummaryOverlay.tsx:439-468`, `MonthlySummaryShareCard.tsx:58-70`). **FUERA DE ESTA UNIDAD** (es unidad coach). Se documenta: el variant `record` ya esta registrado sin consumidor (`ShareCard.tsx:112`); su conducta web a replicar = lista de PRs + icon-button Share2 por fila que abre preview con eyebrow "RÉCORD PERSONAL" + ejercicio + nombre alumno + peso. No lo resuelve esta spec.
- **P1 (`:2413`) — feedback de error silencioso.** El estado descrito (`ShareCard.tsx:378-379 catch silent`) YA ESTA CORREGIDO en el codigo actual: `handleShare` distingue cancelacion de fallo y muestra `toast.error('No pudimos generar la imagen. Intenta de nuevo.')` (captura, `:391`) y `'No pudimos compartir la imagen. Intenta de nuevo.'` (share, `:447`). **RESUELTO.** Copy web de referencia (`SharePRButton.tsx:81-82`): "No pudimos generar la imagen. Intenta de nuevo."
- **P2 (`:2420`) — label busy "Generando…".** Aplica al `SharePRButton` COACH web. En los modales ALUMNO web (mi unidad) el label NO cambia a "Generando…": el boton mantiene "Compartir"/"Guardar imagen" y solo swap del icono a Loader2 (`ProgressShareCardModal.tsx:121-123`). RN espeja esto: spinner reemplaza el icono, label "Compartir" queda (`ShareCard.tsx:496-501`). **Paridad con mi unidad OK** (no aplicar "Generando…").
- **P2 (`:2427`) — fileName prop muerta.** YA CORREGIDO: `ShareCard.tsx:401-413` renombra el tmpfile a `${fileName}.png` (best-effort). **RESUELTO.**
- **P2 (`:2434`) — resolucion PNG dependiente del device.** YA CORREGIDO: `captureRef(..., { width:1080, height:1350 })` fijo (`ShareCard.tsx:387`). **RESUELTO.**

No reportados como discrepancia (idiomatico, `notes :2438`): preview-antes-de-compartir (patron DS mobile), Pressable/haptics/expo-sharing vs Web Share API, ausencia de boton "descarga" separado (el share sheet nativo trae "Guardar imagen"), `theme.primary` vs `var(--cta-fill)` (gobernado por token-contract).

---

## 11. P0 QA de esta unidad

Esta unidad (**perfil alumno + share cards**) NO tiene P0 asignado. El unico P0 del bloque share (`ola0-hallazgos.json:2406`) es el **flujo COACH** (`SharePRButton` en `ClientProfileDashboard`), otra seccion. Los modales share ALUMNO de esta unidad estan mirroreados y los hallazgos P1/P2 de su motor ya estan resueltos (§10). Trabajo pendiente de ESTA unidad = alinear contenido/copy de las 3 cards RN al canvas web (§7.1, §9) y decidir la consolidacion de `MonthlySummaryShareCard.tsx` huerfano (§9.1), sin borrar features RN-only (biometrico, cambiar contraseña, Información, Potenciado por EVA).

---

## 12. cambiosShell (archivos compartidos que NO debo tocar)

- **`components/ShareCard.tsx`**: es DS-ish pero el inventario lo marca como consumido primariamente por `perfil.tsx` → **lo poseo en esta unidad**. Verificado: otros consumidores son `WorkoutSummaryOverlay.tsx:439-468` (unidad ejecutor) y `MonthlySummaryShareCard.tsx` (huerfano). Si un cambio al motor afecta al ejecutor, coordinar — pero las building blocks son estables.
- **`RestAlarmPreference` (`components/alumno/RestAlarmPreference.tsx`)**: unidad de Preferencias/ejecutor — NO tocar; reportar si requiere cambio.
- **`SectionTitle` / `Card` / `ListRow` / `StatCard` / `Switch` / `Sheet` / `Dialog` / `Avatar` / `Button` / `Input` / `AppBackground` / `EvaLoader`**: primitivos DS — NO tocar; reportar via cambiosShell si algun ajuste es imprescindible.
- **`lib/monthly-summary.ts`**: compartible con el ejecutor; ya en paridad con web — no requiere cambios.
