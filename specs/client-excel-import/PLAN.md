# PLAN — Excel Client Importer

## Arquitectura

Cliente parsea XLSX/CSV con SheetJS (browser), envía rows estructuradas a server action. Server procesa en chunks con `Promise.allSettled`, reusa `_createClientInternal` (extracted de `createClientAction` existente para evitar duplicación de lógica admin API + welcome email).

Audit en tabla nueva `client_imports` (status, summary, errors jsonb). Log en `admin_audit_logs` con consent timestamp.

## Database changes

### Migration: `<ts>_client_imports_table.sql`
```sql
CREATE TABLE client_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  filename text NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  success_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  consent_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE client_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_imports_owner_all ON client_imports FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE INDEX CONCURRENTLY client_imports_coach_created_idx
  ON client_imports (coach_id, created_at DESC);
```

Tabla nueva — sin impacto en queries existentes.

## Dependencies nuevas

- `xlsx` (SheetJS) — Excel parser, 20+ formatos, battle-tested.
- `fastest-levenshtein` (~5KB) — distance para fuzzy header matching.

## Helpers nuevos

### `src/lib/import/header-matcher.ts` (sin AI)

```ts
import { distance } from 'fastest-levenshtein'

export type ImportField = 'full_name' | 'email' | 'phone' | 'subscription_start_date'

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  full_name: ['nombre', 'nombre completo', 'name', 'full name', 'alumno',
              'cliente', 'apellido y nombre', 'nombre y apellido', 'nombres'],
  email: ['email', 'correo', 'e-mail', 'mail', 'correo electronico',
          'correo electrónico', 'e mail'],
  phone: ['telefono', 'teléfono', 'celular', 'whatsapp', 'phone',
          'movil', 'móvil', 'tel', 'fono', 'numero', 'número'],
  subscription_start_date: ['fecha inicio', 'inicio', 'start date',
                            'fecha alta', 'desde', 'fecha de inicio',
                            'comienzo', 'fecha registro'],
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}

export type HeaderMatch = {
  field: ImportField | null
  confidence: 'exact' | 'fuzzy' | 'none'
  similarity: number
}

export function matchHeader(rawHeader: string): HeaderMatch
export function matchHeaders(rawHeaders: string[]): Record<number, HeaderMatch>
```

Tests: 30+ casos (exact, typos, acentos, case, separadores).

### `src/lib/import/csv-injection.ts`
```ts
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r']
export function sanitizeCell(value: string): { value: string, sanitized: boolean }
```

## Server actions

### `src/app/coach/clients/import/_actions/import.actions.ts`

```ts
'use server'

const importRowSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  subscription_start_date: z.string().optional(),
})

export async function importClientsAction(input: {
  rows: unknown[]
  filename: string
  consent: boolean
}) {
  // 1. auth + tier gate (canImportClients)
  // 2. consent === true
  // 3. rateLimitBulkImport(coachId)
  // 4. verify active + rows.length ≤ max_clients
  // 5. insert client_imports row (status='processing', consent_confirmed_at=now())
  // 6. process chunks of 10:
  //    - sanitize CSV injection
  //    - Zod validate
  //    - skip if email exists in DB
  //    - call _createClientInternal
  //    - capture errors
  //    - update success/error counts
  // 7. update client_imports status='completed', errors jsonb, completed_at
  // 8. log admin_audit_logs action='client.bulk_import'
  // 9. revalidatePath('/coach/clients')
}

export async function getImportTemplate() {
  // returns URL to /templates/import-alumnos.xlsx
}

export async function downloadErrorReport(importId: string) {
  // RLS-protected; returns CSV string with failed rows + error
}
```

### Refactor `src/app/coach/clients/actions.ts`
Extraer:
```ts
async function _createClientInternal(
  coach: { id: string, max_clients: number, ... },
  data: { full_name: string, email: string, phone?: string, ... },
  options?: { sendEmail?: boolean, fromImport?: boolean, tempPassword?: string }
): Promise<{ success: boolean, clientId?: string, error?: string }>
```
`createClientAction` se convierte en wrapper que llama interno. `import.actions.ts` también llama interno.

## Rate limit

