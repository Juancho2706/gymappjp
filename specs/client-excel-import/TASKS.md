# Client Excel Import — TASKS

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Spec:** `specs/client-excel-import/SPEC.md`  
**Plan:** `specs/client-excel-import/PLAN.md`

---

## Pre-requisito bloqueante (hacer ANTES de T1)

- [ ] P0 — Confirmar schema extendido de `clients`
  - Scope: Decisión de producto — ¿se agregan `birth_date`, `height_cm`, `initial_weight_kg` a `clients`? Si sí: migration separada primero, regenerar `database.types.ts`. Esta decisión determina cuántos campos son importables en v1.
  - Verification: Migration aplicada; types regenerados; campos disponibles en INSERT

---

## Fase 1 — MVP (100 filas, campos básicos)

### Infraestructura

- [ ] T1 — Migration tabla `import_jobs`
  - Scope: `supabase/migrations/TIMESTAMP_import_jobs.sql` — tabla con `id, coach_id, status, file_url, total_rows, success_rows, error_rows, preview_json, errors_json, mapping_json, created_at, completed_at`. RLS: coach ve solo sus jobs.
  - Verification: migration aplica sin error; coach A no puede SELECT jobs de coach B

- [ ] T2 — Storage bucket `import-uploads`
  - Scope: Crear bucket. Policy: coach accede solo a su prefix `{coach_id}/`. Lifecycle: auto-delete a los 7 días.
  - Verification: coach puede subir a su prefix; coach no puede leer prefix ajeno; archivo de test auto-eliminado a los 7 días

### Column Mapping Engine

- [ ] T3 — `services/clients/column-mapping/synonyms.ts`
  - Scope: Función `normalizeHeader(header: string): string` (lowercase, strip tildes, strip non-alphanumeric). Diccionario bilingüe completo ES/EN para todos los campos de `clients`. Función `lookupSynonym(normalized: string): string | null` que retorna field_name o null.
  - Verification: unit tests — todas las variantes del diccionario mapean al campo correcto; headers con tildes/ñ normalizan correctamente

- [ ] T4 — `services/clients/column-mapping/fuzzy.ts`
  - Scope: Función `levenshteinDistance(a: string, b: string): number`. Función `similarity(a: string, b: string): number` (fórmula normalizada). Función `matchColumn(header: string): ColumnMatch` que aplica diccionario primero, luego fuzzy. Retorna `{ field, confidence, method }`.
  - Verification: unit tests — distancias conocidas; threshold correctos (1.0 exact, 0.85+ auto, 0.60+ suggest, <0.60 none)

### Parsing & Validation

- [ ] T5 — `services/clients/import.service.ts` — parsing
  - Scope: `parseFile(buffer: Buffer, filename: string): ParseResult`. Magic bytes check (rechazar no-spreadsheet y .xlsm). Encoding detection (BOM → UTF-8 → Latin-1 fallback). Parse con `xlsx` (cellFormula: false) o `papaparse`. Aplicar column mapping engine a headers. Retornar estructura con headers mapeados + filas crudas.
  - Verification: unit tests — Excel Latin-1 con tildes; CSV UTF-8; archivo con macros rechazado; archivo ejecutable rechazado

- [ ] T6 — `services/clients/import.service.ts` — validación por fila
  - Scope: `validateRow(row: RawRow, mapping: ColumnMapping[]): ValidatedRow`. Validar: full_name requerido; email requerido + formato válido + lowercase; phone normalización E.164 chileno; birth_date parseo multi-formato; weight/height rangos y strip unidades. CSV injection sanitización (valores que empiezan con =, +, -, @). Retornar: `{ data, status: 'valid'|'warning'|'error', errors: FieldError[] }`.
  - Verification: unit tests — email inválido → error; teléfono `9XXXXXXXX` → normalizado a `+569XXXXXXXX`; CSV injection → sanitizado; fecha `01/02/1990` → ISO date

- [ ] T7 — `services/clients/import.service.ts` — duplicate detection
  - Scope: Duplicate dentro del mismo archivo (agrupar por email). Duplicate en DB (`SELECT` por email + coach_id). Marcar filas duplicadas con tipo de duplicado: `'in_file'` o `'in_db'`.
  - Verification: unit test de detección in-file; integration test — email existente en DB marcado como duplicate

### Repository

- [ ] T8 — `infrastructure/db/client.repository.ts` — `bulkCreate()`
  - Scope: Agregar `bulkCreate(rows: ValidatedClientData[], coachId: string): BulkCreateResult`. Usa `adminClient.auth.admin.createUser()` + INSERT en `clients` con `force_password_change: true, onboarding_completed: false`. Upsert por email + coach_id (ON CONFLICT DO UPDATE). Procesa en batches de 10 para no saturar Auth API. Retorna `{ created: string[], updated: string[], failed: FailedRow[] }`.
  - Verification: 10 filas válidas → 10 clientes creados; mismo email re-importado → updated, no duplicado

### Server Actions

- [ ] T9 — `app/coach/clients/import/_actions/import.actions.ts` — `parseImportFile`
  - Scope: Recibe `FormData` con archivo. Valida tamaño (≤ 10MB) y filas (≤ 500). Llama `import.service.parseFile()` + validaciones. Sube archivo a Storage. Crea `import_jobs` con preview_json + mapping_json. Retorna preview para UI.
  - Verification: archivo > 10MB rechazado; > 500 filas rechazado; archivo válido crea import_job con preview correcto

