# Adiciones al Mega-Plan de Nutrición EVA — Features A–K (excluye recetas)

> Estas secciones SE SUMAN al plan maestro existente. No repiten el plan; lo extienden. Recetas quedan fuera (se estudian aparte). Decisiones base ya lockeadas: **base amplia** (credibilidad/UX del tier free), **Nutrición Pro** = poder de nutricionista profesional, **sin IA, sin cámara-logging**. Motor único: `computeNutritionAdherence` (recordar que `dashboard.service` calcula macros MAL — su consolidación es P0 y bloquea A/H/I/K).

## Dependencias transversales (prerequisitos que el plan debe nombrar como work-items propios)

Antes de las features, el plan necesita estos cimientos compartidos. El panel de roles los marca como "additionsMissed" repetidos en 6+ lanes:

- **D0 — Motor único de adherencia (P0 gate).** Consolidar todo % de cumplimiento en `computeNutritionAdherence`. `dashboard.service` calcula macros mal; construir A/H/I/K sobre dos fórmulas divergentes muestra semáforos inconsistentes entre dashboard y ficha. **Bloquea: A, H, I, K.**
- **D1 — Rollup semanal por alumno (tabla + cron).** Tabla `nutrition_weekly_rollup` (client_id, iso_week, adherence_pct, macros, micros agregados), refrescada por cron off-peak, con historial para diffs. Evita N+1 sobre 30–300 alumnos (IO budget de Supabase Micro). **Bloquea: I, K, y los veredictos de promedio-semanal de A.**
- **D2 — Capa de normalización de unidades (servicio puro compartido).** Función pura `normalizeUnit({quantity, unit, food_id})` que convierte g/ml/taza/cucharada/unidad cuando son compatibles y **lista por separado** las incompatibles en vez de adivinar. Vive en `packages/` para que web + `apps/mobile` la consuman 1:1. **Bloquea: B, C, D.**
- **D3 — Modelo de alérgenos / restricciones (server-side, estructurado).** No existe hoy (`foods` no tiene `allergens`, el cliente no tiene restricciones). Es **prerequisito de seguridad** de D y filtro de B. Exclusión DURA, nunca advisory. **Bloquea D ("alergia-aware").**
- **D4 — Tablas de referencia versionadas (data, no hardcode).** DRI/MINSAL por edad/sexo y factores de densidad por alimento como tablas seed idempotentes con `provenance` + `effective_date`. **Bloquea A, C.**
- **D5 — Disciplina de migración (DoD en cada migración nueva).** Aditiva/idempotente/forward-only; `GRANT UPDATE(col)` co-ubicado con cada columna user-editable nueva (o PostgREST tira 42501 en runtime, también en mobile/enterprise). Side-tables nuevas (`shopping_list_items`, `nutrition_meal_comments`, etc.) en vez de ensanchar tablas grant-locked.

---

## A. Micros con objetivo/límite (piso/meta/techo + estado)

**Qué.** Cada micronutriente muestra no un número, sino un piso, una meta y un techo, con estado "Bajo / Óptimo / Alto" señalado por texto + ícono + posición (color solo refuerzo).

**Por qué importa.** Es la columna vertebral de la credibilidad clínica de Nutrición Pro: un nutricionista reconoce de inmediato el modelo piso/meta/techo. Pero es el feature que más fácil se rompe en un demo si sale superficial.

**BASE o Nutrición Pro (split obligatorio).** **A-base:** 1–2 nutrientes que el chileno ya reconoce (sodio como "cap", fibra como "aim-up"), con encuadre semanal y estado redundante. **A-pro:** panel completo con piso/meta/techo editable por nutriente, provenance DRI y set clínico (hierro, calcio, potasio, vitaminas). Justificación del reparto: las comidas base son texto libre (sin filas de alimentos), así que el panel completo de micros sumables solo computa por la vía estructurada/exchanges → pertenece a Pro. El subset reconocible de 1–2 nutrientes vive en base para sostener "amplia y creíble".

**Fase.** A-base = **F1**. A-pro = **F2** (depende de comidas estructuradas + D4).

**Mejor práctica 2026.** MacroFactor "Nutrient Explorer" (piso/meta/techo editable con historial) y Cronometer (Daily Target + Maximum Threshold, score penaliza pasarse del techo). Clasificación aim-up vs cap define la dirección de la barra. Ancla cultural: semántica "Alto en" chilena (Ley 20.606) para los cap-nutrients — **pero usar grafismo NEUTRO propio, NO replicar el sello octagonal negro** (Legal: su uso fuera del etiquetado de envasados es fiscalizable e induce a error; además no confundir corte por-100g con techo diario).

