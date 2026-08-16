# SPEC — T3.v Cabina: pasada visual del editor único de nutrición

- **Programa padre:** [nutrition-unified-editor](../nutrition-unified-editor/SPEC.md) (T3.x) — esta es la
  tanda «pasada visual UI/UX del editor (tanda propia)» declarada pendiente en
  [CURRENT](../../status/CURRENT.md) desde el cierre de T3.3b, y la penúltima fase antes de cerrar el
  programa (después solo quedan QA device → OTA acumulado → retiro agendado del par viejo).
- **Rama de trabajo:** `rnmobiledenuevo`.
- **Decisión de diseño del dueño (2026-08-16):** dirección **«Cabina v2»**, elegida sobre dos rondas de
  mockups de alta fidelidad (artifacts «Cabina, Recetario, Vitrina» y «Cabina v2 · Agenda», sesión
  2026-08-16). La dirección «Agenda» queda archivada como posible vista alternativa futura, fuera de
  este programa.
- **Alcance de plataformas:** web desktop + responsive/PWA y RN Android (el editor T3.3b ya convergido).
  iOS solo vía OTA post-aprobación. **Cero dependencias nuevas. Cero backend.**

## Por qué existe esta SPEC

El editor único quedó funcionalmente completo (T3.1→T3.3b, R1) pero visualmente denso: cada alimento
grita cuatro chips de texto («228 kcal · P 8 · C 39 · G 4»), las metas ocupan el primer pantallazo, y
todo compite con todo. El dueño lo resumió: «hay como mucho en todos lados; la forma en que mostramos
los macros debe ser más cómoda visual en vez de tanta letra y número, pero igual entendible».

Cabina v2 ataca eso con CUATRO movimientos de presentación (cero cambios de gramática):

1. **MacroSpark** — kcal + barra apilada P/C/G por aporte calórico, con los tokens de color de macros
   que el DS ya define y el alumno ya conoce. Los gramos exactos viven a un hover/tap.
2. **Metas fuera del lienzo** — popover «Metas ▾» en la cinta; el canvas queda solo comida y aire.
3. **Filas sin cajas** — foto real del producto + nombre con marca + stepper + kcal+spark; separador
   de 1 px; franja contraída muestra stack de fotos + spark.
4. **Rail de días diagnóstico** — punto de estado + kcal; el defecto B4 como enlace de acción.

## Decisiones

**D1 — Cabina v2 es la dirección.** Los mockups aprobados (artifact «Cabina v2 · Agenda», secciones
00 y A·1–A·5) son la referencia visual normativa de esta tanda. Agenda NO se implementa.

**D2 — MacroSpark reemplaza a `MacroChipRow` SOLO en las superficies del editor único/quick-edit,
picker del coach y barra de publicación.** El builder-wizard (par viejo, en ventana de retiro hasta
2026-08-30) y TODA el área del alumno quedan intactos. La barra apila por **aporte calórico**
(P×4 / C×4 / G×9, normalizado a 100 con guardas para kcal 0) usando los tokens existentes
`--color-macro-protein/carbs/fats` (+ variantes dark) de `globals.css` y su espejo RN.

**D3 — Popover de gramos, contrato de interacción único web+RN:**

- *Puntero fino* (`(hover: hover) and (pointer: fine)`): abre a los ~120 ms de hover sobre el spark o
  al recibir foco por teclado; cierra al salir del trigger/panel, al perder foco o con `Esc`.
- *Puntero grueso / RN*: tap sobre el spark abre un mini-popover anclado al elemento; cierra con tap
  fuera, botón atrás (RN), scroll del contenedor o tap en otro spark (solo uno abierto a la vez).
- *Contenido*: `P {x} g · C {y} g · G {z} g` (+ `Fibra {f} g` si el dato existe). En subtotales de
  franja y totales de día agrega `{n}% de la meta` cuando hay meta de kcal.
- *A11y*: el trigger es focusable con `aria-label` «Macros: proteína X g, carbohidratos Y g, grasas
  Z g»; hit-area táctil mínima 44×28 px aunque la barra mida 48×6; anillo de foco con token `ring`.
