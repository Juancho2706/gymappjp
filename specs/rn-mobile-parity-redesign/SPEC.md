# RN Mobile 1:1 con Web PWA (EVA DS) — SPEC

**Status:** APPROVED (decisiones de alcance confirmadas por CEO 2026-07-08)
**Owner:** Juan (CEO) + Claude (arquitecto)
**Last updated:** 2026-07-08
**Related plan:** `specs/rn-mobile-parity-redesign/PLAN.md`
**Research:** `specs/rn-mobile-parity-redesign/research/` (8 recon + 11 gaps + critic + task inventory; ~20 agentes, 2026-07-08)

---

## Problem

La web PWA/responsive de EVA fue rediseñada por completo (EVA DS, mergeada a master 2026-07-04) y recibió una ola grande de features (Fase L/M/S del ejecutor, resiliencia PR #113, nutrición overhaul, módulos de pago, hub Opciones, búsqueda global, dossier PDF, login Google GIS). La app RN (`apps/mobile`) quedó atrás en dos ejes:

1. **Visual:** ~50% de las pantallas siguen en el lenguaje visual viejo (objeto `theme` de `lib/theme.ts` + StyleSheet + fuentes Inter/Montserrat), conviviendo con ~50% ya migrado a EVA DS (NativeWind + primitivas DS + Archivo/Hanken). La fundación de tokens SÍ está espejada 1:1 (`token-contract.md`), pero la adopción por pantalla no.
2. **Funcional:** toda la ola web posterior a ~2026-06-05 no llegó a mobile: ejecución polimórfica, nutrición overhaul, capa de entitlements (0 referencias), módulos de pago, settings hub, team, suscripción rica, etc.

Además hay **bugs vivos hoy** en mobile que no son "gaps de paridad": data-loss de nutrición (borra comidas con logs vía cascade), drift de fórmulas de macros (coach ve números distintos app vs web), y deep links rotos en prod (assetlinks placeholder + iOS sin associatedDomains).

**Resultado buscado:** que un usuario (alumno o coach) al usar la app RN sienta que está viendo la versión PWA/responsive web. Paridad 1:1 visual y funcional, con excepciones explícitas y acotadas. Recién DESPUÉS del 1:1 se construyen mejoras nativas exclusivas (fuera de este spec).

## Users

- Primary: **alumnos** de coaches (app white-label, uso diario: workout, nutrición, check-in).
- Secondary: **coaches** standalone y team-managed (dashboard, clientes, builder, nutrición, settings).
- Internal/operator: CEO/QA (rondas de QA por etapa, releases a stores).

## Goals

1. **Paridad visual 1:1 — IDÉNTICA, no aproximada** con el árbol mobile de la web (`md:hidden`, breakpoint único md=760px = la referencia; el layout desktop NO aplica a RN). Prioridad #1 del CEO (2026-07-08): un usuario que conoce la PWA debe ver la MISMA pantalla en RN — mismos layouts, espaciados, tipografía, colores, radios, sombras, glow, motion y micro-interacciones. El gate de cada etapa incluye revisión de fidelidad lado a lado pantalla por pantalla (ver PLAN §QA).
2. **Paridad funcional 1:1** con todas las features web activas para coach standalone/team y alumno.
3. **Cero drift estructural:** toda lógica de negocio compartible vive en `packages/@eva/*` — mobile nunca copia/pega lógica de web (causa raíz del drift actual: `macro-calculator`, `nutrition-utils`, `profile-analytics`, nav).
4. **Money-safety:** toda superficie de módulos de pago gateada server-side (`assertModule`); nunca solo en UI.
5. Arreglar los **bugs vivos** de mobile como parte de la Etapa 0 (no al final).
6. **Experiencia de arranque brandeada** [NUEVO-CEO 2026-07-08]: splash nativo EVA (binario único, excepción vigente) → transición inmediata a splash/loader brandeado del coach (logo + color, mismo lenguaje que el splash de la PWA per-coach) apenas la app identifica al coach (sesión previa o slug recordado). Sin "flash" blanco ni pantallas genéricas entre medio.
7. **Onboarding walkthrough pre-login** [NUEVO-CEO 2026-07-08]: mini guía de introducción (carrusel de 3-5 slides, patrón nativo de apps) al primer arranque, ANTES de iniciar sesión, en EVA DS. Se muestra una sola vez (flag local), con skip. No existe en la web — es adición nativa aprobada sobre el 1:1.

## Non-Goals

- **Checkout/pagos/cambio de tarjeta in-app:** quedan web-only (money-safety + políticas IAP Apple/Google). Patrón: link-out a navegador externo + retorno. Incluye upgrade de plan, compra de add-ons, update-card y la pantalla `coach/reactivate` (display in-app, acción por link-out).
- **Ícono de app + splash per-coach:** EVA-only (un binario compartido). White-label es in-app post-login (decisión previa ya comunicada a coaches).
- **Zonas enterprise/org/admin** (`/org`, `/admin`, `enterprise.*`): archivadas comercialmente, sin puertas mobile.
- **Landing/pricing/legal público:** web-only.
- **Login Google de ALUMNO:** diferido por CEO (2026-06-21). Solo coach.
- **Mejoras nativas exclusivas** (widgets, live activities, HealthKit, etc.): post-1:1, spec futuro. Referencia: `docs/audits/mobile-native-advantages.md`.
- **Upgrade de Expo SDK durante la migración:** se congela SDK 54; subir (p.ej. a 56 para widgets) es decisión post-1:1.

## User Stories

- Como **alumno**, quiero que la app se vea y se comporte igual que la web de mi coach (misma cápsula de navegación, mismo ejecutor de rutina con keypad/stepper/timers, misma nutrición con swaps/plato/micros), para tener una sola experiencia sin importar el dispositivo.
- Como **alumno**, quiero que si cierro la app a mitad de un set no pierda mi progreso (drafts/snapshot como en web), para confiar en la app en el gimnasio.
- Como **coach**, quiero ver los MISMOS números (macros, adherencia, analytics) en app y web, para no desconfiar de la plataforma.
- Como **coach**, quiero gestionar desde el celular todo lo que gestiono en la web (builder con áreas y bloques tipados, nutrición con alérgenos/recetas, módulos comprados, funciones, equipo), para no depender del desktop.
- Como **coach con módulos pagos**, quiero usar cardio/movement/composición desde la app, y que un coach SIN el módulo no pueda acceder ni por API.
- Como **CEO**, quiero releases por etapas con QA en dispositivo real y rollback simple, para no romper la app viva en stores.

## Acceptance Criteria (del proyecto completo)

- [ ] Toda pantalla mobile usa exclusivamente EVA DS (clases NativeWind + primitivas DS); `lib/theme.ts` (objeto legacy) eliminado; fuentes Inter/Montserrat purgadas.
- [ ] Test de paridad de tokens web↔mobile en CI (contrato `token-contract.md` verificado automáticamente, no a mano).
- [ ] Checklist de paridad pantalla-por-pantalla (web md vs RN) completado y firmado en QA de cierre — misma estructura, mismos estados (loading/empty/error/offline), mismo gating.
- [ ] **Fidelidad visual idéntica verificada por etapa:** par de screenshots lado a lado (web md vs RN, light y dark) por CADA pantalla migrada, archivado en `docs/audits/rn-parity-qa/`; desviaciones solo con justificación técnica RN documentada (ej: scroll physics nativo).
- [ ] Arranque: splash EVA → splash brandeado del coach → app, sin flash genérico; paridad con el splash de la PWA per-coach.
- [ ] Walkthrough pre-login: visible solo en primer arranque, skippeable, EVA DS, no bloquea deep links (`/c/`/`/invite/` saltan directo).
- [ ] `useEntitlements()` único en mobile; toda mutación de módulo pago pasa por `/api/mobile/*` con `assertModule`; verificado que RLS no permite bypass vía PostgREST directo (incl. lecturas read-only de alumno en bodycomp/movement).
- [ ] Lógica compartida SOLO desde `packages/@eva/*` (workout-engine, plan-builder, cardio, bodycomp, profile-analytics, nutrition-engine); cero copias locales en `apps/mobile/lib`; web verde (typecheck+tests) tras cada extracción.
- [ ] Bugs vivos cerrados: reconcileMeals en mobile (cero borrado de comidas con logs), macros idénticos web/app para el mismo alumno, deep links Android verificados + universal links iOS funcionando.
- [ ] Guardar un plan desde el builder mobile NUNCA destruye campos que no edita (`section_template_id`, campos polimórficos) — round-trip test.
- [ ] GRANTs de columna y RLS confirmados ANTES de cada write-path nuevo (cero 42501 en runtime; 2 incidentes históricos).
- [ ] Sentry (o equivalente) activo en prod mobile; crashes y errores de red observables.
- [ ] Cada etapa cierra con: `tsc --noEmit` + vitest verdes, `expo export` Android OK, smoke Maestro del flujo core, QA CEO en dispositivo real, y estado consistente para release (sin pantallas a medias visibles).

## Decisiones de producto (rulings del arquitecto — principio: web = fuente de verdad)

| # | Conflicto | Ruling | Veto CEO |
|---|---|---|---|
| D1 | Gate de creación de ejercicios: web=workspace vs mobile=tier | Adoptar regla web (workspace) | pendiente OK |
| D2 | Tabs ficha alumno: web 5 (sin Facturación) vs mobile 6 (con Pagos) | 5 tabs, nombres web (Resumen/Progreso/Entreno/Programa/Nutrición) | pendiente OK |
| D3 | Token dark `surface-inverse`: web neutro `#2A323D` vs mobile brand-tinted `#16273C` | Neutro web (idem `surface-inverse-2`, `text-muted` dark) | pendiente OK |
| D4 | HabitsTracker: mobile en Nutrición vs web en Dashboard | Dashboard (como web) | pendiente OK |
| D5 | `workspace/select` página dedicada | No se porta; el bottom-sheet switcher la cubre en RN | — |
| D6 | Dossier PDF ficha (jsPDF descarga navegador) | Spike en Etapa 5: expo-print/share nativo; si fidelidad insuficiente → link-out web documentado | — |
| D7 | `coach/reactivate` | Display in-app + gate de estado `cancelled` + acción por link-out (patrón pagos) | — |
| D8 | `coach/templates` | Redirect legacy, no se porta | — |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Round-trip destructivo del builder mobile (borra `section_template_id`/campos polimórficos al guardar) | Data-loss en planes de coaches | Passthrough de campos desconocidos ANTES de cualquier re-skin del builder (Etapa 0/3); round-trip test |
| Data-loss nutrición activo (cascade borra logs) | Historial de adherencia de alumnos destruido HOY | Fix en Etapa 0 con `reconcileMeals` compartido |
| 9 implementaciones divergentes de entitlements | Evasión de cobro / drift | UNA foundation en Etapa 0; dominios solo la consumen |
| Extracciones a packages rompen web prod | Regresión en la app que factura | Gate "web verde tras cada seam" (typecheck+vitest+build) en el mismo PR |
| GRANTs/RLS faltantes → 42501 solo en prod | Outage runtime (2 incidentes previos) | Auditoría DB en Etapa 0 + migración aditiva única + verificación por write-path |
| Libs nativas nuevas fuerzan builds EAS y fragmentan versiones | Usuarios en versiones incompatibles | Batch de libs nativas al inicio de etapa; OTA solo para JS-only; `runtimeVersion: appVersion` |
| Re-skin de monolitos legacy (builder 1279L, program-builder 1234L, clientes 1224L) se toca 2 veces (visual + reconstrucción funcional) | Doble costo oculto | Plan lo explicita: re-skin visual con passthrough (E3) ≠ reconstrucción funcional (E5); no se estima como una sola L |
| App mitad-vieja/mitad-nueva visible en stores | Percepción de calidad | Releases solo al cierre de etapa (estado consistente); flags locales para pantallas incompletas |
| Trampa `font-semibold→Inter` en tailwind.config resiembra fuentes legacy durante el re-skin | Re-trabajo masivo | Fix de mapeo tipográfico es GATE de orden: va antes de cualquier re-skin de pantalla |

## Open Questions

- [ ] D1-D4: veto/OK del CEO (defaults ya definidos; no bloquean Etapa 0).
- [ ] Matriz de dispositivos QA: ¿qué devices físicos hay disponibles? (mínimo: 1 Android gama media + 1 iPhone; definir en Etapa 0.G).
- [ ] ¿Existe cuenta Sentry o se crea? (Etapa 0.G).
