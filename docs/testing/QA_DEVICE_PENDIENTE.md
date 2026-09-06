---
status: active
owner: quality-engineering
last_verified: "2026-09-06"
canonical: false
---

# QA en device pendiente (acumulado)

Lista única de QA en device (Android/iOS/web responsive) que quedó pendiente al 2026-09-02 y **se
cerró entera el 2026-09-05**, juntando lo declarado disperso en varias specs. No reemplaza [`TEST_STATUS.md`](TEST_STATUS.md) (gates
automatizados) ni el checklist de cada spec — es el punto de entrada para no perder de vista qué
falta verificar con el owner mirando un dispositivo real. Al cerrar un ítem, tildarlo acá Y en su
spec de origen.

Convención: `[ ]` pendiente · `[x]` verificado con evidencia (fecha + quién).

> **SIN PENDIENTES AL 2026-09-05.** Los 18 ítems del checklist y los 6 de «ola 2 chica» quedaron
> cerrados en una sola sesión de QA en dispositivo del owner. Evidencia canónica de todo este
> archivo: **QA del owner VERDE 05-09 (sesión única, artifact `6bd32370`, Android 1.1.2 build 86 /
> iOS 1.1.2 build 59 con el OTA del 04-09 android `d8220490` / ios `54487ddd`, web
> `www.eva-app.cl` deploy `dpl_ASZExsTB…` = `f9ba8a3f`)**, guion de 102 verificaciones en 11 áreas.
> Abajo se abrevia «QA owner VERDE 05-09, artifact `6bd32370`».

> **Nuevo pendiente desde 2026-09-06**: el rediseño «bloque único» de Share Entreno (ver sección
> abajo) todavía no tiene OTA ni QA del owner — el resto de este archivo sigue sin pendientes.

## Checklist — cerrado (0 pendientes)

