# Análisis Completo: WeeklyPlanBuilder — Mejoras y Rediseño

## Context

El coach necesita una herramienta de construcción de planes de entrenamiento que sea potente, rápida de usar y que aproveche la biblioteca de ejercicios con GIFs. Actualmente el componente `WeeklyPlanBuilder` funciona pero tiene deuda de UX, arquitectura monolítica y carece de varias características que coaches profesionales esperan en 2025/2026.

---

## 1. PROBLEMAS ARQUITECTURALES

### 1.1 Componente Monolítico
- **Archivo**: `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx` — **1090 líneas en un solo archivo**
- Contiene 3 sub-componentes inline: `SortableBlock`, `DayColumn`, `WeeklyPlanBuilder`
- 15+ variables de estado con `useState` independientes → difícil de mantener
- Sin `useReducer` para el estado complejo de los días/bloques
- Mezcla de lógica de negocio, UI y transformación de datos en el mismo lugar

**Solución**: Dividir en módulos:
```
src/app/coach/builder/[clientId]/
├── WeeklyPlanBuilder.tsx         (orquestador, ~200 líneas)
├── components/
│   ├── DayColumn.tsx
│   ├── ExerciseBlock.tsx         (renombrado de SortableBlock)
│   ├── BlockEditSheet.tsx        (el Sheet de edición de sets/reps)
│   ├── ProgramConfigHeader.tsx   (nombre, semanas, fechas)
│   └── DayRestToggle.tsx         (nuevo: marcar día de descanso)
├── hooks/
│   ├── usePlanBuilder.ts         (reducer + lógica de estado)
│   └── useDragAndDrop.ts
└── actions.ts                    (ya separado, OK)
```

### 1.2 Sin Autosave / Pérdida de Trabajo
- Si el coach cierra accidentalmente la pestaña, **pierde todo el trabajo no guardado**
- No hay borrador local ni indicador de cambios no guardados

**Solución**:
- Autosave de borrador en `localStorage` con debounce de 3s
- Indicador visual "Cambios sin guardar" en el header
- Restauración de borrador al reabrir si existe

### 1.3 Sin Undo/Redo
- No hay historial de acciones; un drag accidental no se puede deshacer
- Con DnD esto es especialmente crítico

**Solución**:
- Stack de historial (últimas 20 acciones) usando el reducer
- Atajos `Ctrl+Z` / `Ctrl+Shift+Z`
- Botón de undo visible en la toolbar

### 1.4 Guardado Full-Replace Destructivo
- Cada save: DELETE todos los workout_plans del programa → INSERT desde cero
- Riesgo: si falla a mitad, el programa queda en estado inconsistente
- No hay transacción explícita (aunque Supabase usa transacciones implícitas)

**Solución**: Usar upsert selectivo (comparar cambios y solo actualizar lo que cambió), o al menos envolver en una función RPC de Supabase que garantice atomicidad.

---

## 2. PROBLEMAS DE UI/UX — BUILDER (ESCRITORIO)

### 2.1 Layout del Board en Desktop
**Problema actual**: Las 7 columnas en scroll horizontal funcionan pero en pantallas de 13-14" solo caben 2-3 columnas visibles, lo que hace difícil comparar días.

**Solución propuesta** — Layout de 3 zonas:
```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Nombre programa | Semanas | Guardar | Undo | Templates │
├───────────────┬─────────────────────────────────────────────────┤
│  CATÁLOGO     │  BOARD (scroll horizontal interno)              │
│  (340px fija) │  Lun | Mar | Mié | Jue | Vie | Sáb | Dom        │
│               │  ←─────────── scroll ──────────────→            │
│  [Buscar]     │                                                  │
│  [Filtros]    │  Cada columna tiene su propio scroll vertical   │
│               │                                                  │
│  Lista con    │                                                  │
│  GIF thumb    │                                                  │
└───────────────┴─────────────────────────────────────────────────┘
```

Cambios concretos:
- Catálogo siempre visible en desktop (no toggle) — la info más importante para el coach
- Ancho fijo de columna de día: `min-w-[220px]` con `max-w-[260px]` 
- Las columnas de días tienen `overflow-y-auto max-h-[calc(100vh-120px)]`
- Separador visual entre el catálogo y el board (border + shadow)

