# Auditoría de fidelidad visual — Ejecutor V3 "Impulso" · Unidad 01: Entrada / Splash

**Pantalla:** transición de entrada al ejecutor (splash con marca del coach).
**Mockup (contrato):** `docs/research/executor-redesign/mockups/concepto-a-v3-core.html` — sección `.a3a-splash` (líneas 114-168 CSS, 668-680 HTML, 586-645 animaciones).
**Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionIntro.tsx` + CSS `apps/web/src/app/globals.css` (líneas 2069-2175). Montaje en `WorkoutExecutionClient.tsx` (líneas 2151-2161).
**RN:** `apps/mobile/components/alumno/workout/v3/SessionIntro.tsx` + `exec-theme.ts`.

## Veredicto (2 líneas)

La estructura, el copy y las animaciones del anillo/halo/puntos están **bien transcritos en web** (el anillo cónico giratorio + halo pulsante + puntos rebotando son fieles al pixel). **PERO** el fondo radial de marca no coincide: el web des-satura y oscurece el centro (52%→46% de marca y base verde `#0c2a00`→negro neutro `#0a0a0f`), y le falta el segundo resplandor superior (`::after`) — esto es exactamente el "color de fondo distinto" que reportó el CEO. En **RN** el problema es mayor: el fondo usa la superficie clara de la app (`#16161d`) en vez del casi-negro del mockup, **falta por completo el anillo cónico giratorio**, y la etiqueta "Preparando tu sesión" sale en acento saturado en vez de casi-blanco.

Severidad máxima: **BLOCKER** (fondo radial de marca distinto en web y RN).

---

## Deltas

### [BLOCKER] Fondo radial del splash: centro más oscuro y des-verdecido (web)
- **Mockup** (`concepto-a-v3-core.html:118-123`):
  ```
  radial-gradient(120% 90% at 50% 22%,
    color-mix(in srgb, var(--brand-a3a) 52%, #0c2a00) 0%,   /* centro verde-vivo */
    color-mix(in srgb, var(--brand-a3a) 22%, #0c0c11) 44%,
    #0a0a0f 100%)
  ```
- **Web** (`globals.css:2069-2076`):
  ```
  radial-gradient(120% 90% at 50% 22%,
    color-mix(in srgb, var(--exec-brand) 46%, #0a0a0f) 0%,   /* -6% marca + base negro neutro */
    color-mix(in srgb, var(--exec-brand) 20%, #0c0c11) 44%,  /* -2% marca */
    #0a0a0f 100%)
  ```
- **Impacto:** para la marca verde por defecto el centro pasa de ~`#337E01` (verde rico) a ~`#2E6309` (verde apagado más oscuro). El `#0c2a00` del mockup es un negro-verdoso que mantiene tinte de marca incluso en la penumbra; `#0a0a0f` es negro neutro → el splash se ve más apagado y frío. Es la queja literal del CEO ("fondo distinto").
- **Fix:** en `globals.css:2072-2073` restaurar `color-mix(... var(--exec-brand) 52%, #0c2a00) 0%` y `... 22%, #0c0c11) 44%`. (Si se teme el `#0c2a00` verde-fijo para marcas no-verdes, usar un negro-teñido dinámico `color-mix(in srgb, var(--exec-brand) 12%, #0a0a0f)` como base del stop 0%, pero manteniendo el 52% de presencia de marca.)

### [BLOCKER] Fondo del splash RN usa superficie clara `#16161d`, no el casi-negro del mockup
- **Mockup:** stops radiales terminan en `#0c0c11` (44%) y `#0a0a0f` (100%); el centro es 52% de marca sobre `#0c2a00`. El splash es deliberadamente **más oscuro** que el resto de la app.
- **RN** (`SessionIntro.tsx:70-78`): `LinearGradient colors={[accent@0.38, accent@0.12, s.appBg]}` con `s.appBg = #16161d` (`exec-theme.ts:66`). El piso del degradado es la superficie estándar de la app (`#16161d`), un gris claramente más claro que `#0a0a0f`, y el tope apenas llega a acento@0.38 (vs 52% sólido).
- **Impacto:** el splash RN se ve lavado/grisáceo y poco saturado, no el pozo negro con núcleo de marca del mockup.
- **Fix:** en RN, el piso del `LinearGradient` debe ser `#0a0a0f` (o `#0c0c11`), no `s.appBg`. Subir el wash de marca del tope a ~0.52 (o superponer una segunda capa de acento centrada arriba para emular el núcleo radial). Considerar añadir un `appBgSplash: '#0a0a0f'` a `EXEC_SURFACE`.

### [MAYOR] Falta el segundo resplandor superior `::after` (web)
- **Mockup** (`concepto-a-v3-core.html:124-128`):
  ```
  .a3a-splash::after {
    content:""; position:absolute; inset:-40% -10% auto -10%; height:70%;
    background: radial-gradient(60% 60% at 50% 0%,
      color-mix(in srgb, var(--brand-a3a) 30%, transparent), transparent 70%);
    pointer-events:none;
  }
  ```
