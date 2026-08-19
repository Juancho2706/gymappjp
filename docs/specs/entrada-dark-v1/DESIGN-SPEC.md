---
status: draft
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# DESIGN-SPEC — Entrada dark v1 (RN)

Especificacion visual **normativa** de la familia de entrada de EVA Mobile. Un implementador NO debe necesitar abrir los HTML: todos los valores estan citados aca.

**Base normativa**: `docs/research/entrada-redesign/mockups/r2-c-craft.html` COMPLETO (7 frames, craft, textura, copy).
**Sustitucion unica aprobada por el owner (2026-07-28)**: el frame 06 (splash de retorno branded) adopta el mecanismo de **capa de luz** (`.lux` / `--heat` / `--lift` / `--lux-rgb`) del frame 06 de `r2-b-capaluz.html`. La luz **es** el white-label.
**Sello de diseno declarado por el owner**: la textura crosshatch de r2-c sobre lavados radiales de acento. Es obligatoria en las 7 superficies.

Contexto: [`SPEC.md`](SPEC.md) · [`00-DIRECCION-ENTRADA.md`](../../research/entrada-redesign/00-DIRECCION-ENTRADA.md) · auditoria `a1` · fundamentos `f1` · contrato de tokens [`TOKENS.md`](../../architecture/design-system/TOKENS.md).

Referencia de medidas: **pantalla 390 x 844 pt**. Status bar 59 pt, home indicator 34 pt inferior. Todo valor en pt (RN dp), no px CSS.

---

## 0. Convenciones de traduccion CSS -> RN (aplican a todo el documento)

| Construccion CSS del mockup | Traduccion RN NORMATIVA |
|---|---|
| `box-shadow: inset 0 1px 0 rgba(255,255,255,α)` | RN **no tiene inset shadow**. Se dibuja como `<View>` absoluta `top:0 left:0 right:0 height:1 backgroundColor:'rgba(255,255,255,α)'` dentro de un padre con `overflow:'hidden'` + su `borderRadius`. |
| `box-shadow: 0 Ypx Bpx -Spx color` (spread negativo) | RN **no tiene spread**. Los glows de card se dibujan como **elipse RadialGradient svg detras del elemento** (ver §1.6), NUNCA con `shadowRadius` (en iOS sangra sin control y en Android `elevation` no tiñe). |
| `::before` / `::after` | `<View>` hermana con `position:'absolute'` + `pointerEvents:'none'`. |
| `linear-gradient(...)` | `expo-linear-gradient` (`LinearGradient`), `start`/`end` normalizados 0..1. |
| `radial-gradient(...)` | `react-native-svg` `<RadialGradient>` con **`rx`/`ry`** (react-native-svg usa rx/ry, no `r`, para elipses) y **`stopOpacity` explicito**. |
| alpha dentro de `stopColor` | **PROHIBIDO** — `extractGradient.ts:83-84` hace `color & 0x00ffffff` y descarta el alpha (bug confirmado, a1 §2). El alpha va SIEMPRE en `stopOpacity`. En `fill`/`stroke` si se respeta el alpha del color. |
| `filter: drop-shadow(...)` | Halo dibujado detras como capa radial (ver §1.4). Nunca sombra sobre la imagen. |
| `backdrop-filter: blur()` | `expo-blur` **solo** en el tab bar del frame 07. Prohibido en 01-06 (cold start). |
| `background-position` animado (shimmer) | `translateX` de un `LinearGradient` dentro de un bloque `overflow:'hidden'`. |
| `text-indent` | `paddingLeft` del mismo valor (compensa el letter-spacing colgante). |
| `mix-blend-mode` | No se usa (r2-c no lo usa; r2-b si, y esa capa NO se adopta). |
| `className` + `style` como funcion | **PROHIBIDO** en el mismo nodo (css-interop descarta el `style`; a1 §2). Pressed via `onPressIn`/`onPressOut` + `Animated.View`. |

**Familias tipograficas** (`lib/typography.ts`): el mockup usa `system-ui` como stand-in. En la app: display/titulares = **Archivo**, texto UI = **Hanken Grotesk**, codigos/metricas/eyebrows-mono = **JetBrains Mono**.
`letterSpacing` en RN va en **puntos**: `pt = em × fontSize`. Todos los valores de este documento ya vienen convertidos.
`lineHeight` en RN va en **puntos**: `pt = multiplicador × fontSize`, redondeado.

---

## 1. Atmosfera y textura (el sello)

Un unico componente `<EntryAtmosphere>` monta el fondo completo. Vive **sobre el router**, no dentro de cada pantalla: no se desmonta entre frames 01→07 — solo cambian sus props. Ese es el mecanismo que hace que "el fondo no se desmonta" sea un objeto y no una promesa.

### 1.1 Orden de capas (de atras hacia adelante)

| # | Capa | Que es | Implementacion RN | Anima en cold start |
|---|---|---|---|---|
| 0 | **Canvas** | `#07080C` solido, full-bleed, incluida el area de status bar | `backgroundColor` del root `<View>` + `expo.backgroundColor` en `app.json` | NO (nunca) |
| 1 | **Lavado superior (acento)** | elipse radial de acento, anclada arriba-centro | `<Svg>` unico, `<RadialGradient>` + `<Rect>` | NO (solo cambia de valor al cambiar de pantalla) |
| 2 | **Lavado inferior (horizonte)** | elipse radial de acento suave, anclada abajo | mismo `<Svg>`, 2do `<RadialGradient>` + `<Rect>` | NO |
| 3 | **Fuente puntual** (solo frames 01 y 06) | circulo radial detras de la figura de marca | mismo `<Svg>`, 3er `<RadialGradient>` + `<Circle>` | SI — solo `opacity` (respiracion), ver §4 |
| 4 | **Crosshatch (EL SELLO)** | rejilla 1pt cada 3pt, doble eje | mismo `<Svg>`, `<Pattern>` + `<Rect>` | **NO — jamas** |
| 5 | **Vineta** | NO forma parte de r2-c | ver §1.7 (fallback documentado, apagada por defecto) | — |

**Presupuesto: 1 solo `<Svg>` para las capas 1-4.** Cero Skia en toda la familia (el doble `AppBackground` Skia de la fase `checking` se retira en el mismo cambio, a1 §2.3). El contenido de pantalla va en un hermano posterior con `zIndex` mayor.

### 1.2 Lavados radiales — valores exactos

Fuente: `.amb` y `.amb.wl` de r2-c (lineas 186-195).

**Acento EVA (frames 01-05):**

```css
radial-gradient(120% 62% at 50% 8%,
  rgba(26,107,230,.15)  0%,
  rgba(26,107,230,.048) 42%,
  transparent           72%),
radial-gradient(90% 45% at 50% 104%,
  rgba(127,176,255,.05) 0%,
  transparent           70%)
```

**Acento coach (frames 06-07), demo `#12A971`:**

```css
radial-gradient(120% 62% at 50% 8%,
  rgba(18,169,113,.17)  0%,
  rgba(18,169,113,.05)  42%,
  transparent           72%),
radial-gradient(90% 45% at 50% 104%,
  rgba(85,224,168,.05)  0%,
  transparent           70%)
```

**Traduccion RN exacta** (recordar: en CSS `120% 62%` son DIAMETROS; en svg `rx`/`ry` son RADIOS → mitad):

