# G02 — Gaps: Alumno · Auth + Onboarding + Chrome

Fecha: 2026-07-08. Solo lectura. Dominio: login branded, codigo invite, onboarding, suspended,
change/forgot/reset password, tabs + navegacion + headers, deep links de entrada.
Referencia visual = arbol mobile (`md:hidden`) de la web EVA DS.

Fuentes cruzadas: `research/03-web-alumno-screens.md` (secc. 0, 1, 2, 3, 13), `research/02-design-system.md`,
`research/06-mobile-inventory.md`, `research/07-shared-seams.md`, `research/01-web-delta.md`.
Verificado en codigo real (rutas archivo:linea abajo).

---

## 0. Resumen ejecutivo

- La fundacion DS (tokens, primitivas, `@eva/brand-kit`) YA esta en mobile; el auth/chrome mobile YA usa
  patron A (className DS) en casi todo. Los gaps NO son "lenguaje viejo" salvo dos piezas (chrome tab bar
  y `TopBar` usan fuente Montserrat legacy + objeto `theme`).
- El gap **mas grande y de mayor impacto de marca** es el **login del alumno**: la web es un login
  white-label completo (logo + brand_name + welcome_message + color + fuente + dark + 4 layouts,
  gateado Pro+); el mobile es un login **generico** ("Bienvenido de vuelta", cero marca del coach mas
  alla de un wash de color). Esto es delta post-21-jun (commits `995df126`, `53c3c0b2`).
- El segundo gap grande es la **navegacion**: web = capsula flotante de vidrio "4 + Mas" con pildora
  deslizante + hide-on-scroll + sheet "Mas" rico; mobile = barra docked plana con tint por tab y panel
  "Mas" minimo. Ademas el nav mobile **no espeja el gating de nutricion** (muestra "Plan" siempre).
- Onboarding mobile es un formulario de scroll unico; web es wizard de 3 pasos con barra segmentada,
  chips, draft en storage y disclaimer medico + checkbox de terminos.
- Exclusiones intencionales confirmadas: login Google del alumno **DIFERIDO por CEO** (excluido);
  PWA install / manifest brandeado / icono+splash = EVA-only (N/A en RN nativo). Ver seccion Riesgos.

---

## 1. Gaps visuales (pantalla por pantalla)

### 1.1 Login — `apps/mobile/app/(auth)/login.tsx` vs web `login/page.tsx` + `ClientLoginForm.tsx`
Estado mobile: patron A (11 className, usa `Button`/`Card`/`Input`), pero **NO branded**.

Divergencias concretas:
- **Cero hero de marca.** Web renderiza brand-mark (logo del coach o iniciales) + tagline =
  `welcome_message` (o default). Mobile muestra un badge generico "Tu entrenamiento" + heading fijo
  "Bienvenido de vuelta" (`login.tsx:103-108`). No hay logo, ni `brand_name`, ni `welcome_message`.
- **Sin los 4 layouts white-label** (`login_layout_key`: `clasico`/`minimal`/`hero`/`energia`,
  `resolveLoginLayout` en web). Mobile tiene un unico layout centrado.
- **Copy del boton.** Web: "Entrar a {brandName}" (`ClientLoginForm.tsx:46`). Mobile: "Iniciar sesion"
  (`login.tsx:171`) — pierde la marca.
- **Solo un wash de color** (`LinearGradient` con `theme.primary`, `login.tsx:67-74`) en vez del theming
  completo (fuente del coach, dark accents, loader del coach en layout `energia`).
- Focus-ring: web usa `--theme-primary` con sombra `color-mix`; mobile usa `Input` con ring de marca
  (OK conceptual, verificar que el ring tome el color del coach vía `theme.primary`).
- **Footer.** Web: "con tecnologia de EVA" (solo tier free). Mobile: solo "eva-app.cl" (`login.tsx:200-202`),
  sin gating por tier.
- Fuente del heading OK (Archivo `font-display-black`). El resto del texto usa Hanken (`font-sans`) OK.

### 1.2 Codigo invite — `apps/mobile/app/alumno/codigo.tsx`
Estado: patron A + `TopBar`. Cerca de paridad visual (no hay pantalla espejo directa en web; la web usa
`/c/<slug>` como URL, no una pantalla de "ingresar codigo"). Gaps menores:
- Usa `TopBar` que pinta con **Montserrat legacy** (`TopBar.tsx:32,37`) + objeto `theme` (patron B) — deuda
  de fuente; el resto del DS usa Archivo/Hanken.
