# 4A-12 — Celebraciones y residuos transversales (decisión de producto)

Archivos RN: `apps/mobile/components/nutrition-v2/CelebrationOverlay.tsx`,
`apps/mobile/lib/nutrition-v2-celebrations.ts`, `nutrition-v2-celebrations.storage.ts`. Disjunto.

## Inventario de celebraciones

| Evento | Web | RN |
|---|---|---|
| Meta de energía cumplida (1×/día) | SÍ — confeti tintado al primario + overlay ilustración `dia-completado` + pill, dentro del hero (`AuraHero.tsx:70-104,211-242` web) | SÍ — `decideEnergyGoalCelebration` vía CelebrationOverlay (`index.tsx:572-583`) |
| Primer registro del día (meal-logged) | NO existe | SÍ (`index.tsx:370-376`, `add-food-v2.tsx:261-267`) |
| Día completo (day-close) | NO existe | SÍ (`index.tsx:544-554`) |
| Hit del scanner | NO existe | SÍ (`scanner.tsx:86-90`) |

## Afirmaciones

1. **Meta de energía**: paridad de intención (adaptación sancionada: el confeti canvas del web se
   reemplaza por el overlay nativo). Comprobación de cierre: el overlay RN de ESTE evento muestra
   ilustración `dia-completado` (llega con 4A-07) + pill "¡Meta de energía cumplida!" (copy web
   `AuraHero.tsx:237`) + partículas tintadas al primario; 1×/día por fecha (storage — paridad con
   sessionStorage web, adaptación persistente documentada); reduce-motion = sin partículas
   (web `AuraHero.tsx:82,96`).
2. **Las otras tres celebraciones NO existen en web.** Filtro §1: no son paridad; son diseño extra.
   Default de la ola: retirarlas (o feature-flag off) SALVO excepción escrita del owner. Esta unidad
   ejecuta la decisión en los tres call-sites (index/add-food/scanner) tocando SOLO el módulo de
   decisiones (`decideMealLoggedCelebration`/`decideDayCloseCelebration`/`decideScannerHitCelebration`
   pueden devolver null) para no chocar con las unidades dueñas de esos archivos.
3. **Haptics** (impact/selection/notification en todos los flujos RN): capacidad exclusiva de
   plataforma → fuera del filtro §1, se conservan sin documentación extra.

## Comprobación objetiva

Con la decisión tomada: cruzar la meta de energía dispara exactamente UNA celebración por día con la
ilustración/pill; registrar una comida, cerrar el día o escanear NO dispara nada (o lo que el owner
haya autorizado por escrito).

## Cierre (2026-07-21)

Ejecutada la decisión del owner (`DECISIONES-OWNER.md` fila 2): **CONSERVAR** las tres celebraciones
RN-extra (meal-logged, day-close, scanner-hit) como divergencia aprobada; **nada retirado**.
`CelebrationDecision` pasó a unión discriminada por `kind` (`badge` | `energy-goal`).

Paridad de meta de energía **cerrada**: la celebración deja de reusar el badge `dia-cerrado` y estrena
presentación propia espejo del web (`AuraHero.tsx`) — card con ilustración `dia-completado` (círculo
tintado al primario 12%) + pill con copy exacto "¡Meta de energía cumplida!", partículas tintadas SOLO
al primario, overlay 3000ms / 4000ms con reduce, 1×/día persistente (storage ya existente) y sin
partículas bajo reduce-motion. El `backdrop-blur` del web se **omite** como adaptación nativa (sin
BlurView). Las tres celebraciones nativas conservan háptica + animación de badge intactas.
