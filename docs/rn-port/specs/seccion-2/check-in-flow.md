# Spec: Flujo de Check-in (3 pasos) — `check-in-flow`

Seccion 2 · Dashboard del alumno. **Web = fuente de verdad.**

Fuentes de verdad (web):
- `apps/web/src/app/c/[coach_slug]/check-in/CheckInForm.tsx` (720 lineas) — UI + logica cliente
- `apps/web/src/app/c/[coach_slug]/check-in/page.tsx` (34 lineas) — gate + data fetch
- `apps/web/src/app/c/[coach_slug]/check-in/loading.tsx` (6 lineas) — skeleton
- `apps/web/src/app/c/[coach_slug]/check-in/_actions/check-in.actions.ts` (221 lineas) — server actions
- `apps/web/src/app/c/[coach_slug]/check-in/_data/check-in.queries.ts` (53 lineas) — queries

Contraparte RN: `apps/mobile/app/alumno/(tabs)/check-in.tsx` (697 lineas).
Primitivos RN citados: `apps/mobile/components/Slider.tsx`, `apps/mobile/components/Textarea.tsx`.

---

## 0. Gate de acceso, datos y P0 asignado

### P0 ASIGNADO A ESTA UNIDAD (jul-2026): "me dice que no he hecho check-in pero no me deja ingresar al hacerle click"

Conducta web exacta que lo resuelve (la spec RN DEBE preservarla):

- **Gate por `isClient`, NUNCA por color** — `page.tsx:16-20`: `const { user, isClient, coachPrimaryColor, lastCheckIn } = await getCheckInPageData()`; `if (!user) redirect(login)`; `if (!isClient) redirect(dashboard)`. El comentario `page.tsx:18-19` lo dice literal: "el alumno con coach_id NULL (team/pool/enterprise) tiene color fallback pero es un alumno valido y debe poder ingresar".
- **Resolver al alumno SOLO por id con LEFT join** — `check-in.queries.ts:22-26`: `.from('clients').select('id, coaches ( primary_color )').eq('id', user.id).maybeSingle()`. El comentario `check-in.queries.ts:16-21` documenta que el criterio viejo (`coaches!inner` + `.eq('coaches.slug', coachSlug)`) devolvia null para alumnos con `coach_id` NULL → los rebotaba al dashboard aunque el banner "check-in pendiente" si los invitaba: **esa divergencia ERA el bug P0**.
- **Color de marca fallback** — `check-in.queries.ts:6` `FALLBACK_PRIMARY_COLOR = '#8B5CF6'` (violeta); `check-in.queries.ts:49` `coachPrimaryColor: coachInfo?.primary_color ?? FALLBACK_PRIMARY_COLOR` (NUNCA null).

**Estado RN:** el check-in es un tab (`app/alumno/(tabs)/check-in.tsx`), sin gate de redirect propio — el acceso lo gobierna el layout de tabs del alumno, y `loadLastCheckIn` (`check-in.tsx:78-98`) resuelve por `getClientProfile()` (id del alumno), no por slug. Paridad funcional con el fix P0 siempre que el alumno con `coach_id` NULL tenga fila en `clients` y `getClientProfile` resuelva por id. **No introducir gate por color ni por slug.**

### Query "ultimo check-in"
- Web `check-in.queries.ts:36-42`: `.from('check_ins').select('weight, energy_level, created_at').eq('client_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()`.
- RN `check-in.tsx:81-87`: `.from('check_ins').select('weight, energy_level, date').eq('client_id', client.id).order('date', {ascending:false}).limit(1).maybeSingle()`.
- **DIVERGENCIA de columna:** web ordena/lee por `created_at`; RN por `date`. (Ver §8.)

### `cache()`
- Web envuelve `getCheckInPageData` en `cache()` de React (`check-in.queries.ts:8`) y usa `getClaims()` (verificacion local JWT ES256, sin `/user`) `check-in.queries.ts:11-12`. Sin equivalente RN (no aplica en Expo).

---

## 1. Layout y jerarquia (web)

Contenedor de pagina `page.tsx:22-32`: `<div className="min-h-dvh bg-surface-app pb-24 pt-safe"><div className="mx-auto max-w-lg"><CheckInForm .../></div></div>`.

Formulario `CheckInForm.tsx:359-360`: raiz `<div className="px-5 pb-6">`. Orden vertical:
1. **TopBar** `:362-378` — `flex items-center gap-3 px-0 pb-2.5 pt-1.5`: boton Atras (Link) + columna con eyebrow "Paso X de 3" + titulo "Check-in mensual".
2. **Stepper** `:381-393` — `mb-4 flex gap-1.5`, tres barras.
3. **Disclaimer medico** `:396-401` — banda warning.
4. **AnimatePresence** con el paso activo `:403-716` (step 1 / 2 / 3, mutuamente excluyentes, `mode="wait"`).

Pantalla de exito (reemplaza TODO el form) `:321-357` cuando `state.success`.

RN mapea el mismo orden: TopBar `check-in.tsx:313-320`, Stepper `:323-333`, Disclaimer `:336-341`, ScrollView con `StepOne`/`StepTwo`/`StepThree` `:343-392`, pantalla `done` `:269-306`. RN envuelve en `SafeAreaView` + `AppBackground` + `KeyboardAvoidingView` (`:308-311`) — adaptacion RN (§10).

---

## 2. TopBar (barra superior)

Web `:362-378`:
- Boton Atras `:363-369`: `<Link href={base+/dashboard} aria-label="Atras" className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-strong">` con `<ChevronLeft className="h-5 w-5" />`.
- Eyebrow `:371-373`: `text-xs font-bold uppercase tracking-[0.08em] text-muted` → `Paso {currentStep} de 3`.
- Titulo `:374-376`: `font-display text-[26px] font-black leading-tight tracking-tight text-strong` → `Check-in mensual`.

