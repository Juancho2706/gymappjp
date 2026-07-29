---
status: reference
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# A1 — Auditoria tecnica del estado actual de la familia de entrada (splash → walkthrough → selector)

Auditoria de SOLO LECTURA del codigo de `apps/mobile` que compone la familia publica de entrada: splash nativo, walkthrough de 3 slides y selector de rol "Soy alumno / Soy coach". Objetivo: fijar la linea base real antes del rediseño "dark premium continuo" elegido por el owner — que existe hoy, que esta roto y por que, que tokens y assets hay disponibles, y que superficies toca un redesign separando lo OTA-able de lo que exige binario nuevo.

No se edito ningun archivo. Todas las afirmaciones citan `archivo:linea`.

## Resumen ejecutivo

- El defecto (a) del boton del walkthrough (label arriba-izquierda + flecha debajo, pese a `flexDirection: 'row'`) tiene causa raiz CONFIRMADA por codigo y no tiene nada que ver con el ancho del SVG ni con `fontScale`: NativeWind v4 / `react-native-css-interop@0.2.4` **descarta silenciosamente el prop `style` cuando es una funcion** (`style={({pressed}) => ...}`) en cualquier componente que ademas lleve `className`. La funcion se recolecta como si fuera un objeto de estilo y se aplasta con un spread (`{...declaration}` sobre una funcion = `{}`) en `native-interop.ts:967-971`. El boton pierde `flexDirection`, `alignItems`, `justifyContent`, `gap`, `minHeight`, padding y `borderRadius`, y cae al default de RN (columna, `alignItems: 'stretch'`). Solo sobrevive `bg-cta-fill`, que viene por `className` — exactamente lo que se ve.
- El defecto (b) del selector "full-bleed azul saturado" tambien tiene causa raiz CONFIRMADA por codigo y **NO es un artefacto del emulador ni de Skia**: `react-native-svg` construye los stops de gradiente tomando el alpha **solo** de la prop `stopOpacity`, enmascarando el alpha que venga dentro de `stopColor` (`extractGradient.ts:83-84`: `(color & 0x00ffffff) | (alpha << 24)`, con `alpha = 1` por defecto). `AmbientBrandGlow.tsx:74-86` declara sus 6 stops con `rgba(...)` dentro de `stopColor` y **sin** `stopOpacity` → los 6 stops resuelven a **#007AFF OPACO**, el radial degenera en relleno solido y los 3 `<Rect width="100%" height="100%">` (`AmbientBrandGlow.tsx:89-91`) pintan la pantalla completa de azul saturado. Es determinista, multiplataforma y afecta dispositivos reales.
- La hipotesis "blur Skia degradado en swiftshader" queda REFUTADA por aritmetica y por codigo: los alphas codificados (0.07-0.14 en Skia, 0.012-0.1 en el glow) componen como maximo ~0.17-0.28 de alpha total sobre `#FBFCFD`, lo que da un azul palido (~`#D0E6FD`), jamas saturado; el parser de color de Skia si respeta `rgba()` con alpha flotante (`CSSColorParser.cpp:130-145`) y el `<Blur>` usa `mode="decal"` por defecto (sin smear de bordes).
- Corroboracion cruzada decisiva: el walkthrough NO monta `AmbientBrandGlow` (`Walkthrough.tsx:127` no tiene fondos) y por eso no salio azul; el selector SI lo monta (`index.tsx:107`). Y el selector tiene tambien la variante del defecto (a) en la card de coach (`index.tsx:180-188`). Los dos defectos aparecen exactamente en las dos pantallas cuyo codigo contiene sus respectivos disparadores.
- Ambos defectos son **OTA-ables**: son bugs de JS, no de configuracion nativa.
- El splash nativo esta EFECTIVAMENTE EN BLANCO: `app.json:111-118` apunta a `./assets/eva-mark-filled.png`, que es la marca NEGRA (RGB medio de pixeles opacos = 27,27,27), sobre `backgroundColor: "#07080C"` (casi negro), tanto en el bloque claro como en el `dark`. La variante luminosa existe y esta en el repo sin usar: `assets/eva-icon.png` (RGB medio 248,248,248). Arreglarlo exige BINARIO NUEVO.
- Ademas hay un desfase de fondo entre el splash (`#07080C`) y el token dark `--color-surface-app` (`#0A0D12`, `global.css:193`): en un rediseño "sin flash blanco" esa costura de 3-4 puntos de luminancia se nota. Reconciliar implica tocar `app.json` (binario) o el token (OTA).
- El walkthrough monta un doble fondo Skia en la fase `checking`: `index.tsx:87` renderiza `<AppBackground/>` y `EvaLoaderScreen` monta OTRO `<AppBackground/>` internamente (`EvaLoader.tsx:98-101`) → dos Canvas de pantalla completa con blur gaussiano de 80 apilados en el peor momento posible (cold start). Costo GPU duplicado, sin beneficio visual.
- Los tokens semanticos DARK existen y son completos para superficie/texto/borde/cta, pero tienen tres trampas que el rediseño DEBE respetar: los `-100` de status/marca en dark son canales crudos pensados para consumirse con modificador `/18`../20` (usarlos "pelados" da color SOLIDO), los `border-*` en dark traen el alpha horneado (no admiten modificador), y falta todo lo que un dark premium suele necesitar: superficie elevada translucida, tokens de gradiente/scrim y glows scheme-aware.
- Las 3 ilustraciones del walkthrough son webp con canal alfa real (chunk `ALPH` presente), 640x872, vector plano con paleta verde-azulada y contornos oscuros. Funcionan sobre fondo claro; sobre dark pierden silueta. Sirven en dark SOLO dentro de una tarjeta clara interna; no sirven "sueltas" sobre negro.
- La marca EVA existe en dos variantes del MISMO trazo: `eva-mark-filled.png` (negra) y `eva-icon.png` (blanca). Para dark premium la correcta es `eva-icon.png` en todas sus apariciones (splash incluido).

---

## 1. Mapa REAL del flujo de entrada, con gates

### 1.1 Cadena de arranque

1. **Splash nativo.** `_layout.tsx:50` llama `SplashScreen.preventAutoHideAsync()` a nivel de modulo. La imagen/fondo la define el plugin `expo-splash-screen` en `app.json:108-120`.
2. **Lectura de branding almacenado.** `RootLayout` (`_layout.tsx:208-215`) lee `loadStoredBranding()` (clave AsyncStorage `eva_coach_branding`, `lib/branding.ts:53`) y devuelve `null` mientras tanto — no renderiza NADA; el splash nativo sigue tapando.
3. **Carga de fuentes.** `RootLayoutWithFonts` (`_layout.tsx:218-248`) carga Archivo + Hanken + JetBrains + el mapa de fuente white-label (`brandDisplayFontMap`). Otra vez `return null` hasta que terminen (`_layout.tsx:248`).
4. **Primer frame React.** `GestureHandlerRootView onLayout={handleRootLayout}` (`_layout.tsx:251`) dispara `SplashScreen.hideAsync()` una sola vez (`_layout.tsx:238-246`). No hay splash JS intermedio ni timer artificial.
5. **Ruta `/` = `app/index.tsx`.** Es el unico punto donde se decide walkthrough vs selector.

Nota para "sin flash blanco": ni `GestureHandlerRootView` (`_layout.tsx:251`) ni el `<View>` de `ThemeProvider` (`ThemeContext.tsx:95`) ni el `<View>` de `ForceLightTheme` (`ThemeContext.tsx:157`) declaran `backgroundColor`. Entre `hideAsync()` y el primer pixel pintado por la pantalla, lo que se ve es el `windowBackground` de Android / el fondo de la ventana iOS.

### 1.2 Gates de `app/index.tsx`

El efecto de `index.tsx:41-82` evalua en este orden estricto (primer match gana, y `routed.current` evita dobles navegaciones):

| # | Gate | Codigo | Destino | Ve walkthrough? |
|---|---|---|---|---|
| 1 | Sesion activa en Supabase | `index.tsx:46-54` | `/coach/home` o `/alumno/home` segun `getCoachProfile()` | NO |
| 2 | `?pick=1` en la URL | `index.tsx:57-60` | queda en `phase='selector'` | NO |
| 3 | Branding cacheado con `coachId` | `index.tsx:62-69` | `setBranding(...)` + `router.replace('/(auth)/login?role=alumno&switch=1')` | NO |
| 4 | `hasSeenWalkthrough()` | `index.tsx:72-73` | `selector` si ya lo vio, `walkthrough` si no | SI (solo si no lo vio) |
| 5 | Cualquier throw | `index.tsx:74-76` | `selector` (fail-open) | NO |

Detalles relevantes:

- El flag del walkthrough es `walkthrough_seen` en AsyncStorage (`lib/walkthrough.ts:13`), fail-open: si el storage falla, `hasSeenWalkthrough()` devuelve `true` (`lib/walkthrough.ts:16-24`) para no atrapar al usuario. Se persiste al saltar o al terminar (`Walkthrough.tsx:104-107` → `markWalkthroughSeen()`).
- El gate 3 es el que hace que un alumno que ya entro alguna vez con su coach **nunca** vuelva a ver el selector ni el walkthrough: va directo al login alumno brandeado. El `switch=1` habilita el escape de vuelta (`login.tsx:630` → `router.replace('/?pick=1')`), que reentra por el gate 2.
- El gate 2 (`pick=1`) es por lo tanto el unico camino de vuelta al selector una vez que hay branding cacheado.

### 1.3 Rutas que NUNCA ven el walkthrough

- **Deep links `/c/<slug>` e `/invite/<code>`.** `app/+native-intent.ts:13-17` los reescribe a `/alumno/codigo?identifier=...&auto=1` ANTES de que el router monte nada. La ruta `/` no se monta jamas → el walkthrough queda naturalmente puenteado. Los `intentFilters` de Android para esos prefijos estan en `app.json:51-81`; el equivalente iOS son los `associatedDomains` de `app.json:16`.
- **Deep link `/reset-password`** (`app.json:86-95`) y el manejo de hash de recuperacion en `_layout.tsx:90-102` → `/(auth)/reset-password`.
- **Retorno con sesion viva** (gate 1) y **expulsion desde ruta protegida** (`_layout.tsx:163` hace `router.replace('/')`, pero ahi ya no hay sesion y el flag `walkthrough_seen` normalmente ya esta puesto → cae en selector).
- **Tap en notificacion** (`_layout.tsx:108-111`) navega directo a `data.screen`.

### 1.4 Composicion visual por fase

| Fase | Render | Fondos montados |
|---|---|---|
| `checking` | `index.tsx:84-93` | `<AppBackground/>` (`index.tsx:87`) **+** el `<AppBackground/>` interno de `EvaLoaderScreen` (`EvaLoader.tsx:99`) = DOS canvas Skia |
| `walkthrough` | `index.tsx:95-97` → `Walkthrough` | NINGUNO. `Walkthrough.tsx:127` es solo `className="bg-surface-app"` |
| `selector` | `index.tsx:104-211` | `<AppBackground/>` (`index.tsx:106`) + `<AmbientBrandGlow/>` (`index.tsx:107`) |

Todo el arbol va envuelto en `ForceLightTheme branded={false}` (`index.tsx:27`), incluido el walkthrough.

---

## 2. Diagnostico root-cause de los dos defectos observados

### 2.1 Defecto (a): el boton primario del walkthrough se rompe en columna

**Sintoma.** En `Walkthrough.tsx:307-322` el CTA declara `styles.primaryAction` con `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'center'`, `gap: 10`, `minHeight: 56`, `paddingHorizontal: 22`, `paddingVertical: 15` (`Walkthrough.tsx:474-482`). En el emulador el label sale arriba a la izquierda y `ArrowRight` debajo.

**Causa raiz (confirmada por codigo).** El elemento combina `className="bg-cta-fill"` (`Walkthrough.tsx:311`) con `style` como FUNCION (`Walkthrough.tsx:313-316`). En `react-native-css-interop@0.2.4`:

1. `cssInterop(Pressable, { className: "style" })` (`runtime/components.ts:25`) genera un config con `source: 'className'`, `target: ['style']` y — por `runtime/config.ts:34-36` — `inlineProp: 'style'`.
2. `getDeclarations` recolecta el prop inline sin discriminar tipo: `if (config.inlineProp && refs.props?.[config.inlineProp]) collectInlineRules(...)` (`native-interop.ts:406-414`).
3. `collectInlineRules` (`native-interop.ts:1072-1101`) hace `Array.isArray(target)` → falso para una funcion; entra al `else if (target)` (una funcion es truthy), `getOpaqueStyles` la devuelve tal cual (`styles.ts:88-92`), `StyleRuleSetSymbol in style` es falso y la **funcion se empuja como si fuera una declaracion de estilo**.
4. `applyRules` procesa esa declaracion por la rama final: `assignToTarget(props, { ...declaration }, state.config, { objectMergeStyle: "assign" })` (`native-interop.ts:967-971`). **`{ ...unaFuncion }` es `{}`** (las props de una funcion — `name`, `length`, `prototype` — no son enumerables).
5. `renderComponent` sobreescribe el prop original: `props = { ...props, ...possiblyAnimatedProps }` (`render-component.tsx:108-110`), donde `possiblyAnimatedProps.style` es el objeto derivado. La funcion nunca llega a `Pressable`.

Resultado: el `Pressable` recibe unicamente `{ backgroundColor: <cta-fill> }`. Sin `flexDirection`, RN usa su default `column` con `alignItems: 'stretch'` → texto arriba (alineado a la izquierda porque el `<Text>` ocupa el ancho) y el SVG debajo. Sin `borderRadius`, sin `minHeight`, sin padding.

**Hipotesis descartadas.** El ancho del SVG no interviene (`ArrowRight size={20}`, `Walkthrough.tsx:321`, es un nodo de 20x20 sin `flex`). `fontScale` tampoco: `textIsLarge` (`Walkthrough.tsx:89`) solo ajusta `paddingTop` del bloque de copy (`Walkthrough.tsx:272`, `428-430`), no toca el footer. El `gap: 10` es soportado por Yoga en RN 0.81.

**Radio de impacto en el repo.** Elementos que combinan `className` + `style` funcion:

| Archivo:linea | className lleva layout? | Severidad |
|---|---|---|
| `Walkthrough.tsx:311-316` | NO (`bg-cta-fill` solo) | ROTO — todo el layout estaba en la funcion |
| `index.tsx:180-188` (card "Soy coach") | NO (`bg-surface-card border border-default`) | ROTO — pierde `flexDirection`, `minHeight: 92`, padding, `gap`, `borderRadius` |
| `alumno/home/WeightQuickLog.tsx:79-80` | Parcial (`rounded-control bg-cta-fill`) | Degradado — pierde `height: 44`, `minWidth`, `paddingHorizontal`, centrado |
| `GoogleSignInButton.tsx:61-62` | SI (`flex-row items-center justify-center`) | Cosmetico — solo pierde padding/opacity de press |
| `alumno/workout/TypedTargetGrid.tsx:162-167` | SI (layout completo en className) | Cosmetico — solo pierde el `scale` de press |

Por eso el bug paso inadvertido: los unicos dos casos donde el layout vivia integramente en la funcion son justamente los dos de la familia de entrada.

**Nota importante.** La card "Soy alumno" (`index.tsx:136-151`) usa `style` funcion SIN `className`. Segun el mismo camino de codigo (el `inlineProp` se recolecta igual, haya o no `className`), tambien deberia perder su estilo, incluido `backgroundColor: theme.primary`. Es decir: la card de alumno queda TRANSPARENTE, no azul. Esto refuerza que el azul full-bleed del selector no viene de las cards sino del fondo (§2.2).

**Formas de arreglo (todas OTA).** (i) mover el layout a `className` y dejar en la funcion solo lo que depende de `pressed`; (ii) reemplazar la funcion por un array estatico y mover el feedback de press a estado local (`onPressIn`/`onPressOut`) o a un `MotiView`/`Animated` envolvente; (iii) quitar el `className` del elemento que necesita `style` funcion y mover la clase a un wrapper. Cualquiera que sea la elegida, conviene dejarla escrita como regla en `apps/mobile/AGENTS.md`, porque es una trampa sistemica de la version de NativeWind instalada (`nativewind@4.2.4` / `react-native-css-interop@0.2.4`, `package.json:79,84`).

### 2.2 Defecto (b): el selector se pinta full-bleed azul saturado

**Sintoma.** El codigo pinta `bg-surface-app` (paper `#FBFCFD` bajo `ForceLightTheme`) mas dos capas decorativas de baja opacidad, y sin embargo la pantalla sale azul saturado de borde a borde.

