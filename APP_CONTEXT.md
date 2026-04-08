# Contexto de la Aplicación: Coach Op

## Visión General
**Coach Op** es una plataforma SaaS B2B2C diseñada para entrenadores personales y sus alumnos.
- **Coach (B2B):** Paga una suscripción a la plataforma. Tiene acceso a un panel de administración (`/coach`) desde donde gestiona a sus clientes, crea planes de entrenamiento y nutrición personalizados, y monitorea el progreso de sus alumnos mediante analíticas.
- **Alumno (B2C):** Accede a la plataforma a través de un portal de marca blanca (`/c/[coach_slug]`) personalizado con los colores y el logo de su entrenador. Aquí puede ver sus rutinas, registrar sus entrenamientos, marcar comidas completadas y realizar check-ins semanales (peso, fotos, energía).

---

## Stack Tecnológico
- **Framework:** Next.js (v16.1 App Router) con React 19.
- **UI Library:** Tailwind CSS v4, base de componentes de shadcn/ui (Radix UI), Base UI. Iconos vía `lucide-react`. Animaciones con `framer-motion` y utilidades visuales como `canvas-confetti`.
- **Base de Datos & Auth:** Supabase (PostgreSQL). Utiliza `@supabase/ssr` para autenticación basada en servidor y cliente. Las políticas RLS (Row Level Security) aíslan la data por `coach_id`.
- **Manejo de Estado & Formularios:** Estado local mediante React Hooks y Context API. Manejo de formularios con `react-hook-form` y validaciones estrictas con `zod`.
- **Librería de Gráficos:** Recharts para la visualización de métricas (Adherencia, Volumen, 1RM, etc.).
- **Utilidades Clave:** `@dnd-kit` para constructores visuales de rutinas (Drag & Drop), `browser-image-compression` para optimizar fotos de check-ins antes de subir a Storage.

---

## Modelo de Datos (Supabase)
El esquema relacional aísla a los alumnos por entrenador.

*   **`coaches`**: Perfil del entrenador. Almacena la configuración de marca (`brand_name`, `slug`, `primary_color`, `logo_url`) y datos de suscripción.
*   **`clients`**: Tabla de alumnos. Relacionada directamente con un `coach_id`. Incluye estado de actividad y configuración de preferencias visuales.
*   **`client_intake`** y **`check_ins`**: Formularios iniciales (medidas, objetivos, lesiones) y reportes periódicos (peso, nivel de energía, foto frontal, notas).
*   **Entrenamiento:**
    *   `workout_programs` (Plantillas de programas) y `workout_plans` (Días o rutinas específicas).
    *   `workout_blocks`: El detalle de cada ejercicio (series, reps, rir, descanso) dentro de un plan. Relacionado con el catálogo global o personalizado de `exercises`.
    *   `workout_logs`: El registro transaccional. Cada vez que un alumno completa una serie, se guarda aquí el peso levantado y las repeticiones hechas.
*   **Nutrición:**
    *   `nutrition_plans` y `nutrition_meals`: Planes asignados.
    *   `daily_nutrition_logs` y `nutrition_meal_logs`: Registro diario de macros ingeridos y comidas marcadas como hechas por el alumno.

---

## Arquitectura de la UI

### Layout Principal
El proyecto usa el App Router de Next.js y está claramente bifurcado en dos ecosistemas:
1.  **`/coach`**: Rutas protegidas para el entrenador.
2.  **`/c/[coach_slug]`**: Portal del alumno. Usa rutas dinámicas para inyectar el contexto visual del entrenador (colores, logos) en el Layout.

### Secciones Actuales (Vista del Coach)
*   **Overview / Dashboard (`/coach/dashboard`)**: Panel principal. Muestra promedios globales de adherencia (entrenamiento y dieta), métricas rápidas y tarjetas de clientes que requieren atención.
*   **Progreso / Clientes (`/coach/clients`)**: Directorio de alumnos. Entrar a `/[clientId]` abre el `ClientProfileDashboard`, una vista integral del progreso de un alumno con gráficos históricos.
*   **Entrenamiento (`/coach/workout-programs`, `/coach/builder/[clientId]`)**: Gestión de plantillas globales y constructores personalizados drag & drop para asignar rutinas específicas a los alumnos.
*   **Nutrición (`/coach/nutrition-plans`, `/coach/foods`, `/coach/recipes`)**: Gestión del catálogo de alimentos y armado de dietas o distribución de macronutrientes.
*   **Facturación (`client_payments` en DB)**: Aunque existe el esquema de base de datos para registrar pagos y suscripciones de clientes, la UI de gestión de cobros parece delegada o en desarrollo temprano.