**Estado RN** `check-in.tsx:313-320`: NO tiene boton Atras en la TopBar (el back del check-in en RN es la nav de tabs). Eyebrow `TYPE.eyebrow` + `text-muted` "Paso {step} de 3"; titulo `fontSize:26` `FONT.displayBlack` "Check-in mensual". **DIVERGENCIA:** falta el boton ChevronLeft → dashboard (`:363-369`). RN usa `styles.topBar` gap 2 (`:666`).

---

## 3. Stepper (3 barras)

Web `:381-393`: contenedor `mb-4 flex gap-1.5`. Cada barra es `motion.div` `:383-391`:
- `animate={{ flex: n === currentStep ? 1.6 : 1, backgroundColor: n <= currentStep ? coachPrimaryColor : 'var(--ink-200)' }}`
- `className="h-1.5 rounded-full"` (6px alto)
- `transition={reducedMotion ? { duration: 0 } : springs.snappy}`

Barra activa mas ancha (flex 1.6); barras completadas usan **`coachPrimaryColor` crudo**; pendientes `--ink-200`.

**Estado RN** `check-in.tsx:323-333`: `MotiView` con `animate={{ flex: s === step ? 1.6 : 1 }}` + spring (damping 18, stiffness 200). Color via className: `s <= step ? 'bg-sport-500' : 'bg-surface-sunken'` (`:329`). `styles.stepSeg` height 6, borderRadius 999 (`:668`).
- **DIVERGENCIA (P2, misma familia que el slider):** web colorea con `coachPrimaryColor` **crudo**; RN usa `bg-sport-500` (accent del theme, clamp-por-contraste). Ver hallazgos §7 (slider). El color pendiente tambien difiere: web `--ink-200` vs RN `bg-surface-sunken`.

---

## 4. Disclaimer medico

Web `:396-401`: `mb-4 flex items-center gap-2 rounded-control border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2.5 text-[var(--warning-600)]`. Icono `<ShieldAlert className="h-[15px] w-[15px] shrink-0" />`. Texto `text-[11.5px] leading-snug`:
> **"EVA no es un dispositivo medico ni sustituye consejo profesional."** (verbatim)

**Estado RN** `check-in.tsx:336-341`: `className="border border-warning-500 bg-warning-100"` + `styles.disclaimer` (borderRadius 14 = `rounded-control`). Icono `ShieldAlert size={15}` con **color hex hardcodeado por esquema** `resolvedScheme === 'dark' ? '#FFC861' : '#A8690A'` (`:337`) — el shim de lucide no toma className de color (nota RN documentada). Texto `text-warning-600` `textStyle('3xs', FONT.uiMedium)`. Copy identico.

---

## 5. Paso 1 — Peso + Energia

Web step 1 `:404-505` (`motion.div` key="step1", variants slide, `:405-412`).

### 5a. Card "ultimo/primer check-in"
Web `:414-440`:
- Con `lastCheckIn` `:415-427`: `<Card padding="md" variant="sunken" className="mb-3.5 flex-row items-center gap-3">`. Chip circular `:416-418`: `h-[38px] w-[38px] rounded-full bg-surface-card text-sport-600` con `<History className="h-[18px] w-[18px]" />`. Label `:420` `text-[11.5px] font-bold text-muted` → "Tu ultimo check-in". Valor `:421-425` `text-[13.5px] font-semibold text-strong`: `${weight} kg` o `—`, ` · Energia {energy_level ?? '—'}/10 · `, `formatRelativeDate(created_at.slice(0,10))`.
- Sin `lastCheckIn` `:428-439`: label "Tu primer check-in"; valor "Registra peso y energia para empezar."

RN `StepOne` `:413-435`: mismo Card sunken (`styles.lastCard` flex-row gap 12), chip `styles.lastChip` 38x38 con `History size={18} color={theme.primary}` (`:415`). **DIVERGENCIA menor:** web usa `text-sport-600` para el icono History; RN usa `theme.primary`. Texto identico; `formatRelativeDate(lastCheckIn.date.slice(0,10), todayIso)` (`:423`) — RN pasa `todayIso` (`getTodayInSantiago`) como 2do arg; web lo llama sin 2do arg (`:424`). Copy verbatim en ambos.

### 5b. Card "Peso actual" (stepper +/- 0.1)
Web `:443-471`: `<Card padding="lg" className="mb-3.5 gap-3">`. Label `:444` `text-[13px] font-semibold text-strong` "Peso actual". Fila `:445` `flex items-center justify-center gap-4`:
- Boton menos `:446-454`: `type=button aria-label="Menos" onClick={() => adjustWeight(-0.1)}`, `h-12 w-12 rounded-full border-[1.5px] border-default bg-surface-card`, `style={{ color: 'var(--ink-700)' }}`, `<Minus className="h-5 w-5" />`.
- Valor `:455-460`: `flex items-baseline gap-1`; numero `font-display text-5xl font-black tabular-nums tracking-[-0.03em] text-strong` = `{weight}`; sufijo `text-lg font-semibold text-muted` "kg".
- Boton mas `:461-469`: `aria-label="Mas" onClick={() => adjustWeight(0.1)}`, mismas clases, `<Plus className="h-5 w-5" />`.

Handler `adjustWeight` `:147-148`: `setWeight((w) => Math.max(0, (parseFloat(w)||0)+delta).toFixed(1))`.
Estado inicial `weight` `:68-70`: `lastCheckIn?.weight != null ? lastCheckIn.weight.toFixed(1) : '70.0'`.

