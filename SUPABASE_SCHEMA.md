# Esquema de Base de Datos y Storage en Supabase (Coach Op)

Este documento detalla todas las tablas públicas configuradas en la base de datos de Supabase, sus columnas clave y las relaciones entre ellas, además de los Buckets de Storage utilizados.

---

## 📦 Buckets de Storage (Almacenamiento de Archivos)

1.  **`logos`**
    *   **Uso:** Almacena los logotipos o imágenes de marca de los entrenadores (Coaches).
    *   **Acceso:** Público (lectura) para que los logotipos puedan renderizarse en la aplicación cliente (`/c/[coach_slug]`).
2.  **`check-ins` / Fotos de progreso** (Inferido por esquema)
    *   **Uso:** Almacena las imágenes de progreso (`front_photo_url`) subidas por los alumnos en sus check-ins periódicos.
    *   **Acceso:** Protegido mediante políticas RLS (solo el coach dueño del alumno y el propio alumno pueden verlas).
3.  **`receipts` / Comprobantes de pago** (Inferido por esquema)
    *   **Uso:** Almacenamiento de recibos de transferencias (`receipt_image_url` en la tabla `client_payments`).

---

## 🗄️ Tablas de Base de Datos (Public Schema)

A continuación se listan las tablas de la base de datos agrupadas por su dominio lógico.

### 👥 Dominio: Usuarios y Perfiles

#### 1. `coaches` (Entrenadores)
Contiene la información de los administradores y su configuración de marca blanca (multitenant).
*   **Columnas Clave:** `id` (PK), `slug` (URL de su entorno), `brand_name`, `full_name`, `primary_color`, `logo_url`.
*   **Suscripción:** `subscription_tier`, `subscription_status`, `subscription_mp_id`, `trial_ends_at`.
*   **Configuración UI:** `use_brand_colors_coach`.

#### 2. `clients` (Alumnos)
Usuarios finales asignados a un entrenador específico.
*   **Columnas Clave:** `id` (PK), `coach_id` (FK a `coaches`), `email`, `full_name`, `phone`, `is_active`.
*   **Estado:** `onboarding_completed`, `force_password_change`, `subscription_start_date`.

#### 3. `client_intake` (Formulario de Ingreso)
Datos iniciales recolectados del alumno durante el onboarding.
*   **Columnas Clave:** `id` (PK), `client_id` (FK a `clients` - 1 a 1).
*   **Métricas y Metas:** `weight_kg`, `height_cm`, `experience_level`, `goals`, `availability`.
*   **Salud:** `injuries`, `medical_conditions`.

#### 4. `check_ins` (Revisiones de Progreso)
Registros periódicos del alumno para monitorear su evolución física.
*   **Columnas Clave:** `id` (PK), `client_id` (FK a `clients`), `date`.
*   **Métricas:** `weight`, `energy_level`, `front_photo_url`, `notes`.

#### 5. `client_payments` (Registro de Pagos)
Módulo de facturación entre el alumno y el coach.
*   **Columnas Clave:** `id` (PK), `client_id` (FK a `clients`), `coach_id` (FK a `coaches`), `amount`, `payment_date`.
*   **Detalles:** `period_months`, `service_description`, `status`, `receipt_image_url`.

---

### 🏋️ Dominio: Entrenamiento (Workout)

#### 6. `exercises` (Catálogo de Ejercicios)
Catálogo base de ejercicios. Puede ser global o personalizado por coach.
*   **Columnas Clave:** `id` (PK), `name`, `muscle_group`, `body_part`, `equipment`.
*   **Media y Detalles:** `gif_url`, `video_url`, `video_start_time`, `video_end_time`, `instructions` (array).
*   **Relaciones:** `coach_id` (FK a `coaches`, nulo si es un ejercicio global/por defecto).

#### 7. `workout_programs` (Programas de Entrenamiento)
El programa macro o "rutina" (ej. "Hipertrofia 12 semanas").
*   **Columnas Clave:** `id` (PK), `name`, `coach_id` (FK a `coaches`), `client_id` (Opcional, FK a `clients` si es asignado directo).
*   **Fechas:** `start_date`, `end_date`, `is_active`, `weeks_to_repeat`.

#### 8. `workout_plans` (Plan / Día de Entrenamiento)
Un día específico dentro del programa (ej. "Día 1: Pecho y Tríceps").
*   **Columnas Clave:** `id` (PK), `title`, `program_id` (FK a `workout_programs`), `coach_id`, `client_id`.
*   **Organización:** `day_of_week`, `group_name`, `assigned_date`.

