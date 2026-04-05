# Plan Maestro: Migración de Ejercicios desde ExerciseDB API

## 1. Objetivo
Extraer una lista específica de ejercicios desde el repositorio `bryanprimus/exercisedb-api` e insertarlos en la base de datos de la aplicación (Supabase), incluyendo sus respectivos GIFs. Se mantendrán los nombres e instrucciones en inglés, pero se traducirán las categorías (músculos/body parts) al español para coincidir con los filtros actuales de la app.

## 2. Mapeo de Categorías (Inglés -> Español)
De acuerdo a la lista proporcionada, implementaremos el siguiente diccionario de traducción estricto en el script:
- **Triceps** -> Tríceps
- **Pectorals** -> Pectorales
- **Glutes** -> Glúteos
- **Biceps** -> Bíceps
- **Quads** -> Cuádriceps
- **Delts** -> Hombros
- **Abs** -> Abdominales
- **Cardiovascular System** -> Cardio
- **Abductors** -> Abductores
- **Calves** -> Pantorrillas
- **Forearms** -> Antebrazos
- **Upper Back** -> Espalda Alta
- **Lats** -> Dorsales
- **Hamstrings** -> Isquiotibiales
- **Spine** -> Lumbar / Espalda Baja
- **Adductors** -> Aductores
- **Traps** -> Trapecios

## 3. Pasos de Ejecución (Script de Node.js)

### Fase A: Preparación de Datos
1. **Descargar la data base:** Obtener el archivo `exercises.json` del repositorio (o clonarlo temporalmente si los GIFs están alojados allí localmente en carpetas).
2. **Filtrar:** Leer el archivo JSON original y extraer **únicamente** los ejercicios cuyos nombres coincidan de forma exacta con la lista provista por el usuario.

### Fase B: Transformación
3. **Traducción:** Iterar sobre los ejercicios filtrados. Mantener `name` e `instructions` (si existen) en inglés. Reemplazar el valor de `target` y/o `bodyPart` usando el diccionario de mapeo a español.
4. **Preparación del payload:** Formatear el objeto resultante para que coincida exactamente con el schema de la tabla `exercises` en Supabase (ej. `id`, `name`, `muscle_group`, `equipment`, `video_url`, etc.).

### Fase C: Migración de GIFs y Base de Datos
5. **Subida de GIFs:** Por cada ejercicio filtrado, localizar su archivo GIF correspondiente (ya sea descargándolo de una URL proveída por la API o del repo local) y subirlo al bucket `exercise-animations` en la carpeta `catalog/`.
6. **Inserción en BD:** Una vez el GIF se suba con éxito, tomar la URL pública del GIF y asignarla al campo correspondiente (ej. `video_url` o `gif_url`) en el payload del ejercicio. Finalmente, hacer un `supabase.from('exercises').insert(...)`.

## 4. Validaciones Finales
- Verificar que el número de registros insertados coincida con el número de ejercicios en la lista provista.
- Comprobar que los GIFs se visualicen correctamente y tengan permisos públicos.
- Confirmar que los filtros en la app funcionen con las nuevas categorías en español.