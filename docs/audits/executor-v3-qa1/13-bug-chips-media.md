# QA1 · Unidad 13 — Bug de los chips glass sobre la media (ExerciseStepV3)

Auditor: fidelidad visual "Ejecutor V3 Impulso". Foco: los dos chips flotantes
("Instrucciones" / "Nota del coach") sobre el gif/video del paso de FUERZA.

## Veredicto (2 líneas)

El bug del QA del CEO es REAL en web y tiene causa raíz clara: la animación de
entrada (chip extendido → colapsa a solo-icono) se hace con un **keyframe CSS
`forwards` disparado por el montaje**, cuyo tramo "extendido" (0–0,88 s) cae justo
dentro de la ventana de jank del montaje del paso (video/imagen + LogSetForm ×N),
por lo que el navegador salta esos frames y el primer frame pintado ya sale
colapsado ("salen contraídos de una"); además anima `max-width` (propiedad de
layout) por debajo de `backdrop-filter: blur(4px)`, lo que genera re-layout +
re-blur por frame = el "lagueo". El espejo RN ya lo hace BIEN (estado
`chipsExpanded` + `setTimeout` + Moti `AnimatePresence`), así que el fix de web es
literalmente **portar el patrón de RN**: estado + transición sobre atributo, que
garantiza que el frame extendido se pinte primero. Severidad del bug: **MAYOR**
(animación especificada efectivamente ausente + jank visible). El resto son
deltas MENOR de estilo del chip.

---

## Dónde vive el código

| Pieza | Web | RN |
|---|---|---|
| Markup de los chips | `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExerciseStepV3.tsx:130-156` | `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx:278-306` |
| Componente del chip | (inline, mismo archivo) | `GlassChip` — `ExerciseScreenV3.tsx:435-494` |
| CSS / animación | `apps/web/src/app/globals.css:1665-1716` | estado en `ExerciseScreenV3.tsx:166-172`, anim en `GlassChip` `:474-488` |
| Media resolver | `.../v3/exec-media.ts` | `ExerciseMediaV3` `ExerciseScreenV3.tsx:506-536` |
| Montaje del paso | `WorkoutExecutionClient.tsx:1860-1863` (`<ExerciseStepV3 key={block.id}>`) | — |

Mockup de referencia: `docs/research/executor-redesign/mockups/concepto-a-v3-core.html`
— CSS chips `:282-315`, markup `:777-793`.

---

## Spec exacto del mockup (contrato)

Selector `#concept-a3a`:

- `.a3a-mediachips` (`:283-286`): `position:absolute; top:10px; left:10px; right:10px; display:flex; gap:7px; z-index:4`.
- `.a3a-mchip` (`:287-293`): `position:relative; display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800; letter-spacing:.01em; padding:6px 11px; border-radius:999px; min-height:30px; background:rgba(8,8,12,.6); backdrop-filter:blur(4px); border:1.5px solid rgba(255,255,255,.16); color:#eaeaf0`.
- `.a3a-mchip svg` (`:294`): `width:14px; height:14px; color:#cfcfd8` (íconos más apagados que el texto).
- `.a3a-badge` (`:295-299`): `absolute; top:-3px; right:-3px; width:10px; height:10px; border-radius:50%; background:var(--brand-a3a); box-shadow: 0 0 0 2px #16161d, 0 0 0 4px color-mix(in srgb, var(--brand-a3a) 45%, transparent)` (doble anillo: negro + halo de marca).
- `.a3a-mlabel` (`:301`): `display:inline-block; overflow:hidden; white-space:nowrap; max-width:110px`.
- Animación (`:300-315`) — **es una DEMO en loop de 8 s**; la intención de producción está en el comentario `:300`: *"chips: extendidos al entrar la serie, colapsan a solo-icono ~1.2s despues"*:
  - `@keyframes concept-a3a-mlabel`: `0%,15%` extendido (`max-width:110px; opacity:1; margin-left:0`) → `24%,88%` colapsado (`max-width:0; opacity:0; margin-left:-6px`) → `96%,100%` extendido. Curva `cubic-bezier(.4,0,.2,1)`.
  - `@keyframes concept-a3a-mchippad`: **el padding del pill también anima** `0%,15% 11px` → `24%,88% 8px` → `96%,100% 11px`.
  - Todo bajo `@media (prefers-reduced-motion: no-preference)` ⇒ con reduced-motion los labels quedan extendidos.
- Solo el chip "Nota del coach" lleva `.a3a-badge` (`:791`). El de "Instrucciones" no.