### 2.2 Exercise Cards — Sin Identidad Visual
**Problema**: Los cards de ejercicio en los días son texto plano — difícil de escanear visualmente cuando hay 8+ ejercicios en un día.

**Mejora propuesta** por card:
```
┌─ ⋮ ────────────────────────────────── [✎] [✕] ─┐
│ [GIF 40x40]  Sentadilla Trasera                  │
│  CUÁDRICEPS  •  3×8-12  •  90s rest              │
│              ████░░░░  RIR 2   80 kg             │
└─────────────────────────────────────────────────┘
```

- **GIF thumbnail** (40×40px, lazy-loaded) como identificador visual rápido
- **Barra de color** izquierda (2px) según grupo muscular (colores ya definidos en la app)
- **Stats inline**: sets×reps, rest_time, peso objetivo — sin abrir el sheet
- **Edición inline de sets/reps**: click en el número abre un mini input inline, sin abrir el sheet completo para cambios simples
- Badge de grupo muscular con color

### 2.3 Catálogo — Sin GIFs, Sin Recientes, Sin Favoritos
**Problema**: El catálogo lista texto + muscle_group. Los GIFs existen pero no se usan en el catálogo.

**Mejoras**:
- **Sección "Recientes"** (últimos 8 ejercicios usados, guardados en localStorage)
- **Sección "Favoritos"** del coach (toggle star, guardado en Supabase o localStorage)
- **GIF thumbnail** (48×48px) en cada item del catálogo — hace la selección mucho más rápida
- **Hover preview**: al hacer hover sobre un ejercicio del catálogo, mostrar GIF en tooltip a la derecha (evita abrir modal)
- **Filtro por equipo** (equipment) además del grupo muscular actual
- **Vista grid** alternativa (2 columnas con GIFs grandes) para modo "explorar"

### 2.4 Sin Días de Descanso Marcados
**Problema**: No hay forma de marcar un día como "Descanso" explícitamente; días vacíos son ambiguos.

**Solución**:
- Botón "Marcar como descanso" en cada columna vacía
- Visual diferente para día de descanso (fondo más oscuro, icono de luna/ZZZ)
- Indicador de carga semanal: debajo del título de cada día, barra de progreso que muestra volumen total (sets × ejercicios)

### 2.5 Sin Supersets / Circuitos
**Problema**: Los ejercicios son siempre independientes. La mayoría de programas avanzados usan supersets.

**Solución** (V1 simple):
- Botón "Agrupar con siguiente" en cada bloque
- Bloques agrupados muestran un bracket visual izquierdo y se ejecutan sin descanso entre sí
- Indicador "SS" (superset) o "CX" (circuit) en el card

### 2.6 Sin Notas por Día / Fase del Entrenamiento
**Solución**:
- Campo de nota opcional por día (ej: "Enfoque en explosividad", "Deload semana 4")
- Secciones opcionales dentro de un día: Calentamiento / Principal / Enfriamiento (con drag entre secciones)

---

## 3. PROBLEMAS DE UI/UX — BUILDER (MOBILE)

### 3.1 Navegación por Tabs — Poco Intuitiva
**Problema**: 7 tabs horizontales (Lun/Mar/Mié...) en mobile son difíciles de tocar y no muestran contenido de un vistazo.

**Solución propuesta** — Vista de acordeón o scroll vertical:
```
Mobile Layout alternativo:
─────────────────────────────
 Lunes — Pecho + Tríceps  ↕
  ┌─ Press Banca 3×8 ─────┐
  └─ Fondos 3×12 ──────────┘
─────────────────────────────
 Martes — Espalda  ↕
  (colapsado, tap para abrir)
─────────────────────────────
 [+ Agregar ejercicio]
─────────────────────────────
```

O mantener tabs pero añadir:
- **Dot indicator** en cada tab mostrando número de ejercicios
- **Swipe lateral** entre días (no solo tab tap)
- Preview del día en el tab (grupo muscular con emoji)

### 3.2 Bottom Sheet del Catálogo — Mejorable
**Estado actual**: Sheet que sube desde abajo, draggable entre 30-85vh.

