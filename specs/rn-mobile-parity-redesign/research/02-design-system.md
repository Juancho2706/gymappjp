# 02 — Design System EVA DS (web) y su brecha con mobile

Investigacion de solo lectura. Rutas archivo:linea reales. Español neutro.

## Hallazgo global (leer primero — cambia el encuadre del brief)

El brief asume que mobile usa "lenguaje visual VIEJO (pre-EVA DS)". **Eso es solo parcialmente cierto.** La verdad verificada en el codigo:

- La **fundacion de tokens de EVA DS ya esta portada a mobile y espejada 1:1 con web** a traves de un contrato compartido (`specs/redesign-eva-ds/token-contract.md`). Existen dos artefactos gemelos: `apps/web/src/app/globals.css` (CSS vars hex, `@theme` de Tailwind v4) y `apps/mobile/global.css` (mismas vars, canales `r g b` para NativeWind). Los valores coinciden.
- El **motor white-label es literalmente el mismo paquete** en ambas plataformas: `@eva/brand-kit` (`packages/brand-kit/index.ts`), TS puro sin DOM/React. Web y RN llaman `resolveBrandTheme()` y `deriveSportTokens()`.
- Los **tokens de motion tambien son compartidos** (`packages/brand-kit/motion.ts` → consumido por `apps/mobile/lib/motion.ts` con Reanimated).
- Las **primitivas canonicas del DS (14 componentes) ya estan portadas a mobile** con fidelidad alta (Button, Card, Badge, Input, SegmentedControl, ListRow, TabBar, Avatar, IconButton, Tag, ProgressBar, ProgressRing, StatCard). Todas referencian `docs/design-source/components/*` en sus comentarios.

Por lo tanto la brecha real **NO es la fundacion de tokens ni las primitivas base** (eso es ~90% hecho). La brecha real es:
1. **Fidelidad a nivel de PANTALLA** (las screens no consumen las primitivas de forma consistente, o quedaron con layouts viejos) — fuera del alcance de este documento pero critico para el plan.
2. **Primitivas interactivas/overlay faltantes** en mobile respecto a la superficie `ui/` de web (toast, select, dropdown, popover, switch estilizado, command palette, tabs animados).
3. **Deuda de doble sistema de theming** en mobile (objeto `Theme` imperativo de StyleSheet vs. clases NativeWind) que conviven y a veces se contradicen.
4. **Fuentes legacy** (Inter/Montserrat) todavia cargadas y usadas en algunos primitivos (ej. titulo del BottomSheet).

Fuente canonica de la fundacion: `specs/redesign-eva-ds/token-contract.md` (Fase 0). El diseño fuente vive en `docs/design-source/` (tokens/, components/core|data|forms|navigation/, ui_kits/eva-app + eva-desktop).

---

## (A) Inventario de tokens web → valor light/dark → equivalente mobile

Web declara tokens como **hex** en `apps/web/src/app/globals.css`. Mobile declara los mismos como **canales `r g b`** (space-separated) en `apps/mobile/global.css` para que funcionen los modificadores de opacidad de NativeWind `rgb(var(--x) / <alpha>)`. **Estado: espejo 1:1 verificado.** Detalle:

### Ramp Ink (neutral frio) — FIJO salvo flips en dark
| token | light (web `globals.css:332-344`) | dark flip | mobile |
|---|---|---|---|
| ink-950..50, paper, white | #0B0E13 … #F4F6F8, #FBFCFD, #FFF | ink-100/200/300 y **ink-700/800 FLIPEAN** (chips/tracks/iconos): `.dark` redefine ink-100 #232A33, ink-200 #313A45, ink-300 #414C5A, ink-700 #C2C9D2, ink-800 #DDE2E8 (`globals.css:636-640`) | OK — `global.css` `.dark` redefine `--color-ink-100/200/300/700/800` con los mismos valores (canales) |

