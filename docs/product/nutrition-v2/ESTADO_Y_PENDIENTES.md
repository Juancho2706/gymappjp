# Nutrición V2 — Estado y pendientes (doc vivo)

> Fuente única de verdad del estado actual. Reemplaza a los handoffs/roadmaps congelados
> (archivados en `docs/archive/nutrition-v2/`). Verificado contra código y prod, no contra docs.
> Última actualización: **2026-07-17** (cierre sesión RNBUILD 2.0).

## Estado en una línea

Dominio V2 **implementado y estabilizado**, en **canary solo para josefit**. No falta código
grande para T12 — falta **validación** (device QA, métricas canary) y **2 construcciones
acotadas** (asistente de conversión de planes V1→V2, olas de fidelidad RN). 5 rondas de QA del
CEO cerradas; rediseño AURA del alumno en vivo; suite E2E validada 4/4 canary; 580 íconos de
alimentos + navbar propia en prod; catálogo genérico dedupeado (532 alimentos).

## Qué está LISTO (no re-hacer)

- Tandas 6–11 implementadas: registro/corrección canónicos, Hoy/Plan/Historial del alumno,
  hub y ficha del coach, builder de 4 pasos con modal de conflicto, celebraciones, hardening.
- RPCs profesionales scoped (`get_nutrition_*_scoped_v2`), rate limiting, flags coherentes
  web↔móvil (canary por clientId + TTL), guard anti-forja V1→V2, idempotencia de publish por plan.
- Migraciones aplicadas en prod (todas validadas BEGIN/ROLLBACK): hub drafts activos,
  T11 hardening, same-day re-derive + historial legacy.
- Catálogo: 4.898 alimentos (586→532 genéricos tras dedup), 4.312 CL con barcode, **580 íconos
  EVA** en Storage `food-media/eva-icons/` + `food_media`. Atribución ODbL per-item en scanner.
- AURA (rediseño del Hoy del alumno, web + RN), favoritos y "Compartir el día" en V2,
  navbar con 10 siluetas propias tintables.
- Suite E2E Playwright validada: 4/4 specs canary contra prod (`tests/nutrition-v2/`).

## Qué FALTA

### Bloquea T12 (validación, no código)
- [ ] **QA en device del CEO** (doc dedicado, APK `previewv2`). Nunca corrido en device real.
- [ ] Métricas del canary (runbook §5) + presupuesto de performance.

### Antes de merge a master
- [x] **Conversión de planes V1→V2**: se reemplazó el asistente coach-driven por una
      **conversión dark automática** (decisión CEO 2026-07-17: cero fricción para coaches).
      Construida en `feat/nutrition-v2-conversion`: mapeo puro (`packages/nutrition-v2/conversion.ts`,
      19 tests), driver CLI dry-run/apply (`scripts/nutrition-v2-conversion/`), migración
      `20260717120000` (tabla puente `nutrition_v2_conversion_links` + wrapper de publish
      impersonado service-role-only), banner "plan convertido" en la ficha coach.
      Spec: `specs/nutrition-v2-conversion/`. **Falta operar** (con GO del CEO):
      aplicar migración → dry-run + reporte de fidelidad → `--apply` (dark) →
      re-sync semanal hasta el flip. Planes `exchanges` (6, solo socios/e2e) = manual.
- [x] Decisión sobre cambios V1 sin flag → **aceptar con QA dirigido** (CEO, 2026-07-16).
- [x] Herramientas V1: retirar duplicado hábitos, mantener swaps Pro, adoptar favoritos+export,
      eliminar notas/compras/recetas al deprecar (CEO). Favoritos+compartir ya adoptados.

### Paridad RN 1:1 (razón de la rama `rnmobiledenuevo`)
- Funcional ~95% (auditoría de junio obsoleta). Falta **fidelidad visual** (~40%):
  olas 2R / 4A / 4B / 5 / 6 / 7 sin correr. Insumo: `docs/rn-port/specs/seccion-3/` (13/14 cerradas;
  falta ficha-nutrición-facturación, su mitad nutrición ya la superó V2).
- Si se deprecia V1 (decisión ③ = sí, post mode-on), las olas 4A/4B se achican.

### T12 rollout (por etapas)
- [ ] Ampliar canary a 2–3 coaches de confianza o clientIds puntuales → semana de observación →
      `mode on` por superficie. Infra de canary fino ya funciona (por alumno, web + móvil).
- [ ] Deprecar nutrición V1 del alumno (redirects + retiro por etapas) tras mode-on.

### Cosmético / tolerable post-lanzamiento
- [ ] Purga de objetos de Storage de los íconos redundantes tras el dedup.
- [ ] Merge de los grupos REVISAR-CEO del informe de duplicados (11 grupos).
- [ ] Badge "Historial anterior" sin variante dark; borrar `_bak_foods_global_20260715` (~29 jul)
      y `_bak_foods_dedup_20260717` tras confirmar el dedup.
- [ ] 9 worktrees obsoletos + ramas viejas → limpiar a mano (`git worktree remove`, nunca rm -rf).

## Datos útiles

- Canary: Edge Config `NUTRITION_V2_ROLLOUT` (mode canary, coachIds=[josefit `503412d0-…`]).
- Preview: `gymappjp-git-rnmobiledenuevo-juancho2706s-projects.vercel.app`.
- Build device: perfil `previewv2` (GitHub Actions → Mobile Build → branch `rnmobiledenuevo`;
  desinstalar la app de Play antes de sideload — firma distinta).
- Cuentas QA: coach josefit `503412d0-…`; alumnas Camila `6a8adf41-…`, Catalina `ba265b0b-…`.

## Docs y runbooks vigentes

- Este doc (estado + pendientes) · `README.md` (índice) · `TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md`
  (contrato de producto) · `ASSETS_CEO_2026-07.md` (inventario de assets).
- Runbooks operativos: `docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md`,
  `docs/operations/FOOD_CATALOG_CL_IMPORT.md`.
- Histórico congelado: `docs/archive/nutrition-v2/` (handoffs, roadmaps, tandas cerradas).
