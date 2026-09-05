# SPEC — Rediseño de flujos de Nutricion V2 (programa)

- **Rama de trabajo:** `rnmobiledenuevo` (decision owner 2026-08-06). Web a prod = merge a master con OK del owner.
- **Origen:** auditoria interna (37 fricciones con evidencia archivo:linea) + research competitivo + factibilidad tecnica, 2026-08-06.
- **Artifacts canonicos:** [propuesta de flujos](https://claude.ai/code/artifact/d7f44025-cb47-4c7a-929a-279e95987da2) · [catalogo de pantallas](https://claude.ai/code/artifact/1333da4a-a9f2-4acc-9f82-952aa936d3eb) · [plan de ejecucion](https://claude.ai/code/artifact/31345761-2036-493d-9be6-1e1ff01f60b6)
- **Reglas de reparto (owner):** UI/UX frontend la implementa Fable directamente; workers solo mecanico bien especificado (Sonnet) y backend por informe cerrado (Opus). Juicio de cada wave: Fable.

## Objetivo

Que el registro del alumno sea plan-first (confirmar > buscar), que el coach cree y edite planes con una sola gramatica y facil en desktop Y en responsive/PWA, y que el catalogo de alimentos tenga una sola casa con macros editables por coach (overrides). Sin perder NINGUNA funcion existente.

## Decisiones del owner (2026-08-06)

| # | Decision | Valor |
|---|----------|-------|
| D1 | Push de `rnmobiledenuevo` | Al cierre de cada ola (preview Vercel por ola) |
| D2 | OTA Android | UNO solo al cierre de O2 (junta O1+O2) |
| D3 | Kill-switch editor unico | NO — corte directo; rollback = revert/redeploy; el par viejo no se borra hasta 2 semanas estable |
| D4 | T1.6 sustituciones puente | SI se incluye en O1 |

## Invariantes no negociables

1. **`get_nutrition_today_v2` es sagrado**: no se modifica, PROHIBIDO looparlo (volatile, materializa snapshots, revienta > hoy+1). Snapshot history SIEMPRE gana sobre proyeccion dow.
2. **Historial append-only**: intake y snapshots publicados jamas se reescriben; nunca backfill ciego. Overrides de macros NO alteran planes ya publicados (propagar = republicar, con aviso en UI).
3. **Validacion server siempre**: UI nunca autoriza. Sustituciones, overrides y auto-escala se guardan en RPC/action con el guard en el servidor.
4. **DDL aditivo-en-LIVE**: tx-rollback + EXPLAIN antes de aplicar, advisors despues, jamas editar migraciones aplicadas, grant por columna en toda columna user-editable, regen `database.types.ts` por CLI. Tablas coach-keyed NO llevan `archive_gate_*` (WITH CHECK evalua en INSERT).
5. **Preservacion**: la checklist de abajo se corre al cierre de cada ola. Ninguna capacidad se retira sin orden explicita del owner (las unicas ordenadas: `/coach/meal-groups`, `/coach/recipes`, absorcion de `/coach/foods`).
6. **Android-first estricto** mientras iOS 1.1.0 este en App Review: cero builds iOS, cero OTA sin `--platform android` (ver runbook), cero deps nativas nuevas.
7. **Gates reales**: nada se declara verde sin ejecucion con evidencia. Por tanda: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm check:nutrition-v2-boundaries`, `pnpm check:tokens`, `pnpm docs:check` (los que apliquen al diff).

## Tokens y white-label (regla owner: macros mismos colores SIEMPRE)

| Capa | Valor | Regla |
|------|-------|-------|
| Macros | proteina `#5E9FD6` · carbos `#FFB74D` · grasas `#81C784` | Constante compartida en packages, consumida por web y RN. JAMAS tematizable. Retirar hardcodes locales al pasar por cada archivo. |
| Semantica | exito `#10B981`, ambar alerta, error | Fija, no white-label. La zona "en rango" de la banda, checks y estado "sustituido" son semanticos. Rojo prohibido en comida. |
| Marca (white-label) | `--theme-primary` / `theme.primary` | CTAs, fill de barra de energia, acentos, pills activas. Banda: fill = marca, zona = semantica fija. |
| Grupos de porciones | color por grupo | Solo en el circulo identitario del chip (regla existente). |

## UX: presupuesto de interaccion

- Maximo 2 capas de contexto para cualquier accion frecuente (hoy: hasta 4).
- Undo universal (5-8s) reemplaza confirmacion; una sola gramatica destructiva.
- Banda ±10% (configurable por coach a futuro), encuadre semanal "X de 7 en rango". Adherence-neutral: nunca rojo, nunca caras.
- Correccion: razon OPCIONAL con chips; append-only intacto.
- Coach responsive: >=1024px paleta lateral permanente; <1024px paleta como sheet + totales/publicar fijos abajo. UNA solucion de layout para la capsula de nav (mueren el offset hardcodeado y el body-class).
- A11y sin regresion respecto al estandar actual del modulo. Dark mode, safe areas, reduced-motion, 44px.

## Runbook release Android (obligatorio, cada OTA/build)

1. Confirmar que el diff desde el ultimo release RN es JS puro (`git diff --stat` sobre apps/mobile; sin cambios en deps nativas, plugins, app.json de mobile).
2. QA en emulador `eva_pixel` (maestro + rn-devtools) + device fisico Android.
3. OTA: **SIEMPRE** `--platform android`. El canal `production` y el runtime `1.1.0` son COMPARTIDOS con la build iOS en App Review — un OTA generico la pisa.
4. Builds de QA: `eas build --local` (APK). No aparecen en build:list — es esperado.
5. Nada de iOS (build, OTA, submit, versiones) hasta veredicto de Apple. Post-aprobacion: JS a iOS via OTA segun regla vigente.
6. Todo OTA/push se propone al owner antes de ejecutar.

## Checklist de preservacion (gate de cierre de ola)

Coach: FoodPicker completo (sugerencias por procedencia, multi-add, restan-del-dia, alergias con override, favoritos, crear-en-catalogo) · tira Lu-Do con kcal/celda y presets de copia con undo · estrategias structured/flexible (+hybrid legacy legible) · permisos alumno con gate Pro server · vigente-desde + conflicto (mañana / archivar-y-reemplazar) · publish CAS + idempotencia + STALE_BASE · draft local versionado con restore/discard y beforeunload · rehidratacion con guard anti-colapso · porciones a eleccion (grupos, derivar metas, gap notice) · sustituciones por item con cap · guardar como plantilla · plantillas (favoritos, renombrar, editar, desde-plan, contador uso) · asignar a otros alumnos con reporte · archivar · roster (busqueda server, sort, tiles, "Bajaron esta semana", cola WhatsApp, keyset) · curacion barcodes + OFF attribution · notas privadas + visibles + protocolo · aria/a11y del modulo.

Alumno: aura/greeting + anillo energia + mini-anillos macro · tira semanal · badge multi-dia · nota coach · chips porciones (tap=marcar, long-press=sheet, medias porciones, confirm exceso) · sheet equivalencias · "Lo comi" + bulk + undo · fuera-del-plan · correccion/retiro append-only con copy honesto · registro libre (busqueda, favoritos-first, conversion unidades, preview totales, anti-duplicado) · scanner + reporte GTIN (RN) · compartir dia · dia pasado read-only / futuro preview · historial semanal paginado · legacy V1 detail · empty/degraded states · humanizacion de errores (incl. COACH_ACCOUNT_PAUSED) · RN: offline queue completo, celebraciones x3, deep-link slot, pull-to-refresh, haptics · web: URL-addressable, error boundary Sentry.

## Fuera de alcance

TTFB workout (track propio, instrumentar primero) · pricing `?? 'starter'` (**absorbido** por [retiro-starter-y-enterprise](../retiro-starter-y-enterprise/SPEC.md), 2026-09-05) · enterprise (congelada) · retiro V1 completo (ola propia ya planificada, no de este programa) · micros avanzados · nombre/marca/foto en overrides v1.
