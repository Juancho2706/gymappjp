# Plan de rework — Ficha del Alumno OPTIMIZADA (mejorado)

> **Doc 3 de 3 — Plan de rework (mejorado).** Fusiona el estudio de brecha
> (`01-gap-cd-vs-real.md`) con la auditoría de la ficha viva (`02-auditoria-ficha-live.md`),
> incorporando tres revisiones senior (UX/UI, Product Management, Arquitectura/Backend/Security).
>
> Fecha: 2026-06-30 · Branch base: `feat/redesign-eva-design-system`
> Perfil de usuario: **coach promedio (personal trainer), NO data-scientist.**
> Objetivo: máxima señal-coach por mínima carga cognitiva del coach **y** mínima fricción del alumno,
> **mobile-first**, **accesible**, y **conectado a la monetización** (qué es free y qué empuja un módulo Pro).

---

## 0. Diagnóstico de una línea

La ficha tiene **datos ricos y un buen motor** (≈90 % del diseño CD ya respaldado por tablas/RPC reales),
pero sufre **duplicación estructural** (cada métrica en 3-5 lugares, a veces con **fórmulas distintas** porque
el Hero y las tabs **recomputan en cliente** desde un `data: any`), **dos indicadores de atención que se
contradicen**, **controles muertos** (form de biometría, botón "Más opciones"), **deuda de explicabilidad**
grande fuera de Nutrición, y **carga cognitiva alta en móvil** (Nutrición = scroll infinito). Además, **el
alumno ya captura datos que el coach nunca ve** (RIR logueado, actuals de cardio, satisfacción de comida).

El rework **no** es construir features nuevas: es **(1) unificar los números en una fuente tipada única,
(2) quitar ruido con presupuesto de densidad, (3) cosechar lo ya capturado, (4) explicar con microcopy
accesible y (5) abrir pocos write-paths de alto ROI** — dejando la puerta abierta a wearables sin rediseñar y
**sin regalar gratis lo que debería cobrarse**. Se vende como **"la ficha se lee en 10 segundos"**, no como
"12 features nuevas".

---

## 1. Principios de rework

1. **Coach-value primero.** Cada elemento responde "¿esto cambia una decisión del coach?" (subir carga,
   ajustar kcal, llamar al alumno, deload). Si no, baja de jerarquía o se colapsa.
2. **Una métrica, una definición, un hogar — y una FUENTE TIPADA.** No basta de-duplicar por ubicación: la
   raíz de "los números no cuadran" es que Hero/tabs recomputan en cliente. Se introduce un **view-model
   tipado server-side** (§3) que emite cada métrica ya resuelta con su ventana etiquetada; las tabs solo
   renderizan. Peso vive en Progreso; fuerza/volumen en Entreno; macros/adherencia en Nutrición.
3. **Explicabilidad accesible, no tooltip-como-muleta.** El coach promedio no es data-scientist **y muchos
   están en el teléfono, donde no hay hover**. Para las 5-7 métricas núcleo del fold (e1RM, RIR, adherencia,
   ritmo/proyección, SYNCED/CUSTOM) → **micro-leyenda inline permanente** (≤6 palabras, patrón de Nutrición).
   El ícono `?` se reserva para lo forense y se implementa con **UN solo componente `<MetricInfo/>`** + un
   **glosario único** (§6), no 20 strings sueltos. Todo `?` debe abrir con **tap** (touch), no solo hover.
4. **Progressive disclosure con presupuesto de densidad.** Lo accionable arriba; lo forense detrás de
   acordeones. Además una **regla de densidad dura** para que la cosecha no vuelva a inflar la ficha (§4):
   p. ej. "Entreno muestra ≤4 números above-the-fold; RIR ejecutado / actuals cardio viven **dentro** del
   detalle de sesión, no como cards nuevas". La ficha se lee en 10 s y se profundiza a demanda.
5. **Mobile-first, no colapso trivial.** El diseño se piensa primero en 360 px: **orden de colapso** de la
   Resumen 2-col en 1-col = *estado → próximo entreno → último check-in → resto*; tabs con **scroll
   horizontal + ícono** (no wrap); Nutrición cabe en **≤3 scrolls** con sub-anclas. Ver §5.0.
6. **Léxico de color + accesibilidad.** El mismo rojo no puede significar "urgente", "superávit" y "bajó de
   peso". Se fija un léxico (§4): **estado = solo el badge**; métricas = neutro + flecha ↑/↓ **con texto**,
   nunca color solo. Daltonismo ≈ 1 de cada 12 coaches hombres → todo color semántico lleva ícono/etiqueta
   redundante.
7. **Menos ruido, no menos dato.** No se borra información: se de-duplica y reubica. Con P0+P1 se recorta
   ~40 % del contenido repetido **sin perder** una sola señal.
8. **Fricción del alumno es sagrada — y se mide.** Todo input nuevo entra como opcional / default-fill /
   1-tap; **primero cosechar lo ya capturado** (RIR, cardio, satisfacción), después **un solo** input nuevo
   (mood de sesión), **medir su tasa de completado 3-4 semanas y no agregar el input #2 hasta superar ~60 %**.
9. **Degrada con gracia y guía en frío.** Ausencia de dato = **empty-state con 1 acción**, nunca texto muerto
   ni cero engañoso. La ficha del alumno nuevo (semana 1, casi todo vacío) está **diseñada** (§7).
10. **Explicabilidad = conversión.** Lo que la cosecha revela y **pertenece a un módulo de pago** (actuals de
    cardio, composición, TDEE/balance) se muestra **detrás del gate del módulo con teaser**, server-side vía
    `hasModule()`, no gratis. Cosechar dato ajeno y regalarlo mata la venta (§9).
