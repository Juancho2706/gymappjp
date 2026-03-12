# Plan Maestro de Optimización y Mejora: OmniCoach OS

Este documento consolida el plan estratégico para la plataforma GymAppJP (OmniCoach OS), dividiendo las tareas en dos frentes principales: **Optimización** (rendimiento, seguridad y arquitectura técnica) y **Mejora** (nuevas funcionalidades, UI/UX y retención).

---

## 1. Plan de Optimización (Técnico, Rendimiento y Seguridad)

Estas tareas están enfocadas en hacer que la aplicación sea más rápida, segura y mantenible a nivel de código.

### A. Seguridad y Control de Acceso
*   **Row Level Security (RLS) en Supabase:** Auditar e implementar políticas RLS estrictas en todas las tablas (`clients`, `workout_plans`, `workout_logs`, etc.). Un alumno solo debe poder leer/escribir sus propios datos (`auth.uid() == client_id`), y un coach solo sus propios alumnos (`auth.uid() == coach_id`).
*   **Gestión de Cuentas Inactivas:** Implementar el campo booleano `is_active` en la tabla `clients`. Añadir lógica en el middleware para redirigir a los alumnos suspendidos a una pantalla de "Acceso Pausado", bloqueando el acceso a sus rutinas sin eliminar su historial.
*   **Restablecimiento de Contraseñas por el Coach:** Implementar la función mediante Supabase Admin API (`SERVICE_ROLE_KEY`) para que el coach genere claves temporales (PIN) a alumnos que olvidaron su contraseña.
*   **Webhooks de Supabase:** Implementar sincronización segura de eventos (ej. limpieza de almacenamiento al eliminar un usuario).

### B. Rendimiento y Experiencia de Usuario (Performance)
*   **Optimización de Imágenes:** Asegurar el uso estricto del componente `<Image />` (`next/image`) para todas las imágenes provenientes de Supabase Storage (logos de coaches, avatares de alumnos, fotos de progreso) para reducir el consumo de ancho de banda.
*   **Actualizaciones Optimistas (Zero-Lag):** Implementar `useOptimistic` de React 19 en acciones críticas como marcar series completadas o guardar pesos. El cambio visual debe ser instantáneo, sincronizando en segundo plano con la base de datos.
*   **Skeletons de Carga Fluidos:** Reemplazar las pantallas de carga en blanco o spinners básicos por "Skeletons" que imiten la estructura de la página destino para evitar saltos visuales durante la navegación (especialmente en la transición de Dashboard a Rutina).

### C. Calidad de Código y Testing
*   **Tests End-to-End (E2E):** Configurar e implementar Playwright o Cypress para automatizar el flujo crítico: Registro de Coach -> Creación de Cliente -> Asignación de Rutina -> Ingreso del Cliente -> Completado de Rutina.

---

## 2. Plan de Mejora (Nuevas Funcionalidades y UI/UX)

Estas tareas están enfocadas en aportar más valor al producto, mejorando la experiencia del entrenador y reteniendo más a los alumnos.

### A. Mejoras para el Portal del Coach
1.  **Plantillas de Entrenamientos (Templates):** Funcionalidad para guardar rutinas creadas y asignarlas rápidamente a nuevos alumnos.
2.  **Gráficos de Progreso y Retención:** Implementar `recharts` para visualizar la evolución del peso de los alumnos, fuerza en ejercicios clave (1RM estimado) y cumplimiento general.
3.  **Feed de Actividad en Tiempo Real:** Reemplazar la lista estática de "Alumnos Recientes" por un feed dinámico de eventos (ej. "Juan completó su rutina", "Ana subió su check-in").
4.  **Botones de Acción Rápida y Tareas:** Añadir un botón flotante principal (Nuevo Alumno/Rutina) y un panel lateral de tareas pendientes automatizado (ej. "Tienes 2 check-ins por revisar").
5.  **Status en Vivo (Supabase Realtime):** Mostrar un indicador visual (punto verde) en el dashboard del coach cuando un alumno esté ejecutando su rutina en ese momento.

### B. Mejoras para el Portal del Alumno (Whitelabel App)
1.  **Modo Ejecución Inmersivo:** Ocultar la barra de navegación inferior (`ClientNav`) durante la ejecución de un entrenamiento para evitar distracciones y clics accidentales.
2.  **Modo Offline (PWA):** Configurar Service Workers para permitir acceso en modo lectura a la rutina del día y guardar localmente los pesos registrados si no hay conexión en el gimnasio, sincronizando al recuperar la red.
3.  **Historial de Levantamientos In-App:** Durante la ejecución de un ejercicio, mostrar la métrica exacta de la semana anterior (peso y repeticiones) para fomentar la sobrecarga progresiva.
4.  **Feedback Háptico y Gamificación:**
    *   Vibración (`navigator.vibrate`) al terminar un temporizador de descanso o completar una serie.
    *   Animaciones de confeti al terminar la rutina diaria.
    *   Implementar un sistema visual de "Rachas" (días seguidos entrenando) y un calendario semanal horizontal en el dashboard para mejor contexto.
5.  **Calculadora de Discos:** Herramienta rápida para calcular qué discos colocar en la barra olímpica según el peso objetivo.
6.  **Botón Permanente de "Instalar App":** Un acceso directo claro en la interfaz para guiar al alumno en la instalación nativa de la PWA.

### C. Mejoras Estéticas Globales
*   Añadir sombras interactivas (`hover:shadow-md`, `hover:-translate-y-1`) a las tarjetas.
*   Implementar transiciones fluidas de diseño usando el `layoutId` de Framer Motion al expandir elementos (ej. de tarjeta de rutina a vista completa).
