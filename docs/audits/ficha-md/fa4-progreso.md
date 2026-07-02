# 4. Pestana Progreso y composicion

Esta es la pestana **B6** de la ficha del alumno del coach (`/coach/clients/[clientId]`). Se monta cuando `activeTab === 'progress'` dentro de `ClientProfileDashboard.tsx`. El contenido se reparte en dos bloques que viven en archivos distintos pero comparten los mismos datos:

1. **`ProgressBodyCompositionB6`** (componente `apps/web/src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.tsx`): peso y tendencia, IMC, energia, comparativa de fotos y linea de tiempo de check-ins.
2. **Panel de Progreso Unificado** (markup inline dentro de `ClientProfileDashboard.tsx`, `id="profile-progress-panel"`): el set de graficas tactiles conmutables (peso, tasa de cambio, fuerza, volumen, macros, adherencia, balance neto) mas el campo de peso objetivo.

> La **captura** de composicion corporal (BIA / ISAK) NO se realiza aqui: vive en el modulo `/coach/movement` y `/coach` con el entitlement `body_composition` (modulo "Composicion corporal"). Esta pestana no renderiza un panel de composicion antropometrica; lo que muestra es derivado de los **check-ins** (peso, energia, fotos, notas) y del IMC calculado. Para los datos BIA/ISAK detallados el coach se mueve al modulo dedicado.

---

## 4.1 Datos que llegan (backend)

Toda la pestana se alimenta de `data` resuelto server-side por `getClientProfileData(clientId)` (`services/client/client-detail.service.ts`, envuelto en `React.cache`), que `ClientProfileDashboard` desestructura como `const { client, checkIns, payments } = data`.

**Check-ins** (`checkIns`):

- Query: `supabase.from('check_ins').select('*').eq('client_id', clientId).order('created_at', { ascending: false })`.
- Tras traerlos, las fotos se firman con `resolveCheckinPhotoUrls(createServiceRoleClient(), checkIns)` (bucket de check-ins **privado**; se devuelven URLs firmadas server-side). Por eso las `<Image>` usan `unoptimized`.
- El tipo que consume el componente (`BodyCompCheckInRow`) usa: `id`, `created_at`, `weight`, `energy_level`, `notes`, `front_photo_url`. (La query trae mas columnas con `*`, p. ej. `side_photo_url`/`back_photo_url`, pero B6 solo lee `front_photo_url`.)

**Altura** (`heightCm`): llega como `client?.client_intake?.height_cm` (de la ficha intake del alumno). Si falta, IMC no se calcula.

**Peso objetivo** (`goalWeight`): estado inicial desde `client?.goal_weight_kg`.

Los datos de las graficas de fuerza/volumen/macros/balance del Panel Unificado vienen de otras ramas del mismo `data`: `data.workoutHistory` (ventana de 548 dias), `data.nutritionLogsEnriched`/`data.nutritionLogs`, `data.activeNutritionPlanWithMeals`/`data.nutritionPlans`, `data.compliance`.

Colores de ejes/grid/tooltip (`chartGridColor`, `chartAxisColor`, `tooltipBgColor`, `tooltipBorderColor`, `tooltipTextColor`) se calculan en el dashboard segun `resolvedTheme` (dark/light) y se pasan como props a B6 y a cada grafica.

**Empty-state global:** si `checkIns` esta vacio, `ProgressBodyCompositionB6` retorna una sola `GlassCard` con icono `Scale` y el texto "Sin check-ins todavia. La composicion y tendencias apareceran cuando el alumno registre peso y fotos."

---

## 4.2 `profileBodyCompositionUtils.ts` — que calcula

Modulo puro (sin acceso a backend), todo el calculo ocurre en el cliente sobre los check-ins ya recibidos.

### `linearRegressionKgPerDay(checkIns)`
Pendiente de **regresion lineal por minimos cuadrados** sobre el peso, en kg/dia.
- Filtra a check-ins con `weight != null && weight > 0`, ordenados ascendente por `created_at`.
- **Ventana:** intenta usar solo los ultimos **30 dias** (`cutoff = subDays(hoy, 30)`); si esa ventana tiene < 2 puntos, cae a usar **todos** los puntos validos.
- Con < 2 puntos retorna `0`.
- Convierte cada fecha a dias desde el primer punto (`x = (t - t0) / 86_400_000`), `y = peso`. Calcula la pendiente `(n*ΣXY - ΣX*ΣY) / (n*ΣXX - ΣX²)`. Si el denominador es ~0 retorna `0`.