**Prueba aritmetica de que NO puede ser el diseño.** Bajo `ForceLightTheme` (`index.tsx:27`) el tema resuelto es claro y `theme.primary` deriva de `DEFAULT_BRAND = '#007AFF'` (`lib/theme.ts:258`, `resolveEffectiveCoachBrandTheme` sin branding → `lib/theme.ts:359-366`). Las capas declaradas son:

- `AppBackground.tsx:30-31`: blob de marca `rgba(0,122,255,0.08)` + blob celeste `rgba(56,189,248,0.07)` (modo claro).
- `AmbientBrandGlow.tsx:60-62`: picos `0.07` / `0.03` / `0.012`.

Composicion "over" en el punto de maxima superposicion (arriba-centro): `1 - (0.92 x 0.93 x 0.97) ~= 0.17` de alpha efectiva de `#007AFF` sobre `#FBFCFD` → aproximadamente `#D0E6FD`. Incluso duplicando el `AppBackground` (caso de la fase `checking`) se llega a ~0.28 → sigue siendo un azul palido. **Ningun apilamiento de los valores codificados produce saturacion.** Por lo tanto el defecto es de renderizado, no de tokens.

**Causa raiz (confirmada por codigo): react-native-svg descarta el alpha de `stopColor`.**

`node_modules/react-native-svg/src/lib/extract/extractGradient.ts:70-85`:

