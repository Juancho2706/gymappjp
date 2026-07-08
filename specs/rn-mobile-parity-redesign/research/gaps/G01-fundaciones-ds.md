# G01 — Gaps de Fundaciones DS + theming + dark mode + chrome nav

Dominio: base del re-skin (tokens NativeWind, primitivas compartidas, theming white-label runtime,
dark mode RN, tipografia/fuentes, safe-area, motion). Que se construye ANTES de re-skinear pantallas.

Fuentes: `research/02-design-system.md`, `research/06-mobile-inventory.md`, `research/07-shared-seams.md`.
Todas las rutas son absolutas o relativas a `apps/mobile/`. Verificado por lectura directa de codigo
(no solo por los informes de investigacion). Español neutro.

---

## 0. Encuadre (leer primero — corrige el brief)

El brief asume "mobile usa lenguaje visual VIEJO (pre-EVA DS)". Para el dominio de fundaciones esto es
**falso en la capa de tokens y parcialmente falso en primitivas**. Estado real verificado:

- La **fundacion de tokens EVA DS ya esta portada y espejada 1:1**: `apps/mobile/global.css` replica
  `apps/web/src/app/globals.css` con canales `r g b` (para `rgb(var(--x) / <alpha>)` de NativeWind), y
  `apps/mobile/tailwind.config.js` mapea todas las rampas (ink/sport/ember/aqua/status) + aliases semanticos
  (surface/text/border/brand/cta/accent) + radios + familias de fuente. Verificado leyendo ambos archivos.
- El **motor white-label es el MISMO paquete** en web y RN: `@eva/brand-kit` (`resolveBrandTheme`,
  `deriveSportTokens`), TS puro. Consumido por `apps/mobile/lib/theme.ts:2,159,175,178`.
- Los **tokens de motion son compartidos**: `packages/brand-kit/motion.ts` -> `apps/mobile/lib/motion.ts`.
- Las **14 primitivas canonicas del DS ya existen** en `apps/mobile/components/` (Button, Card, Badge, Input,
  SegmentedTabs, ListRow, TabBar, Avatar, IconButton, Tag, ProgressBar, ProgressRing, StatCard) con fidelidad
  alta.

Por lo tanto la fundacion NO es "crear tokens ni primitivas base". La fundacion pendiente es:
1. **Consolidar la deuda de DOBLE sistema de theming** (objeto `Theme` imperativo de StyleSheet vs. clases
   NativeWind var-driven) — hoy conviven y compiten.
2. **Purga de fuentes legacy** (Inter/Montserrat todavia cargadas y usadas masivamente).
3. **Tokens formales faltantes** en la capa compartida RN: escala tipografica/roles, escala de spacing,
   escala de sombras centralizada, paleta `--viz-*` de charts.
4. **Primitivas de interaccion/overlay faltantes** (toast, select, switch DS, dropdown/popover, textarea,
   subcomponentes de Card, command palette) que bloquean transcribir pantallas 1:1.
5. **Resolver 3 mismatches de token dark** (surface-inverse, surface-inverse-2, text-muted) contra la web
   como fuente de verdad, y alinear duraciones de motion.
6. **Nav chrome hardcodeado** — labels/tabs viven en dos componentes chrome sin registro central.

---

## 1. Gaps visuales (capa de fundaciones)

Este dominio no re-skinea pantallas concretas (eso lo cubren G02+), pero define las diferencias visuales
sistemicas que se filtran a TODAS las pantallas si no se saldan primero.

### 1.1 Mismatches de token entre web (verdad) y mobile

Verificado en `apps/mobile/global.css` bloque `.dark` vs `02-design-system.md` (tabla de aliases):

| token | web (`globals.css`) | mobile (`global.css`) | veredicto |
|---|---|---|---|
| `surface-inverse` (dark) | `#2A323D` (neutro) | `#16273C` (brand-tinted, `global.css:185`) | **mismatch** — mobile tiñe de marca el hero |
| `surface-inverse-2` (dark) | `#232A33` | `#0E1722` (`global.css:186`) | **mismatch** |
| `text-muted` (dark) | `#98A2B0` | `#8A95A3` (`global.css:192`) | **mismatch sutil** de contraste |