- [x] Pantalla de código RN + login web por código (SEC-01) — [`docs/operations/MANUAL_TASKS.md` §
      SEC-01](../operations/MANUAL_TASKS.md), [`docs/status/CURRENT.md`](../status/CURRENT.md) (tren
      «billing + seguridad» 02-09). QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Keypad tope 999 — [`docs/status/CURRENT.md`](../status/CURRENT.md) (OTA iOS 1.1.2, `1e25229c`).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Silueta RN + catálogo de alimentos — [`docs/status/CURRENT.md`](../status/CURRENT.md) (30-08).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] 3 quejas del socio builder RN — [`docs/status/CURRENT.md`](../status/CURRENT.md) (23-08).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] W-brand W4.2 + white-label «SO CLARO» —
      [`docs/specs/whitelabel-color-consolidation/TASKS.md` § W4.2](../specs/whitelabel-color-consolidation/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Mi Marca en Free + sello — [`docs/specs/pricing-v3/TASKS.md`](../specs/pricing-v3/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] «+ Nueva» (library-new-choice) RN y web 390 px —
      [`docs/specs/library-new-choice/TASKS.md`](../specs/library-new-choice/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370` (sin parpadeo del Modal ⇒ W2.4 no hizo falta).
- [x] Entrada dark v1 (halation OLED, gama baja, TalkBack) —
      [`docs/specs/entrada-dark-v1/SPEC.md`](../specs/entrada-dark-v1/SPEC.md). QA owner VERDE 05-09,
      artifact `6bd32370`, sobre 1.1.2 + OTA; la certificación con **binario nuevo** queda para 1.1.3.
- [x] Overrides de alimentos por UI —
      [`docs/specs/nutrition-food-overrides/TASKS.md`](../specs/nutrition-food-overrides/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Sustituciones flujo completo web/RN —
      [`docs/specs/nutrition-substitution-intake/TASKS.md`](../specs/nutrition-substitution-intake/TASKS.md)
      y [`nutrition-substitutions` § T13](../specs/nutrition-substitutions/TASKS.md) (lado coach).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Tab Alimentos RN (food-hub F6.5) —
      [`docs/specs/nutrition-food-hub/TASKS.md` § F6.5](../specs/nutrition-food-hub/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Notas del coach ↔ banda del alumno RN —
      [`docs/specs/nutrition-coach-notes/TASKS.md`](../specs/nutrition-coach-notes/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Día en curso, 4 escenarios —
      [`docs/specs/workout-day-in-progress/TASKS.md`](../specs/workout-day-in-progress/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Semana nutrición sáb/dom + 5 superficies —
      [`docs/specs/nutrition-week-view/TASKS.md`](../specs/nutrition-week-view/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370` (NUTC-12 cubrió además la semana que cruza versión).
- [x] Editor único multi-día RN — el fix «días no activos» ya tenía **QA del owner VERDE 02-09**
      (device + web); el resto del editor queda cerrado con el QA owner VERDE 05-09, artifact
      `6bd32370` — [`docs/specs/nutrition-unified-editor/TASKS.md`](../specs/nutrition-unified-editor/TASKS.md).
      (La demolición del par viejo sigue abierta: es código, no QA.)
- [x] Share iPhone (Stories, Guardar, reduced-motion) —
      [`docs/specs/workout-share/TASKS.md` § F9.3](../specs/workout-share/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370` (iPhone 1.1.2 build 59).
- [x] Solape cápsula sobre «Eliminar cuenta» 390×844 (B3) —
      [`docs/specs/qa-ejecutor-share-0209/TASKS.md`](../specs/qa-ejecutor-share-0209/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.
- [x] Lector de pantalla en switches de Funciones (B6) —
      [`docs/specs/qa-ejecutor-share-0209/TASKS.md`](../specs/qa-ejecutor-share-0209/TASKS.md).
      QA owner VERDE 05-09, artifact `6bd32370`.

## Verificado por el owner (05-09, sesión única: Android + iPhone + web)

El 2026-09-05 el owner corrió **una sola sesión** de QA en dispositivo siguiendo el guion del
artifact «QA de cierre 05-09» (`6bd32370-a460-42d6-9f2f-128e07c11bca`, **102 verificaciones en 11
áreas**) y la declaró **VERDE COMPLETO**. Superficies exactas:

- **Android** 1.1.2 build 86 y **iPhone** 1.1.2 build 59, ambos con el OTA del 04-09
  (android `d8220490` / ios `54487ddd`).
- **Web** `www.eva-app.cl`, deploy `dpl_ASZExsTB…` = `f9ba8a3f`.

Ese veredicto cierra los 18 ítems del checklist de arriba y los 6 de «ola 2 chica» que siguen. Única
salvedad declarada: la **experiencia de entrada** (entrada dark v1 / splash) se certificó sobre
1.1.2 + OTA; el config plugin del splash exige **binario nuevo**, así que su certificación con build
EAS propia queda para 1.1.3.

### «Ola 2 chica» — verificada 05-09 (EN PRODUCCIÓN desde el 04-09)

Los commits `5f3c48f2`…`31c1f7a8` (Android e iOS, claro y oscuro) son ancestros de `origin/master`
(`f9ba8a3f`): salieron con el deploy `dpl_CZKUwNth…` del 04-09 y la OTA 1.1.2 android `d8220490` /
ios `54487ddd`. Probados contra ese desplegado — QA owner VERDE 05-09, artifact `6bd32370`:

- [x] Catálogo RN y web: «Duplicar» un ejercicio propio dos veces ⇒ «X (copia)» y «X (copia 2)», sin
      «Ya existe un ejercicio con ese nombre» (`5f3c48f2`).
- [x] Alumnos RN: dejar una solicitud por `/join/<código>?ref=<alumno>` → «Sumar» desde la app ⇒ la ficha
      nueva queda con referente (`clients.referred_by_client_id`) y la solicitud pasa a convertida;
      archivar para liberar cupo desde ese mismo muro NO convierte la solicitud (`7e1304d4`).
- [x] Alumno RN, tab Plan: un plan con reemplazos sigue mostrando «⇄ o …» y no muestra de más; con
      modo avión (caché) sigue igual (`347f441d`).
- [x] Builder de nutrición RN, estrategia híbrida bloqueada (cuenta vencida/kill-switch): hoja «Función no
      disponible» con «Cerrar» / «Ver funciones», sin «Nutrición Pro» (`fd468c21`).
- [x] Dashboard RN, hero/puente a Teams: tinte y texto verdes iguales a antes en claro y oscuro
      (`theme.success100/600`, `7e1304d4`).
- [x] Web: borrar la cuenta de un coach de prueba con alimentos propios, planes y comidas guardadas
      termina en `/login?deleted=true` (`7354c22d`).

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

## Share Entreno · bloque único (06-09)

Rediseño aprobado por el owner el 2026-09-06: se retiran los 6 presets, los toggles y los 9
stickers sueltos; queda un solo bloque de texto en Inter movible por drag y escalable por
pellizco. En código en el worktree `share-bloque-strava`, sin push ni OTA. Checklist completo en
[`share-bloque/TASKS.md` § QA en device](../specs/share-bloque/TASKS.md):

- [ ] Bloque legible sobre foto clara y sobre foto oscura.
- [ ] Drag sin parpadeo y clamp correcto en los cuatro bordes del canvas.
- [ ] Pellizco hasta el tope (`maxScaleFor`) sin que el bloque desaparezca ni se corte.
- [ ] Stories en Instagram y Facebook, con foto y con «Sin foto».
- [ ] WhatsApp.
- [ ] «Guardar» a la galería.
- [ ] PNG capturado sin marco punteado ni recorte del bloque.
- [ ] Coach sin logo propio (inicial en el círculo) y sin branding «EVA» visible más allá de «vía EVA».
- [ ] Reduced-motion respetado.
- [ ] TalkBack/VoiceOver anuncia el bloque como unidad legible.

## Pendientes

**Share Entreno · bloque único** (arriba) queda pendiente desde el 2026-09-06, a la espera de la
OTA. Lo demás sigue **sin pendientes desde 2026-09-05**. Lo único que este archivo deja anotado como
no-certificable por OTA es la **experiencia de entrada** con binario nuevo (1.1.3), registrada en
[`MOBILE_PARITY.md`](../status/MOBILE_PARITY.md) y en
[`docs/operations/MANUAL_TASKS.md` § MOB-02](../operations/MANUAL_TASKS.md).
