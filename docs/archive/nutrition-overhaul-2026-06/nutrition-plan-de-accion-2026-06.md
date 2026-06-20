# 🥗 Nutrición EVA — Qué hacer, qué no, y dónde dejarla (Junio 2026)

> Informe corto y al grano para los dos socios. Poco idioma técnico.
> Acompaña a la auditoría completa: [`nutrition-audit-2026-06.md`](./nutrition-audit-2026-06.md).

---

## 🎯 ¿Dónde dejo la nutrición? (mi decisión)

**Hoy el problema no es que falte nutrición. Es que está en 9 lugares distintos y ninguno es "la casa".** El coach tiene que saltar entre 5 pantallas para revisar a un alumno, y los números no coinciden entre una y otra.

### Mi propuesta: **UNA casa, accesos directos a la casa**

La pestaña **"Nutrición"** de la ficha del alumno (que ya existe) pasa a ser **el único hogar**. Todo lo demás (el anillo del Overview, el puntito rojo, el KPI del dashboard, los gráficos escondidos) se convierte en un **acceso directo que te lleva a esa pestaña** — no en otra versión del dato.

Dentro de la pestaña Nutrición, **3 zonas claras, de arriba hacia abajo**:

```
┌─────────────────────────────────────────────┐
│  🍎 NUTRICIÓN DE [Alumno]        [Editar plan]│
├─────────────────────────────────────────────┤
│                                               │
│  📊 ZONA 1 · PROGRESO  (lo que pediste)       │
│  ┌───────┐  Cumplimiento  ↑ +12% vs sem ant.  │
│  │  78%  │  Racha: 5 días 🔥                   │
│  │ anillo│  Prot ▓▓▓▓▓░  Carb ▓▓▓░░  Gra ▓▓▓░ │
│  └───────┘  Calendario 30 días: 🟩🟩🟨🟩⬜🟩🟩 │
│                                               │
├─────────────────────────────────────────────┤
│  🍽️ ZONA 2 · PLAN Y QUÉ COMIÓ                 │
│  Hoy: 4/5 comidas · ayer: 5/5 · [ver semana]  │
│  Plan activo: "Definición 1800kcal" [abrir]   │
│                                               │
├─────────────────────────────────────────────┤
│  ⚠️ ZONA 3 · ALERTAS Y CONTEXTO               │
│  • Adherencia bajó <60% esta semana           │
│  • Último check-in: "con hambre en la tarde"  │
└─────────────────────────────────────────────┘
```

**Por qué así:** el coach entra UNA vez, ve el progreso primero (lo más importante), después el plan, después las alertas. Cero saltos, un solo número de cumplimiento, una sola verdad.

**Qué pasa con los otros 8 lugares:**
- El **Overview** (resumen del alumno) muestra un mini-resumen ("Nutrición 78% ↑") que es un **botón** → abre la pestaña Nutrición. No calcula su propio número.
- El **dashboard** del coach (lista de alumnos) muestra el mismo 78% como semáforo, calculado igual.
- El puntito rojo "nutri en riesgo" **sale de adentro de la tarjeta de entrenamiento** (hoy está sepultado en el dominio equivocado) y vive en su zona de alertas.
- Los gráficos de nutrición que hoy están escondidos bajo el toggle de "composición corporal" en la pestaña Progreso → **se mueven a la Zona 1**.

---

## 👀 Lo que pediste: que el coach vea el progreso del alumno en nutrición

**Buena noticia: la data ya está, no hay que construirla.** El componente de la pestaña Nutrición ya recibe todo esto:
- cumplimiento día por día (objetivo vs lo registrado),
- racha de días, promedio de la semana, promedio del mes,
- comparación con la semana anterior (↑/↓),
- calendario de 30 días, macros de hoy, check-ins recientes, historial de planes.