**Cómo (visual + funcional).** Nuevo átomo `NutrientRangeBar` en `components/atoms/` que recibe `{value, floor, target, ceiling, intent:'aimup'|'cap'}` y **invierte la metáfora** (llenar-para-alcanzar vs llenar-para-evitar). Estado redundante (label + ícono lucide arrow/check/triangle + `aria-valuetext` con "valor unidad, estado"). Config en tabla nueva `nutrient_targets` (no columnas en coaches/clients → evita la policy compra-only) keyed `(coach_id|client_id, nutrient_key)` con `floor/target/ceiling/intent/provenance`. Validación Zod server-side (`ceiling>=target>=floor`, no-negativos, sin NaN). Veredictos sobre **promedio rodante semanal** (D1), nunca pass/fail diario (anti-patrón #1 que genera falsas alarmas de déficit). Motion: reuso de fill animado con `useReducedMotion`.

**Consenso de roles.** Veredicto dominante: **needs-change** (split A-base mínimo / A-pro completo, encuadre semanal obligatorio). Riesgo top: pass/fail diario + ring color-solo = falsas alarmas de "estás fallando" → tickets de soporte, churn, y un nutricionista destroza el demo en vivo.

**Veredicto final.** **A-base en F1** (sodio+fibra, semanal, accesible). **A-pro en F2**. Disclaimer de nutrición obligatorio en vista alumno y export (Legal). El coach ingresa umbrales; EVA jamás pre-rellena defaults clínicos por patología.

---

## B. Lista de compras generada del plan

**Qué.** El plan se proyecta en una lista del súper: agrega ingredientes por semana, los agrupa por pasillo, permite tachar con un toque y compartir por WhatsApp/PDF.

**Por qué importa.** El feature de mayor adopción del lote y la mejor línea de venta ("el plan se vuelve tu lista del súper, lista para WhatsApp"). Es lo que el alumno abre cada semana y lo que prueba el valor del tier free.

**BASE o Nutrición Pro.** **BASE.** Justificación: EVA tiene ventaja estructural — agrega por `food_id` (no parsing de texto libre), esquivando el 90% del dolor de los incumbentes. Es credibilidad del tier free, no poder profesional. (Limitación: solo computa bien para planes con la vía estructurada de alimentos; para comidas 100% texto libre degrada — ver D2 y la auditoría de data-readiness.)

**Fase.** **F1** (tras A-base/C porque comparte D2). Es el build nuevo más grande del lote, secuenciar después de los display-layers baratos.

**Mejor práctica 2026.** Mealime / Plan to Eat (auto-regenerar desde el plan, no snapshot — lista vieja = abandono en la semana seis, el killer #1). Agregación por food_id (Fond/AnyList), pasillos reordenables (AnyList "category sets"). Exclusión ligera de "staples que nunca compro" (Paprika), NO inventario completo de despensa (friction). Export low-tech WhatsApp/PDF > integraciones retail (Fintech: DROP retailer APIs para Latam — nueva superficie de API keys/PII sin demanda).

**Cómo (visual + funcional).** Servicio **derivado puro** `buildShoppingList(planId)` (React.cache, recomputa on-read; jamás tabla snapshot). Única persistencia: tabla `shopping_list_items` client-scoped (check-state + ítems manuales) con `GRANT UPDATE(col)` co-ubicado (D5) y **columna `category`/`store` nullable por línea desde día uno** (no foreclosar multi-store). Pasillos localizados (verduras/carnicería/lácteos/abarrotes). Check-off one-tap, target ≥44px, **optimista y offline-tolerante reusando `OfflineNutritionQueueSync` / `nutrition-offline-queue`** (en el súper no hay señal). Mobile: bottom-sheet, FlashList, RN Share API. Respeta la invariante cascade-safety de `reconcileMeals` (editar el plan no debe huérfanar líneas). Free-text de ítems manuales: Zod length-cap + escape-on-render (no inyección en PDF/share).

**Consenso de roles.** Veredicto dominante: **base-now**. Riesgo top: lista que NO auto-regenera al editar el coach el plan → stale → abandono en la semana seis y demo que muere en vivo. Mobile: heavy → un lane (Mobile) lo marcó "pro"; mayoría lo sostiene base por su valor de adopción.

**Veredicto final.** **BASE, F1.** Auto-regenerar es requisito duro de venta. Export = WhatsApp/PDF. No incluir datos sensibles de salud en el texto compartido (Legal). Sin alergias en el share salvo lo estrictamente alimentario.

---

## C. Medidas caseras en modo gramos

**Qué.** Junto al gramo, mostrar la medida casera que el alumno sí entiende: "120 g (1 palma)", "1 taza (240 g)".

**Por qué importa.** Mata la objeción #1 de adopción ("mis alumnas no entienden gramos"). El modo gramos base hoy muestra solo gramos que el alumno no ejecuta. Es la victoria más barata y de mayor credibilidad del tier free.

**BASE o Nutrición Pro.** **BASE.** Justificación: es capa de DISPLAY pura sobre el gramo autoritativo, riesgo casi nulo. El módulo de intercambios ya tiene las medidas caseras; el modo gramos base las hereda como anotación. Pertenece a base por definición ("amplia y creíble").

**Fase.** **F0/F1** — primero del lote, lowest-risk.

**Mejor práctica 2026.** FDA Nutrition Facts + regla MINSAL de etiquetado: medida casera primero, métrica entre paréntesis. Sistema de mano de Precision Nutrition (palma/puño/mano-ahuecada/pulgar, ~95% tan preciso como pesar). Vocabulario Latam (taza/cucharada/trozo/rebanada/palma), NO cups/oz gringo. IMSS "manos, mejor medida".

**Cómo (visual + funcional).** Gramo = fuente de verdad almacenada; medida casera = transform de display. Factores de densidad/household por alimento en tabla de referencia (D4), etiquetados "aprox" (la conversión volumen-masa es inexacta por densidad variable — false precision = reclamo SERNAC). Microcopy inline en `MealIngredientRow` (web) y `FoodItemRow`/`MealCardExpandable` (mobile). **Decisión explícita de fuente-de-verdad:** fijar si "palma" resuelve a gramos FIJOS o escalados al individuo (las porciones de mano auto-escalan por tamaño corporal) — documentar baseline por género, o el coach interpreta la palma del alumno con un supuesto de gramos equivocado. **Gotcha codebase:** un toggle g↔casera debe pasar children explícitos con label map (Base UI `SelectPrimitive.Value` renderiza el value crudo); mobile usa SegmentedTabs, trivial ahí.

**Consenso de roles.** Veredicto dominante: **base-now** (unánime). Riesgo top: presentar la conversión como exacta (false precision) → reclamo de información engañosa.

**Veredicto final.** **BASE, F0/F1, ship primero.** Estimaciones rotuladas como aproximadas, vocabulario MINSAL.

---

## D. Swap self-serve macro-matched (modo gramos, alergia-aware)

**Qué.** El alumno dice "no tengo / no me gusta esto → dame un equivalente" contra la base de alimentos, respetando sus alergias. Hoy solo existen swaps que el coach predefine.

**Por qué importa.** Autonomía del alumno = ahorro de tiempo del coach ("se auto-resuelven sin escribirte a las 11pm"). Es un ancla comercial de Nutrición Pro. Pero también el feature más sensible a seguridad del lote.

**BASE o Nutrición Pro.** **PRO** (con condición de seguridad). Justificación: el macro-match algorítmico contra la food DB + alergia-aware es exactamente el poder de nutricionista profesional que justifica $9.990/mo; ponerlo en base canibaliza el headline pago. Arquitectónicamente necesita comidas estructuradas + índice de macros + D3. **El swap predefinido-por-coach se queda en base.**

**Fase.** **F2/F3** (después de D3 + fundación de comida estructurada).

**Mejor práctica 2026.** EatLove (swap a opciones dentro de los parámetros nutricionales del cliente). Es un constraint-solver: encontrar alimento dentro de ±envelope de macros, **excluir alérgenos como restricción DURA**.

**Cómo (visual + funcional).** El riel UI ya existe: `nutrition_meal_food_swaps` + `swapped_quantity/unit` + `FoodSwapSheet`/`ExchangeEquivalencesSheet` (web) y `FoodSwapSheet.tsx`/`FoodSearchSheet.tsx` (mobile). Falta el QUERY: RPC server-side que rankea por distancia de macro **dentro de la misma categoría con cap de resultados** (no scan de tabla completa sin índice — Upstash rate-limit, endpoint uncacheable triggered-por-alumno). Discriminador `source='self_serve'` en la tabla de swaps. **Seguridad (no negociable):** exclusión de alérgenos computada server-side contra campo estructurado (D3), con test adversarial que garantice que el alérgeno **nunca** aparece aunque no haya match de macros (retorna vacío antes que un match inseguro). Gate server-side por entitlement (no client-side; RLS hoy permite auto-activar gratis — confirmar gate vivo). Señalar el MODO de prescripción (estricto/flexible) o el alumno trata inspiración como prescripción.

**Consenso de roles.** Veredicto mixto: PM/Sales/Fintech/Frontend = **pro**; Mobile = "needs-change/base-now porque la UI ya está"; Legal/Security/QA = **needs-change** centrado en seguridad de alergias. Riesgo top: un swap que ignora una alergia es **incidente de salud y responsabilidad civil**, no un bug de UX.

**Veredicto final.** **PRO.** Si la food DB chilena no garantiza exclusión dura de alérgenos, **sacar el claim "alergia-aware"** y dejar solo macro-match (entonces podría adelantarse). Disclaimer explícito "verifique siempre los ingredientes; no sustituye criterio médico". No marketear "seguro para alérgicos".

---

## E. Nota/feedback bidireccional por día-comida

**Qué.** El alumno deja una nota en un día/comida y el coach responde sobre ese mismo objeto. Cierra el loop de coaching.

**Por qué importa.** El primitivo de retención más fuerte del lote y lo que hace que el producto se sienta como COACHING y no como un tracker. Diferenciador directo vs MyFitnessPal.

**BASE o Nutrición Pro.** **BASE.** Justificación: el loop debe ser visible en todas partes para que sea el alma del producto. Barato de modelar. La cadencia de check-in estructurado/condicional (MacroFactor) es el upsell Pro.

**Fase.** **F1.**

**Mejor práctica 2026.** Healthie (set fijo de reacciones one-tap: Visto/Buen trabajo/Ojo — el reductor de fatiga del coach a escala). Trainerize (comentarios anclados a la actividad específica; **envió one-directional primero y tuvo que backfillear la respuesta del coach** — callejón sin salida documentado). Separación Notas privadas del coach vs Comentarios visibles.

**Cómo (visual + funcional).** **Coach-reply EN EL MISMO release que la nota del alumno** (no negociable). Dos tablas/audiencias distintas: `nutrition_meal_comments` (bidireccional, anclada al `meal_log`/día, NUNCA chat plano) y `nutrition_private_notes` (coach-only). RLS estricta: cliente nunca puede SELECT notas privadas; usar helper set-returning + `(select auth.uid())`, no EXISTS correlacionado (incidente prod 2026-06-09). IDOR-safe: scope desde JWT/`coach_client_assignments`, nunca de `client_id` del body. Reacción one-tap (enum) o el coach con 50–300 alumnos deja de responder. `nutrition_meal_logs` ya tiene `satisfaction_score` — extender esa superficie. Optimista vía `useOptimistic`, offline-queue extendida. Append-only/soft-delete (evidencia de disputa, espejo de `billing_snapshots`). Free-text: length-cap + escape + Upstash rate-limit. Notificación de coach-reply vía push EXISTENTE; payload genérico (no detalle de salud al servicio third-party).

**Consenso de roles.** Veredicto dominante: **base-now**. Riesgo top: enviar one-directional sin reply en el mismo release = loop muerto, producto "abandonado" visible en el trial; y sin reacción one-tap el coach se silencia a escala. Filtrar nota privada al alumno = incidente de confidencialidad.

**Veredicto final.** **BASE, F1, con coach-reply + reacción one-tap + notas privadas separadas en el primer release.** RLS coach/cliente-scoped (Ley 21.719: dato de salud, categoría especial).

---

## F. Recordatorios por comida configurables

**Qué.** Cada comida tiene su hora de recordatorio, editable por el alumno (recordar almuerzo 13:00), en vez del cron global que dispara aunque no haya nada que recordar.

**Por qué importa.** Arregla un anti-patrón real (el cron global entrena a ignorar/mutear todo → perdemos TODOS los push, no solo el ruidoso). Pero es optimización, no driver de adopción.

**BASE o Nutrición Pro.** **Later** (capa de hábito; puede empaquetarse como Pro). No es credibilidad ni UX-del-plan.

**Fase.** **F3** (tras el fix del cron que dispara en vacío, que la auditoría ya marca como prerequisito).

**Mejor práctica 2026.** EatWise (timing per-comida, editable por el usuario; pre/post nudges). Healthie (copy variado + canal separado para transaccional vs hábito). Anti-patrón: blast global a hora fija; copy idéntico recurrente = ceguera de notificación → mute total.

**Cómo (visual + funcional).** **NO N crons estáticos** (Vercel cron es declarativo y capeado): UN scheduler-cron frecuente (~cada 15 min) que consulta tabla `meal_reminders` (rows due en la ventana) y despacha, con dedupe/idempotencia (`last_sent_at` por client/meal/date — los crons reintentan en no-2xx). Tabla client-scoped + `GRANT UPDATE(col)`. **Mobile: local notifications (`expo-notifications`)** — offline, tz-correcto, sin backend; respetar el cap de 64 pendientes de iOS (ventana rodante). **Gotcha de canal:** push nativo va por el servicio EXPO (`apps/mobile/lib/push.ts` + `push_tokens`), NO el web-push/VAPID de `src/lib/push.ts`. Recordatorios de hábito en canal SEPARADO del transaccional/dunning (mutear comidas nunca debe mutear pagos). Copy variado, opt-in por categoría. Payload genérico (Legal: no detalle de salud en third-party).

**Consenso de roles.** Veredicto dominante: **later** (unánime). Riesgo top: tratar F como "más crons" falla en design-time; y erosión del canal de push si no se fija el cron en vacío primero.

**Veredicto final.** **Later, F3.** Scheduler-over-data + dedupe + canal aislado + local-notifications en mobile.

---

## G. Vista de plato / proporción (plate method)

**Qué.** Un círculo proporcionado: 1/2 verduras, 1/4 proteína, 1/4 carbo. Metáfora visual reconocible.

**Por qué importa.** La mejor metáfora de onboarding/empty-state y la vista más legible culturalmente para Latam. Hace que la nutrición base se sienta amigable, no una planilla. Mejor screenshot para outreach frío.

**BASE o Nutrición Pro.** **BASE.** Justificación: presentación pura, cero schema, alto pago cultural. Deriva del split de macros que el plan ya almacena.

**Fase.** **F1** (junto a C, como mitad visual del refresh de nutrición base).

**Mejor práctica 2026.** USDA MyPlate / Harvard Healthy Eating Plate — pero **localizar a Plato del Bien Comer (IMSS) / Guías MINSAL** con ejemplos de comida y vocabulario locales, no MyPlate gringo (Legal: usar Guía MINSAL como referencia, no presentarlo como "cumple tus metas").

**Cómo (visual + funcional).** Nuevo átomo `ProportionPlate` (composición SVG/conic-gradient, sin recharts; mobile = `react-native-svg` arcs) reusando la paleta canónica ya lockeada y el mismo lenguaje circular que el donut/anillo de macros (`MacroRingSummary`) — lee como vista hermana, toggleable. **Caveat encoded en el componente:** el plato es PROPORCIONAL, no absoluto — no derivar estado "meta cumplida" del plato solo; parearlo con la vista de cantidad. Accesibilidad: `role`/`aria-valuetext` con frase completa + text-summary equivalente (no SVG desnudo). `useReducedMotion` en el reveal.

**Consenso de roles.** Veredicto dominante: **base-now** (unánime). Riesgo top: que un plato bonito implique que las metas de macro están cumplidas (subsirve al usuario goal-driven); y usar grafismo gringo en vez de Plato del Bien Comer.

**Veredicto final.** **BASE, F1, como vista complementaria al anillo.** Localizada MINSAL.

---

## H. Diff "plan vs comido real" lado a lado

**Qué.** Comparar lo prescrito con lo realmente comido cuando exista registro fuera de plan.

**Por qué importa.** Suena potente, pero ningún incumbente lo hace como split literal — y depende de un prerequisito que EVA no tiene (logging libre fuera de plan).

**BASE o Nutrición Pro.** **Later** (si se construye, Pro). Redefinido: NO split de dos columnas, sino **medidor de adherencia + fila auto-comparable**.

**Fase.** **F3** (bloqueado por logging fuera-de-plan + D0).

**Mejor práctica 2026.** Investigación tajante: **ningún incumbente** (Eat This Much, EatLove, MyFitnessPal, That Clean Life) hace split planeado-vs-comido; todos colapsan a goal-vs-remaining. La versión realista = `computeNutritionAdherence` (prescrito vs logueado → % + barras delta), que el plan ya define.

**Cómo (visual + funcional).** Reusar el motor único (D0), no forkear un segundo path de comparación. Adjuntar el dato planeado a la fila logueada (mark-as-eaten/swap/skip por slot) para auto-comparación, más el rollup goal-vs-remaining que vive en `MacroRingSummary`. El diff no debe presentarse como juicio clínico de "incumplimiento de salud" sino como adherencia al plan del coach (Legal). Validar que el split visual valga el build antes de hacerlo (greenfield, no patrón copiable).

**Consenso de roles.** Veredicto dominante: **later** + needs-change implícito (redefinir a medidor de adherencia). Riesgo top: construir UI greenfield split antes de que exista la data de "real" que comparar; ROI bajo vs costo.

**Veredicto final.** **Later, F3.** Hacer el medidor de adherencia (ya casi presente), diferir el split literal salvo demanda explícita.

---

## I. Board de nutrición a nivel roster del coach

**Qué.** De un vistazo sobre toda la cartera: qué alumnos van mal en nutrición esta semana.

**Por qué importa.** Driver de retención del COACH (nuestro cliente que paga) y la puerta de entrada enterprise/teams ("ve qué alumnos van mal en toda tu cartera" cierra un centro de 300 alumnos). Convierte una lista larga en una lista de EXCEPCIONES.

**BASE o Nutrición Pro.** **Pro/Teams (F2).** Justificación: capability coach-tier de caseload; ancla del pitch multi-seat, no nutrición base. Decidir explícitamente free-base-coach vs Pro **antes** de construir (retrofittear un gate a un dashboard agregado es doloroso — Fintech).

**Fase.** **F2**, estrictamente después de D0 + D1 + que A/E produzcan la señal por-alumno.

**Mejor práctica 2026.** Trainerize Auto Client Tags (dos umbrales → tag baja/alta adherencia, **banda media SIN tag** mantiene la señal con significado; urgencia rojo=hoy/naranja=esta semana). Nutrition Centre / Insights (early-warning de churn).

**Cómo (visual + funcional).** **Sobre el rollup precomputado (D1), NUNCA agregación live** N+1 sobre 30–300 alumnos (IO budget). Tabla/RPC set-based con índices `(coach_id, log_date)`, `EXPLAIN ANALYZE (loops=1)` antes de ship + load-test a escala Movida (300+). Lista de excepciones (solo flag low/high), urgencia por color **pareada con badge texto "En riesgo" + ícono** (reusar patrón de `NutritionCoachAlertsPanel`). RLS: el coach ve SOLO sus alumnos asignados (test de aislamiento en la suite de separación; si hay RPC DEFINER → REVOKE authenticated + GRANT service_role + re-filtrar por `coach_id` interno, o el coach lee data global — gotcha del oráculo de finanzas). Mobile: FlashList, exception-filter obligatorio (una lista larga no cabe en teléfono). Legal (Ley 21.719): los flags son adherencia-al-plan, NO etiquetas de salud/diagnóstico; "en rojo" nunca automatiza acción adversa sin coach humano.

**Consenso de roles.** Veredicto dominante: **needs-change / F2** (gate behind rollup + motor único; mis-secuenciado si se construye antes que A/E). Riesgo top: build sobre `dashboard.service` (macros mal) → flags equivocados a toda la cartera de golpe; y N+1 que quema el IO budget.

**Veredicto final.** **Pro/Teams, F2, gated tras D0+D1.** Exception-list, RLS coach-scoped con test de aislamiento, precompute obligatorio.

---

## J. Imagen de referencia del coach por comida

**Qué.** El COACH sube una foto ilustrativa del plato (NO es cámara-logging del alumno). Una foto por comida/template.

**Por qué importa.** Refuerzo de branding/white-label ("tu marca, tus platos") y lift de apetito/adherencia. Buen upsell Pro, débil como razón standalone de compra.

**BASE o Nutrición Pro.** **PRO.** Justificación: sube varianza de calidad y costo de storage/moderación frente al modelo de librería profesional; es polish de coach pro, no fundamento base.

**Fase.** **F2.**

**Mejor práctica 2026.** MyFitnessPal Create-a-Meal (foto como atributo opcional del meal, autorada una vez, reusada en cada referencia). That Clean Life/EatLove (la foto ES la referencia visual del plato). Flujo pick→crop a aspect-ratio FIJO→fix EXIF→downscale. **No confundir con MFP Meal Scan** (cámara IA, fuera de scope).

**Cómo (visual + funcional).** Modelar como **UN campo nullable opcional** (`reference_image_url`) en la entidad meal/template (autorada una vez, mostrada en cada instancia + en la fila logueada para auto-comparación), NO captura per-log. **Reusar el pipeline WebP 1080px de check-in (commit 2b9911e)**: pick → crop 4:5 → WebP → upload. Bucket PRIVADO con signed URLs + RLS path-based (espejo de checkins-private del audit); validar MIME/magic-bytes server-side, strip EXIF (geolocalización), cap de tamaño. `<Image>` de Next (web) / `expo-image` (mobile), empty-state limpio cuando null. **Lifecycle (Fintech/DevOps):** cascade delete (meal borrado → imagen borrada) + purga en offboarding (espejo `purge_audit`); definir degradación si el add-on Pro pasa a cancelled. **Legal (UGC):** términos que transfieran responsabilidad/licencia al coach (declara derechos, prohíbe fotos de terceros / personas identificables sin consentimiento) + notice-and-takedown + moderación mínima.

**Consenso de roles.** Veredicto dominante: **pro** (Legal = needs-change por deberes UGC). Riesgo top: variancia de calidad/storage; IP/contenido (foto con derechos de terceros).

**Veredicto final.** **PRO, F2.** Atributo nullable, pipeline WebP reusado, bucket privado, términos UGC + takedown.

---

## K. Resumen semanal motivacional

**Qué.** Una tarjeta tipo "esta semana mejoraste 12% vs la anterior".

**Por qué importa.** El delta es el gancho motivacional real (pesa más que un absoluto) y cuenta una historia de progreso. Retención/viralidad. Pero es capa de delight sobre fundamentos.

**BASE o Nutrición Pro.** **Later** (presentación barata una vez exista el rollup). Puede ser talking-point de renovación.

**Fase.** **F3** (tras D1; comparte el rollup de I, diseñar el schema de I para servir también a K).

**Mejor práctica 2026.** MacroFactor (check-in semanal + goal ring + momento de celebración; intervalos 3/7/14/30/90d para que una mala semana no se sienta como fracaso). Streaks "consistencia sobre perfección". Delta destacado ("+X% vs la semana pasada").

**Cómo (visual + funcional).** Lectura de period-delta sobre `nutrition_weekly_rollup` (D1) — EVA ya tiene `nutritionWeeklyAvgPct` vs prevWeek + `WeekIcon`. Tarjeta de recap (recharts + framer-motion + `StreakCounter`/`NutritionStreakBanner` existentes), shareable por WhatsApp (Sales: artefacto branded que el alumno reenvía = superficie de referidos). **Reglas críticas (no es toggle, es lógica de umbral/copy):** (1) tono adaptativo — gentil cuando la pasó mal, empuje en racha; copy alegre sobre semana fallida daña confianza; (2) framing consistencia-sobre-perfección (5/7 días, sin rojo de fracaso); (3) intervalos múltiples. Casos límite testeables: divide-por-cero (semana previa vacía), primera-semana-sin-baseline. Legal/SERNAC: cifra auditable y reproducible, sin promesa de resultado de salud ("mejoraste tu adherencia", no "tu salud/composición"). `useReducedMotion` en el count-up.

**Consenso de roles.** Veredicto dominante: **later** (unánime). Riesgo top: tono mal calibrado (cheery sobre mala semana) daña retención — el error donde la mayoría de los clones falla.

**Veredicto final.** **Later, F3.** Compartir el rollup de I, tono adaptativo + cifras auditables.

---

## Tabla resumen

| Feature | Base/Pro | Fase | Esfuerzo S/M/L |
|---|---|---|---|
| **C.** Medidas caseras en gramos | Base | F0/F1 | **S** |
| **G.** Vista de plato / proporción | Base | F1 | **S** |
| **E.** Nota/feedback bidireccional | Base | F1 | **M** |
| **A-base.** Micros sodio+fibra (semanal) | Base | F1 | **M** |
| **B.** Lista de compras del plan | Base | F1 | **L** |
| **A-pro.** Panel micros completo (DRI editable) | Pro | F2 | **L** |
| **J.** Imagen de referencia del coach | Pro | F2 | **M** |
| **I.** Board de nutrición roster | Pro/Teams | F2 | **L** |
| **D.** Swap self-serve macro-matched | Pro | F2/F3 | **L** |
| **F.** Recordatorios por comida | Later | F3 | **M** |
| **K.** Resumen semanal motivacional | Later | F3 | **S** (post-rollup) |
| **H.** Diff plan vs comido real | Later | F3 | **M** (redefinido a medidor) |

> Prerequisitos compartidos (no son features pero son work-items): **D0** motor único (P0), **D1** rollup semanal (M), **D2** normalización de unidades (M), **D3** modelo de alérgenos (M), **D4** tablas DRI/densidad (S), **D5** disciplina de migración (transversal).

---

## Orden de ataque sugerido

Atacar primero los **cimientos invisibles** y los **display-layers baratos** que hacen la base "amplia y creíble" sin riesgo: **D0 (motor único, P0 bloqueante) → C → G** (S, puro display, localización MINSAL, ship rápido para credibilidad del free). En paralelo arrancar **D2/D4** (normalización + tablas de referencia) porque desbloquean B/A/C. Luego el **loop de retención**: **E** (con coach-reply + reacción + notas privadas en el MISMO release — no negociable) y **A-base** (sodio+fibra, encuadre semanal sobre D1). Después el **build grande de adopción**: **B** (lista derivada viva, offline, WhatsApp). Recién entonces, con la señal por-alumno ya produciéndose y D1 listo, los **payoff/Pro features**: **A-pro, J, I** (roster sobre rollup precomputado, gate Teams). **D** entra tras **D3** (alérgenos) resuelto. Los **later** (**F, K, H**) van al final: F tras el fix del cron en vacío, K/H sobre el rollup ya maduro. Regla de secuenciación dura: **nunca construir I/K/H/A-pro antes que D0+D1**, ni **D** antes que **D3** — son las inversiones que de otro modo shipean shells vacíos o claims inseguros.

---

## Lo que los roles dicen que AÚN falta (deduplicado, priorizado)

**P0 — bloqueantes de seguridad/corrección (deben resolverse antes de los features que dependen):**
1. **Decisión lockeada de estructura de comida** (texto libre vs filas de alimentos opcionales). La mitad de los features (A/B/D/G-cantidades/H) dependen de esta bifurcación — debe ser decisión explícita del plan, no implícita por-feature.
2. **Consolidar `computeNutritionAdherence` como ÚNICO calculador** antes de A/H/I/K; `dashboard.service` calcula macros mal y corromperá todo lo que muestre un %.
3. **Modelo de alérgenos/restricciones estructurado** (server-side) como prerequisito DURO de D; sin él, "alergia-aware" es un claim de seguridad insostenible (responsabilidad civil).

**P1 — infra compartida sub-especificada:**
4. **Rollup semanal por alumno** (tabla + cron + historial) como work-item propio que sirve a I, K y los veredictos semanales de A — no enterrado en cada feature.
5. **Capa de normalización de unidades** (g/ml/taza/cucharada/unidad, con fallback de listar incompatibles) compartida por B, D, C.
6. **Tabla `nutrient_targets` por cliente** con provenance/source (DRI varía por edad/sexo; hardcodear default es erróneo).
7. **Paridad mobile (Expo/NativeWind)**: cada columna/RLS nueva validada contra `apps/mobile` (PostgREST directo); gate de typecheck + checklist de render NativeWind (no hay e2e mobile).

**P2 — gobierno, legal y operación:**
8. **Disciplina de `GRANT UPDATE(col)` co-ubicado** + migraciones aditivas/idempotentes/forward-only como DoD de cada migración nueva.
9. **Disclaimer de nutrición transversal y obligatorio** (espejo de `MovementDisclaimer.tsx`) en toda vista de plan/macros/micros del alumno y en TODO export/PDF/lista compartida.
10. **Preparación Ley 21.719** (vigente dic-2026): base de licitud por feature, derechos ARCO+, RLS coach/cliente-scoped, prohibición de decisión automatizada adversa; actualizar Política de Privacidad y Términos antes de E/I/J; DPA con Supabase/Resend/MercadoPago.
11. **Gate de entitlement server-side** para todo Nutrición Pro (D/I/J) contra `coaches.enabled_modules`/`coach_addons` — la RLS hoy permite auto-activar gratis; confirmar gate + clawback antes de cobrar. Que "Nutrición Pro" aparezca como línea nombrada en `billing_snapshots.addons[]` (evidencia SERNAC), bajo el único entitlement `nutrition_exchanges` (sin SKU silencioso paralelo).
12. **Degradación al downgrade**: definir qué pasa con contenido Pro (swaps macro-matched, fotos J) cuando el add-on pasa active→cancelled (read-only / oculto / orphan + storage). Lifecycle/purga de fotos J (cascade delete + offboarding, espejo `purge_audit`).

**P3 — UX, accesibilidad, soporte y go-to-market:**
13. **Estados vacíos + day-one para CADA feature** (lista sin plan, board sin flagged, comida sin foto, nota sin respuesta) + 4 estados (cargando/vacío/error/offline) por superficie. La auditoría ya marca "nutrición en 9 rincones" — cada feature nueva debe vivir en la casa de 3 zonas con UN componente por espacio (bottom-sheet mobile / slide-over desktop), no pantalla suelta.
14. **Accesibilidad como gate automatizable**: A/G/I conllevan estado por color — texto+ícono+forma + `aria-valuetext` "valor unidad, estado", contraste medido (4.5:1 texto / 3:1 no-texto). El ring de macros actual YA falla WCAG 1.4.1; no repetirlo. `useReducedMotion` en toda animación nueva.
15. **Átomos canónicos únicos** (`NutrientRangeBar`, `ProportionPlate`) en `components/atoms/` con redundancia de estado y tokens de color/macro auditados (la auditoría pide 4 paletas→1 canónica) — o cada consumidor reimplementa color-solo y hay drift.
16. **Seed determinista (`seed-e2e-personas.mjs`) extendido en el MISMO PR** por feature (alérgenos para D, micro-targets para A, foto para J, notas para E) — si no, e2e solo testea empty-states (deuda que ya derivó en el gate Movida).
17. **Extensión del offline-queue** (`nutrition-offline-queue`) para los nuevos write-paths (E notas, B check-off) con dedupe/replay last-write-wins.
18. **Matriz de feature-gating base vs Nutrición Pro vs Teams** demoable + copy de paywall/upsell + comparación de 3 líneas pegable a email/WhatsApp (Sales/PM: el mecanismo de revenue está sin especificar).
19. **Export branded / PDF white-label** reusando la plumbing de B + WhatsApp como canal primario de share explícito en cada superficie (lista, recap, plan) — top-3 pregunta de venta Latam.
20. **Onboarding/seed de contenido + import path** (planes sample, plato, alimentos chilenos comunes; paste/CSV ligero) — baja el costo de cambio ("tendría que rehacer todo") y acelera time-to-value en el demo.
21. **Instrumentación de adopción/soporte** (open-rate semanal de lista, latencia de reply de notas, uso del board) + explainer inline "¿por qué estoy flageado?" para que coach/alumno se autoatiendan en vez de abrir ticket.
22. **Manejo de menores** (si EVA admite alumnos menores): A/D/E/I requieren consentimiento del representante legal y tratamiento reforzado — confirmar o dejarlo explícito en términos.