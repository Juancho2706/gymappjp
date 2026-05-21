# Plan: Dirección clara — jueves y más allá

## Contexto
El usuario tiene tres apps simultáneas en `v2/enterprise` y siente que no sabe qué tiene ni por dónde ir. Hay un deadline el jueves (propuesta a gym con 30+ coaches) y presión paralela de builds de mobile. El objetivo es dar inventario real del estado y un orden de prioridades ejecutable.

---

## Inventario real de lo que ya existe

### ✅ EVA Web (apps/web) — COMPLETA
La app web standalone para coaches y alumnos ya está construida:
- Coach dashboard completo: clientes, builder, exercises, foods, nutrición, templates, programas, settings, suscripción
- Alumno white-label per coach: `/c/[slug]/*` con branding (logo, color, nombre) inyectado via middleware
- Admin panel
- Landing con sección enterprise
- Sistema de branding dinámico ya construido: `primary_color`, `logo_url`, `brand_name` por coach/org
- Subdominio `enterprise.eva-app.cl` → rewrites a `/org/*`
- **Esto ya ES la demo enterprise**

### 🟡 EVA Mobile (apps/mobile) — ~75% DONE
- Role selector, auth (login/forgot/reset-password)
- Alumno: 4 tabs (workout, nutrición, check-in, perfil) + pantalla de código de invitación
- Coach: 5 tabs (clientes, builder, nutrición, check-ins, perfil) + detalle de cliente
- Offline cache, push notifications, branding dinámico por coach
- **Estado actual**: Android buildeado (no satisfactorio visualmente), iOS en proceso hoy

### 🟠 EVA Enterprise Mobile (apps/enterprise) — ~65% DONE
- Auth con validación de org admin
- 4 tabs: Dashboard (stats), Coaches (lista + detalle), Clientes, Configuración
- OrgContext + lib/org-admin.ts con todas las queries
- Reasignación de clientes, gestión de coaches, invites
- **Estado**: Funcional estructuralmente, no se ha tocado theming/branding enterprise
- **No se ha buildeado aún**

### ✅ Supabase Schema — ~85% MADURO
- Multi-tenant: tabla `organizations` con `logo_url`, `primary_color`, `slug`
- RBAC: org_owner / org_admin / coach
- Invite flow con token hash
- Audit logs, invoicing tables
- RLS completo
- Seeds con datos de prueba
- **Limitación**: Solo corre local en la PC del usuario

---

## Problema inmediato: el jueves

**Lo que necesitan ver**: flujo enterprise con branding del gym → coach accede → alumno ve white-label

**La verdad**: El web ya hace todo esto. No hace falta tocar mobile para la propuesta.

### Situación real: Supabase es local, demo necesita estar online

La solución más rápida y sin costos es un **Cloudflare Tunnel** — expone tu localhost con una URL pública estable. La app corre en tu laptop, el gym abre el link desde donde sea.

### Plan para el jueves (3–4 horas de trabajo total)

#### Paso 1: Ya tienes el logo y color — subir el logo
- Subir el logo a algún hosting de imagen: Cloudinary free, GitHub raw, o incluso un bucket de Supabase Storage en la instancia local
- Guardar la URL del logo

#### Paso 2: Crear los datos del gym en la DB local
```sql
-- Ejecutar en Supabase Studio local (localhost:54323)

-- 1. Crear la org con su branding
INSERT INTO organizations (id, name, slug, logo_url, primary_color, plan, status, seats_included)
VALUES (
  gen_random_uuid(),
  'NombreDelGym',          -- nombre real del gym
  'nombre-del-gym',        -- slug (sin espacios, minúsculas)
  'https://URL_DEL_LOGO',  -- logo que ya tienes
  '#HEXCOLOR',             -- color del gym que ya tienes
  'enterprise',
  'active',
  35                       -- 30 coaches + margen
);

-- 2. Crear 2-3 coaches demo (en auth.users primero, luego en coaches)
-- 3. Crear 3-4 alumnos demo asignados a esos coaches
-- (Usar el patrón del seed.sql que ya existe como referencia)
```

#### Paso 3: Levantar Cloudflare Tunnel
```bash
# Instalar si no tienes:
# curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
# chmod +x cloudflared

# Levantar:
supabase start                              # DB local
cd apps/web && npm run build && npm start   # web en prod mode

cloudflared tunnel --url http://localhost:3000
# → te da una URL tipo: https://abc-def.trycloudflare.com
```

#### Paso 4: Flujo de la demo (guión de 10 minutos)
1. **Vista org admin** (`/org/nombre-del-gym`) → ven su logo, sus coaches, pueden reasignar clientes
2. **Vista coach** (`/coach/dashboard`) → coach ve sus alumnos, builder de planes
3. **Vista alumno** (`/c/nombre-del-gym/dashboard`) → alumno ve la app con el logo y color del gym

**La demo no necesita mobile. La web ya es la demo completa.**
Si quieren ver mobile, el APK de Android ya existe y se muestra en el teléfono en paralelo.

---

## Orden de prioridades post-jueves

### Prioridad 1: iOS build funcional (hoy/mañana)
- Resolver los issues de entitlements de iOS (los commits de hoy ya apuntan a eso)
- Meta: TestFlight con una build que corra y muestre el flujo completo

### Prioridad 2: Polish visual de mobile EVA (coach/alumno)
- Identificar qué pantallas se ven "lejos de lo que quieres"
- Foco en las pantallas principales: index.tsx, coach/(tabs), alumno/(tabs)
- El sistema de branding ya está — es cuestión de UI/UX de los componentes

### Prioridad 3: Enterprise mobile (apps/enterprise) — después de cerrar el gym
- El código estructural ya existe
- Agregar branding org (ya está en OrgContext, conectar a UI)
- Buildear para TestFlight/Play Store

### Prioridad 4: Supabase cloud
- Evaluar borrar uno de los proyectos pausados o actualizar a plan pro
- Alternativa: Railway o Fly.io para Postgres + Supabase local tunnel para demo

---

## Archivos críticos por app

| App | Archivos clave |
|-----|---------------|
| Web branding | `apps/web/src/middleware.ts`, `apps/web/src/lib/brand-assets.ts` |
| Web coach | `apps/web/src/app/coach/`, `apps/web/src/components/coach/` |
| Web alumno | `apps/web/src/app/c/[coach_slug]/` |
| Mobile entry | `apps/mobile/app/index.tsx`, `apps/mobile/app/_layout.tsx` |
| Mobile lib | `apps/mobile/lib/branding.ts`, `apps/mobile/lib/theme.ts` |
| Enterprise mobile | `apps/enterprise/app/org/(tabs)/`, `apps/enterprise/lib/org-admin.ts` |
| DB schema | `supabase/migrations/` (especialmente `*enterprise_organizations*`, `*enterprise_rls*`) |
| DB seed | `supabase/seed.sql` |

---

## Verificación

- **Demo jueves**: Supabase local corre → org creada con branding del gym → los 3 flujos web funcionan via Cloudflare Tunnel
- **iOS**: Build sube a TestFlight sin crash en launch
- **Android**: APK corre el flujo completo coach + alumno
