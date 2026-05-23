# Plan A — enterprise.eva-app.cl: Full Web Experience ✅ COMPLETADO
**Version:** 1.0 | **Date:** 2026-05-22 | **Priority:** P0 | **Status:** DONE (sesión 2026-05-22)

---

## Context

`enterprise.eva-app.cl` está configurado en Vercel/Cloudflare y apunta al mismo deployment
que `eva-app.cl`. El middleware ya detecta el host `enterprise.eva-app.cl`, pero su
comportamiento actual es **incorrecto en 3 aspectos críticos:**

1. Root `/` redirige directo a `/org/login` — no existe landing page enterprise
2. `/org/login` no está protegido por rate limiting — vector de brute-force abierto
3. El check de rate limiting corre DESPUÉS del rewrite de subdominio — nunca se ejecuta
   para rutas enterprise

Adicionalmente, las rutas `/org/*` son accesibles desde `eva-app.cl/org/*` sin restricción
de subdominio — no hay enforcement que obligue a usar el subdominio enterprise.

**Goal:** `enterprise.eva-app.cl` como experiencia web completa y autónoma:
- Landing premium dark/amber con features, pricing, CTAs
- Login propio (ya existe `/org/login`, solo necesita routing correcto)
- Todas las rutas org management bajo el subdominio
- Seguridad production-ready antes del primer deploy

---

## Archivos que se modifican / crean

| Acción | Archivo | Motivo |
|--------|---------|--------|
| MODIFICAR | `apps/web/src/middleware.ts` | Múltiples fixes (ver A.1–A.3) |
| CREAR | `apps/web/src/app/enterprise/page.tsx` | Landing page |
| CREAR | `apps/web/src/app/enterprise/layout.tsx` | Layout enterprise |
| CREAR | `apps/web/src/app/enterprise/components/` | Componentes landing enterprise |
| MODIFICAR | `apps/web/src/lib/supabase/server.ts` | Cookie domain (ver decisión A.4) |
| MODIFICAR | `apps/web/src/components/landing/LandingEnterpriseSection.tsx` | CTA → enterprise.eva-app.cl |
| MODIFICAR | `apps/web/next.config.ts` | allowedDevOrigins |
| MODIFICAR | `apps/web/vercel.json` | CSP review |
| MODIFICAR | `apps/web/src/app/org/login/_actions/login.actions.ts` | Post-login redirect absoluto |
| CREAR/MODIFICAR | `tests/enterprise/subdomain-routing.spec.ts` | E2E tests nuevos |
| MODIFICAR | `docs/operations/MANUAL_TASKS.md` | New env vars + checklist |

---

## A.1 — Security Fix: Rate Limiting para /org/login

**Archivo:** `apps/web/src/middleware.ts`

**Problema:** La condición `authPost` (línea ~66-78) no incluye `/org/login`.
Además, el bloque de enterprise subdomain (líneas 27-42) hace `return NextResponse.redirect(url)`
ANTES de que se ejecute el rate limiting — nunca se aplica.

**Fix 1 — Agregar /org/login a authPost:**
```typescript
const authPost =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/registro-beta' ||
    pathname === '/org/login' ||          // ← NUEVO
    /^\/c\/[^/]+\/login$/.test(pathname)
```

**Fix 2 — Mover rate limiting ANTES del bloque enterprise:**
El orden actual en middleware:
```
1. updateSession (Supabase)
2. Enterprise subdomain rewrite ← RETORNA AQUÍ, bypasea rate limit
3. Rate limiting
4. Protección de rutas
```

Orden correcto:
```
1. updateSession (Supabase)
2. Rate limiting (incluye /org/login)  ← ANTES del enterprise rewrite
3. Enterprise subdomain rewrite
4. Protección de rutas
```

Esto asegura que un POST a `enterprise.eva-app.cl/login` (que internamente es `/org/login`)
sea rate-limited antes de redirigirse.

**Verificación:** `curl -X POST https://enterprise.eva-app.cl/login -d '{...}' -s -o /dev/null -w "%{http_code}"` × 41 veces en 60s → debe retornar 429.

---

## A.2 — Middleware: Cambios de Routing

**Archivo:** `apps/web/src/middleware.ts`

**Cambio 1 — Root enterprise → landing, no login:**
```typescript
// ANTES:
if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/org/login'
    return NextResponse.redirect(url)   // ← cambia URL, manda al login
}

// DESPUÉS:
if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/enterprise'
    return NextResponse.rewrite(url)    // ← URL queda como enterprise.eva-app.cl/, muestra landing
}
```

