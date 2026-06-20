# Client Excel Import — PLAN

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Spec:** `specs/client-excel-import/SPEC.md`

---

## Pre-requisito bloqueante

Antes de implementar, confirmar el schema final de `clients` para saber qué campos son importables. Si se agregan `weight_kg`, `height_cm`, `birth_date` a `clients` o a una tabla de perfil, hacerlo en migration separada PRIMERO. El import depende de estos campos.

---

## Architecture

Pipeline de import en 3 fases separadas (nunca en una sola operación):

1. **Parse & Validate** — recibe archivo, parsea, aplica column mapping, valida cada fila. Retorna preview JSON con estado de cada fila. NADA se escribe a DB.
2. **Confirm** — coach revisa preview, resuelve conflictos, confirma.
3. **Bulk Insert** — crea usuarios auth + inserta en `clients` en batch. Asíncrono para > 100 filas.

Data flow:

```
app/coach/clients/import/_data/import.queries.ts
  → services/clients/import.service.ts (parsing, mapping, validation)
  → infrastructure/db/client.repository.ts (bulk insert)
  → Supabase Auth Admin API + tabla clients
```

---

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `app/coach/clients/import/page.tsx` | RSC — entry point del import flow |
| CREATE | `app/coach/clients/import/_components/ImportDropzone.tsx` | Upload + magic bytes validation |
| CREATE | `app/coach/clients/import/_components/ColumnMapper.tsx` | UI de mapping con confianza visual |
| CREATE | `app/coach/clients/import/_components/ImportPreview.tsx` | Tabla paginada con errores por fila, edición inline |
| CREATE | `app/coach/clients/import/_components/ImportResult.tsx` | Pantalla de éxito + reporte de errores |
| CREATE | `app/coach/clients/import/_actions/import.actions.ts` | parseFile, confirmImport |
| CREATE | `services/clients/import.service.ts` | Column mapping, normalización, validación, duplicate check |
| CREATE | `services/clients/column-mapping/synonyms.ts` | Diccionario bilingüe ES/EN |
| CREATE | `services/clients/column-mapping/fuzzy.ts` | Levenshtein distance + similarity score |
| UPDATE | `infrastructure/db/client.repository.ts` | Agregar `bulkCreate(rows[], coachId)` |
| CREATE | `supabase/migrations/TIMESTAMP_import_jobs.sql` | Tabla staging para jobs asíncronos |
| UPDATE | `app/coach/clients/page.tsx` | Agregar botón "Importar desde Excel" |
| CREATE | `public/templates/eva-clientes-template.xlsx` | Template descargable con validaciones nativas |

---

## Data Model

### Nueva tabla: `import_jobs`

```sql
CREATE TABLE import_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES coaches(id),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','failed')),
  file_url    text,                    -- Storage path, auto-delete en 7 días
  total_rows  int,
  success_rows int DEFAULT 0,
  error_rows   int DEFAULT 0,
  preview_json jsonb,                  -- Resultado de parsing + mapping para UI
  errors_json  jsonb,                  -- Errores por fila para reporte descargable
  mapping_json jsonb,                  -- Column mapping confirmado por coach
  created_at  timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_own_import_jobs" ON import_jobs
  USING (coach_id = auth.uid());
```

### Campos adicionales en `clients` (si se decide agregar)

Requiere migration separada y decisión de producto. Campos candidatos:
- `birth_date date`
- `height_cm numeric`
- `initial_weight_kg numeric` (distinto de `goal_weight_kg`)

Si se agregan: regenerar `database.types.ts`.

### Storage

- Bucket: `import-uploads`
- Path: `{coach_id}/{timestamp}.xlsx`
- Policy: coach solo accede a su prefix
- Lifecycle: auto-delete a los 7 días (minimización de datos — Ley 19.628)

---

## Column Mapping Engine

### `services/clients/column-mapping/synonyms.ts`