11. **Solo-aditivo en DB, y sin repetir el patrón que ya tumbó prod.** Columnas nullable, tablas nuevas,
    forward-only/idempotente; **RLS team-scoped SIEMPRE con `client_id IN (SELECT current_user_pool_client_ids())`**
    (NUNCA `is_team_member()` por fila), `auth.uid()` siempre envuelto en `(SELECT auth.uid())`, y `GRANT`
    explícito para columnas user-scoped sobre `coaches`/`teams`/`clients`. `get_advisors` (0 críticos) tras
    CADA migración (§11).

---

## 2. Primitivos del Design System a definir ANTES de Fase 0

La crítica UX es correcta: badge de estado, source-badge, `<MetricInfo/>` y empty-state guiado son **primitivos
del DS**, no features de la ficha. Sin esto acabamos con 5 variantes de tooltip y 3 de badge. Se definen como
`atoms`/`molecules` compartidos **antes** de tocar la ficha, tomando el microcopy de Nutrición como canónico:

| Primitivo | Tipo | Qué es | Reutiliza |
|---|---|---|---|
| `<StatusBadge estado motivos />` | molecule | Badge nombrado (Al día / Atención / Urgente) que en tap/hover lista **los 2-3 motivos** que lo disparan (no un score). | patrón de badge del DS |
| `<MetricInfo termino />` | atom | Ícono `?` + popover accesible (tap en touch) que lee del **glosario único** (§6). Un solo componente para toda la app. | popover base-ui |
| `<MetricValue valor ventana tendencia />` | molecule | Número + micro-leyenda inline de ventana ("30 d") + flecha ↑/↓ **con texto**, color solo decorativo. | tokens de color DS |
| `<SourceBadge fuente />` | atom | "Manual / Apple / Garmin…" para dato que puede venir de wearable (forward-compat, hoy casi siempre "Manual"). | tokens |
| `<EmptyStateGuided titulo accion />` | molecule | Estado vacío con **exactamente 1 CTA** (WhatsApp / Editar biometría / …). Prohíbe el texto muerto. | button DS |

---

## 3. Fuente única de números — view-model tipado (el mayor ROI estructural)

**Problema raíz (Doc 2 §0, §7):** todo el árbol recibe **un solo `data: any`** desde `getClientProfileData`
(~650 líneas, ~15 queries + 5 RPC) y el Hero + varias tabs **recomputan** pesos, deltas y 1RM en cliente, a
veces con **fórmulas distintas**. De-duplicar "por ubicación" no cierra esto: si Progreso y Nutrición vuelven a
calcular su delta, reaparece la contradicción.

**Solución:** una función server tipada — `buildClientFichaViewModel()` en `services/client/` — que emite cada
métrica **ya resuelta, con su ventana temporal etiquetada**, y un **tipo `ClientFichaViewModel`** que reemplaza
al `data: any`. Las tabs pasan a ser **puro render**.

```ts
// services/client/client-ficha.viewmodel.ts (conceptual)
type Metric = { value: number | null; window: 'week' | '30d' | 'total'; label: string;
                trend?: { dir: 'up' | 'down' | 'flat'; text: string }; source?: 'manual' | 'apple' | 'garmin' };
type ClientFichaViewModel = {
  status: { level: 'ok' | 'attention' | 'urgent'; reasons: string[] };   // §5.0 — motivos, NO score
  weight: { current: Metric; deltaWeek: Metric; delta30d: Metric; totalChange: Metric };
  adherence: { training: Metric; nutrition: Metric; checkin: Metric };
  strength: { /* e1RM Epley canónico, una sola fórmula */ };
  // …cada número que hoy se recomputa, aquí resuelto UNA vez
};
```

- Se construye **plegado al SELECT existente** de `getClientProfileData` (no nuevas queries; §11 P2-7).
- **e1RM: una sola fórmula (Epley)** — mata la 2ª fórmula name-match del Panel Unificado.
- No hay que reescribir todo de una: se **migra incrementalmente**, empezando por los números que HOY se
  contradicen (deltas de peso, adherencia, 1RM). Es lo que hace real el principio "una métrica, una definición".

---

## 4. Presupuesto de densidad, léxico de color y accesibilidad

**Presupuesto de densidad (evita que la cosecha suba la carga NETA):**
- **Resumen:** ≤ 3 rings + 1 tarjeta de programa + 1 snapshot de check-in above-the-fold. Nada más compite.
- **Entreno:** ≤ 4 números above-the-fold (e1RM destacado, adherencia a la carga, tonelaje 7d, balance
  muscular). **RIR ejecutado, actuals de cardio, RPE por serie y prescrito-vs-hecho viven DENTRO del detalle de
  sesión**, no como cards nuevas.
- **Nutrición:** objetivo **≤ 3 scrolls de móvil** con sub-anclas (§5.5). Satisfacción y porciones parciales se
  muestran **agregadas** (§5.5), no per-item en la lista.
- **Progreso:** solo composición corporal. Todo chart de fuerza/volumen/macros sale a su hogar.
- Regla: **un elemento nuevo entra solo si otro baja de jerarquía o se colapsa.**

**Léxico de color (único para toda la ficha):**
- **Estado del alumno** → color exclusivo del `<StatusBadge/>` (verde/ámbar/rojo). Ningún otro elemento usa esa
  terna para "salud del alumno".
- **Métricas** (peso, balance, deltas) → **neutro + flecha ↑/↓ con texto** ("↓ 1,2 kg"). El color es
  decorativo, **nunca** el único portador de significado.
- Todo color semántico lleva **ícono o etiqueta redundante** (a11y daltonismo). Sin excepción.
- Se elimina la colisión actual: rojo = "urgente" **y** "superávit" **y** "bajó de peso" en tres sitios.

