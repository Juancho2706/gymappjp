# Arquitectura y Logística del Sistema de Nutrición

Este documento describe la filosofía de diseño y el funcionamiento técnico del sistema de gestión de planes nutricionales implementado para la plataforma. El objetivo es ofrecer un modelo híbrido que combine la eficiencia de las herramientas masivas (plantillas) con la precisión de la individualización.

## 1. El Concepto de los Dos Estados

Para evitar que los coaches sobreescriban accidentalmente planes muy específicos de sus alumnos al actualizar plantillas globales, introdujimos una capa de estado a nivel de base de datos (`is_custom`).

### 1.1. Estado "Synced" (Sincronizado)
- **Definición:** El plan es una "copia espejo" de una Plantilla Maestra.
- **¿Cómo se crea?** Al usar el botón "Asignar" desde la lista de Protocolos Maestros hacia un alumno.
- **Comportamiento:** Si el coach edita la Plantilla Maestra original, el sistema actualiza automáticamente los planes de todos los alumnos que tengan el estado "Synced" vinculado a ese `template_id`.

### 1.2. Estado "Custom" (Personalizado)
- **Definición:** El plan es independiente y único para el alumno.
- **¿Cómo se crea?**
  1. Cuando creas un plan desde cero estando en el perfil de un alumno.
  2. **(Desvinculación Automática)**: Cuando entras al perfil de un alumno que tenía un plan "Synced", le das a "Gestionar Plan" y guardas cualquier cambio. El sistema asume que le has hecho un traje a medida, y corta el vínculo (`is_custom = true`).
- **Comportamiento:** Si el coach edita la Plantilla Maestra original de la que provenía, este plan "Custom" es ignorado, protegiendo así los ajustes manuales realizados.

## 2. Componente Central: NutritionMasterEditor

Todo el sistema de edición de alimentos (para plantillas o alumnos) funciona ahora bajo un único componente: `NutritionMasterEditor.tsx`.

- **Atributos:**
  - `mode="template"`: Para crear/editar moldes.
  - `mode="individual"`: Para crear/editar planes desde el perfil de un alumno específico.
- **Validación en Tiempo Real (QA):** Calcula `Kcal`, `Proteínas`, `Carbos` y `Grasas` multiplicando las cantidades por las porciones de la base de datos de alimentos. Si hay un desfase > 5% entre los macros que pide el plan y la suma de la comida ingresada, activa una alerta visual (Warning Ámbar) y ofrece un botón para "Sincronizar Plan" (auto-ajustar las metas).

## 3. Flujo de Datos y Operaciones Atómicas

Para garantizar que no se generen "basuras" (comidas huérfanas o alimentos duplicados en base de datos), las acciones de servidor (`actions.ts`):

1. **Delete & Re-insert (Estrategia Atómica):** Al actualizar un plan, en lugar de intentar hacer *upsert* complejo de cada comida, el sistema borra las comidas asociadas al plan anterior y vuelve a insertarlas limpiamente desde el formulario.
2. **Propagación Masiva:** Cuando se actualiza una plantilla, un script busca a todos los alumnos en estado `Synced`. Por cada alumno, el script inactiva el plan viejo y crea uno nuevo copiado del molde actualizado.

## 4. UI/UX: Claridad para el Coach

- **Icono de Ayuda Radiante:** En el panel de nutrición, un ícono amarillo/ámbar abre un modal con un resumen "para mortales" de cómo funciona el sistema de `Sincronizados` vs `Custom`.
- **Badges Visuales:** Las "Cards" de los alumnos ahora indican claramente si su plan actual es `SYNCED` (Verde) o `CUSTOM` (Naranja).
- **Advertencias Anticipadas:** Al asignar una plantilla desde el modal, el sistema advierte que "Si el alumno ya tiene un plan activo, será reemplazado".

Con este enfoque, la gestión de datos es estricta (no hay macros fantasma), pero la experiencia para el coach es fluida, permitiéndole manejar volumen de alumnos con el mínimo margen de error posible.