- [ ] T10 — `app/coach/clients/import/_actions/import.actions.ts` — `confirmImport`
  - Scope: Recibe `jobId` + mapping final confirmado por coach. Verifica ownership. Llama `client.repository.bulkCreate()`. Envía emails de bienvenida via Resend. Actualiza `import_jobs.status = 'completed'`. `revalidatePath('/coach/clients')`.
  - Verification: clientes creados en DB; emails enviados (mock en test); revalidatePath ejecutado

### UI

- [ ] T11 — `_components/ImportDropzone.tsx`
  - Scope: Dropzone con drag & drop. Acepta `.xlsx`, `.xls`, `.csv`. Preview del nombre del archivo seleccionado. Botón "Descargar plantilla". Mensajes de error para tipo/tamaño inválidos. Llama `parseImportFile` al seleccionar archivo.
  - Verification: drag & drop funciona en Chrome/Safari/Firefox; archivo inválido muestra error correcto

- [ ] T12 — `_components/ColumnMapper.tsx`
  - Scope: Tabla con columnas del archivo (izquierda) vs dropdown de campos EVA (derecha). Color de fondo por confidence (verde/amarillo/naranja/rojo). Preview de primeras 3 filas de datos bajo cada columna. Opción "Ignorar columna". "Continuar" deshabilitado si `full_name` o `email` no mapeados.
  - Verification: auto-mapeo correcto visible; coach puede cambiar dropdown; "Continuar" bloqueado sin nombre/email

- [ ] T13 — `_components/ImportPreview.tsx`
  - Scope: Tabla paginada 25 filas/página. Filas con colores por estado. Celdas editables inline para correcciones. Toggle "Mostrar solo problemas". Resumen de stats arriba. Botón "Importar de todas formas" en filas con advertencias.
  - Verification: edición inline actualiza la fila; toggle filtra correctamente; stats correctos

- [ ] T14 — `_components/ImportResult.tsx`
  - Scope: Pantalla post-import. Stats finales. Botón descargar reporte errores en CSV (sanitizado — no CSV injection). Link "Ver mis clientes".
  - Verification: CSV de errores descargable; link redirige a /coach/clients

- [ ] T15 — `app/coach/clients/import/page.tsx`
  - Scope: RSC orquestador del flujo de 4 pasos. Estado del paso actual. Manejo de back entre pasos. Checkbox de consentimiento antes de confirmar (requerido — Ley 19.628).
  - Verification: navegación entre pasos funcional; confirmar bloqueado sin checkbox

- [ ] T16 — Template Excel descargable
  - Scope: `public/templates/eva-clientes-template.xlsx`. Headers correctos, fila de ejemplo con datos ficticios, comentarios en headers, validaciones nativas en Excel (dropdown objetivo, formato fecha). Hoja 2 con instrucciones en español.
  - Verification: abrir en Excel/Sheets — validaciones funcionan; ejemplo visible

- [ ] T17 — Botón entry point en `/coach/clients`
  - Scope: Agregar botón "Importar desde Excel" en la página de clientes existente.
  - Verification: botón visible; navega a /coach/clients/import

---

## Fase 2 — Campos Extendidos (requiere P0)

- [ ] T18 — Agregar campos extendidos al import service
  - Scope: Activar parsing/validación de `birth_date`, `height_cm`, `initial_weight_kg` en `validateRow()`. Activar estos campos en `bulkCreate()`. Requiere que schema ya tenga los campos (P0).
  - Verification: campos importados correctamente en DB

- [ ] T19 — Template Excel actualizado con campos extendidos
  - Scope: Agregar columnas nuevas al template con sus validaciones nativas.
  - Verification: template descargable tiene columnas nuevas

- [ ] T20 — Import asíncrono para > 100 filas
  - Scope: En `confirmImport`: si filas > 100, actualizar job a `processing` y retornar job_id. Edge Function o pg_cron procesa en background. Frontend polling `import_jobs.status`. Push notification al terminar. Timeout alert si status `processing` > 5 min.
  - Verification: import de 200 filas completa en background; push notification recibida

- [ ] T21 — Subir límite a 500 filas
  - Scope: Actualizar validación en `parseImportFile`. Actualizar UI de error.
  - Verification: 499 filas → acepta; 501 filas → rechaza con mensaje correcto

---

## Universal Definition of Done

- [ ] `npm run typecheck`
- [ ] Unit tests para column mapping engine (synonyms + fuzzy)
- [ ] Unit tests para validateRow (cada tipo de campo + CSV injection)
- [ ] E2E: upload template EVA → confirmar → verificar clientes en DB
- [ ] RLS test: coach A no puede ver import_jobs de coach B
- [ ] No llamadas directas a Supabase en `_data/` (van por repository)
- [ ] Server actions validan con Zod
- [ ] `revalidatePath('/coach/clients')` después de import exitoso
- [ ] Checkbox de consentimiento presente y requerido antes de confirmar
- [ ] Archivo de import auto-eliminado de Storage en 7 días (verificar lifecycle rule)
- [ ] Mobile viewport usa `dvh` no `vh`
- [ ] Dark mode verificado en componentes nuevos
- [ ] Docs actualizados: `docs/architecture/FLOWS_AND_COMPONENTS.md`

---

## Notes

- Nunca ejecutar `confirmImport` sin previa confirmación del usuario — los clientes creados con auth no se pueden "deshacer" automáticamente.
- El reporte de errores descargable debe sanitizar CSV injection exactamente igual que la preview interna.
- Email de bienvenida: usar template Resend existente si existe; crear nuevo si no. Confirmar con CSM qué copy usar.
- Fase 1 (T1-T17) es completamente independiente de Fases 2-4. Lanzar cuando esté lista.
- El diccionario de sinónimos (T3) debe ser fácil de extender — coaches van a reportar variantes que no cubrimos inicialmente. Diseñar como array de tuplas, no como objeto fijo.
