# SPEC — Chrome flotante alumno + edge-to-edge (unidad `chrome-tabbar`)

**Sección 2 · Dashboard del alumno · Puerto RN 1:1**

- **Fuente de verdad web:** `apps/web/src/components/client/ClientNav.tsx` — rama `md:hidden` (cápsula flotante móvil), líneas 461-557; sheet "Más" 354-459; hide-on-scroll 76-98.
- **Contraparte RN:** `apps/mobile/components/alumno/AlumnoMobileChrome.tsx` + `apps/mobile/app/alumno/(tabs)/_layout.tsx`.
- **Dueña de:** barra flotante (cápsula esmerilada) + Tabs layout. **NO** toca `TabBar.tsx` (variante DS del coach, no usada por alumno).
- **P0 asignado:** P0-1 franja blanca detrás de la tab bar en dark. Sección dedicada al final.

Cada afirmación cita `archivo:línea`. Nada de memoria.

---

## 1. Anatomía y jerarquía (web)

La cápsula móvil es un `<nav>` fijo, renderizado SOLO cuando `!isWorkout` (`ClientNav.tsx:466`) y oculto en desktop vía `className="client-nav-mobile flex md:hidden"` (`:469`).

Estructura de nodos (`:467-556`):

1. `<nav>` — contenedor cápsula (`:467-488`).
2. `<span aria-hidden>` — **píldora deslizante** detrás del tab activo (`:490-506`).
3. `baseItems.map(renderBaseTile)` — 3-4 tiles primarios (`:507`).
4. `<button>` "Más" — último tile, toggle del sheet (`:508-555`).

El sheet "Más" es un árbol separado bajo `<AnimatePresence>` (`:355-459`), renderizado cuando `moreOpen && !isWorkout` (`:356`): backdrop (`:358-367`) + panel `role="dialog"` (`:368-456`).

### Posición y geometría de la cápsula (`:470-487`)
- `position: fixed` (`:471`).
- `left`/`right`: `minimized ? 72 : 14` (`:472-473`) — se estrecha al minimizar.
- `bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)'` (`:474`) — flota 16px sobre el home-indicator.
- `zIndex: 59` (`:475`); el sheet backdrop es `z-[58]` (`:360`) y el panel `z-[60]` (`:372`).
- `alignItems: 'stretch'`, `padding: 8` (`:476-477`).
- `borderRadius: 30` (`:478`).
- Material esmerilado (`:479-482`):
  - `background: color-mix(in srgb, var(--surface-card) 74%, transparent)` — **una sola capa translúcida** (74% surface-card).
  - `backdropFilter: saturate(180%) blur(26px)` + `WebkitBackdropFilter` idéntico — el blur frostea el CONTENIDO real que scrollea por debajo. **No hay backing opaco.**
  - `border: '1px solid color-mix(in srgb, var(--text-strong) 9%, transparent)'` — hairline derivado del color de texto al 9% (en dark ≈ blanco@9%, muy sutil).
- Sombra triple (`:483-484`): `0 1px 0 rgba(255,255,255,0.45) inset` (highlight interior superior) + `0 14px 36px rgba(13,18,28,0.24)` (ambient) + `0 4px 12px rgba(13,18,28,0.12)`.
- Transición: `left/right var(--dur-slow) var(--ease-spring)` (`:485-486`).

### Píldora deslizante (`:490-506`)
- `position: absolute; top: 8; bottom: 8` (`:493-495`).
- `left: calc(8px + ${idx} * ((100% - 16px) / ${mobileTabCount}))` (`:496`), `width: calc((100% - 16px) / ${mobileTabCount})` (`:497`) — segmento uniforme por tab (16px = padding*2).
- `borderRadius: 22` (`:498`).
- `background: color-mix(in srgb, var(--theme-primary) 15%, transparent)` (`:499`), `border: 1px solid color-mix(in srgb, var(--theme-primary) 24%, transparent)` (`:500`) — tinte white-label.
- `transition: left var(--dur-slow) var(--ease-spring)` (`:501`), `pointerEvents: none` (`:502`), `zIndex: 0` (`:503`).
- `opacity: mobileActiveIndex < 0 ? 0 : 1` (`:504`) — invisible cuando ningún tab está activo.
- `mobileActiveIndex` (`:143-145`): si `mobileMoreActive` → `baseItems.length` (posición de "Más"); si no → índice del baseItem activo (`findIndex isActiveHref`).
- `mobileTabCount = baseItems.length + 1` (`:141`).