Diccionario de normalización. Cada entrada: `normalized_variant → field_name`.

Normalización: lowercase → remove tildes (á/é/í/ó/ú→ae iou, ñ→n) → remove non-alphanumeric.

Campos mapeables:
- `full_name`: nombre, nombrecompleto, nombrecliente, nombreyapellido, fullname, name, cliente
- `email`: email, correo, mail, correoelectronico, emailcliente
- `phone`: telefono, tel, cel, celular, fono, phone, movil, whatsapp, contacto
- `birth_date`: fechanacimiento, fechanac, nacimiento, birthday, birthdate, fnac, dob
- `weight_kg`: peso, pesokg, pesoactual, pesoinicial, weight, kg
- `height_cm`: altura, talla, estatura, height, cm, alturacm
- `goal`: objetivo, meta, goal, motivacion, motivo
- `goal_weight_kg`: pesoobjetivo, metapeso, goalweight, pesometa

### `services/clients/column-mapping/fuzzy.ts`

Algoritmo:
1. Normalizar header del archivo
2. Buscar en diccionario → si match: confianza 100%
3. Si no: calcular Levenshtein distance vs cada field_name normalizado
4. similarity = (len_a + len_b - distance) / (len_a + len_b)
5. Retornar: `{ field: string | null, confidence: number, method: 'exact'|'fuzzy'|'none' }`

Umbrales:
- confidence ≥ 1.0 → auto-mapeado (verde)
- confidence ≥ 0.85 → sugerido (amarillo, coach puede cambiar)
- confidence ≥ 0.60 → sugerido con duda (naranja, debe confirmar)
- confidence < 0.60 → sin match (rojo, manual)

---

## Parsing & Validation

### Librerías

- `xlsx` (SheetJS) para `.xlsx`, `.xls` — con `cellFormula: false` (no ejecutar formulas)
- `papaparse` para `.csv` — con `skipEmptyLines: true`
- Rechazar `.xlsm` (con macros)
- Magic bytes check antes de parsear:
  - XLSX: `50 4B 03 04` (ZIP header)
  - XLS legacy: `D0 CF 11 E0` (CFB header)
  - CSV: solo text/plain

### Encoding detection

Orden de intento:
1. Detectar BOM (EF BB BF = UTF-8, FF FE = UTF-16 LE, FE FF = UTF-16 BE)
2. Si no hay BOM: intentar parsear como UTF-8
3. Si hay caracteres de reemplazo (U+FFFD): reintentar como Latin-1
4. Normalizar a UTF-8 antes de procesar

### Validaciones por campo

| Campo | Regla |
|---|---|
| `full_name` | Requerido, string no vacío, max 200 chars |
| `email` | Requerido, formato email válido (RFC 5321 básico), lowercase |
| `phone` | Opcional; si presente: normalizar a E.164 chileno (`+56XXXXXXXXX`); aceptar `9XXXXXXXX` y `+569XXXXXXXX` |
| `birth_date` | Opcional; parsear DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY; guardar como ISO date; error si ambiguo |
| `weight_kg` | Opcional; número 1-300; strip unidades (ej. "72 kg" → 72) |
| `height_cm` | Opcional; número 50-250; strip unidades |
| `goal_weight_kg` | Opcional; número 1-300 |

### CSV Injection sanitización

Antes de renderizar cualquier valor en UI de preview: si el valor empieza con `=`, `+`, `-`, `@`, escapar con prefijo `'` o strip el caracter inicial. Esto previene que Google Sheets / Excel ejecute formulas si el reporte de errores se descarga y abre.

### Duplicate detection

- **En el mismo archivo:** agrupar por email normalizado; segunda ocurrencia = warning
- **En DB:** `SELECT id FROM clients WHERE email = $1 AND coach_id = $2` para cada email; si existe = advertencia "ya existe, se actualizará"

---

## Server Actions

### `parseImportFile(file: File): Promise<ImportPreview>`