- `TextInput` crudo (no la primitiva `Input`) con clases DS inline (`codigo.tsx:70-83`) — funciona pero
  no reutiliza el foco/estados de `Input`.
- Usa `theme.radius['2xl']`/`theme.radius.xl` (objeto theme) en vez de clases `rounded-*`.

### 1.3 Onboarding — `apps/mobile/app/alumno/onboarding.tsx` vs web `onboarding/OnboardingForm.tsx`
Estado mobile: patron A (11 className) pero **estructuralmente distinto** — es un scroll unico de todos los
campos, NO el wizard de 3 pasos de la web.

Divergencias:
- **No wizard 3 pasos.** Web: 3 pasos con `AnimatePresence` direccional + **barra de progreso segmentada**
  (3 barras) + eyebrow "Paso X de 3". Mobile: todo en una pantalla scrolleable, sin stepper.
- **Sin card `surface-card/80 backdrop-blur`**; mobile pinta sobre `AppBackground` con titulo suelto.
- **Disclaimer medico ausente** como componente visual (web tiene warning box "EVA no es un dispositivo
  medico"; mobile no lo muestra).
- Chips: mobile tiene chips (`Chips`, `onboarding.tsx:113-131`) con tokens sport-100/sport-600 — visual OK,
  pero la web usa chip seleccionado = solido ink-950 (`Pick`), divergencia de tono del estado activo.
- Titulo: mobile "¡Bienvenido/a!" vs web "Completa tu perfil". Copy divergente.

### 1.4 Suspended — `apps/mobile/app/alumno/suspended.tsx` vs web `suspended/page.tsx`
Estado mobile: patron A (3 className). Gaps:
- **Icono divergente:** mobile `AlertCircle` con hex hardcodeado `WARNING_500='#F5A524'` (`suspended.tsx:10,25`);
  web usa `Pause` (warning). Preferir token `warning-500` en vez de literal.
- **No team-aware.** Web usa la marca del team/coach en el copy ("{coach/equipo} pauso tu acceso · contacta
  a {brand}"); mobile tiene copy fijo generico sin nombre de marca.
- **Sin CTA de WhatsApp** del coach (web la muestra si existe y no es contexto team). Mobile solo tiene
  "Cerrar sesion".
- Copy: web agrega "tus datos estan a salvo"; mobile no.

### 1.5 Change-password — `apps/mobile/app/change-password.tsx` vs web `change-password/page.tsx`
Estado mobile: patron A. Gaps:
- **Sin chips reactivos de reglas.** Web muestra 4 chips que viran a verde ("8+ caracteres", "Coinciden"
  que GATEAN el submit; "1 numero", "1 mayuscula" como pistas). Mobile solo valida en `save()` con mensajes
  de error (`change-password.tsx:23-24`).
- **Icono/heading:** web `ShieldCheck` + "Crea tu contraseña"; mobile `Lock` + "Cambiar contraseña". Copy
  y semantica divergentes (web enfatiza "primer acceso / crea").
- **Usa `Alert.alert` nativo** para el exito (`change-password.tsx:38`) en vez de transicion in-app +
  redirect directo a dashboard (web hace redirect silencioso). Divergencia UX.
- Tiene header "Volver" con `ChevronLeft` (`change-password.tsx:44-49`) — la web NO tiene back en esta
  pantalla (es gate obligatorio). Divergencia de flujo (permite volver de un gate forzado).

### 1.6 Forgot-password — `apps/mobile/app/(auth)/forgot-password.tsx`
Estado: patron A + `TopBar`. Visual cercano. Gaps:
- `TopBar` con Montserrat legacy (misma deuda que 1.2).
- **No branded / sin contexto de coach.** Web enlaza `/forgot-password?coach_slug=` (conserva marca).
  Mobile no pasa el coach ni brandea la pantalla.
- Estado "enviado" (`sent`) esta bien resuelto (icono success + copy). OK.

### 1.7 Reset-password — `apps/mobile/app/(auth)/reset-password.tsx`
Estado: patron A + `TopBar`. Visual cercano. Gaps:
- **Typo de copy:** "Contrasena"/"contrasena" sin ñ en varios strings (`reset-password.tsx:31,72,73,98,100,123`).
  Debe ser "Contraseña". Bug de texto.
- `TopBar` Montserrat legacy.
- Reglas de password: solo largo>=8 y coincidencia (`reset-password.tsx:30-34`); web change-password usa
  chips ricos — considerar unificar el patron de validacion visual con 1.5.

### 1.8 Chrome / Tab bar — `apps/mobile/components/alumno/AlumnoMobileChrome.tsx` vs web `ClientNav.tsx` (mobile tree)
Este es el gap visual central del dominio. Web mobile = **capsula flotante de vidrio esmerilado**
(`03-web-alumno-screens.md` §0.2). Mobile actual = **barra docked plana**.

Divergencias concretas:
- **No es capsula flotante.** Web: `position:fixed`, `bottom: safe+16px`, `left/right:14px`,
  `borderRadius:30`, fondo `color-mix(surface-card 74%)` + `blur(26px) saturate(180%)`, sombra en capas.
  Mobile: `BlurView` a ancho completo con `borderTopWidth` hairline (`AlumnoMobileChrome.tsx:151,165-167`) —
  barra pegada al borde, no capsula flotante con margenes.
- **Sin pildora deslizante** detras del tab activo (web anima con `--ease-spring`, indice calculado).
  Mobile solo escala el tile activo + tint de fondo (`AlumnoMobileChrome.tsx:114-115`).
- **Sin hide-on-scroll.** Web se minimiza al bajar >80px (insets 14→72, labels fade, padding reducido).
  Mobile no reacciona al scroll.
- **Fuente legacy:** labels usan `Inter_600SemiBold` (`AlumnoMobileChrome.tsx:117,142`) — deuda; el DS pide
  Hanken. Colores vía objeto `theme` (patron B) + `hexToRgba` local (`:64-71`).
- **Sheet "Mas" pobre.** Web: bottom sheet rico con fila destacada "Mi perfil" (icono + "Racha, modulos,
  cuenta y mas"), fila Historial, boton "Instalar la app" (N/A en RN), boton "Cerrar sesion" (danger).
  Mobile: panel flotante minimo que solo lista overflow tabs (Historial, Perfil) como filas simples
  (`AlumnoMobileChrome.tsx:126-148`), **sin Cerrar sesion**, sin fila destacada de perfil.
- **Iconos divergentes:** mobile usa `BookOpen` para Aprender (`AlumnoMobileChrome.tsx:42`); web usa
  `Dumbbell`. Nutricion: mobile `Apple` (OK, web tambien Apple).

### 1.9 TopBar / headers
- No hay header sticky branded per-pantalla como en el dashboard web (eyebrow `brand_name`). El `TopBar`
  compartido es minimo (brand "EVA" fijo o back). Las pantallas de auth usan `TopBar showBrand` que
  muestra "EVA" en Montserrat, no la marca del coach.

---

## 2. Gaps funcionales

### 2.1 Login branded — datos de marca faltantes (delta post-21-jun, P1)
`apps/mobile/lib/branding.ts` (la fuente de branding cacheada) **NO trae** varios campos que el login web
consume:
- **Falta `welcome_message`** (`CoachBranding` en `branding.ts:4-16` no lo tiene) — imposible mostrar el
  tagline branded sin agregarlo al `select`.
- Falta `subscription_tier` → **no se puede aplicar `isBrandingAllowed(tier)`** client-side (gate Pro+ que
  la web aplica: `< Pro` cae a EVA). Riesgo: mobile brandearia el login de un coach free.
- Falta `login_layout_key` → no se pueden replicar los 4 layouts.
- Faltan `secondary_color`/`accent_light|dark`, `font_key`/`brand-font`, `theme_preset_key`,
  `logo_url_dark` → theming white-label incompleto vs web.
- `BRANDING_COLS_RICH` (`branding.ts:36-37`) solo pide id/slug/primary_color/display_name/invite_code +
  loader. Ampliar el select (respetando el patron DB-compat de fallback) es la costura habilitante.

### 2.2 Login — flujo de gate divergente
- Web resuelve en el server action (`clientLoginAction`): matchea coach por `invite_code`/`slug`,
  chequea `clients.is_active` (→ "cuenta pausada"), `force_password_change` (→ `/change-password`),
  matchea workspace enterprise (org). Mobile hace `signInWithPassword` directo (`login.tsx:52`) y delega
  TODO el gate al `(tabs)/_layout.tsx` (`getClientProfile` → blocked/forcePasswordChange). Funciona, pero:
  - **No hay validacion de workspace/coach en el login** (el mobile entra a `/alumno/home` sin verificar
    que el email pertenezca al coach cuyo branding se cargo). Divergencia de correctitud vs web.
  - `is_active===false` en mobile termina en `/alumno/suspended` (via gate), no en error inline de login.
    Comportamiento distinto pero aceptable.
- **Sin sticky branding** ("Intelligent Redirect"): web guarda `last_coach_slug`/`coach_brand_name`/
  `coach_logo_url` en localStorage (`ClientLoginForm.tsx:60-68`) y hace `setLastWorkspace`. Mobile tiene
  branding cacheado en AsyncStorage (equivalente parcial) pero no el `setLastWorkspace`.

### 2.3 Onboarding — features faltantes
- **Sin draft en storage.** Web guarda `onboarding_draft_{slug}` (formData + step) y lo limpia al enviar OK.
  Mobile no persiste el borrador — si el alumno cierra, pierde todo.
- **Sin checkbox de terminos/privacidad.** Web exige checkbox "14 años + acepto terminos/privacidad".
  Mobile solo confirma 14 años (`onboarding.tsx:33,81-86`) — **gap legal** (falta aceptacion de terminos).
- Sin disclaimer medico repetido en paso 3 (no hay pasos).
- Verificar que `submitIntake` (`lib/alumno-onboarding`) escriba los mismos campos que el web
  (`client_intake` incluye `sex` desde delta `3a9b392a` — usado para IMC/TDEE; confirmar que mobile lo
  capture o quede pendiente para el modulo bodycomp).

### 2.4 Suspended — team-awareness + WhatsApp
- Mobile no lee marca de team ni WhatsApp del coach (ver 1.4). Requiere traer esos datos (probablemente vía
  `getClientProfile` extendido o endpoint) para paridad.

### 2.5 Change-password — limpieza server-side del flag
- Mobile hace `clients.update({force_password_change:false})` client-side con try/catch y un flag de sesion
  efimero (`change-password.tsx:29-36`) porque RLS puede bloquear el UPDATE (columna compra-only/gestionada).
  Web lo hace en server action con service-role. Funciona como best-effort pero es fragil; idealmente
  exponer un endpoint `/api/mobile/*` que haga la limpieza autoritativa (evita el loop del gate si el flag
  de sesion se pierde). Riesgo de correctitud.

### 2.6 Chrome — gating de nutricion NO espejado (P1)
- Web oculta la tab "Nutricion" si `showNutrition===false` (master switch `resolveNutritionDomainEnabled`
  server-side; `ClientNav` recibe `showNutrition`). Mobile **hardcodea** `PRIMARY_TABS = ['home','nutricion',
  'exercises','check-in']` (`AlumnoMobileChrome.tsx:74`) — la tab "Plan" siempre aparece aunque el coach
  haya apagado el dominio. Gap funcional + potencial confusion (abre una pantalla vacia/off).
- Tampoco espeja movimiento/bodycomp (esas no son tabs del alumno ni en web — se alcanzan desde /perfil;
  fuera de este dominio, cubierto por G de modulos).

### 2.7 Chrome — "Cerrar sesion" ausente en el sheet "Mas"
- El sheet "Mas" mobile no incluye Cerrar sesion (esta solo en `/perfil`). Web lo tiene en el sheet. Gap de
  paridad (menor; el logout vive en perfil de todos modos).

### 2.8 Offline chrome — bloqueo total
- Web tiene `NetworkProvider`/`OfflineScreen` que **bloquea toda la app** offline ("No puedes entrenar sin
  internet"). Mobile tiene `OfflineBanner` (inline) + `lib/use-online` pero no un bloqueo full-screen
  equivalente montado en el layout del alumno. Gap de paridad de comportamiento (verificar con dominio de
  workout/nutricion; aqui se nota en el chrome).

### 2.9 Deep links de entrada
- `+native-intent.ts` mapea `/c/<slug>` y `/invite/<code>` → resuelve branding → `/(auth)/login?role=alumno`
  (`+native-intent.ts:19-27`). Recovery hash (`type=recovery`) manejado en `_layout.tsx:73-85`. Correcto y
  cercano a paridad.
- **iOS `associatedDomains` AUSENTE** (`06-mobile-inventory.md` §F, confirmado) — los universal links solo
  funcionan en Android (App Links con `autoVerify`). En iOS los links `https://eva-app.cl/c/...` NO abren la
  app. Gap de paridad iOS (funcional).
- **kill /join (delta):** la web mato la ruta `/join`. Mobile NO tiene `/join` (entra por `alumno/codigo`
  → login). No hay nada que remover; solo confirmar que ningun deep link/copy apunte a `/join` (grep no
  mostro referencias en el arbol de auth). Considerado cubierto.

### 2.10 Login Google alumno — EXCLUIDO
- Memoria `project_alumno_google_login_deferred.md`: **DIFERIDO por decision CEO (2026-06-21)**. El login
  Google GIS de la web es de **coach**, no de alumno. **NO replicar en el alumno.** Marcado como exclusion
  intencional. (Si en el futuro se habilita, seria SDK nativo + `signInWithIdToken`, no el iframe GIS web.)

### 2.11 PWA brandeada — N/A (exclusion intencional)
- Manifest per-coach, apple splash, install prompt, badging: en RN la app es nativa. El boton "Instalar la
  app" del sheet "Mas" web NO aplica. Icono + splash = EVA-only (confirmado en `app.json`). El Badging API
  (badge numerico) SI tiene equivalente nativo (`expo-notifications setBadgeCountAsync`) pero pertenece al
  dominio de dashboard/check-in, no a auth/chrome. Excluido de este dominio salvo mencion.

---

## 3. Costuras (que compartir vía packages/ o API)

Referencia: `research/07-shared-seams.md`.

1. **`@eva/schemas` (auth) — YA compartido.** `LoginSchema`/`ForgotPasswordSchema` ya se usan en mobile
   (`login.tsx:17`, `forgot-password.tsx:13`). Mantener; no duplicar validaciones de auth.
2. **`@eva/brand-kit` — YA compartido** (`lib/theme.ts`). El theming del login branded debe resolverse con
   `resolveBrandTheme`/`deriveSportTokens` (ya disponibles), NO reimplementar color en el login.
3. **`@eva/tiers` — YA compartido** (`lib/coach-tiers.ts`). Usar `isBrandingAllowed(subscription_tier)` (o
   su equivalente en el paquete) para gatear el branding del login Pro+ — pero antes hay que **traer
   `subscription_tier`** en `branding.ts` (costura de datos, no de codigo).
4. **`branding.ts` como costura de datos (ampliar el select).** El login/forgot/suspended branded exigen
   que `fetchBrandingByCoachIdentifier` traiga `welcome_message`, `subscription_tier`, `login_layout_key`,
   `secondary_color`/`accent_*`, `font_key`, `theme_preset_key`, `logo_url_dark`. Es PostgREST directo con
   patron DB-compat (fallback rich→min ya presente). Requiere que esas columnas tengan GRANT a `anon`
   (gotcha CLAUDE.md: el login del alumno es pre-auth → lee como `anon`; incidente previo
   `project_alumno_login_outage_anon_grant.md`). **Verificar grants antes de asumir.**
5. **`resolveLoginLayout` / precedencia loader (brand-composer).** La logica de que layout de login mostrar
   y la precedencia "eleccion del coach > tema" (`brand-composer.ts`, pura) es candidata a paquete
   compartido si se quiere paridad de los 4 layouts + 6 loaders. Hoy vive solo en web
   (`01-web-delta.md` §1.2). El arquitecto decide si portar o simplificar mobile a 1-2 layouts.
6. **Gate de nutricion en el nav.** El flag `showNutrition` viene de `resolveNutritionDomainEnabled`
   (server-side). Mobile debe obtenerlo (via `getClientProfile` extendido o `/api/mobile/config`
   —endpoint `config` ya existe, `06-mobile-inventory.md` §C— o leyendo `coaches.enabled_modules`/feature
   prefs). El resolver de visibilidad `visible = ENTITLED AND ENABLED` vive en `@eva/feature-prefs` (hoy
   NO importado por mobile). Costura: adoptar `@eva/feature-prefs` para el gate del nav. (Cruza con el
   dominio de entitlements/modulos — coordinar.)
7. **Limpieza de `force_password_change`** — considerar endpoint `/api/mobile/*` autoritativo (service-role)
   en vez del UPDATE client-side best-effort (ver 2.5). Costura de API.

---

## 4. Tareas propuestas (ordenadas, atomicas)

### Ola A — Re-skin visual (chrome + auth), fundacion del dominio

- **A1 [VISUAL] S — Capsula flotante del nav alumno.** Reescribir `AlumnoMobileChrome.tsx` de barra docked a
  capsula flotante (bottom safe+16, left/right 14, radius 30, blur+saturate, sombra en capas) con pildora
  deslizante detras del tab activo (spring). Migrar labels a Hanken (quitar `Inter_600SemiBold`) y colores a
  className/tokens (reducir objeto `theme`). Dep: primitivas DS existentes. (Ref web §0.2.)
- **A2 [VISUAL] S — Hide-on-scroll del nav.** Minimizar la capsula al bajar >80px (fade labels, encoger).
  Requiere un scroll listener compartido (context o prop en las pantallas). Dep: A1.
- **A3 [VISUAL] S — Sheet "Mas" rico.** Reemplazar el panel minimo por bottom sheet con fila destacada
  "Mi perfil" (icono + subtitulo), fila Historial, y boton "Cerrar sesion" (danger). Omitir "Instalar la
  app" (N/A RN). Dep: A1, `BottomSheet`.
- **A4 [VISUAL] M — Login branded (visual).** Re-skin de `(auth)/login.tsx` para mostrar hero de marca
  (logo/iniciales + `welcome_message`), boton "Entrar a {brand}", footer "con tecnologia de EVA" (tier
  free), theming con color/fuente del coach. Empieza con layout `clasico`; los otros 3 layouts = opcional.
  Dep: **B1** (datos de branding) para tener `welcome_message`/`tier`/logo. (Delta `995df126`/`53c3c0b2`.)
- **A5 [VISUAL] S — Onboarding wizard 3 pasos.** Convertir `alumno/onboarding.tsx` a wizard con barra
  segmentada + `AnimatePresence` direccional + card `surface-card`. Reusar chips existentes (ajustar estado
  activo a ink-950 solido para paridad). Dep: ninguna (visual). Cruza con B3 (draft + terminos).
- **A6 [VISUAL] S — Suspended, change-password, forgot, reset (pulido DS).** (a) Suspended: icono `Pause`
  + token `warning-500` (quitar hex), copy "tus datos estan a salvo". (b) change-password: icono
  `ShieldCheck`, chips reactivos de reglas, quitar `Alert.alert` (usar transicion + redirect), quitar el
  back de un gate forzado. (c) reset-password: **corregir typo "contrasena"→"contraseña"**. (d) Migrar
  `TopBar` fuera de Montserrat legacy a Archivo/Hanken (afecta codigo/forgot/reset). Dep: ninguna.

### Ola B — Funcional (datos + flujo)

- **B1 [SEAM] S — Ampliar `branding.ts`.** Agregar al `select` (rich, con fallback DB-compat):
  `welcome_message`, `subscription_tier`, `login_layout_key`, `secondary_color`, `accent_light/dark`,
  `font_key`, `theme_preset_key`, `logo_url_dark`. **Verificar/añadir GRANT a `anon`** de esas columnas
  (pre-auth). Extender `CoachBranding`. Dep: revisar grants (riesgo). Habilita A4, B2.
- **B2 [FUNCIONAL] S — Gate Pro+ del branding del login.** Aplicar `isBrandingAllowed(tier)` (`@eva/tiers`)
  en el login/forgot/suspended: `< Pro` cae a EVA visual conservando el nombre. Dep: B1.
- **B3 [FUNCIONAL] S — Onboarding: draft + terminos.** Persistir borrador (`onboarding_draft_{slug}` en
  AsyncStorage, limpiar al enviar OK) y agregar **checkbox de aceptacion de terminos/privacidad** (gap
  legal). Confirmar que `submitIntake` escriba paridad de campos (incl. `sex` si aplica). Dep: A5.
- **B4 [FUNCIONAL] S — Gate de nutricion en el nav.** Obtener `showNutrition` (via `getClientProfile`
  extendido / `/api/mobile/config` / feature-prefs) y ocultar la tab "Plan" cuando el dominio esta OFF.
  Idealmente adoptar `@eva/feature-prefs`. Dep: coordinar con dominio entitlements. (P1.)
- **B5 [FUNCIONAL] S — Suspended team-aware + WhatsApp.** Traer marca de team y WhatsApp del coach; mostrar
  CTA WhatsApp (si no es team) y usar el nombre de marca en el copy. Dep: B1 o extension de perfil.
- **B6 [FUNCIONAL] S — Login: validacion de workspace/coach.** Verificar que el email autenticado pertenece
  al coach cuyo branding se cargo (o resolver el coach correcto), espejando el matcheo del server action web.
  Evita entrar "brandeado por el coach X" con cuenta del coach Y. Dep: ninguna (client-side check + query).
- **B7 [FUNCIONAL] S — Limpieza autoritativa de `force_password_change`.** Endpoint `/api/mobile/*`
  service-role para bajar el flag (reemplaza el UPDATE best-effort). Dep: backend. (Menor; hoy funciona.)
- **B8 [FUNCIONAL] S — iOS universal links.** Agregar `associatedDomains` (applinks:eva-app.cl) a `app.json`
  + AASA en el server. Habilita `/c/<slug>` y `/invite/<code>` en iOS (hoy solo Android). Dep: config +
  archivo `.well-known/apple-app-site-association` en apps/web (verificar si existe).

### Diferido / excluido
- **Login Google alumno** — EXCLUIDO (CEO diferido). No crear tarea.
- **PWA install / manifest / apple splash / icono** — N/A RN (exclusion intencional).
- **Layouts de login `minimal`/`hero`/`energia` + 6 loaders** — opcional/P2; empezar con `clasico`. Portar
  `resolveLoginLayout`/`brand-composer` a paquete solo si se decide paridad total (SEAM, L).

---

## 5. Riesgos

- **GRANT a `anon` de columnas de branding (B1).** El login del alumno es pre-auth (lee como `anon`).
  Agregar `welcome_message`/`subscription_tier`/etc. al select sin el GRANT correspondiente reproduce el
  incidente `project_alumno_login_outage_anon_grant.md` (404/42501 en runtime). Verificar grants en la DB
  ANTES de ampliar el select; puede requerir migracion aditiva.
- **Doble sistema de theming (patron A className vs objeto `theme`).** El chrome (`AlumnoMobileChrome`) y
  `TopBar` aun leen `theme.*` + fuente Montserrat. Al re-skin (A1/A6) hay que mover a className/tokens sin
  romper el white-label runtime (`brandVars`). Riesgo de drift si se mezclan hex literales.
- **Gating de nutricion (B4) cruza dominios.** Depende de la adopcion de `@eva/feature-prefs` / endpoint
  config, que pertenece al plan de entitlements. Si no se coordina, el nav queda con la tab "Plan" siempre
  visible (estado actual) o se duplica logica de gating divergente de la web.
- **Drift de flujo de login (gate en tabs vs server action).** Mobile delega el gate al layout de tabs; si
  se agregan reglas en el server action web (nuevos estados de `clients`) no se propagan solas a mobile.
  Documentar la paridad del gate como invariante.
- **`force_password_change` best-effort (2.5).** Si el UPDATE client-side falla por RLS y el flag de sesion
  se pierde (reinicio de app), el alumno puede quedar en loop de `/change-password`. B7 lo mitiga.
- **iOS deep links (B8).** Sin `associatedDomains`, los coaches que compartan `eva-app.cl/c/<slug>` a
  alumnos con iPhone no abriran la app — degradan a Safari. Gap de adquisicion silencioso.
- **No verificado en runtime.** Informe de lectura; no se corrio `pnpm typecheck` ni la app. El estado real
  de `submitIntake` (campos escritos) y de los grants de branding debe confirmarse antes de implementar.
