# TASKS — Excel Client Importer

## Fase 1: Foundations (specs + helpers + migration)

- [x] Write SPEC.md
- [x] Write PLAN.md
- [x] Write TASKS.md
- [ ] Create `src/lib/import/header-matcher.ts`:
  - [ ] `normalize(s)` strip acentos + lowercase + alphanumeric
  - [ ] `HEADER_SYNONYMS` dictionary
  - [ ] `matchHeader(rawHeader)` exact + fuzzy (Levenshtein ≥ 0.8)
  - [ ] `matchHeaders(rawHeaders[])`
- [ ] Create `src/lib/import/header-matcher.test.ts` — 30+ casos
- [ ] Create `src/lib/import/csv-injection.ts`:
  - [ ] `sanitizeCell(value)` prefix `'` a `=/+/-/@/\t/\r`
- [ ] Create `src/lib/import/csv-injection.test.ts`
- [ ] Run tests pass
- [ ] Create migration `<ts>_client_imports_table.sql`
- [ ] Test migration local: `npx supabase db reset`
- [ ] Regenerate `src/lib/database.types.ts`
- [ ] Generate `public/templates/import-alumnos.xlsx` (script one-off)

## Fase 2: Tier gating (shared con exercise-creator)

- [ ] Modify `src/lib/constants.ts`:
  - [ ] Add `canImportClients` capability
- [ ] Verify `UpsellGate` (creado en exercise-creator phase 2) soporta gate="import_clients"

## Fase 3: Backend

- [ ] Refactor `src/app/coach/clients/actions.ts`:
  - [ ] Extract `_createClientInternal(coach, data, options)`
  - [ ] `createClientAction` se vuelve wrapper
  - [ ] Tests existentes siguen pasando
- [ ] Modify `src/lib/rate-limit.ts`:
  - [ ] Add `rateLimitBulkImport` (3/hora sliding window)
- [ ] Create `src/app/coach/clients/import/_actions/import.actions.ts`:
  - [ ] `importClientsAction(rows, filename, consent)`
  - [ ] `getImportTemplate()` (returns URL static)
  - [ ] `downloadErrorReport(importId)` (CSV string)
  - [ ] Chunks 10 + Promise.allSettled
  - [ ] Audit log entries
- [ ] Create `import.actions.test.ts`:
  - [ ] Tier gate
  - [ ] Consent required
  - [ ] Rate limit
  - [ ] Max clients check
  - [ ] CSV injection sanitize applied
  - [ ] Duplicate email skip

## Fase 4: UI Wizard

- [ ] `npm install xlsx fastest-levenshtein`
- [ ] Create `src/app/coach/clients/import/page.tsx` (RSC, gate)
- [ ] Create `src/app/coach/clients/import/loading.tsx`
- [ ] Create `_components/ImportWizard.tsx` (useReducer state machine)
- [ ] Create `_components/Step1Upload.tsx`:
  - [ ] Drop zone drag-drop + click
  - [ ] SheetJS parse
  - [ ] Tamaño + MIME validations
- [ ] Create `_components/Step2MapColumns.tsx`:
  - [ ] Auto-mapping con badges 🟢🟡⚪
  - [ ] Override manual
  - [ ] Persist localStorage por header signature
- [ ] Create `_components/Step3Preview.tsx`:
  - [ ] Tabla 50 rows
  - [ ] Celdas rojas/amarillas/azules con tooltips
  - [ ] Resumen top
  - [ ] Filtro show errors
  - [ ] Query previa duplicados DB
- [ ] Create `_components/Step4Confirm.tsx`:
  - [ ] Resumen card
  - [ ] max_clients check + upgrade prompt
  - [ ] Checkbox legal obligatorio
  - [ ] Botón importar
- [ ] Create `_components/ImportProgress.tsx`:
  - [ ] Polling 2s
  - [ ] Barra progreso
- [ ] Create `_components/ImportResultSummary.tsx`:
  - [ ] Éxito/errores breakdown
  - [ ] Descargar CSV errores
  - [ ] Link cartera
- [ ] Mobile responsive (h-dvh, safe areas)
- [ ] Dark mode variants

## Fase 5: Entry points

- [ ] Modify `src/app/coach/clients/DirectoryActionBar.tsx`:
  - [ ] Botón `Importar desde Excel` (visible solo starter+)
- [ ] Create `<ImportClientsOnboardingCard />` para dashboard:
  - [ ] Visible si coach starter+ con < 5 clientes
  - [ ] Dismissable (localStorage)
  - [ ] CTA → `/coach/clients/import`

## Fase 6: E2E

- [ ] Create `tests/e2e/client-import.spec.ts`:
  - [ ] Free coach ve UpsellGate
  - [ ] Starter+ flow completo: upload → map → preview → confirm → result
  - [ ] CSV injection sanitizado
  - [ ] Duplicado interno + DB detectado
  - [ ] Sin consent checkbox → bloqueo
  - [ ] Excede max_clients → bloqueo + upgrade CTA
  - [ ] Header typo → fuzzy match con badge amarillo
  - [ ] Re-upload → mapping pre-aplicado de localStorage
  - [ ] Descargar reporte errores
- [ ] Stress test manual: 500 rows
- [ ] Rate limit test: 4 imports en 1h → 4to rechazado

## DoD (Definition of Done)

- [ ] Todos los AC del SPEC.md cumplidos
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run test:e2e -- client-import` passes
- [ ] Template XLSX descarga + abre correcto en Excel
- [ ] Resend dashboard: no spam ni errores tras stress test 500 rows
- [ ] Migration probada en preview branch Supabase
- [ ] PR review aprobada
- [ ] Legal copy aprobado por counsel
- [ ] CSM tiene drip campaign onboarding lista