**El problema:** está mezclado en una pantalla gigante de ~1.400 líneas con 12 tarjetas sin orden, y el % de cumplimiento se calcula de **dos maneras distintas** en partes diferentes de la app → muestran números que no coinciden para el mismo alumno, y arriba les pusimos globitos de "ojo, esto se calcula distinto" 😬.

**Lo que hay que hacer (chico, alto impacto):**
1. **Un solo cálculo de cumplimiento** para toda la app (borrar la fórmula duplicada y los globitos de disculpa).
2. **Subir el progreso al tope** de la pestaña (Zona 1 del dibujo de arriba): anillo grande + tendencia + racha + macros de hoy + calendario 30 días.
3. **Renombrar "consumido" → "cumplimiento del plan (estimado)"**, porque hoy el número no es lo que el alumno comió de verdad, es "cuántas comidas marcó como hechas". Decirlo honesto evita problemas legales y de confianza.

Esto es **Fase 0**: ordenar lo que ya tienes. Semanas, no meses.

---

## ✅ HACER SÍ — lo que no es opcional

Estas cosas te frenan ventas, te exponen legalmente, o corrompen datos. No son "nice to have".

| | Qué | Por qué te importa (en simple) | Tamaño |
|---|---|---|---|
| 1 | **Un solo número de cumplimiento** | Hoy 4 pantallas muestran 4 números distintos del mismo alumno. Mata la confianza del coach. | Chico |
| 2 | **Decir la verdad: "cumplimiento", no "consumido"** | El número no es lo que comió, es lo que marcó. Mentir aquí = riesgo legal (SERNAC) y coach que se da cuenta. | Muy chico |
| 3 | **Candado de seguridad de datos** | Hoy un coach podría, técnicamente, mover datos de alimentos de un coach a otro o al catálogo global. Hay que cerrarlo. | Chico |
| 4 | **Bloquear planes y comidas vacías** | Ya hay 2 alumnos con plan **completamente vacío** sumando registros, y 17 comidas vacías. Nada lo impide hoy. Se cuela en PDFs y en los números. | Mediano |
| 5 | **Asignar plan a un grupo sin romper nada** | Hoy asignar plantilla a un equipo apunta a **TODOS** los alumnos, borra el plan anterior, y si falla a la mitad deja gente **sin plan**. Peligroso con Movida/teams de 300. | Grande |
| 6 | **Consentimiento de datos de salud** | Ley 21.719 (datos de salud, rige dic 2026, multas hasta ~10% de ingresos). Hoy guardamos datos de salud sin pedir permiso formal. | Mediano |
| 7 | **Avisar cuando un recordatorio/cron falla** | Hoy si el cron de recordatorios se cae, nadie se entera. Alumnos dejan de recibir avisos en silencio. | Mediano |
| 8 | **Sacar la nutrición de los 9 rincones → 1 casa** | (la decisión de arriba) Menos soporte, onboarding más corto, coach contento. | Grande |

---

## 🟡 OPCIONAL — cuando haya tiempo/plata o si un cliente lo pide

Suman mucho, pero el negocio no se cae sin ellas. Son las que te hacen **ganar al nutricionista profesional** y diferenciarte.

| | Qué | Por qué la querrías |
|---|---|---|
| A | **Base de alimentos de Chile/Latam verificada + código de barras** | Tu mayor diferenciador real. Ningún competidor gringo tiene comida chilena confiable. Es lo que un nutricionista pregunta primero. |
| B | **Registrar comida con la cámara (código de barras / foto con IA)** | La cámara ya está instalada en la app, sin usar. Es **el** momento que enamora coaches en una demo 2026. |
| C | **Registrar lo que comió de verdad (fuera del plan)** | Hoy solo puede marcar comidas del plan. No puede decir "me comí otra cosa". |
| D | **Micronutrientes (fibra, sodio, azúcar, hierro, calcio…)** | Sin esto, un nutricionista no puede tratar hipertensión, diabetes, embarazo, riñón. Hoy solo hay calorías + 3 macros. |
| E | **Intercambios chilenos como plantilla reutilizable** | Ya tienes el módulo de intercambios (muy bueno), pero no se puede guardar como plantilla. Hacerlo reutilizable. |
| F | **Filtro de alergias / intolerancias** | Que el sistema avise/bloquee si le pones maní a un alérgico. Hoy no existe. |
| G | **Objetivos automáticos desde la evaluación** | Que las calorías salgan solas de peso/masa magra (módulo de composición corporal), no escritas a mano. |
| H | **Conectar Apple Health / Health Connect** | Importar peso automático → menos trabajo manual en el check-in. |

