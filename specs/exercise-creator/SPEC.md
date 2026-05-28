# SPEC — Custom Exercise Creator

**Status**: Approved
**Owner**: Juan Villegas
**Date**: 2026-05-27
**Tier**: Starter+ (gated, free bloqueado)

## Problema

Hoy los coaches no pueden crear sus propios ejercicios. Dependen de una biblioteca seed (que tampoco está sembrada en producción), por lo que el exercise picker del workout builder muestra una lista vacía o limitada. Esto genera:

- Coach pierde tiempo explicando ejercicios por chat sin demostración visual.
- No hay forma de personalizar la biblioteca con variantes propias del método del coach.
- Pierde diferenciación competitiva vs Hevy/Everfit/TrainHeroic que sí permiten ejercicios custom.

## User stories

**US-1** (coach Starter+): como coach, quiero crear un ejercicio propio con nombre, grupo muscular, equipo, dificultad, video de YouTube unlisted e instrucciones para que aparezca en mi exercise picker al armar planes.

**US-2** (coach Starter+): como coach, quiero ver una biblioteca dedicada `/coach/exercises` con search + filtros para administrar mis ejercicios y la biblioteca del sistema EVA.

**US-3** (coach Starter+): como coach, quiero editar y borrar ejercicios propios sin romper planes históricos que los usan.

**US-4** (coach Starter+): como coach armando un plan, quiero un botón `+ Crear ejercicio` dentro del exercise picker del builder para no perder contexto.

**US-5** (coach free): como coach free, quiero entender qué pierdo y cómo upgradeear cuando intento acceder al exercise creator (espejo del patrón "Mi Marca").

**US-6** (cliente del coach): como cliente recibiendo un plan, quiero ver el video del ejercicio embedded en mi app sin que YouTube me trackee (privacy-enhanced mode).

## Acceptance criteria

- [ ] AC1: `/coach/exercises` accesible para coaches Starter+. Free ve UpsellGate.
- [ ] AC2: Form crear ejercicio valida cliente (RHF + Zod) y servidor (Zod en server action).
- [ ] AC3: URL de YouTube se normaliza a `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1` antes de persistir.
- [ ] AC4: URLs malformadas (e.g., `youtube.com.evil.com`) son rechazadas por regex de host whitelist.
- [ ] AC5: Ejercicio creado por coach A NO es visible para coach B (RLS aditiva, sin romper acceso a ejercicios `coach_id IS NULL`).
- [ ] AC6: Soft-delete (`deleted_at`) — ejercicio borrado deja de aparecer en picker pero planes que lo usan siguen renderizándolo.
- [ ] AC7: Iframe con `sandbox`, `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"`. CSP permite `youtube-nocookie.com` + `i.ytimg.com`.
- [ ] AC8: Botón `+ Crear` en `DraggableExerciseCatalog` del builder abre el mismo modal reusable.
- [ ] AC9: Server action rechaza con `upgrade_required` si tier no es Starter+ (sin confiar solo en UI).
- [ ] AC10: Migration que habilita RLS pasa pre-check (0 huérfanos) + tiene policies en mismo archivo + rollback documentado.

## Out of scope (post-MVP)

- Upload de video propio a Supabase Storage (solo YouTube URL en MVP).
- Upload de imagen/GIF estática propia.
- Compartir ejercicios entre coaches de la misma org (eso es v2/enterprise).
- Versionado de ejercicios (`exercise_versions`).
- Marketplace de ejercicios (compra/venta entre coaches).
- Selector anatómico SVG clickeable de músculos.
- IA para generar instrucciones desde el video.

## Métricas de éxito

- % coaches Starter+ con ≥1 custom exercise en 30 días post-launch (target: > 60%).
- Promedio de custom exercises por coach activo (target: > 5 en 60d).
- Conversion rate free→starter atribuible al gate `custom_exercises` (vía `UpgradeGateTracker`).
- Reducción del time-to-first-plan para coaches nuevos (baseline a medir pre-launch).

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| RLS rompe coaches existentes | Pre-check query + policies aditivas + rollback en 1 comando. |
| YouTube URL privada (no embeddable) | Iframe falla silencioso, mostrar mensaje UI. No hacemos oEmbed call para validar (overhead). |
| Coach borra exercise usado en planes | Soft-delete + `workout_blocks` lookup por id mantiene visibilidad histórica. |
| Capability cambia (downgrade tier) | Data existente queda read-only visible, no se oculta (pérdida percibida). |

## Sources

Ver `C:\Users\juanm\.claude\plans\genera-un-plan-para-splendid-turing.md` para sources mayo 2026.