**Mejoras**:
- Cuando el sheet está al mínimo (30vh), mostrar solo barra de búsqueda + grid de grupos musculares como shortcuts
- Cuando se expande, mostrar lista completa con GIF thumbnails
- **Tap en ejercicio del catálogo** → añade al día actual **inmediatamente** + haptic + micro-animación del card entrando al día
- "Ejercicios recientes" visible antes de buscar (frecuentemente usados)

### 3.3 Edición de Bloques — Sheet Demasiado Largo
**Problema**: El sheet de edición tiene todos los campos en vertical (sets, reps, peso, tempo, RIR, descanso, notas) — mucho scroll en mobile.

**Solución**: Edición en 2 pasos:
1. **Quick edit** (default): Solo sets, reps, peso objetivo — lo más común
2. **Advanced** (toggle "Más opciones"): tempo, RIR, descanso, notas
- Inputs de número con botones +/- para sets (1-6 rango común)
- Teclado numérico automático para peso/reps

### 3.4 Sin Feedback Visual de Drag en Mobile
- Drag en touch necesita delay para no conflictuar con scroll
- Actualmente `TouchSensor delay: 300ms` — correcto pero sin feedback visual durante ese delay

**Mejora**: Mostrar "ring" o efecto glow alrededor del card durante los 300ms de delay antes de activar drag.

---

## 4. PROBLEMAS DE FLUJO DEL COACH

### 4.1 Sin Biblioteca de Templates en el Builder
**Problema**: Los templates existen en la DB (`client_id = null`) pero el builder no permite cargar/aplicar templates directamente.

**Solución**:
- Panel lateral "Cargar Template" (botón en header)
- Lista de templates del coach con preview (días y grupos musculares)
- "Aplicar template" reemplaza el plan actual (con confirmación)
- "Copiar día de template X" para añadir días individuales

### 4.2 Sin "Copiar Día"
**Solución**: Botón en header de cada columna "Copiar día" → aparece popover con checkboxes de los otros días para pegar.

### 4.3 Sin Historial del Ejercicio con Este Cliente
Cuando el coach está construyendo y elige un ejercicio, no sabe si el cliente ya lo ha hecho, con qué peso, o cuántas veces.

**Solución**: En el sheet de edición del bloque, mostrar (si existe):
- "Última vez con este cliente: 3×8 @ 70kg" (en gris, del workout_logs)
- Esto ayuda al coach a poner el target_weight_kg realista

### 4.4 Sin Visualización de Semanas del Programa
El campo `weeks_to_repeat` existe pero el builder no muestra visualmente cuánto dura el programa.

**Solución**: En el header, mini-timeline visual:
```
Semana 1 | Semana 2 | Semana 3 | Semana 4    [Inicio: 14 Abr]  [Fin: 11 May]
```

### 4.5 Sin Indicador de Balance Muscular
El coach no tiene feedback visual sobre si el plan está balanceado (ej: demasiado pecho, sin espalda).

**Solución**: Widget de balance en el header o sidebar:
- Radar chart pequeño (ya usan Recharts) mostrando volumen por grupo muscular
- Actualiza en tiempo real al añadir/quitar ejercicios
- Color warning si un grupo está sobrerepresentado

---

## 5. RESPONSIVIDAD — MEJORAS ESPECÍFICAS

### 5.1 Breakpoints Actuales vs Necesarios
- App usa `md:` (768px) como único punto de quiebre — muy poco
- Necesita: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)

### 5.2 iPad / Tablet (768-1024px)
**Problema**: La UI de escritorio intenta mostrarse en tablet pero las 7 columnas no caben.
**Solución**: Layout específico para tablet:
- Mostrar 3-4 días a la vez con scroll horizontal
- Catálogo como panel colapsable (toggle, no siempre visible)
- Touch-optimized: targets mínimos de 44px

### 5.3 Desktop Grande (1440px+)
**Solución**: Mostrar todas las 7 columnas sin scroll horizontal — cada una un poco más ancha, con GIF thumbnails más grandes.

