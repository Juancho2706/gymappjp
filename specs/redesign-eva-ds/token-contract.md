# Token Contract — Fase 0 (fuente única de verdad)

Contrato canónico que TODOS los agentes de Fase 0 (web, mobile, brand-kit, fuentes) deben respetar para garantizar coherencia y paridad RN≡web. Valores verbatim del diseño `d76cae7a` (`tokens/*.css`). Los componentes referencian SOLO aliases semánticos.

---

## 1. Ramps base (idénticas en ambas plataformas, NO white-label salvo `sport`)

### Ink (cool neutral)
`950 #0B0E13 · 900 #12161D · 800 #1B2129 · 700 #2A323D · 600 #3D4754 · 500 #5A6573 · 400 #818C9A · 300 #A8B1BD · 200 #CDD3DB · 100 #E6E9ED · 50 #F4F6F8` · `paper #FBFCFD` · `white #FFFFFF`

### Sport (primario — ESTE es el que el white-label sobreescribe por coach)
`700 #0B47B0 · 600 #1462DC · 500 #2680FF (signature) · 400 #5C9DFF · 300 #93BEFF · 200 #C5DCFF · 100 #E8F1FF`

### Ember (nutrición — FIJO)
`700 #C23E14 · 600 #E8511E · 500 #FF6A3D · 400 #FF8C66 · 300 #FFB199 · 200 #FFD6C7 · 100 #FFEDE6`

### Aqua (recovery — FIJO)
`700 #0A6E8D · 600 #0E8FB8 · 500 #18ABD4 · 400 #57C7E6 · 200 #BEE8F4 · 100 #E3F5FB`

### Status (FIJO)
success `700 #0E7A50 · 600 #0F7D50 · 500 #1FB877 · 100 #DBF5EA` · warning `700 #8F5A05 · 600 #A8690A · 500 #F5A524 · 100 #FDEFD3` · danger `700 #A8163A · 600 #BE183C · 500 #F4365A · 100 #FCDDE4` · info `600 #1462DC · 500 #2680FF · 100 #E8F1FF`

## 2. Aliases semánticos (LIGHT) — la API pública que consumen los componentes

```
--surface-app: var(--paper)        --surface-card: var(--white)
--surface-sunken: var(--ink-50)    --surface-inverse: var(--ink-950)
--surface-inverse-2: var(--ink-900) --surface-overlay: rgba(11,14,19,.55)
--text-strong: var(--ink-950)      --text-body: var(--ink-800)
--text-muted: var(--ink-500)       --text-subtle: #646F7D
--text-on-sport: var(--white)      --text-on-success/-warning/-ember: var(--ink-950)
--text-on-dark: var(--ink-50)      --text-on-dark-muted: #939DAB
--text-link: var(--sport-600)
--border-subtle: var(--ink-100)    --border-default: var(--ink-200)
--border-strong: var(--ink-300)    --border-inverse: rgba(255,255,255,.10)
--track: var(--ink-100)
--brand: var(--sport-500)          --brand-strong: var(--sport-600)
--action-primary: var(--ink-950)   --action-primary-hover: var(--ink-800)
--cta-fill: #1A6BE6   (¡Button variant=sport usa ESTE, no lime!)   --cta-danger: #D31E45
--accent-training: var(--sport-500) --accent-nutrition: var(--ember-500) --accent-recovery: var(--aqua-500)
--focus-ring: rgba(38,128,255,.40)
--viz-1..6: sport-500 / ember-500 / aqua-500 / sport-300 / ember-300 / ink-400
```

## 3. Aliases semánticos (DARK) — bajo `.dark` (NO `[data-theme=dark]`)
Solo flipean aliases (las ramps base quedan constantes). Valores clave:
```
--surface-app:#0A0D12 --surface-card:#161B22 --surface-sunken:#1F262F
--surface-inverse:#16273C --surface-inverse-2:#0E1722 --surface-overlay:rgba(0,0,0,.62)
--text-strong:#F4F6F8 --text-body:#CDD3DB --text-muted:#8A95A3 --text-subtle:#86919E
--text-link:var(--sport-400)
--border-subtle:rgba(255,255,255,.07) --border-default:rgba(255,255,255,.13) --border-strong:rgba(255,255,255,.22)
--track:rgba(255,255,255,.10)
--action-primary:var(--cta-fill) --action-primary-hover:var(--cta-fill)
```
+ tints status translúcidos (success/warning/danger/info/sport/ember/aqua `-100` a rgba ~.18-.20),
+ soft-chip fg aclarados (success/warning/danger/info/sport/ember/aqua `-600/-700` lighten),
+ `--ink-100:#232A33 --ink-200:#313A45 --ink-300:#414C5A --ink-700:#C2C9D2 --ink-800:#DDE2E8` (chips/tracks/iconos),
+ shadows re-tuneadas (borde + lift, ver tokens/theme-dark.css). Transcribir verbatim de `docs/design-source/tokens/theme-dark.css` (en contexto del parent / re-pull).

