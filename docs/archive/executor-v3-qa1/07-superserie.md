# Auditoría de fidelidad visual — Ejecutor V3 "Impulso" · Unidad 07: SUPERSERIE

**Pantalla:** Superserie
**Mockup (contrato):** `docs/research/executor-redesign/mockups/concepto-a-v3-tipos.html` — columna 1 "Superserie" (CSS líneas 170-283 y 552-556; HTML líneas 615-706).
**Web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SupersetStepV3.tsx` + CSS `apps/web/src/app/globals.css` líneas 1817-2066.
**RN espejo:** `apps/mobile/components/alumno/workout/v3/SupersetScreenV3.tsx` (modelo de ronda en `superset-screen-model`).
**Fecha:** 2026-07-22

---

## Veredicto (2 líneas)

La estructura base (título "Superserie {letra}", chip "Ronda N de M" con dots, tarjetas apiladas activo/siguiente, pill "Sin descanso — sigue con {letra}", nota "Descanso {n}s al cerrar la ronda") está transcrita con **alta fidelidad de tokens** en web y RN; los hex de la tarjeta activa, la pastilla de estado y el chip de ronda son idénticos al mockup en web. Los deltas reales son: **(a)** animaciones del mockup ausentes en **web** (flecha deslizante 1.6s, latido del dot activo, respiración del CTA) — RN sí las tiene; **(b)** desajustes finos de tamaño/color en el espejo RN (mini 60→ok pero badge de letra 26 vs 30, fondo de tarjeta `#1a1a22` vs `#17171f`, texto de acento blanco vs `#072100`); y **(c)** el bloque grande: el **nuevo requerimiento del CEO (QA 2026-07-22)** pide que el miembro ACTIVO se muestre como un ejercicio solo (gif grande) con animación contrae/expande + aviso "Sigue sin detenerte" — algo que **ni el mockup ni la implementación actual hacen** (hoy el activo es una tarjeta compacta con el keypad embebido). Ese requerimiento es un rediseño por encima del contrato y se documenta como delta técnico al final.

---

## Deltas vs mockup

### Motion / animaciones (web se quedó plano)

| # | Sev | Delta | Mockup (evidencia) | Web | RN |
|---|-----|-------|--------------------|-----|-----|
| D1 | **MAYOR** | Flecha del pill "Sin descanso" **no anima** en web | `.a3b-arrow::after { animation: concept-a3b-arrow 1.6s }` + `.a3b-arrow::before { animation: concept-a3b-arrowline 1.6s }` (líneas 554-555, keyframes 592-593): la flecha se desliza y la línea se estira | `globals.css` `.exec-v3-ss-arrow` (1998-2025): **sin `animation`** — flecha estática | `SupersetScreenV3.tsx:493-505` `SlideArrow` translateX 0→3, 800ms loop reverse — **cumple** |
| D2 | MENOR | Dot de ronda activo **no late** en web | `.a3b-rd.now { animation: concept-a3b-beat 1.4s }` (línea 550; keyframes 587) | `.exec-v3-rounddots .exec-v3-rd.is-now` (1857-1860): solo `box-shadow`, **sin latido** (el `is-beat` con keyframe existe en 2983 pero es de otro componente, no se aplica aquí) | `SupersetScreenV3.tsx:442-453` `RoundDot` glow pulsante 1400ms — **cumple** |
| D3 | MENOR | Sin reflow al cambiar de miembro/ronda en web | (el mockup es estático; el contrato de motion menciona reordenamiento suave) | `SupersetStepV3.tsx:150-254`: contenedores `space-y`, **sin transición de layout** | `SupersetScreenV3.tsx:34,178,230` `CARD_LAYOUT = LinearTransition.springify()` — **cumple** |
| D4 | MENOR | CTA del paso sin "respiración" | `.a3b-ss-cta { animation: concept-a3b-breathe 2.6s }` (línea 556) | No aplica literal: el CTA dedicado no existe (ver D9); el commit vive dentro de `LogSetForm` | Igual que web (commit dentro de `ActiveSetRow`) |

### Tarjeta de miembro — tamaños/colores