- **Web:** no existe `.exec-v3-splash::after` en `globals.css` (la regla de `.exec-v3-splash` termina en la línea 2076; el bloque siguiente es `-coach`). Además `.exec-v3-splash` no lleva `overflow:hidden` (necesario para recortar el glow).
- **Impacto:** el mockup tiene un halo luminoso extra de marca cayendo desde el borde superior; el web no lo tiene → la mitad superior se ve más plana/oscura.
- **Fix:** añadir la regla `::after` con el mismo `inset`/`height`/`radial-gradient` usando `--exec-brand`, y `overflow:hidden` en `.exec-v3-splash`.

### [MAYOR] Falta el anillo cónico giratorio alrededor del avatar (RN)
- **Mockup** (`concepto-a-v3-core.html:134-143` + `.a3a-splashring` con `animation: concept-a3a-spin 6s linear infinite`, línea 592): anillo `conic-gradient` de marca con máscara radial (arco brillante que gira alrededor del avatar).
- **Web:** presente y fiel (`globals.css:2088-2102` + spin 6s `:2160`, `:2169-2171`). ✓
- **RN** (`SessionIntro.tsx:81-112`): solo renderiza el **halo pulsante** (scale 1→1.45) y el avatar. **No hay anillo cónico giratorio** — RN no dibuja el arco de marca que gira.
- **Impacto:** el avatar RN pierde el elemento de movimiento característico (el "anillo del coach girando" que pide el brief). Se ve estático salvo el latido.
- **Fix:** añadir un anillo giratorio en RN. Opciones: `expo-linear-gradient` en ángulo dentro de un `MotiView` con `rotate` loop 6s como aproximación, o un SVG con arco cónico (react-native-svg) enmascarado. Mínimo: un arco de acento rotando 360° en 6s lineal.

### [MAYOR] Color del texto de la inicial del avatar: `#fff` en web vs `#062100` (dark) del mockup
- **Mockup** (`concepto-a-v3-core.html:147`): `.a3a-splashav { color:#062100; ... }` — texto verde muy oscuro sobre el disco de marca (misma convención que los botones juicy: tinta oscura sobre relleno de marca).
- **Web** (`globals.css:2108`): `color:#fff` (blanco).
- **RN** (`SessionIntro.tsx:106`): `color: exec.accentText` — correcto en intención (foreground on-brand resuelto), pero cae a `#FFFFFF` para la mayoría de marcas (`exec-theme.ts:131`).
- **Impacto:** para la marca verde del contrato, la inicial debería ser tinta oscura, no blanca. La inicial blanca sobre verde brillante se ve más floja que el mockup.
- **Fix:** en web, usar el foreground on-brand resuelto (`--theme-primary-foreground` / token de tinta de marca) en vez de `#fff` hardcodeado — igual que RN con `accentText`. Es el único elemento del splash donde web hardcodea `#fff` en vez del token de contraste de marca.

### [MAYOR] "Preparando tu sesión" en acento saturado en RN (mockup: casi-blanco)
- **Mockup** (`concepto-a-v3-core.html:158`): `.a3a-prep { color: color-mix(in srgb, var(--brand-a3a) 34%, #ffffff); }` — texto casi blanco con leve tinte de marca (66% blanco).
- **Web** (`globals.css:2133`): `color-mix(in srgb, var(--exec-brand) 30%, #ffffff)` — cerca (34%→30%, ver MENOR abajo). ✓ aceptable.
- **RN** (`SessionIntro.tsx:137`): `color: hexToRgba(exec.accent, 0.85)` — acento saturado al 85% de opacidad sobre fondo oscuro. Se ve **verde/marca fuerte**, no blanco-tenue.
- **Impacto:** la etiqueta y los puntos (mismo color, `:148`) salen en color de marca vivo en RN, rompiendo el tono "handoff cálido" casi-blanco del mockup.
- **Fix:** en RN usar una mezcla `34% acento + 66% blanco` (p. ej. `hexToRgba` no sirve; interpolar hacia `#ffffff`, o usar un literal claro `mix(accent, #fff, 0.34)`), igual para los tres puntos.

### [MENOR] Presencia de marca en `.a3a-prep`: 34% (mockup) vs 30% (web)
- **Mockup** `:158` → `34%`; **Web** `globals.css:2133` → `30%`. Diferencia sutil (web un pelo más blanco). Fix: alinear a `34%`.

### [MENOR] `gap` del contenedor: 24px (mockup) vs 26px (RN)
- **Mockup** `.a3a-splash { gap:24px }` (`:117`); **Web** `gap-6` = 24px ✓; **RN** `gap: 26` (`SessionIntro.tsx:67`). Fix: RN `gap: 24`.

