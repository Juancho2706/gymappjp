# Doc 2 de 3 — Auditoría de la ficha del alumno REAL (código vivo)

> Alcance: lo que la app renderiza HOY en `/coach/clients/[clientId]`, no el diseño Claude Design.
> Fuente: `apps/web/src/app/coach/clients/[clientId]/*` + `services/client/client-detail.service.ts`.
> Lente: UX/UI + Frontend senior. Foco en **valor-coach**, **explicabilidad** (jerga sin explicar),
> **redundancia entre tabs**, **carga cognitiva** y **desktop vs móvil**.
> Perfil de usuario asumido: coach promedio (personal trainer), NO data-scientist.

---

## 0. Mapa de lo que se muestra (composición real)

`page.tsx` monta **Hero** (`ClientProfileHero`) + **Dashboard** (`ClientProfileDashboard`), que a su vez
tiene **5 pestañas** (`ProfileTabNav`): **Resumen · Progreso · Entreno · Programa · Nutrición**.
Existe además una barra flotante (`ProfileFloatingActions`: WhatsApp / check-in / builder). Facturación
(`BillingTabB8`) está construida pero **desconectada** del chrome (no hay 6ª pestaña).

Todo el árbol recibe **un solo objeto `data: any`** (sin tipar) desde `getClientProfileData` (un `React.cache`
de ~650 líneas que hace ~15 queries + 5 RPC). El Hero y varias tabs **recomputan en cliente** cosas que el
loader ya calculó (pesos, deltas, 1RM), a veces con **fórmulas distintas** → inconsistencias (ver §7).

Jerarquía actual (de arriba a abajo): identidad + 2 badges de atención → 4 chips → [tab]. El **Resumen**
está forzado a **una columna angosta `max-w-3xl` centrada** incluso en desktop 1600px; el resto de tabs usan
ancho completo `md:col-span-12`. Inconsistencia estructural (ver §8).

---

## 1. HERO (identidad) — `ClientProfileHero.tsx`

| Elemento | Fuente del dato | Valor coach | Explicabilidad |
|---|---|---|---|
| Eyebrow `{PROGRAMA} · Semana N` | `activeProgram.name` + `compliance.planCurrentWeek` | Alto | OK |
| Nombre + inicial-avatar | `client.full_name` | Alto | OK |
| Badge **bucket** (Al día / En riesgo / Atrasada) | `attentionBucket(score, lastActivity)` | Alto | **Media** — umbral "≥7d sin actividad = Atrasada" no visible |
| Badge **`Score {n} · Estable/Revisar/Urgente`** | `attentionScore` (`calculateAttentionScore`) | **Ruido/confuso** | **BAJA** — número crudo 0-100+, no dice qué lo mueve ni qué es "bueno" |
| Chip Peso + delta | `lastCheckIn.weight` vs `prevCheckIn` | Alto | Media — "delta" = último check-in vs anterior (no semanal real) |
| Chip Adherencia % + barra | `workoutsThisWeek/workoutsTarget` | Alto | **Baja** — "Adherencia" aquí = **solo entreno de la semana**, mismo nombre que la nutricional |
| Chip Workouts `x/y esta semana` | `compliance.workouts*` | Alto | OK |
| Chip Comidas hoy `x/y` + `% plan` | `compliance.todayMeals*` + `nutritionCompliancePercent` | Alto | Media — "% plan" es de HOY, no del histórico |
| Flame `N d de racha` | `get_client_current_streak` | Medio | **Baja** — es racha de **actividad**; choca con "Racha ≥80%" de Nutrición (dos "rachas" distintas, mismo nombre) |
| `Desde {mes-año}` · `~{training age}` | `subscription_start_date/created_at` | Medio | OK |
| Botón Exportar (Download → `window.print()`) | — | Medio | OK |
| Botón "Más opciones" (`MoreVertical`) | — | **Ruido** | **Botón muerto**: sin `onClick`, no abre nada |