RN `StepOne` `:437-466`: Card padding lg gap 14. `Pressable` menos/mas (`:441-450`, `:455-464`) con `className="bg-surface-card border-[1.5px] border-default"` `styles.stepBtn` 48x48 radius 999, `Minus/Plus size={20} color={theme.foreground}` (web usa `var(--ink-700)`; RN `theme.foreground` — divergencia menor de token de icono). `accessibilityRole="button"` + `accessibilityLabel` "Menos"/"Mas" (paridad a11y). testID `weight-minus`/`weight-plus`. Valor `TYPE.display` + `fontVariant:['tabular-nums']` (`:452`) + sufijo "kg" `textStyle('lg', FONT.uiSemibold)`. `adjustWeight` `:253-255` identico a web. Default `'70.0'` (`check-in.tsx:54`), prefill una vez `:91-96`.
- **DIVERGENCIA (P2):** web card gap-3 (12px) vs RN gap 14 — hallazgos "Card Peso: gap 14 vs 12" (aplica tambien a Peso). Fix: gap 12.

### 5c. Card "Nivel de energia" (slider 1-10)
Web `:474-492`: `<Card padding="lg" className="mb-4 gap-3">`. Head `:475-481` `flex items-center justify-between`: label `text-[13px] font-semibold text-strong` "Nivel de energia"; valor `font-display text-base font-black tabular-nums tracking-[-0.03em] text-sport-600` = `{energyLevel}` + `<span className="text-xs font-semibold text-muted">/10</span>`. Slider `:482-491`: `<input id="energy_level" type="range" min={1} max={10} value={energyLevel} onChange={(e)=>setEnergyLevel(Number(e.target.value))} className="w-full" style={{ accentColor: coachPrimaryColor }} />`.
Estado inicial `energyLevel` `:71`: `lastCheckIn?.energy_level ?? 7`.

RN `StepOne` `:469-486`: Card padding lg gap 14; head `styles.energyHead` (space-between); label `textStyle('xs', FONT.uiSemibold)` "Nivel de energia"; valor `text-sport-600` `textStyle('md', FONT.displayBold, {ls:'tighter'})` = `{energyLevel ?? '—'}` + `/10` `textStyle('2xs', FONT.uiSemibold) text-muted`. Slider primitivo `:478-485`: `<Slider value={energyLevel ?? 7} onValueChange={setEnergyLevel} min={1} max={10} step={1} testID="energy-slider" />`. Default `7` (`:55`).

Hallazgos P2 sobre este numeral y slider (§7): **font-black(900) vs displayBold(800)**, **falta tabular-nums**, **accent theme.primary vs crudo**, **gap 14 vs 12**.

El primitivo `Slider.tsx` es el port del `<input type=range>`: track 6px + fill `theme.primary` (`Slider.tsx:166`) + thumb 28px blanco borde `theme.primary` (`:171`); Pan + tap-to-set (`:106-121`); `haptics.select()` por step (`:88`); a11y `role="adjustable"` + increment/decrement (`:153-162`). Head opcional `label`/`renderValue` con `marginBottom:12` (`:183`) — en check-in el head se renderiza fuera del Slider, por eso hereda el gap 14 de la Card (hallazgos §7 "gap 14 vs 12").

### 5d. Boton "Continuar"
Web `:494-503`: `<Button type=button variant="sport" size="lg" onClick={goNext} disabled={!weight} className="w-full">Continuar <ArrowRight className="h-4 w-4" /></Button>`.
RN `:488-497`: `<Button label="Continuar" rightIcon={ArrowRight} variant="sport" size="lg" full onPress={onNext} disabled={!weight} testID="checkin-continue" />`. Paridad.
`goNext` web `:138-141` avanza step (max 3, `direction=1`); RN `goNext` `:257-261` (step1→2, step2→3, step3→submit()).

---

## 6. Paso 2 — Fotos (front / back)

Web step 2 `:507-639` (`motion.div` key="step2").

### 6a. Copy intro + inputs ocultos
- Parrafo `:516-518` `mb-3.5 text-[13.5px] leading-relaxed text-muted`: **"Las fotos son opcionales pero ayudan a tu coach a ver tu evolucion."** (verbatim)
- Dos `<input type="file" accept="image/*" className="sr-only">` `:520-537`, refs `frontInputRef`/`backInputRef` (`:118-119`), `onChange` → `validateAndSetFile(...)`.

RN `StepTwo` `:516-520`: mismo parrafo (`TYPE.body` fontSize 13.5 lineHeight 20). Sin inputs ocultos — RN usa action sheet (§6d).

### 6b. Los dos slots de foto
Web front `:539-580`, back `:582-622` (identicos salvo label). Contenedor `flex items-start gap-2.5` (`:539`). Cada slot `min-w-0 flex-1`:
- **Con preview** `:542-561` / `:584-603`: `relative aspect-[3/4] w-full overflow-hidden rounded-control border-2 border-sport-500 bg-[var(--ink-950)]`; `<Image fill sizes=... className="object-cover" />`.
  - Badge "Optimizando..." `:545-549` / `:587-591` cuando `optimizing.front/back`: `absolute left-2 top-2 ... rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white` con `<Loader2 className="h-3 w-3 animate-spin" /> Optimizando...`.
  - Boton quitar `:550-557` / `:592-599`: `absolute right-2 top-2 h-[30px] w-[30px] rounded-full bg-[var(--danger-500)] text-white shadow-md`, `aria-label="Quitar foto"`, `<X className="h-4 w-4" />`, `onClick={() => clearPhoto(...)}`.
  - Strip de label inferior `:558-560` / `:600-602`: `absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-3.5 text-center text-[11.5px] font-bold text-white` → "Foto frontal" / "Espalda o perfil".
- **Sin preview (empty)** `:562-576` / `:604-618`: `<button onClick={() => frontInputRef.current?.click()}>` con clases condicionales por error (`:566-570`): error → `border-2 border-[var(--danger-500)] bg-surface-sunken`; normal → `border-2 border-dashed border-default bg-surface-sunken hover:bg-surface-sunken/70`. Contenido: `<Camera className="h-7 w-7" />`, label `text-[12.5px] font-bold text-body` "Foto frontal", sub `text-[10.5px]` "Opcional · toca para subir".
- Mensaje de error `:577-579` / `:619-621`: `<p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--danger-600)]">{fileErrors.front}</p>`.

