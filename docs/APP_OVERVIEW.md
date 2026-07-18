# EVA App Overview

Ultima modificacion: 2026-05-21 18:25 -04:00

## Que es EVA

EVA es un SaaS B2B2C white-label para coaches fitness, personal trainers y gimnasios. El coach gestiona alumnos, entrenamiento, nutricion y progreso. El alumno usa una app con la marca del coach. La capa enterprise agrega organizaciones con varios coaches bajo un owner/admin.

## Actores

| Actor | Zona | Que hace |
|---|---|---|
| Visitante | `/`, `/pricing` | Conoce producto, precios y registro. |
| Coach | `/coach/*` | Gestiona clientes, programas, nutricion, marca y suscripcion. |
| Alumno | `/c/[coach_slug]/*` | Entrena, registra nutricion, check-in y progreso. |
| Org owner/admin | `/org/[slug]/*` | Gestiona coaches, clientes y configuracion enterprise. |
| Admin EVA | `/admin/*` | Opera plataforma, coaches, finanzas, auditoria y sistema. |

## Rutas principales

### Public/auth

- `/`
- `/pricing`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/legal`
- `/privacidad`

### Coach

- `/coach/dashboard`
- `/coach/clients`
- `/coach/clients/[clientId]`
- `/coach/builder/[clientId]`
- `/coach/workout-programs`
- `/coach/workout-programs/builder`
- `/coach/exercises`
- `/coach/foods`
- `/coach/meal-groups`
- `/coach/recipes`
- `/coach/nutrition-plans`
- `/coach/settings`
- `/coach/subscription`
- `/coach/support`
- `/coach/reactivate`

### Alumno white-label

- `/c/[coach_slug]/login`
- `/c/[coach_slug]/dashboard`
- `/c/[coach_slug]/workout/[planId]`
- `/c/[coach_slug]/workout-history`
- `/c/[coach_slug]/nutrition`
- `/c/[coach_slug]/check-in`
- `/c/[coach_slug]/exercises`
- `/c/[coach_slug]/onboarding`
- `/c/[coach_slug]/change-password`
- `/c/[coach_slug]/suspended`

### Enterprise

- `/org/login`
- `/org/[slug]`
- `/org/[slug]/coaches`
- `/org/[slug]/clients`
- `/org/[slug]/settings`
- `/org/[slug]/onboarding`

### Admin

- `/admin/login`
- `/admin/dashboard`
- `/admin/coaches`
- `/admin/clients`
- `/admin/orgs`
- `/admin/finanzas`
- `/admin/novedades`
- `/admin/auditoria`
- `/admin/sistema`
- `/admin/personal`

## Integraciones

| Servicio | Uso |
|---|---|
| Supabase | Auth, Postgres, RLS, Storage. |
| MercadoPago | Suscripciones de coaches. |
| Resend | Emails transaccionales. |
| Upstash Redis | Rate limiting. |
| Vercel | Deploy web. |
| Expo | App mobile. |
| PostHog | Analytics. |

## Fuentes relacionadas

- `architecture/FLOWS_AND_COMPONENTS.md`
- `testing/TEST_STATUS.md`
- `operations/LOCAL_WORKFLOW.md`
