# Plan de Mejoras OmniCoach

Este plan detalla las mejoras solicitadas por el socio, divididas en 5 fases de implementación. Cada fase incluye un prompt específico diseñado para ser usado con un modelo de IA (como Roo Code o similares) para ejecutar los cambios de forma directa y efectiva.

---

## Parte 1: Branding y Navegación (Logo y Scroll)
**Objetivo:** Solucionar el problema de carga del logo y mejorar la experiencia de usuario al navegar hacia atrás.

### Prompt para la IA:
```text
Arreglar los siguientes problemas de UX:
1. Logo no carga: Revisa `src/app/coach/settings/actions.ts:updateLogoAction` y `LogoUploadForm.tsx`. Asegúrate de que la URL pública de Supabase se genere correctamente y que el componente `Image` de Next.js refresque el logo inmediatamente después de la subida. Verifica si hay problemas con el almacenamiento local o la caché de Next.js (`revalidatePath`).
2. Navegación hacia atrás: Implementa una solución para que al usar el botón "Atrás" del navegador o `router.back()`, la página mantenga la posición del scroll en lugar de volver al inicio. Considera el uso de `scroll-restoration` en el layout global o configuraciones de Next.js.
```

---

## Parte 2: Catálogo de Ejercicios y Grupos Musculares
**Objetivo:** Categorizar mejor los ejercicios y añadir más opciones de grupos musculares.

### Prompt para la IA:
```text
Mejorar la categorización de ejercicios:
1. Grupos Musculares: Amplía la lista de grupos musculares en el sistema. Actualmente se extraen de los ejercicios existentes. Crea una constante central de grupos musculares (Ej: Pectoral, Dorsal, Deltoides Frontal, Deltoides Lateral, Deltoides Posterior, Bíceps, Tríceps, Cuádriceps, Isquios, Glúteo, Gemelos, Core, etc.).
2. Filtrado: Actualiza `ExerciseCatalogClient.tsx` y `PlanBuilder.tsx` para que usen esta nueva lista. Permite separar y ver rutinas/ejercicios por estos grupos específicos.
3. Asegúrate de que los ejercicios puedan tener un grupo muscular principal y varios secundarios para mejorar la búsqueda.
```

---

## Parte 3: Rediseño del Creador de Rutinas (PlanBuilder)
**Objetivo:** Simplificar visualmente la creación de rutinas para que sea más cómodo.

### Prompt para la IA:
```text
Rediseñar la interfaz de `src/app/coach/builder/[clientId]/PlanBuilder.tsx` para mayor comodidad visual:
1. Simplificar bloques: Los bloques de ejercicios en el canvas deben ser más compactos cuando están cerrados. Usa un diseño de "tarjeta limpia" con iconos claros para series, reps y descanso.
2. Desglose cómodo: Al expandir un bloque, los campos de entrada (sets, reps, peso, etc.) deben estar organizados en una rejilla (grid) más espaciosa y legible.
3. Arrastre intuitivo: Mejora el feedback visual durante el drag-and-drop de dnd-kit (bordes, sombras, etc.).
4. Catálogo lateral: Haz que el catálogo de ejercicios de la izquierda sea colapsable o más discreto para dar más espacio al área de trabajo principal.
```

---

## Parte 4: Gestión Avanzada de Recetas
**Objetivo:** Facilitar la creación y organización de recetas.

### Prompt para la IA:
```text
Mejorar el sistema de recetas en `src/app/coach/recipes/`:
1. CRUD de Recetas: Implementa un formulario completo para crear y editar recetas propias (nombre, descripción, ingredientes, pasos de preparación, macros y tiempo). Actualmente parece limitado a búsqueda/biblioteca.
2. Organización: Permite categorizar recetas (Desayuno, Almuerzo, Cena, Snacks).
3. Interfaz de Biblioteca: Rediseña `src/app/coach/recipes/page.tsx` para que la biblioteca sea más fácil de gestionar, con filtros por macros o tiempo de preparación.
4. Integración: Asegúrate de que las recetas guardadas se puedan buscar fácilmente para añadirlas a los planes nutricionales de los clientes.
```

---

## Parte 5: Recorte Visual de Videos
**Objetivo:** Mostrar solo el segmento específico del video demostrativo.

### Prompt para la IA:
```text
Implementar recorte de videos demostrativos:
1. Base de datos: Asegúrate de que la tabla `exercises` soporte campos opcionales `video_start_time` y `video_end_time` (segundos).
2. Interfaz de Ejercicios: En el modal de edición/creación de ejercicios, añade campos para definir el segundo de inicio y fin del video.
3. Reproductor: Actualiza `ExercisePreviewModal` para que, al detectar un video de YouTube, añada los parámetros `start` y `end` a la URL del iframe (ej: `...&start=10&end=20`). Esto hará que el video solo muestre el movimiento específico sin edición externa.
```
