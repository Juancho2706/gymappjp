# Plan de Mejoras UI/UX: Dashboards (Coach y Alumno)

Basado en el análisis visual de las interfaces actuales, aquí se presenta un plan estratégico para potenciar la retención de los alumnos y la productividad de los entrenadores, mejorando la experiencia de usuario (UX) y la interfaz gráfica (UI).

---

## 1. Dashboard del Coach

**Estado Actual:**
Interfaz limpia y estructurada. Cuenta con 4 tarjetas de métricas principales (Alumnos, Rutinas, Esta Semana, Check-ins) y una lista de Alumnos Recientes.

### 🚀 Propuestas de Mejora:

1. **Reemplazar guiones por ceros:** En las métricas sin datos (ej. "Esta Semana" o "Check-ins"), reemplazar el "-" por un "0". El "0" indica explícitamente que el sistema procesó la información y no hay pendientes, mientras que un guion puede parecer un error de carga.
2. **Botones de Acción Rápida (Quick Actions):** Falta un botón principal o flotante (Primary CTA) en el Dashboard que diga **"➕ Nuevo Alumno"** o **"Invitar Alumno"**. Actualmente el coach debe navegar a la pestaña "Alumnos" para hacerlo.
3. **Feed de Actividad en Tiempo Real:** En lugar de mostrar solo "Alumnos Recientes", sería mucho más útil un "Feed de Actividad". Ejemplos de ítems en la lista:
   * *🟢 Carolina completó "Pecho Tríceps" hace 2 horas.*
   * *🔴 Juan olvidó registrar su entrenamiento de ayer.*
   * *📝 Mateo subió su Check-in semanal.*
4. **Gráficos de Retención/Crecimiento:** Debajo de las 4 tarjetas, agregar un gráfico de líneas suave (usando bibliotecas como `recharts`) que muestre la evolución de alumnos activos en los últimos 30 días, o el % de cumplimiento de rutinas del grupo.
5. **Lista de Tareas (To-Do automatizado):** Un panel lateral pequeño que le diga al coach exactamente qué debe hacer hoy: *"Tienes 2 check-ins por revisar"* o *"3 alumnos terminan su rutina esta semana, dales una nueva"*.

---

## 2. Dashboard del Alumno (Experiencia Whitelabel)

**Estado Actual:**
Interfaz pulcra con saludo personalizado. Muestra tarjetas de estado del día (rutina/nutrición), historial reciente y progreso de peso (estado vacío).

### 🚀 Propuestas de Mejora:

1. **Vista Semanal / Calendario Horizontal:** 
   * Actualmente dice *"No tienes rutina asignada para hoy"*. Esto corta la interacción. 
   * **Mejora:** Mostrar una barra horizontal con los 7 días de la semana (L M X J V S D). Si no hay rutina hoy, el alumno puede ver visualmente que sí tiene una programada para mañana, lo que reduce la ansiedad y mejora la planificación.
2. **Gamificación y Motivación (Anillos y Rachas):**
   * Incorporar elementos visuales similares a Apple Fitness (anillos que se completan al hacer rutinas) o el ícono de "fueguito 🔥" de Duolingo indicando los días seguidos que el alumno ha entrado a la app o entrenado.
   * Mensajes dinámicos motivacionales debajo del saludo: *"¡Hola Carolina! Llevas 3 semanas perfectas, ¡sigue así!"*.
3. **Llamados a la Acción en Estados Vacíos (Empty States):**
   * En lugar de que la tarjeta de nutrición solo diga "Sin plan nutricional - Solicítalo a tu coach", hacer que toda la tarjeta sea un botón interactivo que abra un modal o envíe un aviso automático al coach pidiendo el plan.
4. **Resumen de Macros Rápidos (Si tiene plan):**
   * Cuando sí tenga un plan nutricional asignado, la tarjeta superior debería mostrar barras de progreso de Proteínas, Carbohidratos y Grasas del día actual, no solo un texto.
5. **Botón de Acción Flotante (FAB):** En versión móvil (PWA), agregar un botón flotante principal (`+`) que le permita al alumno registrar rápidamente: *"Tomar agua"*, *"Anotar peso corporal"*, o *"Subir progreso"*, sin importar en qué pantalla esté.
6. **Mejorar las Tarjetas de Historial:** La tarjeta de "Pecho Tríceps" se ve bien, pero podría incluir un ícono de un brazo flexionado, el tiempo que le tomó completarla (ej. *⏱️ 45 min*) o si rompió algún récord (PR) en esa sesión.

---

## 3. Sugerencias Estéticas Generales (UI)

* **Sombras (Drop Shadows):** Las tarjetas actuales tienen un borde fino muy elegante (`border-border`), pero al hacer "hover" (pasar el mouse), agregar una sombra suave (`hover:shadow-md`) y una pequeña traslación hacia arriba (`hover:-translate-y-1`) con `transition-all` le dará mucha más vida y sensación interactiva a la app.
* **Uso de Avatares:** En el dashboard del coach, reemplazar el círculo con la inicial por la foto real del alumno (si la ha subido en su onboarding).
* **Consistencia de Bordes:** Las tarjetas superiores del dashboard del coach tienen bordes redondeados y colores pastel suaves. Se podría aplicar ese mismo estilo de acento a las tarjetas del alumno para darle más calidez.