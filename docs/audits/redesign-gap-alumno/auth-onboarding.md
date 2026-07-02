# Auditoría de fidelidad visual — LADO ALUMNO · área **auth-onboarding**

Comparación kit de Claude Design vs implementación real de la app white-label (`/c/[coach_slug]/*`).
Viewport primario = mobile (<760). Fecha: 2026-07-02.

## Mapa de fuentes

| Pantalla | Kit (componente) | App |
|---|---|---|
| Login brandeado | `alumno-auth.jsx` › `BrandedLogin` (variante Inmersivo) | `login/page.tsx` + `login/ClientLoginForm.tsx` + `login/_components/LoginEntrance.tsx` |
| Crear contraseña | `flow.jsx` › `AccesoEstados` state `'contrasena'` | `change-password/page.tsx` |
| Onboarding 3 pasos | `flow.jsx` › `AccesoEstados` state `'onboarding'` | `onboarding/page.tsx` + `onboarding/OnboardingForm.tsx` |
| Acceso pausado | `flow.jsx` › `AccesoEstados` state `'pausado'` | `suspended/page.tsx` |
| Perfil / Más | `alumno.jsx` › `AlumnoMas` | (sin ruta) `components/client/ClientNav.tsx` (bottom-sheet) |

Notas de contexto verificadas antes de reportar:
- El login brandeado es un match muy fiel de la variante **Inmersivo** (hero full-bleed radial con color del coach, brand-mark sobre vidrio, sheet con esquinas redondeadas superpuesto, `LoginEntrance` con stagger). No hay gap estructural ahí.
- **Botón "Continuar con Google" ausente en el login** = decisión CEO explícita (Google alumno DIFERIDO, memoria `project_alumno_google_login_deferred`). NO es gap, no se reporta.
- Diferencias de color = data del coach (rampa white-label). NO se reportan.

---

## Hallazgos

### [P0] Falta la pantalla **Perfil / Más** (`AlumnoMas`) — la app la reduce a un bottom-sheet de navegación
- **Kit:** `alumno.jsx` › `AlumnoMas` (líneas 902–971). Es una PANTALLA completa con: (1) hero de identidad en `Card variant="inverse"` — avatar con anillo sport, nombre, "Coach: …", badge de programa (912–919); (2) grid de `StatCard` (Entrenos / Racha) (921–924); (3) card destacada **"Compartí tu logro"** con la marca del coach (926–933); (4) sección **Apariencia** con `ThemeToggleCard` (935–938); (5) sección **Módulos** read-only (Movimiento / Composición como `ListRow` con badge "Ver") (940–945); (6) sección **Cuenta** (Historial · Estados de acceso · Notificaciones · Ayuda · Cerrar sesión) (947–955); (7) **Zona de peligro → Eliminar mi cuenta** (957–967).
- **App:** no existe ruta `perfil`/`cuenta`/`mas` bajo `c/[coach_slug]` (verificado por `find`). El único equivalente es el sheet "Más" de `components/client/ClientNav.tsx:318–406`, que solo lista Historial + módulos entitled + PWA + Tema + Colores del coach + Cerrar sesión.
- **Diferencia concreta:** ausentes por completo respecto al kit → hero de perfil (avatar+nombre+coach+badge de programa), stat cards, card "Compartí tu logro", filas read-only de Módulos con badge "Ver", entradas "Estados de acceso" / "Notificaciones" / "Ayuda", y toda la **Zona de peligro / Eliminar mi cuenta** del alumno. El patrón de IA divergió de "tab Más = pantalla de perfil" a "botón Más = menú overflow".
- **Fix propuesto:** construir una pantalla `c/[coach_slug]/perfil` (o `mas`) que transcriba `AlumnoMas`: hero inverse con avatar+badge, StatCards, card "Compartí tu logro", sección Módulos read-only, sección Cuenta y Zona de peligro. Mantener el bottom-sheet actual solo como acceso rápido de navegación, o reemplazarlo por un tile "Más" que enrute a esta pantalla. (Es una decisión de IA — flag para CEO; hoy es el gap más grande del área.)
- **Verdict:** CONFIRMED — árbol de rutas de `c/[coach_slug]` verificado (solo bodycomp/change-password/check-in/dashboard/exercises/login/movimiento/nutrition/onboarding/suspended/workout/workout-history): NO existe `perfil`/`cuenta`/`mas`. El kit `alumno.jsx › AlumnoMas` vive en `screens/` (fuente válida, no legacy top-level). El sheet "Más" de `ClientNav.tsx:318-406` es solo navegación (Historial + módulos entitled + PWA + tema + colores + logout); ausentes por completo hero de perfil, StatCards, "Compartí tu logro", Módulos read-only con badge "Ver", "Estados de acceso"/"Notificaciones"/"Ayuda" y toda la Zona de peligro / Eliminar mi cuenta del alumno (los únicos "eliminar cuenta" del repo son coach-only). Identidad/racha existen parcialmente en el dashboard, no como pantalla Perfil. Gap estructural real.