| # | Sev | Delta | Mockup | Web | RN |
|---|-----|-------|--------|-----|-----|
| D5 | MENOR | Mini-media **56px** en web vs **60px** contrato | `.a3b-exmini { width:60px; height:60px }` (206-208) | `globals.css:1885-1886` `.exec-v3-exmini { width:56px; height:56px }` — **56 (−4px)** | `SupersetScreenV3.tsx:248-249` `width:60,height:60` — **cumple** |
| D6 | MENOR | Badge de letra **26px** en RN vs **30px** contrato | `.a3b-exletter { width:30px; height:30px; border-radius:10px; font-size:15px }` (199-202) | `globals.css:1901-1913` 30×30, radius 10, font 15 — **cumple** | `SupersetScreenV3.tsx:270-283` `width:26,height:26,borderRadius:9,fontSize:13` — **−4px, font −2** |
| D7 | MENOR | Fondo de tarjeta no-activa `#1a1a22` en RN vs `#17171f` contrato | `.a3b-excard.next { background:#17171f }` (196-198) | `globals.css:1864` `.exec-v3-excard { background:#17171f }` — **cumple** | `SupersetScreenV3.tsx:236` `backgroundColor: … : s.surface` y `exec-theme.ts:68` `surface:'#1a1a22'` — **más claro** (`#1a1a22` es el *base del activo* en el mockup, no del inactivo) |
| D8 | MENOR | Texto sobre acento blanco vs `#072100` en RN | Badge de letra activo y pill "AHORA": `color:#072100` (203, 238) | `globals.css:1917,1965` `color:#072100` — **cumple** | `SupersetScreenV3.tsx:281,474` usan `exec.accentText`, que por defecto es `'#FFFFFF'` (`exec-theme.ts:116,131`) → texto **blanco** sobre verde, no el verde oscuro juicy del contrato |

### Estructura / contenido

| # | Sev | Delta | Mockup | Web | RN |
|---|-----|-------|--------|-----|-----|
| D9 | MAYOR (informativo) | CTA dedicado "Completar serie de {letra}" ausente como botón del paso | `.a3b-ss-cta` juicy 62px con check "Completar serie de A" (HTML 690-692; CSS 262-273) | No existe botón de paso: la tarjeta activa **embebe `LogSetForm`** (`SupersetStepV3.tsx:221-250`), cuyo propio CTA hace el commit | Igual: `ActiveSetRow` embebido (`SupersetScreenV3.tsx:331-355`) |
| D10 | MENOR | Estado "Hecho" difiere web vs RN (el mockup no muestra miembro hecho) | Solo define `.now`/`.after` (234-241); no hay estado "done" ilustrado | `SupersetStepV3.tsx:206` pastilla texto **"Hecho"** (`is-done`) | `SupersetScreenV3.tsx:288-289` **ícono `Check`** (no texto) → inconsistencia entre plataformas |
| D11 | MENOR | Botón técnica/sustitución **añadido** (no está en el contrato) | La fila del miembro no tiene botón de técnica ni "Cambiar" | `SupersetStepV3.tsx:207-216` botón `Info` (`exec-v3-extech`) por miembro con media | `SupersetScreenV3.tsx:301-327` chips "Cambiar"/"Sustituido"/"Deshacer" + "Ver técnica" en el activo (máquina ocupada) — divergencia web↔RN pero adición funcional aceptable |
| D12 | MENOR | Etiqueta de peso: web muestra entero, RN localizado | `8 reps · 30 kg` (663) | `SupersetStepV3.tsx:106-107` `${suggestedWeightKg} kg` sin formateo es-CL | `SupersetScreenV3.tsx:218` `formatWeightEsCl(...)` — RN es el fiel al formato local |

**Nota sobre el header del paso (gear + dots 8/8 + "4 de 8"):** en el mockup vive dentro del `body` de la pantalla (`a3b-tophead`, HTML 622-636). En la implementación ese header es **compartido** (`ExecHeaderV3`), no se duplica en `SupersetStepV3`. Fuera del alcance de esta unidad; se asume presente y correcto (verificar en unidad de header).

---

## Nuevo requerimiento del CEO (QA 2026-07-22) — delta técnico

> "El ejercicio activo de la superserie debe mostrarse **IGUAL que un ejercicio solo** (su gif grande y todo lo demás); al terminar la primera serie debe salir una **animación donde se CONTRAE ese ejercicio y se EXPANDE el siguiente** de la superserie, con un **aviso con fondo transparente y letras llamativas tipo 'Sigue sin detenerte'** para que el alumno sepa que es superserie."

### Cómo es HOY `SupersetStepV3` (web) — estructura

- Renderiza `memberVMs` **apilados** (`SupersetStepV3.tsx:167-254`). Cada miembro es una tarjeta `exec-v3-excard` con **mini-media de 56px** (`exec-v3-exmini`), badge de letra, nombre, `rxLabel` y pastilla de estado.
- El miembro **ACTIVO** (`state === 'active'`) añade DEBAJO de esa fila compacta el **`LogSetForm` embebido** (`SupersetStepV3.tsx:221-250`) para capturar la serie de la ronda actual (`setNumber = currentRound`, `isActive`, `supersetRest.closesRound`, `v3`).
- Los miembros **siguiente/hecho** quedan **solo como fila compacta** atenuada (`is-next` opacity .62 / `is-done` opacity .9), **sin** media grande ni keypad.
- Debajo de la pila: pill "Sin descanso — sigue con {letra}" (257-262), nota "Descanso {n}s al cerrar la ronda" (265-270) y, si el grupo está completo, "Superserie completa" (272-274).
- **No hay** gif grande del activo, **ni** animación de contracción/expansión, **ni** overlay "Sigue sin detenerte". El activo hoy = mini 56px + keypad. (El mockup tampoco los tiene: muestra tarjetas compactas + un CTA "Completar serie de A". El pedido del CEO es un **rediseño por encima del contrato**.)