- Valida magic bytes + extensión
- Parsea con xlsx/papaparse
- Detecta encoding
- Aplica column mapping engine (dictionary → fuzzy)
- Valida cada fila
- Detecta duplicados (archivo + DB)
- Retorna: `{ mapping: ColumnMapping[], rows: RowPreview[], stats: {total, valid, warnings, errors} }`
- NO escribe nada a DB
- Sube archivo a Storage `import-uploads/`
- Crea `import_jobs` con status `pending` y `preview_json`

### `confirmImport(jobId: string, mapping: ColumnMapping[]): Promise<ImportResult>`

- Verifica ownership del job (`coach_id = auth.uid()`)
- Para ≤ 100 filas: proceso síncrono
- Para > 100 filas: actualiza job a `processing`, retorna job_id para polling
- Bulk insert: `adminClient.auth.admin.createUser()` + INSERT `clients` por cada fila válida
- Upsert por email + coach_id para actualizaciones
- Envía email de bienvenida via Resend a cada cliente nuevo
- Actualiza `import_jobs.status = 'completed'`, `success_rows`, `error_rows`, `errors_json`
- `revalidatePath('/coach/clients')`

### Para import asíncrono (> 100 filas)

Opción A: Supabase Edge Function procesando en background
Opción B: `pg_cron` job que procesa la cola
El frontend hace polling al `import_jobs.status` hasta `completed` o `failed`.

---

## UI/UX

### Entry point

En `/coach/clients`: botón "Importar desde Excel" junto al botón "Nuevo cliente". Abrir `/coach/clients/import` (página, no modal — flujo multi-paso necesita espacio).

### Paso 1 — Upload (ImportDropzone)

- Área de drag & drop con ícono de hoja de cálculo
- Botón secundario "Descargar plantilla" → descarga `eva-clientes-template.xlsx`
- Al soltar archivo: validación inmediata de tipo/tamaño
- Error si > 10MB o > 500 filas: "Tu archivo supera el límite. [Divide en archivos más pequeños]"
- Indicador de progreso durante upload a Storage

### Paso 2 — Column Mapping (ColumnMapper)

Tabla de dos columnas:
- Columna izquierda: headers del archivo del coach (tal como los escribió)
- Columna derecha: campo EVA sugerido (dropdown, pre-seleccionado según confidence)
- Color de fondo por confidence: verde / amarillo / naranja / rojo
- Opción "Ignorar columna" para columnas sin match
- Preview de primeras 3 filas de datos bajo cada columna para que coach vea contexto
- Botón "Continuar" deshabilitado si algún campo requerido (nombre, email) no está mapeado

### Paso 3 — Preview (ImportPreview)

Tabla paginada (25 filas por página):
- Fila verde: lista
- Fila amarilla: advertencia (ej. teléfono mal formateado) — botón "Importar de todas formas" por fila
- Fila roja: error bloqueante — botón "Editar" inline
- Celdas editables inline para correcciones menores (sin volver al archivo)
- Resumen arriba: "X listos, Y advertencias, Z errores bloqueantes"
- Toggle "Mostrar solo filas con problemas" para coaches con muchas filas

### Paso 4 — Confirmación

Resumen antes del insert:
- "Se crearán X clientes nuevos"
- "Se actualizarán Y clientes existentes"
- "Z filas serán omitidas (errores bloqueantes)"
- Si aplica: "Esto llevará tu cuenta de A a B clientes activos. [info de plan]"
- Checkbox: "Confirmo que tengo el consentimiento de mis clientes para procesar sus datos en EVA" (requerido para confirmar — Ley 19.628)
- Botón "Confirmar e importar"

### Paso 5 — Resultado (ImportResult)

- Animación de éxito (confetti moment)
- "X clientes importados correctamente"
- Si hubo errores: "Y clientes no pudieron importarse. [Descargar reporte de errores]"
- Botón "Ver mis clientes" → redirige a `/coach/clients`

