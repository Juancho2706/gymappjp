# Estado del Proyecto: OmniCoach OS

Este documento sirve como un mapa de ruta y resumen de lo que actualmente está construido en el proyecto, así como ideas y propuestas de mejora para las siguientes iteraciones.

## 1. Arquitectura y Tecnologías Actuales
* **Framework:** Next.js 15 (App Router) con React 19.
* **Base de Datos y Backend:** Supabase (PostgreSQL, Autenticación, Almacenamiento). Tipado estricto a través de `lib/database.types.ts`.
* **Estilos y UI:** Tailwind CSS junto con componentes accesibles de `shadcn/ui` (ej. Sheet, Dialog, Avatar, Sonner).
* **Internacionalización (i18n):** Sistema propio basado en Context (`LanguageContext.tsx`) con soporte para inglés y español.
* **Estado y Formularios:** `react-hook-form` junto a `zod` para validación de esquemas, y `@dnd-kit` para interfaces de "arrastrar y soltar" en los constructores de rutinas.

## 2. Lo que ya está construido

### A. Flujo de Autenticación y Seguridad
La autenticación se basa en Supabase Auth con integración de SSR y *cookies*:
* **Middlewares (`src/middleware.ts`):** Control de acceso estricto basado en roles. Protege las rutas `/coach/*` garantizando que el usuario tenga un registro en la tabla `coaches`.
* **Portal del Coach (`/app/(auth)`):** Flujos centralizados de registro (`/register`), inicio de sesión (`/login`) y recuperación de contraseña (`/forgot-password`, `/reset-password`).
* **Portal del Alumno:** Los alumnos inician sesión de forma aislada a través del portal personalizado de su entrenador: `/c/[coach_slug]/login`.

### B. Portal del Coach (`/coach`)
Un panel de administración completo exclusivo para el entrenador:
* **Dashboard (`/dashboard`):** Vista general del negocio y la actividad de los alumnos.
* **Gestión de Alumnos (`/clients`):** Listado y administración de clientes. Muestra estados visuales (ej. pendiente de onboarding, activo) basados en las tablas `clients` y `client_intake`.
* **Constructor de Entrenamientos (`/builder/[clientId]`):** Una interfaz dinámica para crear planes de entrenamiento (`workout_plans`), organizar bloques (`workout_blocks`) definiendo series, repeticiones, peso objetivo, RIR (Repeticiones en Reserva) y tiempos de descanso.
* **Constructor de Nutrición (`/nutrition-builder/[clientId]`):** Herramienta para diseñar planes dietéticos personalizados (`nutrition_plans`, `nutrition_meals`), ajustando macronutrientes y comidas.
* **Catálogo de Ejercicios (`/exercises`):** Biblioteca privada o global de ejercicios (`exercises`), incluyendo soporte para URLs de videos, GIFs, instrucciones detalladas y clasificación muscular.
* **Mi Marca / Configuración (`/settings`):** Área fundamental donde el coach personaliza su marca blanca: subida de logo, selección de color primario, zona horaria y nombre comercial. Genera la URL dinámica para sus alumnos.

### C. Portal del Alumno (Experiencia Whitelabel) (`/c/[coach_slug]`)
Es la interfaz que utilizan los alumnos. Posee la particularidad de estar completamente **personalizada con la marca del coach**.
* **Diseño Dinámico:** El layout (`c/[coach_slug]/layout.tsx`) lee configuraciones de la base de datos e inyecta variables CSS en tiempo de ejecución (ej. `--theme-primary`) para pintar la app con los colores corporativos del entrenador.
* **PWA Dinámica (`/api/manifest/[coach_slug]`):** Genera un `manifest.webmanifest` al vuelo. Esto permite que el alumno instale la app en su teléfono móvil viendo el nombre y el logo *de su entrenador*, no el de OmniCoach.
* **Onboarding (`/onboarding`):** Flujo de recopilación inicial de datos del alumno (peso, altura, nivel de experiencia, objetivos médicos y fitness).
* **Workouts (`/workout`):** Visualización interactiva de las rutinas asignadas. El alumno puede registrar sus levantamientos reales y marcar series completadas (`workout_logs`).
* **Nutrición (`/nutrition`):** Consulta del plan de alimentación y registro diario de ingesta (`daily_nutrition_logs`, `nutrition_meal_logs`).
* **Check-In (`/check-in`):** Formularios periódicos para que el alumno suba su peso actual, fotos de progreso y métricas solicitadas por el coach.

---

## 3. Ideas y Propuestas de Mejora

### 💡 Mejoras para el Portal del Coach
1. **Plantillas de Entrenamientos (Templates):** Permitir al coach guardar rutinas completas como plantillas para asignarlas rápidamente a nuevos alumnos sin tener que crearlas desde cero.
2. **Chat Integrado / Mensajería:** Un sistema de mensajería dentro de la app para evitar que el coach tenga que usar WhatsApp o correo electrónico para comunicarse con sus alumnos.
3. **Análisis Gráfico del Progreso:** Gráficos visuales en el perfil de cada alumno que muestren la evolución de su peso corporal, fuerza en ejercicios clave (ej. 1RM estimado en Sentadilla o Press Banca) y cumplimiento de macros.
4. **Notificaciones Push:** Avisar al coach cuando un alumno complete su Check-in semanal o alcance un nuevo récord personal (PR).
5. **Biblioteca de Alimentos (Nutrición):** Integración con una API como FatSecret o Edamam para buscar alimentos reales y calcular los macros automáticamente, en lugar de escribirlos manualmente.
6. **Suscripciones y Pagos (Stripe):** Permitir que el coach cobre sus mensualidades directamente a través de la plataforma (ya existe `/pricing` pero se puede potenciar).

### 💡 Mejoras para el Portal del Alumno (Whitelabel)
1. **Modo Offline PWA:** Usar Service Workers (`next-pwa` ya está tipado en el proyecto) para que el alumno pueda ver su rutina y anotar sus pesos en el gimnasio incluso si no tiene conexión a internet. Los datos se sincronizarían al recuperar la señal.
2. **Historial de Levantamientos In-App:** Al hacer un ejercicio, mostrarle al alumno cuánto peso levantó y cuántas repeticiones hizo la semana pasada en ese mismo ejercicio para que sepa cuánto debe superar (Sobrecarga progresiva).
3. **Cronómetro Flotante Mejorado:** Un temporizador de descanso que funcione en segundo plano y emita un sonido o vibración (usando la API de vibración del navegador) cuando el descanso termine.
4. **Calculadora de Discos (Plates Calculator):** Una pequeña herramienta para decirle al alumno qué discos debe poner a cada lado de la barra olímpica según el peso objetivo.
5. **Gamificación (Insignias/Rachas):** Darle al alumno pequeñas recompensas visuales ("¡Racha de 3 semanas entrenando!") para fomentar la retención.

### 💡 Mejoras Técnicas Generales
1. **Optimización de Imágenes:** Asegurarse de que los logos y avatares subidos a Supabase Storage pasen por `next/image` para reducir el ancho de banda y mejorar los tiempos de carga en móviles.
2. **Webhooks para Supabase:** Sincronizar eventos (como la eliminación de un usuario) de forma segura.
3. **Tests End-to-End (E2E):** Implementar Playwright o Cypress (ya tienes Vitest configurado para unit testing) para automatizar pruebas del flujo crítico (ej. el Coach crea rutina -> Alumno la ve y la marca como completada).
