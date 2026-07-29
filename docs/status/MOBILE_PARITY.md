---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-26 @ e0db4285"
canonical: true
source_of_truth: apps/web responsive + apps/mobile
---

# Paridad Web/PWA → React Native

Única fuente de verdad para saber qué está cerrado, qué falta y dónde retomar el port de React Native. Los detalles de ejecución viven en [`specs/rn-mobile-parity-redesign/TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md); este archivo prevalece ante cualquier auditoría, spec de unidad o informe histórico.

> **Preservación de funciones** (qué se movió de lugar, qué quedó **órfano** en el rediseño, y la deuda de paridad mobile): [`REDESIGN_FEATURE_MATRIX.md`](REDESIGN_FEATURE_MATRIX.md).

## Resumen ejecutivo

La paridad global **no está certificada todavía**.

| Bloque | Código y revisión estática | QA en dispositivo | Estado efectivo |
|---|---:|---:|---|
| Sección 1 — ejecutor del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 2 — dashboard del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 3 — coach (14 unidades) | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 2R — residuos del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 4A — nutrición del alumno | **12/12 aplicadas** | Pendiente | Cerrada estática; no certificada |
| Ola 4B — nutrición del coach y catálogos | **Cerrada: 15/15 unidades de rama** | Pendiente | Cerrada estática; no certificada |
| Experiencia de entrada — splash/onboarding/acceso | Cerrada estática | Pendiente | Código y exports verdes; requiere build nuevo + QA física |

“Cerrado estático” significa que código, spec y verificaciones automatizadas disponibles convergieron. No significa que el comportamiento visual, gestos, teclado, cámara, safe areas u offline estén aprobados en hardware real.

> **2026-07-29 (rama `worktree-nutricion-ui-rescate`, sin merge)**: rescate UI de Nutrición V2 en olas 0-2 con paridad web/RN en el mismo corte — semana completa Lu-Do (`WeekDayNav` + `week-view.ts` compartidos), copia de franjas entre días (`COPY_SLOT_TO_VARIANTS` en los 4 reducers), carry-over de `visible_notes` también en el publish RN, y barrido de 677 clases muertas `text-text-*`/`border-border-*` de mobile (texto renderizaba negro incluso en dark). Las olas 4A/4B siguen "cerradas estáticas": este corte agrega superficies que requieren QA física propia. Spec: [`docs/specs/nutrition-week-view/`](../../specs/nutrition-week-view/SPEC.md).

> **2026-07-25 (PR #170, `60090f90`)**: el ejecutor del alumno quedó rediseñado a **V3** — único camino en web y RN, flags eliminados — e integró **cardio fases A-D** (ejes de captura por modalidad, Escaladora, intervalos por distancia, coach ve los registros). La Sección 1 sigue “cerrada estática” sobre ese código nuevo; la deuda cardio priorizada vive en [`specs/cardio-ejes-y-fixes/TASKS.md`](../../specs/cardio-ejes-y-fixes/TASKS.md) y la cola del ejecutor en [`specs/executor-v3/TASKS.md`](../../specs/executor-v3/TASKS.md).

## Ola 4A (cerrada estática)

Fuente funcional/visual: `apps/web/src/app/c/[coach_slug]/nutrition-v2/**` y `apps/web/src/components/nutrition-v2/**` en viewport móvil. Specs vigentes: [`docs/rn-port/specs/seccion-4a/`](../rn-port/specs/seccion-4a/).

| Unidad | Alcance | Código | QA device |
|---|---|---:|---:|
| 4A-01 | Ruteo y chrome | Aplicado | Pendiente |
| 4A-02 | Vista Hoy: estructura | Aplicado | Pendiente |
| 4A-03 | Vista Plan | Aplicado | Pendiente |
| 4A-04 | Historial | Aplicado | Pendiente |
| 4A-05 | Shell y tab bar | Aplicado | Pendiente |
| 4A-06 | Editar y retirar registros | Aplicado | Pendiente |
| 4A-07 | Kit e ilustraciones | Aplicado | Pendiente |
| 4A-08 | AuraHero y colores white-label | Aplicado | Pendiente |
| 4A-09 | Porciones | Aplicado | Pendiente |
| 4A-10 | Registro y buscador | Aplicado | Pendiente |
| 4A-11 | Scanner | Aplicado | Pendiente |
| 4A-12 | Celebraciones y residuos | Aplicado | Pendiente |

Aplicadas: **las 12** (wave C en `73f6aa82`; wave D en `3efa1a75`; wave E en `7c6684fa`). Código de la ola completo; falta QA device.

## Ola 4B (cerrada estática)

Fuente funcional/visual: superficie V2 VIVA del coach (`apps/web/src/app/coach/nutrition-v2/**` +
catálogos vivos). Specs vigentes: [`docs/rn-port/specs/seccion-4b/`](../rn-port/specs/seccion-4b/)
(INVENTARIO, RANKING con las 16 unidades y 6 waves, DECISIONES-OWNER: **V1 al olvido**, recetas
fuera, RN-extras estricto).

| Estado | Unidades |
|---|---|
| Aplicadas (wave 4B.1, `bce2eb3b`) | 4B-01 macros meal-groups (P0 datos), 4B-02 scope org foods, 4B-03 quick-edit notas+permisos |
| Aplicada (wave 4B.2, `76d8ea2f`) | 4B-04 SWAP tab coach→Centro V2 (inline, cápsula intacta; V1 = rollback tras flag) |
| Aplicadas (wave 4B.3, `8f8161cb`) | 4B-05 HUB, 4B-06 Catálogo V2 + ficha, 4B-08 Detalle asignar/archivar, 4B-10 Builder F-02 reemplazos (cierra TODO F-02 P3), 4B-15 MG editor |
| Aplicadas (wave 4B.4, `2cdc0c79`) | 4B-07 Curación, 4B-17 Tablist hub (Alumnos/Alimentos/Curación cableado), 4B-09 Detalle copy+banner convertido, 4B-11 Builder porciones (write-path nuevo), 4B-14 Quick-edit drafts |
| Aplicada (wave 4B.5, `a9b8958e`) | 4B-12 Builder permisos del alumno + guardar-en-catálogo + archivar-y-reemplazar (idempotencia estable) |
| Aplicada (wave 4B.6, `6338f4a4`) | 4B-13 Builder drafts (autosave + Restaurar + guard warn-only; cierra la ola) |
| Fuera de rama | 4B-16 deuda transversal nutrition-pro (toca web+packages; abrir en rama de web) |

> **2026-07-26 (`c159d67a`)**: 4B-03 evolucionó en paridad — las notas visibles (`visible_notes`)
> pasaron de read-only a **editables** en el quick-edit de AMBAS plataformas (misma acción,
> normalización, tope 8000 y microcopy espejo). Detalle en
> [`u03-quickedit-notas-permisos.md`](../rn-port/specs/seccion-4b/u03-quickedit-notas-permisos.md).

## Estado "En progreso" del día (O2, cerrado estático 2026-07-26)

SDD: [`docs/specs/workout-day-in-progress/`](../specs/workout-day-in-progress/SPEC.md). Regla única
`deriveDayCompletion` en `@eva/workout-engine` (done = 100% de series; cardio sin `sets` = 1 unidad)
con 12 fixtures de paridad consumidos por los tests de AMBAS plataformas. Web y RN comparten visual
(`CircleDashed` + "En progreso") y copy del sheet ("Entrenamiento incompleto"). La racha del RPC no
se tocó (decisión CEO). Falta QA device (4 escenarios del PLAN).

## Experiencia de entrada (cerrada estática 2026-07-26)

Fuente: [`specs/mobile-entry-experience/`](../../specs/mobile-entry-experience/SPEC.md).

El owner aprobó las cuatro decisiones de la SPEC y el frente quedó aplicado sobre
`rnmobiledenuevo`:

- `expo-splash-screen` gobierna un único launch nativo continuo, sin espera React artificial; se
  retiraron tres componentes splash sin importadores;
- walkthrough de tres escenas locales 1×/2× con `coach-plan`, `alumno-scan`, `progreso` y `logro`
  como acento, preload, reduce motion, safe areas y adaptación a 320×568/texto ampliado;
- selector compacto y un solo campo accesible para código, slug o enlace, con submit explícito,
  errores diferenciados y protección contra doble envío;
- parser compartido en `@eva/schemas`, intents sin fetch fuera de React y branding vivo antes de la
  persistencia;
- login alumno fail-closed sin coach y endpoint autenticado que deriva identidad del bearer,
  valida el workspace exacto con la misma fuente canónica de web y solo después persiste el último
  workspace. La caché y el `coachId` del body no autorizan.

Evidencia estática: 61 tests focalizados y suite completa de 4130 tests verdes, typecheck
web/mobile, ESLint afectado sin warnings, tokens `86/86`, docs y exports Expo Android/iOS verdes.
No hubo cambio de schema, RLS ni dependencias. Como `app.json` cambió configuración nativa, falta
un build EAS nuevo y QA física; no es un cambio certificable por OTA.

### Dónde retomar

1. Generar build EAS Android/iOS del corte con la nueva configuración de splash.
2. Ejecutar matriz de entrada en hardware: cold/warm start, primer/segundo uso, sesión, teclado,
   código/slug/links, cuatro presets, EVA/custom, light/dark, red/offline y VoiceOver/TalkBack.
3. Corregir cualquier P0/P1/P2 y solo entonces certificar la entrada.
4. Abrir la ola 5 (builder y programas de entrenamiento del coach) con inventario contra código.
5. Completar matriz device de 4A/4B y regresión dirigida de Secciones 1–3/2R.
6. Deuda 4B-16 (consolidar nutrition-pro puro en `@eva/nutrition-v2`) en rama de web.

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `production` | Build + **Submit a Play internal testing** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` (2026-07-25, corte con deuda cardio + universal links); previos `4382ff6c`/`335c88da` también verdes | Vía completa funcionando sobre el corte actual; retener artefacto (1 día) |
| iOS | `production` | Build + **Submit a TestFlight** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa`, con el profile regenerado (HealthKit + Associated Domains; la falla de capability de los runs 07-23/24 quedó cerrada) | Binario del corte actual existe y fue enviado; falta verificación en App Store Connect y QA device |

Un build/submit verde no sustituye la verificación manual en App Store Connect/Play Console ni el QA en dispositivo (universal links incluidos — el CDN del AASA de Apple puede tardar horas).

## Siguiente horizonte

Después de cerrar la experiencia de entrada y certificar el trabajo acumulado:

1. 5 — builder y programas del coach.
2. 6 — dominios restantes, inventariados en lotes pequeños.
3. 7 — certificación transversal de rutas, estados, branding, accesibilidad y ambos sistemas operativos.

El alcance exacto se confirma contra código antes de abrir cada ola; no se reactiva automáticamente un checklist histórico.

## Contrato de actualización

Actualizar este archivo en el mismo cambio que:

- aplique o revierta una unidad de paridad;
- cambie la ola activa o el orden de ejecución;
- obtenga un resultado nuevo de build o QA device;
- acepte una divergencia nativa;
- descubra un bloqueo que cambie el siguiente paso.

Cada actualización debe cambiar `last_verified` con fecha y commit. Evidencia extensa pertenece a la spec de unidad o a auditorías fechadas, nunca a este resumen.