### Qué reutiliza de `ExerciseStepV3` (el "ejercicio solo")

Hoy **casi nada de la presentación**: solo comparte el `resolveExecMedia()` (`exec-media`) y el patrón de reusar `LogSetForm`. La presentación grande del ejercicio solo vive íntegra en `ExerciseStepV3.tsx:118-288`:
- `exec-v3-exname` (título 26/900) — `ExerciseStepV3.tsx:122`
- `exec-v3-chip` tipo · músculo — `:124-126`
- **`exec-v3-media` (card 150px)** con chips glass "Instrucciones"/"Nota del coach" y video/imagen/youtube/fallback — `:131-189` (CSS `globals.css:1627-1637`, altura **150px**)
- `exec-v3-rx` prescripción + chip sobrecarga — `:192-209`
- fila **"Anterior"** 1-tap (`exec-v3-prev`) — `:212-236`
- `WheelHint` — `:239`
- `LogSetForm` por set — `:242-276`
- pie `exec-v3-foot` con cuadritos de serie — `:279-288`

### Qué habría que cambiar para cumplir (sin tocar el motor)

**Regla de oro:** NO tocar `LogSetForm` / `SetRow` / `ActiveSetRow` ni guardado/draft/cola/`supersetRest`. Toda la reforma es de **contenedor y orquestación de estado** en `SupersetStepV3` (web) y `SupersetScreenV3` (RN).

1. **Miembro ACTIVO = ejercicio solo completo.** Extraer de `ExerciseStepV3` un cuerpo reutilizable (p. ej. `<ExerciseSoloBody>` o un flag `variant="superset-active"`) que renderice `exec-v3-exname` + `exec-v3-chip` + **`exec-v3-media` 150px** (gif/vídeo real del miembro vía `resolveExecMedia`) + `exec-v3-rx` + "Anterior" + `WheelHint`. Envolverlo con lo específico de superserie que ya existe: badge de letra "A", chip "Ronda N de M", pill "Sin descanso — sigue con {letra}", nota de descanso.
   - **Restricción clave:** `ExerciseStepV3` mapea `LogSetForm` sobre **todos** los sets del bloque (`:243`); en superserie el activo debe renderizar **solo el set de la ronda actual** (`setNumber = currentRound`, como hoy en `SupersetStepV3.tsx:221-250`). Por eso NO se puede reusar `ExerciseStepV3` entero: extraer el *encabezado/media/prescripción* como pieza sin la lista de sets, y seguir montando el mismo `LogSetForm` de una sola serie que hay hoy (props idénticas → motor intacto).

2. **Otros miembros = colapsados.** Mantener la tarjeta compacta `exec-v3-excard` actual para `next`/`done` (mini 56→60px por D5). Es el estado "contraído" del que se expande.

3. **Animación contrae/expande.** Al confirmar el set del activo y avanzar la ronda a otro miembro (deriva del engine: cambia `activeBlockId` en `SupersetStepV3.tsx:127-131`), animar el que deja de ser activo de expandido→colapsado y el nuevo activo de colapsado→expandido.
   - **Web:** hoy no hay reflow (D3). Opciones sin tocar motor: envolver cada tarjeta en un wrapper con animación de altura (CSS `grid-template-rows: 0fr↔1fr` sobre el bloque media+keypad, o `@formkit/auto-animate`/FLIP). Disparo por cambio de `activeBlockId` (efecto/`key`).
   - **RN:** ya existe `CARD_LAYOUT` (`LinearTransition`) para el reflow; falta la transición de **contenido** (media grande apareciendo/desapareciendo). Añadir `MotiView` de altura/opacidad al bloque de media+captura del activo.