---

## 2. Tiles primarios — `renderBaseTile` (`:208-267`)

Cada tile es un `<Link>` (`:212-265`):
- `href={item.href}`, `prefetch={false}` (`:213-214`).
- `aria-label={item.label}` (`:215`), `aria-current={isActive ? 'page' : undefined}` (`:216`), `title={item.label}` (`:217`).
- `onClick`: `if (pathname !== item.href) setIsNavigating(item.href)` (`:219-221`) — pulso optimista.
- `className={cn('eva-tabbar-press', isNavigating === item.href && 'animate-pulse')}` (`:222`).
- Estilo (`:223-239`): `position: relative; zIndex: 1` (sobre la píldora), `flex: 1`, columna centrada, `gap: minimized ? 0 : 3`, `padding: minimized ? '5px 0' : '6px 0'`, `minHeight: 44` (touch target), `background: transparent`, `color: isActive ? var(--theme-primary) : var(--text-muted)`, `transition: color/padding var(--dur-base) var(--ease-out)`.

### Glifo (`:241-249`)
- `<span>` `inline-flex h-[22px] w-[22px]` (`:242-245`).
- Activo: clase `[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]` — **el glifo activo se rellena al 18% con el color actual** (= brand).
- `transform: isActive ? translateY(-1px) : none`, `transition: transform var(--dur-base) var(--ease-spring)` (`:246`).
- `<Icon className="h-[22px] w-[22px]" />` (`:248`).

### Label (`:250-264`)
- `fontSize: 10`, `fontWeight: isActive ? 800 : 600`, `letterSpacing: '0.01em'`, `lineHeight: 1.1` (`:252-255`).
- `maxHeight: minimized ? 0 : 14`, `opacity: minimized ? 0 : 1`, `overflow: hidden`, `maxWidth: 100%` (`:256-259`).
- `transition: max-height/opacity var(--dur-base) var(--ease-out)` (`:260`).
- Texto = `item.short` (`:263`).

### Botón "Más" (`:508-555`)
- `<button type="button">`, `onClick={() => setMoreOpen((o) => !o)}` (**toggle** en web), `aria-label="Más"`, `aria-expanded={moreOpen}` (`:508-512`).
- `className="eva-tabbar-press"` (`:513`).
- Estilo espejo del tile primario (`:514-530`) con `cursor: pointer`; `color: mobileMoreActive ? var(--theme-primary) : var(--text-muted)`.
- Glifo `MoreHorizontal` con mismo fill activo `[&_svg]:[fill-opacity:0.18]` cuando `mobileMoreActive` (`:532-540`).
- Label `"Más"`, `fontWeight: mobileMoreActive ? 800 : 600` (`:541-554`).

---

## 3. Ítems de navegación y su origen (datos)

Definidos en `ClientNav.tsx`:
- **baseItems** (`:108-113`): `Inicio` (`/dashboard`, icon `Home`) · `Nutrición` (`/nutrition`, icon `Apple`, SOLO si `showNutrition`) · `Aprender` (`/exercises`, icon `Dumbbell`) · `Check-in` (`/check-in`, icon `CheckCircle`). Copy verbatim: labels `Inicio/Nutrición/Aprender/Check-in`; `short` = mismo texto.
- **moduleItems** (`:117-120`): `Movimiento` (`/movimiento`, `PersonStanding`, si `showMovement`) · `Composición` (`/bodycomp`, `Gauge`, si `showBodyComposition`). NO viven en la cápsula móvil; se alcanzan vía Mi perfil (`:126-128`).
- **historyItem** (`:123`): `Historial` (`/workout-history`, `History`).
- **moreRoutes** (`:128`): `[historyItem.href, ${base}/perfil, ...moduleItems]` — mantienen "Más" encendido cuando el alumno está dentro (`:129` `isMoreActive`).

### `showNutrition` (fail-OPEN)
`Props.showNutrition` default `true` (`:53`), espejo de `resolveNutritionDomainEnabled` con flag OFF (`:42-48`). Si el coach apagó nutrición → el tab desaparece.

---

## 4. Estado activo (lógica)

- `isActiveHref(href)` (`:134-137`): `pathname === href || pathname.startsWith(href + '/workout') || isNavigating === href`. **Preserva la ejecución `/workout` y el pulso optimista.**
- `isMoreActive` (`:129`): alguna `moreRoutes` coincide (`=== href || startsWith(href + '/')`).
- `mobileMoreActive = isMoreActive || moreOpen` (`:142`) — "Más" también se enciende mientras el sheet está abierto.