- *Posición*: anclado al spark, con flip/clamp contra los bordes del viewport y del overlay del editor.

**D4 — Fotos reales de producto en las filas.** Web: mismo camino que el picker (`FoodThumb` /
`resolveFoodImageUrl` sobre `product_image_path`, bucket público `food-media`) con fallback
determinista al ícono de categoría. RN: `nutrition-v2-food-media.ts` ya existente. **Prohibido**
Supabase Image Transformations (cuota): URL pública directa, como hoy.

**D5 — Metas del día activo migran al popover «Metas ▾» de la cinta.** `TargetsEditorCard` deja de
pintarse en el canvas del editor; el popover edita kcal/P/C/G con los mismos steppers y expone
fibra·sodio·agua bajo revelado progresivo. `EditorMetaCard` (nombre/estrategia/permisos/vigencia)
**se conserva** como card colapsada slim — en creación y plantilla sigue abriendo expandida (ahí es
lo primero que se define; no se regresa el flujo W1.5/T3.2b).

**D6 — Cierre del programa, secuencia (pedido del dueño 2026-08-16):** esta tanda → QA visual +
QA device Android (se funde con el QA pendiente de T3.3b) → **OTA android ACUMULADO**
(T3.3a + T3.3b + visual, decisión previa del dueño) → el retiro del par viejo queda **agendado
2026-08-30** (regla D3 del programa padre: 2 semanas estable; inventario y mudanzas ya hechos).
El retiro NO entra en esta tanda.

## Alcance

### Superficies que cambian (web)

`apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/`: `QuickEditPlanView` (layout 3 zonas
v2, rail, leyenda, responsive), `EditableItemRow` (fila v2 con foto+spark), `EditableSlotCard`
(header/subtotal con spark, contraída con stack), `TargetsEditorCard` (muere del canvas; su contenido
vive en el popover de cinta), `PublishBar` (totales con spark + barras por macro con token de color),
`EditorPalette` (rows con foto+spark), `EditorMetaCard` (slim), microcopy.
`_components/food-picker/FoodPickerRow` (spark por 100 g). Compartidos nuevos en
`apps/web/src/components/nutrition-v2/`: `MacroSpark`, `MacroSparkPopover`.

### Superficies que cambian (RN)

`apps/mobile/components/nutrition-v2/quick-edit/`: espejo de lo anterior sobre el editor T3.3b
(`EditableItemRow`, `EditableSlotCard`, `TargetsEditorCard`→popover de cinta, `PublishBar`,
`FoodSearchSheet`) + `MacroSpark` RN y popover anclado nativo. Pantallas
`app/coach/nutrition-v2/editor/[clientId].tsx` y `plantillas/editor.tsx` (cinta compacta).

### Lógica compartida

`packages/nutrition-v2`: helper puro `macroCalorieShares()` con tests (una sola fuente para web y RN;
mata el drift de porcentajes).

### Responsive (contrato por breakpoint, web)

| Rango | Layout |
|---|---|
| ≥1536 | 3 zonas; canvas max-w 880 centrado; rail 190 / paleta 288 fijos |
| 1280–1535 | 3 zonas 190 / 1fr / 288 |
| 1024–1279 | 3 zonas 168 / 1fr / 260 (labels del rail truncan) |
| 768–1023 | SIN paleta (alta por franja vía sheet, camino actual); días como cápsula horizontal; cinta compacta (anillo 40, barras 60) |
| <768 | Patrón móvil actual + mini-cinta de 1 línea (barra kcal + 3 % con dot de macro); spark `sm`; PublishBar thumb-zone intacta |

Touch targets ≥44 px en puntero grueso en TODOS los controles nuevos.

## Fuera de alcance

- Área del alumno completa (su dashboard ya usa los mismos tokens de macro; reskin = otra tanda).
- Builder-wizard y quick-edit clásico del par viejo (ventana de retiro; ni un className).
- Dirección «Agenda» (archivada), hub/ficha reskin completo (solo se permite la columna «Hoy» del
  roster como tarea opcional W-B si el tiempo alcanza).