> **Gotcha confirmado y espejado:** `--ink-700`/`--ink-800` se invierten bajo `.dark` (de oscuro a claro) porque sirven de foreground de chips/iconos. En RN el mismo flip vive en `apps/mobile/global.css` bloque `.dark:root, .dark`. Cualquier uso de `ink-700` como color literal de texto se rompe al cambiar de tema — usar el alias semantico correcto.

### Ramp Sport (primario — ESTE es el que sobreescribe white-label)
- light: `700 #0B47B0 · 600 #1462DC · 500 #2680FF (signature) · 400 #5C9DFF · 300 #93BEFF · 200 #C5DCFF · 100 #E8F1FF` (`globals.css:347-354`).
- dark: `sport-600 → #7FB0FF`, `sport-700 → #A9CBFF`, `sport-100 → rgba(38,128,255,.20)` (`globals.css:616,628-629`).
- mobile: identico en `global.css` (`--color-sport-*`), y en dark `sport-600/700` aclarados + `sport-100` como canal de marca al que la utility aplica `/.20`.

### Ramps Ember (nutricion, FIJO), Aqua (recovery, FIJO; sin paso 300), Status (success/warning/danger/info, FIJO)
- Todos con valores verbatim en ambos lados. En dark los `-100` pasan a tints translucidos (~.18-.20) y los `-600/-700` (foregrounds de soft-chip) se aclaran. Espejado en mobile (`global.css` `.dark`).

### Aliases semanticos (la API publica que consumen los componentes)
| alias | light | dark | web ref | mobile ref |
|---|---|---|---|---|
| surface-app | paper #FBFCFD | #0A0D12 | `globals.css:392,585` | `global.css` OK |
| surface-card | white | #161B22 | `:393,586` | OK |
| surface-sunken | ink-50 | #1F262F | `:394,587` | OK |
| surface-inverse | ink-950 | **#16273C (brand-tinted hero) en mobile / #2A323D en web** | `:395,588` | ⚠️ mismatch — ver nota |
| surface-inverse-2 | ink-900 | #0E1722 (mobile) / #232A33 (web) | `:396,589` | ⚠️ mismatch |
| surface-overlay | rgba(11,14,19,.55) | rgba(0,0,0,.62) | `:397,590` | OK (canal + alpha) |
| text-strong/body/muted/subtle | ink-950/800/500/#646F7D | #F4F6F8/#CDD3DB/#8A95A3/#86919E | `:400-403,593-596` | OK (web usa `--text-muted:#98A2B0` en `.dark` `:595` vs mobile `138 149 163`=#8A95A3 → **micro mismatch**, ver nota) |
| text-on-sport/-dark/-dark-muted | white/ink-50/#939DAB | — | `:404-409` | OK |
| text-link | sport-600 | sport-400 | `:410,597` | OK |
| border-subtle/default/strong | ink-100/200/300 | rgba(255,255,255,.07/.13/.22) | `:413-415,600-602` | OK |
| border-inverse | rgba(255,255,255,.10) | — | `:416` | OK |
| track | ink-100 | rgba(255,255,255,.10) | `:419,605` | OK |
| brand / brand-strong | sport-500 / sport-600 | brand-strong→#7FB0FF | `:422-423` | OK |
| action-primary / -hover | ink-950 / ink-800 | cta-fill / cta-fill | `:424-425,608-609` | OK |
| cta-fill | #1A6BE6 | — | `:426` | OK (`--color-cta-fill: 26 107 230`) |
| cta-danger | #D31E45 | — | `:427` | OK (`--color-destructive` 244 54 90 = danger-500; cta-danger separado) |
| accent-training/-nutrition/-recovery | sport-500/ember-500/aqua-500 | — | `:428-430` | OK |
| focus-ring | rgba(38,128,255,.40) | — | `:433` | OK (canal 38 128 255, alpha en utility) |
| viz-1..6 | sport-500/ember-500/aqua-500/sport-300/ember-300/ink-400 | — | `:436-441` | ⚠️ **FALTA** en mobile como tokens dedicados (mobile no declara `--viz-*`; los charts RN usan `muscle-colors.ts` / paletas ad-hoc) |

