# Plan de Rediseño Avanzado: Perfil del Alumno (Vista Coach)

Este documento detalla el plan meticuloso y optimizado para rediseñar la vista del perfil del alumno (`/coach/clients/[clientId]`), garantizando que el coach tenga un panel de control completo (360°) de su cliente. Incorpora visualización de datos avanzados, soporte de tema claro/oscuro, aplicación estricta de la paleta de colores (marca del coach o system), gestión de pagos y un rendimiento excepcional mediante el uso adecuado de Server y Client Components en Next.js.

## FASE 1: Arquitectura, Datos y Rendimiento (Backend & Server Components)
El objetivo de esta fase es consolidar todas las consultas a Supabase con un enfoque en rendimiento, concurrencia (usando `Promise.all`) y caché.

*   [ ] **1.1 Optimización de Consultas Base (Server-Side):**
    *   [ ] Obtener datos del alumno (`clients` y `client_intake`) y configuración del coach (para colores de marca).
    *   [ ] Obtener el estado actual de la suscripción (fecha de inicio/fin, estado activo/inactivo).
    *   [ ] **Optimización:** Usar React `cache` (o `unstable_cache`) para las peticiones más pesadas y aislar las consultas en funciones modulares dentro de `actions.ts` o un archivo de servicio.
*   [ ] **1.2 Consultas Históricas y de Adherencia:**
    *   [ ] Historial de **Check-ins**: Obtener y estructurar (peso, fotos, energía, notas).
    *   [ ] Historial de **Entrenamientos** (`workout_logs`): Calcular el porcentaje de adherencia, carga total (volumen) levantada por semana.
    *   [ ] Historial de **Nutrición** (`daily_nutrition_logs`): Calcular promedios semanales de macros (proteínas, carbohidratos, grasas) y calorías consumidas vs. objetivo.
*   [ ] **1.3 Integración de Pagos/Facturación (NUEVO):**
    *   [ ] Consultar el historial de pagos o renovaciones asociadas al cliente (requerirá verificar si existe la tabla o modelarla si es necesario, ej. `client_subscriptions` o integrando metadatos de MercadoPago/Stripe).
*   [ ] **1.4 Estructuración de Datos para Gráficos:**
    *   [ ] Formatear cronológicamente los datos (Series Temporales) para pasarlos limpios y listos a las librerías de gráficos (ej. Recharts) en el cliente.

## FASE 2: Layout Dashboard y Sistema de Diseño Base
Crear el esqueleto de la página asegurando una navegación intuitiva entre las distintas áreas de información del cliente.

*   [ ] **2.1 Header del Perfil y Acciones Rápidas:**
    *   [ ] Implementar el header con: Avatar, Nombre completo, Estado (Badge visual: Activo, Suspendido, Pendiente Onboarding).
    *   [ ] Botones de acción (`Button`, `GlassButton`): Editar perfil, Suspender, Ver facturación, Enviar Mensaje.
    *   [ ] **Color Theming (CRÍTICO):** Asegurar que todos los botones primarios, badges e iconos utilicen las clases de Tailwind que respetan la preferencia del usuario (`use_coach_brand_colors` o system blue, mediante las variables CSS ya establecidas).
*   [ ] **2.2 Sistema de Navegación Interna (Tabs/ScrollSpy):**
    *   [ ] Diseñar un menú de pestañas `<Tabs>` para no sobrecargar visualmente:
        *   Tab 1: **Visión General (Overview)** (KPIs, Gráficos principales).
        *   Tab 2: **Check-ins & Evolución** (Fotos, peso, feedback).
        *   Tab 3: **Entrenamiento** (Programas activos, historial de logs).
        *   Tab 4: **Nutrición** (Planes actuales, cumplimiento diario).
        *   Tab 5: **Facturación y Ajustes** (Historial de pagos, configuración de suscripción).

## FASE 3: Desarrollo de Widgets y Componentes Visuales (Client Components)
Desarrollo de los bloques modulares que muestran la información de manera elegante y comprensible.

*   [ ] **3.1 Widget de Información y Objetivos (Intake):**
    *   [ ] Tarjeta (`GlassCard`) mostrando: Altura, Peso inicial, Objetivo principal, Nivel de experiencia, Lesiones y Condiciones Médicas.
*   [ ] **3.2 Panel de Métricas Principales (KPIs):**
    *   [ ] Mini-Tarjetas resaltando:
        *   Cambio de peso neto (ej. "-2.5 kg").
        *   Adherencia general (Entrenamiento + Nutrición en %).
        *   Días desde el último check-in.
        *   Próximo pago / Vencimiento de suscripción.
*   [ ] **3.3 Gráficos Interactivos (Recharts):**
    *   [ ] **Gráfico de Peso (Línea):** Evolución histórica del peso. Puntos interactivos con Tooltips.
    *   [ ] **Gráfico de Adherencia (Barras/Área):** Comparativa semanal de lo planificado vs. ejecutado.
    *   [ ] **Optimización Theming:** Pasar el color `--primary` de Tailwind al prop de color del gráfico para que haga match perfecto con el branding, tanto en Light como en Dark mode.
*   [ ] **3.4 Módulo de Check-ins (Visual + Datos):**
    *   [ ] Grilla o listado cronológico de check-ins.
    *   [ ] Integración del `<PhotoComparisonSlider>` para ver progreso físico visual.
*   [ ] **3.5 Módulo de Facturación (NUEVO):**
    *   [ ] Tabla (`Data Table`) con el historial de cobros: Fecha, Monto, Estado (Pagado, Fallido, Pendiente), Método.
    *   [ ] Botón para generar link de cobro manual o recordatorio.

## FASE 4: Refinamiento, UX y Prevención de Errores (Edge Cases)
Asegurar que la experiencia sea robusta, accesible y libre de fricciones.

*   [ ] **4.1 Manejo de Estados Vacíos (Empty States):**
    *   [ ] Diseñar componentes elegantes para cuando no hay datos (ej. "Este alumno aún no ha subido su primer check-in", con un botón para enviar un recordatorio).
*   [ ] **4.2 Estados de Carga y Transiciones (Suspense):**
    *   [ ] Implementar `<Suspense>` boundaries granulares. En lugar de cargar toda la página de una vez, mostrar el Header inmediatamente y cargar los widgets pesados (gráficos) de forma asíncrona con `<Skeleton>` cards en su lugar.
*   [ ] **4.3 Manejo de Errores (Error Boundaries):**
    *   [ ] Asegurar que si falla la carga del historial de pagos, el resto del perfil (entrenamientos, check-ins) siga funcionando correctamente. (Uso de `error.tsx` o ErrorBoundaries específicos por componente).
*   [ ] **4.4 Responsividad Extrema:**
    *   [ ] Verificar el comportamiento de los gráficos y la tabla de pagos en pantallas de móviles (scroll horizontal u ocultamiento de columnas no esenciales).

## FASE 5: QA Final y Despliegue
*   [ ] **5.1 Revisión de Paleta de Colores:** Cambiar entre tema claro y oscuro, y alternar el uso del color de marca del coach vs. color del sistema, garantizando legibilidad y estética en los botones, gráficos y fondos.
*   [ ] **5.2 Testing de Rendimiento:** Analizar la carga inicial y el tamaño del bundle generado por los gráficos.