### `src/lib/rate-limit.ts` (modificar)
Agregar:
```ts
export const rateLimitBulkImport = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),  // 3 imports/hora
  prefix: 'rl:bulk_import',
})
```
Y lock pattern para max 1 simultáneo (usar `client_imports.status='processing'` como semaphore: query antes de crear nueva).

## UI components

### Página `src/app/coach/clients/import/page.tsx`
RSC. Si free → `<UpsellGate gate="import_clients" />`. Si starter+ → `<ImportWizard />`.

### `_components/ImportWizard.tsx` ('use client')
Orquesta 4 pasos con stepper top. Estado `useReducer` (steps state machine).

### Step 1: `_components/Step1Upload.tsx`
- Drop zone con drag-drop + click.
- Parser SheetJS:
  ```ts
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
  ```
- Validaciones: tamaño 5MB, MIME real, > 1000 rows warning.

### Step 2: `_components/Step2MapColumns.tsx`
- Tabla 2 cols: header Excel + select EVA field.
- Badges 🟢/🟡/⚪.
- Persist mapping en `localStorage` keyed por header signature.

### Step 3: `_components/Step3Preview.tsx`
- Tabla con primeras 50 rows.
- Celdas rojas (error) / amarillas (warning) / azules (sanitized) con tooltips.
- Resumen top: válidas/warnings/errores/duplicados.
- Filtro show errores.
- Query previa duplicados DB.

### Step 4: `_components/Step4Confirm.tsx`
- Resumen card.
- Verifica `max_clients` y muestra upgrade si excede.
- Checkbox legal obligatorio.
- Botón "Importar N alumnos".

### `_components/ImportProgress.tsx`
- Polling cada 2s a `client_imports.status` durante processing.
- Barra progreso + "Procesando 12/47..."

### `_components/ImportResultSummary.tsx`
- Éxito/errores breakdown.
- Botón "Descargar reporte (CSV)".
- Botón "Ir a mi cartera".

## Asset

`public/templates/import-alumnos.xlsx`:
- Headers: `Nombre completo | Email | Teléfono | Fecha de inicio (DD/MM/AAAA)`
- 2 filas ejemplo: `Juan Pérez | juan@ejemplo.com | +56912345678 | 01/06/2026`
- 5 filas vacías.
- Generar una vez con SheetJS, commitear binary.

## Tier gating

**Modificar `src/lib/constants.ts`**:
- Agregar `canImportClients: boolean` a `TierCapabilities`.
- `free: false`, `starter+: true`.

Reusa `UpsellGate` creado en exercise-creator (gate="import_clients").

## Entry points

3 puntos de descubrimiento:

1. **Botón en `src/app/coach/clients/DirectoryActionBar.tsx`**: `Importar desde Excel`.
2. **Tarjeta dashboard** (componente nuevo `<ImportClientsOnboardingCard />` en dashboard para coaches con < 5 clientes, dismissable via localStorage).
3. **Email onboarding día 0** (manejado por CSM, fuera de scope MVP de código).

## Legal (Ley 19.628/21.719)

Checkbox Step 4:
```
☐ Confirmo que tengo el consentimiento expreso de las personas listadas
  para procesar sus datos personales conforme a la Ley 19.628 sobre
  Protección de la Vida Privada (Chile), modificada por la Ley 21.719.
```

Link footer: "Ver política de privacidad y DPA" → `/legal/privacy` + `/legal/dpa` (URLs existentes, no se crean).

Log timestamp en `client_imports.consent_confirmed_at` + `admin_audit_logs.payload.consent_ts`.

## Fases de implementación

**Fase 1: Specs + helpers + migration (este commit set)**
- Specs ✓
- `src/lib/import/header-matcher.ts` + tests
- `src/lib/import/csv-injection.ts` + tests
- Migration `client_imports`
- Generate template XLSX

**Fase 2: Tier gating** (compartido con exercise-creator)

**Fase 3: Backend**
- Refactor `_createClientInternal`
- Server actions
- Rate limit
- Tests unit

**Fase 4: UI Wizard**
- 4 steps + orquestador
- Polling progress
- Result screen

**Fase 5: Entry points**
- Botón en DirectoryActionBar
- Onboarding card dashboard

**Fase 6: Install deps + E2E**
- `npm install xlsx fastest-levenshtein`
- Playwright E2E happy path + edge cases

## Verificación

Ver `TASKS.md` para DoD checklist.
