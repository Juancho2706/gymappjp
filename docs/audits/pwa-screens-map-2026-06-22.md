# Mapa de pantallas PWA — Coach + Alumno

> Auditoría 2026-06-22. Fuente: rutas `page.tsx` en `apps/web/src/app` + verificación de
> `href` / `router.push` / `redirect` reales en código (no inferido). Nav backbone:
> `components/coach/coach-nav.ts` (coach) y `components/client/ClientNav.tsx` (alumno).

## Resumen

| Modo | Rutas | UI real | Redirects/gates |
|------|-------|---------|-----------------|
| **Coach** (`/coach/*`) | **42** | 37 | 5 |
| **Alumno** (`/c/[coach_slug]/*`) | **13** | 12 | 1 (raíz) |
| **Entrada compartida** (auth) | **8** | 7 | 1 (`/auth/exchange`) |
| **Total núcleo PWA** | **63** | — | — |

- **Redirects coach** (rutas vivas sin UI propia): `/coach/templates`→programas ·
  `/coach/recipes`→foods · `/coach/nutrition-builder/[clientId]`→plan alumno ·
  `/coach/settings/preview`→brand · `/coach/nutrition-plans/exchanges`→gate del hub.
- **Módulos de pago** (visibles solo con entitlement ON): Cardio · Movimiento ·
  Composición corporal · Intercambios de nutrición.
- **Mismo árbol alumno, 3 fachadas:** `/c/[coach_slug]` (standalone) se reescribe vía proxy a
  `/e/[org_slug]` (enterprise) y `/t/[team_slug]` (team) — mismas pantallas, distinto `basePath`.
  `/t/` agrega `consent` + `perfil`; `/e/` agrega `login`. No contadas en el núcleo coach/alumno.
- **Fuera de scope:** `/admin/*` (16), `/org/[slug]/*` enterprise admin (~22), landing/marketing
  (`pricing`, `enterprise`, `legal`, `privacidad`).

---

## Inventario — Modo COACH (`/coach/*`)

### Dashboard + Alumnos

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/coach/dashboard` | Panel de Control | Resumen ejecutivo: KPIs, alumnos en riesgo, agenda, actividad | clients · workout-programs · nutrition-plans/new · settings · settings/brand · subscription · clients?filter=risk |
| `/coach/clients` | Directorio de Alumnos | Lista de alumnos con filtros y búsqueda | clients/[clientId] |
| `/coach/clients/[clientId]` | **Perfil del Alumno** (hub) | Panel completo: overview, progreso, análisis, plan, nutrición, facturación | builder/[clientId] · nutrition-plans/client/[clientId] · cardio/[clientId] · movement/[clientId] · clients/[clientId]/bodycomp · clients/[clientId]/progress-print · clients |
| `/coach/clients/[clientId]/bodycomp` | Composición Corporal | Análisis BIA + ISAK del alumno · módulo `body_composition` | — |
| `/coach/clients/[clientId]/progress-print` | Exportar PDF Progreso | Reporte imprimible del progreso | — |
| `/coach/clients/import` | Importar Alumnos | Asistente importación CSV · gate por tier | clients · subscription |
| `/coach/builder/[clientId]` | Planificador Semanal | Editor visual del plan de entreno semanal | clients · clients/[clientId] · templates · settings/areas |

### Entrenamiento

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/coach/workout-programs` | Programas | Plantillas de entreno + programas asignados | workout-programs/builder · exercises · settings/areas · builder/[clientId] |
| `/coach/workout-programs/builder` | Constructor de Plantilla | Diseña/edita plantillas semanales | — |
| `/coach/exercises` | Catálogo de Ejercicios | Catálogo global + personalizado | — |
| `/coach/templates` | (redirect) | → `/coach/workout-programs` | workout-programs |
| `/coach/cardio` | Cardio | Calculadora zonas FC, pace, intervalos · módulo `cardio` | cardio/[clientId] |
| `/coach/cardio/[clientId]` | Perfil Cardio del Alumno | Perfil cardio personalizado · módulo `cardio` | cardio |
| `/coach/movement` | Screening de Movimiento | Hub: lista alumnos + acceso a evaluaciones · módulo `movement_assessment` | movement/[clientId] · movement/[clientId]/new |
| `/coach/movement/[clientId]` | Reporte de Movimiento | Reporte final, evolución, historial · módulo `movement_assessment` | movement · movement/[clientId]/new · movement/[clientId]/print |
| `/coach/movement/[clientId]/new` | Evaluador de Movimiento | Wizard 7 patrones de movimiento · módulo `movement_assessment` | movement/[clientId] |
| `/coach/movement/[clientId]/print` | Impresión Reporte Movimiento | PDF del screening | — |