Decidir cual es la verdad (web manda por brief) y alinear. El brand-tinted del hero mobile puede ser
intencional; requiere ruling del arquitecto, no fix mecanico.

### 1.2 Tipografia: familias legacy y ausencia de escala

- **Fuentes legacy vivas y muy usadas.** `_layout.tsx:14-23,164-171` carga Inter (4 pesos) + Montserrat
  (3 pesos) ademas de las DS (Archivo/Hanken/JetBrains). El grep de `Montserrat|Inter_` da **408 usos en 69
  archivos** de `apps/mobile/components/` (literales `fontFamily: 'Inter_...'` / `'Montserrat_...'` en
  StyleSheet o inline). Ejemplos de fundacion contaminados: `BottomSheet.tsx:40` (`Montserrat_700Bold` en el
  titulo del sheet — primitiva base), `alumno/AlumnoMobileChrome.tsx` y `coach/CoachMobileChrome.tsx` (tab
  bars). El DS canonico dice display=Archivo, UI=Hanken; todo Montserrat/Inter es deuda.
- **Trampa en `tailwind.config.js:125-127`:** las clases `font-medium` -> `Inter_500Medium`,
  `font-semibold` -> `Inter_600SemiBold`, `font-display-extra` -> `Montserrat_800ExtraBold`. Es decir, si
  alguien escribe `className="font-semibold"` durante el re-skin, obtiene **Inter**, no Hanken. Grep actual:
  0 usos de esas clases (nadie las usa hoy), pero son una mina anti-personal para el re-skin. Deben
  remapearse a Hanken/Archivo o eliminarse.
- **No hay escala tipografica ni roles como tokens.** Web tiene `--text-3xs..6xl` y `--role-*-size/-weight`
  (`globals.css:453-492`). Mobile no los declara; los componentes usan `fontSize` numerico inline (ej.
  `BottomSheet.tsx:54` fontSize 20, `SegmentedTabs`, `Input`). Sin un helper de rol tipografico, cada
  pantalla re-inventa numeros -> drift garantizado.

### 1.3 Sombras / elevacion / glow duplicadas por componente

- No existe escala de sombras compartida. Cada primitiva define su `ViewStyle` de sombra: `Button.tsx:84-91`
  (`SHADOW_SM`, tinte `#0D121C`), `Card.tsx` (SHADOW_SM/MD), `theme.ts:73-86` (`shadowGlowBlue`/`shadowGlowCyan`).
  Web las tiene tokenizadas (`--shadow-xs..xl`, `-sheet`, `--glow-sport`, `--glow-ember`, retuneadas en dark
  `globals.css:643-647`). RN no puede usar `box-shadow` var, pero puede centralizar los `ViewStyle` en un
  modulo unico. Falta `glow-ember` en RN (solo hay glow-sport/aqua).
- Las sombras mobile no se retunean en dark (web añade borde+lift en dark). Gap de fidelidad.

### 1.4 Glass / glow de marca

- `GlassCard.tsx` (expo-blur) cubre `glass-card` conceptualmente, pero no hay `GlassButton` equivalente a
  `ui/glass-button.tsx`.
- `AmbientBrandGlow` / `GlowBorderCard` de web (`apps/web/src/components/coach/`) no tienen equivalente RN
  dedicado (GlassCard tiene `cornerGlow`/`glow` como aproximacion). Efecto de marca del coach ausente.

### 1.5 Paleta de charts `--viz-*` ausente

Web declara `--viz-1..6` (`globals.css:436-441`) como paleta categorica. Mobile **no** la declara en
`global.css` ni en `tailwind.config.js`; los charts del coach (`components/coach/charts/*`, victory/Skia) usan
`muscle-colors.ts` y paletas ad-hoc -> las categorias de grafico no coinciden con web.

### 1.6 Spacing sin tokens