RN `PhotoPickerSlot` `:557-599`: `Pressable` `styles.photoSlot` (flex 1, aspectRatio 3/4, radius 14, overflow hidden). className `uri ? 'border-2 border-sport-500' : 'border-2 border-dashed border-default bg-surface-sunken'` (`:569`).
- Con uri `:574-589`: `<Image source={{uri}} style={StyleSheet.absoluteFill} resizeMode="cover" />`; boton quitar `Pressable className="bg-danger-500"` `styles.clearBtn` 30x30 con `X size={16} color={ICON_WHITE}` (`:577-585`), `hitSlop={8}`, testID `${testID}-clear`; strip inferior `styles.photoLabelStrip` (bottom, `backgroundColor:'rgba(0,0,0,0.55)'`) con `{label}` blanco `textStyle('3xs', FONT.uiBold)` (`:586-588`).
- Empty `:590-596`: `Camera size={28} color={theme.mutedForeground}` + label `text-body textStyle('2xs', FONT.uiBold)` + "Opcional · toca para subir" `text-subtle textStyle('3xs', FONT.ui)`.
- **DIVERGENCIAS:** (1) RN sin badge "Optimizando..." (`:545-549`) — RN comprime sincronicamente al elegir, sin estado optimizing. (2) RN sin estado de error por slot (`fileErrors`) ni borde `danger-500` en empty — RN usa `Alert.alert` (§6c). (3) Web fondo del preview `bg-[var(--ink-950)]`; RN sin fondo explicito. (4) Web strip usa gradiente `from-black/60`; RN usa `rgba(0,0,0,0.55)` plano. (5) Web hover `hover:bg-surface-sunken/70` (no aplica en RN, adaptacion valida).

### 6c. Nota de privacidad
Web `:625-628`: `mb-4 flex items-center gap-1.5 text-[11px] text-subtle` con `<Lock className="h-3 w-3 shrink-0" />` + **"JPG, PNG o WEBP · max 5 MB · privadas, solo tu coach las ve."** (verbatim).
RN `:542-547`: `styles.privacyRow` + `Lock size={13} color={theme.mutedForeground}` + `text-subtle textStyle('3xs', FONT.ui)` mismo copy. (Icono 13px RN vs 12px web — menor.)

### 6d. Navegacion
Web `:630-637`: `flex gap-2.5`; boton `variant="secondary" size="lg" onClick={goPrev}` "`<ChevronLeft/> Atras`"; boton `variant="sport" size="lg" onClick={goNext} className="flex-1"` "Continuar `<ArrowRight/>`".
RN `:549-552`: `styles.navRow`; `Button label="Atras" leftIcon={ChevronLeft} variant="secondary"`; `Button label="Continuar" rightIcon={ArrowRight} variant="sport" style={{flex:1}}`. Paridad.

### 6e. Seleccion de foto — handler
- **Web** `validateAndSetFile` `:177-220`: limpia error del lado; gate LAXO `:190-196` (solo bloquea `file.type && !file.type.startsWith('image/')` con mensaje "El archivo no es una imagen. Usa una foto (JPG, PNG, HEIC...)."); `:197-200` si `>MAX_SIZE`(12MB) → "La imagen pesa mas de 12MB."; setea file + preview `URL.createObjectURL`; luego **optimizacion en la seleccion** `:205-219`: `jobSeq` invalida picks viejos, `setOptimizing(true)`, `prepareForUpload(file)` → si `!res` limpia file/preview y setea error "No pudimos optimizar esta imagen y pesa mas de 5MB. Prueba con otra.".
  - `prepareForUpload` `:154-175`: `imageCompression` a JPEG (`maxSizeMB:2, maxWidthOrHeight:1920`) con `Promise.race` timeout 15s → si cuelga usa original; si el original `>5MB` devuelve null (no utilizable).
  - `MAX_SIZE = 12MB` (`:58`), con comentario extenso `:55-57` (una foto de camara pesa 3-8MB antes de comprimir; rechazar al elegir = incidente jul-2026).
- **RN** `processAsset` `:101-121`: mismo gate laxo (`asset.mimeType && !asset.mimeType.startsWith('image/')` → `Alert.alert('Archivo no soportado','Selecciona una imagen.')`); `ImageManipulator.manipulateAsync` resize width 1920, `compress:0.72`, format JPEG (`:109-113`); `FileSystem.getInfoAsync` valida `MAX_BYTES = 5MB` (`:34`, `:114-118`) → si excede `Alert.alert('Imagen muy grande', ...)`; setea `frontPhotoUri`/`backPhotoUri`.
  - Origen: `choosePhotoSource` `:146-152` abre `Alert.alert('Foto de progreso','Como quieres agregarla?', [Tomar foto, Elegir de galeria, Cancelar])` → `takePhoto` (`:135-144`, `launchCameraAsync` quality 1, allowsEditing, aspect [3,4]) o `pickFromGallery` (`:123-132`, `launchImageLibraryAsync` mediaTypes ['images']). Permisos camara/galeria con Alert si denegado.
  - **DIVERGENCIA de UX (adaptacion RN valida, §10):** web = `<input type=file>` nativo del browser; RN = action sheet camara/galeria. Preserva "el alumno puede adjuntar 2 fotos opcionales". RN aplica `MAX_BYTES=5MB` (limite duro del bucket) en vez del techo 12MB del web (el web tolera 12MB porque re-comprime server-side; RN comprime en cliente y valida el limite real). **RN no tiene** el estado "Optimizando..." ni el error inline por slot; usa Alert.

### 6f. Limpiar foto
- Web `clearPhoto` `:222-235`: incrementa jobSeq, limpia preparedRef/optimizing/error/preview/file y `inputRef.current.value=''`.
- RN: `onClearFront`/`onClearBack` `:372-373` = `setFrontPhotoUri(null)`/`setBackPhotoUri(null)`. Mas simple (sin jobSeq porque no hay optimizacion async con seq).

