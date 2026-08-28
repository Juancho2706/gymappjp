---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# TASKS — «+ Nueva» pregunta qué crear

## W1 · Código (2026-08-28)

- [x] W1.1 Mockup aprobado (artifact `9d979bfa`).
- [x] W1.2 RN: hoja «¿Qué querés crear?» en `builder.tsx` + eventos `library_new_pressed` /
      `library_new_choice`; `accessibilityLabel` «Crear programa o ejercicio»; `testID`
      `new-template-button` / `new-choice-program` / `new-choice-exercise`.
- [x] W1.3 RN: `?create=1` en `ejercicios.tsx` (consumo único, gate `!loading`, rAF, limpieza).
- [x] W1.4 Web: `LibraryHeader.tsx` dropdown (`sm+`) + sheet (`<sm`) + eventos con `surface`.
- [x] W1.5 Web: `?create=1` en `ExerciseCatalogClient.tsx` (conserva `?q=`, toast sin permiso).
- [x] W1.6 Test `LibraryHeader.test.tsx` (5 casos: copy «Nueva», 2 opciones, programa llama
      `onNewTemplate`, ejercicio hace push a `/coach/exercises?create=1`, entradas contextuales).
      El dropdown de Base UI no abre en jsdom ⇒ se testea la superficie móvil (mismo `choose()`).
- [x] W1.7 Hermana: filas legibles de `DoubleIntentSheet` (RN) — sin test (className).
- [x] W1.8 Gates: `tsc` mobile ✅ · `tsc` web ✅ · vitest 3 archivos 45/45 ✅ · `check:tokens` ✅ ·
      lint web 0 errores ✅ · `docs:check` ✅.

## W2 · Salida y QA

- [ ] W2.1 Deploy web READY + OTA android/ios runtime 1.1.2 (grupos en el runbook de OTA).
- [ ] W2.2 QA owner RN (dark + claro): tocar «+ Nueva» → hoja; «Programa nuevo» → builder;
      «Ejercicio personalizado» → catálogo con el formulario abierto (incluido arranque en frío);
      volver atrás NO reabre el formulario; hoja «Entrenamiento incompleto» legible.
- [ ] W2.3 QA owner web: desktop (dropdown), PWA 390 px (sheet), dark; `?create=1` abre el modal y
      la URL queda limpia.
- [ ] W2.4 Si en device se ve parpadeo del Modal al navegar desde la hoja RN: envolver el push en
      `setTimeout(…, 300)` (una línea, patrón del muro de cupo).
