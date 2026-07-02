# 5. Graficas y analisis (balance muscular)

El builder ofrece un unico panel de analisis numerico: el **Balance Muscular**, implementado en el componente `MuscleBalancePanel`. Es un modal (`Dialog`) que el coach abre desde la barra del builder. Todo el calculo es **100% frontend**, derivado en tiempo real del estado del builder (los dias y bloques que el coach esta editando). No hay ninguna llamada a backend, RPC ni tabla: nada se persiste ni se trae del servidor para este analisis.

---

## 5.1 Como se abre el panel

El panel se controla con el estado local `showBalance` (`useState(false)`) de `WeeklyPlanBuilder`. Hay dos puntos de entrada que lo abren con `setShowBalance(true)`:

- **Boton "Balance"** en la barra de acciones (visible solo en escritorio, con icono `BarChart3`, atributo `data-tour-id="balance-button"`, tooltip "Balance muscular").
- **Item "Balance muscular"** dentro del menu desplegable de acciones (`DropdownMenuItem`, tambien con icono `BarChart3`), pensado para pantallas chicas.

El panel se cierra con `onClose` (`setShowBalance(false)`), que esta cableado a `onOpenChange` del `Dialog`.

El render del modal recibe tres props:

- `open` = `showBalance`
- `onClose`
- `days` = `days` del **builder activo** (ver 5.6).

---

## 5.2 De donde salen los datos: funcion `buildMuscleBalance`

Toda la metrica nace de la funcion pura `buildMuscleBalance(days)`, exportada (solo para tests) desde `MuscleBalancePanel.tsx`. Recibe el arreglo `DayState[]` del estado del builder y devuelve dos mapas:

- `muscleSetMap: Record<string, number>` — total de **series** acumuladas por grupo muscular.
- `muscleExMap: Record<string, number>` — total de **ejercicios** (bloques) contados por grupo muscular.

### Reglas de acumulacion (que cuenta y que no)

La funcion recorre cada dia y cada bloque, aplicando estos filtros antes de sumar:

1. **Dias de descanso excluidos:** si `day.is_rest` es verdadero, el dia completo se salta (no aporta nada).
2. **Solo cuenta volumen de fuerza (regla F4.5 de `specs/movida-entrenamiento`):** para cada bloque se calcula su **tipo efectivo** con `effectiveExerciseType(block, { exercise_type: block.exercise_type })`. Si el tipo efectivo **no es `strength`**, el bloque se ignora. Es decir, bloques de **cardio, movilidad y foam roller no inflan** el volumen muscular.
   - El tipo efectivo se resuelve por prioridad: `exercise_type_override` del bloque > `exercise_type` del ejercicio del catalogo > `'strength'` por defecto. Por eso un bloque **legacy sin tipo** (sin override y sin tipo de catalogo) **resuelve `strength` y si cuenta**.
   - El **override del coach manda** sobre el tipo del ejercicio: un bloque cuyo ejercicio es cardio pero con override `strength` si suma; uno cuyo ejercicio es de fuerza pero con override `mobility` no suma.
3. **Agrupacion por grupo muscular:** para cada bloque que pasa el filtro se toma `block.muscle_group`; si viene vacio/nulo se agrupa bajo la etiqueta literal `'Otro'`.
4. **Acumulado:**
   - `muscleSetMap[grupo] += (block.sets || 0)` — suma las series del bloque (0 si `sets` falta).
   - `muscleExMap[grupo] += 1` — cuenta el bloque como un ejercicio.

> Importante: la suma de series usa el campo `sets` tal cual; no multiplica por reps, carga ni numero de semanas. Es volumen de series por **una** iteracion del dia/semana representada en el estado del builder.

---

## 5.3 Metricas derivadas que el panel calcula

A partir de los dos mapas, el componente deriva (todo en frontend, en cada render):

- **`allMuscles`** — todos los grupos presentes en `muscleSetMap`, ordenados por series descendente y, a igual valor, por orden natural de claves. Es la lista completa que alimenta la lista de barras.
- **`radarMuscles` / `radarData`** — los **primeros 8 grupos** de `allMuscles` (recorte para no saturar el grafico). Cada entrada es `{ muscle, sets }`.
- **`maxSets`** — el maximo de series entre todos los grupos, con piso de `1` (`Math.max(..., 1)`), usado como denominador para los porcentajes de las barras.
- **`totalSets`** — suma de **todas** las series de todos los grupos (`reduce` de los valores de `muscleSetMap`).
- **`activeMuscles`** — grupos con series mayores a 0; su cantidad se muestra como "grupos activos".
- **`pushSets`** (empuje) = `Pectorales` + la **mitad redondeada** de `Hombros` (`Math.round(Hombros / 2)`). La logica considera que el hombro aporta parcialmente al empuje.
- **`pullSets`** (jale/traccion) = `Dorsales` + `Espalda Alta`.
- **`pushPullRatio`** = `pushSets / pullSets` cuando `pullSets > 0`. Casos borde: si `pullSets` es 0 pero `pushSets > 0`, el ratio se fija en `99` (desbalance maximo hacia empuje); si ambos son 0, el ratio es `1` (neutro).

---

## 5.4 Que muestra el panel (visualizacion conceptual)

El encabezado del modal muestra siempre el titulo "Balance Muscular" y un subtitulo numerico con `{totalSets} series totales · {activeMuscles.length} grupos activos`.