Web tiene grid 4px `--space-0..13`, gutters, `--max-content:440px`, hit/control/icon sizes
(`globals.css:494-523`). Mobile usa numeros literales (padding 16/18/20, gap 14 — ej. `BottomSheet.tsx:52`).
NativeWind ya da `p-4` etc., pero los componentes no los usan consistentemente.

---

## 2. Gaps funcionales (fundaciones)

### 2.1 Doble sistema de theming (la deuda estructural nº1)

Dos mecanismos de white-label + color conviven en mobile (verificado en `ThemeContext.tsx` y `lib/theme.ts`):

1. **Clases NativeWind var-driven:** `brandVars(primaryColor, scheme)` (`theme.ts:173-203`) devuelve un record
   de CSS vars (`--color-primary`, `--color-sport-100..700`, `--color-cta-fill`, `--color-focus-ring`),
   inyectado por `vars()` en el `<View style>` raiz (`ThemeContext.tsx:45,55`). Esto recolorea `bg-primary`,
   `bg-sport-500`, etc. en vivo y es dark-aware automatico. **Es el patron correcto y a mantener.**
2. **Objeto `Theme` imperativo (StyleSheet):** `lightTheme`/`darkTheme` + `applyCoachBranding(base, color)`
   (`theme.ts:51-166`) devuelve `{primary, background, card, text, border, shadowGlowBlue, ...}` con hex
   concretos, consumido por `useTheme().theme` para estilos inline. Muchas primitivas leen de aca
   (`BottomSheet.tsx:22,34-35,40`, SegmentedTabs, Input, Button para iconos/sombras).

Problema: son dos fuentes de verdad del mismo color. Un componente que hardcodee un color del objeto `theme`
para algo que deberia venir de la rampa white-label diverge del acento del coach. La frontera correcta (lo que
SOLO el objeto `theme` debe seguir dando, porque NativeWind no puede) es: `shadowColor` literal de RN,
`backgroundStyle`/`handleIndicatorStyle` de `@gorhom/bottom-sheet`, `color` de iconos lucide,
`placeholderTextColor`, `ActivityIndicator color`. Todo `background/border/text` de `<View>`/`<Text>` deberia
venir de `className`. Esa frontera no esta documentada ni forzada hoy.

### 2.2 Dark mode: perdida del modo "system" y toggle asimetrico

`ThemeContext.tsx`:
- `mode` arranca en `'light'` (`:24`), no `'system'`. Web (next-themes) defaultea a system.
- `toggleTheme()` (`:47-51`) alterna SOLO entre `light`/`dark` y persiste eso; **nunca vuelve a `'system'`**.
  Una vez que el usuario toca el toggle, pierde el seguimiento del tema del SO para siempre (hasta borrar
  AsyncStorage). El estado `'system'` existe en el tipo y se puede restaurar de storage, pero no hay UI para
  volver a el. Gap de paridad con el `ThemeToggle`/`ThemeProvider` de web (que ofrece system/light/dark).
- No hay componente `ThemeToggle` DS reutilizable en RN (el toggle vive embebido en `perfil.tsx`). Web tiene
  `components/ThemeToggle.tsx`.

### 2.3 Primitivas de interaccion/overlay faltantes (bloquean pantallas)

Comparado con la superficie `ui/` de web (`02-design-system.md` seccion B). Faltantes en RN:

- **Toast/Sonner** — no existe sistema de feedback transitorio (`ui/sonner.tsx` en web). Alto uso en flujos de
  guardado/error. **P0.**
- **Select/Picker DS** — hoy ad-hoc con BottomSheet+ListRow; no hay primitivo `Select` (`ui/select.tsx`).
- **Switch DS** — se usa el `Switch` nativo crudo en sheets del coach; falta wrapper con `trackColor`/
  `thumbColor` de marca. **P0** (barato).
- **DropdownMenu / Popover / ActionSheet** — sin equivalente (`ui/dropdown-menu.tsx`, `ui/popover.tsx`).
- **Textarea + Form wrapper (rhf+zod)** — Input no cubre multilinea; no hay `Textarea` ni `Form` (`ui/textarea.tsx`,
  `ui/form.tsx`).
