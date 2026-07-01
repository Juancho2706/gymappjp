# Auditoría de fidelidad visual — auth-coach — 2026-07-01

Fuentes de verdad:
- Kit mobile: `docs/design-source/ui_kits/eva-app/screens/coach-auth.jsx` (Registro wizard, VerifyEmail, ForgotPassword, ResetPassword) + `screens/flow.jsx:254-303` (Login coach).
- Kit desktop: `docs/design-source/ui_kits/eva-desktop/desktop-shell.jsx:351-390` (`DesktopAuthShell`) + CSS `.dt-auth2*` en `eva-desktop/index.html:368-381`.
- DS ground truth: `docs/design-source/_ds_bundle.js` (Button lg = 56px/17px; Input = 48px, border 1.5px, radius-control, focus sport-600 + ring-focus).
- App: `apps/web/src/app/(auth)/**` + `apps/web/src/components/auth/**` (Ola 7, 51ffbae1).

---

## Veredicto del flag pendiente: headline del login blanco vs oscuro

**El headline OSCURO (screenshot w7-auth) es el fiel al kit. No hay gap en el código actual.**

- Kit: `flow.jsx:271` — h1 "Panel del coach" con `color: var(--text-strong)` sobre `var(--surface-app)`. Tokens (`docs/design-source/tokens/colors.css:79`): light `--text-strong: var(--ink-950)` (oscuro); dark (`theme-dark.css:20`): `#F4F6F8` (blanco).
- App: `login/page.tsx:36` usa `text-text-strong` → `--color-text-strong: var(--text-strong)` (globals.css:95) → mismos valores (globals.css:400 light = ink-950, :593 dark = #F4F6F8).
- El root layout fuerza `defaultTheme="light"` + `enableSystem={false}` (`app/layout.tsx:141-146`) → en la carga por defecto el headline DEBE verse oscuro. Blanco solo es correcto si el usuario activó dark theme (y ahí también es fiel al kit).
- Conclusión: si alguna captura "CSS canónico" lo mostró blanco en tema claro, era un estado erróneo/transitorio, no el código actual. **Sin fix necesario.**

---

## Findings

### [P0] Register no adopta el shell de wizard del kit — sigue siendo el formulario boxed pre-rediseño (con tokens EVA)
- Kit: `coach-auth.jsx:114-141` — wizard full-bleed sobre `--surface-app`: header **sticky** con back-chevron (38px, surface-sunken) + "Paso {n} de N" + nombre del paso + barras de progreso 4px; h1 "Creá tu cuenta de coach" 26px font-display 900 **alineado a la izquierda** dentro del flujo; sin card contenedor.
- App: `apps/web/src/app/(auth)/register/page.tsx:196-253` — h1 centrado `text-3xl` (30px, tracking -0.03) FUERA de un card `bg-surface-card border rounded-card p-8 shadow-sm`; barras de progreso dentro del card; sin header sticky; botón "Atrás" abajo (`:724-733`) en vez del chevron arriba. En <760 (regla verbatim) la diferencia es estructural: caja con borde/sombra y padding 32 vs página plana del kit.
- Fix: extraer el shell del wizard del kit (header sticky back+paso+progress, contenido flat sin card, h1 26px izquierdo) como layout del register; mover el "Atrás" al chevron del header. Los pasos/contenido actuales (3 pasos, más ricos) se conservan.
- **Verdict:** CONFIRMED — verificado en código: `register/page.tsx:196-212` h1 centrado `text-3xl` sobre card `bg-surface-card border rounded-card p-8 shadow-sm` (`:212`), progress bars `h-1.5` dentro del card (`:243-253`), sin header sticky, "Atrás" abajo (`:725-733`); kit `coach-auth.jsx:114-141` es flat full-bleed con header sticky + chevron 38px + "Paso n de N" + barras 4px y h1 26px izquierdo. Refutación descartada: no hay override `md:` (el card aplica en todos los anchos), no existe wizard hermano (grep sin matches), y el kit desktop tampoco lo encaja en card — `.dt-auth2-card` (`index.html:378`) es solo clip redondeado sin bg/border/shadow, la pantalla móvil flat se renderiza verbatim. Los 3 pasos (vs 2 del móvil kit) sí son intencionales (step 99 = plan web), pero el shell no.

### [P1] Legales + Turnstile renderizados en TODOS los pasos del wizard (kit: solo en Confirmar)
- Kit: `coach-auth.jsx:291-331` — los 3 checkRows legales y el CTA final viven exclusivamente en el paso Confirmar; el paso 1 termina en Continuar → Google → link login.
- App: `register/page.tsx:657-722` — el bloque `cf-turnstile` y la caja sunken con los 3 checkboxes legales están fuera de los condicionales de paso → visibles también en paso 1 y 2. El paso 1 queda visualmente cargado y con jerarquía distinta al kit.
- Fix: condicionar el bloque legal (y el estado visible del turnstile) a `step === 3`; mantener los valores en estado para el submit.
- **Verdict:** CONFIRMED — `register/page.tsx:657-722`: el `cf-turnstile` (`:658-664`) y la caja sunken con los 3 checkboxes (`:673-722`) están fuera de todo condicional `step === X` → visibles en pasos 1 y 2; kit `coach-auth.jsx:322-327` los pone solo en Confirmar. Matiz que no cambia el verdict: el turnstile es `data-appearance="interaction-only"` (casi siempre invisible), pero el bloque legal sí es la carga visual real en paso 1.

### [P1] Checkboxes nativos sin re-skin EVA DS (legales y add-ons)
- Kit: `coach-auth.jsx:107-112` (checkRow) y `:242` (add-ons) — check tile custom de 22px, radius 6, relleno `--sport-500` con check blanco, borde 2px `--border-strong` cuando off; texto 13px `--text-muted`.
- App: `register/page.tsx:676-721` y `:510-520` — `<input type="checkbox">` nativo 16px con `accent-[var(--sport-500)]`. Render del control lo decide el OS/browser, no el DS.
- Fix: componente `CheckTile` (span 22px + icono Check condicional) reutilizado en legales y add-ons, espejo del checkRow del kit.
- **Verdict:** CONFIRMED — `register/page.tsx:676-680,698-701,713-715` (legales) y `:510-519` (add-ons) usan `<input type="checkbox" className="h-4 w-4 ... accent-[var(--sport-500)]">` nativo de 16px; kit `coach-auth.jsx:107-112` y `:242` es tile custom 22px radius 6 relleno sport-500 con Check blanco / borde 2px border-strong off. No existe ningún `CheckTile`/re-skin en el repo (grep sin matches). Diferencia real y visible (render lo decide el browser/OS).

### [P1] Forgot/Reset: card centrado + shadcn layout en vez del patrón flat del kit; Reset sin medidor de fuerza
- Kit: `coach-auth.jsx:371-408` (Forgot) y `:411-449` (Reset) — página flat sobre surface-app, back-chevron 40px arriba a la izquierda, h1 26px font-display 900 **izquierdo**, inputs directos, CTA sport lg; Reset incluye medidor de fuerza de 3 segmentos (success/warning/danger) y hint live "No coinciden todavía".
- App: `forgot-password/page.tsx:54-116` y `reset-password/page.tsx:53-127` — header centrado + card `bg-surface-card p-8 shadow-lg`, sin back-chevron superior (solo link inferior), y **Reset no tiene medidor de fuerza ni validación live de coincidencia** (solo server-side). Los controles sí son EVA (ui/input re-skinneado, 48px/radius-control) — el gap es de estructura de página y del meter faltante.
- Fix: quitar el card wrapper, alinear h1 a la izquierda con back-chevron (mismo patrón que login), y portar el strength meter del register (ya existe en `register/page.tsx:353-381`) + hint de mismatch al reset.
- **Verdict:** CONFIRMED — `forgot-password/page.tsx:55-64` y `reset-password/page.tsx:55-69`: header centrado + card `bg-surface-card p-8 shadow-lg` en todos los anchos (sin variante md:); kit es flat sobre surface-app con h1 26px izquierdo. Reset sin meter ni hint live verificado (`reset-password/page.tsx:73-106` — solo `minLength={8}` y validación server) vs kit `coach-auth.jsx:438-444` (meter 3 segmentos + hint "No coinciden todavía."). Precisión menor: el back-chevron superior del kit existe en Forgot (`:378-380`) pero NO en Reset (el wrap de `:429` no tiene head) — el fix debe agregar chevron solo a forgot. No altera la severidad.

### [P1] CTAs de auth a 48px/16px — el kit usa Button size lg (56px/17px) en todo el embudo
- Kit: `_ds_bundle.js` Button `lg: { h: 56, px: 22, fs: 17 }`; todos los CTA de auth del kit son `size="lg"` (login `flow.jsx:284,293`, wizard `coach-auth.jsx:169,286,329`, forgot `:404`, reset `:446`, verify `:364`).
- App: `components/auth/AuthSubmitButton.tsx` (`min-h-[48px]` + `text-base` 16px), botón Google del login (`CoachLoginForm.tsx:112` `h-12 text-sm` — 48px/14px), y todos los CTAs de register/forgot/reset/verify (`h-12`). 8px menos de altura y tipografía menor en el botón principal de cada pantalla del funnel.
- Fix: subir los CTAs primarios de auth (y el botón Google) a `h-14` (56px) `text-[17px]` con `px-[22px]`, o agregar variante `size="lg"` a AuthSubmitButton.
- **Verdict:** CONFIRMED — DS ground truth verificado: `_ds_bundle.js:226-232` `lg: { h: 56, px: 22, fs: 17 }` y todos los CTA de auth del kit son `size="lg"` (login `flow.jsx:284,293`, wizard, forgot, reset, verify). App verificada: `AuthSubmitButton.tsx:36` `min-h-[48px] text-base`, Google del login `CoachLoginForm.tsx:112` `h-12 text-sm` (48/14), SubmitButtons de register/forgot/reset `h-12 text-base`. Sistemático en todo el funnel (el app usa de facto el `md` del DS = 48/15). Real, aunque sutil pantalla por pantalla — P1 se sostiene por ser el CTA primario de cada pantalla del embudo.

### [P2] Logo del login: pictograma 72px vs logotipo completo 86px del kit (+ asset tenue en dark)
- Kit: `flow.jsx:269-270` — `eva-logo-ink.png` / `eva-logo-white.png` (logo completo) a 86px de alto.
- App: `login/page.tsx:35` — `EvaBrandIcon` 72px, que en light usa el pictograma sin letras y en dark `eva-icon.png` (outline tenue — gotcha conocido y DIFERIDO según memoria del proyecto).
- Fix (cuando se destrabe el asset): usar el logotipo sólido a ~86px; como mínimo reemplazar el asset dark tenue.

### [P2] Columna del formulario desktop alineada arriba; el kit centra verticalmente el card
- Kit: `.dt-auth2-form { align-items: center }` + `.dt-auth2-card { height: min(780px, calc(100vh - 80px)) }` (`eva-desktop/index.html:377-378`) — el contenido queda ópticamente centrado en la banda de 480px.
- App: `(auth)/layout.tsx:22` — `flex-col items-center pt-14 pb-12` (centrado solo horizontal); en pantallas altas el formulario queda pegado arriba con vacío abajo.
- Fix: `justify-center` con `min-h` segura (o wrapper `my-auto`) manteniendo `overflow-y-auto` para viewports bajos.

### [P2] Register paso 2 (plan): toggle de ciclo, radio de tiers y barra de total no matchean el patrón del kit
- Kit: `coach-auth.jsx:190-285` — ciclo como segmented **pill** (radius 999, fondo sunken, segmento activo con card+shadow y "−10%/−20%" en success); tier cards con radio circle 22px a la izquierda y badge flotante (top −9, pill sport/success); barra de Total sunken SIEMPRE visible con métrica 22px + "$X/mes equivalente".
- App: `register/page.tsx:460-484` ciclo como grid de cards con borde; `:393-457` tiers sin radio circle y badges inline; total en vivo solo aparece si hay add-ons (`:539-547`). Estado seleccionado (border sport-500 + bg sport-100 + glow) sí matchea.
- Fix: segmented pill para el ciclo, radio circle en tier cards, y barra de total permanente al pie del paso 2.

### [P2] Copy: tuteo/voseo mezclado y labels de CTA distintos al kit
- Kit (voseo consistente): "¿Ya tenés cuenta? Iniciá sesión", "Registrate con Google", "Empezar gratis" / "Continuar al pago".
- App: "¿Ya tienes cuenta?" (`register/page.tsx:777`), "Regístrate y accedé gratis" (mezcla, `:206`), "Registrarse con Google" (`:769`), CTA final "Crear Cuenta" / "Crear mi cuenta gratuita" (`:60-63`).
- Fix: normalizar al voseo del kit y adoptar los labels del CTA final ("Empezar gratis" / "Continuar al pago").

### [P2] Forgot success-state: icono y jerarquía levemente distintos
- Kit: `coach-auth.jsx:382-393` — círculo 72px success-100 con icono **send** 30px, h1 24px font-display 900, email destacado en `<b>` dentro del párrafo, CTA sport lg "Volver al inicio de sesión".
- App: `forgot-password/page.tsx:66-74` — círculo 64px con **CheckCircle**, h2 18px, sin email destacado, sin CTA (solo el link inferior).
- Fix: icono send 72px, h1 más grande, interpolar el email en negrita y CTA primario de volver.

---

## Verificado 1:1 (sí matchea el kit)

- **Shell desktop 2-pane** (`(auth)/layout.tsx` + `AuthBrandPanel.tsx`): transcripción fiel de `.dt-auth2` — panel de marca flex-1 con el gradiente radial exacto (`radial-gradient(135% 110% at 18% 8%, sport-500→600→700)`), logo blanco 46px con drop-shadow, tagline 38px/900/-0.03em text-balance, sub white/85, 3 feature-rows con tiles 40px `bg-white/16` radius-md; columna de formulario 480px; panel oculto <760 (paridad móvil exacta).
- **Login** (`login/page.tsx` + `CoachLoginForm.tsx`): la pantalla más fiel del funnel — back-chevron surface-sunken arriba-izquierda, logo centrado, h1 26px font-display 900 tracking -0.02 text-strong, sub 14.5 muted, gap 14 entre campos, forgot-link 13px bold sport-600 a la derecha, divider "o" con border-subtle, botón Google secondary con la G multicolor, footer "¿No tenés cuenta? Registrate" en sport-600.
- **Campos de formulario**: `AuthFormField`/`PasswordInput` y el `ui/input.tsx` re-skinneado son espejo del `Input.jsx` del DS (48px, border 1.5px border-default, radius-control, bg surface-card, label 13px/600 text-strong, icono 18px text-muted, focus sport-600 + ring-focus, línea hint/error 12px).
- **VerifyEmail** (`verify-email/page.tsx`): 1:1 con `coach-auth.jsx:338-368` — círculo 76px sport-100 + MailCheck 34px, h1 25px, card de beneficios con label uppercase 11px y checks success 22px, "¿No te llegó? Revisá spam…", CTA "Ya confirmé · Ir al panel" con arrow.
- **Register — contenido de los pasos**: strength meter 3 segmentos con la lógica de color exacta (success/warning/danger + "Contraseña segura ✓"), honeypot posicionado igual, chip Google "Conectado" en paso 1, estado seleccionado de tiers (border sport-500 + bg sport-100 + glow-sport), gate de nutrition_exchanges con mensaje "Requiere un plan con nutrición", cupón colapsado con la misma normalización uppercase, resumen del paso 3 con las mismas filas (Plan/Alumnos/Facturación/Nutrición/Tu marca/Módulos/Total) y "$0 — Gratis" en success-600.
- **Error banners**: danger-100 bg + danger-600 text, mismos del kit.
- **Riqueza extra intencional** (no gaps): CAPTCHA Turnstile con umbral de fallos, Google OAuth real, threading de cupones `?codigo=`, add-ons self-service, redirects por slug de coach/team en forgot/reset.
- **Headline del login**: color canónico verificado (ver veredicto arriba) — sin gap.

---

## Fix log (2026-07-01)

- **[P0] Shell wizard del register** — FIXED (`apps/web/src/app/(auth)/register/page.tsx`): header sticky (back-chevron 38px surface-sunken; en paso 1 el chevron es Link a `/`, en 2-3 llama `prevStep`), "Paso X de 3" + nombre del paso, barras de progreso 4px sport-500; card boxed `p-8 shadow` eliminado → contenido flat sobre surface-app; h1 26px (paso 1) / 24px (pasos 2-3) font-display 900 alineados a la izquierda con sus subtítulos del kit; botón "Atrás" inferior eliminado (vive en el chevron); Google + "¿Ya tenés cuenta?" gateados a paso 1 como el kit. Lógica de pasos/estado/hidden-inputs/submit idéntica. El breakdown del paso 3 ganó `bg-surface-card` (antes lo heredaba del card).
- **[P1] Legales + Turnstile solo en Confirmar** — FIXED (`register/page.tsx`): bloque legal condicionado a `step === 3` (names `accept_legal`/`accept_health_data`/`accept_marketing` + `required` intactos; el submit ocurre en el paso 3, así que la validación nativa y la del server action siguen iguales). El widget Turnstile queda MONTADO desde el paso 1 dentro de un wrapper `hidden` que solo se muestra en `step === 3`: el render implícito de Turnstile escanea el DOM al cargar el script, por lo que montarlo recién en el paso 3 dejaría el form sin `cf-turnstile-response` y rompería el registro con `TURNSTILE_SECRET_KEY` seteado. Wiring del token verificado: el widget inyecta el hidden input dentro del form y `register.actions.ts:71-85` lo lee en el submit. Visualmente = kit (interaction-only; un challenge interactivo solo se vería en Confirmar).
- **[P1] Check tiles EVA 22px** — FIXED (`register/page.tsx`): componente local `CheckTile` (span 22px radius 6, off = border 2px `border-strong`, on = relleno sport-500 + Check blanco `text-on-sport`, `peer-checked` sobre `<input class="peer sr-only">` real + `peer-focus-visible` ring) aplicado a los 3 legales y al checkbox de cada add-on del paso 2.
- **[P1] Forgot/Reset flat + meter** — FIXED (`forgot-password/page.tsx`, `reset-password/page.tsx`): card wrapper y headers centrados eliminados; h1 26px font-display 900 izquierdo. Forgot: back-chevron 40px arriba-izquierda (Link a `loginHref` con slugs), success-state del kit (círculo 72px success-100 + Send 30px, h1 24px, email en `<b>` capturado client-side, CTA sport lg "Volver al inicio de sesión"), footer "¿Te acordaste? Iniciá sesión". Reset: sin chevron (fiel al kit), inputs controlados client-side puros (names/action intactos), strength meter 3 segmentos portado del register + hint live "No coinciden todavía."; labels/placeholder al voseo del kit.
- **[P1] CTAs del funnel a 56px/17px** — FIXED: `components/auth/AuthSubmitButton.tsx` gana prop `size` (`'md'` default = comportamiento previo, org/enterprise sin cambios; `'lg'` = `min-h-14 px-[22px] text-[17px]`); `CoachLoginForm.tsx` usa `size="lg"` y el botón Google pasa a `h-14 text-[17px]`; SubmitButton/Continuar/Google de register a `h-14 text-[17px]` con iconos del kit (ArrowRight / CreditCard); SubmitButtons de forgot (ArrowRight) y reset (Check) a `h-14 text-[17px]`; CTA de `verify-email` a `h-14 text-[17px]`.
- **[P2] Logo login 86px + asset dark** — SKIPPED: asset del logotipo sólido bloqueado (gotcha `eva-icon.png` outline tenue, DIFERIDO por decisión previa del proyecto); requiere asset nuevo, no swap de clases.
- **[P2] Centrado vertical desktop** — PARTIAL: `my-auto` en login (`login/page.tsx`) y verify-email (composiciones cortas, espejo del centrado del card del kit sin tocar el layout compartido); NO aplicado a register/forgot/reset (flujos top-anchored full-height en el kit — centrar el wizard con header sticky sería infiel). `(auth)/layout.tsx` sin cambios.
- **[P2] Paso 2: segmented pill / radio circle / total bar permanente** — SKIPPED: estructural (>5 líneas por control, tres restructures); fuera del criterio de swap barato.
- **[P2] Copy voseo + labels CTA** — FIXED: "¿Ya tenés cuenta? Iniciá sesión", "Registrate con Google", "Empezar gratis" / "Continuar al pago", "Completá tus datos…", divider "o" (antes "o registrate con"), reset "Repetí la contraseña" / "Volvé a escribirla". Los textos legales de consentimiento (Ley 21.719) se conservaron verbatim (wording de compliance, no se toca).
- **[P2] Forgot success-state** — FIXED (incluido en el fix de Forgot/Reset).