> **Notas de mismatch a resolver en el plan:**
> - `surface-inverse`/`-inverse-2` en dark: web (`globals.css:588-589`) usa `#2A323D`/`#232A33` (neutro), mobile (`global.css`) usa `#16273C`/`#0E1722` (brand-tinted). El comentario de mobile dice "brand-tinted hero". Decidir cual es la verdad; web es la fuente de verdad segun brief.
> - `text-muted` dark: web `#98A2B0` (`:595`) vs mobile `#8A95A3`. El token-contract dice `#8A95A3`. Web quedo con un valor levemente distinto. Diferencia sutil de contraste.
> - `--viz-*` (paleta categorica de charts): no existe en mobile. Los graficos del coach en RN (`components/coach/charts/*`) no usan la paleta viz del DS.

### Tipografia
| rol | web | mobile |
|---|---|---|
| UI/body | Hanken Grotesk (`--font-ui`, `--font-brand-hanken`), aplicado a `body` (`globals.css:751`) | `HankenGrotesk_400/500/600/700/800` cargadas en `app/_layout.tsx:34-40,179-183`; familias en `tailwind.config.js` (`font-sans`, `-medium`, `-semibold`, `-bold`, `-extra`) |
| Display (headings) | Archivo (`--font-archivo`), con override white-label `--brand-font` (`globals.css:760`) | `Archivo_400..900` cargadas (`_layout.tsx:26-33`); `font-display`, `-display-bold`, `-display-black` |
| Mono (metricas/timers) | JetBrains Mono (`--font-jetbrains-mono`) | `JetBrainsMono_400/500/700` (`_layout.tsx:41-45`); `font-mono`, `-mono-medium`, `-mono-bold` |
| Escala tipografica | `--text-3xs..6xl` (11→62px), line-heights, letter-spacing, `--fnum-tabular` (`globals.css:453-480`) | ⚠️ **FALTA como tokens** — mobile no tiene la escala type declarada; los componentes usan `fontSize` numerico inline (ej. `SegmentedTabs.tsx:41-44`, `Input.tsx:138-140`) |
| Roles semanticos (display/h1/h2/h3/title/body/label/caption/eyebrow) | `--role-*-size/-weight` (`globals.css:483-492`) | ⚠️ **FALTA** — no hay helper de rol tipografico en RN |

> **Fuentes legacy todavia vivas:** ambos lados cargan Inter + Montserrat. Web usa Montserrat en `.data-number` (`globals.css:766`) y en `SheetTitle` (`ui/sheet.tsx:112`). Mobile carga Inter/Montserrat "legacy still used by un-migrated screens" (`_layout.tsx:164-171`) y el BottomSheet usa `Montserrat_700Bold` en su titulo (`BottomSheet.tsx:40`). El DS canonico dice display=Archivo; estos Montserrat son deuda.