Traducción a producción (confirmada por el task y por el doc-comment de `ExerciseStepV3`): **one-shot por entrada de ejercicio** — entra extendido, se mantiene ~1,2–1,5 s, colapsa a solo-icono. NO loop de 8 s.

---

## Deltas

### [MAYOR] BUG PRINCIPAL — la animación de entrada está efectivamente ausente + lagueo

**Síntoma QA:** "(a) laguean al mostrarse; (b) salen contraídos de una; no hay entrada extendida → colapso."

**Mockup:** keyframes `concept-a3a-mlabel`/`mchippad`, one-shot extendido→colapso con `cubic-bezier(.4,0,.2,1)`.

**Web — `globals.css:1706-1716` + `ExerciseStepV3.tsx:132`:**
```css
@media (prefers-reduced-motion: no-preference) {
  [data-exec-v3] .exec-v3-mchip .exec-v3-mlabel {
    animation: exec-v3-mlabel-collapse 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}
@keyframes exec-v3-mlabel-collapse {
  0%, 55% { max-width: 120px; opacity: 1; margin-left: 0; }
  100%    { max-width: 0;      opacity: 0; margin-left: -6px; }
}
```
```tsx
<div className="exec-v3-mediachips" key={firstUnlogged ?? 'done'}>
```

**Causa raíz (dos problemas encadenados):**

1. **"Salen contraídos de una" = keyframe `forwards` disparado por el montaje.**
   El paso completo re-monta con `key={block.id}` (`WorkoutExecutionClient.tsx:1863`). En el mismo commit se montan `<video autoPlay loop>` / `<Image fill>`, la fila `WheelHint`, y `block.sets` × `LogSetForm` (keypad/rueda/RPE). Todo eso bloquea el main thread. El reloj del `@keyframes` corre en tiempo de pared; cuando el navegador por fin pinta el primer frame (a ~0,8–1,2 s del montaje en un teléfono medio), muestrea la animación **más allá del tramo extendido** (`0%–55%` = 0–0,88 s) → el primer frame ya está colapsado o colapsando. El estado extendido nunca se ve. Es el clásico patrón "keyframe front-loaded + montaje pesado".

2. **"Laguean" = animar `max-width` (layout) por debajo de `backdrop-filter: blur(4px)`.**
   `max-width` y `margin-left` fuerzan **reflow en cada frame** (no son propiedades de compositor). El chip tiene `backdrop-filter: blur(4px)` (`globals.css:1685-1686`), así que cada reflow obliga a **recomputar el blur del fondo** por frame — y el fondo suele ser el `<video>` en loop, que ya cambia por frame. Reflow + re-blur por frame = jank. No hay `will-change` (confirmado: 0 ocurrencias en `globals.css`).

3. **Agravante — el `key={firstUnlogged ?? 'done'}` (`ExerciseStepV3.tsx:132`) re-monta el contenedor y re-dispara la animación janky en CADA serie registrada** (firstUnlogged 1→2→3…), no solo al entrar el ejercicio. El task pide "one-shot por entrada de ejercicio"; el `key={block.id}` del padre ya cubre eso, así que este `key` interno es redundante para la entrada y encima repite el lagueo por cada set.

**RN — `ExerciseScreenV3.tsx:166-172` + `GlassChip:474-488` — ESTÁ BIEN (referencia del fix):**
```tsx
const [chipsExpanded, setChipsExpanded] = useState(true)   // pinta EXTENDIDO primero
useEffect(() => {
  if (reducedMotion) { setChipsExpanded(true); return }
  setChipsExpanded(true)
  const t = setTimeout(() => setChipsExpanded(false), CHIP_COLLAPSE_MS) // 1200 ms
  return () => clearTimeout(t)
}, [firstUnlogged, reducedMotion])
// GlassChip: <AnimatePresence>{expanded && <MotiView …260ms fade+slide>{label}</MotiView>}</AnimatePresence>
```
RN no sufre el bug porque el estado inicial `true` garantiza que el frame extendido se renderice, y el colapso es un cambio de estado a los 1,2 s (no un keyframe front-loaded). No anima layout bajo blur (no hay blur en RN).

