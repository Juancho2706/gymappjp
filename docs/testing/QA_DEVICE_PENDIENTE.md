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

## Verificado por el owner (02-09, Android e iOS, claro y oscuro)

Los 11 puntos nuevos del tren «cierre de backlog 02-09» (`master` `794aee52`, deploy `dpl_E6Rt7ET…`,
OTA 1.1.2 android `01a063b0-6a6a…` / ios `01a063b0-86f0…`), QA del owner en device **VERDE 02-09**:

- [x] Builder RN: con cambios sin guardar, swipe-back iOS y back físico Android preguntan una sola
      vez y la pantalla no se anima hacia afuera (`ba074a92`) —
      [`qa-ejecutor-share-0209` § I5](../specs/qa-ejecutor-share-0209/TASKS.md)
- [x] Alumnos RN: chip «Solicitudes (N)» con badge; marcar contactado, «Sumar» abre el alta
      prellenada, descartar con confirmación; push «Nueva solicitud de alumno» (`1069f86e`) —
      [`coach-leads` § W3](../specs/coach-leads/TASKS.md)
- [x] Invitar alumno RN: link copiado y QR van a `/join/<código>` (`1069f86e`) —
      [`coach-leads` § W4.1](../specs/coach-leads/TASKS.md)
- [x] Plan del alumno: ítem con reemplazos muestra «⇄ o 120 g de …»; «requiere confirmación» abre el
      stepper, no un Alert (`bbfc5136`) —
      [`nutrition-substitution-intake` § F5](../specs/nutrition-substitution-intake/TASKS.md)
- [x] Share: tarjeta sin velo oscuro sobre foto clara (`bbfc5136`) —
      [`qa-ejecutor-share-0209` SPEC decisión 2](../specs/qa-ejecutor-share-0209/SPEC.md)
- [x] Catálogo/builder: editar un ejercicio propio ya puesto en un día actualiza nombre e imagen del
      bloque sin marcar «sin guardar» (`f469a780` web, `ba074a92` RN) —
      [`ejercicios-propios-web` § E1](../specs/ejercicios-propios-web/TASKS.md)
- [x] Ficha del alumno (progreso), builder de nutrición «Personalizar el día» y «Agregar día»: sin
      «no incluido en tu plan» (`7d9f1710`) — [`ola-de-orden` § B3](../specs/ola-de-orden/TASKS.md)
- [x] «Cerrar sesión» solo en «Más»; en «Mi cuenta» ya no está (`ba074a92`) —
      [`ola-de-orden` § B1](../specs/ola-de-orden/TASKS.md)
- [x] Hojas con `nativeModal`: swipe-down sigue cerrando (`c57c7406`, `@react-navigation/native`
      como dependencia directa).
- [x] Login del alumno RN con credenciales de coach: mensaje nuevo (`1069f86e`).
- [x] Web móvil: check-in con modo avión a mitad de camino conserva peso, fotos y notas; el asistente
      sigue vivo detrás del aviso «Sin conexión» (`619b881f`) —
      [`qa-ejecutor-share-0209` § P6 B2](../specs/qa-ejecutor-share-0209/TASKS.md)