### 5.4 Scroll en iOS Safari
- `overflow-y-auto` sin `-webkit-overflow-scrolling: touch` puede dar problemas
- Asegurar scroll suave en listas de ejercicios dentro de columnas

---

## 6. MEJORAS DE EJERCICIOS Y BIBLIOTECA

### 6.1 GIFs en el Builder — Totalmente Desaprovechados
Los ejercicios tienen `gif_url` pero en el builder solo son accesibles abriendo el catálogo y haciendo click en el preview.

**Plan de integración de GIFs en el builder**:
- **Card en día**: thumbnail 40×40px (lazy load con blur placeholder)
- **Catálogo lista**: thumbnail 48×48px izquierda del nombre
- **Sheet de edición**: imagen/GIF grande (200×200px) en el top del sheet
- **Hover en desktop**: al hover sobre card del día, mostrar GIF animado en tooltip
- **Click en thumbnail**: abre modal de GIF en pantalla completa (ya existe `expandedGif` state)

### 6.2 Sin Contador de Volumen por Día
**Solución**: Debajo del título de cada día, mostrar:
- Número de ejercicios: "6 ejercicios"
- Total de series: "18 series"
- Grupos musculares únicos: "Pecho, Hombro, Tríceps" (badges de colores)

### 6.3 Personalización de Nombres de Días
Actualmente los títulos son editables inline pero no hay sugerencias.

**Mejora**: Al hacer click en el título del día:
- Sugerencias rápidas: "Push", "Pull", "Piernas", "Full Body", "Cardio", "Descanso"
- Badges de grupos musculares del día se auto-sugieren como nombre

---

## 7. MEJORAS DE DISEÑO VISUAL

### 7.1 Color Coding por Grupo Muscular
Definir paleta (puede mapearse a los grupos existentes):
```
Pecho:     #3B82F6 (azul)
Espalda:   #10B981 (verde)  
Piernas:   #F59E0B (ámbar)
Hombros:   #8B5CF6 (violeta)
Brazos:    #EF4444 (rojo)
Core:      #06B6D4 (cyan)
```
Usar como: borde izquierdo del card, punto en el badge, fondo del thumbnail.

### 7.2 Estado Vacío Mejorado
**Actual**: Día vacío muestra solo "Suelta aquí" o similar.
**Propuesta**:
```
┌───────────────────────┐
│                       │
│   + Añadir ejercicio  │ ← botón visible siempre
│                       │
│  ─ o ─                │
│                       │
│  [Día de descanso]    │
└───────────────────────┘
```

### 7.3 Micro-Animaciones
- Card entering: slide-in desde arriba (ya tienen Framer Motion)
- Card leaving: fade + scale-down (ya tienen AnimatePresence)
- **Añadir**: counter increment animation en el número de ejercicios por día
- **Añadir**: pulse en el botón guardar cuando hay cambios no guardados
- **Añadir**: shake suave si se intenta guardar con validación fallida

### 7.4 Header más Compacto y Útil
**Actual**: Header con configuración colapsable que mezcla nombre + semanas + botón guardar.
**Propuesta**:
```
← Volver    [Nombre del programa]    [Cambios sin guardar ●]    [Deshacer ↩] [Guardar]
            4 semanas · Lun-Vie · 5 días                        [Templates] [···]
```
- Estado de guardado siempre visible (no requiere expandir)
- Número de días activos auto-calculado

---

## 8. MEJORAS TÉCNICAS / PERFORMANCE

### 8.1 Virtualización del Catálogo
Si hay 200+ ejercicios, renderizar todos es costoso. Usar `react-virtual` o `@tanstack/react-virtual` para la lista del catálogo.

### 8.2 Memoización
- `useCallback` en handlers de drag (actualmente recreados en cada render)
- `useMemo` en el cálculo de `filteredExercises`
- `React.memo` en `DayColumn` y `SortableBlock`

### 8.3 Tipos TypeScript
- Eliminar los `any` en `activeData`
- Tipar correctamente el payload de DnD
- Crear `builders.types.ts` para tipos del builder

### 8.4 Error Boundaries
- Envolver el board en un `ErrorBoundary` para que un error en un día no rompa todo el builder

---

## 9. FLEXIBILIDAD TOTAL EN ESTRUCTURA DEL PROGRAMA

