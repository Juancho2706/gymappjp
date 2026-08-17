# PLAN — Sello EVA v2 (fondo B por defecto)

Referencia: [SPEC](SPEC.md) + artifact «Variaciones del Sello» (valores normativos).
Ejecución con workers (Opus implementa, Sonnet mecánico, Fable juzga). Tareas en
[TASKS](TASKS.md).

## Arquitectura

1. **Helper del par derivado** (`packages/` o el resolutor de branding existente — el worker
   audita dónde vive hoy la resolución de marca compartida y lo coloca junto a ella):
   `sealPair(brandHex) → { primary, secondary }` con la fórmula D3, tests golden (5 marcas).
   Web lo publica como CSS vars (`--seal-p-h/s/l`, `--seal-s-h/s/l`) desde el mismo lugar
   que publica `--theme-primary`; RN lo consume directo.
2. **Web `AppSeal`**: dos divs `fixed inset-0 -z-10` (blobs, con keyframes de deriva
   `motion-safe`) + pseudo-capa de grano; variante `grain` = solo grano `absolute` para el
   overlay del editor. Tokens de alphas por tema en `globals.css` (`.dark` redefine).
   Montajes: coach shell, alumno shell. Pre-auth NO monta nada (allowlist por layout, no por
   runtime-pathname, para que sea imposible filtrarlo a login).
3. **RN `AppBackground` v2**: quitar capa `appgrid`; `SKY` fijo → `sealPair(...).secondary`;
   deriva con Reanimated (`useSharedValue` + `withRepeat(withTiming)` sobre transform de los
   dos círculos Skia) gateada por reduce-motion y prop `animated`.
4. **Gate visual**: el harness gana `?seal=1` que monta AppSeal en la página de pruebas;
   asserts: (a) blobs presentes y con los colores derivados esperados para 2 marcas,
   (b) contraste WCAG de textos clave sin cambio vs sello apagado, (c) reduced-motion
   emulado ⇒ sin animaciones corriendo, (d) rutas pre-auth sin el componente (fetch del
   HTML de /login del harness build si aplica, o assert de no-montaje por unit test del
   layout). Capturas dark/light × 2 marcas.

## Waves

| Wave | Contenido | Gate |
|---|---|---|
| S1 | Helper `sealPair` + tests + tokens `--seal-*` + `AppSeal` web + stories harness | vitest + typecheck + tokens |
| S2 | Montajes web (coach shell, alumno shell, grano en editor overlay) + asserts del gate | visual check EXIT 0 |
| S3 | RN `AppBackground` v2 (sin grilla, par derivado, deriva Reanimated + gates de movimiento) | tsc + expo export |
| S4 | Docs (`CURRENT`/`MOBILE_PARITY`) + juicio + QA dueño → entra al OTA vigente | todo verde |

S1→S2 secuencial; S3 tras S1 (comparte helper). **No arrancar mientras el workflow de Guía
Viva esté vivo** (adyacencia en QuickEditPlanView/hub).

## Qué NO hacer

- Nada de imágenes/PNGs ni librerías: puro gradiente/Skia ya presente.
- No montar por pathname en runtime (allowlist por layout).
- No tocar la familia de entrada ni pre-auth.
- No animar el grano jamás; no usar `filter`/`background-position` animados.
- El editor overlay recibe SOLO grano (D2) — nada de blobs bajo datos.