- Cualquier cambio de reducer, RPC, schema, endpoint, entitlement o copy de publish.
- Edición de micros más allá del revelado fibra·sodio·agua ya existente en targets.
- Enterprise (cuarentena), V1, builds nativas iOS.

## Backend

**Cero.** Guardas explícitas: los gramos del popover ya viajan en el draft (macros en mano por item y
subtotales derivados); las fotos salen del bucket público existente con la URL directa que ya usa el
picker; no se agrega fetch, endpoint, columna ni RPC; no cambia ninguna forma de leer/escribir. Si una
tarea de esta tanda «necesita» tocar `_data`/`services`/SQL, la tarea está mal planteada — parar y
reportar.

## Invariantes

- Heredados del programa: publish CAS/idempotencia/códigos intactos; UI nunca autoriza; NUT-007/008;
  gramática destructiva T2.6/F1 (optimista + Deshacer, cero confirms); notas visibles jamás se
  resetean.
- **Superset visual:** toda afordancia existente conserva un lugar visible u obvio (la matriz 1:1 de
  los artifacts es la referencia); nada se «esconde» sin equivalente.
- Los gramos NUNCA quedan inaccesibles: spark sin popover funcional = regresión bloqueante.
- Tokens del DS solamente (`check:tokens` verde); colores de macro solo vía tokens, jamás hex inline.
- Safe areas, dark/light y white-label en todo lo nuevo; gotcha css-interop vigente (Pressable jamás
  con style-función).
- Regla del owner: verificar LOCAL (harness + Playwright headless) ANTES de cualquier preview.

## Riesgos

1. **Popover táctil sobre listas con scroll** (ancla se mueve): cierre en scroll + clamp/flip; un solo
   popover vivo. Mitigado por contrato D3.
2. **Fotos desalinean filas** (alturas variables/carga): thumb 34×34 fijo con fallback inmediato al
   ícono de categoría; sin layout shift (dimensiones reservadas).
3. **Swap de `MacroChipRow` rompe tests existentes** de las superficies tocadas: actualizar esos tests
   en la misma tarea, jamás borrar aserciones de datos (kcal/gramos siguen afirmables vía aria-label).
4. **Drift web↔RN de los porcentajes**: imposible por construcción — `macroCalorieShares` único en
   `packages/nutrition-v2` con tests golden.
5. **La cinta se desborda en 1024–1279** (lección de la ronda 1 de mockups): budget de anchos definido
   en el contrato responsive; Playwright headless captura 1024/1280/1440 como gate local.

## Criterios de aceptación

- Un coach edita y publica un plan completo en 390, 768, 1024, 1280 y 1536 px sin pérdida de ninguna
  capacidad de la matriz T3.x; los gates de siempre verdes (`lint`, `typecheck`, `test`, `build`,
  `check:tokens`, `check:nutrition-v2-boundaries`, `tsc` mobile, `expo export`, `docs:check`).
- MacroSpark visible en: fila de item, subtotal de franja, franja contraída, totales de PublishBar,
  rows de paleta y picker (web) y sus espejos RN; popover de gramos operable con mouse, teclado y tap
  según D3, con un solo popover abierto a la vez.
- `TargetsEditorCard` ya no se pinta en el canvas y TODAS sus capacidades (steppers, fibra·sodio·agua,
  errores de validación) operan desde «Metas ▾»; creación y plantilla conservan su flujo de apertura.
- Fotos de producto en filas web+RN con fallback a ícono de categoría; cero requests a
  transformaciones de imagen.
- El par viejo (builder + quick-edit clásico) renderiza EXACTAMENTE igual que antes de la tanda
  (diff cero en sus árboles).
- Harness local verde antes de preview; QA visual del owner en preview; QA device Android del owner
  (funde el pendiente de T3.3b); OTA acumulado android publicado vía GH Actions al cierre.
- `MOBILE_PARITY.md` y `CURRENT.md` actualizados en el commit del corte.