### 9.1 Duración del Programa — Más Allá de "Semanas"

**Problema actual**: El campo `weeks_to_repeat` fuerza al coach a pensar en semanas. Esto es rígido para casos reales como:
- Un programa de **10 días** de preparación pre-competencia
- Un **reto de 30 días** de cardio + fuerza
- Un programa **indefinido** (el coach va actualizando semana a semana)
- Un programa de **deload de 5 días** entre bloques

**Propuesta — Modo de duración configurable**:
```
┌──────────────────────────────────────────────┐
│  Duración del programa:                       │
│  ○ Por semanas    ● Por días exactos          │
│                                               │
│  [  10  ] días   (del 14 Abr al 24 Abr)      │
│                                               │
│  ○ Sin fecha límite (indefinido)              │
└──────────────────────────────────────────────┘
```

Cambios en DB: añadir campo `duration_days` a `workout_programs` como alternativa a calcular desde weeks. La UI decide qué modo usar y persiste el tipo de duración.

### 9.2 Ciclos No Ligados al Calendario Semanal

**Problema**: El modelo actual asume que los días 1-7 son Lun-Dom. Un coach que hace "Push/Pull/Legs × 2 = ciclo de 6 días" necesita que el ciclo se repita independientemente del día de semana.

**Propuesta — Modo "Día del Ciclo" vs "Día de la Semana"**:
- **Modo actual (Semana)**: Día 1 = Lunes, Día 7 = Domingo. El cliente lo hace el lunes de cada semana.
- **Modo ciclo**: Día 1, Día 2, Día 3... el cliente los hace consecutivamente con sus propios descansos. Si el ciclo es de 3 días, se repite: D1-D2-D3-Descanso-D1-D2-D3...

En la UI, el coach puede seleccionar:
```
Estructura:  ○ Semanal (Lun-Dom)   ● Ciclo personalizado
Duración del ciclo: [3] días activos + [1] día de descanso
```

### 9.3 Patrones de Semana A/B (Alta/Baja)

Muy común en periodización ondulante: semana A = alta intensidad, semana B = volumen moderado.

**Propuesta**:
- Toggle "Programa con semanas alternas (A/B)"
- El builder muestra dos boards paralelos: "Semana A" y "Semana B"
- El sistema alterna automáticamente según la semana actual del programa

### 9.4 Fases Dentro de un Programa

Muchos coaches estructuran programas en bloques: "Semanas 1-4: Volumen / Semanas 5-8: Intensidad".

**Propuesta (V1 simple)**:
- El coach puede añadir "Fases" (tags de tiempo) al programa
- Cada fase tiene su nombre y duración
- Visual en el header como mini-timeline:
```
[ Fase 1: Adaptación 3s ] [ Fase 2: Hipertrofia 4s ] [ Fase 3: Fuerza 4s ]
```
- No cambia los ejercicios de cada fase en V1 (solo es metadata visual), en V2 cada fase podría tener su propio plan de ejercicios.

### 9.5 Asignación Masiva / Clonación Rápida

**Problema**: Para asignar el mismo programa a 5 clientes distintos, el coach debe entrar al builder 5 veces.

**Propuesta**:
- Desde la template, botón "Asignar a clientes" → multi-select de clientes
- "Clonar programa" con nombre nuevo (desde la lista de templates o desde el perfil de un cliente)
- "Usar como base para otro cliente" → abre el builder con el plan cargado pero sin asignar

### 9.6 Ajustes por Cliente sobre una Base Común

**Scenario**: Coach tiene un template "Fuerza 4 días" y cada cliente lo hace con pequeñas variaciones (uno hace más peso, otro reemplaza un ejercicio por una variante).

**Propuesta**:
- Al asignar un template a un cliente, el coach puede marcar ejercicios como "modificado para este cliente" (badge azul)
- Los ejercicios base del template están en gris claro, los modificados en blanco normal
- Al actualizar el template base, el sistema **no sobreescribe** los ejercicios marcados como modificados

### 9.7 Reglas de Progresión Automática (Auto-Progression)