```js
stopColor = (style && style.stopColor) || '#000',
stopOpacity = style && style.stopOpacity,
...
const color = stopColor && processColor(stopColor);
...
const alpha = Math.round(extractOpacity(stopOpacity) * 255);
stops.push([offsetNumber, (color & 0x00ffffff) | (alpha << 24)]);
```

El byte de alpha del color parseado se enmascara con `& 0x00ffffff` y se reemplaza por `alpha << 24`, donde `alpha` sale EXCLUSIVAMENTE de la prop `stopOpacity`. Y `extractOpacity(undefined)` devuelve `1` (`extractOpacity.ts:3-8`: `+undefined` = `NaN` → `isNaN` → `return 1`).

`AmbientBrandGlow.tsx:73-87` declara los 6 stops asi:

```jsx
<Stop offset="0"   stopColor={hexToRgba(tint, aPrimary)} />
<Stop offset="0.7" stopColor={hexToRgba(tint, 0)} />
```

Ningun `Stop` pasa `stopOpacity`. Consecuencia: los seis stops resuelven a **`#007AFF` con alpha 255**. Un radial cuyos dos stops son el mismo color opaco es un relleno solido. Y esos gradientes rellenan tres rectangulos de pantalla completa: `AmbientBrandGlow.tsx:89-91` (`<Rect width="100%" height="100%" ... />` x3), dentro de un `<View pointerEvents="none" style={StyleSheet.absoluteFill}>` (`AmbientBrandGlow.tsx:69`). Resultado: **azul de marca opaco cubriendo toda la pantalla**, por encima del `AppBackground` y por debajo del contenido (que se monta despues, `index.tsx:108`).

`RadialGradient` pasa efectivamente por ese extractor: `react-native-svg/src/elements/RadialGradient.tsx:31-51` renderiza `<RNSVGRadialGradient {...extractGradient(props, this)} />`.

**Por que NO es el emulador ni Skia (hipotesis descartadas con evidencia):**