### Spacing / sizing / radius / motion / sombras / glass / glow
- **Spacing (grid 4px)** `--space-0..13`, gutters, `--max-content:440px`, hit/control sizes, icon sizes: declarados en web (`globals.css:494-523`). **FALTA en mobile como tokens** — RN usa numeros literales (padding 16/18/20, gap 14, etc.).
- **Radius:** web semantico `--radius-card:20 --radius-control:14 --radius-pill:999 --radius-sheet:28` (`globals.css:130-133`) + escala `xs..3xl`. Mobile: `tailwind.config.js borderRadius` tiene `card:20, control:14, pill:9999, sheet:28` + `sm:7 md:10 lg:12 xl:17 2xl:22 3xl:26`, y `lib/theme.ts:42-49 radius` (objeto numerico). **OK y espejado**, aunque hay dos fuentes (config + objeto theme).
- **Motion:** web `--dur-*` (80/140/220/320/480ms) + easings bezier + springs (`globals.css:537-549`). Mobile: `@eva/brand-kit/motion.ts` DURATION (90/160/220/320/480) + EASING (standard/decelerate/accelerate) + SPRING (ui/bouncy), consumido por `lib/motion.ts` con `useEvaMotion()` (reduce-motion aware). **OK (mismo paquete)**, con leve divergencia de valores (web instant=80 vs 90, fast=140 vs 160).
- **Sombras:** web `--shadow-xs..xl`, `-sheet`, `-inset`, `--glow-sport`, `--glow-ember` (`globals.css:552-566`), re-tuneadas en dark (borde+lift, `:643-647`). Mobile: sombras como objetos `ViewStyle` literales dentro de cada componente (`Card.tsx:76-89 SHADOW_SM/MD`, `Button.tsx:85-91`, `theme.ts:73-86 shadowGlowBlue/Cyan`). **FALTA una escala de sombras compartida** — se duplican por componente. RN no tiene glow-ember.
- **Glass:** web `.glass` / `.glass-card` (backdrop-filter blur) con flips dark (`globals.css:661-685, 964-974`). Mobile: `GlassCard.tsx` (expo-blur, "liquid-glass-lite") + `components/GlassCard`. **OK conceptual, implementacion nativa distinta.**
- **Glow:** web `.glow-primary/.glow-cyan` usan `rgba(var(--theme-primary-rgb), a)` (`globals.css:690-704`). Mobile emula glow con `shadowColor` (theme.shadowGlowBlue). El `AmbientBrandGlow` / `GlowBorderCard` web (`components/coach/`) **no tienen equivalente RN dedicado** (GlassCard tiene `cornerGlow`/`glow` como aproximacion).

> **Gotcha `--theme-primary-rgb` (comas):** en web el glow usa `rgba(var(--theme-primary-rgb, 0,122,255), .3)` — la var se declara CON comas (`globals.css:261 --theme-primary-rgb: 38, 128, 255`) porque va dentro de `rgba(...)` funcional legacy. En cambio los canales del DS/mobile son **space-separated** (`38 128 255`) para `rgb(var(--x) / <alpha>)`. **Son dos convenciones distintas coexistiendo en web.** En RN solo existe la space-separated. No mezclar.

### Safe-area / viewport
- Web: utilidades `pt-safe/pb-safe/pl-safe/pr-safe/px-safe/py-safe`, `h-dvh-safe`, `scroll-y-safe`, vars `--safe-area-inset-*`, `--mobile-*-bar-h` (`globals.css:191-203, 994-1121`).
- Mobile: `react-native-safe-area-context` (`SafeAreaProvider` en `_layout.tsx:199`) — el patron nativo equivalente. No se usan las clases CSS safe (no aplican en RN).

---

## (B) Mapa de primitivas web → equivalente mobile

### Set canonico del DS (docs/design-source/components) — 14 primitivas
| DS primitive (design-source) | web (`components/ui/`) | mobile (`components/`) | estado |
|---|---|---|---|
| core/Button | `button.tsx` (base-ui + cva, 11 variants) | `Button.tsx` (9 variants, MotiView press) | OK — API espejada, variantes alineadas |
| core/Card | `card.tsx` (5 variants + Header/Content/Footer/Title/Desc/Action) | `Card.tsx` (8 variants, Pressable) | OK primitivo; ⚠️ mobile NO tiene subcomponentes Card.Header/Content/Footer/Title |
| core/Badge | `badge.tsx` (8 tones × soft/solid/outline, dot, icon) | `Badge.tsx` | verificar paridad de tones/variants (mobile 146 lineas) |
| core/Avatar | `avatar.tsx` (radix) | `Avatar.tsx` | OK |
| core/IconButton | `icon-button.tsx` | `IconButton.tsx` | OK |
| core/Tag | `tag.tsx` | `Tag.tsx` | OK |
| data/ProgressBar | `progress.tsx` | `ProgressBar.tsx` (+ `Progress` alias) | OK |
| data/ProgressRing | `progress-ring.tsx` | `ProgressRing.tsx` + `ComplianceRing.tsx` | OK |
| data/StatCard | `stat-card.tsx` | `StatCard.tsx` | OK |
| forms/Input | `input.tsx` | `Input.tsx` (focus ring brand, error/hint) | OK — fidelidad alta |
| forms/SegmentedControl | `segmented-control.tsx` | `SegmentedTabs.tsx` | OK |
| navigation/ListRow | `list-row.tsx` | `ListRow.tsx` | OK |
| navigation/TabBar | `tab-bar.tsx` + `.eva-tabbar-press` css | `TabBar.tsx` (286 lineas) | OK |