#### 9. `workout_blocks` (Bloques / Ejercicios por Día)
Las series y repeticiones prescritas para un ejercicio en un día de rutina.
*   **Columnas Clave:** `id` (PK), `plan_id` (FK a `workout_plans`), `exercise_id` (FK a `exercises`).
*   **Prescripción:** `sets`, `reps` (string, ej. "10-12"), `target_weight_kg`, `rir` (Reps In Reserve), `rest_time`, `tempo`, `notes`, `order_index`.

#### 10. `workout_logs` (Registro de Ejecución del Alumno)
Donde se guarda el trabajo real hecho por el alumno en vivo.
*   **Columnas Clave:** `id` (PK), `client_id` (FK a `clients`), `block_id` (FK a `workout_blocks`), `logged_at`.
*   **Desempeño Real:** `set_number`, `reps_done`, `weight_kg`, `rpe` (Rate of Perceived Exertion), `plan_name_at_log`.

---

### 🥗 Dominio: Nutrición y Alimentación

#### 11. `foods` (Catálogo de Alimentos base)
Base de datos de alimentos con sus macronutrientes.
*   **Columnas Clave:** `id` (PK), `name`, `coach_id` (FK a `coaches` si es propio del coach).
*   **Macros:** `calories`, `protein_g`, `carbs_g`, `fats_g`, `serving_size`, `serving_unit`.

#### 12. `recipes` (Catálogo de Recetas)
Recetas creadas por el coach (con imagen e instrucciones).
*   **Columnas Clave:** `id` (PK), `name`, `coach_id`, `image_url`, `instructions`, `prep_time_minutes`.
*   **Macros Totales:** `calories`, `protein_g`, `carbs_g`, `fats_g`.

#### 13. `recipe_ingredients` (Ingredientes de Recetas)
*   **Columnas Clave:** `id` (PK), `recipe_id` (FK a `recipes`), `food_id` (Opcional, FK a `foods`), `name`, `quantity`, `unit`.

#### 14. `nutrition_plan_templates` (Plantillas Nutricionales)
Dieta o distribución de macros base creada por el coach.
*   **Columnas Clave:** `id` (PK), `name`, `coach_id`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`, `instructions`.

#### 15. `template_meals` y `template_meal_groups` (Comidas en Plantilla)
Estructura las comidas (Desayuno, Almuerzo) dentro de una plantilla.
*   `template_meals`: Agrupa la comida (`name`, `order_index`, `template_id`).
*   `template_meal_groups`: Relaciona a alimentos guardados (`saved_meal_id`).

#### 16. `saved_meals` y `saved_meal_items` (Comidas Guardadas/Combinaciones)
*   `saved_meals`: Un plato recurrente del coach (ej. "Avena proteica").
*   `saved_meal_items`: Ingredientes específicos de ese plato vinculando a `foods`.

#### 17. `nutrition_plans` (Planes Asignados a Alumnos)
Instancia del plan nutricional para un cliente.
*   **Columnas Clave:** `id` (PK), `name`, `client_id` (FK), `coach_id` (FK), `template_id` (FK opcional), `is_active`.
*   **Macros Objetivo:** `daily_calories`, `protein_g`, `carbs_g`, `fats_g`.

#### 18. `nutrition_meals` (Comidas Asignadas al Alumno)
El Desayuno, Almuerzo, Cena de su plan actual.
*   **Columnas Clave:** `id` (PK), `plan_id` (FK a `nutrition_plans`), `name`, `description`.

#### 19. `food_items` (Alimentos en Comida Asignada)
*   **Columnas Clave:** `id` (PK), `meal_id` (FK a `nutrition_meals`), `food_id` (FK a `foods`), `quantity`, `unit`.

#### 20. `daily_nutrition_logs` (Registro Nutricional Diario del Alumno)
Hoja en blanco que se genera por cada día para que el alumno marque lo que comió.
*   **Columnas Clave:** `id` (PK), `client_id` (FK), `plan_id` (FK), `log_date`.
*   **Snapshot Histórico:** `target_calories_at_log`, `target_protein_at_log`, `target_carbs_at_log`, `target_fats_at_log`.

#### 21. `nutrition_meal_logs` (Tracking de Comidas por Alumno)
El checkbox final donde el alumno dice "Comí esto".
*   **Columnas Clave:** `id` (PK), `daily_log_id` (FK a `daily_nutrition_logs`), `meal_id` (FK a `nutrition_meals`), `is_completed`.