- *"El blur de Skia degradado en swiftshader renderiza los circulos casi solidos."* El `<Blur>` de RN Skia por defecto usa `mode="decal"` (`@shopify/react-native-skia/src/renderer/components/imageFilters/Blur.tsx:6`), que hace caer los bordes a transparente: no puede "solidificar" ni smearear. Ademas un fallo de `saveLayer` en Skia produce ausencia de dibujo, no saturacion.
- *"El parser de color de Skia pierde el alpha flotante."* Falso: `cpp/api/third_party/CSSColorParser.cpp:130-145` parsea `rgba(r,g,b,a)` y aplica `parse_css_float` al cuarto parametro; el clamp es a [0,1] (`:11-13`). `AppBackground.tsx:9-16` genera exactamente ese formato con 4 parametros.
- *"Es solo el emulador."* `extractGradient.ts` es JavaScript puro compartido por iOS y Android, con y sin Fabric. **El defecto se reproduce en dispositivos reales**, incluidos los de gama alta.

**Radio de impacto (mayor que la familia de entrada).** `AmbientBrandGlow` esta montado en cuatro superficies: `index.tsx:107` (selector), `coach/settings/brand.tsx:416`, `components/coach/programs/ProgramLibraryHero.tsx:48` y `components/alumno/nutrition/NutritionHeader.tsx:31`. En las tres ultimas rellena el contenedor del hero (no la pantalla), por lo que probablemente se leyo como "hero brandeado a proposito" y nunca se reporto. Ademas `components/GlassCard.tsx:57-58` repite el patron en su `cornerGlow`: los dos primeros stops usan alpha en `stopColor` (→ opacos) y solo el tercero usa `stopOpacity={0}` (`GlassCard.tsx:59`) — es decir, el propio autor conocia la prop correcta en un stop y no en los otros dos. Verificar visualmente esas cuatro superficies antes de cerrar el fix.

**Fix (OTA, trivial).** Pasar el alpha por `stopOpacity` y dejar `stopColor` como color solido:

```jsx
<Stop offset="0"   stopColor={tint} stopOpacity={aPrimary} />
<Stop offset="0.7" stopColor={tint} stopOpacity={0} />
```

Aplicar lo mismo a `GlassCard.tsx:57-58`. Conviene ademas dejar la regla escrita: en `react-native-svg`, el alpha de un `<Stop>` va SIEMPRE en `stopOpacity`; el alpha dentro de `stopColor` se descarta. (En `fill`/`stroke` si se respeta el alpha del color — `extractBrush.ts:33-37` conserva el ARGB completo — por eso la grilla de `AppBackground.tsx:29,46` si se ve tenue.)

### 2.3 Hallazgos colaterales encontrados en el mismo recorrido

1. **Doble `AppBackground` en la fase `checking`** (`index.tsx:87` + `EvaLoader.tsx:99`): dos `<Canvas>` de Skia a pantalla completa con `Blur blur={80}` sobre un `Group` con `layer` (`AppBackground.tsx:36-41`), apilados durante el cold start. Es la operacion GPU mas cara de todo el arranque, duplicada y sin beneficio visual. En gama baja real esto si es un riesgo de jank/consumo (no de saturacion).
2. **`AppBackground` lee `mode` en vez de `resolvedScheme`** (`AppBackground.tsx:27-28`: `const { theme, mode } = useTheme()` … `const isDark = mode !== 'light'`). Con la preferencia por defecto `'system'` (`ThemeContext.tsx:43`) en un dispositivo en modo CLARO, `isDark` da `true` y se usan los alphas de dark. `AmbientBrandGlow.tsx:48-50` si usa `resolvedScheme`. Inconsistencia real; hoy no muerde en la entrada porque `ForceLightTheme` fija `mode: 'light'` (`ThemeContext.tsx:151`), pero mordera en cuanto la familia pase a dark.
3. **Splash invisible** (ver §4.2 y §5.1).
4. **`AppBackground` no tiene ningun fallback** por plataforma, GPU ni `reduced motion`: es Skia incondicional en toda la app.

---

## 3. Inventario de tokens semanticos DARK disponibles y gaps

Fuente de verdad: `docs/architecture/design-system/TOKENS.md` (contrato normativo) e implementacion en `apps/mobile/global.css:156-238` + `apps/mobile/tailwind.config.js:92-130`.

### 3.1 Lo que existe hoy en dark (utilidad → valor)

**Superficies** (`global.css:193-198`, utilidades en `tailwind.config.js:92-99`):

| Utilidad | Valor dark | Nota |
|---|---|---|
| `bg-surface-app` | `#0A0D12` | fondo raiz |
| `bg-surface-card` | `#161B22` | tarjeta |
| `bg-surface-sunken` | `#1F262F` | hundido / input |
| `bg-surface-inverse` | `#2A323D` | contrato dice `#16273C` — DRIFT |
| `bg-surface-inverse-2` | `#232A33` | contrato dice `#0E1722` — DRIFT |
| `bg-surface-overlay` | `0 0 0`, usar `/62` | scrim de modal |

**Texto** (`global.css:200-207`, utilidades en `tailwind.config.js:102-114`): `text-strong` `#F4F6F8`, `text-body` `#CDD3DB`, `text-muted` `#98A2B0`, `text-subtle` `#86919E`, `text-link` sport-400, `text-on-sport` blanco, `text-on-dark` `#F4F6F8`, `text-on-dark-muted` `#939DAB`, `text-on-success` / `-warning` / `-ember` (ink sobre rellenos saturados).

**Bordes** (`global.css:209-214`, `tailwind.config.js:125-130`): `border-subtle` `rgba(255,255,255,0.07)`, `border-default` `rgba(255,255,255,0.13)`, `border-strong` `rgba(255,255,255,0.22)`, `border-inverse` (canal, se consume con modificador: `border-inverse/10`).

**CTA / accion / marca** (`global.css:219-222`, `tailwind.config.js:72-82`): `bg-cta-fill` (`#1A6BE6` por defecto, white-label lo pisa via `brandVars` en `lib/theme.ts:566`), `bg-cta-danger` `#D31E45`, `action-primary` en dark = `cta-fill` (`global.css:220`), `brand`, `brand-strong` (`#7FB0FF` en dark), `accent-training/-nutrition/-recovery`, `focus-ring`, `track` (`255 255 255`, usar `/[0.10]`).

**Rampas sport / ember / success en dark** (`global.css:160-189`): los pasos 600/700 se ACLARAN para seguir legibles (sport-600 `#7FB0FF`, sport-700 `#A9CBFF`, ember-600 `#FF9D7E`, ember-700 `#FFB79E`, success-600 `#4FD9A0`, success-700 `#6FE3B4`, aqua-600/700 `#6FD3EA`); los `-100` pasan a ser CANALES de la marca/status para consumirse con alpha.