**Propuesta**:
- Por bloque, el coach puede activar "Progresión automática"
- Configurar: "+2.5kg por semana" o "+1 rep por sesión" hasta un límite
- En la vista del cliente, el peso sugerido se calcula automáticamente según la semana del programa
- El coach ve en el builder si un bloque tiene progresión activa (badge "↑")

### 9.8 Notas Globales del Programa

**Propuesta**:
- Campo de notas para el programa completo (no solo por ejercicio)
- Visible para el cliente en la vista de inicio del workout
- Ejemplos: "Este bloque es de adaptación, no te preocupes por el peso", "Recuerda: calentamiento de 10 min antes de empezar"

### 9.9 Preview del Programa Antes de Asignar

**Propuesta**:
- Modal "Vista previa" del programa antes de asignarlo al cliente
- Muestra una tarjeta de resumen: días, ejercicios, grupos musculares, duración
- Coach puede compartir esta preview como imagen (screenshot del resumen) 

### 9.10 Inicio del Programa Flexible

**Problema**: El `start_date` se asigna al guardar pero no hay forma visual clara de ajustarlo.

**Propuesta**:
- Date picker prominente en el header del builder (siempre visible, no colapsado)
- Opción "Empieza hoy" como default con un click
- Opción "Sin fecha de inicio" (el cliente empieza cuando quiera desde su dashboard)
- El cliente puede ver en su dashboard "Tu programa empieza en X días"

---

## 10. PRIORIDAD DE IMPLEMENTACIÓN

### Fase 1 — Quick Wins (alto impacto, baja complejidad)
1. GIF thumbnails en cards del día y catálogo
2. Color coding por grupo muscular (borde izquierdo del card)
3. Stats inline en cards (sin abrir sheet): sets×reps + rest
4. Sección "Recientes" en catálogo
5. Autosave en localStorage (borrador)
6. Copiar día
7. Contador de volumen por día (ejercicios, series, grupos)
8. Duración en días exactos + opción "Sin fecha límite"
9. Date picker de inicio prominente + botón "Empieza hoy"
10. Notas globales del programa (visibles al cliente)

### Fase 2 — UX Media (impacto alto, complejidad media)
1. Refactor: dividir WeeklyPlanBuilder en archivos separados
2. useReducer para el estado de días/bloques
3. Mobile: swipe entre días + bottom sheet mejorado
4. Quick edit inline (sets/reps sin abrir sheet)
5. Días de descanso marcados visualmente
6. Historial del cliente en sheet de edición (último peso usado)
7. Template library en el builder
8. Asignación masiva / clonación rápida
9. Preview del programa antes de asignar
10. Modo ciclo personalizado (no ligado a Lun-Dom)

### Fase 3 — Features Avanzados (alta complejidad)
1. Supersets / agrupación de ejercicios
2. Undo/redo stack
3. Balance muscular radar chart en tiempo real
4. Progresión automática por bloque (+kg/semana)
5. Semanas A/B alternas
6. Fases dentro de un programa (Volumen → Fuerza → Peaking)
7. Secciones dentro de días (Calentamiento / Principal / Enfriamiento)
8. Ajustes por cliente sobre base común (template con overrides)
9. Export/print del programa

---

## Archivos Clave a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx` | Refactor + split en componentes |
| `src/app/coach/builder/[clientId]/DraggableExerciseCatalog.tsx` | GIF thumbnails, recientes, favoritos |
| `src/app/coach/builder/[clientId]/page.tsx` | Pasar historial del cliente al builder |
| `src/app/coach/builder/[clientId]/actions.ts` | Atomicidad, soporte días exactos, sin fecha |
| `src/lib/database.types.ts` | Nuevos campos: `duration_days`, `duration_type`, `cycle_length`, `program_notes`, `program_phases` |
| DB migration | Añadir columnas a `workout_programs` para flexibilidad de duración y ciclos |

## Verificación

- Probar en mobile (iOS Safari + Chrome Android)
- Probar en tablet (iPad 768px)
- Probar drag & drop en touch
- Verificar que los GIFs no bloquean el hilo principal (lazy load)
- Verificar que el autosave no interfiere con el guardado manual
- Verificar que el builder funciona sin conexión (borrador en localStorage)
