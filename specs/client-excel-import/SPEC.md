# SPEC — Excel Client Importer

**Status**: Approved
**Owner**: Juan Villegas
**Date**: 2026-05-27
**Tier**: Starter+ (gated, free bloqueado)

## Problema

Hoy migrar 50–500 alumnos desde otro sistema (Excel propio del coach, Trainerize, Hevy, Wodify, etc.) requiere alta manual fila a fila vía `createClientAction`. Esto mata el onboarding de:

- Coaches nuevos que llegan a EVA con cartera existente.
- Gyms enterprise con 100+ alumnos del staff completo.
- Sales calls donde el prospect quiere ver demo con su propia data.

Resultado: tasa de adopción baja para coaches con cartera mediana/grande. Lead caliente se enfría esperando setup.

## User stories

**US-1** (coach Starter+ nuevo): como coach que viene de otro sistema, quiero subir mi Excel de alumnos y crear todas las cuentas con welcome emails en < 5 minutos.

**US-2** (coach Starter+): como coach que prepara su Excel, quiero descargar un template oficial con los headers correctos y filas ejemplo.

**US-3** (coach Starter+): como coach con headers en español/inglés/typos, quiero que el sistema auto-detecte mis columnas y me deje overridear lo que no detectó.

**US-4** (coach Starter+): como coach revisando antes de confirmar, quiero ver preview de errores (email faltante, formato inválido, duplicados) y poder filtrar solo las problemáticas.

**US-5** (coach Starter+): como coach con responsabilidad legal sobre datos, quiero confirmar explícitamente que tengo consentimiento de los titulares (Ley 19.628/21.719) antes de procesar.

**US-6** (coach free): como coach free, quiero entender qué pierdo y cómo upgradeear cuando intento importar (espejo de "Mi Marca").

**US-7** (coach Starter+ post-import): como coach con import fallido parcial, quiero descargar CSV con las filas fallidas + motivo para corregir y re-importar.

## Acceptance criteria

- [ ] AC1: `/coach/clients/import` accesible solo Starter+. Free ve UpsellGate.
- [ ] AC2: Template XLSX descargable desde `/templates/import-alumnos.xlsx`.
- [ ] AC3: Wizard 4 pasos (Upload → Map → Preview → Confirm) con stepper top numerado y navegación bidireccional.
- [ ] AC4: Upload acepta `.xlsx`, `.xls`, `.csv`. Rechaza > 5MB. Valida MIME real (no solo extensión).
- [ ] AC5: Header matcher detecta exact + fuzzy (Levenshtein ≥ 0.8) usando diccionario de sinónimos es/en. SIN IA.
- [ ] AC6: Coach puede override manual de cualquier auto-mapping en Step 2. Mapping persiste en localStorage por header signature.
- [ ] AC7: `Nombre completo` + `Email` son requeridos. No avanza Step 2 sin mapearlos.
- [ ] AC8: Step 3 muestra errores Zod inline en celdas (rojo), warnings (amarillo), sanitizaciones CSV injection (azul). Filtro "Solo errores".
- [ ] AC9: Detección duplicados: dentro del Excel (por email) + vs DB actual del coach (query `WHERE email IN (...)`).
- [ ] AC10: Step 4 requiere checkbox legal Ley 19.628/21.719 marcado. Sin esto, botón Importar disabled.
- [ ] AC11: Verifica `active_clients + nuevos ≤ max_clients` del tier. Si excede → bloqueo + CTA upgrade con plan calculado.
- [ ] AC12: CSV injection sanitize: cells empezando con `=`, `+`, `-`, `@`, `\t`, `\r` se prefixean con `'`.
- [ ] AC13: Server action procesa en chunks de 10 con `Promise.allSettled`. Cada row: Zod → skip duplicados → `_createClientInternal` (auth user + welcome email).
- [ ] AC14: Rate limit Upstash: máx 1 import simultáneo + 3/hora.
- [ ] AC15: Audit log en `client_imports` (summary + errores jsonb) + `admin_audit_logs` (action `client.bulk_import`).
- [ ] AC16: Result screen con éxito/errores + botón "Descargar reporte de errores (CSV)".
- [ ] AC17: Server action rechaza `upgrade_required` si tier no es Starter+ (sin confiar en UI).
- [ ] AC18: Hard limit 1000 rows MVP. Si > 1000 → mensaje "dividir en lotes".

## Out of scope (post-MVP)

- Import desde Google Sheets vía OAuth.
- Import desde APIs de competidores (Trainerize, Hevy Coach).
- Asignación automática de planes durante import.
- Mapping de fotos de perfil.
- Web Worker para imports > 1000 rows.
- Streaming SSE para progress real-time (usamos polling).
- ML/AI para sugerir mapping (decisión: heurísticas explícitas).

## Métricas de éxito

- % coaches nuevos (Starter+) que completan import en primeros 7 días (target: > 40%).
- Promedio rows por import exitoso (target: > 30).
- Tasa de éxito por import (target: > 90% rows OK).
- Tiempo medio coach onboarding nuevo (target: < 5 min vs baseline manual a medir).
- Conversion rate free→starter atribuible a `import_clients` gate.

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Spam Resend con 500 emails | Chunks 10 + Upstash rate-limit + warning UI tiempo estimado. |
| Browser muere con XLSX 10k rows | Hard limit 1000 rows MVP + mensaje "dividir". |
| CSV injection ataca Excel del coach o cliente | Sanitize prefix `'` antes de insert. |
| Coach importa datos sin consentimiento (Ley 19.628/21.719) | Checkbox obligatorio + log timestamp + DPA en TOS. Responsabilidad legal recae en coach (data controller). |
| Headers en idiomas no soportados | Override manual + persist localStorage. |
| Coach hace upgrade mid-flow | Capability check al submit final, no al cargar página. |
| Email duplicado dentro de Excel | Detectar interna + omitir o flagear según UI. |
| Email ya existente en DB | Query previa + skip + mostrar en preview. |

## Sources

Ver `C:\Users\juanm\.claude\plans\genera-un-plan-para-splendid-turing.md` para sources mayo 2026.