A partir de ahi hay dos estados:

### Estado vacio
Si `totalSets === 0` (no hay ningun bloque de fuerza con series), el panel muestra un mensaje de vacio: "Sin ejercicios anadidos". No se renderiza ni grafico ni lista ni aviso.

### Estado con datos
Cuando hay volumen, el panel muestra tres bloques de informacion:

1. **Grafico de radar (telarana):** un `RadarChart` (libreria `recharts`) alimentado por `radarData` (hasta 8 grupos). Cada eje del poligono es un grupo muscular (`PolarAngleAxis` con `dataKey="muscle"`) y el valor radial es la cantidad de series (`dataKey="sets"`). Tiene tooltip que al pasar sobre un punto formatea el valor como `"{n} series"`. El eje radial no muestra ticks ni linea. Conceptualmente da una lectura visual rapida de en que grupos se concentra el volumen y donde hay huecos.

2. **Lista de barras por grupo:** para **cada** grupo de `allMuscles` (no solo el top 8) se renderiza una fila con:
   - Un punto/marcador de color del grupo (color de `getMuscleColor`, ver 5.5).
   - El nombre del grupo muscular.
   - Una barra de progreso cuyo ancho es el porcentaje relativo `pct = (sets / maxSets) * 100` (el grupo con mas series llena la barra; el resto es proporcional).
   - Un valor a la derecha con el detalle textual: si `sets > 0` muestra `"{sets}s · {exCount}ej"` (series y numero de ejercicios); si es 0 muestra un guion.

3. **Aviso de balance empuje/jale (push/pull):** **solo** se renderiza cuando `pushSets > 0` **y** `pullSets > 0` (hay datos de ambos lados). Segun el `pushPullRatio` muestra uno de tres mensajes (ver 5.5).

---

## 5.5 Como ayuda al coach a equilibrar (umbrales y avisos)

El unico aviso accionable es el de **empuje/jale**, basado en `pushPullRatio`, con estos umbrales:

- **`pushPullRatio > 1.5`** (demasiado empuje frente a jale): aviso de desequilibrio — "⚠ Ratio empuje/jale desequilibrado — anade mas trabajo de espalda".
- **`pushPullRatio < 0.65`** (demasiado jale frente a empuje): aviso de desequilibrio — "⚠ Ratio jale/empuje desequilibrado — anade mas pecho y hombros".
- **Entre 0.65 y 1.5 (inclusive en los bordes hacia el rango equilibrado):** estado correcto — "✓ Ratio empuje/jale equilibrado ({pushSets}s / {pullSets}s)", mostrando el desglose de series de cada lado.

Mas alla del aviso de texto, el coach equilibra visualmente leyendo el **radar** (que tan parejo es el poligono) y la **lista de barras** (que grupos tienen series altas y cuales quedan en 0 o cerca). No hay umbrales automaticos para otros grupos: el resto del analisis es informativo, no genera alertas.

---

## 5.6 Alcance del calculo: que conjunto de dias se analiza

El panel recibe `days` del **builder activo** (`activeBuilder`), es decir el estado de la variante que el coach esta viendo en ese momento (variante A o variante B en programas A/B). En programas A/B el balance refleja **solo la variante activa**; no se suman las dos variantes en una sola vista.

El analisis es por la estructura semana/ciclo representada en el estado (los dias del board). No multiplica por `weeks_to_repeat` ni por la duracion del programa: cuenta una sola pasada de los dias actuales. Los dias marcados como descanso (`is_rest`) no aportan. Esto aplica igual en los dos modos del builder (modo `client-plan` en `/coach/builder/[clientId]` y modo `template` en `/coach/workout-programs/builder`), porque el motor `WeeklyPlanBuilder` y el panel son compartidos.

---

## 5.7 Mapeo de colores de grupos musculares: `muscle-colors.ts`

Existe un modulo `muscle-colors.ts` que define un **mapeo de grupos musculares** a un valor de color, consumido por el panel mediante la funcion `getMuscleColor(muscleGroup)`. Esta funcion:

- Resuelve el color del grupo a partir del mapa principal de grupos.
- Cubre **alias legacy** de nombres de categoria antiguos (por ejemplo categorias agrupadas previas), para que data vieja siga teniendo un color asociado.
- Devuelve un valor por defecto cuando el grupo es nulo/desconocido.

Funcionalmente, este mapeo es lo que permite que el marcador de cada fila de la lista de barras (y el relleno de su barra) sea consistente y distinguible por grupo muscular. (Los colores concretos quedan fuera del alcance funcional de este documento.)

---

## 5.8 Otros resumenes numericos

Dentro del propio panel, los unicos resumenes numericos son los ya descritos:

- **Series totales** (`totalSets`) y **grupos activos** (`activeMuscles.length`) en el encabezado.
- **Series por grupo** y **ejercicios por grupo** (`{sets}s · {exCount}ej`) en cada fila de la lista.
- **Desglose empuje/jale** (`pushSets` / `pullSets`) dentro del aviso de balance.

No existe en el builder ninguna otra grafica ni tablero de analisis (no hay totales globales de volumen por semana, ni proyeccion por duracion del programa, ni grafico de tendencia): el balance muscular es el unico modulo de analisis y resumen del builder, y se recalcula en vivo desde el estado, sin tocar el backend.