**Fix propuesto (web) — portar el patrón de RN:**
1. En `ExerciseStepV3`: `const [chipsExpanded, setChipsExpanded] = useState(true)` + `useEffect` que, salvo reduced-motion, hace `setTimeout(() => setChipsExpanded(false), 1200)` con cleanup, dependencia `[firstUnlogged]` (o `[block.id]` si se decide one-shot estricto por ejercicio; ver delta siguiente).
2. Quitar el `key={firstUnlogged ?? 'done'}` del contenedor (ya no hace falta; deja de re-montar y de re-lagear).
3. Reemplazar el `@keyframes … forwards` por una **transición sobre atributo/clase**, que garantiza que el estado extendido pinte primero:
   ```css
   [data-exec-v3] .exec-v3-mlabel {
     display:inline-block; overflow:hidden; white-space:nowrap;
     max-width:110px; opacity:1; margin-left:0;
     transition: max-width .5s cubic-bezier(.4,0,.2,1), opacity .35s ease, margin-left .5s cubic-bezier(.4,0,.2,1);
     will-change: max-width;
   }
   [data-exec-v3] .exec-v3-mchip[data-collapsed="true"] .exec-v3-mlabel {
     max-width:0; opacity:0; margin-left:-6px;
   }
   @media (prefers-reduced-motion: reduce) {
     [data-exec-v3] .exec-v3-mlabel { transition:none; }
     [data-exec-v3] .exec-v3-mchip[data-collapsed="true"] .exec-v3-mlabel { max-width:110px; opacity:1; margin-left:0; }
   }
   ```
   Los `<button className="exec-v3-mchip" data-collapsed={!chipsExpanded ? 'true' : undefined}>`.
4. Mitigar el jank residual del blur: añadir `will-change` (arriba) y/o quitar `backdrop-filter` mientras `data-collapsed` transiciona; el `backdrop-filter` sobre `<video>` es el mayor costo — evaluar bajarlo a `blur(2px)` o a fondo sólido `rgba(8,8,12,.72)` sin blur si el device QA sigue mostrando jank.

---

### [MENOR] El padding del pill no colapsa (falta `mchippad`)

**Mockup (`:311-315`):** al colapsar, el pill reduce padding horizontal `11px → 8px` (icono más ceñido).
**Web:** `.exec-v3-mchip` (`globals.css:1681`) tiene `padding: 6px 11px` fijo; la animación solo toca `.exec-v3-mlabel`. Colapsado queda un pill de 11px con solo icono (algo suelto).
**RN:** `GlassChip` (`ExerciseScreenV3.tsx:466`) `paddingHorizontal: 11` fijo; mismo delta.
**Fix:** añadir el padding al colapso — en web, `.exec-v3-mchip[data-collapsed="true"] { padding-left:8px; padding-right:8px; transition: padding .5s cubic-bezier(.4,0,.2,1) }`; en RN, interpolar padding con Moti o animar el contenedor.

### [MENOR] Badge sin el halo de marca (falta el 2º anillo)

**Mockup (`:298`):** `box-shadow: 0 0 0 2px #16161d, 0 0 0 4px color-mix(in srgb, var(--brand-a3a) 45%, transparent)` (anillo negro + halo de color).
**Web:** `.exec-v3-badge` (`globals.css:1704`) solo `box-shadow: 0 0 0 2px #16161d` — falta el halo `0 0 0 4px …45%`.
**RN:** `GlassChip:490` usa `borderWidth:2 borderColor:#16161d` (equivalente al 1er anillo) — falta el halo también.
**Fix web:** `box-shadow: 0 0 0 2px #16161d, 0 0 0 4px color-mix(in srgb, var(--exec-brand) 45%, transparent)`. RN: añadir una `View` anillo externa o `shadow`/segundo borde con `exec.accent` al 45%.

### [MENOR] Íconos: color y (en RN) glifo distintos

- **Color svg:** mockup `.a3a-mchip svg { color:#cfcfd8 }` (apagado). Web: `<AlignLeft/>`/`<MessageSquare/>` heredan `#eaeaf0` del chip (`ExerciseStepV3.tsx:140,151`). RN: `#eaeaf0` (`:285,296`). Delta sutil de tono. Fix: teñir los íconos a `#cfcfd8`.
- **Glifo (solo RN):** mockup "Instrucciones" = ícono lista con 3 líneas + 3 puntitos (align-left/list). Web usa `AlignLeft` (cercano). **RN usa `ListChecks`** (`:285`) — checklist, distinto del align-left del contrato. Nota del coach: mockup burbuja de chat simple; web `MessageSquare` (bien), **RN `MessageSquareText`** (`:296`) — burbuja con líneas de texto, ligeramente distinto. Fix RN: alinear a `AlignLeft`/`MessageSquare` (o `AlignJustify`) para paridad con web/mockup.

### [MENOR] Detalles finos de estilo del chip (web)

- `max-width` base `120px` (`globals.css:1694`) vs `110px` del mockup (`:301`). Trivial; alinear a 110.
- Falta `letter-spacing: .01em` en `.exec-v3-mchip` (mockup `:289`). Añadir.

### [MENOR / decisión] "One-shot por entrada de ejercicio" vs re-expandir por serie