**Conclusion set canonico: 100% cubierto en mobile.**

### Superficie extendida `ui/` de web (mas alla del set canonico) → mobile
| web `ui/` | proposito | mobile equivalente | estado |
|---|---|---|---|
| `sheet.tsx` (base-ui Dialog, side top/right/bottom/left) | side-drawer / bottom-sheet | `BottomSheet.tsx` (@gorhom/bottom-sheet) + `NativeDialog.tsx` | parcial — solo bottom; ⚠️ titulo usa Montserrat legacy |
| `dialog.tsx`, `alert-dialog.tsx` | modales | `NativeDialog.tsx`, `WelcomeModal.tsx` | parcial |
| `sonner.tsx` (toaster) | toasts | — | **FALTA** — no hay sistema de toast/snackbar en RN |
| `select.tsx` (base-ui) | select estilizado | — (usa BottomSheet + ListRow ad-hoc) | **FALTA** primitivo dedicado |
| `dropdown-menu.tsx` | menu contextual | — | **FALTA** |
| `popover.tsx` | popover | — | **FALTA** |
| `command.tsx` (command palette / busqueda global) | busqueda global (Fase L web) | — | **FALTA** |
| `switch.tsx` (estilizado DS) | toggle | RN `Switch` nativo inline (`coach/BlockEditorSheet.tsx` etc.) | **FALTA** wrapper DS; usa Switch crudo |
| `tabs.tsx` (base-ui) | tabs animados | `SegmentedTabs` (distinto patron) | parcial |
| `glass-button.tsx`, `glass-card.tsx` | superficies glass | `GlassCard.tsx` (expo-blur) | parcial — no hay GlassButton |
| `skeleton.tsx` | loading | `Skeleton.tsx` | OK |
| `separator.tsx` | divider | inline (`Section.tsx`) | OK-ish |
| `label.tsx`, `textarea.tsx`, `form.tsx` (rhf+zod) | forms | Input maneja label; **no hay Textarea ni Form wrapper** | parcial |
| `info-tooltip.tsx`, `metric-info.tsx` | tooltips | — | **FALTA** (tooltips no aplican igual en touch) |
| `clamped-int-input.tsx` | input numerico acotado (exec de rutina) | keypad custom en `components/workout/` (verificar) | verificar |
| `progress-ring.tsx` / `MacroRingSummary` | anillos macro | `MacroRingSummary.tsx`, `MacroPill.tsx` | OK |
| `EvaRouteLoader.tsx`, `SuccessWaveOverlay.tsx` | loaders / celebracion | `EvaLoader.tsx`, `EvaSplash.tsx` | OK |
| `web-gl-shader.tsx`, `infinite-slider.tsx` | efectos landing | — (landing = solo web) | N/A (intencional) |

### Organismos/moleculas de dominio (web `components/coach|client`) → mobile
Mobile tiene un set amplio propio de dominio (`components/coach/*`, `components/alumno/*`, `components/workout/*`, mas ~50 componentes de raiz). No es un mapeo 1:1 de nombres. La paridad funcional de estos se cubre en la auditoria `docs/audits/rn-web-parity-2026-06-21.md` (no en este doc de DS).

---

## (C) Flujo de theming white-label per-coach: web vs mobile