**Problema mayor del Hero:** los **dos badges de atención** (bucket + score) miden lo mismo con escalas
distintas y pueden **contradecirse** (p. ej. "Al día" + "Score 30 · Revisar" a la vez). Carga cognitiva alta,
señal ambigua.

---

## 2. RESUMEN (`ProfileOverviewB3.tsx`) — la tab por defecto

| Sección | Qué muestra | Fuente | Valor | Explicabilidad |
|---|---|---|---|---|
| **Cumplimiento semanal** (3 rings) | Entreno / Nutrición / Check-in % + Δ pts | `compliance.*` | Alto | **Baja** — ring "Check-in" = `checkInRegularityPercentAsOf` (baja lineal a 0 en 7 días); nadie lo explica. "Δ pts vs sem. ant." sin leyenda |
| **5 KPIs** | Mejor racha, Sesiones 30d, Adherencia entreno %, Δ Peso 30d, Sem. programa | mezcla `compliance` + `calendarData` | Alto | Media — "Adherencia entreno" repite el ring de arriba; Δ vs sem ant. sin base |
| **Programa** (`ProfileProgramSummaryCard`) | Nombre, fases, Semana X/Y, días restantes, señal nutrición, próximo entreno | `activeProgram` + `compliance` | Alto | Media — badge "En track / Ciclo vencido" y "Nutrición en track/riesgo" OK; barra de fases sin nombres si `compact` |
| **Métricas clave** | Peso actual + Variación semanal + botón editar biometría | `currentWeight`, `weeklyWeightVariation` | Alto | Media |
| **Editar biometría inicial** (dialog) | Altura / Peso inicial + Guardar/Cancelar | intake | — | **FORM MUERTO**: los botones Guardar/Cancelar no tienen handler ni server action. Precarga datos pero no persiste nada |
| **Último check-in** (`ProfileCheckInSnapshot`) | foto, peso, energía (★), notas, **Marcar revisado** | `lastCheckIn` | Alto | OK — "Marcar revisado" sí funciona (`markCheckInReviewed`) |
| **Evolución visual** | 3 fotos de check-in | `checkInsWithPhotos` | Medio | OK (badge "solo en la app") |
| **Módulos** | deep-links Cardio/Movimiento/Composición (gateados) | `moduleFlags` | Alto (si aplica) | OK |
| **Editar plan** (CTA) | link a `/coach/builder` | — | Alto | OK |

**Redundancia Resumen ↔ Hero:** ~70% de solape. El Hero ya muestra peso+delta, adherencia entreno, workouts,
comidas, racha; el Resumen los repite como rings + KPIs + "Métricas clave". El coach ve **peso 4 veces** antes
de llegar a "Progreso".

---

## 3. PROGRESO (`ProgressBodyCompositionB6.tsx` + "Panel de Progreso Unificado" en el Dashboard)

### 3a. `ProgressBodyCompositionB6` (composición corporal)

| Sección | Qué muestra | Fuente | Valor | Explicabilidad |
|---|---|---|---|---|
| **Peso · tendencia** (curva SVG + puntos clicables) | peso por check-in + línea objetivo | `checkIns.weight`, `goal_weight_kg` | Alto | OK |
| Statboxes: Inicial / Cambio total / **Ritmo 30d · regresión** / **Proyección 4 sem · si sigue** / Energía media 7d | regresión lineal `linearRegressionKgPerDay` | Alto | **BAJA** — "regresión" y "proyección lineal" son jerga; sin caveat de que es extrapolación ingenua (proyecta ±kg a 4 sem sin banda de error) |
| **IMC** + escala 16-36 + categoría | `bmiFromMetric(peso, altura)` | Medio | Media — categoría (Normal/…) ayuda; requiere altura del intake o dice cómo cargarla |
| **Energía media 7d** (gauge + ★) | `avgEnergySince` | Medio | OK |
| **Comparativa de fotos** (base vs comparar + slider) | check-ins con foto | Alto | OK |
| **Historial de check-ins** (timeline cards) | todos los check-ins: peso, ★, notas | Alto | OK |

