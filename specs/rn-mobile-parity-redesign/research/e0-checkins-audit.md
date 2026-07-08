# E0-A5 — Audit checkins vs check_ins (apps/mobile)

Contexto: la tabla Postgres canonica es `check_ins` (con guion bajo). El bucket de
Storage privado de fotos de check-in se llama `checkins` (sin guion bajo). Son dos
nombres distintos y ambos son correctos en su contexto — no hay que unificarlos.

Metodo: `grep -rn "checkins|check_ins|check-ins"` sobre `apps/mobile/**`, clasificando
cada match como tabla PostgREST (`.from('...')` sobre `supabase`), Storage
(`supabase.storage.from('...')`), RPC, endpoint `/api/mobile/*`, o solo texto UI/docs
(sin impacto en el nombre real).

## Resultado

No se encontro ningun cruce. Todos los usos de la tabla usan `check_ins` y todos los
usos del bucket usan `checkins`.

| Archivo:linea | Uso | Nombre usado | Veredicto |
|---|---|---|---|
| `app/coach/(tabs)/check-ins.tsx:72` | tabla PostgREST (`.from(...)`) | `check_ins` | ok |
| `lib/clients-directory.ts:139` | tabla PostgREST | `check_ins` | ok |
| `lib/coach-client-detail.ts:664` | tabla PostgREST | `check_ins` | ok |
| `lib/coach-client-detail.ts:665` | tabla PostgREST (fallback sin `reviewed_at`) | `check_ins` | ok |
| `lib/coach-client-detail.ts:985` | tabla PostgREST | `check_ins` | ok |
| `lib/coach-dashboard.ts:451` | tabla PostgREST | `check_ins` | ok |
| `app/alumno/(tabs)/home.tsx:177` | tabla PostgREST | `check_ins` | ok |
| `app/alumno/(tabs)/check-in.tsx:68` | tabla PostgREST | `check_ins` | ok |
| `app/alumno/(tabs)/check-in.tsx:196` | tabla PostgREST (insert) | `check_ins` | ok |
| `app/alumno/(tabs)/check-in.tsx:150` | Storage (`supabase.storage.from(...)`, upload de foto) | `checkins` | ok |
| `app/alumno/(tabs)/check-in.tsx:131` (comentario) | doc del bucket privado | `checkins` | ok |
| `lib/api.ts:91` (comentario) | doc del bucket privado (firmado server-side via `/api/mobile/coach/checkin-photos`) | `checkins` | ok |
| `lib/api.ts:98-99` | endpoint `/api/mobile/coach/checkin-photos` (no es nombre de tabla/bucket, es ruta) | n/a | ok (no aplica) |
| `app/coach/(tabs)/_layout.tsx:30` | ruta de tab UI `check-ins` (slug de archivo, no DB) | n/a | ok (no aplica) |
| `app/coach/(tabs)/home.tsx:100` | ruta `router.push('/coach/(tabs)/check-ins')` (slug de archivo, no DB) | n/a | ok (no aplica) |
| `components/coach/CoachMobileChrome.tsx:35`, `CoachDashboardSections.tsx:952,2311`, `WeightTrendChart.tsx:27`, `clientDetail/ProgresoTab.tsx:55,124,126`, `clientDetail/NutricionTab.tsx:149`, `alumno/home.tsx:528,720`, `lib/progress-pdf.ts:132` | texto UI/comentarios ("check-ins" como palabra humana, con guion, no identificador de codigo) | n/a | ok (no aplica) |
| `CODEX_HANDOFF.md` (varias lineas) | doc historico, texto libre "check-ins"/`check_ins` citando columnas reales | n/a | ok (no aplica, es doc) |

## Conclusion

Cero referencias cruzadas. No se modifico ningun archivo de `apps/mobile/**` — el
alcance de esta tarea era auditar y corregir solo si habia cruce, y no lo hay.