---

## 5. Sheet "Más" (web `:354-459`)

Adaptación RN legítima → `Sheet` DS (BottomSheet), pero la spec fija la conducta web verbatim.

### Backdrop (`:358-367`)
`md:hidden fixed inset-0 z-[58] bg-black/40`; fade `opacity 0→1`, `duration: reduce ? 0 : 0.18`; click cierra (`:365`).

### Panel (`:368-377`)
`role="dialog"` `aria-label="Más opciones de navegación"`; `fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 rounded-t-card border-t border-subtle bg-surface-card px-3 pt-3 pb-safe shadow-md`. Animación: `y:'100%' → 0`, spring `damping 26 stiffness 280` (reduce → tween opacity 0.18). Altura por contenido, no snap fijo.

### Cabecera (`:378-388`)
- `<p>` `text-[11px] font-bold uppercase tracking-widest text-muted` → `"Más"`.
- Botón X: `h-9 w-9 rounded-control text-muted hover:bg-surface-sunken hover:text-strong`, icono `X h-5 w-5` (`:386`). Plano, sin borde.

### Fila "Mi perfil" (destacada) (`:392-414`)
- `<Link href={base}/perfil>`, `aria-label="Mi perfil"`, `onClick` cierra sheet (`:395`).
- Clase: `flex min-h-[52px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5`; **reposo `bg-surface-sunken hover:opacity-90`; activo (`pathname===perfil`) `text-strong` + `activeBgStyle`** (`:397-401`).
- Leading: chip `h-9 w-9 rounded-control`, `background: color-mix(primary 12%)`, `color: var(--theme-primary)`, `UserRound h-[18px] w-[18px]` (`:403-408`).
- Título `text-sm font-bold text-strong` = `"Mi perfil"`; subtítulo `text-[12px] text-muted` = `"Racha, módulos, cuenta y más"` (`:409-412`).
- Trailing: `ChevronRight h-[18px] w-[18px] text-muted` (`:413`).

### Fila "Historial" (`:418-438`)
- `<Link href={historyItem.href}>`, `aria-label="Historial"`, cierra sheet (`:423-427`).
- Clase: `flex min-h-[44px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold`; **reposo `text-muted hover:bg-surface-sunken hover:text-strong`; activo `text-strong` + `activeBgStyle`** (`:428-432`).
- Icono `History h-5 w-5` **inline sin contenedor**, `text-muted` (activo → `activeColorStyle`) (`:434`).
- Texto `text-sm font-semibold` = `"Historial"` (`:435`). SIN chevron.

### PWA "Instalar app" (`:440-443`)
`<PwaNavButton />` bajo `border-t border-subtle pt-2`. **RN OMITE** (nativo, sin PWA — desviación documentada `AlumnoMobileChrome.tsx:54-56`).

### "Cerrar sesión" (`:447-455`)
- `<button onClick={handleSignOut}>`, `aria-label="Cerrar sesión"`.
- Clase: `flex min-h-[44px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive`.
- `LogOut h-5 w-5` + texto `"Cerrar sesión"`.
- `--destructive = var(--cta-danger) = #D31E45` (globals.css, sin re-declaración dark → mismo hue ambos esquemas), a 80% opacidad, 14px.

---

## 6. Handlers exactos

- **Tile primario tap** → navega a `item.href` (Next `<Link>`); setea `isNavigating` optimista (`:219-221`). Sin toast.
- **Botón "Más" tap** → `setMoreOpen(o => !o)` toggle (`:510`). Sin navegación, sin toast.
- **Backdrop / X / navegación** → `setMoreOpen(false)` (`:365,382`; auto-close en cambio de ruta `:72-74`).
- **Fila Mi perfil / Historial** → `<Link>` + `setMoreOpen(false)` (`:395,427`).
- **Cerrar sesión** → `handleSignOut` (`:147-151`): `supabase.auth.signOut()` → `router.push(${base}/login)` → `router.refresh()`. Sin toast.

---

## 7. Hide-on-scroll (`:76-98`)