### Motor comun (identico)
`@eva/brand-kit` (`packages/brand-kit/index.ts`), TS puro (culori, OKLCH), sin React/DOM. Dos entradas:
- `resolveBrandTheme({brandColor, accentLight/Dark, secondaryLight/Dark, neutralTint})` → `{light,dark}` con bg/surface/border/accent/accentText/accent2/text/textMuted. Acentos contrast-clamped a WCAG AA (`clampAccent`), texto via `pickOnColor` (nunca invisible).
- `deriveSportTokens(brandHex)` → rampa SPORT de 7 pasos derivada del unico color de marca + `ctaFill` (~600, white-safe), `focusRing` (marca @ .40), `textOnSport`, y overrides dark `{100,600,700}`. Ember/aqua/ink/status son FIJOS (no se derivan). `index.ts:269-335`.
- Free coach → `#007AFF` (SYSTEM_PRIMARY). Default EVA → `#2680FF` (sport-500).

### Web
- **Modo claro/oscuro:** `next-themes` (`components/ThemeProvider.tsx`) pone/quita clase `.dark` en `<html>`. `@custom-variant dark (&:is(.dark *))` (`globals.css:4`). `html.dark { color-scheme: dark }`.
- **White-label:** el layout `/c/[slug]` y `/coach` inyectan un `<style>` inline en `:root` con `--theme-primary`, `--theme-primary-rgb`, y sobreescriben la rampa `--sport-*` / `--cta-fill` / `--focus-ring` con el output de `deriveSportTokens`. La cadena `--primary: var(--theme-primary, var(--brand))` (`globals.css:218,260-261`) da el hook. Fuente de fuente custom: `--brand-font` en el mismo `<style>`.
- **Toggle:** `components/ThemeToggle.tsx` (via next-themes).

### Mobile
- **Modo claro/oscuro:** `context/ThemeContext.tsx` — `useColorScheme()` + estado `mode` (light/dark/system) persistido en AsyncStorage (`eva_theme_mode`), resuelve scheme y llama `nwColorScheme.set(resolvedScheme)` para sincronizar el dark de NativeWind (`darkMode:'class'` en `tailwind.config.js`). `toggleTheme()` alterna.
- **White-label:** DOS mecanismos en paralelo (deuda):
  1. **Clases NativeWind:** `brandVars(primaryColor, scheme)` (`lib/theme.ts:173-203`) devuelve un record de CSS vars (`--color-primary`, `--color-sport-100..700`, `--color-cta-fill`, `--color-focus-ring`) que se pasan por `vars()` de NativeWind a un `<View style={themeVars}>` que envuelve la app (`ThemeContext.tsx:45,55`). Esto recolorea `bg-primary`, `bg-sport-500`, etc. en vivo.
  2. **Objeto `Theme` imperativo (StyleSheet):** `applyCoachBranding(base, primaryColor)` (`lib/theme.ts:157-166`) devuelve un objeto `{primary, background, card, text, ...}` con hex concretos, consumido por `useTheme().theme` para estilos inline de RN (`theme.card`, `theme.primary`, `theme.shadowGlowBlue`). Muchos componentes leen de aca (BottomSheet, SegmentedTabs, Input, Button para iconos/sombras).
- Branding cargado de `lib/branding.ts` (`loadStoredBranding()`), estado en el contexto, `setBranding()` disponible.

### Diferencias/riesgos de theming
- **Doble fuente de verdad en mobile:** clases NativeWind (var-driven, dark-aware auto) vs objeto `theme` (resuelto en JS por scheme). Un componente que mezcle `className="bg-sport-500"` con `style={{color: theme.text}}` es correcto, pero si alguien hardcodea un color del objeto para algo que deberia venir de la rampa white-label, diverge. Ejemplo de leak: `SegmentedTabs`/`BottomSheet` usan `theme.*` para todo, lo que funciona pero no aprovecha las utilidades.
- **Gotcha dark scoping:** web = `.dark` en `<html>` (`:is(.dark *)`). Mobile = `nwColorScheme.set` + `darkMode:'class'`. Equivalentes pero mecanismo distinto; el flip de `--ink-700/800` y de los `-100` translucidos debe estar presente en `global.css` (lo esta) o los chips salen ilegibles en dark (ya documentado en los comentarios de `deriveSportTokens`).
- **Alpha:** web usa `rgba(var(--theme-primary-rgb), a)` (comas) para glow; mobile usa `rgb(var(--x) / <alpha>)` (canales). No portables entre si.