---

## 7. Paso 3 — Notas + Resumen + Enviar

Web step 3 `:641-715` (`motion.div` key="step3").

### 7a. Notas (textarea)
Web `:650-659`: label `mb-2 text-[13px] font-semibold text-strong` "Notas para tu coach". `<textarea id="notes" maxLength={1000} value={notes} onChange={(e)=>setNotes(e.target.value)} onFocus={handleInputFocus} placeholder="Como te sentiste, sueno, comentarios..." className="min-h-[90px] w-full resize-y rounded-control border-[1.5px] border-default bg-surface-card p-3.5 font-ui text-[14px] text-strong outline-none transition-colors placeholder:text-muted focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]" />`.
`handleInputFocus` `:237-239`: a los 300ms `e.target.scrollIntoView({behavior:'smooth', block:'center'})`.

RN `StepThree` `:617-626`: `<Textarea label="Notas para tu coach" placeholder="Como te sentiste, sueno, comentarios..." value={notes} onChangeText={setNotes} maxLength={1000} showCount minRows={4} testID="notes-input" />`. Copy verbatim. RN agrega contador `showCount` (web no tiene contador visible — extra RN, no elimina nada). `KeyboardAvoidingView` (`:311`) + `scrollRef.scrollTo` por step (`:74-76`) cubren el `scrollIntoView` del web (adaptacion §10).

**GOTCHA Fabric RN #45798 (REGLA 7):** el primitivo `Textarea.tsx` aplica estilos condicionales por focus en el **wrapper del TextInput** — `Textarea.tsx:81` `borderClass = ... focused ? 'border-sport-600' : ...` aplicado al `View` contenedor `:124`, y `Textarea.tsx:85-94` `focusRing` (shadow condicional) aplicado al mismo `View` `:125`. Esto es exactamente el patron que #45798 puede romper (arbol inestable por cambio de estilo del wrapper en focus). **La spec RN debe: mantener el arbol del TextInput estable y expresar el ring por opacity de una capa hermana constante, NO alternar clases/estilos del wrapper por focus.** (Nota: el fix es en el primitivo compartido `Textarea.tsx` → reportado en `cambiosShell`, no tocar desde esta unidad.)

### 7b. Card Resumen
Web `:661-675`: `<Card padding="md" variant="sunken" className="mb-4 mt-4 gap-2.5">`. Eyebrow `:662` `text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted` "Resumen". Fila `:663` `flex justify-between` con 3 metricas `:664-673`: `['Peso', '${weight} kg']`, `['Energia', '${energyLevel}/10']`, `['Fotos', '${photoCount} adj.']`. Cada una `text-center`: valor `font-display text-lg font-black tabular-nums tracking-[-0.03em] text-strong`; label `text-[11px] font-semibold text-muted`.
`photoCount` `:319`: `[frontFile, backFile].filter(Boolean).length`.

RN `StepThree` `:628-636`: Card sunken padding md gap 10; eyebrow `TYPE.eyebrow text-muted` "Resumen"; `SummaryMetric` x3 `:632-634`: Peso `weight ? '${weight} kg' : '—'`, Energia `energyLevel != null ? '${energyLevel}/10' : '—'`, Fotos `${photoCount} adj.`. `photoCount` `:614` = `[frontPhotoUri, backPhotoUri].filter(Boolean).length`. `SummaryMetric` `:655-662`: valor `textStyle('lg', FONT.displayBold, {ls:'tighter'})` + `fontVariant:['tabular-nums']`; label `textStyle('3xs', FONT.uiSemibold) text-muted`. Paridad (web font-black 900 vs RN displayBold 800 — misma familia P2 que el numeral de energia).

### 7c. Estado error inline (step 3)
Web `:677-685`: cuando `state.error`, card `mb-3 flex items-start gap-2.5 rounded-control border border-[var(--danger-500)] bg-[var(--danger-100)] px-3.5 py-3 text-[var(--danger-600)]` con `<WifiOff className="mt-px h-[17px] w-[17px] shrink-0" />`, titulo `text-[13px] font-bold` "No pudimos enviar tu check-in" + detalle `text-xs leading-relaxed` = `{state.error}`.
**Estado RN:** NO existe esta card inline. RN muestra el error con `Alert.alert('Error','No se pudo guardar el check-in. Intenta de nuevo.')` (`:231-232`). **DIVERGENCIA.**

### 7d. Navegacion + Enviar
Web `:687-713`: `flex gap-2.5`; Atras `variant="secondary" size="lg" disabled={isSubmitting} onClick={goPrev}` "`<ChevronLeft/> Atras`". Boton principal `:691-712` `variant="sport" size="lg" onClick={() => void handleAction()} disabled={isSubmitting} className="flex-1"` con **3 estados de contenido**:
- `isSubmitting` → `<Loader2 className="animate-spin" /> Enviando...`
- `state.error` → `<RefreshCw /> Reintentar`
- default → `<Check /> Enviar check-in`

RN `:638-649`: `styles.navRow`; Atras `variant="secondary" disabled={submitting}`; principal `<Button label="Enviar check-in" rightIcon={Check} variant="sport" loading={submitting} onPress={onSubmit} style={{flex:1}} testID="checkin-submit" />`.
- **DIVERGENCIAS:** (1) RN icono `Check` a la **derecha** (rightIcon); web a la **izquierda** (`<Check/> Enviar check-in`). (2) RN NO tiene el estado "Reintentar" (`state.error` → `RefreshCw`) — siempre "Enviar check-in" (`loading` cubre el "Enviando..."). (3) label estatico "Enviar check-in" en RN vs texto que cambia en web.

---

## 8. Submit / persistencia

