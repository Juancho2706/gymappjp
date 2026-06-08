# Cimientos compartidos coach + alumno (RN mobile)

_2026-06-06 · Derivado de las 2 auditorías (coach + alumno) + research. La app del coach y la del alumno son **un solo edificio con dos pisos**: comparten login, selector de rol, onboarding, cliente Supabase, capa de red, manejo de errores, push, deep-links, motion/branding. **Arreglar los cimientos UNA vez evita copiar los mismos bugs dos veces** y cierra varios S1 de ambos lados de un saque._

> **Por qué primero:** el usuario va a construir el alumno standalone sobre esta plomería. Si está floja, el alumno hereda los bugs. Además, lo que el usuario ya quería hacer (un buen selector Coach/Alumno + buen onboarding) **es** este cimiento → hacerlo bien ahora arregla de paso los agujeros de auth del coach.

---

## 1. Auth, sesión y gates de acceso

**Problema (coach + alumno):** el login rutea por un query param `role`, no valida que el usuario sea coach/alumno real, y **no aplica los gates que el middleware web (`proxy.ts`) sí aplica**: suspendido/archivado, `force_password_change`, onboarding. `apiFetch` no maneja 401 → sesión zombi. La sesión vive en AsyncStorage sin cifrar.

**Cimiento a construir:**
- **Un `AuthProvider` único** (Context) que resuelva sesión + rol real (vía `getCoachProfile`/`getClient`) y exponga `{session, role, status}`. El selector Coach/Alumno y `index.tsx` consumen lo mismo (hoy hay doble fuente de verdad + posible loop de navegación).
- **Gates en la capa de navegación** (no por pantalla): suspendido/archivado → `/suspended`; `force_password_change` → `/change-password` (y limpiar el flag); onboarding incompleto → `/onboarding`. Cierra **A5/A6 del alumno** (S1) y el gap equivalente del coach.
- **Manejo central de 401** en `apiFetch` + wrapper de Supabase: intentar `refreshSession()` una vez; si falla, `signOut()` + redirect a login con toast "tu sesión expiró".
- **Sesión segura:** mover el storage del cliente Supabase a `expo-secure-store` (Keychain/Keystore) + **quick unlock biométrico** opt-in (ver [native-advantages](mobile-native-advantages.md)). Limpiar secure-store + caches en logout.
- **`workout_logs` integridad (compartido):** el `upsert` sin `onConflict` que **duplica filas** es del alumno pero corrompe lo que ve el coach → arreglarlo en la capa de datos compartida (select-then-update/insert o UNIQUE + onConflict).
- **Enterprise (DIFERIDO):** workspace switch + canje de invite-code NO en esta fase (standalone primero). Pero el `AuthProvider` debe diseñarse para soportarlo después (rutear por `org_role` del JWT, no solo por fila).

## 2. Selector de rol + onboarding (lo que el usuario quiere hacer bien)

- **Selector Coach/Alumno** pulido y con la identidad visual nueva (ver [ux-design-language](mobile-ux-design-language.md)). Debe convivir con el deep-link de branding del coach (validar el slug/código antes de aplicar branding — hoy es spoofeable).
- **Onboarding** del alumno completo (objetivo/experiencia/disponibilidad/lesiones/condiciones → `client_intake`) + **consentimiento real** (checkbox con links a términos/privacidad, valor enviado real, no hardcodeado) — cierra gaps legales del alumno. Alinear catálogo (`availability` "6+ días" vs "6 días").

## 3. Capa de datos + manejo de errores

**Problema:** 103+ accesos directos a Supabase (coach) y queries inline en componentes del alumno (home, workout, nutrición), loaders sin try/catch → **loader infinito**, scoring duplicado que ya diverge de web.