Ambas plataformas re-expanden los chips cuando cambia `firstUnlogged` (web via `key`, RN via dependencia del `useEffect`). El comentario RN (`:164`) lo hace a propósito ("nueva serie = cambia firstUnlogged"), pero el task/QA framea la intención como **one-shot por entrada de ejercicio**. En web esto es doblemente malo porque re-dispara el keyframe janky en cada set; en RN es barato pero igual re-expande. **Decisión CEO pendiente:** ¿re-expandir en cada serie registrada, o solo al entrar el ejercicio? Si es lo segundo, en web depender de `[block.id]` (o simplemente del montaje) y en RN cambiar la dependencia del `useEffect` a `[exercise.id]`/montaje.

### [MENOR / plataforma] RN sin blur real (glass aproximado)

**Mockup:** `backdrop-filter: blur(4px)` (efecto glass sobre la media).
**RN — `GlassChip:470`:** `backgroundColor: 'rgba(8,8,12,0.6)'` sólido, sin blur (RN no tiene `backdrop-filter`; requeriría `expo-blur BlurView`). Aceptable como limitación de plataforma, pero es un delta visual real vs web/mockup. Fix opcional: envolver el pill en `BlurView intensity~20 tint="dark"` si se quiere paridad estricta.

---

## Cumple (fiel al mockup — NO re-tocar)

- **Layout del contenedor de chips:** `position:absolute; top:10; left:10; right:10; display:flex; gap:7; z-index:4` — web `globals.css:1665-1673`, RN `ExerciseScreenV3.tsx:281`. Idéntico al mockup `:283-286`.
- **Estilo base del pill (web):** `font-size:11; font-weight:800; padding:6px 11px; border-radius:999; min-height:30; background:rgba(8,8,12,.6); backdrop-filter:blur(4px); border:1.5px solid rgba(255,255,255,.16); color:#eaeaf0` — `globals.css:1674-1689`. Coincide 1:1 con el mockup (salvo `letter-spacing`, ver MENOR).
- **Estilo base del pill (RN):** `gap:6; minHeight:30; paddingHorizontal:11; borderRadius:999; borderWidth:1.5; borderColor:rgba(255,255,255,.16); backgroundColor:rgba(8,8,12,.6)`; label `fontSize:11` — `GlassChip:461-483`. Coincide (menos blur).
- **Badge:** posición/tamaño `top:-3; right:-3; 10×10; radius 50%; background = marca/accent` — web `globals.css:1696-1704`, RN `:490`. Solo delta el halo externo (MENOR).
- **Badge solo en "Nota del coach":** web renderiza `.exec-v3-badge` únicamente en el chip de nota (`ExerciseStepV3.tsx:153`); RN pasa `badgeColor` solo a ese chip (`:300`). Igual que el mockup (`:791`).
- **Curva de colapso** `cubic-bezier(.4,0,.2,1)` presente en web (`globals.css:1710`). Coincide con el mockup.
- **Reduced-motion deja los chips extendidos:** web via `@media (prefers-reduced-motion: no-preference)` (solo anima si NO hay preferencia) → base extendida; RN via branch `reducedMotion` (`:168`). Ambos cumplen el contrato del mockup.
- **Media resolver (precedencia YouTube→gif→video→imagen→none):** `exec-media.ts:22-49` y `ExerciseMediaV3`/`TypedMediaV3` en RN son 1:1 entre sí y con la lógica del modal de técnica. Sin delta.
- **Solo el paso activo monta media animada** (cuota de media respetada): web monta `ExerciseStepV3` por paso; RN comenta la cuota en `:504`. OK.

---

## Resumen para el jefe

El bug es genuino y de causa clara en **web**: la entrada extendida→colapso se
implementó como keyframe CSS `forwards` disparado por el montaje del paso, sobre
`max-width` (layout) y bajo `backdrop-filter: blur`. Bajo el jank del montaje el
tramo extendido se salta (→ "colapsados de una") y el reflow+re-blur por frame
produce el lagueo; el `key={firstUnlogged}` repite el lagueo en cada serie. **RN
ya tiene el patrón correcto** (estado `chipsExpanded` + `setTimeout(1200)` +
`AnimatePresence`), así que el fix de web = portar ese patrón (estado +
transición sobre `data-collapsed`, quitar el `key`, `will-change`, evaluar
bajar el blur). Deltas MENOR aparte: falta el colapso de padding del pill, el
halo de marca del badge, color de íconos `#cfcfd8`, `letter-spacing`,
`max-width` 110 vs 120, y en RN los glifos `ListChecks`/`MessageSquareText` en
vez de `AlignLeft`/`MessageSquare` y la ausencia de blur real.
