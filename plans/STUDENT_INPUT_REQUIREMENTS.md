# Requerimientos de Input del Alumno (App Cliente)

Este documento detalla las interacciones clave que el alumno (cliente) debe realizar en su aplicación para alimentar el dashboard del coach (Overview).

## 1. Módulo de Nutrición: "Marcar comida como lista"

**Descripción:** El alumno debe poder marcar las comidas de su plan nutricional diario como completadas.

**UI/UX:**
- En la vista diaria de nutrición, cada comida (ej. Desayuno, Almuerzo, Cena) debe tener un checkbox, botón o deslizable intuitivo.
- Al marcarlo, se debe mostrar un feedback visual inmediato (ej. checkmark verde, pequeña animación, barra de progreso diaria que se llena).
- Posibilidad de desmarcar en caso de error.

**Impacto en Base de Datos:**
- Inserta un registro en la tabla `meal_completions`.
- Datos necesarios: `client_id`, `meal_id` (identificador de la comida específica en el plan), `date_completed` (fecha en la que se realizó).
- Si se desmarca, se elimina el registro correspondiente.

**Impacto en Overview del Coach:**
- Aumenta el porcentaje de "Adherencia Nutricional" (Radar y Métricas).
- Contribuye a mantener activa la "Racha" (Streak) de días consecutivos.

---

## 2. Módulo de Entrenamiento: "Completar entrenamiento del día"

**Descripción:** Al finalizar su sesión de ejercicios, el alumno debe confirmarlo en la app.

**UI/UX:**
- Al final de la lista de ejercicios del día, debe existir un botón principal y destacado (Call to Action): "Completar Entrenamiento" o "Finalizar Sesión".
- Opcional pero recomendado: Mostrar un resumen rápido de lo realizado y pedir una breve nota o feedback (RPE - Rate of Perceived Exertion, ¿cómo se sintió?).
- Celebración visual al completarlo (confeti, mensaje motivacional).

**Impacto en Base de Datos:**
- Inserta un registro en la tabla `workout_sessions`.
- Datos necesarios: `client_id`, `plan_id` (opcional, para vincular al programa), `date_completed`, `notes` (feedback opcional del usuario).
- *Nota: Esto es independiente del registro detallado serie por serie (logs de ejercicios), es una confirmación global de la sesión.*

**Impacto en Overview del Coach:**
- Aumenta la métrica de "Cumplimiento Entrenamientos" (Radar y Métricas).
- Mantiene activa la "Racha" (Streak).

---

## 3. Módulo de Progreso: "Nuevo Check-in"

**Descripción:** Formulario periódico (generalmente semanal) donde el alumno reporta su estado físico y mental actual.

**UI/UX:**
- Modal o pantalla dedicada tipo "Wizard" (paso a paso) para no abrumar al usuario.
- **Secciones:**
    1.  **Biometría básica:** Peso actual (obligatorio), % de grasa corporal (opcional).
    2.  **Fotos de progreso (opcional pero recomendado):** Subida de fotos de Frente, Perfil y Espalda. Usar compresión en el cliente antes de subir.
    3.  **Bienestar subjetivo (Escala 1-5):** Nivel de Energía, Calidad de Sueño, Digestión. Usar iconos (caritas, estrellas, baterías) en lugar de solo números.
    4.  **Notas libres:** Espacio para que el alumno comente cómo se sintió en la semana.

**Impacto en Base de Datos:**
- Inserta un registro en la tabla `check_ins`.
- Posible subida de archivos a Supabase Storage (para las fotos) y guardado de las URLs en la tabla.

**Impacto en Overview del Coach:**
- Actualiza la métrica de "Peso" y genera el gráfico de progreso de peso.
- Las fotos alimentan la galería comparativa (PhotoComparisonSlider).
- Las métricas subjetivas alimentan los indicadores dinámicos (Dormir, Energía) en la UI del Coach.