**Accesibilidad mínima (hoy ausente):** foco visible en tabs/acordeones, `aria-label` en rings y sparklines,
popovers de `<MetricInfo/>` operables por teclado y **por tap** (no hover-only), contraste AA en badges.

---

## 5. Ficha reorganizada — tab por tab

Se conservan las **5 pestañas** (Resumen · Progreso · Entreno · Programa · Nutrición). `BillingTabB8` **se
archiva** (no se cablea como 6ª tab — ver §14 D-CEO-1): 5-6 tabs ya envuelven en 360 px.

### 5.0 Layout global + comportamiento móvil (mobile-first)

- **Tabs (`ProfileTabNav`):** en móvil, **scroll horizontal + ícono por tab** (no wrap a 2-3 filas). Sticky con
  hint de swipe (ya existe). Desktop: fila normal.
- **Hero vs barra flotante — matar el solape NUEVO:** el Hero hoy y `ProfileFloatingActions` ambos montan
  WhatsApp/check-in/builder. El Hero deja **1 acción primaria (WhatsApp)** + overflow `⋯` (Exportar / editar
  biometría); las **3 acciones de trabajo** viven **solo en la barra flotante** en móvil. No se duplican.
- **Orden de colapso 2-col → 1-col (Resumen):** *estado → próximo entreno → último check-in → resto*. NO el
  orden de lectura desktop.
- **Skeleton por columna + streaming (§8):** el objeto es pesado (~15 queries + 5 RPC); la Resumen/estado
  renderiza primero, los charts después.

### 5.1 HERO — identidad + 1 estado + 1 acción

**Quita:** el **segundo** badge de atención (score crudo 0-100) y el botón muerto "Más opciones".
**Fusiona:** bucket + score en **un solo** `<StatusBadge/>` nombrado — **Al día / Atención / Urgente**
(escala homogénea; ver §14 D-CEO-2 para la palabra final). En tap **lista los 2-3 motivos** que lo disparan
("3 días sin check-in · adherencia 45 % · ciclo termina en 2 días"), **no** un "72/100" opaco. Elimina el caso
"Al día + Score 30 · Revisar" que hoy se contradice.
**Reubica:** las 4 chips (peso, adherencia, workouts, comidas) dejan de vivir a la vez en Hero **y** Resumen;
quedan solo en el Resumen. Hero = nombre + eyebrow programa·semana + **1 badge** + racha (renombrada
**"Racha de actividad"**) + **WhatsApp** + overflow `⋯`.
**Por qué:** hoy ~70 % de solape Hero↔Resumen; el coach ve el peso 4 veces antes de llegar a Progreso.

### 5.2 RESUMEN — la bandeja de decisión (2 columnas en desktop)

**Estructura:** quitar `max-w-3xl` centrado → **2 columnas `md:col-span-12`** (coherente con el resto).
- **Col izquierda (señal):** 3 rings de cumplimiento (Entreno / Nutrición / Check-in) con **micro-leyenda
  inline** ("Check-in: 100 % si registró hoy, baja a 0 % a los 7 días") + tarjeta de Programa (fases, Semana
  X/Y, días restantes, **próximo entreno**, señal nutrición).
- **Col derecha (revisión):** snapshot último check-in + **"Marcar revisado"** (ya funciona) + evolución
  visual (fotos) + módulos gateados (Cardio/Movimiento/Composición) + CTA "Editar plan".
