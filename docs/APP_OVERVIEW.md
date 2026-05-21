# EVA — Visión General de la App

## ¿Qué es EVA?

EVA es un SaaS B2B2C white-label para coaches de fitness. Un coach se registra, obtiene su propia app de marca (subdominio/slug), y sus clientes la usan como si fuera la app del coach. La capa enterprise (v2) agrega organizaciones (gimnasios/academias) que agrupan múltiples coaches bajo una misma entidad.

**Modelo de negocio:**
- Coaches pagan suscripción mensual (MercadoPago, pre-aprobaciones)
- Orgs pagan manualmente (transferencia o link MP)
- Free tier disponible con funcionalidad limitada (sin white-label)

---

## Los 4 Mundos de la App

```
                        ┌─────────────────────────────────┐
                        │         Internet / Users         │
                        └──────────────┬──────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                         │
    ┌─────────▼──────────┐  ┌──────────▼──────────┐  ┌─────────▼──────────┐
    │  /coach/*          │  │  /c/[slug]/*         │  │  /admin/*          │
    │  Dashboard Coach   │  │  App White-Label     │  │  Panel Interno     │
    │  (el profesional)  │  │  (el cliente final)  │  │  (CEO/ops)         │
    └────────────────────┘  └─────────────────────┘  └────────────────────┘
                                                       ┌────────────────────┐
                                                       │  /org/[slug]/*     │
                                                       │  Panel Enterprise  │
                                                       │  (dueño de org)    │
                                                       └────────────────────┘
```

---

## Flujo Completo de Navegación

### 1. Usuario nuevo (Coach)

```
/ (landing)
  └─► /register  ──► email de confirmación
        │
        ▼ (confirma email)
      /coach/onboarding/complete   (solo si vino por OAuth sin registro previo)
        │
        ▼
      /coach/dashboard             ← home del coach
```

Si el coach viene de un link de org:
```
/register
  └─► /org/[slug]/onboarding  ──► /org/[slug]/  (dashboard de org)
```

---

### 2. Coach autenticado — flujo interno

```
/login
  └─► resolvePostLoginRedirect()
        ├─► /coach/dashboard        (coach sin org)
        └─► /org/[slug]/            (coach con org membership)
```

