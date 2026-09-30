---
status: reference
owner: product-engineering
last_verified: "2026-09-30"
canonical: false
---

# Mockups de pendientes con motion — 30-09-2026

Mockups visuales (HTML autocontenido, se abren en el navegador) de lo que sigue abierto al 30-09 según
[CURRENT](../../status/CURRENT.md), las specs `active`/`draft` y los artifacts de septiembre. **Nada de esto
está implementado**: son propuestas para decidir. No crean backlog ni reemplazan las specs.

- [`pendientes.html`](pendientes.html) — 10 pendientes con pantalla, ordenables por fecha o por dificultad,
  cada uno con mockup en App (RN), PWA y Escritorio y su ficha de motion; al final, la tabla de lo que no
  tiene pantalla.
- [`builder-recompensa.html`](builder-recompensa.html) — Workout Builder interactivo con recompensa visual
  atada a trabajo real (anillos por día, balance muscular, «Semana lista») y el mismo criterio en el editor
  de nutrición («Día cuadrado»). Modo Escritorio/PWA y modo App con el mismo estado.

Todo el motion usa los tokens vigentes: duraciones y curvas de `apps/web/src/app/globals.css`
(`--dur-*`, `--ease-*`) y los springs de `packages/brand-kit/motion.ts` (`SPRING.ui` 18/220,
`SPRING.bouncy` 12/180), con `prefers-reduced-motion` respetado en todos los casos.
