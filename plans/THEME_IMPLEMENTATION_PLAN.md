# Plan de Implementación de Temas (Claro/Oscuro) en la Plataforma Interna

Este documento detalla paso a paso las tareas requeridas para unificar y perfeccionar la estética en toda la plataforma (Coach y Alumnos), implementando correctamente el logo transparente, la tipografía de marca (Montserrat/Inter) y asegurando que cada componente funcione dinámicamente en **Modo Claro y Oscuro**, sin colores "duros" de fondo rotos.

## 1. Sidebar y Navegación (Coach & Alumnos)
- **Objetivo**: Estandarizar la identidad visual en la navegación principal.
- **Acciones**:
  - Refactorizar `CoachSidebar.tsx` y `ClientNav.tsx`.
  - Reemplazar fondos oscuros estáticos (`bg-zinc-900`, `bg-[#121212]`, `bg-black/40`) por las clases adaptables de Tailwind (ej. `bg-card`, `.glass-card` o combinaciones `bg-background/80`).
  - Sustituir cualquier logo genérico por el componente `<GymAppLogo />` oficial transparente.
  - Asegurar el uso de la clase `font-display` (Montserrat) en los títulos y marcas.

## 2. Dashboard Coach (`coach/dashboard`)
- **Objetivo**: Compatibilidad total en la vista principal del Coach.
- **Acciones**:
  - Eliminar clases de colores estáticos (`text-white`, `border-white/10`) en tarjetas de métricas y reemplazarlas por semánticas (`text-foreground`, `border-border`).
  - Aplicar `font-display` en los encabezados principales del panel y `.glass-card` en las tarjetas.

## 3. Gestión de Alumnos (`coach/clients` y `coach/clients/[clientId]`)
- **Objetivo**: Asegurar legibilidad del directorio y perfil de alumnos en modo claro.
- **Acciones**:
  - Limpiar listas, tarjetas de perfiles y botones de estado.
  - Ajustar el contraste de las métricas secundarias (cambiar texto blanco hardcodeado a `text-foreground`).
  - Adaptar tarjetas "Biometría Base" e "Intake Profile" con colores semánticos en lugar de fondos oscuros fijos.

## 4. Constructor de Rutinas y Ejercicios (`coach/exercises`, `coach/workout-programs`)
- **Objetivo**: Funcionalidad impecable del editor "Drag & Drop".
- **Acciones**:
  - Convertir los bloques arrastrables y las tarjetas de ejercicios a fondos y bordes dinámicos.
  - Ajustar el color de estado activo (ej. `hover:bg-accent`, `bg-card`) para mantener legibilidad de instrucciones e inputs tanto de día como de noche.

## 5. Módulo de Nutrición (`coach/nutrition-plans`, `coach/foods`, `coach/recipes`)
- **Objetivo**: Adaptar la Calculadora Visual de Macros y el Constructor Nutricional.
- **Acciones**:
  - Modificar los fondos y gráficos circulares simulados para que no asuman un fondo negro constante.
  - Refactorizar las tablas y listados de alimentos, y los modales pop-up de recetas, que suelen utilizar sombras o overlays oscuros que no encajan en modo claro.

## 6. Configuración de Marca (`coach/settings`)
- **Objetivo**: Armonía visual en la sección "Mi Marca".
- **Acciones**:
  - Mejorar el contraste de los selectores de color primario y el formulario general de la marca del coach.

## 7. Dashboard Alumnos (`c/[coach_slug]/dashboard` y relacionados)
- **Objetivo**: Brindar al cliente final la misma experiencia premium en su app White-Label.
- **Acciones**:
  - Revisar y cambiar los layouts del lado cliente (`layout.tsx` de clientes, check-in cards, resúmenes de rutinas y barras de estado).
  - Verificar los componentes interactivos, gráficos de progreso y tarjetas de información general.

## 8. Vistas Internas del Alumno (`c/[coach_slug]/nutrition`, `c/[coach_slug]/workout`)
- **Objetivo**: Hacer que la ejecución diaria del alumno sea legible.
- **Acciones**:
  - Adaptar la vista del Tracker de Nutrición diario y los inputs de Macros.
  - Refactorizar el "Workout Execution Client" (temporizador de descanso, registro de pesos y repeticiones) donde haya inputs grises estáticos o textos blancos.

## 9. Componentes Compartidos (`src/components/ui/`)
- **Objetivo**: Sanidad global y base sólida.
- **Acciones**:
  - Buscar y reemplazar clases estáticas remanentes (`bg-zinc-950`, `text-zinc-50`, `bg-[#1E1E1E]`) en todos los archivos base de `shadcn/ui` o construidos a mano (ej. Dialog, Form, Input, Card, Select).