---

## 🔧 MEJORAR — ya existe, pero está a medias

| | Qué existe | Qué le falta |
|---|---|---|
| 1 | Pantalla de nutrición del alumno (la pestaña) | Está sobrecargada (~1.400 líneas, 12 tarjetas). Partir en "ver progreso" y "editar". |
| 2 | App móvil de nutrición | Es solo de lectura. El alumno **no puede** hacer cambios de comida que el coach le permitió, ni usar intercambios. Falta paridad con la web. |
| 3 | Colores de macros | La página usa un set de colores y el dashboard otro. El coach aprende dos idiomas de color. Unificar. |
| 4 | Recetas (Edamam) | Existe en `/coach/recipes` pero **suelta**, no conectada al armador de planes. Conectarla. |
| 5 | Recordatorios push | Disparan aunque el alumno no tenga nada planeado para hoy → entrena a la gente a ignorar las notificaciones. Que solo avise si hay plan. |
| 6 | Racha / logros | Premian "marcar hecho", lo que se puede hacer trampa y a veces da culpa. Hacerla más amable ("5 de 7 días", sin rojo de fracaso). |

---

## 🛑 NO HACER — no gastes energía aquí (por ahora)

| | Qué | Por qué no |
|---|---|---|
| 1 | **Foto con IA que registra sola** (sin que el coach/alumno confirme) | La IA con comida latina acierta 60-75%. Que sea **borrador**, nunca automático. Si no, registras datos malos. |
| 2 | **Sensor de glucosa (CGM), voz, widgets** | Son de la frontera 2026, geniales, pero solo después de tener la base de alimentos y el registro real. Correr antes de caminar. |
| 3 | **Construir tu propia base mundial de alimentos desde cero** | Carísimo y ya existe (USDA, Open Food Facts, FatSecret). Tú aportas la capa **chilena** verificada encima, no todo el mundo. |
| 4 | **Más tarjetas/gráficos nuevos en la ficha** | Ya hay demasiados y no cuajan. Primero ordenar, después agregar. |
| 5 | **Vender "el método de los nutricionistas" tal cual hoy** | Hoy entregas un PDF lindo de intercambios, no el razonamiento clínico completo. O lo construyes (opcionales A-G) o suavizas el mensaje. Vender de más = riesgo SERNAC. |

---

## 🗺️ En qué orden lo haría

1. **Primero (semanas):** toda la columna ✅ HACER SÍ + la casa única (👀 progreso ordenado). Esto **detiene el sangrado** (datos que no cuajan, planes vacíos, riesgo legal) y deja al coach contento.
2. **Después:** los opcionales **A + B + C + D** (comida chilena + código de barras + registro real + micros). Esto es lo que convierte a EVA de "herramienta de coach" en "herramienta que un nutricionista de verdad puede usar". Aquí está el dinero del nicho.
3. **Al final:** intercambios-plantilla, alergias, objetivos automáticos, Apple Health.
4. **Mucho después / si hay tracción:** la frontera (foto IA confirmada, CGM, voz, widgets).

---

### En una frase

> **No te falta nutrición — te sobra desorden.** Junta los 9 rincones en una sola casa (donde el progreso del alumno se ve de una), arregla los 8 fundamentos de la columna "Hacer Sí", y recién ahí invierte en la comida chilena + cámara que te diferencian del resto. En ese orden.