```tsx
<Svg style={StyleSheet.absoluteFill} pointerEvents="none">
  <Defs>
    {/* CAPA 1 — lavado superior */}
    <RadialGradient id={`lux-top-${uid}`} cx="50%" cy="8%" rx="60%" ry="31%" gradientUnits="objectBoundingBox">
      <Stop offset="0"    stopColor={LUX_HEX}      stopOpacity={heatTop} />
      <Stop offset="0.42" stopColor={LUX_HEX}      stopOpacity={heatTop * 0.32} />
      <Stop offset="0.72" stopColor={LUX_HEX}      stopOpacity={0} />
    </RadialGradient>
    {/* CAPA 2 — horizonte */}
    <RadialGradient id={`lux-bot-${uid}`} cx="50%" cy={`${bottomCy}%`} rx="45%" ry="22.5%">
      <Stop offset="0"   stopColor={LUX_SOFT_HEX} stopOpacity={heatBottom} />
      <Stop offset="0.7" stopColor={LUX_SOFT_HEX} stopOpacity={0} />
    </RadialGradient>
  </Defs>
  <Rect width="100%" height="100%" fill={`url(#lux-top-${uid})`} />
  <Rect width="100%" height="100%" fill={`url(#lux-bot-${uid})`} />
  {/* ...capa 3 y 4 en el MISMO Svg... */}
</Svg>
```

- `LUX_HEX` = acento saturado (`#1A6BE6` EVA / accent del coach). `LUX_SOFT_HEX` = version clara (`#7FB0FF` EVA / `#55E0A8` demo coach).
- `uid` = `useId().replace(/[^a-zA-Z0-9]/g,'')` — obligatorio, mismo patron que `AmbientBrandGlow.tsx:54`, para no colisionar ids svg entre montajes.
- **Los tres `stopOpacity` son obligatorios y explicitos**, incluido el `0` final. Sin ellos react-native-svg pinta rects **solidos** full-bleed (es exactamente el bug que hoy tiñe el selector de azul).
- `preserveAspectRatio="none"` NO se usa aca (las elipses ya son relativas al bounding box).

### 1.3 Crosshatch — la textura sello, al detalle

Fuente: `.grain` de r2-c (lineas 196-201). Es un **crosshatch**, no ruido: dos rejillas de linea 1 sobre celda 3, en ejes perpendiculares, con alphas distintos.

```css
.grain{
  position:absolute; inset:0; pointer-events:none; z-index:1; opacity:.5;
  background-image:
    repeating-linear-gradient(0deg,  rgba(255,255,255,.012) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.010) 0 1px, transparent 1px 3px);
}
```

Lectura precisa:
- `0deg` → eje del gradiente hacia arriba → las bandas son **horizontales**. Linea de 1pt cada 3pt, `rgba(255,255,255,0.012)`.
- `90deg` → eje hacia la derecha → las bandas son **verticales**. Linea de 1pt cada 3pt, `rgba(255,255,255,0.010)`.
- La capa completa a `opacity: .5` → alphas efectivos **0.006** (horizontales) y **0.005** (verticales); en los cruces se suman a ~0.011.
- Celda de la rejilla: **3 x 3 pt**. Cobertura: 1/3 de las filas + 1/3 de las columnas.

**Traduccion RN exacta** — `<Pattern>` de `react-native-svg`, mismo mecanismo que la grilla `appgrid` de 40pt de `AppBackground.tsx:44-49`, con celda de 3 en vez de 40:

```tsx
<Defs>
  <Pattern id={`grain-${uid}`} width={3} height={3} patternUnits="userSpaceOnUse">
    {/* linea horizontal (banda del gradiente 0deg) */}
    <Rect x={0} y={0} width={3} height={1} fill="#FFFFFF" fillOpacity={0.012} />
    {/* linea vertical (banda del gradiente 90deg) */}
    <Rect x={0} y={0} width={1} height={3} fill="#FFFFFF" fillOpacity={0.010} />
  </Pattern>
</Defs>
<Rect width="100%" height="100%" fill={`url(#grain-${uid})`} opacity={0.5} />
```

Reglas duras del crosshatch:
1. **`opacity={0.5}` va en el `<Rect>` consumidor**, no en los `fillOpacity` (mantiene el paralelo 1:1 con el CSS y permite bajarlo de un solo lugar si QA lo pide).
2. `patternUnits="userSpaceOnUse"` es obligatorio: con el default (`objectBoundingBox`) la celda se escalaria con la pantalla y la textura dejaria de ser 3pt.
3. La textura **nunca anima, nunca se desmonta, nunca cambia de acento**. Es blanca en las 7 superficies, incluidas 06 y 07 (branded). Es lo que hace que el white-label se lea como un cambio de luz y no de app.
4. Va **encima** de los lavados y **debajo** del contenido. Si se pinta debajo de los lavados, el crosshatch desaparece bajo el acento y se pierde el sello.
5. En pantallas con `PixelRatio` 3 la celda son 9 px fisicos: es la escala buscada. **No** escalar la celda por `PixelRatio` — el pattern se define en pt.
6. Fallback de gama muy baja (solo si QA mide caida de fps atribuible): subir la celda a 4pt manteniendo la linea en 1pt. **Nunca** apagar la capa.

### 1.4 Fuente puntual (halo detras de la figura) — frames 01 y 06

Fuente: `.splashhalo` de r2-c (lineas 219-223) + parametrizacion `.source` de r2-b (lineas 208-215).

```css
.splashhalo{
  width:430px; height:430px; border-radius:50%;
  background: radial-gradient(circle,
    rgba(26,107,230,.20)  0%,
    rgba(26,107,230,.068) 38%,
    transparent           68%);
}
/* variante coach del frame 06 (.haloG, lineas 453-457) */
background: radial-gradient(circle,
  rgba(18,169,113,.24) 0%,
  rgba(18,169,113,.07) 38%,
  transparent          68%);
```

Geometria resuelta en la referencia 390x844: **circulo de diametro 430, centro en (195, 434)** — es decir `cx = 50%` del ancho y `cy = 51.4%` del alto de pantalla. Practicamente coincide con el centro optico de la figura (y≈430); **la regla normativa es: el halo se centra en el centro optico de la figura, no en el centro del body**.

```tsx
<RadialGradient id={`lux-src-${uid}`} cx="50%" cy="50%" rx="50%" ry="50%">
  <Stop offset="0"    stopColor={LUX_HEX} stopOpacity={sHeat} />
  <Stop offset="0.38" stopColor={LUX_HEX} stopOpacity={sHeat * 0.34} />
  <Stop offset="0.68" stopColor={LUX_HEX} stopOpacity={0} />
</RadialGradient>
<Circle cx={figureCx} cy={figureCy} r={215} fill={`url(#lux-src-${uid})`} />
```

`sHeat` = 0.20 (EVA) / 0.24 (coach). La razon `0.068/0.20 = 0.34` es la que fija el segundo stop.

### 1.5 Parametrizacion por acento — de donde salen `heatTop`, `heatBottom` y `bottomCy`

Ver §2 (capa de luz white-label). En resumen: el acento (`LUX_HEX`, `LUX_SOFT_HEX`) y la temperatura (`--heat`) son props; la geometria (porcentajes, stops relativos, crosshatch) es fija.

### 1.6 Under-glow de card (sustituto del `box-shadow` con spread negativo)

`0 18px 44px -26px rgba(26,107,230,.85)` (card primaria) y `0 16px 40px -30px rgba(0,0,0,.9)` (card secundaria) no tienen equivalente RN. Normativo:

- **Card primaria (alumno)**: `<Svg>` de 1 elipse detras de la card, `width = cardWidth × 1.10`, `height = 44`, centrada horizontalmente, `top = cardTop + 18`. `RadialGradient` `rx="50%" ry="50%"`, stops `0 → #1A6BE6 @ 0.28`, `0.7 → #1A6BE6 @ 0`. (El `.85` del CSS se atenua por el spread `-26px`; 0.28 es el pico visible equivalente medido en el mockup.)
- **Card secundaria (coach)**: se OMITE. Sobre `#07080C` una sombra negra al 0.9 con spread -30 es invisible; la profundidad la da el hairline + el highlight superior.
- **Boton circular relleno** (`.go.fill`, `0 6px 18px -8px rgba(26,107,230,.95)`): se omite el glow; queda solo el highlight interno de 1pt.
- **CTA de 56 pt** (`0 12px 28px -14px rgba(26,107,230,.95)`): se implementa con `shadowColor:'#1A6BE6', shadowOffset:{width:0,height:8}, shadowOpacity:0.45, shadowRadius:16, elevation:8` (iOS + Android). Es el unico caso donde el `shadow*` nativo aproxima bien porque el offset es grande y el spread pequeno.

### 1.7 Vineta (NO forma parte de r2-c)

r2-c **no tiene vineta**. Se documenta el valor de r2-b (`.vign`, linea 227-230) como fallback, **apagado por defecto**, solo si QA en device reporta que los bordes se ven planos:

```css
radial-gradient(122% 78% at 50% 44%, transparent 44%, rgba(0,0,0,.52) 100%)
```

Si se activa: 4ta capa del mismo `<Svg>`, `RadialGradient cx="50%" cy="44%" rx="61%" ry="39%"`, stops `0.44 → #000 @ 0` y `1 → #000 @ 0.52`. Requiere aprobacion explicita del owner (cambia el sello).

---

## 2. Capa de luz white-label (fusion de r2-b)

### 2.1 El sistema

Tres parametros, un solo objeto:

| Parametro | Que controla | Tipo |
|---|---|---|
| `--lux-rgb` | **canal de color** de las capas 1, 2 y 3 | `[r,g,b]`, default EVA `26,107,230` |
| `--heat` | **temperatura**: alpha pico del lavado superior | `number` 0..1 |
| `--lift` | **altura del horizonte**: donde se ancla el lavado inferior | `%` (negativo) |

Regla del mecanismo (r2-b, lineas 193-196): **una sola capa, que no se desmonta entre pantallas — solo sube o baja de temperatura y de altura. En los frames branded cambia de canal RGB al acento del coach. La luz ES el white-label.**

Cambiar `--lux-rgb` re-brandea el retorno completo sin tocar un solo componente.

### 2.2 Rampa por pantalla (r2-b) adaptada a la geometria de r2-c

r2-b declara su rampa de `--heat` en su propia geometria (elipse `.lux::before`). r2-c usa otra geometria (lavado superior 120%x62% at 50% 8%). El factor de conversion queda fijado por el frame 02, que ambos mockups comparten: r2-b `--heat .32` ↔ r2-c `.15` → **`heatTop_r2c = heat_r2b × 0.469`**.

`bottomCy` (ancla del horizonte en la geometria r2-c) se deriva de `--lift` con: **`bottomCy = 104% + (−26 − lift)`** (el default de r2-b es `--lift:-26%`, que corresponde al `104%` de r2-c; lift menos negativo = horizonte mas alto = `cy` menor).

**Tabla normativa — usar estos valores, no recalcular:**

| Frame | Acento | `--heat` (r2-b) | `heatTop` | `heatBottom` | `--lift` | `bottomCy` | Fuente puntual |
|---|---|---|---|---|---|---|---|
| 01 Splash cold start | EVA `#1A6BE6` | .28 | **0.131** | 0.05 | -40% | **118%** | SI, `sHeat` 0.20 |
| 02 Valor + rol | EVA | .32 | **0.150** | 0.05 | -22% | **100%** | no |
| 03 Morph alumno | EVA | .44 | **0.206** | 0.05 | -16% | **94%** | no |
| 04 `/alumno/codigo` | EVA | .16 | **0.075** | 0.05 | -32% | **110%** | no |
| 05 Morph coach | EVA | .11 | **0.052** | 0.05 | -36% | **114%** | no |
| 06 Retorno · capa EVA | EVA | .26 | **0.122** | 0.05 | -38% | **116%** | SI, `sHeat` 0.20 |
| 06 Retorno · capa COACH | coach | .34 | **0.170** | 0.05 | -34% | **112%** | SI, `sHeat` 0.24 |
| 07 Dashboard | coach | .18 | **0.084** | 0.05 | -34% | **112%** | no |

Notas:
- `heatBottom` es constante `0.05` en toda la familia (r2-c no lo modula; solo cambia el hue: `#7FB0FF` EVA / `#55E0A8` coach).
- El valor `0.170` de la capa coach del frame 06 coincide **exactamente** con el `rgba(18,169,113,.17)` de `.amb.wl` de r2-c: la fusion cierra sin drift.
- **La rampa cuenta una historia**: nace detras de la figura (01, fuente puntual, horizonte hundido), baja al horizonte bajo el CTA (02), se enciende una unica vez en la eleccion de alumno (03, pico .206), se apaga en el camino de codigo y de coach (04-05, minimo .052) y vuelve **ya branded** en el retorno (06-07). El acento ocupa **area** una sola vez: por eso el momento se siente ganado.
- Al cambiar de pantalla, `heatTop` y `bottomCy` se **interpolan** durante 200 ms (`EASING.standard`), nunca se reemplazan de golpe (ver §4).

### 2.3 Crossfade del retorno branded (frame 06)

Se apilan **dos instancias** de la misma capa y se cruzan sus opacidades. **No se interpola el color**: interpolar un gradiente cuesta un repaint por frame.

**Capas montadas simultaneamente en el frame 06 (4 nodos):**

1. `EntryAtmosphere` EVA — `lux-rgb 26,107,230`, `heatTop 0.122`, `bottomCy 116%`, fuente `sHeat 0.20`
2. `EntryAtmosphere` COACH — `lux-rgb` = accent del coach, `heatTop 0.170`, `bottomCy 112%`, fuente `sHeat 0.24`
3. `MarkLayer` EVA — figura blanca + hairline + wordmark
4. `MarkLayer` COACH — tile del coach + nombre + saludo

La capa **4 (crosshatch)** es UNA sola, compartida, encima de las dos atmosferas: nunca se duplica ni se cruza.

**Timeline normativo** (t0 = primer frame JS despues del handoff nativo):

| t | Evento | Duracion | Easing |
|---|---|---|---|
| t0 | Replica JS montada, **identica al splash nativo** (capas 1 y 3 visibles, 2 y 4 en `opacity 0`) | — | — |
| t0 | Hold de continuidad | **120 ms** | — |
| t0+120 | **Crossfade**: capas 1 y 3 `opacity 1→0`; capas 2 y 4 `opacity 0→1` + tile del coach `scale .955→1`. **Simultaneo, misma curva.** | **260 ms** | `EASING.standard` `(0.2,0,0,1)` |
| t0+380 | Estado branded estable | — | — |

Reglas duras:
- **La atmosfera cruza JUNTO con la marca, no despues.** Si el simbolo cambia y el fondo se queda azul, se lee como dos pantallas pegadas (nota explicita de r2-c).
- El canvas `#07080C` **no participa** del crossfade: es identico en ambos estados. Por eso el cambio de marca se lee como reconocimiento, no como cambio de app.
- Si el gate de sesion resuelve **antes de t0+120**, el crossfade **se salta**: se navega directo. La animacion **jamas** retiene la navegacion ni se alarga el splash para que se luzca.
- Techo: **≤900 ms desde el arranque hasta el dashboard**, 0 taps, 0 pantallas intermedias.
- El splash **nativo** nunca es branded (es un recurso del binario). Solo cruza la replica JS.

### 2.4 De donde sale el branding

Origen: `loadStoredBranding()` (`apps/mobile/lib/branding.ts:135`), que lee `AsyncStorage` clave **`eva_coach_branding`** y ya se invoca **antes del primer frame React** (`_layout.tsx:208-215`). **Cero red en el arranque.**

**Orden de resolucion de la MARCA (capa 4):**
1. `logoUrlDark` (`coaches.logo_url_dark`)
2. `logoUrl` (`coaches.logo_url`)
3. **Tile de iniciales** derivado de `displayName` (`coaches.brand_name`): 1-2 caracteres, mayusculas, primeras letras de las 2 primeras palabras.

**Orden de resolucion del ACENTO (`--lux-rgb` + tile):**
1. `accentDark` (`coaches.accent_dark`)
2. `primaryColor` (`coaches.primary_color`)
3. `#1A6BE6` (`cta-fill` EVA) — en cuyo caso el frame 06 se ve casi identico al 01, **y esta bien**.

**Gate real (la UI no autoriza):** si `subscriptionTier` no habilita white-label (`isBrandingAllowed`, < Pro), **no hay crossfade**: la capa A se queda y el frame es identico al 01. El gate vive en el payload de branding, no en la UI.

**Cache frio:** primera apertura tras instalar, o storage vacio → capa A (EVA) y listo. El crossfade es una mejora, **jamas** un requisito para navegar.

**Quien ve que marca:** es la MISMA pieza con distinto origen de datos. El alumno ve la marca de SU coach (la que tiene cacheada); el coach ve la suya. No hay dos componentes.

**Contrato negativo:** el frame 02 (selector) **NUNCA** se tiñe con la marca de un coach cacheado. Identidad EVA pura, `branded=false`. La luz solo cambia de acento en 06-07.

---

## 3. Spec por pantalla (los 7 frames de r2-c)

Paleta comun (todos los literales del mockup, mapeados en §5):

```
canvas #07080C · surface-card #161B22 · surface-sunken #1F262F
hairline rgba(255,255,255,.07) · line rgba(255,255,255,.13) · line-strong rgba(255,255,255,.22)
ink #F4F6F8 · body #CDD3DB · muted #98A2B0 · subtle #86919E · faint #6E7883 · ghost #5C656F
cta #1A6BE6 · brand-soft #7FB0FF · brand-hi #9CC4FF · aqua #6FD3EA · ember #FF9D7E
coach demo #12A971 · coach-soft demo #55E0A8
radios: card 20 · control 14 · sheet 28 · icon-tile 13 · pill 999
```

Contenedor comun de todos los frames: `body` con `paddingHorizontal: 24`, `paddingBottom: 34`, arrancando debajo del status bar de 59.

---

### 3.1 FRAME 01 — Splash, cold start sin sesion

**Rol**: replica JS **pixel-identica** al splash nativo, montada debajo. El movimiento arranca recien aca (el splash nativo es estatico por regla f1 §4).

**Excepcion «Glide» (decision del dueno, 2026-08-18) — la unica que rompe la quietud de este frame.** En el camino **sesion viva + marca EVA** (el que rutea al dashboard EVA, sin marca de coach), la figura deja de estar quieta: sale de cuadro por la izquierda y entra barriendo con tres estelas de velocidad, mientras la firma entra deslizando desde la derecha. Coreografia completa en `apps/mobile/components/entry/splash-sweep.ts` (matematica pura, testeada en `tests/mobile-splash-sweep.test.ts`) y `SplashGlide.tsx` (capa Reanimated).

Lo que hay que entender de este binario, porque es donde se equivoca cualquiera que lo retoque:

- **El sweep se siembra en el VEREDICTO del gate, no en el primer paint.** `SplashGate` fija `sweepStartedAt` (`Date.now()`) recien cuando el `Promise.all` de sesion+branding+perfil resuelve en "hay sesion y no hay marca de coach". Hasta ese instante el frame 01 es la replica estatica de siempre.
- **Branded y anonimo conservan la replica pixel-identica, sin una sola diferencia contra la version pre-Glide.** No es cortesia: con el sweep atado al primer paint, la rama **branded** mostraba la figura EVA volando con estelas cian *por encima* del crossfade a la marca del coach —que cierra a ~380 ms (hold 120 + xfade 260) mientras la figura recien aterriza a los 550—, y el cold start **anonimo** desmontaba el gate hacia el selector a los ~100-600 ms cortando el barrido a mitad de vuelo, sin overlay que lo continuara. El dueno decidio «Glide solo, sin marca de coach».
- **El handoff nativo→JS sigue siendo pixel-identico.** `hideAsync()` sale del `onLayout` de la raiz del gate, y en ese instante todavia no hay semilla: la figura esta centrada a 150 pt donde la dejo el nativo. El costo asumido llega despues, en el veredicto: la figura **salta** fuera de cuadro para entrar barriendo. Ese blink es la decision «sweep fiel» — el gesto de marca completo vale mas que un empalme invisible, y arrancar el barrido desde donde estaba la figura convierte el diseno en otra cosa. Los 75 ms de hold de la escena son su unico colchon.
- **El reloj es tiempo real, no un progreso local.** El gate suelta el control pocos ms despues de sembrar (el mismo veredicto dispara el `router.replace`), asi que casi toda la escena la pinta `DashboardSplashOverlay`: hereda `sweepStartedAt` por `SplashHandoff` y calcula su propio `elapsed`. Toda la coreografia es funcion pura de `t`, por eso el relevo cae en el frame exacto.
- **La X de partida esta clampeada.** La razon autoral `-780/1080` asume un canvas de 1080 y la figura mide 150 pt fijos: en pantallas de ~320 pt no la saca de cuadro. Se toma el mayor desplazamiento entre la razon y el piso geometrico `W/2 + (150·cos9 + 135·sin9)/2` (la caja **ya inclinada** -9°, ~84.7 pt, no los 75 del rectangulo recto).
- **Reduce Motion**: el reloj se planta en el final y no se aplica ningun estilo animado — corte limpio a §3.1 (§4 R2).

**Layout**
- Contenido centrado vertical y horizontalmente **sobre el centro de la PANTALLA** (y = 422), NO sobre el centro del body. La diferencia con el centro del body es de ~8 pt y **es visible en el handoff**: el nativo centra en la ventana completa.
- Stack vertical, centrado:
  1. **Figura EVA** — `apps/mobile/assets/eva-icon.png`, `width: 150`, `height: 135` (aspect 585:526 = 1.1122), `contentFit: 'contain'`, `tintColor` NO se aplica (el PNG ya es blanco puro).
  2. **Hairline** — `width: 34`, `height: 1`, `backgroundColor: 'rgba(255,255,255,.16)'`, `marginTop: 16`, `marginBottom: 13`.
  3. **Wordmark "EVA"** — `fontSize: 11`, Hanken `800`, `letterSpacing: 4.84` (`.44em`), `paddingLeft: 4.84` (compensa el tracking colgante), `textTransform: 'uppercase'`, `color: 'rgba(244,246,248,.55)'`.
- **Halo**: fuente puntual §1.4, centrada en el centro optico de la figura.
- **Loader (morphbar)**: `position:'absolute'`, `bottom: 96`, centrado, `width: 96`, `height: 4`, `borderRadius: 999`, `backgroundColor: 'rgba(255,255,255,.10)'`, `overflow:'hidden'`; hijo `width: 34`, `borderRadius: 999`, `LinearGradient` horizontal `rgba(127,176,255,.25) → #7FB0FF → rgba(127,176,255,.25)`.

**Copy**: solo `EVA`. Es omitible sin costo si QA lo ve ruidoso — la figura sola ya identifica la app.

**Regla dura**: la figura es la marca; el texto "EVA" es **firma**, nunca protagonista. Se prohibe el wordmark tipografico en display en toda la familia.

---

### 3.2 FRAME 02 — Valor + rol, una sola pantalla (el concepto)

**Rol**: la unica pantalla del camino sin sesion. **0 slides, 0 swipes, 0 dots, 0 "Saltar"** — no hay nada que saltar porque el CTA ya esta en pantalla. Rol elegible a **~1.6 s** del cold start.

**Layout vertical (posiciones absolutas medidas en la referencia 390x844)**

| Bloque | Medidas |
|---|---|
| `topbar` | `paddingTop: 8`, `marginBottom: 22`, `flexDirection:'row'`, `justifyContent:'space-between'`, `alignItems:'center'` |
| ↳ lockup | figura 30x27 (`opacity .96`) + gap 9 + wordmark inline |
| ↳ chip idioma | texto `ES`, `fontSize 10.5`, Hanken 800, `letterSpacing .84` (`.08em`), `color #86919E`, `borderWidth 1` hairline, `borderRadius 999`, `paddingVertical 5`, `paddingHorizontal 10` |
| `kicker` | `marginBottom: 11` |
| `h2.hero` | `marginBottom: 11` |
| `herosub` | `maxWidth: 322`, `marginBottom: 18` |
| `frags` | 3 filas, `marginBottom: 16` |
| `sep` | `marginBottom: 12` |
| `roles` | `marginTop:'auto'`, `gap: 11` |
| `foot` | `marginTop: 13`, centrado |

**Posiciones resueltas (normativas, son el origen del morph):**
- Card **alumno**: `top 595`, `left/right 24`, `bottom 163` → **86 pt de alto**.
- Card **coach**: `top 692`, `left/right 24`, `bottom 66` → **86 pt de alto**. Gap real = 11 pt.

**Jerarquia tipografica exacta**

| Elemento | Familia | Size | Weight | `letterSpacing` (pt) | `lineHeight` (pt) | Color |
|---|---|---|---|---|---|---|
| wordmark inline | Hanken | 12.5 | 800 | **3.75** (`.3em`) + `paddingLeft 3.75` | — | `rgba(244,246,248,.72)` |
| `kicker` "Entrenamiento · Nutricion · Progreso" | Hanken | 10.5 | 800 | **2.1** (`.2em`), UPPER | 13 | `#86919E` |
| `h2.hero` "Coach y alumno,\nun solo plan." | **Archivo 900 Black** | 34 | 900 | **-1.19** (`-.035em`) | **35** (1.04) | `#F4F6F8` |
| `herosub` | Hanken | 13.5 | 400 | 0 | **20** (1.45) | `#CDD3DB` |
| `tiletag` (etiqueta dentro de la miniatura) | **JetBrains Mono 700** | 7 | 700 | **0.84** (`.12em`), UPPER | — | `#6E7883` |
| titulo de fragmento (`ftxt b`) | Hanken | 13.5 | 800 | **-0.16** (`-.012em`) | — | `#F4F6F8` |
| caption de fragmento (`ftxt small`) | Hanken | 11.5 | 600 | 0 | **15** (1.34) | `#86919E` |
| `sep` "Elige como entrar" | Hanken | 10 | 800 | **1.8** (`.18em`), UPPER | — | `#86919E` |
| titulo de card (`role b`) | **Archivo 900 Black** | 17.5 | 900 | **-0.385** (`-.022em`) | — | `#F4F6F8` |
| caption de card (`role small`) | Hanken | 12 | 600 | 0 | **16** (1.3) | primaria `#B7CDF0` / secundaria `#86919E` |
| `foot` | Hanken | 11 | 600 | 0 | **15** (1.4) | `#6E7883` |

**Copy final (es-latam, sin acentos en codigo — con acentos correctos en pantalla):**
- kicker: `Entrenamiento · Nutricion · Progreso`
- H1: `Coach y alumno,` / `un solo plan.`
- sub: `Tu coach lo arma desde su panel. Tu lo entrenas y lo comes. Los dos miran exactamente los mismos numeros.`
- frag 1: **`Tu semana, ya armada`** / `El dia de hoy viene marcado. No eliges que hacer: lo abres y entrenas.`
- frag 2: **`Macros que ya cuadran`** / `Porciones calculadas por comida. Cero planillas, cero conversiones a mano.`
- frag 3: **`Progreso que ven los dos`** / `El mismo grafico en tu app y en el panel de tu coach. Sin capturas por chat.`
- separador: `Elige como entrar`
- card A: **`Soy alumno`** / `Tengo el codigo de mi coach`
- card B: **`Soy coach`** / `Gestiono a mis alumnos`
- pie: `Solo define por donde entras. Despues inicias sesion.`

#### 3.2.1 Anatomia del contenedor de miniatura (`tile`)

`width: 118`, `height: 64`, `borderRadius: 14` (control), `overflow:'hidden'`, `alignItems:'center'`, `justifyContent:'center'`.
- Fondo: `LinearGradient` vertical `rgba(255,255,255,.055)` 0% → `rgba(255,255,255,.018)` 100%.
- Borde: `borderWidth: 1`, `borderColor: 'rgba(255,255,255,.07)'`.
- Highlight interno: `<View>` absoluta `top:0 left:0 right:0 height:1 backgroundColor:'rgba(255,255,255,.085)'`.
- Etiqueta: `position:'absolute', top:5, left:7, zIndex:3` con el estilo `tiletag`.

Fila `frag`: `flexDirection:'row'`, `alignItems:'center'`, `gap: 14`, `paddingVertical: 10`. Separador entre filas: `borderTopWidth: 1`, `borderTopColor: 'rgba(255,255,255,.07)'` (solo entre filas, no arriba de la primera ni bajo la ultima).

#### 3.2.2 Miniatura 1 — semana L-D (react-native-svg NO requerido: son `View`)

Contenedor: `flexDirection:'row'`, `alignItems:'flex-end'`, `gap: 5`, `paddingTop: 8`.
Cada columna: `alignItems:'center'`, `gap: 4`.
- Letra: JetBrains Mono `700`, `fontSize 7`, `letterSpacing 0.14` (`.02em`), color `#69727C`; **hoy** → `#F4F6F8`.
- Barra: `width: 9`, `height: 20`, `borderRadius: 3`.
  - **pendiente**: `backgroundColor:'transparent'`, `borderWidth: 1`, `borderColor:'rgba(255,255,255,.12)'`
  - **hecho**: `backgroundColor:'rgba(244,246,248,.30)'`, sin borde
  - **hoy**: `backgroundColor:'#1A6BE6'`, sin borde, + anillo `<View>` absoluta `inset:-2 borderRadius:5 borderWidth:2 borderColor:'rgba(26,107,230,.26)'` (traduce el `0 0 0 2px`), + punto blanco `width:3 height:3 borderRadius:1.5 backgroundColor:'#FFFFFF'` absoluto en `bottom: 4`, centrado.
- Patron congelado: **L hecho · M hecho · M pendiente · J hecho · V HOY · S pendiente · D pendiente**.

`cta-fill` aparece aca **una sola vez**: la celda de hoy. Es el unico saturado de la miniatura.

#### 3.2.3 Miniatura 2 — anillo de macros (`react-native-svg`)

Contenedor: `flexDirection:'row'`, `alignItems:'center'`, `gap: 8`, `paddingTop: 6`.
Anillo: wrapper 48x48; `<Svg viewBox="0 0 48 48" width={48} height={48}>` con `transform:[{rotate:'-90deg'}]` en el wrapper del Svg (**no** en el `<Circle>`).
Circunferencia = `2π × 17.5 = 109.96`.

| Orden | `stroke` | `strokeWidth` | `strokeDasharray` | `strokeDashoffset` | `strokeLinecap` |
|---|---|---|---|---|---|
| track | `rgba(255,255,255,.09)` | 4.6 | — | — | butt |
| proteina | `#7FB0FF` | 4.6 | `39.3 70.7` | `0` | `round` |
| carbos | `#6FD3EA` | 4.6 | `43.7 66.3` | `-41.8` | `round` |
| grasas | `#FF9D7E` | 4.6 | `19.5 90.5` | `-88` | `round` |

Todos: `cx=24 cy=24 r=17.5 fill="none"`.
Centro (`<View>` absoluta, `inset:0`, centrado, **sin** la rotacion): `1.840` en Archivo 900, `fontSize 9.5`, `letterSpacing -0.33` (`-.035em`), `lineHeight 9.5`, `#F4F6F8`; debajo `KCAL` en Hanken 800, `fontSize 5.5`, `letterSpacing 0.55` (`.1em`), `#6E7883`, `marginTop 2`.
Leyenda: columna `gap 4`; cada fila `flexDirection:'row'`, `alignItems:'center'`, `gap 4`, `fontSize 7.5`, Hanken 700, `#98A2B0`; punto `4x4 borderRadius 1`; valor en JetBrains Mono `#CDD3DB` con `marginLeft:'auto'`.
Entradas: `P 138` (`#7FB0FF`) · `C 196` (`#6FD3EA`) · `G 58` (`#FF9D7E`).

**Regla**: estos tres son los `accent-*` dark del DS a escala micro (trazo 4.6). Son tintes claros, no saturados, y son **los mismos que el alumno vera en Nutricion**. Recordatorio a1 §3.2: **nunca** `bg-sport-100` pelado en dark — en dark los `-100` son canales y dan color SOLIDO.

#### 3.2.4 Miniatura 3 — grafica de progreso (`react-native-svg`)

`<Svg width={102} height={42} viewBox="0 0 102 42">`, contenedor con `paddingTop: 8`.

```xml
<Defs>
  <LinearGradient id="gprog" x1="0" y1="0" x2="0" y2="1">
    <Stop offset="0" stopColor="#1A6BE6" stopOpacity="0.34"/>
    <Stop offset="1" stopColor="#1A6BE6" stopOpacity="0"/>
  </LinearGradient>
</Defs>
<Path d="M0 9H102M0 21H102M0 33H102" stroke="rgba(255,255,255,.055)" strokeWidth="1"/>
<Path d="M3 12 L19 16 L35 13 L51 22 L67 20 L83 28 L98 31 L98 41 L3 41 Z" fill="url(#gprog)"/>
<Path d="M3 12 L19 16 L35 13 L51 22 L67 20 L83 28 L98 31"
      fill="none" stroke="#7FB0FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
<Path d="M98 31 V41" stroke="rgba(127,176,255,.4)" strokeWidth="1" strokeDasharray="2 2.4"/>
<Circle cx="98" cy="31" r="4.6" fill="none" stroke="rgba(127,176,255,.34)" strokeWidth="1"/>
<Circle cx="98" cy="31" r="2.5" fill="#F4F6F8"/>
```

7 nodos de la serie, 3 hairlines de grilla, ultimo punto marcado con halo + plomada punteada. `stopOpacity` explicito obligatorio en los dos stops.

#### 3.2.5 Anatomia de las cards de rol (glass)

Contenedor comun `.role`: `flexDirection:'row'`, `alignItems:'center'`, `gap: 13`, `borderRadius: 20`, `padding: 15`, `minHeight: 86`, `overflow:'hidden'`, `position:'relative'`.

**Highlight superior de 1 pt** (lo que separa "card" de "rectangulo"): `<View>` absoluta `top:0, left:14, right:14, height:1, zIndex:2` con `LinearGradient` horizontal `transparent → rgba(255,255,255,.32) → transparent`. **Nunca** una linea plana de borde a borde.

**Card primaria — "Soy alumno"** (glass **teñido de marca**):
- Fondo: DOS `LinearGradient` apilados (el de marca encima del velo):
  1. velo: vertical `rgba(255,255,255,.05)` → `rgba(255,255,255,.015)`
  2. marca: vertical `rgba(26,107,230,.30)` → `rgba(26,107,230,.10)`
- Borde: `borderWidth 1`, `borderColor 'rgba(127,176,255,.30)'`
- Highlight interno: `<View>` 1pt `rgba(255,255,255,.10)`
- Under-glow: §1.6
- Color plano equivalente (usado por el morph, §4): **`#12203A`**

**Card secundaria — "Soy coach"** (glass neutro):
- Fondo: un `LinearGradient` vertical `rgba(255,255,255,.055)` → `rgba(255,255,255,.018)`
- Borde: `borderWidth 1`, `borderColor 'rgba(255,255,255,.13)'` (`border-default`)
- Highlight interno: `<View>` 1pt `rgba(255,255,255,.075)`
- Sin under-glow
- Color plano equivalente: **`#151A21`**

**Icon-tile** (`ricon`): 44x44, `borderRadius: 13`, centrado, `overflow:'hidden'`; highlight interno `<View>` 1pt `rgba(255,255,255,.16)`.
- variante *brand*: `backgroundColor 'rgba(26,107,230,.22)'`, `borderWidth 1`, `borderColor 'rgba(127,176,255,.30)'`
- variante *neutral*: `backgroundColor 'rgba(255,255,255,.055)'`, `borderWidth 1`, `borderColor 'rgba(255,255,255,.11)'`
- Icono **lucide** a **22 pt**, `strokeWidth 2`, `strokeLinecap/Linejoin 'round'`:
  - alumno = `user-round` → `<Circle cx=12 cy=8 r=5/><Path d="M20 21a8 8 0 0 0-16 0"/>`, stroke `#9CC4FF`
  - coach = `users-round` → `<Path d="M18 21a8 8 0 0 0-16 0"/><Circle cx=10 cy=8 r=5/><Path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>`, stroke `#CDD3DB`
- **Nunca color solido pelado**: el tile es canal de marca + alpha + borde + hairline interno.

**Chevron disco** (`go`): 34x34, `borderRadius: 17`, centrado. Icono `chevron-right` 16 pt, `strokeWidth 2.6`, cap/join round (`<Path d="m9 18 6-6-6-6"/>`).
- *fill* (card primaria): `backgroundColor '#1A6BE6'`, highlight interno 1pt `rgba(255,255,255,.24)`, stroke del icono `#FFFFFF`.
- *out* (card secundaria): `borderWidth 1`, `borderColor 'rgba(255,255,255,.22)'` (`border-strong`), stroke del icono `#98A2B0`.

**Jerarquia sin romper el un-solo-saturado**: la card de alumno es glass teñido y **solo su boton circular es saturado**; la de coach es glass neutro con chevron outline. Se conserva Hick's Law y la asimetria de la direccion §2, **sin** un bloque azul opaco de 86 pt. QA debe medir el contraste del titulo sobre el tint (>9:1 en el mockup).

#### 3.2.6 Densidad y colapso (obligatorio)

La pantalla mete 8 bloques en **751 pt utiles** (844 − 59 − 34) y queda con **~30 pt de holgura**.
- En **iPhone SE (667 pt)** el **tercer fragmento colapsa** y su copy se anexa al segundo. **Nunca** permitir que la card de alumno quede bajo el fold.
- Con `fontScale > 1.15`, los `small` de los fragmentos bajan a **1 linea** (`numberOfLines={1}`) **antes** de tocar los titulares.
- Prioridad de sacrificio: caption del frag 3 → frag 3 completo → caption del frag 2 → `foot`. Los titulares, el separador y las dos cards **nunca** se sacrifican.

---

### 3.3 FRAME 03 — Morph card alumno → `/alumno/codigo`

Es la **unica** familia de transicion donde f1 §5 permite un cambio de layout real (dimensionalidad genuina). Todo lo demas de la entrada es transform/opacity puro.

**Composicion (3 capas sobre la atmosfera):**
1. `under` — la pantalla 02 sigue montada, sin desmontarse.
2. `dim` — `<View>` absoluta full-bleed `backgroundColor 'rgba(7,8,12,.58)'`, `zIndex 3`.
3. `sheet` — el nodo que morfea, `zIndex 4`, `overflow:'hidden'`.

**Geometria del morph (normativa, medida en 390x844):**

| Propiedad | Origen (card) | Destino (sheet) |
|---|---|---|
| `top` | **595** | **126** |
| `left` / `right` | **24** / **24** | **0** / **0** |
| `bottom` | **163** | **0** |
| `borderTopLeftRadius` / `borderTopRightRadius` | 20 / 20 | **28 / 28** |
| `borderBottomLeftRadius` / `borderBottomRightRadius` | 20 / 20 | **0 / 0** |
| `backgroundColor` | **`#12203A`** | **`#0F131A`** |
| borde | `1 pt rgba(127,176,255,.30)` | se conserva |

Recorrido: **469 pt**. (La nota del mockup dice "452 px": es una aproximacion vieja; el valor normativo es el del keyframe.)

El tint azul del glass **baja a superficie neutra** durante el mismo tramo: el destino ya no es "la card", es una pantalla.

**Contenido del sheet** — dos capas absolutas `inset:0` que se cruzan:
- `sheetsm` (contenido de card): la fila icon-tile + textos + chevron, identica al frame 02.
- `sheetlg` (contenido de pantalla): `padding: 30 / 22 / 34`.
  - `sheetgrab`: 42x4, `borderRadius 999`, `rgba(255,255,255,.18)`, centrado, `marginBottom: 24`
  - `h3` **`Codigo de tu coach`** — Archivo 900, `fontSize 25`, `letterSpacing -0.70` (`-.028em`), `lineHeight 27` (1.08), `#F4F6F8`, `marginBottom 8`
  - `p` `Ingresalo una sola vez. Queda guardado en este telefono.` — Hanken 600, `fontSize 13`, `lineHeight 19` (1.45), `#86919E`, `marginBottom 20`
  - campo en reposo + CTA `Continuar` al 42% de opacidad (deshabilitado)
  - pie: separador `o` + boton fantasma `Abrir mi enlace de invitacion` + `No tienes codigo?` / **`Pideselo a tu coach`**

**El icon-tile y el titulo NO se mueven mientras se desvanecen** — el movimiento lo hace el contenedor.

**La atmosfera NO se desmonta**: el mismo canvas `#07080C` sigue debajo. Por eso al llegar a `/alumno/codigo` no hay ni un frame de otro color.

---

### 3.4 FRAME 04 — `/alumno/codigo` dark

**Presupuesto de novedad**: todo el motion expresivo se gasto en 01 y 02. **Aca la pantalla es deliberadamente aburrida** — familiar, rapida, sin sorpresas. Lo unico que importa es que sea **del mismo color**.

**Layout**
- `navbar`: `paddingTop: 6`, `marginBottom: 30`, `row / space-between / center`
  - **back** 40x40, `borderRadius 13`, `LinearGradient` vertical `rgba(255,255,255,.06)` → `rgba(255,255,255,.02)`, `borderWidth 1` hairline, highlight interno 1pt `rgba(255,255,255,.09)`; icono `arrow-left` 18 pt, `strokeWidth 2.2`, color `#CDD3DB` (`<Path d="M19 12H5"/><Path d="m12 19-7-7 7-7"/>`)
  - centro: **figura EVA a 22x20, `opacity .82`, SIN wordmark**. Es la misma pieza del frame 01, no otro asset. A partir de aca la marca es firma, no protagonista.
  - derecha: `Paso 1 de 2` — Hanken 800, `fontSize 10`, `letterSpacing 1.2` (`.12em`), UPPER, `#86919E`
- `h2` **`Ingresa el codigo`** / **`de tu coach`** — Archivo 900, `fontSize 29`, `letterSpacing -0.87` (`-.03em`), `lineHeight 31` (1.08), `#F4F6F8`, `marginBottom 10`
- sub `Te lo comparte por WhatsApp, o te manda un enlace y entras directo sin escribir nada.` — Hanken 600, `fontSize 13.5`, `lineHeight 20` (1.5), `#CDD3DB`, `maxWidth 308`, `marginBottom 26`
- **campo** (`field`), estado enfocado: `height 62`, `borderRadius 14`, `backgroundColor '#1F262F'` (`surface-sunken`), `borderWidth 1.5`, `borderColor '#1A6BE6'`, anillo de foco = `<View>` absoluta `inset:-4 borderRadius:18 borderWidth:4 borderColor:'rgba(26,107,230,.15)'`, highlight interno 1pt `rgba(255,255,255,.05)`, `paddingHorizontal 14`, `gap 10`, `marginBottom 11`.
  Estado reposo: `borderWidth 1`, `borderColor 'rgba(255,255,255,.13)'`, sin anillo, highlight interno 1pt `rgba(255,255,255,.045)`.
  - valor: **JetBrains Mono 700**, `fontSize 19`, `letterSpacing 2.47` (`.13em`), UPPER, `#F4F6F8` (un codigo se lee mejor monoespaciado)
  - placeholder: Hanken 600, `fontSize 14`, `letterSpacing 1.4` (`.1em`), `#5C656F`, sin uppercase — `Ej: JOSEFIT`
  - chip **`Pegar`**: `fontSize 10.5`, Hanken 800, `letterSpacing 0.735` (`.07em`), UPPER, color `#7FB0FF`, `borderWidth 1`, `borderColor 'rgba(127,176,255,.3)'`, `borderRadius 999`, `padding 5/10`
- helper `Letras y numeros, sin espacios.` — Hanken 600, `fontSize 12`, `#86919E`, `marginBottom 24`
- **CTA** `Continuar`: `height 56`, `borderRadius 14`, `backgroundColor '#1A6BE6'`, texto Archivo/Hanken 900 `fontSize 16` `letterSpacing -0.16` `#FFFFFF`, highlight interno 1pt `rgba(255,255,255,.2)`, sombra §1.6
- separador `o`: `marginVertical 18`, hairlines + `fontSize 10.5` Hanken 800 `letterSpacing 1.575` (`.15em`) UPPER `#5C656F`
- **boton fantasma** `Abrir mi enlace de invitacion`: `height 52`, `borderRadius 14`, `LinearGradient` vertical `rgba(255,255,255,.05)` → `rgba(255,255,255,.015)`, `borderWidth 1` `rgba(255,255,255,.13)`, highlight interno 1pt `rgba(255,255,255,.07)`, icono lucide `link` 17 pt, texto Hanken 800 `fontSize 14` `#CDD3DB`, `gap 9`, `marginTop 11`
- pie: `No tienes codigo?` / **`Pideselo a tu coach`** ` — es el mismo que usa en su perfil.` — Hanken 600, `fontSize 12`, `lineHeight 18` (1.5), `#86919E`; el fragmento en negrita en `#7FB0FF` Hanken 800

**Bloqueante**: hoy `ForceLightTheme` hardcodea claro (`ThemeContext.tsx:127-163`) y esta ruta entra en **flash blanco**. Sin `ForceScheme scheme="dark"` + `DARK_SCHEME_VARS` + `StatusBar light` (call site `alumno/codigo.tsx:33`), el concepto se rompe justo aca.

---

### 3.5 FRAME 05 — Morph card coach → login de coach

Mismo motor que el 03, distinto origen: la card **secundaria** (glass neutro) parte 97 pt mas abajo y recorre mas distancia.

**Geometria del morph:**

| Propiedad | Origen | Destino |
|---|---|---|
| `top` | **692** | **126** |
| `left` / `right` | 24 / 24 | 0 / 0 |
| `bottom` | **66** | **0** |
| radios | 20 en las 4 | **28 / 28 / 0 / 0** |
| `backgroundColor` | **`#151A21`** | **`#0F131A`** |
| borde | `1 pt rgba(255,255,255,.13)` | se conserva |

Recorrido: **566 pt** contra 469 del alumno. Se mantiene la **misma duracion**, no la misma velocidad: distancias distintas con igual duracion se perciben como un mismo sistema (f1 §1).

**Contenido del `sheetlg`:**
- grab 42x4 + eyebrow: figura EVA 22x20 + gap 9 + `Panel de coach` (Hanken 800, `fontSize 9.5`, `letterSpacing 1.52` (`.16em`), UPPER, `#6E7883`), `marginBottom 16`
- `h3` **`Entra a tu panel`** (mismo estilo que 3.3)
- `p` `Con la misma cuenta que usas en la web.`
- campo **email** en reposo: `height 56`, `marginBottom 10`, icono lucide `mail` 19 pt `#79838E`, placeholder `coach@correo.com` (`fontSize 14.5`, `#79838E`)
- campo **password** enfocado: `height 56`, `marginBottom 8`, icono lucide `lock` 19 pt `#9CC4FF`, valor `••••••••` con `letterSpacing 5.1` (`.3em`) `fontSize 17`, icono lucide `eye` 19 pt a la derecha (**el ojito ya existe en el repo, PR #154 — se reusa, no se redibuja**)
- `Olvide mi contrasena` alineado a la derecha: Hanken 700, `fontSize 11.5`, `#7FB0FF`, `marginBottom 18`
- CTA **`Entrar`** (56 pt, `#1A6BE6`)
- pie: `Aun no tienes cuenta de coach?` / **`Creala en 1 minuto`** (`#7FB0FF`, 800) — Hanken 600, `fontSize 11.5`, `lineHeight 17` (1.5), `#6E7883`, centrado, `marginTop 16`
- **nota informativa** al fondo (`marginTop:'auto'`): `padding 13/14`, `borderRadius 14`, `LinearGradient` vertical `rgba(255,255,255,.045)` → `rgba(255,255,255,.015)`, `borderWidth 1` hairline, highlight interno 1pt `rgba(255,255,255,.07)`, icono lucide `info` 17 pt `#6E7883`, gap 11, texto Hanken 600 `fontSize 11.5` `lineHeight 17` `#86919E`: `Tus alumnos no entran por aca: ellos usan ` + **`Soy alumno`** (`#CDD3DB`, 800) + ` con tu codigo.`

**Identidad: EVA hasta conocer al coach.** El coach que entra a su panel **es** la marca; su branding se aplica recien despues del login (`(auth)/_layout` es branded, pero aqui todavia no hay `coachId`). Por eso el sheet es identidad EVA pura, `cta-fill #1A6BE6`, **sin white-label**. La transicion a su panel brandeado ocurre en el frame 07.

**Teclado**: `KeyboardAvoidingView` con `behavior="padding"`. El sheet **crece, no se desplaza**: ya ocupa desde 126 pt, asi que al abrir el teclado el contenido se comprime **dentro** del sheet en vez de empujar la pantalla completa. Nada de `height` animado en el hot path (f1 §5). El CTA queda **siempre visible**.

**Costura pendiente (decision del owner)**: si el selector queda dark y el login del **alumno** sigue `ForceLightTheme` branded, hay flash claro al tocar "Soy alumno". Para coach el problema no existe. Ver `SPEC.md` §Alcance.

---

### 3.6 FRAME 06 — Splash de retorno branded (r2-c + capa de luz de r2-b)

**Rol**: con sesion viva **no hay selector ni pantalla de valor**. La fase `checking` **ES** el splash. El loader "Preparando EVA…" y el `EvaLoaderScreen` desaparecen de la entrada (hoy montan **dos** `AppBackground` Skia apilados en el peor momento del cold start, a1 §2.3).

**Composicion**: ver §2.3 (4 nodos + crosshatch compartido).

**Capa A — identidad EVA**: identica al frame 01 (figura 150x135 + hairline 34x1 + wordmark `EVA`).

**Capa B — marca del coach** (estilos de r2-c, lineas 441-452):
- **Con logo** (`logoUrlDark ?? logoUrl`): `expo-image`, `width 96`, `height 96`, `contentFit:'contain'`, `borderRadius 28`, `transition={0}`.
- **Sin logo → tile de iniciales**: 96x96, `borderRadius 28`, `LinearGradient` a **160°** (`start:{x:0,y:0} end:{x:0.94,y:0.34}` aprox) `#17C084` 0% → `#12A971` 62% → `#0C8259` 100% *(demo; en produccion: `lighten(accent, 12%)` → `accent` → `darken(accent, 28%)`)*; borde overlay `<View>` absoluta `inset:0 borderRadius:28 borderWidth:1 borderColor:'rgba(255,255,255,.16)'`; highlight interno 1.5pt `rgba(255,255,255,.28)`; iniciales `fontSize 35`, Archivo 900, `letterSpacing -1.575` (`-.045em`), `#FFFFFF`.
- **Nombre**: `marginTop 19`, Archivo 900, `fontSize 19`, `letterSpacing -0.38` (`-.02em`), `#F4F6F8` — `displayName` (`JoseFit Entrenamiento` en el demo).
- **Saludo**: `marginTop 7`, Hanken 700, `fontSize 11`, `letterSpacing 1.65` (`.15em`), UPPER, `#6E7883` — `Hola de nuevo, {nombre}`.

**Rail de progreso** (2 tramos, `xfrail`): `position:'absolute'`, `left/right 24`, `bottom 132`, `flexDirection:'row'`, `gap 8`; cada tramo `flex:1`, `height 3`, `borderRadius 999`, `backgroundColor 'rgba(255,255,255,.09)'`, `overflow:'hidden'`; relleno `<Animated.View>` `inset:0`, `transformOrigin:'left center'`, `scaleX 0→1`.
- Tramo A: `#7FB0FF` (fase EVA: lectura de branding + sesion).
- Tramo B: acento del coach, `#55E0A8` en el demo (fase branded: resolucion de ruta).
- **Solo se monta si el gate supera 600 ms** (misma regla que el `morphbar` del frame 01). Si resuelve antes, ni se ve.

**Nunca `#FFF` puro** en ningun texto de este frame.

**Cuando la marca del coach es azul, el frame se ve casi igual al 01 — y esta bien.** El verde del demo esta elegido para que el white-label **se note** en revision, no porque el verde sea parte del diseno.

---

### 3.7 FRAME 07 — Llegada al dashboard (glimpse / skeleton fiel)

**Rol**: glimpse deliberadamente de **baja fidelidad**. Es el esqueleto real del home del coach (`coach/(tabs)/home.tsx`), no un dashboard inventado. Prueba **una sola cosa**: que la atmosfera y el acento del coach **sobreviven** al cruce desde el splash. **Ningun dato es real.**

**Orden de montaje (identico al archivo real):** `MobileGreetingHeader` → `MobilePulseHero` → `MobileFocusList` → `MobileTodayAgenda` → `MobileNovedades` → `MobileOnboardingGuideChip`, + `MobileQuickActionsFab` fijo sobre el scroll + tab bar `Dashboard / Alumnos / Programas / Ejercicios / Nutricion`.

**Anatomia**
- Scroll: `paddingTop 2`, `paddingHorizontal 20`.
- **Header**: `row`, `gap 11`, `marginBottom 18`. Avatar 38x38 `borderRadius 12`, `LinearGradient` 160° `#17C084` → acento, iniciales `fontSize 13` Archivo 900 `letterSpacing -0.39`, `#FFFFFF`, highlight interno 1pt `rgba(255,255,255,.26)`. Icon-buttons 34x34 `borderRadius 11`, `rgba(255,255,255,.05)`, borde hairline, icono 16 pt `#98A2B0`; badge 6x6 en acento del coach.
- **Card** (`dcard`): `borderRadius 20`, `padding 14`, `LinearGradient` vertical `rgba(255,255,255,.045)` → `rgba(255,255,255,.015)`, `borderWidth 1` hairline, highlight interno 1pt `rgba(255,255,255,.07)`, `marginBottom 12`, `overflow:'hidden'`.
  - variante **deep** (`MobileFocusList`): `LinearGradient` vertical `#12161D` → `#0D1116`, `borderColor 'rgba(255,255,255,.13)'`.
- **Titulo de seccion** (`dsec`): Hanken 800, `fontSize 10`, `letterSpacing 1.5` (`.15em`), UPPER, `#86919E`, `marginBottom 10`, `marginLeft 2`. Copys: `Pulso de hoy`, `Prioridad de hoy`, `Agenda de hoy`, `Novedades`.
- **KPIs**: `row gap 10`; separador entre KPIs = `borderLeftWidth 1` hairline + `paddingLeft 10`.
- **Filas** (`drow`): `row`, `gap 10`, `paddingVertical 9`; separador `borderTopWidth 1` hairline. Avatar de fila 30x30 `borderRadius 10` `rgba(255,255,255,.06)` + borde hairline (circular en `Novedades`).
- **Skeleton** (`sk`): `borderRadius 5`, base `rgba(255,255,255,.055)`; shimmer = `LinearGradient` horizontal `rgba(255,255,255,.055)` → `rgba(255,255,255,.115)` (50%) → `rgba(255,255,255,.055)`, ancho `240%` del bloque, animado en `translateX` (ver §4).
  - variante **accent**: `rgba(coach,.30)` → `rgba(coachSoft,.55)` → `rgba(coach,.30)`. Se usa en: el primer KPI, la barra de progreso al 46%, el chip de la primera fila de prioridad y el icono del chip de onboarding.
- **FAB**: `position:'absolute'`, `right 20`, `bottom 92`, 54x54, `borderRadius 18`, `LinearGradient` 160° `#17C084` → acento, sombra `shadowColor` = acento `offset {0,12} opacity .5 radius 18 elevation 10`, highlight interno 1.5pt `rgba(255,255,255,.26)`, icono `plus` 23 pt `strokeWidth 2.4` `#FFFFFF`.
- **Tab bar**: `position:'absolute'`, full width, `height 74`, `LinearGradient` vertical `rgba(10,13,18,.86)` 0% → `#0A0D12` 46%, `borderTopWidth 1` hairline, `paddingTop 11`, `paddingHorizontal 12`, `expo-blur` `intensity 12` (**unico uso de blur en toda la familia**). Item: icono 20 pt + label Hanken 700 `fontSize 9.5` `letterSpacing -0.095`, inactivo `#6E7883`, **activo = acento del coach** (`#55E0A8` demo, icono y label).
- **Scrim de acento**: `<Svg>` full-bleed, `RadialGradient cx="50%" cy="0%" rx="60%" ry="30%"`, stops `0 → coach @ 0.10`, `0.62 → coach @ 0`.

**Continuidad del acento**: el acento que se encendio en el frame 06 **es el mismo** que pinta el tab activo, el FAB, el avatar y el KPI destacado.

**Costura de canvas — bloqueante**: el canvas del splash es `#07080C` y `surface-app` dark es `#0A0D12`. Son 3-4 puntos de luminancia y **es justo aqui donde se ven**. Reconciliar en UNA sola direccion **antes** de codificar (ver §5, token `canvas-entry`).

**Para el alumno es el mismo contrato**: el gate 1 (`index.tsx:46-54`) ya bifurca a `/coach/home` o `/alumno/home` segun `getCoachProfile()`. Lo unico que cambia entre los dos aterrizajes es **que superficie se monta**, no el motion.

---

## 4. Tabla de motion COMPLETA

**Lenguaje**: se reusa el del ejecutor V3 (`@eva/brand-kit/motion` via `apps/mobile/lib/motion.ts`). **No inventar curvas.**

| Token | Valor | Uso en esta familia |
|---|---|---|
| `EASING.standard` | `cubic-bezier(0.2, 0, 0, 1)` | **default de toda la familia** — es exactamente el `cubic-bezier(.2,0,0,1)` del mockup |
| `EASING.accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | salidas (timing asimetrico) |
| `EASING.inOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | respiracion del halo |
| `SPRING.ui` | `{damping:18, stiffness:220, mass:1}` | pressed |
| `EASING.spring` | `cubic-bezier(0.34,1.56,0.64,1)` | **PROHIBIDO en esta familia** (overshoot; f1 §2) |

**Reglas transversales**
- Solo `transform` + `opacity`, con la **unica excepcion** del morph (§4, filas M1/M2), autorizada por f1 §5.
- `useReducedMotion()` de Reanimated en **todas** las piezas (unificar: `EvaLoader` usa hoy `AccessibilityInfo`, a1 §2).
- Toda animacion es **interrumpible** por gesto; el back cancela el morph.
- Ninguna variante supera **3 destellos/segundo** (WCAG 2.3.1).
- Presupuesto: ≤2 nodos animados en 01 y 06, ≤7 grupos en 02, 3 nodos en 03/05, 1 nodo + skeletons en 07.

### 4.1 Tabla

| # | Pieza | Propiedad | Duracion | Easing / spring | Delay / stagger | Reduce-motion | API RN |
|---|---|---|---|---|---|---|---|
| **S1** | 01 · Handoff nativo → JS | `opacity` del splash nativo | **300 ms** | del sistema | — | igual (lo maneja el SO) | `SplashScreen.setOptions({fade:true})` — **solo iOS**; en Android no existe crossfade nativo, la continuidad se fabrica con color identico |
| **S2** | 01 · Figura EVA (entrada) | `opacity 0→1`, `scale .965→1` | **360 ms** | `EASING.standard`, sin rebote | 0 | **fade puro, sin scale** | `Moti` `from/animate` |
| **S3** | 01 · Halo de marca (respiracion) | `opacity .55↔.95` | **2800 ms**, loop `alternate` | `EASING.inOut` | 0 | **opacidad fija .70, sin respiracion** | `Moti` `loop + type:'timing'` sobre el `<Svg>` de la fuente puntual |
| **S4** | 01 · Loader morphbar | `translateX 0→62` + `scaleX 1→.6` (hold 45-55%) → vuelve | **1400 ms**, loop | `cubic-bezier(.4,0,.2,1)` | solo si el gate > **600 ms** | **barra estatica al 40%** | `Reanimated` `withRepeat(withSequence(...))`. **NUNCA `ActivityIndicator`** |
| **V1** | 02 · Cascada de entrada | `opacity 0→1`, `translateY 12→0` | **280 ms** por paso | `EASING.standard` | **stagger 70 ms**, 7 pasos: `0 / 70 / 140 / 210 / 280 / 350 / 420` | **todos juntos, 1 solo fade de 200 ms, sin translateY** | `Moti` con `delay` por indice |
| | | Orden: (0) lockup+kicker+H1 · (70) subtitulo · (140) frag 1 · (210) frag 2 · (280) frag 3 · (350) separador + card alumno · (420) card coach + pie | | | **Cascada completa = 700 ms** | | Cada fragmento entra como **UN nodo**, no elemento por elemento: la miniatura es estatica dentro de su contenedor animado |
| **V2** | 02/04 · Pressed de card y CTA | `scale 1→.98` + velo a **8%** | **140 ms** | `SPRING.ui` | — | **solo el velo sube a 8%, sin scale** | `onPressIn`/`onPressOut` + `Animated.View`. **PROHIBIDO** `style` funcion junto a `className` |
| **V3** | 02/03/05 · Haptica de seleccion de rol | — | — | — | 1 sola vez, en el **commit** del rol (nunca durante el gesto) | igual | `expo-haptics` `selectionAsync()`. **JAMAS** `notificationAsync(Success)` — todavia no hay exito que confirmar (f1 §10) |
| **M1** | 03 · Morph card alumno → sheet | `top / left / right / bottom` + `borderRadius` + `backgroundColor` | **260 ms** | `EASING.standard` | 0 | **sin morph: corte con fade de 160 ms; el dim se aplica instantaneo** | `Reanimated` `useAnimatedStyle` sobre UN nodo `position:'absolute'` (hilo UI) + `interpolateColor` para el fondo |
| **M2** | 05 · Morph card coach → sheet | idem | **260 ms** (misma duracion, mayor distancia) | `EASING.standard` | 0 | idem M1 | idem M1 |
| **M3** | 03/05 · Salida del contenido de card | `opacity 1→0` | **120 ms** | `EASING.accelerate` | 0 | corte | `Moti`. **El icon-tile y el titulo no se mueven mientras se desvanecen** |
| **M4** | 03/05 · Entrada del contenido de sheet | `opacity 0→1` | **200 ms** | `EASING.standard` | **60 ms** | corte | `Moti`. Timing asimetrico: lo que se va sale mas rapido de lo que entra (f1 §1) |
| **M5** | 03/05 · Dim del fondo | `opacity 0→1` sobre `rgba(7,8,12,.58)` | **200 ms** | `EASING.standard` | 0 | **instantaneo** | `Moti`. Sin `scale` ni `blur`. El fondo **no se desmonta** |
| **M6** | 03/05 · Degradacion obligatoria | — | **160 ms** cross-fade | `EASING.standard` | — | — | Si el device no sostiene 60 fps → cross-fade plano. **Es preferible perder el efecto que perder los frames** |
| **C1** | 04 · Cascada de `/alumno/codigo` | `opacity` + `translateY 12→0` | **220 ms** | `EASING.standard` | **stagger 60 ms**, 5 pasos (`0/60/120/180/240`) | **fade unico de 180 ms sin stagger** | `Moti`. Mas corta y mas plana que la 02 a proposito |
| **C2** | 04 · Foco del input | `borderColor` + anillo `opacity` | **120 ms** | `EASING.standard` | 0 | igual (no hay desplazamiento) | `Moti`. **Sin `scale`**. Caret **nativo**, sin animacion custom |
| **C3** | 04 · Error de codigo invalido | `translateX ±6`, **2 ciclos** | **180 ms** | `EASING.standard` | 0 | **borde `cta-danger` + mensaje, sin desplazamiento** | `Reanimated` `withSequence`. Haptica `notificationAsync(Error)` — **unico caso de toda la entrada donde la haptica sube de nivel** |
| **R1** | 06 · Hold de continuidad | — | **120 ms** | — | t0 | **no aplica: se monta ya branded** | El estado EVA intermedio nunca se muestra en reduce-motion |
| **R2** | 06 · Crossfade de la MARCA | capa EVA `opacity 1→0`; capa coach `opacity 0→1` + `scale .955→1` | **260 ms** | `EASING.standard` | t0+120, **simultaneas** | **fade unico de 160 ms directo a la marca del coach, sin scale** | `Moti` sobre 2 capas apiladas |
| **R3** | 06 · Crossfade de la LUZ | 2 `EntryAtmosphere` apiladas, `opacity` cruzada | **260 ms** | `EASING.standard` | **t0+120 — la MISMA timeline que R2** | **la capa de luz aparece ya en el acento del coach** | `Moti`. **No se interpola el color del gradiente**: se cruzan opacidades. 2 nodos, cero relayout |
| **R4** | 06 · Rail de progreso (2 tramos) | `scaleX 0→1`, `transformOrigin` izquierda | determinada por el gate | `EASING.standard` | tramo A desde t0; tramo B tras R2 | **rail estatico** | `Reanimated`. Solo si el gate > 600 ms |
| **D1** | 07 · Entrada del dashboard | `opacity 0→1`, `translateY 8→0`, `scale .985→1` | **200 ms** | `EASING.standard` | **sin stagger** | **fade unico de 160 ms, sin translateY ni scale** | `Moti` sobre UN contenedor. Escalonar decenas de nodos en cold start es exactamente lo que f1 §0 prohibe |
| **D2** | 07 · Shimmer del skeleton | `translateX` de un `LinearGradient` de ancho 240% | **1900 ms**, loop | `linear` | 0 | **bloque estatico al 8% de alpha** — la carga se comunica por forma, no por movimiento | `Moti` `loop`. 1 sweep / 1.9 s = **0.53 destellos/s** ✓. **Se detiene en cuanto llegan los datos y NUNCA se encadena a una animacion de aparicion del dato real** (doble movimiento = jank percibido) |
| **A1** | Todas · Cambio de `--heat` / `bottomCy` entre pantallas | `stopOpacity` + `cy` del `EntryAtmosphere` | **200 ms** | `EASING.standard` | 0 | **salto directo al valor destino** | `Reanimated` `useAnimatedProps` sobre `<Stop>` y `<RadialGradient>` (`createAnimatedComponent`). **Interpolado, no reemplazado** |
| **X1** | Todas · Crosshatch, canvas, hairlines, bordes, tipografia | — | **NO ANIMAN NUNCA** | — | — | — | Estaticos por contrato. Son el sello |

### 4.2 Los dos morphs — geometria y fallback (detalle)

**Por que es seguro animar layout aqui** (unica excepcion a f1 §5): el nodo que morfea es `position:'absolute'` con `zIndex 4`, y **sus dos hijos tambien son `position:'absolute'` con `inset:0`**. No hay cascada de Yoga: ni hermanos ni hijos se re-miden. Reanimated 4 aplica el estilo en el hilo UI sin round-trip a JS. Si el profiling en gama baja muestra caida bajo 60 fps, se degrada a **M6** (cross-fade 160 ms) — decision de perfilado, no de gusto.

| | Morph alumno (M1) | Morph coach (M2) |
|---|---|---|
| `top` | 595 → 126 | 692 → 126 |
| recorrido | **469 pt** | **566 pt** |
| `left` / `right` | 24 → 0 | 24 → 0 |
| `bottom` | 163 → 0 | 66 → 0 |
| radios (TL/TR/BL/BR) | 20/20/20/20 → **28/28/0/0** | 20/20/20/20 → **28/28/0/0** |
| `backgroundColor` | `#12203A` → `#0F131A` | `#151A21` → `#0F131A` |
| borde | `rgba(127,176,255,.30)` (se conserva) | `rgba(255,255,255,.13)` (se conserva) |
| duracion | **260 ms** | **260 ms** (misma duracion, NO misma velocidad) |

**Swap de gradiente a solido**: al inicio del morph la card cambia su pila de `LinearGradient` por su **color plano equivalente** (`#12203A` / `#151A21`). Es visualmente indistinguible bajo el dim y permite interpolar el fondo con `interpolateColor` (RN no interpola gradientes). Al terminar el morph, el sheet queda en solido `#0F131A` — no vuelve a gradiente.

**Back**: cancela el morph en curso y lo reproduce invertido con la misma curva y duracion. Nunca "salta" al origen.

---

## 5. Tokens nuevos requeridos y assets

### 5.1 Tokens

Todos los tokens nuevos son **dark-only y no flipean** (la entrada es dark forzado). Por eso se declaran en `:root` de `apps/mobile/global.css` con el mismo valor en ambos esquemas → **no requieren entrada en `LIGHT_SCHEME_VARS` ni en el futuro `DARK_SCHEME_VARS`**. Los que llevan alpha horneado siguen la convencion de `--color-border-*` (color completo, no canal): la clase pelada resuelve el alpha correcto y **no** se les aplica modificador `/[x]`.

| Token | Valor | `global.css` | `lib/theme.ts` | `TOKENS.md` | Notas |
|---|---|---|---|---|---|
| `--color-canvas-entry` | `7 8 12` (`#07080C`) | `:root` (canal RGB) | `DS.canvasEntry = '#07080C'` | §3 nueva fila + nota de drift | Resuelve el drift `surface-app #0A0D12` ↔ splash `#07080C`. **Decision normativa: NO mover `surface-app`.** La entrada usa `canvas-entry`; el dashboard sigue en `surface-app`. El escalon de 3 puntos queda **detras** del fade de 200 ms del frame 07 (D1), donde no se lee. |
| `--color-surface-veil` | `rgba(255,255,255,0.045)` | `:root` | `DS.surfaceVeil` | §3, gap a1 §3.3 cerrado | Velo elevado plano. Utilidad `bg-surface-veil`. |
| `--color-surface-veil-2` | `rgba(255,255,255,0.07)` | `:root` | `DS.surfaceVeil2` | §3 | Velo del estado pressed (el "8%" redondea a este token). |
| `--glass-top` | `rgba(255,255,255,0.055)` | `:root` | `DS.glassTop` | §5 (nueva subseccion "Glass") | Stop superior de TODA superficie glass (cards, tiles, botones fantasma, dcards). |
| `--glass-bottom` | `rgba(255,255,255,0.018)` | `:root` | `DS.glassBottom` | §5 | Stop inferior. |
| `--glass-highlight` | `rgba(255,255,255,0.32)` | `:root` | `DS.glassHighlight` | §5 | Pico del highlight superior de 1 pt (gradiente horizontal que se desvanece en los extremos). |
| `--glass-inset` | `rgba(255,255,255,0.075)` | `:root` | `DS.glassInset` | §5 | Hairline interno por defecto. Variantes literales del mockup: `.10` (card primaria), `.085` (tile), `.09` (back), `.07` (dcard/ghostbtn), `.16` (icon-tile), `.24` (chevron fill), `.26`/`.28` (avatar/FAB/coach-tile). **Se documentan como escala `glass-inset-{07,075,085,09,10,16,24,26,28}` o se pasan como prop `insetAlpha`; la segunda opcion es la recomendada** (9 tokens para 1 hairline es ruido). |
| `--color-text-faint` | `#6E7883` | `:root` (color completo) | `DS.textFaint` | §2/§3, escala de texto | **Nuevo escalon bajo `text-subtle`.** Colapsa los literales del mockup: `#6E7883`, `#69727C`, `#79838E`. Usos: `tiletag`, `foot`, `coachsub`, labels del tab bar, letras L-D de la semana, `KCAL`. |
| `--color-text-ghost` | `#5C656F` | `:root` | `DS.textGhost` | §2/§3 | Escalon mas bajo aun. Colapsa `#5C656F` y `#4C555F`. Usos: separador `o`, placeholder del campo de codigo, chevron del chip de onboarding. |
| `--color-text-on-glass-brand` | `#B7CDF0` | `:root` | `DS.textOnGlassBrand` | §2 | Caption sobre glass teñido de marca (card primaria). Hoy no existe par de foreground para superficies teñidas. |
| `--color-brand-hi` | `#9CC4FF` (= `sport-700` dark) | ya existe como `--color-sport-700` | `DS.brandHi` | ya documentado | **No es token nuevo**: se referencia `sport-700` dark. Se lista para evitar que se hardcodee. |
| `--grain-line-h` | `rgba(255,255,255,0.012)` | `:root` | `DS.grainLineH` | §5 nueva subseccion "Textura" | Linea horizontal del crosshatch. |
| `--grain-line-v` | `rgba(255,255,255,0.010)` | `:root` | `DS.grainLineV` | §5 | Linea vertical. |
| `--grain-cell` | `3` | — (numerico, solo TS) | `DS.grainCell = 3` | §5 | Celda del pattern en pt. |
| `--grain-opacity` | `0.5` | — | `DS.grainOpacity = 0.5` | §5 | Opacidad de la capa completa. |
| `--lux-rgb` | `26 107 230` (default EVA) | `:root` | `DS.luxRgb` | §7 (white-label) | Canal de la capa de luz. Lo pisa el acento del coach en 06-07 via prop, **no** via `vars()` (el `EntryAtmosphere` recibe el hex como prop). |
| `--lux-soft-rgb` | `127 176 255` (default EVA) | `:root` | `DS.luxSoftRgb` | §7 | Canal del horizonte. Coach: version clara del acento. |

**Lo que NO se agrega**: nada de vineta (§1.7, apagada), nada de blur salvo el tab bar, ningun token de sombra nuevo (los glows se dibujan, §1.6), cero dependencias nuevas.

**Radios**: todos los del mockup ya existen (`rounded-card` 20, `rounded-control` 14, `rounded-sheet` 28, `rounded-pill` 999). El **13** del icon-tile y el **11/12/18** del frame 07 **no** estan en la escala. Normativo: **icon-tile pasa a 14** (`rounded-control`), y en el frame 07 se usan 14 y 20. Se elimina "nada intermedio inventado" — el mockup incumple su propia regla en 4 puntos y aqui se corrige.

**Infra requerida (no es token, es prerequisito bloqueante)**:
- `ForceScheme scheme="dark"` parametrizando `ForceLightTheme` (`ThemeContext.tsx:127-163`) + `DARK_SCHEME_VARS` espejo de `LIGHT_SCHEME_VARS` (`lib/theme.ts:610-679`) + `StatusBar style="light"`. Call sites: `index.tsx:27`, `alumno/codigo.tsx:33`.
- Fix `stopOpacity` en `AmbientBrandGlow.tsx:74-86` y `GlassCard.tsx:57-58` (afecta prod hoy: brand.tsx, ProgramLibraryHero, NutritionHeader).
- Barrido `className` + `style`-funcion (`index.tsx:180-188`, `Walkthrough.tsx:311-316`).
- `AppBackground.tsx:28` debe leer `resolvedScheme`, no `mode`.

### 5.2 Assets

**`apps/mobile/assets/eva-icon.png` — VERIFICADO, es el asset correcto.**

Inspeccion real del binario:
- Dimensiones **585 x 526** px, `Format32bppArgb`.
- Pixeles opacos: **RGB medio (248, 248, 248)**; muestreo directo en el interior de la figura devuelve **`#FFFFFF` con A=255**. Es blanco puro, no gris.
- Fondo: **totalmente transparente** (A=0 en el 85% del canvas).
- Es una **silueta rellena** (figura saltando), no un contorno.

Contraste con `eva-mark-filled.png` (mismas dimensiones y mismo alpha, pero **RGB medio 27** = la variante NEGRA): es el que apunta hoy `app.json:111,116` sobre `#07080C` → contraste ~1:1 → **la pantalla se ve vacia** (QA ronda 1, F10). Es exactamente el bug que este redesign cierra.

**Hallazgo adicional (accionable)**: el alpha de `eva-icon.png` es practicamente **binario** — de 77.059 muestras, solo **29** tienen alpha intermedio. El PNG no trae antialiasing en el canal alpha. A 150 pt desde una fuente de 585 px el downscale (~4x) lo suaviza y no se ve; **pero no usar este asset a tamano nativo ni ampliado**, y en el splash **nativo** verificar en device que el remuestreo de Android no produzca bordes dentados a `imageWidth` bajos.

**Cambios requeridos en `apps/mobile/app.json` (BINARIO, no OTA — es recurso del plugin `expo-splash-screen`; exige bump de `version` con `runtimeVersion.policy: appVersion`):**

```jsonc
["expo-splash-screen", {
  "image": "./assets/eva-icon.png",   // era ./assets/eva-mark-filled.png
  "imageWidth": 150,                   // era 180 — el mockup dibuja 150x135 (aspect 585:526)
  "resizeMode": "contain",
  "backgroundColor": "#07080C",        // ya correcto
  "dark": { "image": "./assets/eva-icon.png", "backgroundColor": "#07080C" }
}]
```

**Ademas — gap detectado, no estaba documentado**: `app.json` **no declara `expo.backgroundColor` ni `android.backgroundColor`**. Sin eso, el window background de Android puede resolver a blanco y producir el flash que el criterio de aceptacion 1 prohibe. Agregar `"backgroundColor": "#07080C"` a nivel `expo` y en `android`. (El `#000000` de `app.json:36` es del `adaptiveIcon`, no del splash — no confundir.)

**Replica JS del splash**: `expo-image` con `source={require('../assets/eva-icon.png')}`, `contentFit="contain"`, **`transition={0}`** (la imagen debe estar en el primer frame, no aparecer con fade), `cachePolicy="memory-disk"`, `priority="high"`. `width: 150`, `height: 135`. **Centrada en el centro de la PANTALLA (y=422), no del body** — ver §3.1.

**Assets retirados**: las 3 ilustraciones `webp` del walkthrough (`assets/onboarding/coach-plan.webp`, `alumno-scan.webp`, `progreso.webp`) se eliminan junto al componente. Tienen contorno oscuro y paleta verde/coral ajena a la rampa EVA (a1 §4.1); **ninguna sobrevive** — se reemplazan por los 3 fragmentos de producto dibujados (§3.2.2-3.2.4), **cero bitmaps**.

---

## 6. Diferencias mockup → app real

Todo lo que en el HTML es truco de demo, y su equivalente real.

| # | En el mockup (HTML/CSS) | Que es | Equivalente REAL en la app |
|---|---|---|---|
| 1 | Loops `infinite` de **6 s** en `.st`, `.splashmark`, `.press`, `.sheet.alu/.coa`, `.xf-*`, `.dashin` | Recurso de demo para que el motion se lea. Las llaves de porcentaje (`4.7%`, `6%`, `12%`, `16.3%`…) son 6 s escalados | **Cada gesto corre UNA vez.** Las duraciones reales son las de la tabla §4.1, ya convertidas. No portar porcentajes |
| 2 | `.demoloop` ("loop de demo · en la app dura < 1 s"), `.xfcap` ("crossfade 260 ms · EVA → marca del coach"), paneles `.notes`, `.crossnote` | Anotaciones de la maqueta | **No existen.** Ningun texto explicativo llega a la app |
| 3 | Figura EVA como **data URI base64** dentro de un `<symbol>` + `<use>` | Auto-contencion del HTML (1 solo binario, cero CDNs) | `require('../assets/eva-icon.png')` con `expo-image`. Un solo asset, 4 tamanos (150 / 30 / 22 / 22) |
| 4 | `.press` como animacion en loop (73.5%-75% del ciclo) | Simula el pressed una vez por vuelta | `onPressIn`/`onPressOut` reales + `expo-haptics.selectionAsync()`. **Nota del propio mockup**: `.press` pisa el shorthand `animation` de `.st` — nunca combinar ambas clases en el mismo nodo. En RN el equivalente es: el wrapper anima la entrada, el hijo anima el pressed |
| 5 | `.caret` parpadeando (`1.1 s steps(1,end)`) en frames 03/04/05 | Simula el cursor de texto | **Caret nativo del `TextInput`**, sin animacion custom (regla explicita del frame 04) |
| 6 | Datos "reales": `JOSEFI`, `1.840 KCAL`, `P 138 / C 196 / G 58`, `JoseFit Entrenamiento`, `JF`, `Hola de nuevo, Catalina`, verde `#12A971` | Datos de ejemplo | **Los fragmentos se congelan con estos mismos valores** (son producto mostrandose a si mismo, no datos vivos). El nombre/inicial/acento del coach salen de `loadStoredBranding()` (§2.4). El verde es demo — el acento real es el del coach |
| 7 | `filter: drop-shadow(0 0 34px rgba(26,107,230,.42))` sobre `.mk-hero` | Glow de la figura | **Halo detras** (fuente puntual §1.4), no sombra sobre la imagen. Evita halation en OLED (nota explicita del mockup) |
| 8 | `box-shadow` con spread negativo (`-26px`, `-30px`, `-14px`, `-8px`, `-20px`, `-18px`) | Sombra-atmosfera | RN no tiene spread: under-glow dibujado (§1.6) o `shadow*` re-tuneado. **Nunca portar los valores literales** |
| 9 | `box-shadow: inset 0 1px 0 ...` (14 apariciones) | Highlight interno | `<View>` absoluta de 1 pt (§0) |
| 10 | `::before` / `::after` (highlight de card, anillo del icon-tile, punto del dia de hoy, borde del coach-tile, badge del icon-button) | Pseudo-elementos | `<View>` absolutas hermanas |
| 11 | `backdrop-filter: blur(12px)` en `.tabbar` | Glass del tab bar | `expo-blur` `intensity={12}` — **unico uso de blur en la familia**. En 01-06 esta **prohibido**: backdrop real en cold start es caro y el fondo detras es plano, no aporta nada |
| 12 | Shimmer via `background-size: 240%` + `background-position` animado | Skeleton | `LinearGradient` de ancho 240% animado en `translateX` dentro de un bloque `overflow:'hidden'` (RN no tiene `background-position`) |
| 13 | `.morphstage` con `.under` que replica la pantalla 02 con opacidades por elemento (`.7 / .55 / .5 / .36 / .28`) | Simula el dim | **La pantalla 02 real sigue montada sin tocar sus opacidades.** El oscurecimiento lo hace UNA capa `dim` `rgba(7,8,12,.58)` (M5). No animar opacidad elemento por elemento |
| 14 | `.phone`, `.island`, `.statusbar`, `.homebar`, `.screen` con `border-radius 44` | Chrome del telefono de la maqueta | No existe. Status bar y home indicator son del SO. Safe areas **siempre** con `react-native-safe-area-context` (nunca `SafeAreaView` de `react-native`) |
| 15 | `.head`, `.budget`, `.r2`, `.metabar`, `.foot-doc`, `.rail-heat`, `.legend` | Documentacion del mockup | No existe |
| 16 | Radios `13`, `11`, `12`, `18` (icon-tile, icon-button, avatar, FAB) | El mockup incumple su propia regla "nada intermedio inventado" | Se normalizan a la escala real: **14** (`rounded-control`) y **20** (`rounded-card`). Ver §5.1 |
| 17 | Nota "la cascada completa cierra en ~480 ms" (frame 02) | **Error del mockup**: 7 pasos × 70 ms de stagger + 280 ms = **700 ms**. La barra de presupuesto del propio mockup dice "Stagger 280 + 6×70 ms" y el tick "~1.600 ms · rol elegible" — que solo cuadran con 700 ms | **Normativo: 700 ms.** Sigue holgadamente bajo el objetivo de rol elegible ≤2 s. Si QA lo pide mas corto, bajar a `220 ms / stagger 60 ms` = 580 ms; **no** recortar pasos |
| 18 | Nota del frame 05 "top 675 → 126, recorre 549 px" | Aproximacion vieja; los keyframes dicen `top:692` y `top:595` | **Normativo: los keyframes.** Alumno 469 pt, coach 566 pt (§4.2) |
| 19 | Frame 06: crossfade descrito como `260 ms` en la leyenda pero como `18%→24%` (≈360 ms) en los keyframes; r2-b agrega "delay 120 ms"; `SPEC.md` dice 220 ms y "≤300 ms" | Tres cifras en conflicto | **Normativo: hold 120 ms + crossfade 260 ms simultaneo** (§2.3). Cumple el criterio "≤300 ms" del crossfade y el techo de 900 ms al dashboard |
| 20 | `.amb` vs `.lux`: r2-c usa dos lavados radiales fijos; r2-b usa una elipse parametrizada por `--heat`/`--lift` | Dos mecanismos distintos para la misma idea | **Fusion normativa (§2.2)**: se conserva la **geometria y los stops de r2-c** (el sello) y se adopta la **parametrizacion de r2-b**. Factor de conversion `heatTop = heat_r2b × 0.469`, anclado en el frame 02 que ambos comparten |
| 21 | r2-b `.vign`, `.scrim` lineal y `.grain` con `mix-blend-mode: screen` y 3 ejes (27°/112°/67°) | Acabado de r2-b | **NO se adoptan.** El sello es el crosshatch ortogonal de r2-c (§1.3). La vineta queda documentada y apagada (§1.7) |
| 22 | r2-c frame 06 usa `.amb.wl` + `.haloG` + `.splashhalo` para el cruce de atmosfera | Mecanismo original de r2-c | **Sustituido** por el mecanismo `.lux` de r2-b (decision del owner). Los valores resultantes coinciden: `.amb.wl` = `rgba(18,169,113,.17)` = `heatTop 0.170` de la tabla §2.2 |
| 23 | `transform: rotate(-90deg)` sobre el `<svg>` del anillo, con `.ringc` en `transform:none` | Trucos de composicion CSS | En RN la rotacion va en el `<View>` wrapper del `<Svg>`; el label central es un hermano **fuera** de ese wrapper (si no, hereda la rotacion) |
| 24 | `text-indent: .44em` en el wordmark | Compensa el tracking colgante para que el texto quede optimamente centrado | `paddingLeft` del mismo valor en pt (`4.84`) |
| 25 | Colores `#69727C`, `#79838E`, `#5C656F`, `#4C555F`, `#6E7883` sueltos | Micro-variaciones sin token | Colapsan a `text-faint` (`#6E7883`) y `text-ghost` (`#5C656F`) (§5.1) |
| 26 | `font-family: system-ui` en `.screen` con el comentario "= Archivo/Hanken en la app" | Stand-in tipografico | Archivo (display) / Hanken (UI) / JetBrains Mono (codigos, eyebrows-mono, metricas). Todos los `letterSpacing` de este documento ya estan convertidos a puntos |

---

## 7. Checklist de QA visual (cierre de la spec)

1. Cold start sin sesion, Android gama baja **en release build**: nativo → replica sin flash; figura en la **misma posicion** en ambos (centro de pantalla, 150 pt). El «Glide» **no** entra por aca: sin sesion el gate se va al selector y el frame 01 tiene que verse igual que antes de la coreografia — figura quieta, sin estelas, firma con su fade por umbral. Mismo criterio en el **retorno branded**: si aparece una sola estela cian sobre el crossfade a la marca del coach, es un bug (§3.1, excepcion Glide).
   - **1b. Sweep «Glide», solo en sesion + marca EVA** (cuenta sin white-label, o coach Free): tras el veredicto la figura salta fuera de cuadro y entra barriendo. Verificar (a) que el barrido **no se corta** en el relevo `SplashGate` → `DashboardSplashOverlay` —tiene que seguir de largo, no volver a empezar—, (b) que en un dispositivo de **320 pt** la figura sale **entera**, esquina inclinada incluida, durante el hold, y (c) que las 3 estelas se apagan antes de los 750 ms y no reviven.
2. Crosshatch visible en las **7** superficies. Fotografiar el frame 07 branded: la textura debe seguir siendo **blanca**, no teñida.
3. Cero rects solidos de gradiente en device real (regresion del bug `stopOpacity`): verificar tambien `GlassCard`, `brand.tsx`, `ProgramLibraryHero`, `NutritionHeader`.
4. Reduce Motion ON en iOS y Android: las 22 filas de §4.1 tienen su variante y **ninguna** desaparece sin reemplazo.
5. `fontScale` 1.3 y pantalla de 667 pt: las dos cards de rol **sobre** el fold (§3.2.6).
6. Contraste: titulo de card sobre el tint azul > 9:1; `text-faint #6E7883` sobre `#07080C` = 5.4:1 (AA para texto pequeno **solo como caption no esencial** — no usarlo para informacion critica).
7. Halation OLED: fotografiar frames 01, 02, 03 y 06 en device OLED a brillo maximo. Fallback documentado: bajar `heatTop` un escalon completo de la rampa.
8. Costura `#07080C` → `#0A0D12` en el frame 07: no debe leerse un escalon durante el fade D1.
9. Teclado abierto en frames 04 y 05: CTA visible, sheet comprimido (no desplazado).
10. Gates: `pnpm --filter @eva/mobile exec tsc --noEmit` + `pnpm --filter @eva/mobile exec expo export --platform android`.