### `bmiFromMetric(weightKg, heightCm)`
IMC = `peso / (m²)`.
- Retorna `null` si peso o altura son invalidos (<= 0).
- **Backward-compat:** si `heightCm < 3` asume que vino en metros (p. ej. `1.72`) y multiplica por 100.
- Valida rango plausible: altura normalizada debe estar entre 80 y 260 cm, si no retorna `null`.

### `bmiCategory(bmi)`
Devuelve etiqueta: `< 18.5` → "Bajo peso"; `< 25` → "Normal"; `< 30` → "Sobrepeso"; resto → "Obesidad".

### `avgEnergySince(checkIns, since)`
Promedio del `energy_level` de los check-ins con `created_at >= since` (y `energy_level != null`). Retorna `null` si no hay ninguno. B6 lo llama con `since = subDays(hoy, 7)` (energia media de 7 dias).

### `energyColor(level)`
Color del punto de la linea de tiempo segun nivel: `null` → gris; `>= 8` → verde (emerald); `>= 5` → ambar; resto → rojo (rose).

---

## 4.3 `ProgressBodyCompositionB6` — secciones

### Preparacion de datos (en el componente)
- `sortedAsc` / `sortedDesc`: check-ins ordenados por fecha ascendente y su reverso.
- `withWeight`: check-ins con `weight != null && weight > 0`.
- `chartData`: mapeo de `withWeight` a `{ id, date (d MMM), dateIso (yyyy-MM-dd), weight, energia, notes, photo, created_at }`.
- `firstWeight` / `lastWeight` / `totalDelta` (= ultimo − primero).
- `slopeKgPerDay = linearRegressionKgPerDay(checkIns)`; `monthlyRate = slope * 30`; `projected4w = lastWeight + slope * 28`.
- `bmi`: `bmiFromMetric(ultimo peso, heightCm)` (o `null`).
- `avgEnergy7 = avgEnergySince(checkIns, hoy-7d)`.
- `photoCheckIns`: check-ins con `front_photo_url` (ascendente).
- `deltaTrend`: `'up'` si `totalDelta > 0.05`, `'down'` si `< -0.05`, `'flat'` en medio (mueve el icono TrendingUp/TrendingDown/Minus en el StatBlock "Cambio total").

### Tarjeta "Peso y tendencia"
- **Grafica de area** (`AreaChart` de recharts) del peso a lo largo del tiempo. Eje X = fechas (`d MMM`), eje Y = peso con dominio `dataMin-1 .. dataMax+1`. Requiere **>= 2 pesos**; con menos muestra "Hace falta al menos dos pesos para la curva."
- **Tooltip** custom por punto: fecha ISO, peso en kg, energia (estrellas `EnergyStars` + `n/10`), miniatura de la `photo` si existe, `notes`, y la pista "Clic en un punto para ampliar".
- **Puntos clicables:** cada `dot` es un `<circle>`; al hacer click setea `dotDetail` con `{ weight, energia, photo, notes }` → abre el modal de detalle (ver 4.5).
- **Bloque de stats** (`StatBlock`) a la derecha: Peso inicial, Peso actual, Cambio total (con `trend`), Ritmo 30d (`monthlyRate` en kg/mes, subtitulo "Regresion sobre ventana reciente"), Proyeccion 4 sem (`projected4w` si hay >= 2 pesos; subtitulo "Si continua la tendencia actual").

`EnergyStars` mapea `energy_level` (0-10) a 5 estrellas: `stars = round(level/2)` acotado 0..5.

### Tarjeta "IMC"
- Si falta altura o `bmi == null`: mensaje "Añade altura en la ficha del alumno (intake) para ver IMC y la escala."
- Si hay IMC: muestra el valor (`bmi.toFixed(1)`), la categoria (`bmiCategory`), y una **escala visual** con marcador. El marcador se posiciona con `bmiMarkerPct = clamp(((bmi-16)/(36-16))*100, 0, 100)`; la escala lista los cortes 16 / 18.5 / 25 / 30 / 36.