### Mobile

Banner no bloqueante: "Para mejor experiencia, realiza esta importación desde tu computador." Si el coach insiste, flujo funciona igual (pasos en scroll vertical).

---

## Phases

### Fase 1 — MVP (Core)
- Upload `.xlsx` y `.csv`
- Column mapping con diccionario + fuzzy (sin AI)
- Preview con errores por fila
- Import de: `full_name`, `email`, `phone`
- Máximo 100 filas, proceso síncrono
- Email de bienvenida a clientes importados
- Upsert (no duplicar si email existe)
- Template descargable básico

### Fase 2 — Campos Extendidos
- Import de `birth_date`, `weight_kg`, `height_cm`, `goal_weight_kg` (requiere migration de schema)
- Proceso asíncrono para > 100 filas (con polling)
- Hasta 500 filas
- Template con validaciones nativas de Excel

### Fase 3 — Enterprise
- Import masivo 2000 filas para org admin
- Import de historial de check-ins (peso semana a semana)
- White-glove: admin EVA puede importar desde panel admin en nombre del coach
- Import history (ver imports pasados con sus resultados)

### Fase 4 — Integraciones Directas
- Conectar Google Sheets via OAuth → import directo sin descargar archivo
- Webhooks para reimport programado (scheduled sync)

---

## Test Plan

**Unit:**
- `normalizeHeader()` — tildes, ñ, espacios, caracteres especiales
- `matchColumn()` — cada variante del diccionario bilingüe
- `levenshteinSimilarity()` — pares conocidos con distancias esperadas
- `validateRow()` — cada tipo de campo con casos válidos e inválidos
- `detectEncoding()` — UTF-8 con BOM, Latin-1, UTF-16

**Integration (RLS):**
- Coach A no puede acceder a `import_jobs` de Coach B
- Import crea clientes con `coach_id` correcto

**E2E crítico:**
- Subir template de EVA con 10 filas válidas → confirmar → verificar 10 clientes en lista
- Subir archivo con 3 filas válidas + 2 con email inválido → 3 importados, 2 omitidos
- Re-importar mismo archivo → upsert, no duplicados
- Archivo con macros (`.xlsm`) → rechazado
- Archivo con CSV injection (`=CMD()`) → sanitizado correctamente

**Manual:**
- Archivo Latin-1 con tildes y ñ → caracteres correctos en DB
- Archivo con 501 filas → rechazado en upload
- Columnas en orden aleatorio vs template → mapping correcto
- Coach en móvil → banner visible + flujo funcional

---

## Rollback Plan

- Migration `import_jobs` es tabla nueva — rollback = DROP TABLE (sin datos críticos)
- Storage bucket `import-uploads` vacío se puede eliminar
- Clientes ya creados en bulk no se borran automáticamente en rollback — requeriría limpieza manual (motivo para hacer preview exhaustivo antes de confirmar)
- Feature está detrás de nueva ruta `/coach/clients/import` — simplemente no linkear desde nav hasta estar listo

---

## Consideraciones Finales de Seguridad

| Amenaza | Archivo | Mitigación |
|---|---|---|
| CSV injection | `ImportPreview.tsx` | Sanitizar `=`, `+`, `-`, `@` antes de render y en reporte descargable |
| XXE via XLSX | Parsing service | `cellFormula: false` en xlsx library |
| Macros en Excel | Upload action | Rechazar `.xlsm`; xlsx no ejecuta macros pero evitar por principio |
| SSRF via hyperlinks | Parsing service | Strip todos los hyperlinks durante parsing |
| Upload ejecutable con extensión .xlsx | Upload action | Magic bytes check server-side |
| PII en tránsito | — | HTTPS; archivo en Storage no aparece en logs; auto-delete 7 días |
| Importar clientes de otro coach | client.repository | email + coach_id como unique constraint; import scoped a auth.uid() |