**Quita:** los 5 KPIs sueltos que repiten los rings; "Δ Peso 30d" migra a Progreso. Deja **una tarjeta de peso
canónica** (del view-model §3) con las 3 ventanas etiquetadas (semana / 30d / total) en lugar de 5 números con
4 definiciones de delta.
**Cablea (write-path #1, mayor ROI):** el dialog **"Editar biometría inicial"** — hoy FORM MUERTO — pasa a
persistir `client_intake.height_cm` / peso inicial **+ sexo** (ver §9-A1, §11-D1). Desbloquea IMC y TDEE.
**En frío:** si no hay check-ins/altura, cada zona muestra `<EmptyStateGuided/>` con 1 CTA (§7).

### 5.3 PROGRESO — composición corporal PURA

**Elimina el "Panel de Progreso Unificado" de 7 pills** (mayor foco de ruido): duplica 5 de sus 7 charts y usa
una **2ª fórmula** de 1RM. Cada chart vuelve a su hogar (Fuerza/Volumen → Entreno; Macros/Adherencia →
Nutrición; Balance Neto → Nutrición cuando exista TDEE).
**Progreso queda:** Peso·tendencia (curva + objetivo) · statboxes (Inicial / Cambio total / **Ritmo 30d** /
**Proyección 4 sem**) · IMC + escala · Energía media 7d · Comparativa de fotos · Timeline de check-ins
(**con estado "revisado/no-revisado"** → cola de check-ins por responder; **paginado/virtualizado**, no render
de N cards).
**Explicabilidad + no sobre-prometer (§14 D-CEO-3):**
- *Ritmo 30d:* micro-leyenda "cambio de peso por mes (tendencia)".
- *Proyección 4 sem:* mostrar **rango** ("−0,8 a −1,6 kg"), badge **"estimado" VISIBLE** (no en tooltip), y
  **ocultar si < 3 check-ins**. Nunca un número único que el coach lea como promesa.
- *IMC:* categoría + `<EmptyStateGuided/>` "Falta la altura para calcular IMC. [Editar biometría]" si no hay
  intake (hoy muere en silencio).

### 5.4 ENTRENO — intensidad y fuerza, explicado y con actuals (dentro del detalle)

**Above-the-fold (≤4 números):** e1RM destacado · adherencia a la carga · tonelaje 7d · balance muscular.
**Dentro del detalle de sesión (cosecha, NO cards nuevas):**
- **RIR logueado** por serie (hoy solo se muestra el RIR *prescrito*; el *ejecutado* se bota).
- **Actuals de cardio** (FC media / distancia / minutos / ritmo) desde `workout_logs.actual_*` — **detrás del
  gate del módulo Cardio con teaser** cuando está OFF (§9, §10). No se regala.
- **RPE medio de la sesión** (agregado del RPE por serie) + flag "sesión dura/fácil".
- **Prescrito vs ejecutado** (`target_weight_kg` vs `weight_kg`) — "adherencia a la carga".
**Explicabilidad (micro-leyenda inline para el fold; `<MetricInfo/>` para lo forense):** e1RM ("máx. teórico
para 1 rep, Epley"), RIR ("reps que le sobran"), Tonelaje ("peso × reps = trabajo"; reemplazar **"u."** por
**"kg·rep"**), media móvil 7 ("tendencia sin ruido"), **"PC" → "Peso corporal"**, desequilibrio radar
("N× más trabajo que el grupo más flojo").

### 5.5 PROGRAMA — prescripción, con progresión visible

**Agrega (dato ya en DB, display-only, PR #98):** fila **"Progresión: lineal / doble +X kg/sem"** por bloque
(`workout_blocks.progression_mode/type/value`) — hoy el sheet NUNCA lo muestra. **Alto valor, esfuerzo
trivial.** También usar `video_url` además de `gif_url`.
**Explicabilidad:** **RIR** y **Tempo** en el sheet salen crudos → `<MetricInfo/>` ("RIR 2 = pudo hacer 2 más";
"Tempo 3010 = 3s bajando · 0 abajo · 1s subiendo · 0 arriba").

### 5.6 NUTRICIÓN — superficiar lo escondido + acortar a ≤3 scrolls

**Sub-navegación interna (clave para móvil):** anclas o sub-tabs **Hoy · Plan · Coach · Hábitos** + **estado de
acordeón recordado por coach**. Objetivo de densidad: **Nutrición cabe en ≤3 scrolls de móvil above-the-fold**;
Zona C (~8 cards) pasa a acordeones bajo "Coach".
**Agrega (cosecha, solo render, AGREGADO no per-item):**
- **Satisfacción** (😕/😐/😋) — hoy `NutritionTabB5` no la renderiza. Mostrar **agregada con etiqueta**:
  "satisfacción media 😐 · siempre baja en la cena", no un emoji suelto por comida (ambiguo y no accesible).
- **Porciones parciales** (`consumed_quantity` / `portionPctMapFromMealLogs`): como **barra/%** con leyenda
  ("comió ~50 %"), no un tercer ícono junto a ✔/reloj.
- **Swaps recurrentes agregados** ("cambia siempre pollo→atún") y **nota de hábitos** (textarea `notes` ya en
  DB/ficha, falta la UI) — como relleno si sobran horas, no línea propia.
**Explicabilidad:** SYNCED/CUSTOM ("SYNCED = sigue tu plantilla; CUSTOM = editado solo para este alumno"),
headline "Adherencia 30 días" (aclarar "promedio de días CON registro"), umbrales de micros (qué rango es
bueno).

### 5.7 Deleite (calor, no solo sustracción)

El rework hasta aquí solo **quita**. Dos momentos de deleite definidos:
- **"Marcar revisado"** con micro-transición satisfactoria + el timeline mostrando la **cola vaciarse**
  (loop de trabajo gratificante — el sleeper de retención del coach).
- **PR banner:** el confeti es celebración legítima **del alumno**, pero en la vista del *coach* (que abre 20
  fichas/día) es ruido → **degradar a un badge "PR esta semana" sin animación**.

---

## 6. Explicabilidad accesible — microcopy inline + `<MetricInfo/>` + glosario único

Regla: **micro-leyenda inline permanente** para las 5-7 métricas del fold; `<MetricInfo/>` (`?`) solo para lo
forense. **Un** componente + **un** glosario (no 20 strings). El `?` abre por **tap** en touch.

**Términos del fold (micro-leyenda inline, ≤6 palabras):** e1RM · RIR · adherencia (entreno/nutrición/check-in,
separadas) · ritmo/proyección · SYNCED/CUSTOM.

**Glosario forense (`<MetricInfo/>`), copy canónico:**

| Término | Dónde | Copy |
|---|---|---|
| **Estado del alumno** | Hero | (badge muestra motivos, no texto) "Prioridad por días sin check-in, sin entrenar, adherencia y fin de ciclo." |
| **e1RM (Epley)** | Entreno, Progreso | "1RM = peso máx. teórico para 1 rep. Epley: peso × (1 + reps/30). Sube = más fuerte." |
| **RIR** | Sheet, Entreno | "Reps in Reserve: reps que le sobran al terminar. RIR 2 = pudo hacer 2 más." |
| **Tempo** | Sheet | "4 tiempos: bajada-pausa-subida-pausa (seg). '3010' = 3s baja · 0 abajo · 1s sube · 0 arriba." |
| **Tonelaje / kg·rep** | Entreno | "Volumen = suma de peso × reps. Reemplaza la unidad 'u.'." |
| **Media móvil 7** | Tonelaje | "Promedio de las últimas 7 sesiones, tendencia sin ruido." |
| **Ritmo 30d** | Progreso | "Cambio de peso por mes, como tendencia (línea que mejor ajusta)." |
| **Proyección 4 sem** | Progreso | "Rango estimado si mantiene el ritmo. Es extrapolación, no promesa." (badge "estimado" visible) |
| **Balance / déficit** | Nutrición (Pro) | "Diferencia comido vs gasto estimado. Indicador cualitativo: déficit leve/moderado." |
| **SYNCED / CUSTOM** | Nutrición | "SYNCED = sigue tu plantilla. CUSTOM = editado solo para este alumno." |
| **Racha (Hero) vs ≥80 % (Nutri)** | Hero, Nutri | Renombrar: Hero = "Racha de actividad"; Nutrición = "Racha de adherencia (≥80 %)". |

---

## 7. Empty-states guiados — la ficha "en frío"

En la semana 1 la ficha es **casi toda empty-states** (sin check-ins, sin workouts, sin IMC). Cada vacío usa
`<EmptyStateGuided/>` con **exactamente 1 acción**, nunca texto muerto. Además **vende A1** (el write-path):

| Zona vacía | Copy + CTA |
|---|---|
| Sin check-ins | "Aún sin check-ins. **[Enviar recordatorio por WhatsApp]**" |
| Sin altura (IMC/TDEE) | "Falta la altura para calcular IMC y TDEE. **[Editar biometría]**" |
| Sin workouts | "Aún sin sesiones registradas. **[Abrir builder]**" |
| Sin plan de nutrición | "Este alumno no tiene plan. **[Asignar plan]**" |
| Proyección < 3 check-ins | (oculta; no muestra número engañoso) |

---

## 8. Estado de carga del nuevo layout

El objeto pesado (~15 queries + 5 RPC) con 2 columnas nuevas necesita **skeleton por columna** y **streaming**:
la Resumen/estado (col izquierda) renderiza primero; los charts (Progreso, Entreno) y el view-model completo
llegan después vía Suspense. Sin esto, el rework se **ve** más lento aunque no lo sea. Se apoya en el
`React.cache` existente + boundaries de Suspense por tab.

---

## 9. Qué AGREGAR — gaps, gating de módulo y ROI

Cada item lleva **si es free o gancho de módulo pago** (crítica PM): cosechar dato ajeno y regalarlo mata la
venta. El gate es **server-side** vía `hasModule()` (patrón ya vivo en `page.tsx` → `moduleFlags` /
`nutritionProEnabled`), no solo ocultar en cliente.

| # | Qué | Fuente/gap | Esfuerzo | Valor coach | Gating |
|---|---|---|---|---|---|
| A1 | **Write-path "Editar biometría"** (altura + peso inicial + **sexo**) → `client_intake` | form muerto hoy | **Bajo** | **Muy alto** — desbloquea IMC/TDEE | Free (core) |
| A2 | **Progresión en el sheet** (badge lineal/doble +X kg/sem) + `video_url` | `progression_*` en DB | **Trivial** | **Alto** | Free (core) |
| A3 | **RIR logueado** en Entreno | `workout_logs.rir` | **Bajo** | **Alto** | Free (core) |
| A3b | **Actuals de cardio** (FC/dist/min/ritmo) | `workout_logs.actual_*` | **Bajo** | **Alto** | **Módulo Cardio** + teaser si OFF |
| A4 | **Satisfacción (agregada) + porciones parciales** en Nutrición | `satisfaction_score`/`consumed_quantity` | **Bajo** | Medio-alto | Free (core) |
| A5 | **RPE medio sesión + prescrito-vs-hecho** | agregación existente | **Bajo** | **Alto** | Free (core) |
| A6 | **Timeline check-ins con "revisado"** (cola de trabajo) | `check_ins.reviewed_at` | **Bajo** | **Alto** (retención coach) | Free (core) |
| A7 | **Mood de sesión 1-tap** (+ dolor flag opcional) | tabla nueva `workout_session_feedback` | Medio | **Alto** (readiness) | Free (core) |
| A8 | **Composición corporal en Progreso** (grasa%/músculo) | `body_composition_measurements` | Medio | Alto | **Módulo Body-comp** + teaser |
| A9 | **Balance energético / TDEE** (Nutrición) | TDEE estimado (Mifflin) | Medio | **Alto** | **Nutrición Pro** (gancho de upgrade) |
| — | Inputs nutri extra (foto, gramaje, hambre/saciedad, alcohol…) | ver §10 | — | Bajo-medio | Diferido tras medir A7 |
| — | **Wearables** (recovery/sueño/HRV) | 3 tablas | Alto | Alto | **CORTADO de este scope** (§12) |

**Sobre A9 (balance / TDEE) — encuadrado como Nutrición Pro, no free.** Hoy solo guardamos **kcal consumidas**;
no hay modelo de gasto. Se ofrece **solo el nivel estimado**:
- **Estimado:** TDEE por **Mifflin-St Jeor** (`peso`, `altura`, `edad` desde `clients.birth_date`, **`sexo`**
  desde el nuevo `client_intake.sex`, factor de actividad). Se muestra como **indicador cualitativo**
  ("déficit leve/moderado") con badge **"estimado" visible** — **no** un "−480 kcal/día" exacto que sobre-
  promete precisión (§14 D-CEO-3). *Bloqueador:* no existe columna de sexo → A1 agrega `client_intake.sex`.
- **Medido (wearable):** diseñado pero **diferido** (§12). El mismo componente servirá cuando exista
  `total_energy_kcal`; sin datos, cae al estimado; nunca card en blanco.

---

## 10. Qué pedirle DE MÁS al ALUMNO — fricción controlada, medida

> La ficha del coach solo es tan rica como lo que el alumno llena. **Cada campo extra = menos adherencia = ficha
> más vacía.** Regla dura PM: **cosechar lo ya capturado primero; luego UN solo input nuevo; medir; recién
> entonces el segundo.**

### 10.1 Cosecha (CERO fricción — el alumno YA lo ingresa)
1. **RIR logueado + actuals cardio** (A3/A3b) — solo faltan en la ficha. Ganancia gratis.
2. **Satisfacción + porción real ya logueada** (A4) — render inmediato.

### 10.2 El ÚNICO input nuevo de esta ronda
3. **Mood de sesión, 1-tap, al terminar** ("¿cómo te sentiste?" 1-5 emojis) en `WorkoutSummaryOverlay` (A7).
   Hoy el overlay es solo celebración — no hay NINGÚN feedback de sesión. Es la señal de readiness de mayor ROI.
   **Opcional, saltable.** Se **mide su tasa de completado 3-4 semanas.**

### 10.3 STOP — no agregar hasta medir
El input #2 (dolor/molestia, hambre/saciedad, foto de comida, gramaje real, alcohol, adherencia percibida,
auto-declarar alergias, textarea) **no entra hasta que A7 supere ~60 % de uso**. Cada uno es "lindo pero
inútil" para el coach promedio si no cambia una decisión suya. Cuando toque, en orden de valor/fricción:
foto de comida → gramaje real off-plan → auto-declarar alergia (alumno propone, **coach confirma**) → hábitos
textarea → hambre/saciedad → alcohol. **Todos opcionales.**

### 10.4 Lo que NO se toca (contamina el motor)
- **RPE por serie NO se auto-rellena con default 8.** El default contamina el motor `adaptive` con dato falso
  (parece señal, es relleno). O queda **opt-in real**, o no se toca esta ronda.
- Nada obligatorio; ningún formulario nuevo; sin cuestionario diario de readiness (fatiga de encuesta mata
  adherencia).

### 10.5 Paridad mobile (gap transversal, sin nuevos inputs)
Portar a `apps/mobile` lo que ya existe en web: `OffPlanLogger`, **swaps** y el hilo de **comentarios** de
nutrición.

---

## 11. Cambios de DB — SOLO ADITIVOS (con los fixes de seguridad/correctitud)

Reglas duras: columnas **nullable** / tablas **nuevas**; cero DROP/rename/NOT-NULL-sin-default; forward-only e
idempotente. **RLS team-scoped SIEMPRE con `client_id IN (SELECT public.current_user_pool_client_ids())`**
(NUNCA `is_team_member()` con EXISTS por fila — ese es el patrón del **incidente de prod
`20260609150000`**: statement timeouts → DB Unhealthy → alumnos no logean). **Todo `auth.uid()` envuelto en
`(SELECT auth.uid())`** (evita re-evaluación initplan por fila; el audit DB ya bajó 118→0). **`get_advisors`
(security + performance, 0 críticos) tras CADA migración** (CLAUDE.md). Tras aplicar: regenerar
`src/lib/database.types.ts`.

### D1 · `client_intake.sex` (desbloquea A1 + TDEE) — **con UPSERT, no INSERT crudo**

```sql
ALTER TABLE public.client_intake ADD COLUMN IF NOT EXISTS sex text NULL;  -- 'male'|'female'|null
```

**Correctitud crítica (arch P1-3):** `client_intake` tiene `weight_kg, height_cm, goals, experience_level,
availability` **NOT NULL sin default**. El caso que A1 dice desbloquear ("alumno **sin** intake") es un
**INSERT**, y un INSERT con solo `height_cm + peso + sex` **viola 5 constraints**. La server action DEBE hacer
**`UPSERT ON CONFLICT (client_id)`** (existe `client_intake_client_id_key`): si la fila existe → UPDATE de
`height_cm/weight_kg/sex`; si no existe → INSERT supliendo **placeholders seguros** para los `text` NOT NULL
(`goals=''`, `experience_level=''`, `availability=''`).
**Grants/RLS: NO requiere migración de permisos.** Ya existe `GRANT ALL ON client_intake TO authenticated` +
policy **`client_intake_coach` FOR ALL** (USING + WITH CHECK: el coach es dueño del `client`). → la server
action del coach corre **como `authenticated`** (no hace falta service-role). `client_intake` **no** está en la
allowlist column-level de `clients`, así que no hay `42501`.

### D2 · Feedback de sesión (A7) — tabla nueva, con RLS del patrón correcto

```sql
CREATE TABLE IF NOT EXISTS public.workout_session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  plan_id uuid NULL,
  mood_1_5 smallint NULL,
  perceived_effort smallint NULL,     -- RPE de sesión (opcional, NO default-fill)
  soreness_flag boolean NULL,
  soreness_zone text NULL,
  note text NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, session_date)     -- lidera con client_id (sirve a lecturas de la ficha)
);
ALTER TABLE public.workout_session_feedback ENABLE ROW LEVEL SECURITY;

-- alumno: dueño de sus filas (WITH CHECK ata el INSERT/UPDATE a sí mismo)
DROP POLICY IF EXISTS wsf_client_all ON public.workout_session_feedback;
CREATE POLICY wsf_client_all ON public.workout_session_feedback FOR ALL
  USING ((SELECT auth.uid()) = client_id) WITH CHECK ((SELECT auth.uid()) = client_id);

-- coach dueño del cliente (patrón coach canónico; NO es el patrón del incidente)
DROP POLICY IF EXISTS wsf_coach_read ON public.workout_session_feedback;
CREATE POLICY wsf_coach_read ON public.workout_session_feedback FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients c
                 WHERE c.id = client_id AND c.coach_id = (SELECT auth.uid())));

-- TEAM: set precomputado cacheado (InitPlan), NUNCA is_team_member() por fila
DROP POLICY IF EXISTS wsf_team_read ON public.workout_session_feedback;
CREATE POLICY wsf_team_read ON public.workout_session_feedback FOR SELECT
  USING (client_id IN (SELECT public.current_user_pool_client_ids()));

GRANT SELECT, INSERT, UPDATE ON public.workout_session_feedback TO authenticated;
```

### D3 · Nutrición — columnas nullable (diferido tras medir A7)

```sql
ALTER TABLE public.nutrition_meal_logs ADD COLUMN IF NOT EXISTS photo_url text NULL;
ALTER TABLE public.nutrition_meal_logs ADD COLUMN IF NOT EXISTS hunger_before smallint NULL;   -- 1-3
ALTER TABLE public.nutrition_meal_logs ADD COLUMN IF NOT EXISTS satiety_after smallint NULL;   -- 1-3
ALTER TABLE public.daily_habits       ADD COLUMN IF NOT EXISTS alcohol_units smallint NULL;
ALTER TABLE public.daily_habits       ADD COLUMN IF NOT EXISTS perceived_adherence smallint NULL; -- 1-5
```
`nutrition_meal_logs`/`daily_habits` usan **grant de tabla** (`GRANT ALL TO authenticated`) → sin `42501`.
**`photo_url` NO basta con la columna (arch P2-6):** el bucket `checkins` es **privado**. Foto de comida exige
**policies de Storage RLS** (alumno escribe su propio path `meal-photos/{client_id}/…`; coach lee las de sus
clientes) en la MISMA migración. Reusa el pipeline WebP existente.

### D4 · Auto-declaración de restricciones (diferido) — **con el modelo de confianza enforced**

```sql
ALTER TABLE public.client_food_preferences ADD COLUMN IF NOT EXISTS proposed_by text NULL;             -- 'client'|'coach'
ALTER TABLE public.client_food_preferences ADD COLUMN IF NOT EXISTS status text NULL DEFAULT 'confirmed'; -- 'proposed'|'confirmed'
```
**Seguridad (arch P2-5):** la policy `client own prefs` es **FOR ALL sin restricción** → tal cual, el alumno
podría insertar `status='confirmed'` / `proposed_by='coach'` y **auto-confirmar** una restricción (que gatilla
exclusión dura de alérgenos en PlanBuilder). Fix: **WITH CHECK** en la política del cliente que, **para
`preference_type ∈ {allergy,intolerance,dislike}`**, obligue `status='proposed'` **y** `proposed_by='client'`
(los `favorite` siguen client-set normales). El coach confirma vía su propia policy. Sin esto, el gate de
seguridad de alérgenos es burlable por el alumno.

### D5 · Wearables — **CORTADO de este scope** (ver §12)

No se migra nada ahora. Cuando se retome (rama propia, post-redesign), el diseño ya está corregido:
- **Tokens OAuth en tabla service-role-only** (SIN `GRANT` a `authenticated`) o `GRANT SELECT (columnas
  no-token)` a nivel columna. **El coach jamás ve tokens de Garmin/Fitbit/Whoop del alumno; el alumno tampoco
  necesita leerlos** (arch P0-2: hoy el borrador los expone vía `coach_read` → robo de sesión del wearable).
- **RLS team con `current_user_pool_client_ids()`**, `auth.uid()` envuelto, `WITH CHECK` que acote la escritura
  on-device del alumno a fuentes on-device (`manual/apple/health_connect`) para que **no pueda `UPDATE` filas
  cloud** escritas por service-role (Garmin) y corromper el TDEE.
- **UNIQUE liderando con `client_id`** (`client_id, metric_date, source`) para que las lecturas time-range de la
  ficha usen el índice.

---

## 12. Wearables / RN — no cerrar la puerta, pero NO construir ahora

Decisión de producto (crítica PM, YAGNI): una startup con ~1 coach pagando **no construye infra de wearables
(3 tablas + OAuth)** en la rama del redesign. Se **corta de este alcance** — **incluso el schema**. Solo se deja
la puerta abierta, barato:
- La UI de Progreso/Entreno **lee `workout_logs.actual_*` y `daily_habits` con una capa de fuente** (`<SourceBadge/>`,
  hoy casi siempre "Manual"). Si algún día existe `wearable_daily_metrics`, se prefiere ese valor **sin
  sobrescribir** el manual (preserva provenance).
- Provenance a copiar (cuando se construya): `source` + `raw jsonb`, como `body_composition_measurements`.
- La card de balance (A9) se diseña desde ya para **dos fuentes** (medido / estimado); hoy solo cablea el
  estimado. El mismo componente sirve a ambos mundos.
- **Un párrafo, cero migraciones.** El resto va a backlog de su propia feature/rama.

---

## 13. Fases priorizadas — quick wins primero, con gate de medición

**Disciplina de rama (crítica PM):** esta ficha vive en `feat/redesign-eva-design-system`, cuyo objetivo es
aterrizar el redesign 1:1. **Fase 0 y 1** (puro front + **1 migración chica D1**) pueden ir aquí. **D2 en
adelante (tablas/write-paths nuevos) esperan a su propia feature en rama propia post-redesign** — no inflar el
diff del redesign.

**Fase 0 — Quick wins: cosecha + write-path + fundaciones DS.** *Mayor ROI, riesgo mínimo.*
- **Primitivos DS** (§2): `StatusBadge`, `MetricInfo`, `MetricValue`, `EmptyStateGuided`, `SourceBadge`.
- **A1** write-path Editar biometría (`client_intake` + `sex`, **UPSERT**, server action authenticated-coach).
- **A2** progresión en el sheet + `video_url`.
- **A3** RIR logueado (Entreno); **A3b** actuals cardio **detrás del gate Cardio**.
- **A4** satisfacción agregada + porciones parciales (Nutrición).
- **A6** timeline de check-ins con "revisado" = **cola de trabajo** (subido desde Fase 2: barato y es workflow).
- Batch de **explicabilidad** capado a los **6-7 términos del fold** (`MetricInfo` + glosario único).
- Borrar controles muertos ("Más opciones", form biometría viejo).

**Fase 1 — Dedup estructural + view-model tipado + layout.** *Alto impacto, bajo riesgo.*
- **`buildClientFichaViewModel()` tipado** (§3) para los números que hoy se contradicen (peso/adherencia/1RM).
- **Eliminar el "Panel de Progreso Unificado"** de 7 pills (mata 5 duplicados + la 2ª fórmula de 1RM).
- **Fusionar los 2 badges** en 1 `StatusBadge` con **motivos** (no score).
- **Hero slim** (identidad + 1 badge + WhatsApp + `⋯`) sin solape con la barra flotante.
- **Resumen 2-columnas** desktop + **orden de colapso móvil** + **skeleton por columna/streaming** (§5.0, §8).
- **A5** RPE medio + prescrito-vs-hecho; **empty-states guiados** (§7); **léxico de color + a11y** (§4).
- Nutrición: sub-anclas Hoy/Plan/Coach/Hábitos + acordeón recordado + timeline paginado (≤3 scrolls).
- Archivar `BillingTabB8`.

**— GATE: validar demanda + medir A7 —** *(crítica PM: el plan es engineering-driven; validar antes de seguir)*
- Enseñar Fase 0+1 a **2-3 coaches reales**; confirmar que la cola de check-ins y la cosecha les cambian el día.
- **A7 mood 1-tap** (rama propia): shipear `workout_session_feedback` (D2) + el 1-tap en `WorkoutSummaryOverlay`.
- **Medir tasa de completado 3-4 semanas.** Si < ~60 % → no se agregan más inputs del alumno.

**Fase 2 — Nutrición Pro: balance/TDEE (solo si hay demanda).**
- **A9** card de balance con TDEE **estimado** (Mifflin, ya desbloqueado por `sex`), **gateada a Nutrición Pro**,
  como **indicador cualitativo** + badge "estimado".
- **A8** composición corporal en Progreso, **gateada a Body-comp** con teaser.

**Fase 3 — Inputs del alumno #2+ (SOLO si A7 > ~60 %).**
- En orden: foto de comida (D3 + Storage RLS) → gramaje real off-plan → auto-declarar alergia (D4, coach
  confirma) → hábitos textarea → hambre/saciedad → alcohol. Paridad mobile (OffPlanLogger/swaps/comentarios).

**Fase 4 — Wearables (RN, diferido, rama propia).** Solo si el negocio lo justifica (§12).

**Regla de secuencia:** Fase 0-1 = front + D1. D2-D4 entran con su feature consumidora, cada una aditiva,
idempotente, con `get_advisors` verde. Wearables no se toca.

---

## 14. Decisiones abiertas para el CEO

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D-CEO-1** | `BillingTabB8` (facturación en la ficha) | (a) archivar (b) cablear como 6ª tab | **Archivar** — 5-6 tabs envuelven en móvil; no gastar reunión |
| **D-CEO-2** | Palabra del 3er estado del badge | "Revisar" (verbo) vs **"Atención"** (homogéneo con Al día/Urgente) | **"Atención"** (gramática consistente) |
| **D-CEO-3** | Precisión de proyección/balance | número único vs **rango + "estimado"** | **Rango + badge visible** — no sobre-prometer con alumnos |
| **D-CEO-4** | Actuals de cardio y composición | free vs **detrás del gate del módulo** | **Detrás del gate + teaser** — no regalar lo cobrable |
| **D-CEO-5** | Balance/TDEE (A9) | free vs **gancho de Nutrición Pro** | **Nutrición Pro** — es palanca de upgrade |
| **D-CEO-6** | Wearables (3 tablas + OAuth) | construir ahora vs **cortar/diferir** | **Cortar de este scope** — YAGNI con 1 coach pagando |
| **D-CEO-7** | RPE por serie del alumno | default-fill 8 vs **opt-in real / no tocar** | **No default-fill** — contamina el motor adaptive |
| **D-CEO-8** | ¿Se valida con coaches antes de Fase 3? | shipear a ciegas vs **gate de demanda + medir A7** | **Gate de demanda** — el plan es engineering-driven hoy |

---

### Anexo — trazabilidad de las críticas senior integradas

- **UX/UI:** mobile-first con orden de colapso (§1.5, §5.0) · Hero vs barra flotante (§5.1) · microcopy inline +
  `MetricInfo` único (§1.3, §6) · presupuesto de densidad (§4) · empty-states en frío (§7) · badge homogéneo con
  motivos (§5.1) · léxico de color + a11y (§4) · rango/estimado en proyección/balance (§5.3, §9) · view-model
  tipado (§3) · Nutrición sub-anclas + timeline paginado (§5.6) · satisfacción/porciones agregadas (§5.6) ·
  deleite definido (§5.7) · primitivos del DS (§2) · skeleton/streaming (§8).
- **PM:** ship Fase 0-1, cortar 60 % del resto (§13) · gating de monetización A3b/A8/A9 (§9) · wearables cortado
  (§12) · Fase 3 recortada a 1 input + gate de medición (§10, §13) · RPE sin default-fill (§10.4) · BillingTabB8
  archivada (§14) · disciplina de rama (§13) · validación de demanda (§13 GATE).
- **Arquitectura/Security:** RLS team con `current_user_pool_client_ids()` (§11-D2, D5) · tokens wearable
  service-role-only (§12) · UPSERT por NOT NULL en biometría (§11-D1) · `(SELECT auth.uid())` en todas las
  policies (§11) · confianza "coach confirma" enforced en D4 (§11-D4) · Storage RLS para foto de comida
  (§11-D3) · data-flow `_data → service → repository`, sin N+1, columnas al SELECT existente (§3, principio de
  view-model) · gating server-side vía `hasModule()` (§9) · índice liderando `client_id` (§11) · `get_advisors`
  tras cada migración (§11).