### Nutrición

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/coach/nutrition-plans` | Centro de Nutrición | Hub: plantillas, asignar planes, alimentos, recetas | nutrition-plans/new · nutrition-plans/[templateId]/edit · nutrition-plans/client/[clientId] · subscription?upgrade=pro |
| `/coach/nutrition-plans/new` | Nueva Plantilla | Crear plantilla desde cero o de org | nutrition-plans |
| `/coach/nutrition-plans/[templateId]/edit` | Editar Plantilla | Modifica plantilla existente | nutrition-plans |
| `/coach/nutrition-plans/client/[clientId]` | **Plan Nutricional del Alumno** | Editor del plan del alumno + adherencia + intercambios | nutrition-plans · clients/[clientId] |
| `/coach/nutrition-plans/exchanges` | Intercambios (gate) | Puerta al módulo intercambios · módulo `nutrition_exchanges` | nutrition-plans |
| `/coach/nutrition-builder/[clientId]` | (redirect legacy) | → plan del alumno | nutrition-plans/client/[clientId] |
| `/coach/foods` | Catálogo de Alimentos | Alimentos global + personalizados | dashboard · nutrition-plans |
| `/coach/meal-groups` | Grupos de Alimentos | Plantillas de grupos reutilizables | dashboard |
| `/coach/recipes` | (redirect legacy) | → `/coach/foods` | foods |
| `/coach/recipes/[recipeId]` | Detalle de Receta | Ingredientes, instrucciones, macros | recipes |

### Opciones, Suscripción, Equipo, Soporte

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/coach/settings` | Opciones (hub) | Marca, suscripción, módulos, funciones — context-aware | team · settings/brand · settings/modules · settings/funciones · subscription |
| `/coach/settings/brand` | Mi Marca | Logo, colores, nombre, mensajes app alumno · Starter+ | settings |
| `/coach/settings/preview` | (redirect) | → vista previa integrada en brand | settings/brand |
| `/coach/settings/modules` | Módulos | Módulos según suscripción | settings · team · subscription |
| `/coach/settings/funciones` | Funciones | Config de funcionalidades de nutrición | settings · team |
| `/coach/settings/areas` | Áreas del builder | Editar áreas (Movilidad, Core…) de los días | workout-programs |
| `/coach/subscription` | Mi Suscripción | Plan base, ciclo, add-ons, tarjeta, cancelación | settings · subscription/update-card · reactivate |
| `/coach/subscription/update-card` | Cambiar Tarjeta | Actualiza tarjeta sin cambiar plan | subscription |
| `/coach/subscription/processing` | Procesando Suscripción | Confirmación en vivo del pago/upgrade | subscription · reactivate · dashboard |
| `/coach/subscription/upgrade-processing` | Procesando Upgrade | Confirmación en vivo del upgrade | subscription |
| `/coach/subscription/addon-processing` | Procesando Add-on | Confirmación en vivo del pago de módulo | subscription |
| `/coach/reactivate` | Reactivar Suscripción | Reactivar cancelada (tier, ciclo, add-ons) | clients |
| `/coach/team` | Mi Equipo | Pool de coaches: marca, miembros, cupos, módulos · `coach_team` | settings/modules |
| `/coach/support` | Centro de Ayuda | Formulario de contacto | — |
| `/coach/onboarding/complete` | Completar Onboarding | Nombre + perfil final del coach | — |

> ⚠ **Suscripción bloqueada:** `getVisibleNavItems` (coach-nav.ts) colapsa TODO el nav a un único
> item "Reactivar" (`/coach/reactivate`); el resto de pantallas quedan ocultas del menú.

---