4. **Aviso "Sigue sin detenerte" (overlay transparente).** Overlay efímero (~1-1.2s) a pantalla completa, **fondo transparente** (sin scrim opaco) y tipografía grande/llamativa (peso 900, acento de marca), disparado **solo cuando el siguiente miembro cae en la MISMA ronda** (`nextInRound != null`, `SupersetStepV3.tsx:136-137`) — es decir, transición A→B **sin descanso**; NO cuando la ronda cierra (ahí entra el timer/`RestInterstitialV3`).
   - Reutilizar el patrón de overlay ya existente para no inventar infra: web `PrCelebration`/`celebration-host`, RN `celebration-host.tsx`/`PrCelebration.tsx`. Se monta como capa hermana, se dispara en el callback de commit del set activo (`onResult`/`onLogged` en web `:246-247`, `onCommitSet` en RN `:353`) sin modificar el motor.
   - Copy exacto sugerido (es-CL, con tildes): **"Sigue sin detenerte"**. Debe respetar `prefers-reduced-motion` (mostrar el texto sin animación de entrada/salida).

5. **Qué NO cambia:** derivación de ronda/orden/estado del engine (`buildRoundOrder`/`firstIncompleteInRounds`/`isRoundComplete`, `SupersetStepV3.tsx:123-145`), `supersetRest.closesRound`, y toda la superficie de `LogSetForm`/`ActiveSetRow`. El pill "Sin descanso" y la nota de descanso ya existen y se conservan.

**Riesgo/nota:** con el activo en tamaño "solo" (media 150px + keypad) la pantalla crece bastante; validar scroll y que el pie/pill no queden empujados fuera del viewport del ejecutor. La animación de expandir debe medir altura real (media puede ser vídeo/gif/none) — preferir `auto`-height animada, no altura fija.

---

## Cumple (fiel al contrato — no re-tocar)

- **Título + chip de ronda (web):** "Superserie {letra}" 26/900 −.02em (`globals.css:1824-1828`) y `exec-v3-roundchip` con hex idénticos al mockup `.a3b-roundchip` (bg `color-mix(brand 15%,#16161d)`, borde `color-mix(brand 34%)`, texto `color-mix(brand 85%,#fff)`) — `globals.css:1830-1840` vs mockup 175-181. **Exacto.**
- **Dots de ronda (web):** `exec-v3-rd` 8px, track `#2f3a2a` con `inset box-shadow color-mix(brand 30%)`, `.is-done` `color-mix(brand 55%,#16161d)`, `.is-now` glow `color-mix(brand 24%)` — `globals.css:1846-1860` vs mockup 182-185. **Exacto** (salvo el latido, D2).
- **Tarjeta activa (web):** bg `color-mix(brand 10%,#1a1a22)`, borde `color-mix(brand 55%)`, `box-shadow 0 0 0 4px color-mix(brand 10%)` — `globals.css:1867-1871` vs mockup 191-195. **Exacto.**
- **Badge de letra (web):** 30×30 radius 10 font 15/900; activo bg marca `#072100`, inactivo `#26262f`/`#9a9aa6`/borde `#3a3a45` — `globals.css:1901-1919` vs mockup 199-204. **Exacto.**
- **Nombre y rx (web):** `exec-v3-exnm` 15/900 −.01em, atenuado `#c4c4cf`; `exec-v3-exrx` 13/800 `#d4d4dc`→`#8f8f9c` — `globals.css:1927-1947` vs mockup 232-241. **Exacto.**
- **Pastilla de estado (web):** `exec-v3-exstate` 9/900 .1em uppercase; `.is-now` marca/`#072100`; `.is-after` `#26262f`/`#9a9aa6` — `globals.css:1955-1970` vs mockup 234-239. **Exacto.**
- **Pill "Sin descanso — sigue con {letra}" (web):** bg `color-mix(brand 12%,#16161d)`, borde `color-mix(brand 30%)`, texto `color-mix(brand 88%,#fff)`, 13/800; flecha construida con `::before/::after` en marca — `globals.css:1985-2025` vs mockup 243-261. **Exacto** (menos el deslizamiento, D1).
- **Nota de descanso (web):** `exec-v3-ss-restnote` bg `#15151c`, borde `#24242e`, 12/800 `#8f8f9c`, `<b>` `#cfcfd8`, reloj CSS `#6f6f7c` — `globals.css:2026-2060` vs mockup 274-283. **Exacto.**
- **Copy es-CL:** "Superserie {letra}", "Ronda N de M", "Ahora"/"Sigue", "Sin descanso — sigue con {letra}", "Descanso {n}s al cerrar la ronda" — coincide con el mockup en web y RN.
- **Motor intacto:** ambos consumen `superset-rounds` sin duplicar el intercalado ni el cierre de ronda, y reusan `LogSetForm`/`ActiveSetRow` sin bifurcar guardado/cola (`SupersetStepV3.tsx:51-62,123-145`; `SupersetScreenV3.tsx:48-59,160-166`). **Correcto — conservar.**
- **RN motion:** flecha deslizante (`SlideArrow`), latido del dot (`RoundDot`) y reflow (`CARD_LAYOUT`) presentes — RN es más fiel al motion del mockup que web.