### 3b. "Panel de Progreso Unificado" (7 pills, dentro de `ClientProfileDashboard.tsx`)

Pills: ⚖️ Peso & Comp · 📊 Tasa Cambio · 💪 Fuerza (1RM) · 🏋️ Volumen · 🍽️ Macros · 📉 Adherencia · ⚖️ Balance Neto.

| Chart | Qué muestra | Valor | Explicabilidad / Redundancia |
|---|---|---|---|
| Peso & Comp. | peso + energía (dual-axis) | Medio | **Redundante** con 3a "Peso · tendencia" |
| Tasa Cambio | Δ peso por check-in (barras rojo/verde) | Medio | Umbrales de color (0.2/0.6 kg) sin leyenda |
| **Fuerza (1RM)** | bench/squat/deadlift | Bajo | **Redundante** con Entreno (StrengthSparkCards) **y usa OTRA fórmula** (name-match ES/EN inline) → números pueden diferir |
| Volumen | tonelaje por día | Bajo | **Redundante** con Entreno (Tonelaje 7d) |
| Macros | proteína/carbo/grasa apilados | Bajo | **Redundante** con Nutrición (pies + barras) |
| Adherencia | kcal reales vs objetivo | Bajo | **Redundante** con Nutrición (heatmap + chart denso) |
| **Balance Neto** | diferencial diario + acumulado | Bajo | **BAJA** — "Balance Neto / Neto Diario / Acumulado / Diferencial" = superávit/déficit calórico acumulado; jamás se dice "positivo=comió de más". Colores rojo/azul sin leyenda. Es una vista "forense" sin traducción a lenguaje coach |

**Hallazgo crítico de esta tab:** el "Panel de Progreso Unificado" **duplica 5 de sus 7 charts** con Entreno
y Nutrición, y en un caso (Fuerza 1RM) con una **fórmula distinta** a la de la tab Entreno. Es el elemento de
mayor redundancia y mayor carga cognitiva de toda la ficha. Card fija `h-[35rem]` + 7 pills que envuelven en
móvil.

---

## 4. ENTRENO (`TrainingTabB4Panels.tsx`)

| Sección | Qué muestra | Fuente | Valor | Explicabilidad |
|---|---|---|---|---|
| **Récord de la semana** (banner + confeti) | mejor e1RM de la semana vs antes | `findWeeklyWeightPRs` (Epley) | Alto | **Baja** — "e1RM {x} → {y}" y "+{n}% 1RM"; "e1RM" nunca se expande |
| **Fuerza — 1RM estimado (Epley)** (cards sparkline) | 1RM por ejercicio + filtro por grupo | `buildExerciseStrengthSeriesMap` | Alto | **Baja** — "1RM / Epley" nombrado pero no explicado (qué es, por qué "estimado") |
| **Balance muscular · 30 días** (radar) | volumen relativo por grupo + alerta desequilibrio | `muscleVolumeByGroup` | Alto | Media — "desequilibrio X ~N× más volumen que Y"; el "volumen" = Σ peso×reps sin decirlo aquí |
| **Tonelaje por sesión · 7 días** (barras + media móvil) | Σ peso×reps por día + media 7 ses. | `buildDailyTonnageSeries` | Medio | **BAJA** — "Tonelaje", "kg·rep", "media móvil" sin explicar |
| **Historial de sesiones** (pills + date picker + detalle) | sets: `peso × reps · RPE` | `getClientWorkoutForDate` | Alto | Media — muestra **RPE por serie** (¡valioso!) pero "RPE" no se explica; **"PC"** (peso corporal) sin leyenda |
| Récords de peso + Volumen 30d (cards extra en el Dashboard) | PR por ejercicio + barra volumen "u." | RPCs | Medio | **Baja** — unidad **"u."** (units) es críptica |