## Inventario — Modo ALUMNO (`/c/[coach_slug]/*`)

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/c/[coach_slug]` | Raíz | Redirige según auth | dashboard · login |
| `/c/[coach_slug]/login` | Ingreso | Login alumno email + password | change-password · dashboard |
| `/c/[coach_slug]/change-password` | Crear Contraseña | Gate de primer acceso | dashboard |
| `/c/[coach_slug]/onboarding` | Completar Perfil | Datos personales + medidas | dashboard |
| `/c/[coach_slug]/dashboard` | **Panel de Control** (hub) | Programas, entrenos, nutrición, anillos de adherencia, actividad | workout/[planId] · nutrition · check-in · workout-history |
| `/c/[coach_slug]/nutrition` | Plan Alimenticio | Plan diario: macros, log de comidas, adherencia | dashboard |
| `/c/[coach_slug]/exercises` | Aprender Técnica | Catálogo por grupo muscular con videos | — |
| `/c/[coach_slug]/check-in` | Check-in Mensual | Peso, fotos, nivel de energía | dashboard |
| `/c/[coach_slug]/movimiento` | Screening de Movimiento | Resultados (read-only) · módulo movimiento | — |
| `/c/[coach_slug]/bodycomp` | Composición Corporal | Medidas (read-only) · módulo bodycomp | — |
| `/c/[coach_slug]/workout/[planId]` | Rutina | Ejecución: log de ejercicios/series (oculta el nav) | dashboard |
| `/c/[coach_slug]/workout-history` | Historial de Entrenos | Entrenos completados (90/180 días) | dashboard |
| `/c/[coach_slug]/suspended` | Acceso Pausado | Cuenta suspendida (dead-end) | — |

---

## Inventario — Entrada compartida (auth)

| Ruta | Pantalla | Propósito | Navega a |
|------|----------|-----------|----------|
| `/login` | Login de Coach | Auth del panel coach | forgot-password · register |
| `/register` | Registro de Coach | 3 pasos: datos, plan, resumen antes de pagar | login · legal · privacidad |
| `/forgot-password` | Recuperar Contraseña | Solicita link por email | login · t/[teamSlug]/login · c/[coachSlug]/login |
| `/reset-password` | Nueva Contraseña | Ingresa nueva password vía link | login · t/[teamSlug]/login · c/[coachSlug]/login |
| `/verify-email` | Verificación de Email | Confirma email para activar cuenta free | login |
| `/workspace/select` | Selección de Workspace | Selector cuando el usuario tiene varios contextos | — |
| `/auth/exchange` | Intercambio OAuth | Cambia código OAuth por sesión y redirige | login · register |
| `/join/[invite_code]` | Unirse por Invitación | Registro de alumno invitado, branding del coach | c/[coachSlug]/login · t/[teamSlug]/login |

---

## Esquema 1 — Flujo COACH

```
ENTRADA
  /login ──auth──► /workspace/select* ──► /coach/dashboard      (*solo si multi-workspace)
  /register ─► (pago/pricing) ─► /verify-email ─► /coach/onboarding/complete ─► /coach/dashboard
  /forgot-password ─► /reset-password ─► /login