**Neutros que flipean** (`global.css:161-165`): `ink-100 #232A33`, `ink-200 #313A45`, `ink-300 #414C5A`, `ink-700 #C2C9D2`, `ink-800 #DDE2E8`.

**Elevacion** (`lib/shadows.ts:40-49`): escala `SHADOWS.dark.xs..xl` re-tuneada (opacidades 0.28-0.50) + `sheet`. **Glows** (`lib/shadows.ts:65-69`): `GLOWS.sport/ember/aqua`, hue fijo, NO scheme-aware ni white-label.

**Radios y espaciado** (`tailwind.config.js:132-153`, espejo en `lib/theme.ts:149-161`): `rounded-card` 20, `rounded-control` 14, `rounded-sheet` 28, `rounded-pill`; grilla de 4px `space-0..13`; `control-sm/md/lg` 36/48/56; `hit-min` 44.

**Tipografia** (`lib/typography.ts:27-45` y `105-116`): familias Archivo (display 600/700/800/900), Hanken (400-800), JetBrains Mono (400-700); roles `display/h1/h2/h3/title/body/label/caption/eyebrow/mono` con tamaño, interlineado y tracking ya resueltos a puntos RN.

### 3.2 Trampas del sistema dark (obligatorio respetarlas en el rediseño)

1. **Los `-100` en dark NO son colores claros: son canales de marca/status.** `global.css:182-189` los redefine a los canales crudos con el comentario "apply /18..20". Una clase "pelada" como `bg-sport-100` compila `rgb(var(--color-sport-100) / 1)` = **azul SOLIDO** en dark. Hoy la entrada usa exactamente ese patron pelado en `Walkthrough.tsx:222` (`bg-ember-100` del acento de esquina), `Walkthrough.tsx:36` + `:203-221` (los halos `bg-sport-100` / `bg-ember-100` / `bg-success-100`) y `index.tsx:190` (`bg-sport-100` del icono de coach). En claro se ven bien; al pasar a dark se convierten en manchas saturadas.
2. **Los `border-*` en dark traen el alpha horneado en el token** (`global.css:212-214`) y por eso `tailwind.config.js:126-128` los resuelve con `var()` directo, sin `<alpha-value>`. Corolario documentado en el propio config (`tailwind.config.js:117-124`): usar la clase pelada, NUNCA `border-subtle/[0.5]`.
3. **`ForceLightTheme` anula el dark en toda la familia de entrada** re-declarando localmente los vars a sus valores claros (`ThemeContext.tsx:145-149` con `LIGHT_SCHEME_VARS` de `lib/theme.ts:610-679`). Cualquier clase `dark:` queda inerte dentro de ese subarbol.
4. **Doble fuente de color.** `lib/theme.ts` es un shim imperativo explicitamente marcado como deprecado (`lib/theme.ts:9-28`) para props que no aceptan className (iconos lucide, `shadowColor`, libs nativas). Divergencias reales detectadas: `text-muted` dark es `#98A2B0` en `global.css:203` pero `DS.textMutedDark = '#8A95A3'` en `lib/theme.ts:138` (y el contrato `TOKENS.md:58` dice `#8A95A3`). Un icono y su label pueden no coincidir.

### 3.3 Gaps para una entrada "dark premium"

| Gap | Por que importa | Costo |
|---|---|---|
| No hay token de **superficie elevada translucida** (tipo `rgba(255,255,255,0.04-0.06)`) | El dark premium se construye apilando velos translucidos, no colores solidos. Hoy solo hay 3 superficies solidas (`#0A0D12`/`#161B22`/`#1F262F`) | agregar var + utilidad; OTA |
| No hay tokens de **gradiente / scrim / vignette** | La direccion "atmosfera oscura continua" pide degradados verticales y viñetas; hoy se improvisan a mano (Skia o SVG) en cada pantalla | OTA (`expo-linear-gradient@15.0.8` ya esta instalado, `package.json:66` — sin dep nueva) |
| Los **glows no son scheme-aware ni white-label** (`lib/shadows.ts:65-69`) | En dark el glow es el principal recurso de jerarquia; hoy es hue fijo `#2680FF` aunque el coach tenga otra marca | OTA |
| El **fondo del splash `#07080C`** (`app.json:114`) no coincide con `--color-surface-app` dark `#0A0D12` (`global.css:193`) | Es exactamente la costura que el rediseño quiere eliminar | reconciliar: binario (cambiar `app.json`) u OTA (mover el token) |
| No hay **token de "on-brand" para superficies saturadas en dark** mas alla de `text-on-sport` | Un CTA de marca sobre fondo oscuro necesita su par de foreground documentado | OTA |
| `surface-inverse` / `surface-inverse-2` y `text-muted` **divergen del contrato** (`TOKENS.md:57-58` vs `global.css:196-197,203`) | El rediseño no deberia construir encima de un drift no resuelto | OTA + actualizar `TOKENS.md` |

---

## 4. Inventario de assets

### 4.1 Ilustraciones del walkthrough

Ubicacion `apps/mobile/assets/onboarding/`, referenciadas en `Walkthrough.tsx:40-42`, con precarga via `Asset.loadAsync(LOCAL_ASSETS)` (`Walkthrough.tsx:93-98`).

| Archivo | Dimensiones | Alfa | Peso @1x / @2x |
|---|---|---|---|
| `coach-plan.webp` | 640x872 | SI (chunk `ALPH` en el header VP8X) | 74 KB / 140 KB |
| `alumno-scan.webp` | 640x872 | SI | 62 KB / 121 KB |
| `progreso.webp` | 640x872 | SI | 78 KB / 148 KB |
| `stickers/logro.webp` | 160x160 | SI | 7 KB / 15 KB |

**Estilo y sesgo de luminancia.** Las tres son ilustraciones vectoriales planas de la misma serie: una figura femenina con ropa deportiva verde-azulada, contornos gruesos oscuros (verde petroleo casi negro), paleta dominante verde/teal con acentos coral y amarillo. Fondo REALMENTE transparente (no blanco horneado), lo que da margen de maniobra.

**Diagnostico para dark.** Tienen sesgo claro por dos motivos independientes:

1. **Contorno oscuro.** La legibilidad de la ilustracion depende de un outline verde-petroleo casi negro. Sobre `#0A0D12` o `#161B22` la silueta se pierde: la figura queda como manchas de color flotando sin borde.
2. **Paleta ajena a la marca.** Verde/teal + coral no pertenece a la rampa EVA (sport azul / ember naranja / aqua). En una atmosfera dark premium con acento de marca, el verde compite en vez de acompañar.

**Veredicto.** Sirven en dark **solo** con el tratamiento que ya usa el codigo hoy: dentro de una tarjeta CLARA interna. `Walkthrough.tsx:202-210` monta el `stage` como `bg-surface-card border border-subtle` — en dark ese `surface-card` es `#161B22` y deja de funcionar como base clara. Opciones, de menor a mayor costo:

- **A (barata, OTA).** Fijar el `stage` a una superficie clara explicita (no al token `surface-card`) y tratarlo como "lamina" iluminada dentro de la atmosfera oscura: tarjeta clara con radio, borde tenue y glow de marca detras. Conserva los assets tal cual. Riesgo: rompe la continuidad "dark premium" (una caja blanca grande en medio de una pantalla negra).
- **B (media, OTA).** Mantener el asset pero cambiar el escenario: halo/glow de marca detras + viñeta oscura alrededor, sin caja clara, aceptando que la figura pierda contorno y se lea como silueta de color. Requiere probar en dispositivo; probablemente insuficiente.
- **C (correcta para la direccion elegida).** **Reemplazo de assets**: nueva serie con contorno claro (o sin contorno, solo relleno luminoso) y paleta reasignada a la rampa EVA. Es la unica que da un dark premium continuo real. Sigue siendo OTA (son `require()` de webp locales), pero exige produccion de diseño.
- **Alternativa D.** Eliminar las ilustraciones del recorrido. Vale la pena registrarla porque el referente `r1-onboarding-fitness.md` documenta que el carrusel pasivo de 3 slides es el patron con peor evidencia de retencion; si la decision de producto es acortarlo, el problema de assets desaparece.

**`logro.webp`** (`Walkthrough.tsx:44`, usado como badge en la slide 3, `Walkthrough.tsx:248-269`): trofeo dorado 3D estilo emoji, 160x160, con alfa. El dorado sobre oscuro funciona bien y no necesita tratamiento — es el unico de los cuatro que ya es "dark-safe".

**Otros assets disponibles y reutilizables** (mismo estilo/serie): `assets/stickers/` (10 stickers: `a-moverse`, `comida-check`, `descanso`, `despegue`, `fist-bump`, `fuerza`, `hidratate`, `logro`), `assets/badges/` (12 badges de logro) y `assets/illustrations/` (8 empty-states: `catalogo-vacio`, `dia-completado`, `error-amable`, `historial-vacio`, `sin-alumnos`, `sin-conexion`, `sin-plan`, `sin-resultados`). Todos webp con par `@2x`.

### 4.2 Marcas EVA

| Archivo | Dimensiones | Cobertura opaca | Color medio de los pixeles opacos | Uso actual |
|---|---|---|---|---|
| `assets/eva-mark-filled.png` | 585x526 | 14.6 % | **(27, 27, 27) = NEGRO** | splash nativo (`app.json:111,116`) |
| `assets/eva-icon.png` | 585x526 | 14.6 % | **(248, 248, 248) = BLANCO** | sin uso en `apps/mobile` |
| `assets/adaptive-icon.png` | 1024x1024 | 5.8 % | (251, 251, 251) blanco | foreground adaptive Android sobre `#000000` (`app.json:34-37`) |
| `assets/icon.png` / `icon-ios.png` | 1024x1024 | 100 % (opaco) | (20, 20, 20) fondo oscuro | icono de app (`app.json:10,12`) |
| `assets/splash-icon.png` | 1024x1024 | 10.4 % | (215, 215, 220) gris claro | placeholder de Expo (grilla + circulos), NO referenciado |
| `assets/notification-icon.png` | 1024x1024 | 100 % | (241, 241, 243) | notificaciones |

Ambas variantes de marca son el MISMO trazo (misma dimension y misma cobertura de 14.6 %): un corredor estilizado con el brazo en alto. `eva-mark-filled.png` es la version negativa (negra) para fondos claros; `eva-icon.png` es la positiva luminosa para fondos oscuros.

**Hallazgo P1.** El plugin de splash apunta a la version NEGRA sobre `#07080C` en AMBOS bloques (claro y `dark`), `app.json:111-118`. Contraste efectivo ~1:1 → **el splash actual es una pantalla casi negra vacia**, en las dos apariencias del sistema. La variante correcta para dark premium ya esta en el repo y es `assets/eva-icon.png`. Requiere binario nuevo.

En el resto del repo tambien existen `apps/web/public/LOGOS/eva-icon-white.png`, `apps/web/public/LOGOS/eva-icon.png` y `docs/design-source/assets/eva-logo-white.png` / `eva-logo-ink.png`, utiles si se quiere un lockup con wordmark en lugar del simbolo suelto.

**Wordmark tipografico.** Hoy "EVA" se compone con texto, no con imagen: `index.tsx:121` y `Walkthrough.tsx:130-136` usan `Archivo_900Black` con `letterSpacing` negativo (`index.tsx:234-240`, `Walkthrough.tsx:339-344`) y color `text-primary`. Es facil de re-tematizar en dark (ventaja: no hay asset que reemplazar).

---

## 5. Restricciones duras

### 5.1 Splash nativo = BINARIO, no OTA

`app.json:108-120` configura `expo-splash-screen` con `image`, `imageWidth: 180`, `resizeMode: "contain"`, `backgroundColor: "#07080C"` y bloque `dark`. Estos valores se materializan en recursos nativos en tiempo de prebuild/build: cualquier cambio de imagen o de color de fondo **exige binario nuevo** (regla de `apps/mobile/AGENTS.md`, seccion "Cambios nativos y releases"). Ademas `runtimeVersion.policy: "appVersion"` (`app.json:171-173`) implica que un OTA solo alcanza binarios con la misma `version` (`1.1.0`, `app.json:6`).

Lo que SI es OTA dentro del splash:

- `SplashScreen.preventAutoHideAsync()` / `hideAsync()` y el momento del hide (`_layout.tsx:50`, `238-246`).
- `SplashScreen.setOptions({ duration, fade })` — existe en la version instalada (`expo-splash-screen@31.0.13`, tipos en `build/SplashScreen.types.d.ts:1-14`), pero **`fade` es solo iOS** segun esos mismos tipos. Hoy no se llama nunca.
- Consecuencia operativa: en **Android no hay crossfade nativo disponible**. La continuidad "sin flash blanco" debe fabricarse en JS: la primera pantalla React tiene que arrancar con exactamente el mismo color de fondo que el splash y hacer su propio fade de contenido. Eso obliga a reconciliar `#07080C` (`app.json:114`) con el fondo real de la primera pantalla.
- Adicional: hoy ni `GestureHandlerRootView` (`_layout.tsx:251`) ni los `<View>` de los providers de tema (`ThemeContext.tsx:95,157`) declaran `backgroundColor`. Ponerselo es OTA y es la mitad barata del problema; la otra mitad (el `windowBackground` nativo) viaja con el binario.

### 5.2 Movimiento reducido