### [P1] Crear contraseña — faltan los **chips reactivos de reglas** de contraseña
- **Kit:** `flow.jsx` › `AccesoEstados` state `'contrasena'` (64–82). Bajo los dos inputs hay 4 pills que viran a verde con check a medida que se cumplen: **8+ caracteres · 1 número · 1 mayúscula · Coinciden** (`rules`, 21–27; render 72–78), y el botón "Crear cuenta" queda `disabled` hasta `pwdOk`.
- **App:** `change-password/page.tsx:60–108`. Solo dos inputs (`minLength={8}`) y el botón; NO hay feedback de reglas en vivo. La validación de match/reglas ocurre server-side sin affordance visual.
- **Diferencia concreta:** se pierde el detalle de fuerza/validación reactiva característico de esta pantalla del kit.
- **Fix propuesto:** agregar el grupo de pills reactivas (mismo diseño: `--success-100/700` cuando OK, `--surface-sunken/--text-subtle` cuando no) alimentadas por estado del input. Alinear las reglas con la validación real del server (si el server solo exige 8+, mostrar al menos "8+ caracteres" y "Coinciden"; si se quieren las 4, endurecer también el server para no prometer de más).
- **Verdict:** CONFIRMED — `change-password/page.tsx` (líneas 60-108) solo tiene los dos `Input` (`minLength={8}`) + botón; ningún render de reglas. Grep de reglas/`pwdOk`/`PasswordStrength`/"1 mayúscula" en todo `c/[coach_slug]` = 0 (no hay componente hermano que las inyecte). El kit (`flow.jsx`, screens/, 72-78) sí las tiene reactivas con `disabled={!pwdOk}`. Gap real.

### [P1] Acceso pausado — tono semántico equivocado (**danger/rojo + AlertCircle** en vez de **warning/ámbar + pause**)
- **Kit:** `flow.jsx` › `AccesoEstados` state `'pausado'` (156–167). Ícono en caja **`--warning-100` bg / `--warning-700`**, `border-radius: var(--radius-lg)` (cuadrado redondeado), ícono **`pause`**. Copy en dos líneas suaves ("Tu coach pausó temporalmente tu acceso." / "Todos tus progresos y datos están a salvo."). Botón primario con ícono `message-circle`; secundario "Cerrar sesión" variante `ghost`.
- **App:** `suspended/page.tsx:21–49`. Ícono en círculo **`--danger-100` bg / `--danger-600`** (`rounded-full`), ícono **`AlertCircle`**. Botón de contacto sin ícono; "Cerrar Sesión" es filled `surface-sunken` con `LogOut`.
- **Diferencia concreta:** el rojo + alert-circle lee como ERROR/crítico; el kit usa ámbar + pause para comunicar "pausa temporal, tus datos están a salvo" (más tranquilizador). También difiere la forma del contenedor del ícono (círculo vs cuadrado redondeado).
- **Fix propuesto:** cambiar a tono warning (`--warning-100`/`--warning-700`), ícono `Pause` (lucide) en caja `rounded-card`; opcionalmente `message-circle` en el botón de contacto y "Cerrar sesión" a estilo ghost.
- **Verdict:** CONFIRMED — `suspended/page.tsx:22-23` usa `bg-[var(--danger-100)] text-[var(--danger-600)]` + `AlertCircle` + `rounded-full`; el kit `flow.jsx:158` usa `--warning-100`/`--warning-700` + ícono `pause` + `radius-lg`. Los tokens warning ya existen y se usan en la app (mismo `OnboardingForm.tsx` step 3 los usa). Sin evidencia de decisión intencional (una suspensión temporal mapea semánticamente a warning, no a error). Gap real — mismatch de tono semántico confirmado.

### [P1] Onboarding paso "Metas" — usa `<select>` nativos en vez de los **chips "Pick"** del kit
- **Kit:** `flow.jsx` › `AccesoEstados` state `'onboarding'`, componente `Pick` (45–54) + uso en step 1 (103–108). Objetivo (5 opciones), Experiencia (3) y Días (2/3/4/5/6+) se eligen con **botones-chip tappables** (grupos etiquetados; seleccionado = `--ink-950` sólido). Patrón mobile-first, sin dropdowns.
- **App:** `onboarding/OnboardingForm.tsx:227–287`. Los tres campos son `<select>` HTML nativos (`goals`, `experience_level`, `availability`).
- **Diferencia concreta:** los selects nativos rompen la estética app-like del kit (abren el picker del SO, no matchean el look de chips). Es el patrón de interacción firma de este wizard.
- **Fix propuesto:** reemplazar los tres `<select>` por grupos de chips (mismo diseño que `Pick`: `--radius-md`, borde `--border-default`, seleccionado sólido). Mantener los `<input type="hidden">` para el submit del server action.
- **Verdict:** CONFIRMED — `OnboardingForm.tsx` líneas 229-244 (`goals`), 251-264 (`experience_level`), 269-284 (`availability`) son `<select>` HTML nativos. El kit `flow.jsx` define `Pick` (chips tappables, 45-54) y lo usa en el step Metas (103-108). No es responsive-branch ni componente hermano; el patrón de chips del kit está genuinamente reemplazado por selects nativos. Gap real.