NAV PRINCIPAL (sidebar desktop / bottom bar mobile — coach-nav.ts)
  Inicio · Alumnos · Programas · Nutrición · [Equipo*] · Opciones · Soporte · [Cardio**] · [Movimiento**]
  (*solo coach_team   **solo si módulo comprado)

 /coach/dashboard ─ Panel de Control (hub)
   ├─► /coach/clients              (y /coach/clients?filter=risk)
   ├─► /coach/workout-programs
   ├─► /coach/nutrition-plans/new
   ├─► /coach/settings  ·  /coach/settings/brand
   └─► /coach/subscription

 /coach/clients ─ Directorio de Alumnos
   └─► /coach/clients/[clientId] ─ PERFIL DEL ALUMNO (hub del alumno, tabs)
         ├─► /coach/builder/[clientId] .............. Planificador semanal (entreno)
         ├─► /coach/nutrition-plans/client/[clientId]  Plan nutricional del alumno
         ├─► /coach/cardio/[clientId] .............. (módulo cardio)
         ├─► /coach/movement/[clientId] ........... (módulo movimiento)
         ├─► /coach/clients/[clientId]/bodycomp ... Composición (módulo bodycomp)
         └─► /coach/clients/[clientId]/progress-print  Export PDF
 /coach/clients/import ─ Importar CSV ──► /coach/clients

 /coach/workout-programs ─ Programas
   ├─► /coach/workout-programs/builder ... Constructor de plantilla
   ├─► /coach/exercises ................... Catálogo de ejercicios
   ├─► /coach/settings/areas ............. Áreas del builder
   └─► /coach/builder/[clientId] ......... (asignar a alumno)
 /coach/templates ──redirect──► /coach/workout-programs

 /coach/nutrition-plans ─ Centro de Nutrición
   ├─► /coach/nutrition-plans/new ............ Nueva plantilla
   ├─► /coach/nutrition-plans/[templateId]/edit  Editar plantilla
   ├─► /coach/nutrition-plans/client/[clientId]  Plan del alumno ◄─ (también desde Perfil)
   ├─► /coach/foods .......................... Catálogo de alimentos
   ├─► /coach/meal-groups .................... Grupos de alimentos
   └─► /coach/recipes/[recipeId] ............ Detalle de receta
 /coach/recipes ──redirect──► /coach/foods
 /coach/nutrition-builder/[clientId] ──redirect──► /coach/nutrition-plans/client/[clientId]
 /coach/nutrition-plans/exchanges ──gate (nutrition_exchanges)──► hub

 MÓDULOS PAGOS (entrada propia en nav)
   /coach/cardio ──► /coach/cardio/[clientId]
   /coach/movement ──► /coach/movement/[clientId] ──► .../new (evaluar) · .../print (PDF)

 /coach/settings ─ Opciones (hub)
   ├─► /coach/settings/brand ..... Mi Marca   (·/preview ──redirect──► brand)
   ├─► /coach/settings/modules ... Módulos
   ├─► /coach/settings/funciones . Funciones
   ├─► /coach/settings/areas ..... Áreas
   ├─► /coach/team .............. Mi Equipo (coach_team)
   └─► /coach/subscription ...... Mi Suscripción
         ├─► /coach/subscription/update-card ....... Cambiar tarjeta
         ├─► /coach/subscription/processing ........ Procesando pago
         ├─► /coach/subscription/upgrade-processing  Procesando upgrade
         ├─► /coach/subscription/addon-processing .. Procesando add-on
         └─► /coach/reactivate .................... Reactivar

 /coach/support ─ Centro de Ayuda (hoja)

 ⚠ /coach/reactivate ─ si suscripción BLOQUEADA, el nav colapsa a un solo item "Reactivar".
```

## Esquema 2 — Flujo ALUMNO (`/c/[coach_slug]/*`)

```
ENTRADA
  /c/[slug] (raíz) ──► auth? dashboard : login
  /join/[invite_code] ─► /c/[slug]/login
  /c/[slug]/login ─► /c/[slug]/change-password (primer ingreso) ─► dashboard
  /c/[slug]/onboarding ─► /c/[slug]/dashboard

NAV PRINCIPAL (bottom bar mobile / sidebar desktop — ClientNav.tsx)
  Inicio · [Plan Alimenticio*] · Aprender · Check-in · [Movimiento**] · [Composición**]
  (*si showNutrition   **si módulo asignado al alumno · tope 6 items)

 /c/[slug]/dashboard ─ Panel de control (hub)
   ├─► /c/[slug]/workout/[planId] ... Ejecutar rutina (oculta el nav)
   ├─► /c/[slug]/nutrition .......... Plan alimenticio (log + adherencia)
   ├─► /c/[slug]/check-in ........... Check-in mensual (peso/fotos)
   └─► /c/[slug]/workout-history .... Historial de entrenos
 Tabs directos del nav (sin pasar por dashboard):
   /c/[slug]/exercises ....... Aprender técnica (videos)
   /c/[slug]/movimiento ...... Screening (read-only, módulo)
   /c/[slug]/bodycomp ........ Composición (read-only, módulo)

 Estados terminales:
   /c/[slug]/suspended ....... Acceso pausado (dead-end)
   /c/[slug]/change-password . Gate de primer acceso
```
