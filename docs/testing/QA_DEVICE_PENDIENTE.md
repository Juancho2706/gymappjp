---
status: active
owner: quality-engineering
last_verified: "2026-09-02"
canonical: false
---

# QA en device pendiente (acumulado)

Lista única de QA en device (Android/iOS/web responsive) que quedó pendiente al 2026-09-02, juntando
lo declarado disperso en varias specs. No reemplaza [`TEST_STATUS.md`](TEST_STATUS.md) (gates
automatizados) ni el checklist de cada spec — es el punto de entrada para no perder de vista qué
falta verificar con el owner mirando un dispositivo real. Al cerrar un ítem, tildarlo acá Y en su
spec de origen.

Convención: `[ ]` pendiente · `[x]` verificado con evidencia (fecha + quién).

## Checklist

- [ ] Pantalla de código RN + login web por código (SEC-01) — [`docs/operations/MANUAL_TASKS.md` §
      SEC-01](../operations/MANUAL_TASKS.md), [`docs/status/CURRENT.md`](../status/CURRENT.md) (tren
      «billing + seguridad» 02-09)
- [ ] Keypad tope 999 — [`docs/status/CURRENT.md`](../status/CURRENT.md) (OTA iOS 1.1.2, `1e25229c`)
- [ ] Silueta RN + catálogo de alimentos — [`docs/status/CURRENT.md`](../status/CURRENT.md) (30-08)
- [ ] 3 quejas del socio builder RN — [`docs/status/CURRENT.md`](../status/CURRENT.md) (23-08)
- [ ] W-brand W4.2 + white-label «SO CLARO» —
      [`docs/specs/whitelabel-color-consolidation/TASKS.md` § W4.2](../specs/whitelabel-color-consolidation/TASKS.md)
- [ ] Mi Marca en Free + sello — [`docs/specs/pricing-v3/TASKS.md`](../specs/pricing-v3/TASKS.md)
- [ ] «+ Nueva» (library-new-choice) RN y web 390 px —
      [`docs/specs/library-new-choice/TASKS.md`](../specs/library-new-choice/TASKS.md)
- [ ] Entrada dark v1 (halation OLED, gama baja, TalkBack) —
      [`docs/specs/entrada-dark-v1/SPEC.md`](../specs/entrada-dark-v1/SPEC.md)
- [ ] Overrides de alimentos por UI —
      [`docs/specs/nutrition-food-overrides/TASKS.md`](../specs/nutrition-food-overrides/TASKS.md)
- [ ] Sustituciones flujo completo web/RN —
      [`docs/specs/nutrition-substitution-intake/TASKS.md`](../specs/nutrition-substitution-intake/TASKS.md)
- [ ] Tab Alimentos RN (food-hub F6.5) —
      [`docs/specs/nutrition-food-hub/TASKS.md` § F6.5](../specs/nutrition-food-hub/TASKS.md)
- [ ] Notas del coach ↔ banda del alumno RN —
      [`docs/specs/nutrition-coach-notes/TASKS.md`](../specs/nutrition-coach-notes/TASKS.md)
- [ ] Día en curso, 4 escenarios —
      [`docs/specs/workout-day-in-progress/TASKS.md`](../specs/workout-day-in-progress/TASKS.md)
- [ ] Semana nutrición sáb/dom + 5 superficies —
      [`docs/specs/nutrition-week-view/TASKS.md`](../specs/nutrition-week-view/TASKS.md)
- [ ] Editor único multi-día RN — el fix «días no activos» ya tiene **QA del owner VERDE 02-09**
      (device + web); queda el resto del editor —
      [`docs/specs/nutrition-unified-editor/TASKS.md`](../specs/nutrition-unified-editor/TASKS.md)
- [ ] Share iPhone (Stories, Guardar, reduced-motion) —
      [`docs/specs/workout-share/TASKS.md` § F9.3](../specs/workout-share/TASKS.md)
- [ ] Solape cápsula sobre «Eliminar cuenta» 390×844 (B3) —
      [`docs/specs/qa-ejecutor-share-0209/TASKS.md`](../specs/qa-ejecutor-share-0209/TASKS.md)
- [ ] Lector de pantalla en switches de Funciones (B6) —
      [`docs/specs/qa-ejecutor-share-0209/TASKS.md`](../specs/qa-ejecutor-share-0209/TASKS.md)