**Cimiento:**
- **`infrastructure/` ligera** (repositories que reciben el `SupabaseClient`) + lint rule "no `supabase.from` dentro de `app/`". Mismo patrón que web (que ya acepta `SupabaseClient` como parámetro → compartible).
- **Hook de carga estándar `{loading | error | empty | data}`** + componente **`ErrorState` con retry** (hoy solo hay `EmptyState`) → cierra el loader infinito y el "Alumno no encontrado por red" de un saque, en coach y alumno.
- **`ErrorBoundary` raíz** (`app/+error.tsx`) + **Sentry** (`@sentry/react-native`) con source maps en EAS → sin esto, las pantallas blancas son invisibles en prod.

## 4. Contratos compartidos (`packages/`)

**Problema:** mobile re-declara 66 interfaces y re-valida a mano (password 6 vs 8, RPE, scoring de adherencia/racha) → drift garantizado con web.

**Cimiento (mover a `packages/`, lógica pura, web↔RN):**
- Adoptar **`@eva/schemas`** (client/coach/nutrition/auth) en mobile en vez de validar a mano. Unificar password (login laxo / set ≥8).
- Mover a paquetes: **tier-config/capabilities** (riesgo de revenue), **plan-builder reducer** (hoy copia "1:1"), **attention-score + taxonomía de flags** (hoy 2 fórmulas distintas), **isPaidStatus/MRR**, **brandScore**, **helpers de presentación** (saludo por hora, redondeo de macros, fechas es-CL).
- **`@eva/brand-kit/motion.ts`** — tokens de motion (duración/easing/spring) compartidos (ver [ux-design-language](mobile-ux-design-language.md) §2).
- **`date-utils` Santiago** ya existe y está portado — **usarlo** (hoy hay bugs por `new Date()` local/UTC en workout y nutrición).

## 5. Offline core (compartido)

- Instalar **`@react-native-community/netinfo`** (hoy detección por inferencia de error → S1 en alumno).
- **Idempotencia por `client_log_id`** + flush **per-item resiliente** + flush al **reconectar** (no solo foreground). Endurecer `lib/offline-cache.ts` existente (NO migrar a WatermelonDB).
- Patrón único de cola offline reusable por workout, nutrición y check-in (hoy check-in y home no tienen offline).

## 6. Push foundation (compartido)

- Migrar el campo `notification` de `app.json` → **config plugin** de `expo-notifications` (deprecado en SDK 54).
- Tabla **`push_tokens`** (ya P0 en memoria) + registro por usuario + **revocar token en logout/toggle off** (bug actual del coach que NO hay que copiar al alumno).
- Base de deep-link desde notificación (Expo Router) reusable por ambos.

## 7. Build / entorno / CI (compartido, release)

- **EAS env de producción** (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` + `EXPO_PUBLIC_EAS_PROJECT_ID`) — hoy solo `staging` (IP LAN) → un build prod limpio arranca con auth muerta. Migrar a `app.config.ts` + assert al boot (no `!`).
- **ATS/cleartext solo en dev/staging** (hoy global en prod → MITM de datos de salud).
- **CI mobile** (typecheck + `expo export` en cada PR que toque `apps/mobile`) — hoy es disciplina manual.
- **Tests** del reducer + loaders (failure injection) + RLS-isolation desde mobile.

---

## 8. Qué cierra esto (impacto)

Construir los cimientos cierra, en coach Y alumno a la vez:
- Los **S1 de acceso** (suspendido/force-password) del alumno y el coach.
- El **loader infinito** y el "no encontrado por red" (coach + alumno).
- La **sesión zombi** (401) y la inseguridad de sesión.
- La **duplicación de `workout_logs`** (corrompe datos del coach).
- La **base de offline/push/error/motion** sobre la que se construye el alumno.
- Varios bugs de **drift** (password, scoring, fechas) de un saque.

> Lo que NO entra acá (queda para las olas de cada app): features de pantalla específicas del alumno (swaps, porción parcial, charts), el deleite por pantalla, y todo lo enterprise.

Secuencia completa en [mobile-roadmap.md](mobile-roadmap.md).