### [P2] Onboarding — indicador de progreso divergente (círculos numerados vs barras segmentadas)
- **Kit:** `flow.jsx` state `'onboarding'` (87–92). Tres **barras segmentadas** iguales (`flex:1`, `height:5`, `radius 999`; llenas `--sport-500` hasta `step`) + eyebrow **"Paso X de 3"** (uppercase, `--text-subtle`).
- **App:** `OnboardingForm.tsx:127–159`. **Círculos numerados** (w-8 h-8, check al completar) + labels **Bio / Metas / Salud** + línea conectora animada.
- **Diferencia concreta:** distinto lenguaje visual del stepper (ambos válidos, pero no matchean). Además los títulos de paso difieren ("Tus datos" → "Tus datos biométricos", etc.) y son `xl/extrabold` (20px/800) vs kit `24px/900`.
- **Fix propuesto:** si se prioriza fidelidad, adoptar las 3 barras segmentadas + "Paso X de 3"; o dejar el stepper actual como decisión consciente (documentarla). Bajar prioridad.

### [P2] Login "con tecnología de" — texto plano "EVA" en vez del **wordmark/logo EVA**
- **Kit:** `alumno-auth.jsx` › `BrandedLogin` `poweredBy` (209–215). Renderiza la imagen `eva-logo-ink.png` / `eva-logo-white.png` (por modo) a `height:13`, `opacity 0.7`.
- **App:** `login/page.tsx:145–149`. `con tecnología de <span>EVA</span>` (texto, `font-semibold text-text-muted`).
- **Diferencia concreta:** el "powered by" pierde el wordmark de marca EVA.
- **Fix propuesto:** usar el logo EVA (light/dark) con `next/image` a ~13px de alto y opacidad 0.7, en vez del texto.

### [P2] Crear contraseña — card + ícono ShieldCheck vs columna limpia con **logo EVA** del kit
- **Kit:** `flow.jsx` state `'contrasena'` (64–82). Columna centrada sobre `surface-app`, encabezada por el **logo EVA** (`eva-logo-ink.png`, 44px), sin card contenedora.
- **App:** `change-password/page.tsx:47–109`. Envuelve el form en `bg-surface-card border rounded-card p-8 shadow-lg` y encabeza con un ícono **`ShieldCheck`** en caja `bg-theme-subtle`.
- **Diferencia concreta:** cambia el header de marca (logo EVA) por un ícono de escudo, y agrega un contenedor card que el kit no tiene. El botón dice "Guardar nueva contraseña" (kit: "Crear cuenta").
- **Fix propuesto:** anteponer el logo EVA como en el kit (o al menos evaluar si el ShieldCheck se mantiene por decisión). Contenedor card es aceptable; anotarlo como divergencia menor.

### [P2] Onboarding paso "Bio"/"Salud" — inputs sin íconos leading y layout de grid
- **Kit:** state `'onboarding'` step 0 (97–101): inputs "Peso actual (kg)" (ícono `scale`) y "Estatura (cm)" (ícono `ruler`) **apilados** en columna. Step 2 (110–113): inputs "Lesiones"/"Condiciones médicas" con íconos `bandage`/`heart-pulse`.
- **App:** `OnboardingForm.tsx` step 1 (177–209): peso/altura en `grid-cols-2` **sin íconos**; step 3 (308–332): `textarea` sin íconos.
- **Diferencia concreta:** faltan los íconos leading (scale/ruler/bandage/heart-pulse) y el paso Bio va en 2 columnas en vez de apilado.
- **Fix propuesto:** agregar íconos leading a los inputs (patrón `Input iconLeft`); considerar apilar Peso/Estatura como el kit (opcional en desktop).

---

## Observaciones (no gap / fuera de alcance de estas 5 pantallas)

- **Carrusel intro de primer ingreso** (`flow.jsx` › `Onboarding`, 213–251: 3 slides "Entrena con un plan real" / "Nutrición que se adapta" / "Mirá tu progreso") — no encontré equivalente en la app. No está entre las 5 rutas del área; se anota por si el parent lo quiere rutear a otro auditor (dashboard/first-run).
- **Bienvenida del coach** (`alumno-auth.jsx` › `CoachWelcome`) — existe `dashboard/_components/WelcomeModal.tsx` como probable equivalente; fuera del alcance auth, no verificado a fondo aquí.
- **Estados `consent` / `holding`** del kit `AccesoEstados` (Teams / Ley 21.719 / sin coach) — son gates de Teams; no reportados como gap del standalone.

Verificado 1:1