- Global: `<ReducedMotionConfig mode={ReduceMotion.System} />` en `_layout.tsx:252` — Reanimated respeta el ajuste del SO en toda la app.
- Selector: `useReducedMotion()` en `index.tsx:36`, aplicado a las entradas (`index.tsx:99-102`, `118`, `134`, `172`) → sin motion, duracion 0 y sin translate.
- Walkthrough: `useReducedMotion()` en `Walkthrough.tsx:84`, aplicado al scroll programatico (`:114-118`), a la transicion de escena (`:191-198`), al trofeo (`:251-256`), a la barra de progreso (`:297-298`) y al `transition` de `expo-image` (`:238`).
- `EvaLoader` usa su propio camino: `AccessibilityInfo.isReduceMotionEnabled()` (`EvaLoader.tsx:26-28`), no el hook de Reanimated. Inconsistencia menor a unificar.

### 5.3 Escalado de fuente y modo compacto

- `fontScale > 1.15` → `textIsLarge` (`Walkthrough.tsx:89`), unico efecto: reduce el `paddingTop` del bloque de copy (`Walkthrough.tsx:272` → `styles.copyLargeText`, `:428-430`). Es un manejo minimo; no reflowea el CTA ni la altura del `stage`.
- Modo compacto: `compact = width <= 360 || height <= 640` (`Walkthrough.tsx:88`), que ajusta `pagePadding` (`:90`), `stageHeight` (`:91`), padding inferior de slide (`:184`), tamaño/posicion del trofeo (`:257`, `:414-419`) y padding del footer (`:284`).
- El selector NO tiene modo compacto; se apoya en `ScrollView` con `flexGrow: 1` + `justifyContent: 'space-between'` (`index.tsx:225-231`) y `maxWidth: 460` centrado (`index.tsx:232`).
- Cada slide del walkthrough tiene su propio `ScrollView` vertical anidado (`Walkthrough.tsx:176-187`) para no cortar contenido con fuentes grandes.

### 5.4 `ForceLightTheme branded={false}` — que implica pasar la familia a dark

Puntos donde se fuerza el claro hoy:

| Superficie | Llamada | `branded` |
|---|---|---|
| Selector + walkthrough | `index.tsx:27` | `false` |
| Login / register / forgot / reset / verify | `app/(auth)/_layout.tsx:9` | `true` (default) — conserva la marca del coach |
| Captura de codigo de coach | `app/alumno/codigo.tsx:33` | `false` |
| Onboarding del alumno | `app/alumno/onboarding.tsx:80` | `true` |

Mecanica (`ThemeContext.tsx:127-163`): el componente NO toca el `colorScheme` global de NativeWind; scopea el claro por dos vias simultaneas — (1) un `ThemeContext` anidado con `theme = applyEffectiveCoachBranding(lightTheme, ...)`, `mode: 'light'`, `resolvedScheme: 'light'` (`:145,151`), y (2) re-declaracion local de los CSS-vars a sus valores claros con `vars({ ...LIGHT_SCHEME_VARS, ...effectiveBrandVars(effectiveBrand, 'light') })` (`:146-149`), donde `LIGHT_SCHEME_VARS` es el espejo manual del bloque `.dark` (`lib/theme.ts:610-679`). Ademas fija `<StatusBar style="dark" />` (`ThemeContext.tsx:158`).

`branded={false}` (`ThemeContext.tsx:139`) descarta el branding del padre para que el selector no se tiña con la marca de un coach cacheado — por eso `theme.primary` cae al `DEFAULT_BRAND '#007AFF'` (`lib/theme.ts:258,359-366`), que es el azul saturado que hoy inunda la pantalla por el bug de §2.2.

Para pasar la familia publica a dark hay que tocar, como minimo:

1. `ThemeContext.tsx:127-163` — parametrizar el esquema (por ejemplo `<ForceScheme scheme="dark" branded={false}>`) en lugar de hardcodear claro. Hoy el nombre y la implementacion son literalmente "Force**Light**".
2. `lib/theme.ts:610-679` — necesita el espejo `DARK_SCHEME_VARS` (o invertir el enfoque: no forzar nada y dejar que el root resuelva), con el mismo contrato de mantenimiento que ya advierte el comentario de `lib/theme.ts:605-608`.
3. `ThemeContext.tsx:158` — `StatusBar style` pasa a `"light"`.
4. `index.tsx:27` — el call site del selector/walkthrough.
5. Decision de owner pendiente: la familia "publica" segun el brief es splash + walkthrough + selector. `app/(auth)/_layout.tsx:9` (login white-label) y `app/alumno/onboarding.tsx:80` son adyacentes y hoy comparten el forzado claro; si el selector queda dark y el login sigue claro, hay un flash claro al tocar "Soy alumno"/"Soy coach". Esa costura es justamente lo que la direccion "dark continuo" quiere evitar → conviene decidir explicitamente si el login entra o no en el alcance.
6. `app/alumno/codigo.tsx:33` — es el destino real del boton "Soy alumno" (`index.tsx:141`); si el selector es dark, este tambien deberia serlo.

### 5.5 Dependencias

`apps/mobile/AGENTS.md` prohibe agregar deps nativas sin justificacion, y el brief prohibe Lottie y deps nativas nuevas. Lo ya disponible y suficiente para un dark premium: `@shopify/react-native-skia@2.2.12`, `react-native-svg@15.12.1`, `moti@0.30.0`, `react-native-reanimated@4.1.1`, `react-native-gesture-handler@2.28.0`, `expo-haptics@15.0.8`, **`expo-linear-gradient@15.0.8`** (ideal para scrims/degradados dark sin tocar Skia), `expo-blur@15.0.8`, `expo-image@3.0.11`, `react-native-fast-confetti@1.1.2` (`package.json:37-100`).

---

## 6. Superficies que toca un redesign dark premium — OTA vs binario

### 6.1 Requieren BINARIO NUEVO

| Archivo | Que cambia | Motivo |
|---|---|---|
| `apps/mobile/app.json:108-120` | `image` → `./assets/eva-icon.png` (marca blanca); `backgroundColor` reconciliado con el token dark; mismo par en el bloque `dark` | Plugin de splash: se materializa en recursos nativos |
| `apps/mobile/app.json:8` (`userInterfaceStyle`) | Solo si se decide fijar `"dark"` en lugar de `"automatic"` | Config nativa |
| `apps/mobile/app.json:34-37` (`adaptiveIcon.backgroundColor`) | Solo si se rearmoniza el sistema de marca | Config nativa |
| `apps/mobile/assets/eva-icon.png` (o nuevo asset de splash) | Se referencia desde el plugin | Empaquetado nativo |
| `apps/mobile/app.json:6` (`version`) + `ios.buildNumber` / `android.versionCode` | Bump obligatorio del release | Politica de `docs/operations/MOBILE_RELEASES_OTA.md` |

