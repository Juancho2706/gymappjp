# TASKS — Notas del coach (worker-ready)

Convenciones de la casa. Corre junto al retiro del par viejo (workflow compartido).

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| N-A | Opus | `packages/nutrition-v2/editor-state.ts` (+tests) | Verificar si `UPDATE_SLOT`/patch cubre `instructions` y si el grupo tiene acción de patch para `notes`; agregar lo que falte (whitespace ⇒ null); publish payload los incluye. Tests set/clear/undo/payload. | vitest paquete verde. |
| N-B | Opus | `EditableSlotCard.tsx`, `EditablePortionsCard.tsx` web (+sheet) | 📝 header franja + fila grupo (N2); QeBottomSheet textarea+contador+limpiar; tinte con-nota por marca. SIN mover anclas del tour. | tsc + vitest; visual check verde. |
| N-C | Opus | espejo RN `QuickEditMode`/`EditableSlotCard`/porciones RN | Igual que N-B en RN (sheet nativo del kit). | tsc mobile + export android. |
| N-D | Opus | Hoy del alumno web (`c/[coach_slug]/nutrition`) + RN alumno + fetch/RPC | Banda 💬 bajo franja/grupo (N3); verificar que el camino de datos exponga `instructions`/`notes` (RPC/endpoint) y sumarlos SI faltan (aditivo, cero DDL — si exige migración de RPC, DETENERSE y reportar al jefe). | tsc ×2; render probado con nota y sin nota. |
| N-E | jefe | juicio + gates + docs | CURRENT/MOBILE_PARITY + docs:check. | todo verde. |

## QA (agregado el 2026-08-19)

La feature entró en `0355d67d` (17-08, 14:27), **después** de las tres rondas de QA del owner de ese
día, así que ninguna acta la cubre. Sí viajó al teléfono: el OTA #5 del 17-08 (grupo `768389fb` /
android `01a010fd`) la lleva, y desde el 18-08 los OTA salen android + ios.

- [ ] QA en device del owner del par 📝 editor RN ↔ banda 💬 del alumno RN — **pendiente de QA en
      device del owner (auditoría 17-08)**.
- [ ] Test de render del «Hoy» **RN** con nota y sin nota: el criterio está cubierto solo en web.