### Web `handleAction` `:241-317` + server actions
1. `setIsSubmitting(true)`; arma `FormData` con `weight`, `energy_level`, `notes` (`:244-247`).
2. **Subida directa a Storage** `:253-300`: por cada foto con `preparedRef` (blob ya comprimido en la seleccion), llama `createCheckinUploadUrlsAction` (`check-in.actions.ts:38-68`) que **firma URLs de subida directa al bucket `checkins`** (patron espejo exercise-media, service-role, `createSignedUploadUrl`); luego `fetch(ticket.signedUrl, {method:'PUT', body: blob, ...timeout 45s})` (`:278-285`). Si OK → `formData.set(field, ticket.path)`. Best-effort: cada foto que falla incrementa `fotosDescartadas`.
   - **GOTCHA WAF Cloudflare (preservar):** `check-in.actions.ts:30-37` + `CheckInForm.tsx:248-252` documentan que los bytes NUNCA pasan por eva-app.cl (POST solo lleva PATHs) → inmune al WAF CF 403 (incidente 2026-07-02) y al limite 4.5MB de Vercel.
3. Toast warning si `fotosDescartadas > 0` `:302-309`: 1 foto → "Una foto no pudo subirse y va a omitirse; tu check-in se envia igual." / >1 → "Las fotos no pudieron subirse...". id `client-checkin-warn` duracion 8000.
4. `startTransition(() => formAction(formData))` `:310` → `submitCheckinAction` (`check-in.actions.ts:137-220`):
   - Parsea SOLO `weight/energy_level/notes` con `CheckInSchema` (fotos FUERA del parse `:141-149`); `weight` con `.replace(',','.')`. Si falla → `{ error: issues[0].message }`.
   - `ownCheckinPath` `:74-81` valida que el path venga dentro de `${userId}/` (scope).
   - Flujo legacy (File en el POST) best-effort `:169-191`: `uploadToCheckinsBucket` (`:83-119`) comprime a WebP 1080 (`compressImageToWebp`), sube con service-role, `upsert:false`; si falla incrementa `droppedPhotos` sin abortar.
   - `insert` en `check_ins` `:193-200`: `{ client_id: user.id, weight, energy_level, notes: notes||null, front_photo_url: photoPath, back_photo_url: backPhotoPath }` — **NO setea columna `date`** (usa `created_at` default).
   - `revalidatePath('/c','layout')` + `revalidatePath('/coach/clients/${user.id}')` `:206-207`.
   - Return `{ success: true, ...(droppedPhotos>0 ? { warning } : {}) }`.
5. `catch` `:311-316`: `toast.error('No se pudo enviar el check-in. Intenta de nuevo.')` + `setIsSubmitting(false)`.

### RN `submit` `:186-251`
1. Guard `if (submitting) return`; `setSubmitting(true)`.
2. `getClientProfile()` — si no, `Alert.alert('Error','No se pudo obtener tu perfil.')` (`:190-195`). `supabase.auth.getUser()` — si `user.id !== client.userId` → `Alert.alert('Error de sesion','Inicia sesion de nuevo.')` (`:197-202`). (Validacion de sesion extra RN, sin equivalente en el server action web — el server usa `getUser()` propio.)
3. **Subida directa a Storage** `uploadPhoto` `:158-184`: sube al bucket privado `checkins` via `supabase.storage.from('checkins').upload(path, decode(base64), {contentType:'image/jpeg', upsert:false})`. Patron canonico RN: `ImageManipulator` con `base64: true` + `decode()` a ArrayBuffer (`:163-167`) porque `Blob.arrayBuffer()` no es confiable en RN. Best-effort: si falla loguea y devuelve null; `droppedPhotos++` (`:210-217`).
   - **GOTCHA WAF preservado:** RN sube directo al bucket con el SDK autenticado — los bytes tampoco pasan por eva-app.cl. Paridad con el objetivo del fix web (aunque el mecanismo difiere: web firma URL server-side; RN usa el client SDK). Bucket privado desde jun-2026, se guarda el PATH no la URL (`:154-157`).
4. `insert` `:219-227`: `{ client_id, date: getTodayInSantiago().iso, weight: weight ? parseFloat(weight):null, energy_level, front_photo_url, back_photo_url, notes: notes.trim()||null }`.
   - **DIVERGENCIA de schema:** RN **SI** setea `date` (dia Santiago); web NO (usa `created_at`). Y RN lee/ordena por `date` (`:83-85`) mientras web usa `created_at`. Riesgo: si el coach o el banner leen `created_at`, el registro RN podria diferir. Verificar que `check_ins` tenga ambas columnas consistentes.
5. Exito `:233-250`: `setDone(true)`, resetea step/fotos/notes/prefilledRef, `loadLastCheckIn()`. Si `droppedPhotos>0` → `Alert.alert('Check-in guardado', ...)` con el mismo copy que el web toast (1 foto / >1). **DIVERGENCIA:** web usa `toast.warning`; RN usa `Alert.alert` (adaptacion §10).
   - Copy RN warning `:246-247`: "...Puedes volver a intentarlo en el proximo check-in." vs web `:305-306`/`:215-216`: "...va a omitirse; tu check-in se envia igual." / "...Puedes reenviarla a tu coach por otro medio." **DIVERGENCIA de copy** (no verbatim).
6. Error `:231-232`: `Alert.alert('Error','No se pudo guardar el check-in. Intenta de nuevo.')`.

- **DIVERGENCIA de compresion:** web comprime a **JPEG en la seleccion** (`:154-175`) y el server re-comprime a **WebP 1080** (`check-in.actions.ts:95`). RN comprime a JPEG al elegir (`:109-113`) y de nuevo a JPEG al subir (`:163-167`); no hay paso WebP. Ambos best-effort.

---

## 9. Pantalla de exito + celebracion