- Listener en `window` scroll, `passive: true`, re-suscrito por `pathname` (`:96-98`).
- Throttle vía `requestAnimationFrame` + flag `ticking` (`:82-94`).
- `dy = y - lastY`; reacciona solo si `Math.abs(dy) > 6` (`:88`).
- `setMinimized(dy > 0 && y > 80)` (`:90`) — baja + más allá de 80px minimiza; sube o cerca del top revela.
- Aplica en **TODAS** las rutas alumno (window es global), incluidas `/workout-history` y `/perfil`.

---

## 8. Ocultamiento del chrome

- Login/register/forgot/onboarding → `return null` (`:154-156`).
- Ejecución de plan `/workout/` → `isWorkout` (`:159`); cápsula y sheet se ocultan (`:356,466`). **RN debe preservar** (`AlumnoMobileChrome.tsx:194 if (activeName === 'workout') return null`).

---

## 9. Accesibilidad (web)

- `<nav aria-label="Navegación principal">` (`:468`).
- Tiles: `aria-label`, `aria-current="page"` en activo (`:215-216`).
- Botón "Más": `aria-label="Más"` + `aria-expanded` (`:511-512`).
- Sheet: `role="dialog"` + `aria-label` (`:370-371`); backdrop `aria-hidden` (`:366`).
- `.eva-tabbar-press` + `fill-opacity` tienen guard `prefers-reduced-motion` (globals.css:178-185); `useReducedMotion` gobierna las animaciones del sheet (`:64,364,373-376`).

---

## 10. Tokens de movimiento (web → RN)

| Web | Valor | RN |
|---|---|---|
| `.eva-tabbar-press:active` | `scale(0.96)` 0.13s cubic-bezier(.22,1,.36,1) (globals.css:167-173) | — (falta pressed, ver Hallazgos) |
| `--dur-base` | 220ms (globals.css:539) | `withTiming` labels usa 200ms (`TabTile:326-327`) |
| `--ease-spring` | resorte | `SPRING.ui` damping 18 · stiffness 220 · mass 1 (`AlumnoMobileChrome.tsx:70-73`) |
| pill slide | `left … var(--dur-slow) var(--ease-spring)` (`:501`) | `withSpring` translateX NAV_SPRING (`:174`) |
| fill activo | `.eva-tabbar-ico-on svg { fill:currentColor; fill-opacity:.18 }` (globals.css:174-177) | strokeWidth 2.4/2.1 (`:344`) — divergencia |

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`, componente `ClientNav`)

Divergencias reportadas (todas P2 salvo cápsula-en-módulos P1). Citas verbatim del JSON:

1. **Glifo activo sin fill** — web `ClientNav.tsx:242-245` rellena SVG al 18% (`[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]`); RN `AlumnoMobileChrome.tsx:340-345` usa `strokeWidth 2.4/2.1`. La justificación documentada ("lucide-react-native no puede fill barato") es **falsa**: el propio repo lo hace en `TabBar.tsx:138-139` `{...(active ? { fill: brand, fillOpacity: 0.18 } : null)}` (verificado ahora, coach floating). **Fix:** replicar props `fill`/`fillOpacity 0.18` con brand resuelto en runtime, volver strokeWidth al default. (P2)

2. **Fila "Mi perfil"** — web reposo `bg-surface-sunken` + activo `activeBgStyle` (primary 10% bg / 20% border) cuando `pathname===perfil` (`:396-401`); RN ListRow pinta `bg-surface-card` (ListRow.tsx:80 = se funde con el sheet) y sin estado activo (`:267-279`). **Fix:** `className="bg-surface-sunken"` + tinte primary 10%/20% cuando `activeName==='perfil'`. (P2)

3. **Fila "Historial"** — web icono `History h-5 w-5` inline text-muted (sin chip), `text-sm font-semibold`, con estado activo (`:418-438`); RN chip 36×36 `bg-surface-sunken` + icono 18px + título 15/700 + `showChevron`, sin estado activo (`:280-291`). **Fix:** quitar chip/chevron, icono 20px inline, label 14/600 muted, tinte activo cuando `activeName==='history'`. (P2)

4. **"Cerrar sesión"** — web `text-destructive/80` (`--cta-danger #D31E45`, mismo hue ambos esquemas) 14px (`:447-455`); RN `text-danger-600` (#BE183C claro / #FF7C97 dark) 15px opacidad plena (`:301-302`). **Fix:** `text-cta-danger/80` + `text-[14px]`. (P2)