---

## 5. PROGRAMA (`ProgramTabB7.tsx`)

| Sección | Qué muestra | Fuente | Valor | Explicabilidad |
|---|---|---|---|---|
| Header inverse "PROGRAMA ACTIVO" | nombre, días restantes/vencido, tipo, variante A/B, sem ciclo | `activeProgram` | Alto | OK — A/B tiene tooltip "impares→A, pares→B" |
| Barra de fases + leyenda | `program_phases` | Alto | OK |
| Progreso Semana X/Y % | `planCurrentWeek/Total` | Alto | OK — degrada bien ("sin fechas → progreso no disponible") |
| **Estructura del ciclo** (grilla semanas) | fase+variante por semana | Alto | OK |
| **Microciclo (L–D)** (acordeón por día) | ejercicios del día + grupos | `workout_plans` | Alto | OK |
| **Sheet de ejercicio** (prescripción) | GIF, Series×reps, Obj. peso, Descanso, **RIR**, **Tempo**, notas | `workout_blocks` | Alto | **BAJA** — **RIR** (Reps In Reserve) y **Tempo** (notación 4 dígitos) se muestran crudos, sin leyenda. Un coach de fuerza los entiende; el promedio no |

**Dato valioso que NO se muestra aquí (ver §6):** `progression_mode` del bloque (sobrecarga progresiva
lineal/doble) existe en DB y en el builder, pero el sheet **no lo surfacea**. Tampoco usa `video_url` (solo `gif_url`).

---

## 6. NUTRICIÓN (`NutritionTabB5.tsx`) — la tab más larga (1.673 líneas)

Estructura en 3 zonas + 2 acordeones de "Detalle":

| Zona / Sección | Qué muestra | Valor | Explicabilidad |
|---|---|---|---|
| **A · Hoy (Santiago)** | kcal consumidas/meta + barras macro | Alto | OK |
| **A · Adherencia 30 días** (heatmap + 3 tiles) | % + Prom. mensual + **Racha ≥80%** + Sem vs ant. | Alto | Media — heatmap tiene leyenda ("color según % de comidas"); pero el **headline "30 días"** usa `monthlyAvgPct` que **solo promedia días CON log** (días sin registrar no cuentan) → puede inflar el número; no se explica |
| **A · Últimos 7 días kcal vs meta** | barras + línea meta | Alto | OK ("consumo estimado según comidas marcadas") |
| **B · Alimentos favoritos** | chips del alumno | Medio | OK |
| **B · Plan activo** | nombre, kcal, macros (g + %), CTA editar/copiar/ver-como-alumno + badge **SYNCED/CUSTOM** | Alto | **Baja** — **"SYNCED / CUSTOM"** sin explicar (plantilla vs personalizado) |
| **B · Lista de comidas** (acordeón) | comidas + alimentos + macros | Alto | OK |
| **C · Funciones para este alumno** (override) | panel tri-state de secciones | Alto (coach) | Media |
| **C · Alertas del coach** | `deriveNutritionCoachAlerts` | Alto | OK |
| **C · Contexto check-in** | peso/energía recientes vs adherencia | Alto | OK |
| **C · Restricciones dietarias** | alérgenos/preferencias | Alto | OK |
| **C · Conversación (hilo)** | comentarios coach⇄alumno | Alto | OK |
| **C · Umbrales de micros** (Pro) | editor de micros | Medio | **Baja** — umbrales de micros sin explicar qué rango es "bueno" |
| **C · Nota privada del coach** | nota interna | Alto | OK |
| **C · Historial de ciclos del plan** | ciclos/plantillas | Medio | OK |
| **C · Hábitos del día** | agua/pasos/sueño/ayuno/suplementos/nota | Alto | OK |
| **Detalle · gráficos densos** (colapsado) | pie meta + pie consumido + composed kcal/adherencia | Medio | Media — "Consumidas (estim.)" bien etiquetado como estimación |
| **Detalle · historial de logs** (colapsado) | último día + tabla 30 logs + day navigator | Alto | OK |