**Middleware checks (en orden) para /coach/*:**
1. ¿Tiene sesión? → No: `/login`
2. ¿Tiene registro en tabla coaches? → No: `/coach/onboarding/complete`
3. ¿Email pendiente de verificación? → Sí: `/verify-email`
4. ¿Suscripción vencida/cancelada? → Sí: `/coach/reactivate`
5. ¿Intenta entrar a /subscription siendo org_managed? → Bloqueado
6. ✅ Acceso permitido

---

### 3. Cliente final — flujo white-label

```
/c/[coach_slug]/login   (branded con colores del coach)
  └─► middleware valida:
        ├─► ¿coach_slug existe? (o invite code de 5 chars) → No: 404
        ├─► ¿usuario es cliente de este coach? → No: 403
        ├─► force_password_change? → Sí: /c/[slug]/change-password
        ├─► !onboarding_completed? → Sí: /c/[slug]/onboarding
        ├─► is_archived || !is_active? → Sí: /c/[slug]/suspended
        └─► ✅ /c/[slug]/dashboard
```

---

### 4. Admin interno

```
/admin/login
  └─► valida email en ADMIN_EMAILS env var
        └─► /admin/(panel)/dashboard
```

---

### 5. Enterprise Org

```
enterprise.eva-app.cl  →  rewrite a /org/*
  └─► /org/[slug]/onboarding  (setup inicial)
        └─► /org/[slug]/      (dashboard org)
              ├─► /org/[slug]/coaches
              ├─► /org/[slug]/clients
              └─► /org/[slug]/settings
```

---

## Estructura de Páginas Detallada

### Páginas Públicas
| Ruta | Descripción |
|------|-------------|
| `/` | Landing page. Si autenticado, redirige al dashboard correcto |
| `/pricing` | Planes y precios |
| `/legal` | Términos y condiciones |
| `/privacidad` | Política de privacidad |

### Auth de Coach
| Ruta | Descripción |
|------|-------------|
| `/login` | Login para coaches |
| `/register` | Registro free tier (con kill switch en Edge Config) |
| `/registro-beta` | Variante beta del registro |
| `/forgot-password` | Recuperar contraseña |
| `/reset-password` | Nueva contraseña (desde link email) |
| `/verify-email` | Pantalla de espera verificación email |

### Dashboard Coach `/coach/*`
| Ruta | Descripción |
|------|-------------|
| `/coach/dashboard` | Home post-login: stats de clientes, novedades |
| `/coach/clients` | Lista de clientes del coach |
| `/coach/clients/[clientId]` | Perfil individual del cliente |
| `/coach/builder/[clientId]` | Asignador de rutinas al cliente |
| `/coach/workout-programs` | Biblioteca de programas/templates |
| `/coach/workout-programs/builder` | Constructor de programas drag-and-drop |
| `/coach/exercises` | Biblioteca de ejercicios (CRUD) |
| `/coach/nutrition-plans` | Lista de planes nutricionales |
| `/coach/nutrition-plans/new` | Crear plan nutricional |
| `/coach/nutrition-plans/[id]/edit` | Editar template nutricional |
| `/coach/nutrition-plans/client/[clientId]` | Plan nutricional de un cliente específico |
| `/coach/nutrition-builder/[clientId]` | Constructor de plan nutricional por cliente |
| `/coach/foods` | Biblioteca de alimentos |
| `/coach/meal-groups` | Grupos de comidas |
| `/coach/recipes` | Recetario |
| `/coach/recipes/[recipeId]` | Detalle de receta |
| `/coach/settings` | Perfil, branding, colores, logo |
| `/coach/settings/preview` | Preview de cómo ve el cliente la app |
| `/coach/subscription` | Gestión de suscripción (bloqueado si org_managed) |
| `/coach/subscription/processing` | Pantalla de procesando pago |
| `/coach/support` | Soporte / ayuda |
| `/coach/reactivate` | Reactivar suscripción vencida |
| `/coach/onboarding/complete` | Completar registro (post-OAuth sin coaches record) |

### App Cliente White-Label `/c/[coach_slug]/*`
| Ruta | Descripción |
|------|-------------|
| `/c/[slug]/login` | Login branded del coach |
| `/c/[slug]/dashboard` | Home del cliente: rutina activa, nutrición, compliance |
| `/c/[slug]/workout/[planId]` | Ejecución de rutina activa |
| `/c/[slug]/workout-history` | Historial de entrenamientos |
| `/c/[slug]/nutrition` | Plan nutricional actual |
| `/c/[slug]/exercises` | Biblioteca de ejercicios (vista cliente) |
| `/c/[slug]/check-in` | Formulario de check-in semanal |
| `/c/[slug]/onboarding` | Formulario de intake (forzado en primer login) |
| `/c/[slug]/change-password` | Cambio de contraseña (forzado si flag activo) |
| `/c/[slug]/suspended` | Pantalla de cuenta suspendida/archivada |
| `/c/[slug]/manifest.webmanifest` | Manifest PWA con branding del coach |

### Admin Panel `/admin/*`
| Ruta | Descripción |
|------|-------------|
| `/admin/login` | Login admin (solo ADMIN_EMAILS) |
| `/admin/(panel)/dashboard` | KPIs globales, gráficos, actividad reciente |
| `/admin/(panel)/coaches` | CRUD coaches, bulk ops, export CSV |
| `/admin/(panel)/clients` | CRUD clientes de todos los coaches |
| `/admin/(panel)/orgs` | Lista de organizaciones enterprise |
| `/admin/(panel)/finanzas` | Revenue, transacciones, KPIs financieros |
| `/admin/(panel)/novedades` | Crear/editar novedades que ven los coaches |
| `/admin/(panel)/auditoria` | Logs de auditoría con export |
| `/admin/(panel)/sistema` | Health del sistema, configuración |
| `/admin/(panel)/personal` | Gastos personales del admin |

### Enterprise Org `/org/[slug]/*`
| Ruta | Descripción |
|------|-------------|
| `/org/[slug]/` | Dashboard de la organización |
| `/org/[slug]/coaches` | Coaches miembros de la org |
| `/org/[slug]/clients` | Pool de clientes de la org |
| `/org/[slug]/settings` | Config de org: branding, billing, roles |
| `/org/[slug]/onboarding` | Wizard de setup inicial de org |

---

## Cómo se Conectan los Actores

```
Admin (EVA)
  │
  ├── crea/gestiona Orgs
  │
  └── publica Novedades → aparecen en /coach/dashboard

Org Owner / Admin
  │
  ├── invita Coaches → JWT claims: org_id, org_role
  │
  └── ve todos los Clientes del pool

Coach
  │
  ├── crea Clientes (con invite code o directo)
  ├── asigna Programas de Entrenamiento
  ├── asigna Planes Nutricionales
  ├── personaliza su App (colores, logo, nombre)
  │
  └── ve: compliance scores, check-ins, historial

Cliente
  │
  ├── accede SOLO a /c/[coach_slug]/*
  ├── ejecuta rutinas asignadas
  ├── registra comidas del plan
  └── hace check-in semanal
```

---

## Datos Clave por Zona

| Zona | Autenticación | Autorización |
|------|--------------|-------------|
| `/coach/*` | Supabase Auth (email/OAuth) | coaches table record |
| `/c/[slug]/*` | Supabase Auth | clients table + coach assignment |
| `/org/[slug]/*` | Supabase Auth | JWT claim `org_id` + `org_role` |
| `/admin/*` | Supabase Auth | Email en `ADMIN_EMAILS` env var |

---

## APIs y Integraciones

| Servicio | Para qué |
|----------|---------|
| Supabase (PostgreSQL + RLS) | Base de datos, auth, storage |
| MercadoPago | Suscripciones coaches (pre-aprobaciones recurrentes) |
| Resend | Emails transaccionales + drip marketing |
| Web Push (VAPID) | Notificaciones push a clientes |
| Upstash Redis | Rate limiting en edge |
| Edamam | Búsqueda de recetas con info nutricional |
| Vercel Edge Config | Kill switch registro / feature flags |
| PostHog | Analytics de producto |

---

## Stack Técnico Resumido

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router), React 19 |
| Styling | Tailwind CSS v4 (`@theme` en CSS) |
| UI | shadcn/ui + Radix + @base-ui/react |
| Forms | react-hook-form + Zod v4 |
| DB | Supabase (PostgreSQL + RLS en todas las tablas) |
| Mobile | Expo SDK 53 + Expo Router v4 + NativeWind v4 |
| Deploy | Vercel (web) |
| Monorepo | Turborepo (`apps/web`, `apps/mobile`) |