---

## (D) Estrategia recomendada de mapeo a NativeWind v4

**La arquitectura ya elegida es correcta y esta implementada** — la recomendacion es consolidarla, no rehacerla.

1. **Tokens FIJOS (ink/sport-base/ember/aqua/status/radius/font families) → `tailwind.config.js` + `global.css`.** Ya estan. Mantener `global.css` como espejo exacto de `apps/web/src/app/globals.css` (canales `r g b`). Regla: cualquier cambio de token en web se replica en `global.css` en el mismo cambio (igual que la regla de docs canonicos).
2. **Tokens RUNTIME (white-label sport ramp + cta-fill + focus-ring + primary/accent) → `vars()` de NativeWind** via `brandVars()` en el `<View>` raiz del `ThemeProvider`. Ya esta. Es el patron correcto para NativeWind v4 (CSS vars runtime).
3. **Dark mode en RN → `darkMode:'class'` + `nwColorScheme.set(resolvedScheme)`** sincronizado con `useColorScheme`/preferencia persistida. Ya esta. Los flips dark (surfaces, ink-700/800, tints -100, foregrounds -600/700) viven en el bloque `.dark:root,.dark` de `global.css`. Mantener verbatim con `docs/design-source/tokens/theme-dark.css`.
4. **Consolidar el doble sistema de theming:** reducir la dependencia del objeto `Theme` imperativo (`lib/theme.ts` lightTheme/darkTheme) a solo lo que NativeWind no puede hacer (shadowColor literal de RN, colores de props de librerias nativas como `@gorhom/bottom-sheet backgroundStyle`, `color` de iconos lucide, `placeholderTextColor`). Todo lo que sea `background/border/text` de un `<View>`/`<Text>` deberia venir de className. Documentar la frontera explicitamente (ya insinuada en comentarios de Button/Card: "shadowColor must be a literal").
5. **Agregar tokens faltantes a la capa compartida:**
   - Escala tipografica + roles (`--text-*`, `--role-*`) como helper RN (objeto o utilidades) — hoy son numeros magicos.
   - Escala de spacing 4px (opcional; NativeWind ya da `p-4` etc., pero los componentes usan px literales).
   - Escala de sombras compartida (hoy duplicada por componente) — objeto central `SHADOWS = {xs,sm,md,lg,xl}` en `lib/theme.ts` o similar, ya que RN no puede usar `box-shadow` var.
   - `--viz-*` paleta categorica de charts, para que los graficos del coach usen la misma paleta que web.
6. **Sombras/glow:** dado que RN no soporta CSS `box-shadow` tokenizado, centralizar los `ViewStyle` de elevacion (hoy repetidos en Button/Card/SegmentedTabs) en un solo modulo y derivar el glow del brand (`theme.shadowGlowBlue` ya usa `theme.primary` indirecto — extenderlo a glow-ember).

---

## (E) Lista priorizada de primitivas a construir/re-skinear como fundacion

Dado que el set canonico ya existe, la fundacion pendiente es sobre todo **primitivas de interaccion/overlay faltantes** y **consolidacion**. Priorizado para maximo desbloqueo de pantallas:

**P0 — bloquean muchas pantallas / no existen en RN:**
1. **Toast/Sonner** — sistema de feedback transitorio. Web `ui/sonner.tsx`. FALTA total en RN. Construir provider + hook (`useToast`) sobre un overlay nativo. Alto uso en flujos de guardado/errores.
2. **Select / Picker DS** — hoy ad-hoc con BottomSheet+ListRow. Construir primitivo `Select` (trigger estilo Input + BottomSheet de opciones) para paridad con `ui/select.tsx`.
3. **Switch DS** — wrapper del `Switch` nativo con colores de marca (`trackColor`/`thumbColor` = sport/theme). Hoy Switch crudo en sheets del coach.
4. **Consolidar theming** — frontera className vs objeto `theme`; escala tipografica/sombras/spacing compartida (seccion D-4/D-5). Sin esto, cada pantalla re-inventa numeros y colores.