- **Subcomponentes de Card** — mobile solo tiene el contenedor `Card`; web tiene `CardHeader/Content/Footer/
  Title/Description/Action`. Necesario para transcribir layouts de tarjeta 1:1. **P1.**
- **Command palette / busqueda global** — `ui/command.tsx` (Fase L web) sin equivalente RN.
- **InfoTooltip/MetricInfo** — sin equivalente (repensar para touch = popover on tap).

### 2.4 Sheet/Dialog: API divergente + Montserrat legacy

`BottomSheet.tsx` solo abre desde abajo y su titulo usa `Montserrat_700Bold` (`:40`). Web `ui/sheet.tsx`
soporta 4 lados y header/footer/title consistentes. Alinear API y quitar Montserrat del titulo (usar
Archivo/Hanken). `NativeDialog.tsx` + `WelcomeModal.tsx` cubren dialogos parcialmente.

### 2.5 Nav chrome hardcodeado, sin registro central

`06-mobile-inventory.md` (E) confirmado: `AlumnoMobileChrome.tsx` (`NAV_META`, `PRIMARY_TABS`) y
`CoachMobileChrome.tsx` (`TABS`) hardcodean labels y orden. Los labels reales que ve el usuario los decide el
chrome, no el `options.title` del layout (divergencia: layout dice "Nutrición"/"Dashboard", chrome muestra
"Plan"/"Inicio"). Ambos usan `theme.*` (patron B) + `Inter_600SemiBold` legacy + BlurView. Cualquier
reordenamiento de paridad o gating por entitlements se hace aqui — conviene un registro de nav declarativo
(dato compartible, ver §3).

---

## 3. Costuras (que compartir via packages/ o API)

Basado en `07-shared-seams.md`. Para el dominio de fundaciones, las costuras relevantes:

- **`@eva/brand-kit` (ya compartido, mantener):** motor de color OKLCH puro, usado por `lib/theme.ts` y
  `lib/motion.ts`. Es el modelo a seguir (extraccion completa, cero duplicado). No tocar salvo para alinear
  duraciones de motion (web instant=80/fast=140 vs `brand-kit/motion.ts` 90/160 — divergencia leve a
  reconciliar; decidir un solo set).
- **Tokens (`global.css` <-> `globals.css`):** NO es un paquete, es un **espejo manual**. Regla operativa a
  instituir (igual que la regla de docs canonicos de CLAUDE.md): *cualquier cambio de token en
  `apps/web/src/app/globals.css` se replica en `apps/mobile/global.css` en el mismo cambio*. El contrato vive
  en `specs/redesign-eva-ds/token-contract.md`. Riesgo de drift alto porque son dos archivos a mano.
- **Escala tipografica / roles / spacing / sombras / viz:** hoy NO existen como tokens compartidos. Candidato:
  declararlos en `token-contract.md` y materializarlos en ambos lados (web CSS vars, RN un helper TS +
  entradas de tailwind.config). No necesita paquete JS (son valores estaticos), pero SI un contrato unico.
- **Motion (`@eva/brand-kit/motion.ts`):** ya compartido via `lib/motion.ts` (`useEvaMotion`, reduce-motion
  aware). Mantener; alinear valores.
- **`@eva/feature-prefs` / `@eva/module-catalog`:** NO usados por mobile (`07-shared-seams.md` A.3/A.4). No son
  fundacion DS pura, pero el **registro de nav chrome** (§2.5) podria alimentarse de `@eva/module-catalog`
  (que ya tiene `label`/`pitch`/`surfaces` por `ModuleKey`) para gating de tabs por entitlement. Decision del
  arquitecto; queda anotado para no reinventar el catalogo dos veces (cruza con dominios funcionales).

Nota: `07-shared-seams.md` C.5 aclara que `coach-nav.ts` de web (`getVisibleNavItems`) es especifico de
sidebar y NO traduce 1:1 a expo-router tabs; el *dato* (que modulos, iconos, labels) si es compartible, la
*logica de render* no.

---

## 4. Tareas propuestas