Web `:321-357` (return temprano cuando `state.success`):
- `<SuccessWaveOverlay show={showCelebration} message="Check-in enviado!" accentColor={coachPrimaryColor} onComplete={...} />` `:324-329` — overlay de onda tematizada por marca.
- `motion.div` `:330-335`: `initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={springs.elastic}`, `flex min-h-[60dvh] flex-col items-center justify-center px-8 pb-16 text-center`.
- Circulo check `:336-338`: `h-[88px] w-[88px] rounded-full bg-[var(--success-500)] text-white shadow-[0_8px_28px_rgba(31,184,119,0.4)]` con `<Check className="h-11 w-11" />`.
- Titulo `:339-341`: `font-display text-[27px] font-black tracking-tight text-strong` "Check-in enviado!".
- Parrafo `:342-344`: `mt-2 max-w-[280px] text-[15px] leading-relaxed text-muted` **"Tu coach recibio tu actualizacion mensual. Ajustara tu plan segun tu progreso."** (verbatim).
- Boton `:345-353`: `variant="sport" size="lg" onClick={() => router.push(base+/dashboard)} className="mt-7 w-full max-w-[280px]"` "Volver al inicio".

Confetti: en el efecto `:98-116`, al `state.success` → toast success/warning + `setShowCelebration(true)` + si `!reducedMotion` `fireConfetti({ particleCount:90, spread:70, startVelocity:45, origin:{x:0.5,y:0.7} })` (`:109-111`). `fireConfetti` `:41` importa `canvas-confetti` dinamico.

RN `done` screen `:269-306`:
- `<Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} />` (`react-native-fast-confetti`) solo si `!motion.reduced` (`:273-275`).
- `MotiView` `:277-285`: `from={{scale:0.8, opacity:0}} animate={{scale:1, opacity:1}}` spring (damping 13, stiffness 180); `className="bg-success-500"` circulo 88x88 (`styles.successCircle`) + `SHADOWS[resolvedScheme].lg`; `<Check size={44} color={ICON_WHITE} strokeWidth={2.5} />`.
- Titulo `:286-288`: fontSize 27, lineHeight 32, `FONT.displayBlack`, `text-strong` "Check-in enviado!".
- Parrafo `:289-291`: `text-muted TYPE.body` copy verbatim identico.
- Boton `:292-302`: `label="Volver al inicio" variant="sport" size="lg" onPress={() => { setDone(false); router.push('/alumno/home') }}` testID `checkin-success-home`.
- **DIVERGENCIAS:** (1) RN NO tiene `SuccessWaveOverlay` (onda tematizada de marca) — solo confetti (adaptacion §10). (2) Confetti RN con colores parcialmente **hardcodeados** (`'#F59E0B'`, `'#10B981'`) + `theme.primary`/`theme.cyan`; web confetti es neutro. (3) Web navega a `${base}/dashboard`; RN a `/alumno/home`. (4) Web muestra toast de exito ademas del overlay (`:105`); RN no (la pantalla `done` es el feedback).

---

## 10. Animaciones / transiciones

- **Transicion entre pasos:** web `AnimatePresence mode="wait"` + `stepVariants` `:121-136` (slide x ±40 + fade, duracion 0.28 enter / 0.2 exit; gateado por `reducedMotion` `:63`). RN NO anima el swap de pasos (renderiza `step===n && <StepN/>` dentro del ScrollView `:351-391`); en su lugar `scrollRef.scrollTo({y:0, animated:true})` por cambio de step (`:74-76`). **DIVERGENCIA:** falta la transicion slide/fade entre pasos (adaptacion, pero perdida visual).
- **Stepper:** ambos animan `flex` con spring (web `springs.snappy` `:390`; RN spring damping 18/stiffness 200 `:328`).
- **Reduced motion:** web `useReducedMotion()` gatea confetti + variants; RN `useEvaMotion().reduced` gatea confetti (`:273`). Paridad de la reduccion de confetti; RN no tiene variants que reducir.

---

## 11. Accesibilidad

- Botones peso: web `aria-label="Menos"/"Mas"` (`:448`, `:462`); RN `accessibilityRole="button"` + `accessibilityLabel` (`:442-443`, `:456-457`). Paridad.
- Boton Atras TopBar: web `aria-label="Atras"` (`:365`) — **ausente en RN** (no hay boton).
- Quitar foto: web `aria-label="Quitar foto"` (`:553`, `:595`); RN sin `accessibilityLabel` en el `Pressable` de clear (`:577-585`) — **falta a11y label** (menor).
- Slider: RN `Slider.tsx:153-162` `accessibilityRole="adjustable"` + `accessibilityValue={{min,max,now}}` + acciones increment/decrement. Web usa `<input type=range>` nativo (a11y del browser). Paridad conceptual.
- Inputs de foto web con `sr-only` (`:524`, `:533`); RN action sheet nativo (a11y del OS).

---

## 12. Estados (resumen)

| Estado | Web | RN |
|---|---|---|
| Carga pagina | `loading.tsx` → `BrandClientLoadingShell` | ScrollView monta directo; `loadLastCheckIn` async sin skeleton |
| Vacio (sin ultimo check-in) | Card "Tu primer check-in" `:428-439` | Card "Tu primer check-in" `:426-432` (paridad) |
| Optimizando foto | badge "Optimizando..." `:545-549` | **ausente** |
| Error foto (por slot) | borde danger + `<p>` mensaje `:577-579` | **ausente** (Alert global) |
| Enviando | boton "Enviando..." spinner `:699-702` | `Button loading` `:645` |
| Error submit | card inline WifiOff + boton "Reintentar" `:677-685`,`:703-706` | `Alert.alert` `:231-232`, sin "Reintentar" |
| Foto descartada | `toast.warning` 8s `:302-309`/`:213-216` | `Alert.alert('Check-in guardado', ...)` `:242-249` |
| Exito | SuccessWaveOverlay + confetti + pantalla `:321-357` | Confetti + MotiView pantalla `:269-306` (sin wave) |

---

## Hallazgos Ola 0

De `docs/rn-port/ola0-hallazgos.json`. Grep por "CheckInForm (sliders de bienestar)" → cluster de discrepancias del check-in (lineas ~6532-6560) + badge/off-by-one (~6182-6192) + Textarea DS (~916-992).

