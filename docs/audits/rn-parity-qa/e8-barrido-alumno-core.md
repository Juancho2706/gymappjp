# E8 — Barrido de paridad RN 1:1 · ALUMNO CORE

Dominio: selector/walkthrough/splash · auth (login brandeado, código, onboarding, suspended, passwords, verify-email) · dashboard/home (13 secciones) · perfil.
Referencia: árbol mobile web (`md<760`, `apps/web/src/app/c/[coach_slug]/**`) + inventario `research/03-web-alumno-screens.md`.
Veredicto: OK / GAP-menor (cosmético) / GAP-mayor (estructura o funcionalidad ausente).

| Pantalla | RN (archivo) | Veredicto | Detalle |
|---|---|---|---|
| Splash / entrada inteligente | `app/index.tsx` | OK | Fase `checking` = `EvaLoaderScreen`. Orden de decisión (sesión→dashboard / `?pick=1`→selector / branding cacheado→login / primer arranque→walkthrough) espeja el flujo CEO. Concepto RN-nativo (web root = `page.tsx` redirect). |
| Selector de rol | `app/index.tsx:106` | OK | Hero alumno (gradiente sport, `?→/alumno/codigo`) + card coach. RN-nativo (la web es coach-slug-scoped, sin selector). Tokens DS, sin legacy. |
| Walkthrough | `components/Walkthrough.tsx` | OK | Carrusel pre-login 4 slides (copy aprobado CEO 2026-07-08), gated `walkthrough_seen`. RN-only (PWA no lo tiene). |
| Código de coach | `app/alumno/codigo.tsx` | OK | Resuelve branding por invite_code o link `/c/slug` (`fetchBrandingByCoachIdentifier`) → login alumno. Espeja la resolución coach del `clientLoginAction`. RN-nativo. |
| Login brandeado (alumno) | `app/(auth)/login.tsx:415` | OK | 4 layouts white-label (clasico/hero/energia/minimal) vía `resolveLoginLayout`; gate `isBrandingAllowed` (<Pro→EVA); hero+tagline+`welcome_message`; validación workspace `validateAlumnoWorkspace` (standalone+enterprise) espeja `clientLoginAction`; `remember` solo coach (paridad); Google alumno ausente = diferido CEO (correcto). |
| Onboarding (intake 3 pasos) | `app/alumno/onboarding.tsx` | OK | Wizard 3 pasos, barra segmentada animada, `AnimatePresence` direccional, draft AsyncStorage por usuario, chips `Pick`, disclaimer médico ×2, checkbox 14+términos gate. 1:1 con `OnboardingForm`. |
| Change-password (force) | `app/change-password.tsx` | OK | Chips reactivos `8+/1 número/1 mayúscula/coinciden`; solo `gates` (8+ y coinciden) bloquean submit; limpieza autoritativa `clearForcePasswordChange`. 1:1 con web §3. |
| Reset-password (deep link) | `app/(auth)/reset-password.tsx` | OK | Nueva+confirmar con errores inline, éxito→home por rol. Cubre el flujo de enlace de correo. |
| Forgot-password | `app/(auth)/forgot-password.tsx` | OK | Email→`resetPasswordForEmail` (redirect `eva://reset-password`), estado "revisá tu correo". Espeja el link del login. |
| Verify-email | `app/(auth)/verify-email.tsx` | OK | Post-registro **coach free** (beneficios plan free). Espejo del web coach `(auth)/verify-email`. No es pantalla alumno (correcto). |
| Suspended | `app/alumno/suspended.tsx` | OK | Team-aware (marca team, sin WhatsApp personal) vs standalone (WhatsApp coach); "datos a salvo"; logout→código. 1:1 con web §13. |
| Dashboard / Home | `app/alumno/(tabs)/home.tsx` | **GAP-mayor** | Órden de secciones 1:1 (header→racha→check-in→hero→coach→momentum→programa→peso+records→reciente→hábitos→nutrición+WelcomeModal), gates (`nutritionEnabled`, check-in `<3d` oculto), estados loading/empty. **FALTA §1 `OrgAnnouncementBanner`**: no se consultan anuncios de la org (`getActiveOrgAnnouncements`); alumno enterprise/team no ve avisos de su organización. Scoped a contexto org. |
| Perfil | `app/alumno/(tabs)/perfil.tsx` | OK (GAP-menor) | Hero inverse + stats 2-col (Entrenos/Racha) + CTA "Compartí tu logro" (3 plantillas) + Apariencia(tema) + Preferencias(alarma descanso) + Seguimiento(movement/bodycomp gated) + Cuenta(historial/cambiar pass/ayuda/logout) + Zona de peligro(baja ARCO) + footer "Potenciado por EVA" (tier free). Extras RN OK (Seguridad biométrica, card Información, row cambiar contraseña). Menor: "Ayuda" abre `contacto@eva-app.cl` vs web `SALES_EMAIL` — verificar constante. |

## Hallazgos accionables
1. **GAP-mayor** — `home.tsx`: sin `OrgAnnouncementBanner` (§1 web). Añadir fetch de anuncios de org activos + banner al tope del scroll (solo si el alumno tiene `org_id`). Espejo: `getActiveOrgAnnouncements` + `OrgAnnouncementBanner`.
2. **GAP-menor** — `perfil.tsx:537`: "Ayuda" → `mailto:contacto@eva-app.cl`; web usa `SALES_EMAIL`. Alinear a la misma constante.

## Notas
- `codigo` / selector / walkthrough son RN-nativos (sin equivalente web por ser PWA coach-scoped) — paridad conceptual, no 1:1 literal, correcto por diseño.
- Sin tokens legacy detectados; todo por tokens DS (`text-*`, `bg-sport/ember/aqua/success/danger-*`, `--theme-primary` vía brand-kit).
- Offline/NetworkProvider (bloqueo total web) no evaluado en este barrido (fuera de estas pantallas; corresponde al chrome global).