### Tarjeta "Energia media (7 dias)"
- Si `avgEnergy7 == null`: "Sin niveles de energia en la ultima semana."
- Si hay: **gauge semicircular** (`RadialBarChart` 180°→0°). El relleno es `energyGaugePct = clamp(round(avgEnergy7*10), 0, 100)`; el color del arco: `>= 70` verde, `>= 40` ambar, resto rojo. Debajo el valor `avgEnergy7.toFixed(1) /10` y las `EnergyStars`.

### Comparativa de fotos (condicional)
Solo se renderiza si `photoCheckIns.length >= 2` y tanto el check-in base como el de comparacion tienen `front_photo_url`.
- Dos `<select>`: "Check-in base" (`baseId`) y "Comparar con" (`compareToId`). Las opciones listan cada check-in con foto: `d MMM yyyy · {peso} kg`.
- Inicializacion (`useEffect`): por defecto base = primer check-in con foto, comparar = ultimo; preserva la seleccion previa si sigue siendo valida.
- **Deltas entre seleccion** (solo si base != comparar): `Δ Peso` (peso de comparar − peso de base, con signo, 1 decimal) y `Δ Energia` (resta de `energy_level`).
- Boton "Abrir comparativa" (deshabilitado si falta alguna foto o si base == comparar) abre `PhotoComparisonSlider` (modal): slider arrastrable que superpone foto "antes" (base) y "despues" (comparar) con clip-path segun la posicion del slider, con las fechas como etiquetas. Es solo visual, no toca backend.

### Linea de tiempo de check-ins
- Lista vertical de **todos** los check-ins (`sortedDesc`, mas recientes arriba). Por cada uno:
  - Punto coloreado segun `energyColor(energy_level)`.
  - Fecha/hora (`d MMM yyyy · HH:mm`) y peso en kg si existe.
  - Energia como `EnergyStars`.
  - Foto (`front_photo_url`) como boton: al hacer click setea `dotDetail` con `{ weight, energia, photo, notes }` → abre el modal de detalle.
  - Notas (`notes`), o "Sin notas" en cursiva si no hay.

---

## 4.4 Panel de Progreso Unificado (graficas conmutables)

Vive inline en `ClientProfileDashboard.tsx` debajo de `ProgressBodyCompositionB6`. Una sola `GlassCard` con un toggle de pildoras (`chartTabs`) que cambia `activeChart` (estado local, default `'peso_composicion'`). Lleva un `AppOnlyBadge` ("Graficas tactiles: desliza el dedo sobre el grafico en la app de EVA").

**Peso objetivo inline:** formulario con input numerico (0.1 paso, 30-300) que al enviar parsea el valor y llama a la server action `updateClientGoalWeight(client.id, newVal)` (newVal = `null` si no es finito o <= 0). Actualiza `goalWeight` local. El backend (`updateClientGoalWeight` service → `updateClientGoalWeightForCoach`) hace `UPDATE clients SET goal_weight_kg = ... WHERE id = clientId AND coach_id = coachId` con scope de org aplicado (`applyClientScope`); resuelve `coachId` desde `auth.getUser()` y el scope desde `getCoachClientScope`. El `goalWeight` se dibuja como `ReferenceLine` en la grafica de peso.

Las 7 pestanas (`chartTabs`):

