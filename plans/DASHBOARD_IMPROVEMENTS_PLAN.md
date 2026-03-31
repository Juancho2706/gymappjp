# Plan de Mejora: Dashboard del Coach

El dashboard actual ofrece una vista básica (número de alumnos, rutinas asignadas y actividad reciente sobre check-ins o nuevos alumnos). Para hacerlo verdaderamente útil para un coach, debemos transformarlo en un centro de mando operativo que destaque lo que requiere acción inmediata y provea métricas de valor.

## Problemas Actuales
1. **Métricas Estáticas:** Las tarjetas muestran números (alumnos, rutinas) pero 2 de ellas ("Esta Semana", "Check-ins Pendientes") están hardcodeadas en `0`.
2. **Falta de Accionabilidad:** El dashboard informa, pero no guía al coach sobre qué debe hacer *hoy* (ej. rutinas por vencer, alumnos que no han reportado).
3. **Visibilidad de Retención:** No hay datos sobre alumnos inactivos o aquellos que puedan cancelar pronto.

## Propuestas de Mejora y Nuevas Funcionalidades

### 1. Panel de Acción Inmediata (To-Do List Automática)
Un componente clave en la parte superior que resuma lo que el coach necesita hacer hoy:
- **Check-ins por revisar:** Lista rápida de alumnos que enviaron su check-in y no han recibido feedback.
- **Rutinas por expirar:** Alertas de planes de entrenamiento que terminan en los próximos 3-5 días.
- **Mensajes/Notificaciones sin leer:** (Si existe un sistema de mensajería) alertas de consultas de alumnos.
- **Cumpleaños del mes:** Un detalle para fidelizar alumnos.

### 2. KPIs y Métricas Reales
Arreglar las tarjetas actuales e incluir métricas que reflejen el estado del negocio:
- **Alumnos Activos vs Inactivos:** Mostrar la tendencia (ej. "+2 este mes").
- **Tasa de Adherencia (Compliance):** Un porcentaje general de cuántos alumnos están cumpliendo con sus rutinas y dietas esta semana (basado en check-ins y entrenamientos registrados).
- **Check-ins Pendientes:** Calcular realmente cuántos alumnos debían hacer check-in y no lo han hecho.

### 3. Vista Rápida de Progreso (Highlights)
Un carrusel o lista de "Destacados de la semana":
- "Juan Pérez ha levantado su PR en Sentadilla (100kg)".
- "María bajó 2kg esta semana".
- Esto motiva al coach y le da temas de conversación inmediatos con sus alumnos.

### 4. Gráficos de Retención y Crecimiento (Opcional pero recomendado)
Integrar un gráfico simple usando una librería como `recharts` que muestre la evolución de alumnos activos en los últimos 6 meses.

### 5. Acciones Rápidas (Quick Actions)
Mejorar los botones de acción para permitir al coach:
- "Asignar Rutina Rápida"
- "Revisar Check-ins (2 pendientes)"
- "Enviar Recordatorio Masivo"

---

## Pasos para la Implementación (To-Do List Técnica)

1. **Actualizar Consultas a Base de Datos (Backend):**
   - Modificar las queries en `page.tsx` para obtener datos reales para "Check-ins Pendientes".
   - Crear query para identificar planes de entrenamiento por vencer.
2. **Crear Componente "Panel de Alertas/Acción":**
   - UI para mostrar rutinas expirando y alumnos sin reporte.
3. **Mejorar Tarjetas de Estadísticas:**
   - Implementar cálculo de tendencias (comparativa con el mes anterior si es posible).
   - Reemplazar los valores en `0` por datos reales de Supabase.
4. **Expandir el Feed de Actividad:**
   - Incluir hitos de entrenamiento (ej. cuando un alumno completa un workout).
5. **(Opcional) Implementar Gráfico de Evolución:**
   - Añadir `recharts` o usar gráficos simples en SVG/CSS para mostrar crecimiento de alumnos.