**P1 — mejoran fidelidad y cubren gaps de forma:**
5. **Card subcomponentes** (`CardHeader/Content/Footer/Title/Description/Action`) — web los tiene; mobile solo el contenedor. Necesario para transcribir layouts de tarjeta 1:1.
6. **DropdownMenu / Popover / ActionSheet** — menus contextuales (web `dropdown-menu.tsx`, `popover.tsx`). En RN mapear a ActionSheet/BottomSheet o menu flotante.
7. **Textarea + Form wrapper (rhf+zod)** — inputs multilinea y validacion. Web `textarea.tsx`, `form.tsx`.
8. **Sheet multi-lado / Dialog unificado** — hoy BottomSheet solo abajo + NativeDialog. Alinear API con `ui/sheet.tsx` (side, header/footer/title consistentes) y **quitar Montserrat legacy del titulo** (usar Archivo/Hanken).
9. **Command palette / busqueda global** — `ui/command.tsx` (Fase L web). Requiere equivalente RN si se porta la busqueda global.

**P2 — pulido / paridad visual fina:**
10. **GlassButton** y unificar GlassCard con las variantes web (`glass`/`glass-card`).
11. **AmbientBrandGlow / GlowBorderCard** — efectos de marca del coach; portar con Skia/shadow o gradientes nativos.
12. **InfoTooltip / MetricInfo** — repensar para touch (popover on tap).
13. **Paleta `--viz-*` para charts** del coach (Victory/Skia) para igualar categorias de web.
14. **Escala type/spacing como tokens formales** (si no se hizo en P0-4).

**Deuda transversal a saldar durante todo lo anterior:**
- Purgar Inter/Montserrat legacy conforme se migran pantallas (`_layout.tsx:164-171`); objetivo: solo Archivo/Hanken/JetBrains.
- Resolver los 3 mismatches de token dark (surface-inverse/-inverse-2, text-muted) contra la fuente de verdad web.
- Alinear duraciones de motion (instant 80 vs 90, fast 140 vs 160) entre `globals.css` y `brand-kit/motion.ts`.

---

## Archivos clave (referencia rapida para el plan)

- Tokens web: `apps/web/src/app/globals.css` (@theme + `:root` + `.dark`, lineas 11-575, 583-648)
- Tokens mobile: `apps/mobile/global.css` (base ramps + aliases + `.dark:root,.dark` + legacy compat)
- Tailwind mobile: `apps/mobile/tailwind.config.js`
- Contrato: `specs/redesign-eva-ds/token-contract.md`
- Motor white-label (compartido): `packages/brand-kit/index.ts`, `packages/brand-kit/motion.ts`, `packages/brand-kit/presets.ts`
- Theme mobile: `apps/mobile/lib/theme.ts` (lightTheme/darkTheme, brandVars, applyCoachBranding, hexToChannels), `apps/mobile/context/ThemeContext.tsx`, `apps/mobile/lib/motion.ts`
- Fuentes mobile: `apps/mobile/app/_layout.tsx:13-45,163-194`
- Primitivas mobile: `apps/mobile/components/{Button,Card,Badge,Input,SegmentedTabs,BottomSheet,ListRow,TabBar,StatCard,ProgressRing,IconButton,Tag,Avatar,ProgressBar,GlassCard,NativeDialog}.tsx`
- Primitivas web: `apps/web/src/components/ui/*` (+ barrels `components/{atoms,molecules,organisms}/index.ts`)
- Diseño fuente: `docs/design-source/components/{core,data,forms,navigation}/*.{jsx,prompt.md}`, `docs/design-source/tokens/*.css`, `docs/design-source/ui_kits/{eva-app,eva-desktop}/`
- Glow web (sin equiv RN): `apps/web/src/components/coach/{GlowBorderCard,AmbientBrandGlow}.tsx`
- Theme switch web: `apps/web/src/components/{ThemeProvider,ThemeToggle}.tsx` (next-themes)