Todo lo demas de la lista viaja por OTA. Nota: como `runtimeVersion.policy` es `appVersion` (`app.json:171-173`), publicar el binario nuevo crea un canal de runtime nuevo; los OTA posteriores deben apuntar a el.

### 6.2 OTA-ables

**Bloque 1 — arreglos de defectos (deberia ir primero, es independiente del rediseño):**

| Archivo:linea | Cambio |
|---|---|
| `components/AmbientBrandGlow.tsx:74-86` | mover el alpha de `stopColor` a `stopOpacity` en los 6 stops (fix del azul full-bleed) |
| `components/GlassCard.tsx:57-58` | mismo fix en los 2 stops sin `stopOpacity` |
| `components/Walkthrough.tsx:311-316` | sacar el layout de la funcion `style` (fix del CTA en columna) |
| `app/index.tsx:180-188` | idem para la card "Soy coach" |
| `app/index.tsx:136-151` | la card "Soy alumno" usa `style` funcion; verificar que su fondo de marca realmente se aplique |
| `components/alumno/home/WeightQuickLog.tsx:79-80` | mismo patron, fuera de la entrada pero mismo bug |
| `app/index.tsx:87` + `components/EvaLoader.tsx:99` | eliminar el `AppBackground` duplicado de la fase `checking` |
| `components/AppBackground.tsx:27-28` | usar `resolvedScheme` en vez de `mode` |

**Bloque 2 — sistema de tema:**

| Archivo | Cambio |
|---|---|
| `context/ThemeContext.tsx:127-163` | parametrizar el esquema forzado; `StatusBar style` derivado |
| `lib/theme.ts:610-679` | espejo `DARK_SCHEME_VARS` (o retiro del forzado) |
| `global.css:156-238` | tokens dark nuevos: superficie elevada translucida, scrim/gradiente, glow scheme-aware; reconciliar los drifts de `surface-inverse*` y `text-muted` |
| `tailwind.config.js:92-130` | utilidades para los tokens nuevos |
| `lib/shadows.ts:65-69` | glows scheme-aware y brand-aware |
| `lib/theme.ts:113-144` (`DS`) | alinear `textMutedDark` con `global.css:203` |
| `docs/architecture/design-system/TOKENS.md` | actualizar el contrato con lo agregado (obligatorio: es canonico) |

**Bloque 3 — pantallas de la familia de entrada:**

| Archivo | Alcance |
|---|---|
| `app/index.tsx` | fases `checking` / `walkthrough` / `selector`, jerarquia, cards de rol, footer, motion de entrada |
| `components/Walkthrough.tsx` | slides, `stage`, halos (hoy `bg-*-100` pelados: `:36`, `:203-222`), barra de progreso, CTA, "Saltar" |
| `components/EvaLoader.tsx` | `EvaLoaderScreen` (`:95-103`) es el puente visual entre splash y primer contenido — pieza clave de la continuidad dark |
| `components/AppBackground.tsx` | atmosfera dark: alphas, color de grilla (`:29`), costo del blur |
| `components/AmbientBrandGlow.tsx` | ademas del fix, recalibrar picos para dark |
| `app/alumno/codigo.tsx` | destino de "Soy alumno"; hoy `ForceLightTheme branded={false}` (`:33`) |
| `app/(auth)/_layout.tsx` + `app/(auth)/login.tsx` | solo si el owner incluye el login en el alcance (§5.4 punto 5) |
| `lib/typography.ts` | solo si el rediseño introduce roles de texto nuevos |
| `assets/onboarding/*.webp` | reemplazo de ilustraciones (opcion C de §4.1): OTA, pero requiere produccion de diseño |

**Bloque 4 — no tocar (fuera de alcance, verificado):**

`app/+native-intent.ts` (solo transforma rutas, sin UI), `lib/walkthrough.ts` (flag, sin UI), `lib/branding.ts` (persistencia).

---

## 7. Como verificar los diagnosticos

Sin acceso a dispositivo, estos son los checks minimos que confirman/refutan cada causa raiz en minutos:

1. **Defecto (b).** Cambiar UN stop de `AmbientBrandGlow.tsx:74` a `stopColor={tint} stopOpacity={aPrimary}`. Si el azul se convierte en un halo tenue, confirmado. Alternativa aun mas rapida: comentar `<AmbientBrandGlow />` en `index.tsx:107` — si el azul desaparece por completo, el `AppBackground`/Skia queda descartado de una vez.
2. **Defecto (a).** Agregar `flex-row items-center justify-center` al `className` de `Walkthrough.tsx:311` sin tocar nada mas. Si el boton se ordena, confirmado que la funcion `style` se estaba descartando.
3. **Splash.** Reemplazar `./assets/eva-mark-filled.png` por `./assets/eva-icon.png` en `app.json:111` y `:116`, y hacer un build. Si la marca aparece, confirmado.
4. **Costo del doble fondo.** Quitar `<AppBackground/>` de `index.tsx:87` (el de `EvaLoaderScreen` ya cubre la pantalla) y medir tiempo hasta el primer frame interactivo en release, no en dev.

---

## Anexo — indice de archivos auditados

`apps/mobile/app/index.tsx` · `apps/mobile/app/_layout.tsx` · `apps/mobile/app/+native-intent.ts` · `apps/mobile/app/(auth)/_layout.tsx` · `apps/mobile/app/(auth)/login.tsx` · `apps/mobile/app/alumno/codigo.tsx` · `apps/mobile/components/Walkthrough.tsx` · `apps/mobile/components/EvaLoader.tsx` · `apps/mobile/components/AppBackground.tsx` · `apps/mobile/components/AmbientBrandGlow.tsx` · `apps/mobile/components/GlassCard.tsx` · `apps/mobile/context/ThemeContext.tsx` · `apps/mobile/lib/theme.ts` · `apps/mobile/lib/typography.ts` · `apps/mobile/lib/shadows.ts` · `apps/mobile/lib/walkthrough.ts` · `apps/mobile/lib/branding.ts` · `apps/mobile/global.css` · `apps/mobile/tailwind.config.js` · `apps/mobile/app.json` · `apps/mobile/package.json` · `apps/mobile/assets/**` · `docs/architecture/design-system/TOKENS.md` · `node_modules/react-native-svg/src/lib/extract/{extractGradient,extractOpacity,extractBrush}.ts` · `node_modules/react-native-svg/src/elements/RadialGradient.tsx` · `node_modules/react-native-css-interop/src/{shared.ts,runtime/config.ts,runtime/components.ts,runtime/native/{native-interop.ts,styles.ts,api.ts,render-component.tsx}}` · `node_modules/@shopify/react-native-skia/{src/renderer/components/imageFilters/Blur.tsx,cpp/api/third_party/CSSColorParser.cpp}` · `node_modules/expo-splash-screen/build/SplashScreen.types.d.ts`