**Cambio 2 — Nuevo: Proteger /org/* solo desde enterprise subdomain:**
```typescript
// Agregar ANTES del bloque if (pathname.startsWith('/org/')) existente:
if (pathname.startsWith('/org/') && host !== 'enterprise.eva-app.cl' && host !== 'localhost:3000') {
    const enterpriseUrl = new URL(pathname, 'https://enterprise.eva-app.cl')
    return NextResponse.redirect(enterpriseUrl)
}
```

Esto asegura que `eva-app.cl/org/anything` redirige a `enterprise.eva-app.cl/org/anything`.
En desarrollo local se permite `localhost:3000` directamente.

**Cambio 3 — También redirigir /enterprise/* en main domain:**
```typescript
// Si alguien va a eva-app.cl/enterprise/* → redirigir a enterprise.eva-app.cl
if (pathname.startsWith('/enterprise') && host === 'eva-app.cl') {
    return NextResponse.redirect('https://enterprise.eva-app.cl')
}
```

**Mantener igual:**
- `/login` → `/org/login` rewrite ✅
- Auto-prefix `/[slug]/*` → `/org/[slug]/*` rewrite ✅
- MFA enforcement ✅
- Auth check ✅

---

## A.3 — Enterprise Landing Page

**Crear:** `apps/web/src/app/enterprise/page.tsx`

**Diseño:** Premium dark + amber (#F59E0B / amber-400). Separado del landing main.

### Estructura de la página:

```
<EnterpriseLandingLayout>
  <EnterpriseHeader />          ← Logo EVA Enterprise + "Iniciar sesión →"
  <EnterpriseHeroSection />     ← Headline + subheadline + dual CTA
  <EnterpriseFeaturesGrid />    ← 3 cards de features
  <EnterprisePricingCard />     ← Pricing + trial info
  <EnterpriseSocialProof />     ← (si hay testimonios, sino omitir)
  <EnterpriseFAQ />             ← 4-5 preguntas frecuentes
  <EnterpriseFooter />          ← Links legales + contacto
</EnterpriseLandingLayout>
```

### Contenido por sección:

**Header:**
- Left: `EVA Enterprise` wordmark (usa `LandingBrandMark` existente en `components/landing/`)
- Right: Link `"Iniciar sesión →"` → `/org/login` (texto pequeño, no botón prominente)

**Hero:**
- Badge: `"Para Gyms y Academias"` (amber badge, similar a Aviso Legal)
- H1: `"El panel de operaciones para tu organización"` (o similar — confirmar con user)
- Subheadline: `"Gestiona múltiples coaches, el pool de alumnos y reportes de actividad desde un solo lugar."`
- CTA primario: `"Solicitar demo"` → Calendly URL (botón amber sólido)
- CTA secundario: `"Iniciar sesión"` → `/org/login` (botón outline)

**Features Grid (3 cards):**
1. **Pool de alumnos compartido** — CSV import, asignación por coach, historial centralizado
2. **Aislamiento total de datos** — RLS PostgreSQL por organización, datos por coach visibles solo para ese coach
3. **Reportes de actividad** — Health score por coach, check-ins, adherencia, alertas automáticas

**Pricing Card:**
- Plan base: `$49.990 CLP/mes` (hasta 3 coaches incluidos)
- Coach adicional: `+$9.990 CLP/mes`
- 30 días de prueba gratuita
- Sin tarjeta de crédito requerida
- Onboarding incluido
- Nota: "Precios no incluyen IVA cuando corresponda"
- CTA: `"Comenzar prueba gratuita"` → `/org/login` o Calendly

**FAQ (4-5 preguntas):**
- ¿Qué incluye el plan base?
- ¿Cómo se maneja la privacidad de los alumnos?
- ¿Puedo cancelar en cualquier momento?
- ¿Los coaches mantienen su acceso individual a EVA?
- ¿Hay contrato de permanencia?

**Footer:**
- Links: `Aviso Legal` · `Privacidad` · `Contrato Enterprise` · `contacto@eva-app.cl`

### Componentes reutilizables:
- `LandingBrandMark` — `apps/web/src/components/landing/LandingBrandMark.tsx`
- Patrones de diseño de `apps/web/src/app/legal/contrato-enterprise/page.tsx`
  (mismo dark + amber, misma estructura visual)
- Tokens: `packages/tokens/` — colores ya definidos

### Layout enterprise:
**Crear:** `apps/web/src/app/enterprise/layout.tsx`

```typescript
// NO incluir en el root layout de la app principal
// Enterprise tiene su propio metadata y estructura
export const metadata: Metadata = {
    title: 'EVA Enterprise — Panel para Gyms y Academias',
    description: '...',
    // OG image enterprise-specific
}
```

---

## A.4 — Supabase Cookie Domain: Decisión de Aislamiento

**Decisión tomada:** **Mantener cookies aisladas por subdominio** (sin `domain` attribute).

**Justificación (por Security Engineer + Software Architect):**
- El org_admin SOLO usa `enterprise.eva-app.cl` — no necesita cookie compartida con `eva-app.cl`
- Los coaches usan `eva-app.cl` — tampoco necesitan cookie de enterprise
- El aislamiento de cookies es más seguro: una sesión comprometida en un subdominio
  no afecta el otro
- Si un usuario es tanto coach como org_admin, **debe logearse por separado en cada
  subdominio** — esto es comportamiento deseado y arquitectónicamente correcto
- Compartir cookies `.eva-app.cl` introduciría CSRF risks (finding #10 del audit)

**Resultado:** NO modificar `server.ts` para cookie domain.

**Documentar en CLAUDE.md** (sección Architecture):
```
### Cookie Domain Policy
Auth cookies are scoped to their specific subdomain:
- eva-app.cl: coach and client sessions
- enterprise.eva-app.cl: org admin sessions
Cross-subdomain session sharing is intentionally disabled.
If a user has both roles, they authenticate separately on each domain.
```

---

## A.5 — Post-Login Redirect: Contexto de Subdominio

**Archivo:** `apps/web/src/app/org/login/_actions/login.actions.ts`

**Problema actual:** `redirect('/org/${org.slug}')` — redirect relativo.
Cuando el browser está en `enterprise.eva-app.cl`, este redirect funciona correctamente
porque el browser lo interpreta como `enterprise.eva-app.cl/org/${slug}`.
El middleware entonces hace el rewrite transparente a `/org/${slug}`.

**Verificación necesaria:** Confirmar que el redirect post-login no termine en URL incorrecta.
No requiere cambio de código, pero sí un test E2E.

**Si el redirect falla:** Convertir a redirect absoluto:
```typescript
const enterpriseDomain = process.env.NEXT_PUBLIC_ENTERPRISE_URL ?? 'https://enterprise.eva-app.cl'
redirect(`${enterpriseDomain}/org/${org.slug}`)
```

---

## A.6 — Variables de Entorno: Nueva env var enterprise

**Agregar en Vercel (producción y preview):**
```
NEXT_PUBLIC_ENTERPRISE_URL=https://enterprise.eva-app.cl
```

**Usar en:**
- `LandingEnterpriseSection.tsx` — CTA link
- `login.actions.ts` — post-login redirect (si se decide usar URL absoluta)
- Metadata canónica de páginas enterprise

**En `next.config.ts`:**
```typescript
allowedDevOrigins: ['127.0.0.1', 'localhost'],
```

---

## A.7 — Update Main Landing: CTA → enterprise.eva-app.cl

**Archivo:** `apps/web/src/components/landing/LandingEnterpriseSection.tsx`

**Cambio:**
```tsx
// CTA primario: ir a enterprise subdomain (no Calendly directo)
<a href={process.env.NEXT_PUBLIC_ENTERPRISE_URL ?? 'https://enterprise.eva-app.cl'}>
  Ver EVA Enterprise
</a>

// CTA secundario: Calendly demo
<a href="https://calendly.com/contacto-eva-app/eva-enterprise">
  Agendar demo de 30 min
</a>
```

Esto crea un funnel: main landing → enterprise landing → org login o Calendly.

---

## A.8 — CSP Update en vercel.json

**Archivo:** `apps/web/vercel.json`

Las rutas `/org/*` hacen fetch a Supabase (`https://*.supabase.co`) y a APIs internas.
El CSP actual cubre esto con `'self'` + `https://*.supabase.co`.

**`enterprise.eva-app.cl` en `'self'`:** Cuando el request viene de `enterprise.eva-app.cl`,
`'self'` = `enterprise.eva-app.cl`. Todas las llamadas a la misma app (Next.js API routes,
server actions) son bajo el mismo origen — OK.

**Adición requerida:** Si la landing enterprise carga assets de `eva-app.cl` (imágenes, fonts):
```
img-src 'self' data: https: blob: https://eva-app.cl
```

**Revisar en browser DevTools** después del deploy que no haya errores CSP.

---

## A.9 — E2E Tests: Enterprise Subdomain

**Archivo:** `tests/enterprise/subdomain-routing.spec.ts` (nuevo)

```typescript
// Tests para verificar el routing de enterprise.eva-app.cl:
// 1. enterprise.eva-app.cl/ → muestra landing (no login)
// 2. enterprise.eva-app.cl/login → muestra org login form
// 3. eva-app.cl/org/* → redirect a enterprise.eva-app.cl/org/*
// 4. Login exitoso → lands en /org/[slug]/ dashboard
// 5. Sin auth → redirect a /org/login
// 6. Rate limit: 41+ POSTs a /org/login → 429
// 7. MFA: org_owner sin TOTP → redirect a setup-mfa
```

**Tests existentes a actualizar:**
- `tests/enterprise/journey-e2e.spec.ts` — agregar assertion de URL (enterprise subdomain)
- `tests/enterprise/org-user-auth.spec.ts` — verificar cookie domain isolation

---

## Orden de Ejecución

```
1. [SECURITY CRITICAL] A.1 — Rate limit /org/login + reordenar middleware
2. A.2 — Middleware routing changes (enterprise root → landing)
3. A.3 — Enterprise landing page (crear archivos)
4. A.5 — Verificar post-login redirect flow
5. A.6 — Env vars (next.config + MANUAL_TASKS update)
6. A.7 — Main landing CTA update
7. A.8 — CSP review
8. A.9 — E2E tests
```

---

## Verificación End-to-End

```bash
# Local dev
npm run dev

# Para testear enterprise en local (agregar en C:\Windows\System32\drivers\etc\hosts):
# 127.0.0.1 enterprise.localhost

# 1. Rate limit test
for i in {1..42}; do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://enterprise.eva-app.cl/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'; done
# → últimas respuestas deben ser 429

# 2. Landing test
curl -I https://enterprise.eva-app.cl/
# → HTTP 200 (no 302)

# 3. Subdomain protection test
curl -I https://eva-app.cl/org/some-org
# → HTTP 302 Location: https://enterprise.eva-app.cl/org/some-org

# 4. E2E Playwright
npx playwright test tests/enterprise/ --workers=1

# 5. TypeCheck
npm run typecheck

# 6. Browser manual test
# - enterprise.eva-app.cl → landing amber
# - enterprise.eva-app.cl/login → org login form
# - enterprise.eva-app.cl/[slug] → org dashboard (si auth)
# - eva-app.cl/org/anything → redirect a enterprise
```

---

## Notas por Rol

**Security Engineer:**
- Rate limit en /org/login es BLOQUEANTE antes de deploy. No negociable.
- Cookie isolation decision documentada en CLAUDE.md.
- CSRF risk por shared cookies evitado con decisión de aislamiento.

**DevOps:**
- NEXT_PUBLIC_ENTERPRISE_URL en Vercel (prod + preview).
- Verificar TLS válido para enterprise.eva-app.cl (Vercel lo gestiona automático).
- HSTS ya cubre subdominos (includeSubDomains activo).

**Product Manager:**
- Sin enterprise landing, no hay funnel. Este plan es prerequisito para cualquier demo.
- La landing debe tener OG tags para compartir por Slack/LinkedIn.

**Head of Sales:**
- Demo CTA en landing principal ahora va a enterprise.eva-app.cl primero.
- Calendly como CTA secundario en la enterprise landing también.

**Legal:**
- Footer de enterprise landing incluye links a Aviso Legal, Privacidad, Contrato Enterprise.
- Texts de pricing en landing deben coincidir con los del Contrato Enterprise.

**Frontend Engineer:**
- Enterprise landing es un `page.tsx` nuevo bajo `/enterprise/`.
- No hereda el layout del root layout — tiene su propio `layout.tsx`.
- Dark/amber design: usar clases Tailwind `amber-400`, `amber-500`. Background `bg-background` (dark).

**QA:**
- Correr toda la suite enterprise después de cambios: `npx playwright test tests/enterprise/`.
- Especialmente `rls-isolation.spec.ts` — asegurar que RLS no se rompió con cambios de middleware.