## 4. Tipografía (D3)
- Familias: `--font-display: Archivo` · `--font-ui: Hanken Grotesk` · `--font-mono: JetBrains Mono`.
- Pesos: 400/500/600/700/800/900. Display headings 800–900, tracking `-0.03em` (`--ls-tighter`).
- Escala px: 3xs 11 · 2xs 12 · xs 13 · sm 14 · md 16(base) · lg 18 · xl 21 · 2xl 25 · 3xl 31 · 4xl 39 · 5xl 49 · 6xl 62.
- Line-heights: tight 1.05 · snug 1.18 · normal 1.4 · relaxed 1.6. Eyebrow ls 0.12em uppercase.
- Métricas: `tnum`+`lnum` (`.eva-metric` = Archivo black + tracking + tabular).
- **Web:** `next/font` agrega Archivo + JetBrains Mono (Hanken ya cargada). `--font-display`/`-ui`/`-mono`. `brand_font_key` per-coach overridea SOLO display.
- **Mobile:** `@expo-google-fonts/archivo` + `@expo-google-fonts/jetbrains-mono` (+ Hanken). Cargar en `_layout.tsx` useFonts. `tailwind.config` families display=Archivo, sans=Hanken, mono=JetBrains.

## 5. Espaciado / radius / motion / shadows
- Spacing grid 4px: 0/2/4/8/12/16/20/24/32/40/48/64/80/96. Gutter screen 20, card 16, max-content 440, hit-min 44, controls 36/48/56, icons 16/18/20/24/32.
- Radius: xs 6 · sm 10 · md 14 · lg 20 · xl 28 · 2xl 36 · pill 999 · sheet 28. **Semánticos:** `--radius-card`=lg(20) · `--radius-control`=md(14) · `--radius-pill` · `--radius-sheet`(28).
- Motion: dur instant 80 / fast 140 / base 220 / slow 320 / slower 480. ease-out `cubic(.22,1,.36,1)` (default) · spring `cubic(.34,1.56,.64,1)` (celebrar) · press scale 0.97.
- Shadows: xs→xl cool-tinted (rgba 13,18,28) + `--glow-sport` 0 6px 20px rgba(38,128,255,.42). Dark: borde + lift (ver theme-dark).

## 6. Mapeo por plataforma

### Web (`apps/web/src/app/globals.css` `@theme`)
- Definir ramps + aliases semánticos como CSS vars en `:root` y `.dark`.
- **Compat shadcn:** mapear nombres shadcn existentes a aliases del diseño para no romper clases actuales de golpe:
  `--background→--surface-app · --foreground→--text-body · --card→--surface-card · --primary→--brand · --border→--border-subtle · --muted→--surface-sunken · --ring→--focus-ring`, etc.
- Radius: `--radius-card/control` como utilidades (`rounded-card`, `rounded-control`).
- Migración de componentes a aliases directos = incremental (Fase 1+).

### Mobile (`apps/mobile/global.css` + `tailwind.config.js`)
- `--color-*` (canales RGB para `rgb(var()/<alpha>)`) re-derivados de las ramps; agregar utilidades semánticas: `bg-surface-card`, `bg-surface-app`, `text-strong/body/muted/subtle`, `border-subtle/default`, `bg-sport-500`, `bg-ember-500`, `rounded-card/control/pill`, families.
- Dark bajo `.dark` (igual mecanismo actual).
- Mantener `nativewind.vars()` para inyección runtime del white-label.

## 7. D2 — White-label: brand-kit emite ramp sport
`packages/brand-kit` gana output `sportRamp` (7 pasos 100..700) derivado del `primary_color` del coach:
- OKLCH: 500 = brand exacto; 100/200 tints suaves (L alto, C bajo), 600/700 oscuros (clamp WCAG AA como CTA/texto sobre paper y sobre dark). H/C heredados del brand (clamp C para no saturar de más).
- `--focus-ring` = brand @ .40 alpha; `--cta-fill` = paso ~600 (white-safe ≥4.5:1).
- Ember/aqua/ink/status NO se tocan (constantes).
- **Inyección:** Web `coach/layout.tsx` `<style>` inline setea `--sport-100..700` (+ `/c/[slug]` por headers). Mobile `brandVars()` setea la ramp en `nativewind.vars()` del root.
- Free coach → ramp desde `#007AFF` (SYSTEM_PRIMARY). Default EVA → `#2680FF`. Contrato DB intacto (`primary_color`/`brand_font_key`/`use_brand_colors_coach`).
- **Tests** (vitest, una vez, sirve web+mobile): 500==brand; 600/700 pasan AA 4.5:1 sobre `--surface-app` light y dark; 100/200 contrastan con `--text-on-sport`/strong.

## 8. Invariante de paridad
Web responsive (<760px) y RN deben usar los **mismos nombres semánticos** y los **mismos componentes** (los 13). Cualquier medida/variante nueva se agrega a AMBOS. El desktop (≥760px) puede divergir; <760px = app mobile verbatim.