Esfuerzo: S(1-2d) / M(3-5d) / L(1-2sem) / XL(3+sem). Etiqueta [VISUAL] / [FUNCIONAL] / [SEAM].

### OLA 0 — Fundaciones (ANTES de re-skinear cualquier pantalla)

Estas desbloquean el re-skin. Orden por dependencia.

1. **[SEAM][VISUAL] F0.1 — Reconciliar los 3 mismatches de token dark + duraciones de motion.** (S)
   Decidir verdad (web manda; ruling sobre `surface-inverse` brand-tinted del hero mobile) y alinear
   `global.css:185,186,192` + `brand-kit/motion.ts` durations. Actualizar `token-contract.md`.
   Dep: ninguna. Es el fix mas barato y desbloquea confianza en el espejo.

2. **[FUNCIONAL] F0.2 — Definir y documentar la frontera de theming (className vs objeto `theme`).** (S)
   Escribir la regla (que SOLO el objeto `theme` puede dar: shadowColor, props de librerias nativas, color de
   iconos, placeholderTextColor) en un doc corto + comentario en `lib/theme.ts`. No refactor todavia, solo el
   contrato. Dep: ninguna. Habilita que las tareas siguientes no reintroduzcan deuda.

3. **[VISUAL] F0.3 — Tokens formales de tipografia: escala + roles como helper RN.** (M)
   Crear helper (objeto TS o utilidades) que espeje `--text-*` y `--role-*` de web. Remapear/eliminar las
   entradas trampa de `tailwind.config.js:125-127` (`font-medium`/`-semibold`/`-display-extra` -> Inter/
   Montserrat) hacia Hanken/Archivo. Dep: F0.1. Bloquea el re-skin de texto de todas las pantallas.

4. **[VISUAL] F0.4 — Escala de sombras/elevacion centralizada + glow-ember + retune dark.** (S)
   Modulo unico `SHADOWS = {xs,sm,md,lg,xl}` + `GLOWS = {sport,ember,aqua}` en `lib/theme.ts` (derivando glow
   de la marca), reemplazando los `ViewStyle` duplicados de Button/Card/SegmentedTabs. Añadir retune dark.
   Dep: F0.2.

5. **[VISUAL][SEAM] F0.5 — Declarar paleta `--viz-1..6` en `global.css` + `tailwind.config.js`.** (S)
   Espejar `globals.css:436-441`. Dep: F0.1. (Consumo real por charts = dominio de charts, pero el token base
   es fundacion.)

6. **[FUNCIONAL] F0.6 — Toast/Sonner provider + `useToast`.** (M)
   Provider + hook sobre overlay nativo (o `react-native-reanimated`), API espejada a `ui/sonner.tsx`.
   Montar en `_layout.tsx`. Dep: F0.3, F0.4. P0 — bloquea feedback de guardado/error en casi toda pantalla.

7. **[FUNCIONAL] F0.7 — Switch DS + Select/Picker DS.** (M)
   `Switch` wrapper (trackColor/thumbColor de marca) + `Select` (trigger estilo Input + BottomSheet de
   opciones). Dep: F0.3. Switch es P0-barato; Select desbloquea forms del coach.

8. **[VISUAL] F0.8 — Subcomponentes de Card (Header/Content/Footer/Title/Description/Action).** (S)
   Necesario para transcribir tarjetas 1:1. Dep: F0.3, F0.4.

9. **[FUNCIONAL] F0.9 — Unificar Sheet/Dialog + quitar Montserrat del titulo.** (M)
   Alinear API de `BottomSheet.tsx` con `ui/sheet.tsx` (header/footer/title consistentes), cambiar
   `BottomSheet.tsx:40` de `Montserrat_700Bold` a Archivo/Hanken. Dep: F0.3.

10. **[FUNCIONAL] F0.10 — Dark mode: restaurar modo "system" + `ThemeToggle` DS reutilizable.** (S)
    Default `mode='system'`, toggle tri-estado (system/light/dark) o al menos ruta de vuelta a system;
    extraer `ThemeToggle` como componente. Dep: F0.2. Paridad con web.

### OLA 1 — Fundaciones de segundo nivel (durante/tras re-skin de pantallas)