| `id` | Etiqueta | Que mide | Fuente / periodo | Empty-state |
|------|----------|----------|------------------|-------------|
| `peso_composicion` | Peso & Comp. | Peso (kg, eje izq) + Energia 1-10 (eje der, linea punteada) en el tiempo, con linea de referencia del peso objetivo | `weightData` (todos los check-ins, ordenados asc); periodo = historico de check-ins | "No hay suficientes datos de check-in" si `weightData.length <= 1` |
| `tasa_cambio` | Tasa Cambio | Cambio **neto** de peso entre check-ins consecutivos (`cambio_peso`), en barras. Color por magnitud: > 0.6 kg rojo, 0.2-0.6 verde, resto ambar | `weightData.slice(1)` (excluye el primero que es delta 0); periodo = historico de check-ins | "No hay suficientes datos para calcular la tasa de cambio" |
| `fuerza` | Fuerza (1RM) | 1RM estimado (formula Epley `peso*(1+reps/30)`) de bench/squat/deadlift en el tiempo, una linea por ejercicio | `strengthData` derivado de `data.workoutHistory`: detecta ejercicios clave por nombre (`bench press`/`squat`/`deadlift` + sinonimos ES), toma el max 1RM por dia; periodo = ventana de workoutHistory (548d) | "No hay suficientes datos de entrenamiento para calcular 1RM" |
| `volumen` | Volumen | Volumen (tonelaje = `weight_kg * reps_done`) por dia de entrenamiento, barra + linea | `tonnageData` derivado de `data.workoutHistory`, agregado por fecha; periodo = ventana de workoutHistory (548d) | "No hay suficientes datos de entrenamiento para mostrar el volumen" |
| `distribucion_macros` | Macros | Proteina/Carbs/Grasas **consumidos** por dia, barras apiladas | `nutritionHistory` (de `data.nutritionLogsEnriched`/`nutritionLogs`); periodo = ventana de logs de nutricion del servidor | "Sin registros nutricionales recientes" |
| `adherencia_calorica` | Adherencia | Calorias reales consumidas por dia (barra verde si `compliancePct >= 80`, roja si no) + linea de objetivo calorico | `nutritionHistory`; objetivo `targetCalories` del plan activo (`daily_calories`/`target_calories`) | "Sin registros para medir adherencia" |
| `balance_neto` | Balance Neto | Diferencial calorico diario (`consumido − objetivo`, barra roja si superavit, azul si deficit) + linea acumulada del balance | `accumulatedData` (suma corrida del `diferencial` de `nutritionHistory`) | "Sin datos de balance calorico" |

Datos de apoyo que se calculan en el dashboard:
- `weightData`: map de check-ins a `{ date (DD mmm), peso, energia (= energy_level ?? 0), cambio_peso (delta vs anterior, 2 dec) }`.
- `strengthData`/`tonnageData`: recorren `data.workoutHistory` → `workout_blocks` → `workout_logs` (usando `weight_kg`, `reps_done`); acumulan `totalVolume`/`totalWorkouts` (con estos se calcula tambien una "densidad de entrenamiento" estimando 60 min por sesion, usada en otra pestana).
- `nutritionHistory`: por cada log de nutricion calcula comidas completadas (`is_completed`), `compliancePct`, `consumed_*` y `target_*` (los `*_at_log` congelados al momento del log), `diferencial` y `isAdherent` (`pct >= 80`).
- `accumulatedData`: `nutritionHistory` con campo `acumulado` (running sum del diferencial).
- `targetCalories`/`targetProtein`/`targetCarbs`/`targetFats`: del plan de nutricion activo.

---

## 4.5 Modal de detalle de un punto de medicion

Estado `dotDetail: Record<string, unknown> | null`. Se abre desde **dos lugares**: al hacer click en un punto de la grafica de peso, o al hacer click en la foto de un item de la linea de tiempo. En ambos casos se setea `{ weight, energia, photo, notes }` del check-in.

El modal (`Dialog`) muestra:
- Titulo "Check-in".
- Peso en kg (si existe).
- `EnergyStars` con `energia` (solo si es numero).
- Foto ampliada (`photo`) en `<Image unoptimized>` (URL firmada) si existe.
- Notas (`notes`) si existen.

Es solo lectura; no dispara ninguna accion ni escritura en backend. Se cierra con `onOpenChange` (setea `dotDetail = null`).

---

## 4.6 Resumen de interacciones con backend

- **Lectura:** todo (check-ins con `*` + fotos firmadas, workoutHistory, nutritionLogs, plan activo, compliance, intake con `height_cm`, `goal_weight_kg`) llega prefetcheado por `getClientProfileData`. La pestana no hace fetch adicional al montarse.
- **Escritura:** unica mutacion = **peso objetivo** via server action `updateClientGoalWeight` → `UPDATE clients.goal_weight_kg` (coach-scoped + org-scoped, columna `goal_weight_kg` editable por el coach). Todo lo demas (regresion, IMC, energia media, deltas, 1RM, volumen, adherencia, balance) se **calcula en el cliente** a partir de los datos recibidos; nada se persiste.
