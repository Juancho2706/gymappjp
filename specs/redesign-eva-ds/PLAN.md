# PLAN — Rediseño total EVA (cómo)

Acompaña a `SPEC.md`. Detalle de arquitectura, reconciliaciones y orquestación.

---

## 1. Arquitectura de la migración

El rediseño es **capa de presentación + tokens**. No toca dominio/infra/services/DB. Tres puntos de inyección (del informe):
1. `apps/web/src/app/globals.css` `@theme` — tokens web.
2. `apps/mobile/global.css` + `tailwind.config.js` + `lib/theme.ts` — tokens mobile.
3. `packages/brand-kit` — motor white-label (compartido).

### Capa semántica (nueva, pública)
Se introduce el set de aliases semánticos del diseño como la **API de tokens** que consumen los componentes:
`--surface-{app,card,sunken,inverse,overlay}`, `--text-{strong,body,muted,subtle,on-sport,on-dark,...}`, `--border-{subtle,default,strong}`, `--action-primary`, `--cta-fill`, `--accent-{training,nutrition,recovery}`, `--track`, `--focus-ring`, `--viz-1..6`.
Debajo viven las ramps base (`ink-*`, `sport-*`, `ember-*`, `aqua-*`, status). Los componentes referencian SOLO aliases semánticos → dark y white-label funcionan "gratis".

- **Web:** mapear los nombres shadcn (`--background`, `--foreground`, `--primary`, `--card`, `--border`…) a los aliases del diseño dentro de `@theme`, para no reescribir todas las clases shadcn de golpe; en paralelo ir migrando componentes a usar los aliases directos.
- **Mobile:** los `--color-*` (canales RGB para `rgb(var()/<alpha>)`) se re-derivan desde las ramps; `tailwind.config.js theme.extend` gana utilidades semánticas (`bg-surface-card`, `text-muted`, `border-subtle`, `rounded-card`, etc.).

### Radius semántico
`--radius-card` (20px), `--radius-control` (14px), `--radius-pill`, `--radius-sheet` (28px) — explícitos. Web: añadir como utilidades; mobile: a `tailwind.config`. Migrar `rounded-*` ad-hoc a los semánticos por pantalla.

## 2. D2 — Reconciliación white-label (la pieza central)

Hoy `@eva/brand-kit resolveBrandTheme(brandColor)` (culori/OKLCH, clamp WCAG) emite un theme con `accent`, `bg`, `surface`, etc. Se **extiende** para emitir además la **ramp sport completa** (`sport-100…700`, 7 pasos) derivada del `primary_color`:

- Nuevo output `sportRamp: { 100:…, 200:…, …, 700:… }` (OKLCH: variar L manteniendo H/C del brand; clamp para que 500 = brand y 600/700 pasen WCAG como texto/CTA, 100/200 como tints suaves).
- `--focus-ring` y `--cta-fill` se derivan del 500/600.
- Ember/aqua/ink/status quedan **fijos** (constantes del sistema).
- Inyección: web sigue el patrón `<style>` inline en `coach/layout.tsx` (y headers en `/c/[slug]`), ahora seteando `--sport-100…700` en vez de solo `--theme-primary`. Mobile: `brandVars()` setea la ramp en los `nativewind.vars()` del root.
- Contrato DB intacto: `coaches.primary_color` / `brand_font_key` / `use_brand_colors_coach`. Free → ramp desde `SYSTEM_PRIMARY_COLOR` (#007AFF, ~= sport). Default EVA → sport #2680FF.
- **Tests:** unit del derivador de ramp (snapshot + asserts WCAG AA en 600/700 sobre paper y sobre dark). Compartido → corre una vez, sirve web+mobile.

## 3. D3 — Tipografía

- **Web:** agregar `Archivo` y `JetBrains Mono` vía `next/font` (`preload:false` salvo el peso display crítico). `Hanken Grotesk` ya está cargada → pasa a `--font-ui` default. Mapear `--font-display=Archivo`, `--font-ui=Hanken`, `--font-mono=JetBrains Mono`. `brand_font_key` per-coach sigue overrideando SOLO el display (`brand-fonts.ts`).
- **Mobile:** agregar `@expo-google-fonts/archivo` + `@expo-google-fonts/jetbrains-mono` (pnpm; revisar `allowBuilds` si hace falta). Cargar pesos 800/900 Archivo, 400/500/600/700/800 Hanken, 400/500/700 JetBrains Mono. `tailwind.config` families: `display`→Archivo, `sans`→Hanken, `mono`→JetBrains.
- Métricas: utilidad `.eva-metric` (Archivo black + tracking + `tnum`).

## 4. Dark mode

Mantener `.dark` (web `next-themes`, mobile clase) — NO migrar a `[data-theme=dark]`. Al portar el CSS del diseño, reautorar sus bloques `[data-theme="dark"]` bajo `.dark`. Solo flipean aliases semánticos.

## 5. Paridad RN ≡ Web responsive (restricción dura)

Ambos se construyen desde `ui_kits/eva-app/`. No hay `@eva/ui` cross-platform (DOM vs RN), así que la igualdad se garantiza por:
- **Misma spec visual** por pantalla (extraída a `specs/redesign-eva-ds/screens/`), implementada dos veces (Tailwind web / NativeWind RN) con los **mismos tokens** (mismos nombres semánticos en ambos).
- Mismos componentes visuales (los 13) con paridad de variantes/medidas.
- Web a <760px = layout mobile (la regla del diseño); el desktop diverge solo ≥760px.
- **Checklist de paridad** al cierre: capturas RN 390px vs web 390px lado a lado en pantallas clave (dashboard alumno, plan, rutina, check-in, dashboard coach, alumnos, builder).

## 6. Modelo de orquestación (multi-agente)

- **Extracción (needs MCP `claude_design`):** SOLO main-loop o **forks** (heredan auth). Forks snapshotean el diseño a `docs/design-source/` verbatim → fuera de mi contexto.
- **Specs + implementación (no MCP):** **workflows** con agentes frescos baratos que leen `docs/design-source/` + el código actual. Patrón por fase:
  - `pipeline`/`parallel` por unidad (componente o pantalla) × plataforma (web/mobile).
  - Cada agente: lee la spec del diseño + el archivo actual → produce el código nuevo en su archivo.
  - Etapa de verificación adversarial por unidad (typecheck del archivo, paridad con la spec, dark/white-label).
  - Synthesis: el main-loop corre `typecheck`+`lint`+build al cierre de cada fase.
- El main-loop queda EN EL LOOP entre fases: lee resultados, decide la siguiente, corre el gate.

## 7. Gate de testing (por fase)

`pnpm typecheck` + `pnpm lint` + `pnpm build` (web) · `tsc` + `expo export` (mobile) · `pnpm test` (vitest donde aplique). Verde antes de avanzar de fase. **Playwright/E2E + QA visual + white-label live SOLO al cierre y con OK del CEO** (regla del repo: IO budget Supabase).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Superficie enorme (~55 pantallas × 2) | Fase 0 aplica ~80% del look vía tokens antes de tocar pantallas |
| Forks caros (heredan contexto) | Extracción acotada a 2 forks; implementación con agentes frescos baratos |
| Romper white-label vivo | D2 conserva contrato DB + tests WCAG; 0 migraciones |
| Pérdida de funciones por reorg del diseño | Matriz feature-preservation obligatoria (AC5), verificada al cierre |
| Choque con ramas paralelas (mobile/nutrición) | Rebasear seguido; este branch es el único que toca presentación |
| Paridad RN/web drift | Mismos tokens semánticos + checklist de paridad al cierre |
| Context bloat del main-loop | Snapshot a disco vía forks; agentes de impl leen disco, no inflan main |

## 9. Provenance del diseño

- Proyecto: `d76cae7a-af93-4f35-8dc2-d96b5603e794` ("EVA Design System MASTER OPT new alumno dash").
- Snapshot verbatim en `docs/design-source/` (no es código de prod; referencia de implementación).
- Re-pull posible en cualquier momento vía DesignSync `get_file` por `projectId` (main-loop o fork).
