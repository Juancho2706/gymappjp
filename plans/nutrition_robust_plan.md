# Plan Maestro: Refactorización y Blindaje del Sistema de Nutrición

Este documento detalla la estrategia para unificar, robustecer y securizar la gestión de planes nutricionales, asegurando integridad de datos, una UI impecable en ambos temas (light/dark) y una UX libre de errores para el coach.

## 1. Fase de Saneamiento (Data Integrity)
Antes de implementar nuevas funciones, eliminaremos la entropía actual.
*   **Limpieza de Base de Datos:** Generar script SQL para limpiar planes de alimentos antiguos/duplicados que puedan generar conflictos de IDs.
*   **Transaccionalidad:** Refactorizar Server Actions para usar una lógica de "Limpiar y Reemplazar" atómica. Si falla el guardado de un ingrediente, no se corrompe el plan completo.

## 2. Componente Core: `NutritionMasterEditor`
Unificación total de `NutritionPlanBuilder` y `NutritionForm`.
*   **Validación de Macros (Bulletproof):**
    *   Cálculo en tiempo real: `Sum(alimentos) vs Target(Plan)`.
    *   **Alertas de Desfase:** Si hay una diferencia > 1%, se muestra un indicador ámbar. Si es > 5%, rojo.
    *   **UI Dinámica:** Soporte nativo para Tailwind Dark Mode usando variables semánticas (`bg-background`, `text-foreground`).
*   **Modo Responsivo Pro:** Layout colapsable para móviles que prioriza la visibilidad de los macros totales siempre en el sticky header.

## 3. Sistema de Sincronización y Alertas de Impacto
*   **Vínculo Inteligente:**
    *   `Synced`: El plan del alumno es un "espejo" de la plantilla.
    *   `Custom`: El plan ha sido modificado específicamente y está protegido de actualizaciones globales.
*   **Alertas de Coach (QA):**
    *   Al editar una plantilla vinculada: "Atención: Esta acción afectará a [X] alumnos activos. ¿Deseas propagar los cambios o guardar como nueva versión?"
    *   Visualización de cambios (Diff): Mostrar qué macros están cambiando antes de confirmar.

## 4. Supervisión y Dashboard (UX/UI)
*   **Terminal de Adherencia:** Nueva sección en el dashboard de coach para ver en tiempo real:
    *   Nombre del Alumno | Plan Activo | Kcal Target vs Real (Logs) | % Cumplimiento.
*   **Historial Visual:** Calendario de cumplimiento nutricional por alumno con mapas de calor de macros.

## 5. Hoja de Ruta (Todos)
- [ ] **SQL Migration:** Limpieza de datos antiguos y preparación de tablas para `template_id` y `is_custom`.
- [ ] **Shared Component:** Desarrollo de `NutritionMasterEditor`.
- [ ] **Logic Tier:** Implementación de Server Actions con validación estricta.
- [ ] **UI Refactor:** Aplicar modo Light/Dark con contraste optimizado y diseño responsivo.
- [ ] **Safety Layer:** Implementar modales de advertencia de impacto masivo.
- [ ] **Dashboard Update:** Integrar terminal de actividad nutricional detallada.

---
**Generado por Roo (Architect Mode)**
