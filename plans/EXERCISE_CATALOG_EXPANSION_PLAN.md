# Plan de Escalamiento: Catálogo de Ejercicios (500+) y Mejoras UX

Este plan aborda la estrategia técnica y de producto para expandir la base de datos de ejercicios de COACH UP utilizando una matriz multiplicadora, y para mejorar la experiencia tanto del coach como del alumno al interactuar con el catálogo y la visualización de los ejercicios.

## 1. Estrategia de Datos: Matriz de Multiplicación (Scripting y BD)

El objetivo no es cargar ejercicios uno por uno de forma manual, sino utilizar un script (Seed) que combine factores base para generar las variantes.

### A. Nuevos Campos y "Tags" en Base de Datos
Actualizar la tabla `exercises` o crear tablas relacionales para soportar el sistema de etiquetado avanzado propuesto:
- `primary_muscle` (Glúteo Mayor, Cuádriceps, Dorsal Ancho, etc.)
- `equipment` (Barra, Mancuerna, Polea, Peso Corporal, etc.)
- `difficulty` (Principiante, Intermedio, Avanzado)
- `gender_focus` (Foco Glúteo, Foco Densidad Espalda, Neutro)
- `video_url` (Link de YouTube para la previsualización)

### B. Lógica de Generación de la Matriz (TypeScript Seed Script)
Crear un script `scripts/seed_exercises_matrix.ts` que contenga:
1. **Arrays Base**:
   - `base_movements`: [Sentadilla, Peso Muerto, Remo, Press, Curl, Extensión...] (Nombres localizados en español de Chile/Latam).
   - `implements`: [Barra, Mancuerna, Kettlebell, Polea, Máquina, Banda, Smith...]
   - `variants`: [Unilateral, Déficit, Pausa, Tempo lento, Agarre Prono/Supino...]
2. **Generador Combinatorio**: Lógica que una estos factores generando un nombre técnico correcto (Ej: "Remo al Pecho con Mancuernas Agarre Neutro").
3. **Carga en Fases**: Ejecutar el script para cargar un lote inicial de ~200 ejercicios esenciales de hipertrofia y funcional, dejando margen para que el catálogo crezca orgánicamente.

## 2. Mejoras de UI/UX: Biblioteca de Ejercicios y Modales

Para manejar 200-500 ejercicios, la interfaz del Coach y del Alumno debe ser extremadamente fluida y responsiva.

### A. Biblioteca del Coach (Responsive & Filtros Avanzados)
- **Filtros por Tags**: Reemplazar/mejorar el buscador actual con filtros estilo "chips" o un Command Palette mejorado, permitiendo buscar por: *Músculo* + *Equipamiento*.
- **Scroll Infinito o Paginación Virtual**: Asegurar que la vista de catálogo (`ClientExerciseCatalog` o similar) no sufra de lag al renderizar cientos de items.
- **Acción "Clonar y Editar"**: Añadir un botón rápido en cada ejercicio de la biblioteca del coach que abra el modal pre-cargado con los datos para crear una variante rápida (Ej: cambiar de "Barra" a "Mancuerna" y guardar como nuevo).

### B. Visualización de Videos (Coach y Alumno)
- **Modal Unificado**: Estandarizar el modal de detalle del ejercicio para que sea idéntico (o comparta el mismo componente base) tanto para el coach en el "Builder" como para el alumno durante el "Workout Execution".
- **Reproductor de YouTube Integrado**: Asegurar que el reproductor cargue fluidamente (usando `react-player` o similar) de forma responsive, ocupando la parte superior del modal en dispositivos móviles y un lado en desktop.

## 3. Hoja de Ruta (Tareas Atómicas)

### Fase 1: Arquitectura de Datos y Matriz
- [ ] Modificar esquema de base de datos de ejercicios (Añadir tags de Equipamiento, Dificultad, Enfoque y URL de Video).
- [ ] Generar migración SQL correspondiente.
- [ ] Crear script de carga masiva (`seed_exercises_matrix.ts`) con los 10 movimientos base, implementos y variantes en Español Latino.
- [ ] Ejecutar el script para cargar el primer lote (aprox. 200 ejercicios).

### Fase 2: Lógica Backend e Interfaces
- [ ] Actualizar tipos de Supabase (`database.types.ts`).
- [ ] Actualizar Server Actions para creación, edición y búsqueda de ejercicios usando los nuevos tags.
- [ ] Implementar la lógica del botón "Clonar Ejercicio" en el backend y frontend.

### Fase 3: Interfaz de Usuario (UI/UX)
- [ ] Refactorizar el Catálogo de Ejercicios del Coach implementando filtros por tags (Músculo, Equipo) y vista optimizada.
- [ ] Estandarizar el componente `ExerciseDetailModal` para mostrar el video de YouTube fluidamente en vistas móviles y de escritorio.
- [ ] Integrar el nuevo modal unificado en la vista del Alumno (`WorkoutExecutionClient`).

---
```mermaid
graph TD
    A[Matriz de Datos] -->|Script Seed| B(Base de Datos Supabase)
    B --> C{Tags: Músculo, Equipo}
    C --> D[Catálogo del Coach]
    C --> E[Vista del Alumno]
    D -->|Filtros Avanzados| F[Búsqueda Rápida]
    D -->|Acción rápida| G[Clonar Ejercicio]
    D --> H[Modal Unificado + YouTube]
    E --> H