5. **Sheet chrome** — web backdrop `bg-black/40`, `rounded-t-card` (20px), título caption `text-[11px] font-bold uppercase tracking-widest text-muted`, X `h-9 w-9` sin borde, altura por contenido (`:358-388`); RN vía `Sheet` DS: backdrop 0.6, `rounded-t-sheet` 28px, título 18px Archivo 800 uppercase, X 32px con borde pill, `snapPoints ['48%']` fijo (`Sheet.tsx:69,96,131,166` + `:266`). **Decisión de gobernanza** (reuso primitivo DS), no bug unilateral. (P2)

6. **Material cápsula** — web velo único `surface-card 74%` + borde `text-strong 9%` + sombra triple 14/36@.24 + inset highlight (`:479-484`); RN velo `bg-surface-card/70` (70 vs 74) + `border-subtle` (ink-100 / blanco 7%, no text-strong@9%) + `shadow('md')` una capa 0 4 12 @.08 (shadows.ts:32), sin inset highlight (`:213-221`). **Fix:** subir velo a `/[0.74]`, sombra más cercana a web (`shadow('lg')` o token `capsule` ad-hoc), inset highlight irreproducible en RN (aceptable). (P2) — **RELACIONADO CON P0-1, ver §11.**

7. **Estado minimizado** — web `gap: minimized?0:3` + `padding: minimized?'5px 0':'6px 0'` animados var(--dur-base) (`:231-232,522-523`); RN `styles.tile` fija `gap:3`, `paddingVertical:6` estáticos, solo colapsa el label (`:381-390`, 325-328 a 200ms) → cápsula minimizada ~4px más alta. **Fix:** animar `gap→0` y `paddingVertical 6→5` con el driver `mini`, usar DURATION.base 220ms. (P2)

8. **Cápsula en módulos (P1)** — web `moreRoutes` incluye módulos entitled y la cápsula se renderiza en toda ruta no-workout, así que "Más" queda encendido dentro de `/movimiento` y `/bodycomp` (`:117-129,466`); RN `MORE_ROUTES=['perfil','history']` (`:109`) y movement/bodycomp/exercise viven FUERA de `(tabs)` → la cápsula desaparece por completo dentro de un módulo. **Fix:** anidar en `(tabs)` con `href:null` + añadir a MORE_ROUTES, o documentar como stack inmersivo deliberado. **NO es archivo de esta unidad** (ver cambiosShell). (P1)

9. **Hide-on-scroll parcial** — web listener en window cubre TODAS las rutas incl. history/perfil (`:79-98`); RN requiere que cada pantalla alimente `useAlumnoScrollHandler`, solo home/nutricion/exercises/check-in lo hacen → history.tsx/perfil.tsx nunca minimizan. **Fix:** spread del handler en esos scrollables. **NO son archivos de esta unidad** (ver cambiosShell). (P2)

10. **Pressed feedback** — web `.eva-tabbar-press:active { scale(0.96) }` (globals.css:167-173); RN `TabTile` sin scale de pressed (`:330-357`). **Fix:** scale 0.96 animado onPressIn/onPressOut respetando reduced-motion. (P2)

---

## 11. P0-1 — Franja blanca detrás de la tab bar en dark (conducta web que la resuelve)

**Síntoma:** en dark aparece un slab claro (franja blanca) detrás/alrededor de la cápsula.

**Causa verificada (dos facetas):**

### (a) Velo residual apilado sobre el BlurView (`AlumnoMobileChrome.tsx:216-221`)
El comentario `:204-211` afirma que el fix histórico quitó el *backing* detrás del blur, pero **quedó un segundo velo ENCIMA**:
```
<BlurView intensity={isDark?40:60} tint={isDark?'dark':'light'} style={absoluteFill} />   // :216-220
<View pointerEvents="none" className="bg-surface-card/70" style={absoluteFill} />          // :221
```
Ese `bg-surface-card/70` cubre el 100% del blur con un 70% opaco. Sumado al `border border-subtle` (`:213`, en dark = blanco@7%) se lee como slab.

**Conducta web exacta que lo resuelve (`ClientNav.tsx:479-482`):** la web usa **UNA sola capa translúcida** que ES el fondo (`background: color-mix(surface-card 74%, transparent)`) con el blur DETRÁS vía `backdropFilter`. **Nunca apila un velo opaco sobre un material frosteado.** El BlurView RN ya cumple el rol del `backdropFilter` (frostea el contenido que scrollea por debajo). Por tanto el arreglo 1:1 es **eliminar el `<View bg-surface-card/70>` de `:221`** (o reducirlo a lo que corresponde a un único material translúcido, no una segunda capa opaca), dejando el BlurView como la superficie translúcida única — igual que la web tiene una única capa. El borde debe ser el hairline `text-strong 9%` (blanco@9% en dark) que la web usa (`:482`), no `border-subtle` opaco.