**Nota positiva:** Nutrición es la tab **mejor diseñada en explicabilidad** (varios micro-textos "color según…",
"consumo estimado…", "estim."). Es el patrón a replicar en Entreno/Progreso. Contra: es larguísima (scroll
infinito en móvil), y la binariedad completada/no-completada **oculta las porciones parciales** que el motor SÍ
calcula (`consumed_quantity` / `portionPctMapFromMealLogs`).

---

## 7. Redundancia entre tabs (mapa de duplicación)

| Dato | Dónde aparece | Veredicto |
|---|---|---|
| **Peso + delta** | Hero chip · Resumen "Métricas clave" · Resumen KPI Δ30d · Progreso "Peso·tendencia" · Panel Unificado "peso_composicion" | **5×** con **4 ventanas de delta distintas** (último-vs-anterior, Δ30d, delta7d, cambio total) → coach ve números que no cuadran |
| **Adherencia entreno** | Hero chip · Resumen ring · Resumen KPI | 3× |
| **Adherencia nutrición** | Hero "comidas hoy" · Resumen ring · Nutrición headline/heatmap/tiles · Panel Unificado "adherencia" | 4× con **definiciones distintas** (hoy vs semanal vs mensual) |
| **1RM / Fuerza** | Entreno cards · Entreno banner PR · Panel Unificado "fuerza" | 3× y **DOS fórmulas** (Epley por-ejercicio vs name-match inline) |
| **Volumen / Tonelaje** | Entreno "Tonelaje 7d" · Dashboard "Volumen 30d" card · Panel Unificado "volumen" | 3× |
| **Macros** | Nutrición pie meta · pie consumido · Panel Unificado "macros" | 3× |
| **Fotos check-in** | Resumen "Evolución visual" · Progreso "Comparativa" · Progreso timeline thumbnails · Snapshot | 4× |
| **Atención** | Hero bucket + Hero score | 2× (contradecibles) |

**Raíz del problema:** el "Panel de Progreso Unificado" fue concebido como "todo en un lugar", pero las tabs
Entreno/Nutrición ya son ese lugar. Resultado: cada métrica vive en 3-5 sitios, a veces con motores distintos.

---

## 8. Carga cognitiva y desktop vs móvil

- **Desktop desaprovechado:** `page.tsx` da `max-w-[1600px]`, pero **Resumen** se auto-limita a `max-w-3xl`
  centrado (una columna angosta) mientras las demás tabs usan `md:col-span-12`. En un monitor grande el Resumen
  se ve como una tira móvil con márgenes gigantes. Incoherencia visual.
- **Panel Unificado** `h-[35rem]` fijo + 7 pills que envuelven: en móvil las pills ocupan 2-3 filas y el chart
  queda apretado; en desktop sobra alto.
- **Nutrición** es una sola columna de ~20 bloques → scroll extremo en móvil. Los 2 acordeones "Detalle" ayudan,
  pero Zona C monta ~8 cards siempre.
- **Dual-axis** (peso vs energía, kcal vs %) son los charts más pesados de leer; energía cae a `0` cuando falta
  el dato (`?? 0`) → líneas que se desploman a cero sin querer.
- **Positivo:** `ProfileTabNav` sticky con hint de swipe en móvil; degradaciones "sin datos" consistentes;
  `AppOnlyBadge` avisa qué es solo-app.

---

## 9. Datos valiosos que YA tenemos en DB y NO mostramos (o mostramos mal)