### [MENOR] Tamaño de la inicial del avatar: 42px (mockup) vs 46px (RN)
- **Mockup** `:147` `font-size:42px`; **Web** `globals.css:2109` `42px` ✓; **RN** `fontSize: 46` (`:106`). Fix: RN `fontSize: 42`.

### [MENOR] Posición del "Toca para saltar": bottom 30px (mockup) vs 34px (RN)
- **Mockup** `.a3a-splashskip { bottom:30px }` (`:165`); **Web** `globals.css:2150` `bottom:30px` ✓; **RN** `bottom: 34` (`:156`). Fix: RN `bottom: 30`.

### [MENOR] Color del título del día: `#ffffff` (mockup) vs `#f4f4f6` (RN)
- **Mockup** `.a3a-splashday { color:#ffffff }` (`:152`); **Web** `#fff` ✓; **RN** `s.text = #f4f4f6` (`:122`, `exec-theme.ts:75`). Off-white casi imperceptible. Fix opcional: RN usar `#ffffff` en el título del día.

### [MENOR / observación de datos] El "día" del splash usa `plan.title`
- **Mockup:** `.a3a-splashday` = "Día 3 · Empuje" (formato "Día N · Foco").
- **Web** (`WorkoutExecutionClient.tsx:2157`): `dayTitle={plan.title}`. **RN:** ídem por props.
- **Nota:** no es un delta de CSS sino de contenido — si `plan.title` no resuelve a "Día N · Foco" el splash mostrará el nombre crudo del plan. Verificar con datos reales que lea como el mockup; si no, derivar el heading "Día N · Foco" como hace la pantalla Inicio.

---

## Cumple (fiel al mockup — no re-tocar)

**Web (SessionIntro + globals.css) — mayormente fiel:**
- **Anillo cónico giratorio:** `conic-gradient` idéntico (marca → 22%@130deg → marca@300deg → marca@360deg), máscara `radial-gradient(closest-side, transparent 78%, #000 79%)`, `opacity:.9`, `inset:0`, spin 6s lineal. Pixel-perfect (`globals.css:2088-2102`, `:2160`, `:2169`).
- **Halo pulsante:** `inset:8px`, keyframe box-shadow 0→30px con `color-mix 42%→0%`, 2.2s ease-out (`globals.css:2082-2086`, `:2159`, `:2165-2168`). ✓
- **Geometría del avatar:** contenedor 116×116, `av inset:11px`, gradiente `135deg marca→48%`, sombras internas `inset 0 2px 0 rgba(255,255,255,.28)` + `inset 0 -8px 16px rgba(0,0,0,.25)`. ✓ (`globals.css:2103-2116`)
- **Tipografía inicial:** 42px / 900 / `-0.03em`. ✓
- **Título del día:** 30px / 900 / `-0.03em` / `text-shadow 0 2px 18px rgba(0,0,0,.35)`. ✓ (`globals.css:2117-2124`)
- **Puntos "prep":** 7×7 redondos, `currentColor` @ opacity .55, rebote `translateY(-5px)` 1.2s con delays .16s/.32s. ✓ (`globals.css:2135-2144`, `:2161-2163`, `:2172-2175`)
- **"Toca para saltar":** absoluto `bottom:30px`, 11px / 800 / `.08em` / uppercase / blanco `.58`. ✓ (`globals.css:2146-2157`)
- **Copy exacto:** "Preparando tu sesión" + "Toca para saltar". ✓ (ambas plataformas)
- **Comportamiento de skip:** tap en cualquier parte + Enter/Space (web), auto-avance ~1.3s (web) / 1.4s (RN), guard idempotente `doneRef` — fiel al brief ("dura un parpadeo, se salta con un tap"). ✓
- **Cobertura:** splash `fixed inset-0 z-[70]` cubre el header V3 (`sticky z-20`) y el legacy (`hidden` en V3) → sin restos de chrome viejo durante la entrada. ✓
- **Entrada con spring:** avatar `scale .3→1` (framer spring stiffness 320/damping 18 → overshoot) y día `y:22→0` con overshoot — traduce el keyframe del mockup (que en el HTML corre en loop solo para la demo). ✓
- **Reduced-motion:** ambas plataformas apagan halo/spin/dots y hacen fade simple. ✓

**RN — fiel:**
- Halo pulsante 2.2s (scale 1→1.45, `:83-89`). ✓
- Entrada con spring espacial del avatar + overshoot del día (`:91-127`). ✓
- Puntos rebotando (aunque en color equivocado, ver MAYOR). Estructura y timing ✓.
- Copy exacto y guard idempotente ✓.
- **Extra (mejora sobre el mockup):** soporte de logo del coach en el avatar (`coachLogoUrl`, `:97-98`) — más fiel a "marca del coach" que la inicial sola. No es delta.