### (b) Edge-to-edge Android — fondo del sistema bajo la cápsula flotante
La cápsula flota con `bottom: insets.bottom + 16` (`AlumnoMobileChrome.tsx:202`); debajo de ella, hasta el borde físico inferior, debe verse el fondo de la app.

**Conducta web (`ClientNav.tsx:471-474`):** la cápsula es `position: fixed; bottom: calc(env(safe-area-inset-bottom)+16px)` sobre un `<main>` `min-h-dvh`, así que **el `surface-app` (dark navy en dark) pinta hasta el borde real del viewport** y no hay franja blanca — el fondo de página cubre todo bajo la cápsula.

**Estado RN (`_layout.tsx:50-57`):** el árbol se envuelve en `<View className="flex-1 bg-surface-app">` (`:51`) y el Tabs reserva `sceneStyle.paddingBottom = insets.bottom + ALUMNO_TABBAR_CLEARANCE` (`:56`, `ALUMNO_TABBAR_CLEARANCE=88` en `AlumnoMobileChrome.tsx:82`). Si `bg-surface-app` no pinta detrás de la navigation bar del sistema Android (sin edge-to-edge / nav bar no transparente), Android muestra su fondo blanco por defecto = franja blanca.

**Arreglo 1:1:** garantizar que `surface-app` pinte edge-to-edge hasta el borde físico inferior (root view detrás de la system nav bar; nav bar translúcida/transparente), replicando el web donde el body `surface-app` cubre todo el viewport bajo la cápsula fija. Verificar `insets.bottom` (`:202`) y que el clearance (88) no deje un hueco sin pintar.

**Criterio de aceptación P0-1:** en dark, detrás y alrededor de la cápsula solo se ve (i) el contenido frosteado a través del BlurView y (ii) `surface-app` (dark) hasta el borde inferior. Cero slab claro; el borde de la cápsula es un hairline blanco@≈9%, no un canto opaco.

---

## cambiosShell (cambios necesarios FUERA de los archivos de esta unidad)

Reportados, NO ejecutados (regla 9):

1. **`apps/mobile/app/alumno/(tabs)/history.tsx` y `perfil.tsx`** — spread de `useAlumnoScrollHandler()` en `onScroll` (`scrollEventThrottle={16}`) para paridad del hide-on-scroll (Hallazgo 9).
2. **`apps/mobile/app/alumno/movement.tsx`, `bodycomp.tsx`, `exercise/[id].tsx`** — decisión de arquitectura P1 (Hallazgo 8): anidar dentro de `(tabs)` con `href:null` + añadir movement/bodycomp a `MORE_ROUTES` para que la cápsula persista y "Más" quede activo, o documentar como stack inmersivo deliberado.
3. **`apps/mobile/components/Sheet.tsx`** — si se busca 1:1 con el sheet "Más" web (Hallazgo 5): variante `titleVariant="caption"` (11px uppercase muted), backdrop 0.4, radio 20px, altura por contenido (`enableDynamicSizing`). Decisión de gobernanza DS.
4. **`apps/mobile/lib/shadows.ts`** — opcional token `capsule` (offset 14, radius 36, opacity 0.24, tint #0D121C) para acercar la elevación de la cápsula a la web en claro (Hallazgo 6).

---

## Reglas idiomáticas RN aplicadas (paridad válida)

- `<Link>` web → `Pressable` + `navigation.emit('tabPress')`/`navigate` (`AlumnoMobileChrome.tsx:179-185`) — preserva navegación y evento tab.
- `<AnimatePresence>` + framer-motion sheet → `Sheet` DS (BottomSheet) (`:266`) — preserva contenido y acciones.
- `backdropFilter` blur → `BlurView` expo-blur (`:216`) — mismo material frosteado.
- Botón "Más" toggle web → RN **abre** (nunca togglea, `:259`), cierre gobernado por Sheet (backdrop/swipe/X) + cambio de ruta — desviación documentada `:249-252` (2º tap togglaba y se leía como "abre y cierra"). Preserva lo que el usuario ve/puede hacer.
- `window` scroll → store externo alimentado por pantallas (`lib/alumno-chrome-scroll.ts`).