1. **`progression_mode` del bloque** (sobrecarga progresiva lineal/doble, PR #98): el builder lo define, la ficha
   **nunca** lo muestra. El coach no ve si un ejercicio está en progresión ni cuál. **Alto valor.**
2. **Prescrito vs ejecutado (carga):** tenemos `target_weight_kg` (Programa) y `weight_kg` real (Entreno) pero
   **nunca juntos**. Un "adherencia a la carga" (levantó el peso pedido) es trivial con lo que hay.
3. **RPE por serie:** se muestra en el detalle del día pero **no se agrega ni tendencia**. Un "RPE medio de la
   sesión" o flag "sesión muy dura/fácil" es oro para autorregulación. **Alto valor, casi gratis.**
4. **Porciones parciales de comida:** `consumed_quantity` / `portionPctMapFromMealLogs` se calculan pero la UI de
   comidas es **binaria** (✔/reloj). Perdemos el "comió el 50%".
5. **`video_url` del ejercicio:** se trae en la query del programa pero el sheet solo usa `gif_url`.
6. **`reviewed_at` de check-ins:** existe review-tracking, pero el **timeline** de Progreso no muestra
   revisado/no-revisado (solo el snapshot del Resumen). Oportunidad de "cola de check-ins por responder".
7. **Swaps de alimentos:** se muestran en el día read-only (bien), pero no se agregan ("este alumno cambia
   siempre el pollo por atún") → señal de preferencia útil, ya en `nutrition_meal_food_swaps`.
8. **Notas de sesión del alumno:** check-in notes y `daily_habits.notes` sí se muestran; si hubiera nota por
   sesión de entrenamiento no se surfacea.

---

## 10. Reorganización propuesta (priorizada por VALOR-COACH)

### P0 — Matar redundancia y ambigüedad (alto impacto, bajo riesgo)
1. **Eliminar el "Panel de Progreso Unificado" de 7 pills.** Mover cada chart a su hogar natural (fuerza/volumen
   → Entreno; macros/adherencia/balance → Nutrición; peso/tasa → Progreso). Deja Progreso = composición corporal
   pura. Elimina 5 duplicados y la 2ª fórmula de 1RM de un plumazo.
2. **Un solo indicador de atención.** Fusionar bucket + score en **un** badge con estado nombrado
   (Al día / Revisar / Urgente) y quitar el número crudo (o esconderlo tras tooltip "por qué").
3. **Una definición de cada métrica.** Peso: una tarjeta canónica con las 3 ventanas etiquetadas (semana / 30d /
   total) en vez de 5 números sueltos. Adherencia: separar visual y verbalmente "hoy" vs "semanal" vs "mensual".
4. **Borrar botones/forms muertos:** "Más opciones" del Hero y el dialog "Editar biometría inicial" (Guardar no
   hace nada) — o cablearlos. Hoy generan desconfianza.

### P1 — Adelgazar el Resumen y aprovechar desktop
5. **Resumen = 2 columnas en desktop** (quitar `max-w-3xl`): izquierda señal (rings + programa + próximo
   entreno), derecha check-in + evolución. Reduce el solape con el Hero colapsando el Hero a identidad + 1 badge.
6. **Hero solo identidad + estado + acciones.** Que las 4 chips vivan solo en el Resumen (no en ambos).

### P2 — Subir el valor con datos que ya tenemos
7. **Programa: mostrar `progression_mode`** por bloque (badge "Progresión: lineal/doble") + `video_url`.
8. **Entreno: "Prescrito vs hecho"** por ejercicio (carga pedida vs levantada) + **RPE medio de sesión**.
9. **Nutrición: porciones parciales** en la lista de comidas (no solo ✔/✗).

### P3 — Cola de trabajo del coach
10. **Timeline de Progreso con estado "revisado"** + acción rápida, para convertir la ficha en bandeja de check-ins.

---

## 11. Deuda de explicabilidad: qué y cómo explicar

Regla: el coach promedio NO es data-scientist. Todo término técnico necesita **tooltip (ícono `?`)** o **micro-leyenda
inline**. Nutrición ya lo hace bien ("color según % de comidas…"); replicar ese patrón en Entreno/Progreso.

| Término / métrica | Dónde | Cómo explicarlo (copy sugerido) |
|---|---|---|
| **Score de atención** | Hero | Tooltip: "Prioridad 0-100 según días sin check-in, sin entrenar, adherencia y fin de ciclo. Más alto = necesita tu atención antes." |
| **e1RM / 1RM estimado (Epley)** | Entreno, Progreso | "1RM = peso máximo teórico para 1 repetición. Estimado con Epley: peso × (1 + reps/30). Sube = más fuerte." |
| **RIR** | Sheet de ejercicio | "Reps in Reserve: repeticiones que le sobran al terminar la serie. RIR 2 = pudo hacer 2 más." |
| **Tempo** | Sheet de ejercicio | "Ritmo en 4 tiempos: bajada-pausa-subida-pausa (seg). '3010' = 3s bajando, 0 abajo, 1s subiendo, 0 arriba." |
| **Tonelaje / Volumen / "u." / kg·rep** | Entreno, Dashboard | "Volumen = suma de peso × repeticiones. Mide cuánto trabajo total hizo el músculo." Reemplazar "u." por "kg·rep". |
| **Media móvil 7 ses.** | Tonelaje | "Promedio de las últimas 7 sesiones, para ver tendencia sin ruido del día a día." |
| **Ritmo 30d · regresión** | Progreso statbox | "Ritmo de cambio de peso por mes, calculado como tendencia (línea que mejor ajusta los check-ins)." |
| **Proyección 4 sem · si sigue** | Progreso statbox | "Estimación si mantiene el ritmo actual. Es una extrapolación, no una promesa." (+ ocultar si <3 check-ins) |
| **Balance Neto / Diferencial / Acumulado** | Panel/Nutrición | "Diferencia entre lo que comió y su meta. Positivo (rojo) = superávit; negativo (azul) = déficit. Acumulado = suma en el tiempo." |
| **Racha (Hero) vs Racha ≥80% (Nutrición)** | Hero, Nutrición | Renombrar: Hero = "Racha de actividad"; Nutrición = "Racha de adherencia (≥80%)". Nunca solo "racha". |
| **Check-in %** (ring) | Resumen | "Regularidad: 100% si registró hoy, baja a 0% a los 7 días sin check-in." |
| **Adherencia 30 días** | Nutrición headline | Aclarar: "Promedio de los días CON registro" (o cambiar a % sobre días calendario). |
| **SYNCED / CUSTOM** | Nutrición plan | "SYNCED = sigue una plantilla tuya. CUSTOM = editado solo para este alumno." |
| **PC** | Entreno sets | Reemplazar por "Peso corporal" o "PC (peso corporal)". |
| **Desequilibrio N× más volumen** | Entreno radar | "Este grupo recibió N veces más trabajo que el más flojo. Puede indicar descompensación." |
| **Δ pts vs sem. ant.** | Resumen rings | "Cambio en puntos porcentuales respecto a la semana pasada." |

---

## 12. Veredicto (resumen ejecutivo)

La ficha tiene **datos ricos y un buen motor** detrás, pero sufre **duplicación estructural** (cada métrica en
3-5 lugares, a veces con fórmulas distintas), **dos indicadores de atención que se contradicen**, y una **deuda de
explicabilidad** grande fuera de Nutrición (e1RM, RIR, tempo, tonelaje, regresión, balance neto, score — todo
crudo). El "Panel de Progreso Unificado" es el mayor foco de ruido y debe desaparecer. Con P0+P1 se recorta ~40%
del contenido repetido sin perder información; con P2 se suben datos que YA tenemos (progresión, prescrito-vs-hecho,
RPE, porciones parciales) que hoy el coach no puede ver.