11. **[FUNCIONAL] F1.1 — DropdownMenu / Popover / ActionSheet.** (M) Dep: F0.9.
12. **[FUNCIONAL] F1.2 — Textarea + Form wrapper (rhf+zod).** (M) Dep: F0.7.
13. **[SEAM][FUNCIONAL] F1.3 — Registro de nav declarativo (matar hardcode de los 2 chrome).** (M)
    Config unica de tabs (label/orden/icono/overflow), preparada para gating por entitlement
    (posible fuente: `@eva/module-catalog`). Migrar `AlumnoMobileChrome`/`CoachMobileChrome` a leer de ahi +
    quitar `Inter_600SemiBold`. Dep: F0.3. Cruza con dominios funcionales (entitlements).
14. **[VISUAL] F1.4 — GlassButton + unificar GlassCard con variantes web.** (S) Dep: F0.4.
15. **[VISUAL] F1.5 — AmbientBrandGlow / GlowBorderCard RN (Skia/gradiente).** (M) Dep: F0.4, F0.5.
16. **[FUNCIONAL] F1.6 — Command palette / busqueda global RN.** (M) Dep: F0.7. Solo si se porta la busqueda global.
17. **[VISUAL] F1.7 — InfoTooltip/MetricInfo touch (popover on tap).** (S) Dep: F1.1.
18. **[VISUAL] F1.8 — Tokens de spacing 4px como escala formal.** (S) Dep: F0.1. Opcional (NativeWind ya da `p-4`).

### DEUDA TRANSVERSAL (se salda a lo largo del re-skin, no una tarea unica)

19. **[VISUAL] D.1 — Purga de Inter/Montserrat.** (L, incremental)
    408 usos en 69 archivos. Conforme cada pantalla/primitiva se migra a Archivo/Hanken/JetBrains, quitar el
    literal legacy; al final quitar las cargas de `_layout.tsx:14-23,164-171` y las entradas de
    `tailwind.config.js`. Dep: F0.3. No bloqueante pero es la señal mas visible de "visual viejo".

---

## 5. Riesgos

- **Drift del espejo de tokens (alto):** `global.css` y `globals.css` son dos archivos a mano. Sin una regla
  forzada (y idealmente un test de paridad o script de diff), cualquier cambio de token en web no se propaga y
  el DS diverge silenciosamente. Mitigacion: regla en CLAUDE.md + posible test que compare `token-contract.md`
  contra ambos.
- **Refactor del objeto `theme` puede romper pantallas patron B (medio-alto):** ~50% de pantallas leen
  `theme.*`. Reducir el objeto `theme` sin migrar primero sus consumidores rompe estilos. Mitigacion: F0.2
  define la frontera pero NO borra el objeto; el objeto se reduce solo cuando su ultima pantalla consumidora se
  migra. Mantener `theme` como shim hasta entonces.
- **Trampa `font-semibold`->Inter (medio):** durante el re-skin es natural escribir `className="font-semibold"`
  y obtener Inter sin notarlo (compila, se ve "casi" bien). F0.3 debe ejecutarse ANTES del re-skin masivo o se
  siembra Inter por todas partes.
- **`surface-inverse` brand-tinted (bajo):** el hero mobile tiñe de marca el fondo oscuro; si se "corrige" a
  neutro sin ruling se pierde un efecto quizas intencional. Requiere decision explicita, no fix mecanico.
- **Perdida de "system" en dark mode ya en produccion (bajo):** usuarios que ya tocaron el toggle tienen
  `eva_theme_mode` fijado a light/dark en AsyncStorage; F0.10 debe manejar la migracion (no forzar, ofrecer
  volver a system).
- **RN no tiene `box-shadow` tokenizado (inherente):** las sombras siempre seran `ViewStyle` duplicable; el
  riesgo de re-duplicacion persiste salvo que F0.4 centralice y se respete. Documentar.
- **Motion duration mismatch (bajo):** web 80/140 vs brand-kit 90/160; animaciones se sienten distintas entre
  plataformas. Barato de alinear (F0.1).