**Cluster CheckInForm (check-in.tsx):**
1. **P2 — Numeral energia peso 800 vs 900:** web `CheckInForm.tsx:477-478` `font-black` (Archivo 900); RN `check-in.tsx:472` `FONT.displayBold` = `Archivo_800ExtraBold` (`typography.ts:38`). Fix: usar `FONT.displayBlack` (`Archivo_900Black`, typography.ts:39). (hallazgos ~6534-6538)
2. **P2 — Numeral energia sin tabular-nums:** web `:477` `tabular-nums`; RN `:472` Text sin `fontVariant` (el ancho salta 9→10). Fix: agregar `{ fontVariant: ['tabular-nums'] }` (como en `:452` peso y `:658` resumen). (hallazgos ~6540-6545)
3. **P2 — Accent del slider crudo vs clampado:** web `:490` `accentColor: coachPrimaryColor` (crudo); RN `Slider.tsx:166,171` usa `theme.primary` (clamp por contraste via `resolveBrandTheme`, `theme.ts:217-220`). Solo visible con marcas de bajo contraste. Decidir politica DS. (hallazgos ~6547-6552)
4. **P2 — Gap card energia/peso 14 vs 12:** web `:474` `gap-3` (12px); RN `:469`/`:438` `style={{gap:14}}`. Fix: gap 12 (o usar props label/renderValue del Slider cuyo head ya trae 12). (hallazgos ~6554-6559)

**Cluster CheckInBanner / badge (dashboard, relacionado):**
5. **P1 — App badge SET ausente en RN:** web `AppBadgeSync count={1}` cuando check-in pendiente (`CheckInBanner.tsx:60-61`); RN solo LIMPIA (`check-in.tsx:23` importa `clearAppBadge`; `check-in.tsx:71` `clearAppBadge()` al montar) — existe `setAppBadge` pero home no lo llama. (hallazgos ~6182-6186). Fuera de esta unidad (home.tsx) pero relevante: el clear al abrir SI esta en paridad (`check-in.tsx:67-72` vs `CheckInForm.tsx:87-90` `clearAppBadge()`).
6. **P1 — Off-by-one dia Santiago:** `checkin-thresholds.ts:47` toma prefijo UTC; el web mapea a dia Santiago. Afecta el banner del dashboard, no el form. (hallazgos ~6189-6192)

**Cluster Textarea DS (afecta las Notas, primitivo compartido):**
7. **P1 — Sin ring de foco en Android:** `Textarea.tsx:85-94` `focusRing` es solo shadow iOS (`elevation:0`); Android solo cambia color de borde. (hallazgos ~916-921)
8. **P1 — Disabled no atenua texto:** `Textarea.tsx:77,82` cambia solo el fondo; el TextInput mantiene `text-strong`. (hallazgos ~923-928)
9. **P2 varios:** radio 14 vs 20 web (~930-935), borde 1.5 + `bg-surface-card` vs `bg-transparent` web (~937-942), padding 14/10 vs 10/8 (~944-949), fontSize 15/500 vs 16/400 (~951-956), min-height 83px (minRows 3) vs 64px web (~958-963), placeholder dark `#8A95A3` vs `#98A2B0` (~980-984). Nota: el textarea web legacy no esta migrado al DS; varias de estas divergencias esperan la decision sistemica web-DS.

---

## Estado RN actual — divergencias mas obvias (con citas)

1. **Boton Atras de la TopBar ausente** — web `CheckInForm.tsx:363-369` (Link → dashboard, ChevronLeft, `aria-label="Atras"`); RN `check-in.tsx:313-320` sin boton.
2. **Sin transicion animada entre pasos** — web `AnimatePresence`+`stepVariants` `:403,121-136`; RN swap directo `:351-391` (solo scroll-to-top).
3. **Estado "Optimizando..." y errores por slot ausentes** — web `:545-549`,`:577-579`; RN comprime sincronicamente + Alert global (`:114-118`).
4. **Error de submit: card inline + boton "Reintentar" ausentes** — web `:677-685`,`:703-706`; RN `Alert.alert` `:231-232`, boton siempre "Enviar check-in" `:641`.
5. **Feedback de fotos descartadas: toast vs Alert + copy no-verbatim** — web `toast.warning` `:302-309`; RN `Alert.alert` `:242-249` con texto distinto.
6. **Pantalla de exito sin `SuccessWaveOverlay`** — web `:324-329` onda de marca; RN solo confetti `:273-275` con colores parcialmente hardcodeados.
7. **Stepper y slider usan accent del theme (clamp) en vez de `coachPrimaryColor` crudo** — web `:387`,`:490`; RN `:329` (`bg-sport-500`), `Slider.tsx:166,171` (P2 Ola 0 #3).
8. **Schema `date` vs `created_at`** — RN inserta y ordena por `date` (`:83-85`,`:221`); web por `created_at` (`check-in.queries.ts:38,41`; el insert no setea `date`).
9. **Numeral energia: peso 800 y sin tabular-nums** — RN `:472` (Ola 0 #1, #2).
10. **GOTCHA Fabric #45798 latente en el primitivo `Textarea.tsx`** — estilos condicionales por focus en el wrapper del TextInput (`:81`,`:85-94`,`:124-125`). Reportar fix en `cambiosShell` (primitivo compartido, no tocar desde esta unidad).
11. **Icono History del ultimo check-in: `theme.primary` vs `text-sport-600`** — RN `:415` vs web `:416`; iconos peso `theme.foreground` vs `var(--ink-700)` web `:451`.

**Funcionalidad RN existente a NO eliminar (regla 2):** action sheet camara/galeria (`:146-152`), validacion de sesion pre-submit (`:197-202`), contador de caracteres `showCount` en Notas (`:623`), prefill de peso/energia una vez (`:91-96`), reset de estado post-exito (`:235-240`), haptics del slider (`Slider.tsx:88`), testIDs de todos los controles.