### Componentes Clave de la UI
*   **Builders (`WeeklyPlanBuilder`, `DraggableExerciseCatalog`)**: Interfaces altamente interactivas para construir semanas de entrenamiento arrastrando ejercicios a diferentes días.
*   **Dashboards (`DashboardCharts`, `MiniSparkline`)**: Componentes de visualización de datos de Recharts encapsulados para mostrar tendencias de manera limpia.
*   **Ejecución (`WorkoutExecutionClient`, `RestTimer`)**: En la vista del alumno, controla el flujo de entrenamiento en vivo, con temporizadores de descanso integrados y manejo de sonido/vibración.

---

## Flujo de Usuario (UX)

1.  **Recepción del Plan:**
    El entrenador crea un perfil para el alumno. El alumno accede a `midominio.com/c/nombre-del-coach/login`. Tras iniciar sesión, completa su Onboarding (si es la primera vez) y aterriza en su Dashboard. Allí, la app le indica su rutina del día de hoy y los macros/comidas a cumplir.
2.  **Registro de Datos (Alumno):**
    *   *Entrenamiento:* Entra a la rutina del día (`/workout/[planId]`). El componente `WorkoutExecutionClient` lo guía ejercicio por ejercicio. Registra el peso y repeticiones, y al confirmar, salta un `RestTimer` de cuenta regresiva.
    *   *Nutrición:* Va a `/nutrition` para marcar comidas (`is_completed`) o registrar macros de manera que alimenta el `daily_nutrition_log`.
    *   *Check-in:* En `/check-in`, sube sus fotos, registra su peso de la semana y anota cómo se ha sentido.
3.  **Visualización (Coach):**
    El entrenador revisa su dashboard y entra al perfil del alumno (`/coach/clients/[clientId]`). Allí, el componente `ClientProfileDashboard` procesa los `workout_logs` y `daily_nutrition_logs` del alumno y renderiza gráficos visuales en pestañas (Volumen total levantado, Adherencia calórica, Tasa de cambio de peso).

---

## Lógica de Negocio Crítica

Gran parte de la inteligencia de analíticas se realiza combinando consultas de backend y reducciones en cliente:
*   **Cálculo de 1RM (Fuerza) y Volumen de Entrenamiento:** Se calcula y renderiza en el Frontend dentro de `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`. Itera sobre todos los `workout_logs` del alumno, multiplica `weight * reps` para sacar el *Volumen (Tonnage)* por sesión, y aplica fórmulas estándar para calcular el *1 Rep Max (1RM)* en ejercicios clave.
*   **Cálculo de Adherencia:** Gestionado principalmente en `src/services/dashboard.service.ts`. La función calcula la adherencia analizando cuántos meals fueron completados vs el total esperado, o comparando los logs de entrenamiento vs los bloques planificados para la semana, devolviendo un `adherencePercentage`.

---

## Estado de Desarrollo

*   **Completas y Robustas:**
    *   Arquitectura multi-tenant con slugs de coach.
    *   Constructores drag-and-drop de entrenamientos y nutrición.
    *   Flujo de ejecución de entrenamiento (modo en vivo) para el cliente con temporizador y sonidos integrados.
    *   Analíticas avanzadas y gráficas interactivas en el dashboard del coach.
*   **Placeholders / En Desarrollo:**
    *   *Facturación y Pagos:* Si bien hay modelos en la base de datos (`client_payments`), la UI/lógica de suscripción directa desde el alumno al coach no es la funcionalidad principal en uso actual frente al core de entrenamiento.
*   **Bugs Conocidos / Posibles Mejoras:**
    *   Falta de datos: Las vistas de gráficas de volumen/1RM muestran empty states ("No hay suficientes datos...") de manera correcta, pero el rendimiento de procesar todo el historial de `workout_logs` en el cliente (dentro de `ClientProfileDashboard.tsx`) podría ser un cuello de botella si el alumno acumula años de entrenamientos diarios. Eventualmente, esta agregación deberá migrar a una View materializada de Supabase o pre-cálculos en backend.