# MANUAL_TASKS.md — Tareas que requieren acción tuya

> Sincronizado con `docs/status/CURRENT_PHASE.md` y `docs/plans/EXECUTION_PLAN.md`
> Actualizar `[ ]` → `[x]` cuando completes cada ítem.  
> Claude no puede hacer estas acciones: requieren credenciales, pagos, firmas o acceso a dashboards externos.

### Leyenda de repetición en producción

| Ícono | Significado |
|---|---|
| 🔁 **Repetir en prod** | Hacer de nuevo en Supabase/Vercel de producción al momento del deploy final |
| 1️⃣ **Solo una vez** | Configuración permanente, no se repite |
| ⏳ **Al deployar** | Hacer en el momento exacto del deploy, no antes |

---

## PRIORIDAD CRÍTICA — Desbloquean desarrollo activo

### MT-1 — Activar Auth Hook en Supabase Dashboard (local) · 🔁 Repetir en prod
**Bloquea:** JWT claims de `org_id`/`org_role` que usa `src/lib/coach-context.ts`

**Pasos:**
1. Abrir `http://127.0.0.1:54323` (Supabase Studio local)
2. Ir a **Authentication → Hooks**
3. Buscar "Custom Access Token Hook"
4. Activarlo y apuntar a la función: `public.custom_access_token_hook`
5. Guardar

**Verificación:** Hacer login como coach de una org → el JWT debe tener `app_metadata.org_id` en el payload. Verificar en Studio → Authentication → Users → token.

**En producción (⏳ al deployar):** Mismo proceso en [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto prod → Authentication → Hooks. La función `custom_access_token_hook` ya existirá porque se aplica via migration.

---

### MT-2 — Crear bucket `org-assets` en Supabase Storage (local) · 🔁 Repetir en prod
**Bloquea:** subida de logos de organización desde `/org/[slug]/settings`

**Pasos:**
1. Abrir `http://127.0.0.1:54323`
2. Ir a **Storage → New Bucket**
3. Nombre: `org-assets`
4. Marcar como **Public** (logos son públicos)
5. Max file size: `2 MB`
6. Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`
7. Crear

**En producción (⏳ al deployar):** Mismo proceso en Supabase Dashboard prod → Storage → New Bucket. Además correr este SQL en el SQL Editor de prod para las RLS policies del bucket (yo te lo preparo cuando llegue ese momento).

---

### MT-3 — Configurar env vars en Vercel · ⏳ Solo al deployar (no hacer antes)
**Bloquea:** Enterprise features en producción cuando llegue el momento de deploy

**Pasos:**
1. Ir a [vercel.com/dashboard](https://vercel.com/dashboard) → tu proyecto EVA
2. Settings → **Environment Variables**
3. **Agregar** (Environment: Production + Preview):
   - `ENTERPRISE_DOMAIN` = `enterprise.eva-app.cl`
   - `ADMIN_EMAILS` = `jvillegas.dev@gmail.com`
4. **Eliminar** estas vars obsoletas (si existen):
   - `DRIP_CRON_TOKEN`
   - `BETA_MONITOR_TOKEN`
   - `NEXT_PUBLIC_MP_PUBLIC_KEY`
   - `NEXT_PUBLIC_COACH_DASHBOARD_V2`
5. Guardar → Redeploy (solo necesario cuando hagamos el deploy final de v2)

---

## PRIORIDAD ALTA — Fase 3 (Legal + Sales)

### MT-4 — Firmar DPA con Vercel · 1️⃣ Solo una vez (ya queda firmado) ✅ **Hecho por KimiCode**
**Requerido por:** Ley 21.719 (Chile) — procesás datos de usuarios en Vercel

**Pasos:**
1. Ir a [vercel.com/legal/dpa](https://vercel.com/legal/dpa) o dentro de Vercel Dashboard → Settings → Legal
2. Buscar "Data Processing Addendum" o "DPA"
3. Completar el formulario con tus datos de empresa / persona natural
4. Firmar electrónicamente
5. Guardar copia del PDF firmado en Google Drive

---

### MT-5 — Firmar DPA con Supabase · 1️⃣ Solo una vez (ya queda firmado) ✅ **Hecho por KimiCode**
**Requerido por:** Ley 21.719 — Supabase procesa datos de tus usuarios

**Pasos:**
1. Ir a [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto de prod
2. Settings → **Legal** (o buscar "DPA" en la sección de settings)
3. Completar el formulario de DPA
4. Si no hay opción self-serve: enviar email a `legal@supabase.io` solicitando DPA
5. Guardar copia PDF en Google Drive

---

### MT-6 — Crear cuenta Calendly y configurar link de demo · 1️⃣ Solo una vez (link es permanente)
**Requerido por:** CTA "Agendar demo" en `LandingEnterpriseSection`

**Pasos:**
1. Ir a [calendly.com](https://calendly.com) → Sign Up gratis
2. Crear evento: **"Demo EVA Enterprise — 30 min"**
   - Duración: 30 minutos
   - Ubicación: Google Meet (activar integración)
   - Descripción: "Demo de EVA Enterprise para gyms y academias. Te mostraré el panel centralizado, gestión de coaches y pool de alumnos."
   - Disponibilidad: configura tus horarios reales
3. Copiar el link generado (ej: `calendly.com/jvillegas-dev/eva-enterprise-demo`)
4. Avisarme el link → yo lo inserto en `LandingEnterpriseSection.tsx` y en el wizard de onboarding

**✅ COMPLETADO — Link:** `https://calendly.com/contacto-eva-app/eva-enterprise`

---

### MT-7 — Crear template de contrato enterprise (Google Docs) · 1️⃣ Solo una vez
**Requerido por:** Fase 3 — venta a clientes enterprise

**Contenido mínimo del contrato (crear en Google Docs → guardar en Drive):**
1. Partes: EVA (tú, persona natural o empresa) + Gym/Academia
2. Objeto: acceso a plataforma EVA Enterprise por el término pactado
3. Precio: $XX.XXX/mes + IVA (detallar plan y seats incluidos)
4. Período de prueba: 30 días gratis sin tarjeta
5. Renovación: mensual automática via MercadoPago o transferencia
6. Datos: cláusula de procesamiento de datos acorde a Ley 21.719
7. Roles: EVA como encargado de tratamiento, Gym como responsable
8. Escalación: org_admin → EVA (WhatsApp). Coaches no contactan EVA directamente.
9. Terminación: aviso 30 días. Datos conservados 30 días post-término.
10. Firma: usar [FirmaFácil](https://www.firmafacil.cl/) (Chile, $0 plan básico) o firma escaneada

**Consejo:** Primeros 2 clientes pueden firmar un documento simple de 1 página. No necesitas abogado todavía — el riesgo es bajo en esta etapa.

---

### MT-8 — Actualizar ToS y Política de Privacidad · 1️⃣ Solo una vez (actualizar en prod directamente)
**Requerido por:** Ley 21.719 + nuevos features enterprise + menores

**Agregar a los documentos existentes:**
1. **Sección Enterprise:** definir roles (org_owner, org_admin, coach, alumno), responsabilidades
2. **Datos de menores:** política para alumnos menores de 14 años (requieren consentimiento de tutor)
3. **ARCO:** confirmar que `privacidad@eva-app.cl` está operativo y el proceso de respuesta (30 días por ley)
4. **DPA:** mencionar que EVA actúa como encargado de tratamiento para orgs enterprise
5. Publicar en producción (URL: `eva-app.cl/terminos` y `eva-app.cl/privacidad`)

**Herramienta sugerida:** Usar Iubenda (tiene plan básico gratuito) o editar los docs existentes manualmente.

---

### MT-9 — Crear Google Sheets "EVA Enterprise Pipeline" · 1️⃣ Solo una vez
**Requerido por:** Seguimiento de prospects y clientes enterprise (Fase 5)

**Pasos:**
1. Ir a [sheets.google.com](https://sheets.google.com) → nuevo documento
2. Nombre: **"EVA Enterprise Pipeline"**
3. Columnas mínimas:

| Gym/Academia | Contacto | Email | Teléfono | Canal | Status | Fecha demo | Fecha firma | Plan | Coaches | MRR | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|

4. Status options: `Prospecto → Demo agendada → Demo hecha → Contrato enviado → Trial → Pagando → Churned`
5. Compartir con tu email personal como backup

---

### MT-10 — Crear cuenta UptimeRobot y configurar monitores · 1️⃣ Solo una vez (monitores apuntan a prod directamente)
**Requerido por:** Alertas de disponibilidad en producción

**Pasos:**
1. Ir a [uptimerobot.com](https://uptimerobot.com) → Sign Up gratis
2. Crear los siguientes monitores (HTTP, intervalo 5 min):
   - `eva-app.cl` — landing principal
   - `enterprise.eva-app.cl` — subdominio enterprise (cuando esté live)
   - `eva-app.cl/api/health` — endpoint de health check (pendiente: crear este endpoint)
3. Configurar alertas: email `jvillegas.dev@gmail.com` + WhatsApp si el plan lo permite
4. Free tier: 50 monitores, 5-min intervals — suficiente

---

## PRIORIDAD MEDIA — Fase 6 (Mobile)

### MT-11 — Coordinar con Guimel: App Manager en App Store Connect · 1️⃣ Solo una vez
**Requerido por:** Publicar EVA en App Store (Guimel tiene la cuenta Apple Developer)

**Pasos:**
1. Contactar a Guimel
2. Pedirle que en App Store Connect → **Users and Access** → invite a tu Apple ID (`jvillegas.dev@gmail.com` o el que uses)
3. Role: **App Manager** (puede crear apps, subir builds, no puede ver financials ni cambiar plan)
4. Una vez invitado: aceptar la invitación en tu email
5. Verificar acceso: debes ver el proyecto en App Store Connect

**Importante:** El Team ID de Guimel es necesario para `eas.json` en Fase 6B. Una vez que tengas acceso, buscarlo en App Store Connect → Membership → Team ID.

---

### MT-12 — Registrar Bundle IDs en App Store Connect · 1️⃣ Solo una vez
**Requerido por:** Build de iOS con EAS (Fase 6B)

**Pasos (una vez tengas acceso como App Manager):**
1. App Store Connect → **Identifiers** → `+` (agregar)
2. Registrar:
   - `cl.evaapp.eva` — App principal (alumnos + coaches)
   - `cl.evaapp.eva-enterprise` — App Enterprise (solo si el plan lo contempla; puede omitirse si va en misma app)
3. Capabilities: Push Notifications, Associated Domains, Sign in with Apple (si aplica)
4. Crear una App en App Store Connect:
   - Bundle ID: `cl.evaapp.eva`
   - Nombre: "EVA - Entrenamiento Personalizado"
   - Primary Language: Spanish
   - SKU: `eva-fitness-cl-001`

---

### MT-13 — Google Play Developer account ($25 USD) · 1️⃣ Solo una vez (pago único)
**Estado:** EN ESPERA — esperar dinero la próxima semana

**Pasos (cuando tengas los $25):**
1. Ir a [play.google.com/console](https://play.google.com/console)
2. Crear cuenta: **Payment: $25 USD** (único, no recurrente) con tarjeta de crédito/débito
3. Verificar identidad (pueden pedir foto de cédula o pasaporte)
4. Crear nueva app:
   - Package name: `cl.evaapp.eva`
   - Nombre: "EVA - Entrenamiento Personalizado"
   - Default language: Spanish (Chile)
5. Completar la sección "App content" (rating, content policy)
6. Avísame cuando esté creada → yo configuro el resto de `eas.json`

---

### MT-14 — Crear cuenta Expo (EAS) para builds mobile · ✅ HECHO (2026-05-18)
**Cuenta:** `juandeveva` en expo.dev · Proyecto: `eva` · EAS Project ID: `a5f4f7c0-861c-48b1-9ed6-fc46e7843844`
**Pendiente:** Generar EXPO_TOKEN en expo.dev/settings/access-tokens → guardar como GitHub Secret `EXPO_TOKEN` para CI (`.github/workflows/mobile-build.yml`)

---

### MT-15 — Crear cuenta Sentry (crash reporting mobile) · ❌ DESCARTADO
**Decisión 2026-05-18:** Sentry tiene trial 2 semanas, luego es de pago. Sin presupuesto por ahora. Plugin de Sentry removido de `app.json`. Revisitar en v1.1 cuando haya revenue.

---

## PRIORIDAD BAJA — Ventas y operaciones (Fase 3/5)

### MT-16 — Crear one-pager PDF para ventas · 1️⃣ Solo una vez ✅ **Hecho por KimiCode**
**Requerido por:** Material de venta para prospectos enterprise

**Archivo generado:** `scripts/output/EVA-Enterprise-One-Pager.pdf`

**Contenido (1 página):**
- Logo EVA
- Título: "EVA Enterprise — Gestiona tu gym desde un solo lugar"
- 3 value props: Pool de alumnos compartido / Datos aislados por coach / Reportes de actividad
- Precios: Desde $49.990/mes (hasta 3 coaches) · +$9.990/mes por coach adicional · Precios + IVA
- CTA: Calendly link + `contacto@eva-app.cl`
- Al pie: Logo · `eva-app.cl` · `contacto@eva-app.cl`

**Exportar:** PDF para adjuntar en emails de prospección.

---

### MT-17 — Configurar FirmaFácil para contratos · 1️⃣ Solo una vez
**Requerido por:** Firma electrónica de contratos enterprise con valor legal en Chile

**Pasos:**
1. Ir a [firmafacil.cl](https://www.firmafacil.cl)
2. Crear cuenta (plan básico gratuito permite hasta 3 docs/mes)
3. Subir template del contrato (MT-7)
4. Para cada cliente: crear firma → enviar al email del representante → ellos firman → tú firmas → PDF firmado por ambas partes

---

### MT-18 — Crear subdominio enterprise (DNS) · ⏳ Al deployar
**Requerido por:** `enterprise.eva-app.cl` para app enterprise (Fase 6)

**Pasos (cuando llegues a Fase 6):**
1. Panel DNS de tu registrador (ej: GoDaddy, Cloudflare, etc.)
2. Agregar registro CNAME:
   - Nombre: `enterprise`
   - Valor: `cname.vercel-dns.com` (o el dominio de Vercel que te asignen)
3. En Vercel → tu proyecto → Settings → Domains → agregar `enterprise.eva-app.cl`
4. Esperar propagación DNS (5-30 min con Cloudflare, hasta 48h otros)

---

### MT-19 — Actualizar documentos legales al constituir empresa · 1️⃣ Cuando formen la sociedad
**Estado:** PENDIENTE — aplica cuando tú y tu socio constituyan la SpA/Ltda en Chile

**Por qué:** Los docs legales actuales (`docs/legal/tos.md`, `docs/legal/privacy-policy.md`, `docs/legal/enterprise-contract-template.md`) están redactados bajo Juan Villegas como persona natural / freelancer. Al constituir la sociedad, deben actualizarse con datos legales reales.

**Datos a reemplazar en los 3 archivos:**

| Campo | Valor actual (freelancer) | Reemplazar por |
|-------|--------------------------|----------------|
| Nombre responsable | "Juan Villegas" | Razón social (ej: "Antigravity SpA") |
| Tipo entidad | persona natural | SpA / Ltda / etc. |
| RUT | [RUT_JUAN_PERSONAL] | RUT empresa |
| Representante legal | Juan Villegas | Nombre representante legal designado |
| Domicilio | Chile (genérico) | Dirección legal registrada |

**Pasos:**
1. Constituir la sociedad (Notaría → CBR → SII)
2. Obtener RUT empresa en SII
3. Decirle a Claude los datos nuevos → él actualiza los 3 archivos y la landing
4. Actualizar contratos ya firmados con clientes enterprise (addendum o nuevo contrato)
5. Actualizar perfil en Supabase DPA y Vercel DPA con datos de empresa

---

## RECORDATORIO — Checklist rápida por sesión

Al inicio de cada sesión de desarrollo verificar:
- [ ] Docker Desktop abierto
- [ ] `npx supabase start` corriendo → Studio en `http://127.0.0.1:54323`
- [ ] Auth Hook activado en Studio (MT-1) ← hacer UNA VEZ
- [ ] Bucket `org-assets` creado (MT-2) ← hacer UNA VEZ

---

## PRIORIDAD ALTA — Fase 4 QA (manual)

### MT-20 — Correr regression tests Playwright · ⏳ Antes de mergear
**Requerido por:** Fase 4.4 — no mergear a master si algún test falla

**Pasos:**
1. Asegurarse: Docker + `npx supabase start` + `npm run dev` corriendo
2. `npx playwright test tests/coach/` — deben pasar todos
3. `npx playwright test tests/enterprise/` — nuevos tests enterprise
4. Si alguno falla → investigar antes de avanzar

---

### MT-21 — Verificar audit_logs sin policy UPDATE/DELETE · 1️⃣ Solo una vez
**Requerido por:** Fase 4.7 security checklist — `org_audit_logs` inmutables

**Pasos:**
1. Abrir `http://127.0.0.1:54323` → Table Editor → `org_audit_logs`
2. Ir a Authentication → Policies → `org_audit_logs`
3. Confirmar que NO hay policies de UPDATE o DELETE (solo SELECT e INSERT)
4. En producción: mismo verificación en Supabase Dashboard prod

---

### MT-22 — Verificar SUPABASE_SERVICE_ROLE_KEY solo en Production · 1️⃣ Antes de deploy
**Requerido por:** Fase 4.7 security — service role no debe estar en Preview

**Pasos:**
1. Vercel Dashboard → tu proyecto → Settings → Environment Variables
2. Buscar `SUPABASE_SERVICE_ROLE_KEY`
3. Asegurarse que el environment es SOLO "Production" (no "Preview" ni "Development")
4. Si está en Preview → editar → quitar el tick de Preview → Save

---

### MT-23 — Ejecutar playbook onboarding primer cliente enterprise · ⏳ Al tener primer cliente
**Requerido por:** Fase 5 — activar primera organización real

**Días clave:**
- D-7: Firma contrato (via MT-17 FirmaFácil)
- D-5: Cliente entrega slug, logo, color, emails coaches, CSV alumnos
- D-3: Crear org en local/staging, validar
- D-1: Confirmar con cliente
- D0 AM: Crear org en PROD (`/admin/orgs` → crear) + branding + invitar coaches
- D0 PM: Importar CSV + asignar alumnos + training 60 min
- D14: Calcular health score → actualizar `organizations.last_health_score`
- D30: Mini QBR (ver plantilla en `docs/plans/EXECUTION_PLAN.md` §5)

---

### MT-24 — Calcular y actualizar health score manualmente (D14) · 🔁 Por cliente
**Requerido por:** Upsell banner de "adopción baja" en dashboard org

**SQL a correr en Supabase Studio (ajustar IDs):**
```sql
UPDATE organizations SET
  last_health_score = (
    -- coaches_logged_7d / total_coaches * 35
    -- + clients_assigned / total_clients * 25
    -- + workouts_logged_7d / max(clients_assigned, 1) * 25
    -- + admin_logged_7d ? 15 : 0
    -- Calcular manualmente con los datos reales de la org
    75  -- reemplazar con score calculado
  ),
  last_health_score_at = now()
WHERE slug = 'tu-org-slug';
```

Fórmula completa en `docs/plans/EXECUTION_PLAN.md` §3.4.

---

---

## MT-25 — Variables de entorno en producción (Vercel + GitHub + EAS) · ⏳ Al deployar

> **Esta es la lista maestra.** MT-3 cubrió solo las vars enterprise. Acá están TODAS las que necesitas configurar cuando hagas el deploy final.
> Leer antes de hacer nada: `SUPABASE_SERVICE_ROLE_KEY` va SOLO en Production, nunca en Preview (ver MT-22).

### Dónde configurar

| Destino | URL |
|---------|-----|
| Vercel | [vercel.com/dashboard](https://vercel.com/dashboard) → tu proyecto → Settings → Environment Variables |
| GitHub Actions | github.com → tu repo → Settings → Secrets and variables → Actions |
| EAS (mobile) | archivo `apps/mobile/.env` (nunca se sube a git; lo seteas en EAS con `eas secret:push`) |

---

### A — Supabase (todas las environments: Production + Preview + Development)

| Variable | Valor en prod | Descripción |
|----------|--------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jikjeokundmaafuytdcx.supabase.co` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ver Supabase Dashboard → Settings → API | Clave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Ver Supabase Dashboard → Settings → API | **¡SOLO Production!** Nunca en Preview |

---

### B — Sitio web (todas las environments)

| Variable | Valor en prod | Descripción |
|----------|--------------|-------------|
| `NEXT_PUBLIC_SITE_URL` | `https://eva-app.cl` | URL base del sitio. Usada en emails, og:url, sitemap |

---

### C — MercadoPago (Production + Preview)

| Variable | Valor en prod | Descripción |
|----------|--------------|-------------|
| `MERCADOPAGO_ACCESS_TOKEN` | Obtener en MP Dashboard → Tu negocio → Credenciales | Token server-side MP |
| `MERCADOPAGO_WEBHOOK_TOKEN` | Cadena random larga (32+ chars) | HMAC para verificar webhooks de MP. Genera con `openssl rand -hex 32` |
| `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` | Obtener en MP Dashboard → Webhooks | Secreto firmado que MP envía en el header |
| `MERCADOPAGO_TEST_PAYER_EMAIL` | `test_user_123@testuser.com` (o el que creaste en MP sandbox) | Solo en Preview/Dev, MP sandbox |

---

### D — Email con Resend (Production SOLO)

| Variable | Valor en prod | Descripción |
|----------|--------------|-------------|
| `RESEND_API_KEY` | Obtener en [resend.com](https://resend.com) → API Keys | Clave para enviar emails transaccionales |
| `EMAIL_FROM` | `EVA <noreply@eva-app.cl>` | Sender. El dominio debe estar verificado en Resend |
| `RESEND_FREE_COACH_AUDIENCE_ID` | Obtener en Resend → Audiences | ID de la audiencia de coaches free (drip sequence) |

**Paso previo:** Verificar dominio `eva-app.cl` en Resend → Domains → agregar registros DNS (SPF, DKIM). Sin esto, los emails caen en spam.

---

### E — Push Notifications / VAPID (Production + Preview)

Generar el par de claves VAPID en terminal:
```bash
npx web-push generate-vapid-keys
```

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID (la que va al client) |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID (¡nunca al client!) |
| `VAPID_EMAIL` | `mailto:jvillegas.dev@gmail.com` — contacto para los navegadores |

---

### F — Crons (Production SOLO)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `CRON_SECRET` | Cadena aleatoria segura (32+ chars) | Protege los endpoints `/api/cron/*`. Genera con `openssl rand -hex 32` |
| `ADMIN_EMAILS` | `jvillegas.dev@gmail.com` | Emails admin separados por coma. Usado en admin gate y alertas de cron |

---

### G — Enterprise (Production + Preview)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `ENTERPRISE_DOMAIN` | `enterprise.eva-app.cl` | Subdominio enterprise (ya configurado en MT-3) |

---

### H — Rate Limiting con Upstash Redis (Production ONLY)

| Variable | Descripción |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Obtener en [console.upstash.com](https://console.upstash.com) → tu DB → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Obtener en Upstash → REST Token |

**Nota:** Sin estas vars, `src/lib/rate-limit.ts` falla silenciosamente (permite todo). Importante activar en producción.

---

### I — Recetas con Edamam (Production + Preview)

| Variable | Descripción |
|----------|-------------|
| `EDAMAM_APP_ID` | Obtener en [developer.edamam.com](https://developer.edamam.com) → Applications |
| `EDAMAM_APP_KEY` | Idem — API key del plan Recipe Search |

---

### J — Feature Flags (opcionales, todas las environments)

Estas vars controlan features en UI. Si no están seteadas, valor por defecto es `false` o `true` según el flag.

| Variable | Default | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_FF_WEEKLY_PLAN` | `false` | Activa plan semanal de nutrición |
| `NEXT_PUBLIC_FF_DETAILED_LOGGING` | `false` | Registro detallado de porciones |
| `NEXT_PUBLIC_FF_NUTRITION_ANALYTICS` | `true` | Eventos Vercel Analytics nutrición |

---

### K — Sentry (a instalar en Fase 6 — aún no hay `@sentry/nextjs` instalado)

| Variable | Destino | Descripción |
|----------|---------|-------------|
| `SENTRY_DSN` | Vercel Production | DSN server-side para errores SSR |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel Production + Preview | DSN client-side |
| `SENTRY_AUTH_TOKEN` | **GitHub Actions secret** | Upload de source maps a Sentry en CI/CD |

**Obtener en:** [sentry.io](https://sentry.io) → tu proyecto → Settings → Client Keys (DSN) y Settings → Auth Tokens.

---

### L — GitHub Actions secrets (para CI/CD + EAS Build)

| Secret | Descripción |
|--------|-------------|
| `EXPO_TOKEN` | Token de Expo EAS para builds automáticos. Obtener en expo.dev/settings/access-tokens (MT-14) |
| `SENTRY_AUTH_TOKEN` | Para upload de source maps en el pipeline CI (ver K arriba) |

**Configurar en:** github.com → tu repo → Settings → Secrets and variables → Actions → New repository secret

---

### M — EAS / Mobile (apps/mobile/.env — se crea en Fase 6B)

> Las apps React Native NO leen vars de Vercel. Se hornean en el build con `EXPO_PUBLIC_*`.
> Se pueden subir a EAS con `eas secret:push --scope project` para que los builds cloud las lean.

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://jikjeokundmaafuytdcx.supabase.co` | URL Supabase (igual que web) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | La anon key de Supabase | Anon key (igual que web) |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN de tu proyecto Sentry RN | Para crash reporting en la app |

---

### Checklist deploy — orden recomendado

1. [ ] **Supabase** (A) — confirmar URL y keys en Dashboard
2. [ ] **MercadoPago** (C) — obtener tokens de prod (no sandbox)
3. [ ] **Resend** (D) — verificar dominio `eva-app.cl` + obtener API key
4. [ ] **VAPID** (E) — generar par de claves `npx web-push generate-vapid-keys` → guardar en Vercel
5. [ ] **CRON_SECRET** (F) — generar `openssl rand -hex 32` → guardar en Vercel
6. [ ] **Upstash** (H) — crear DB en Upstash free tier → obtener URL + token
7. [ ] **Edamam** (I) — verificar que las keys de dev sirven en prod (plan gratuito es suficiente)
8. [ ] **Sentry web** (K) — instalar `@sentry/nextjs` (Fase 6) → obtener DSN → agregar vars
9. [ ] **GitHub Secrets** (L) — EXPO_TOKEN + SENTRY_AUTH_TOKEN
10. [ ] **EAS Mobile** (M) — configurar `apps/mobile/.env` + `eas secret:push` (Fase 6B)

---

## Estado actual (2026-05-17)

| ID | Tarea | Estado |
|---|---|---|
| MT-1 | Auth Hook Supabase local | ✅ Hecho (config.toml, no requiere UI) |
| MT-2 | Bucket org-assets | ✅ Hecho |
| MT-3 | Env vars Vercel | ✅ Hecho (ENTERPRISE_DOMAIN, ADMIN_EMAILS, CRON_SECRET en Vercel) |
| MT-4 | DPA Vercel | ✅ Hecho por KimiCode |
| MT-5 | DPA Supabase | ✅ Hecho por KimiCode |
| MT-6 | Calendly demo link | ✅ Hecho — calendly.com/contacto-eva-app/eva-enterprise |
| MT-7 | Contrato enterprise template | ✅ Redactado — `docs/legal/enterprise-contract-template.md` |
| MT-8 | ToS + Privacy Policy | ✅ Redactados — `docs/legal/tos.md` + `docs/legal/privacy-policy.md` |
| MT-9 | Google Sheets Pipeline | ✅ Hecho |
| MT-10 | UptimeRobot | ✅ Hecho (confirmado 2026-05-22) |
| MT-11 | Guimel Team ID | ⏳ Esperando respuesta de Guimel — placeholder en eas.json + AASA |
| MT-12 | Bundle IDs App Store | ⏳ Depende de MT-11 |
| MT-13 | Google Play ($25) | ⏸ EN ESPERA — pagar fin de mes |
| MT-14 | Cuenta Expo EAS | ✅ Hecho — juandeveva, proyecto eva, EAS ID configurado |
| MT-15 | Sentry web instalado | ✅ @sentry/nextjs instalado 2026-05-22 — falta vars en Vercel (ver MT-30) |
| MT-16 | One-pager PDF | ✅ Hecho por KimiCode — `scripts/output/EVA-Enterprise-One-Pager.pdf` |
| MT-17 | FirmaFácil | ⏳ Pendiente |
| MT-18 | DNS enterprise.eva-app.cl | ⏳ Pendiente (Fase 6) |
| MT-19 | Actualizar docs legales al constituir empresa | ⏳ Cuando formen la SpA con tu socio |
| MT-20 | Correr regression + enterprise tests (Playwright) | ⏳ Antes de mergear |
| MT-21 | Verificar audit_logs sin policy UPDATE/DELETE | ⏳ Antes de deploy |
| MT-22 | Verificar SERVICE_ROLE_KEY solo en Production | ⏳ Antes de deploy |
| MT-23 | Playbook onboarding primer cliente enterprise | ⏳ Al tener primer cliente |
| MT-24 | Calcular health score D14 (por cliente) | ⏳ 14 días post-onboarding |
| MT-25 | Configurar TODAS las env vars en Vercel/GitHub/EAS | ⏳ Al deployar — ver sección completa arriba |
| MT-26 | Cambiar Vercel Root Directory a `apps/web` | ⏳ Al deployar / antes de preview v2 |
| MT-30 | Sentry env vars en Vercel | ⏳ Al deployar — ver sección MT-30 arriba |
| MT-31 | Screenshots iPhone 16 Pro Max | ⏳ Próxima semana (Sem 13) |
| MT-32 | assetlinks.json SHA256 real | ⏳ Después de primer build Android |
| MT-33 | Demo org "EVA Demo Gym" en staging | ⏳ Antes de primer demo de ventas |
| MT-35 | NEXT_PUBLIC_ENTERPRISE_URL en Vercel | ✅ 2026-05-22 |
| MT-36 | Post-deploy checklist completo (CSP + URLs + rate limit) | ⏳ Cuando todos los planes estén en prod |
| MT-37 | Cloudflare Turnstile site key + secret en Vercel | ⏳ Antes de flip eva_auth_v2_* flags |
| MT-34 | Pipeline ventas Google Sheets | ⏳ Antes de primer prospecto |

---

## Checklist deploy final — cosas 🔁 que repetir en producción

Cuando llegue el momento de `npx supabase db push` + merge a master, hacer esto en orden:

- [ ] **MT-1 prod** — Auth Hook activado en Supabase Dashboard de prod (Authentication → Hooks → custom_access_token_hook)
- [ ] **MT-2 prod** — Bucket `org-assets` creado en Storage de prod (mismo proceso, público, 2MB, jpg/png/webp)
- [ ] **MT-3** — Env vars en Vercel: agregar `ENTERPRISE_DOMAIN` y `ADMIN_EMAILS`, borrar vars muertas
- [ ] **MT-18** — DNS CNAME `enterprise` → Vercel + agregar dominio en Vercel dashboard
- [ ] **MT-25** — Configurar TODAS las env vars (Vercel + GitHub Secrets + EAS). Ver checklist en MT-25 arriba
- [ ] **MT-26** — Vercel Root Directory → `apps/web`
- [ ] Verificar UptimeRobot (MT-10) monitoreando los 3 endpoints después del deploy

---

## MT-26 — Cambiar Root Directory en Vercel a `apps/web` · ⏳ Al deployar / antes de preview v2

**Requerido por:** Fase 6A monorepo. La app Next.js ahora vive en `apps/web`.

**No hacer en producción todavía** si no vamos a deployar v2. Este cambio afecta cómo Vercel construye el proyecto.

**Pasos:**
1. Ir a [vercel.com/dashboard](https://vercel.com/dashboard) → proyecto EVA.
2. Settings → General → Root Directory.
3. Cambiar de raíz del repo a:
   ```text
   apps/web
   ```
4. Guardar.
5. Redeploy solo cuando estemos listos para probar/deployar v2.

**Verificación esperada:** Vercel ejecuta `npm run build` desde el monorepo y construye `@eva/web` correctamente.

---

## MT-27 — ngrok para testeo remoto de Supabase local · 🔁 Cada sesión de testeo remoto

**Requerido por:** Testear app mobile desde celular fuera de la red local.

**Instalar una vez:**
```powershell
npm install -g ngrok
# Crear cuenta gratis en ngrok.com → copiar authtoken
ngrok config add-authtoken TU_TOKEN
```

**Cada sesión de testeo:**
```powershell
# 1. Asegurarse que Supabase local esté corriendo
npx supabase status

# 2. Exponer el puerto
ngrok http 54321
# Te da URL tipo: https://abc123.ngrok-free.app
```

**Cambiar en `apps/mobile/.env`:**
```
EXPO_PUBLIC_SUPABASE_URL=https://abc123.ngrok-free.app
```

**Al terminar:** volver a `http://127.0.0.1:54321` en el `.env`.

**Limitaciones plan free ngrok:** URL cambia cada sesión. Plan free = 1 agente activo.

---

## MT-28 — Build Android de prueba (APK sin Google Play) · ⏳ Cuando Apple Team ID esté listo

**Contexto:** Google Play ($25) solo se necesita para publicar en la tienda. Para instalar en tu celular Android directamente, EAS genera un APK gratis.

**Prerequisitos:**
- `eas login` hecho (Juandeveva en expo.dev) ✅
- `EXPO_TOKEN` en GitHub Secrets ✅

**Pasos:**
```powershell
cd apps/mobile

# Build development (debug, con dev menu)
eas build --platform android --profile development --non-interactive

# O build staging (release, sin dev menu, más parecido a producción)
eas build --platform android --profile staging --non-interactive
```

**Instalar en el celular:**
1. Build tarda ~10-15 min en servidores de EAS
2. Cuando termine → EAS te manda email con link de descarga
3. También en [expo.dev](https://expo.dev) → Juandeveva → proyecto eva-fitness → Builds
4. Abrir el link en el celular Android → descargar APK → instalar
5. Android pedirá habilitar "instalar de fuentes desconocidas" — aceptar solo para esta app

**Nota:** El `.env` determina a qué Supabase apunta el build. Para testeo local remoto: usar ngrok URL antes de correr `eas build`.

---

## MT-29 — iOS testeo en dispositivo de amigo (ad-hoc via EAS) · ⏳ Cuando Apple Team ID esté listo

**Contexto:** Para que alguien con iPhone pruebe la app sin App Store, se registra su dispositivo en Apple Developer y se hace un build especial.

**Prerequisitos:**
- Apple Team ID de Guimel configurado en `eas.json` (MT-11 pendiente)
- Bundle ID `cl.evaapp.eva` registrado (MT-12 pendiente)

**Pasos:**

1. **Registrar el dispositivo del amigo:**
```powershell
cd apps/mobile
eas device:create
# Te da un link — amigo lo abre en su iPhone → instala perfil → registra UDID automáticamente
```

2. **Build ad-hoc:**
```powershell
eas build --platform ios --profile development --non-interactive
```
EAS genera un `.ipa` con provisioning ad-hoc que incluye el UDID del amigo.

3. **Instalar:** EAS envía email con link → amigo lo abre en su iPhone → instala directo.

**Futuro (cuando haya listing en App Store Connect):** usar TestFlight — más limpio, hasta 10.000 testers, sin límite de dispositivos. Ese paso viene en Sem 13 (auditoría + polish).

**Importante:** máx. 100 dispositivos registrados en plan de Guimel (Apple Developer). Más que suficiente para pruebas.

---

## MT-30 — Sentry env vars en Vercel · ⏳ Al deployar

**Pasos:**
1. Crear cuenta en [sentry.io](https://sentry.io) → New Project → JavaScript → Next.js → nombre `eva-web`
2. Copiar el DSN (formato: `https://abc123@o123456.ingest.sentry.io/789`)
3. En Vercel → tu proyecto → Settings → Environment Variables, agregar:
   - `SENTRY_DSN` = el DSN → solo Production
   - `NEXT_PUBLIC_SENTRY_DSN` = el mismo DSN → Production + Preview
   - `SENTRY_ORG` = slug de tu org en sentry.io (visible en la URL: `sentry.io/organizations/[SLUG]/`)
   - `SENTRY_PROJECT` = slug del proyecto (Settings → Projects → `eva-web`)
4. En GitHub Secrets (repo → Settings → Secrets → Actions), agregar:
   - `SENTRY_AUTH_TOKEN` = sentry.io → Settings → Auth Tokens → Create → scopes: `project:releases`, `org:read`, `project:read`

---

## MT-31 — Screenshots iPhone 16 Pro Max (Sem 13) · ⏳ Próxima semana

**Requerido por:** App Store submission
**Mínimo:** 3 por rol (coach + alumno) = 6 total. Recomendado: 8-10.

**Pantallas sugeridas coach:** lista clientes, builder de rutina, analytics dashboard
**Pantallas sugeridas alumno:** pantalla de entrenamiento activo, log de nutrición, check-in semanal

**Herramienta:** Xcode Simulator → iPhone 16 Pro Max → File → Take Screenshot. O dispositivo físico → compartir por AirDrop.

**Tamaño requerido por Apple:** 1290 × 2796 px (iPhone 16 Pro Max).

---

## MT-32 — assetlinks.json — SHA256 real del APK Android · ⏳ Después de primer build Android

**Archivo:** `apps/web/public/.well-known/assetlinks.json` tiene `PLACEHOLDER_SHA256_CERT_FINGERPRINT`

**Cómo obtener el SHA256 real:**
```bash
# Opción A: desde el keystore (si usas credenciales locales)
keytool -list -v -keystore tu-keystore.jks -alias tu-alias

# Opción B: desde un APK ya firmado
keytool -printcert -jarfile tu-app.apk

# Opción C: desde Google Play Console → Setup → App integrity → SHA-256
```

**Luego reemplazar** en `apps/web/public/.well-known/assetlinks.json`:
```json
"sha256_cert_fingerprints": ["EL:SHA:256:REAL:AQUI"]
```

---

## MT-33 — Demo org "EVA Demo Gym" en staging · ⏳ Antes de primer demo de ventas

1. Supabase local: correr `npx supabase db reset` (aplica seeds con datos de test)
2. O en staging: panel admin → `/admin/orgs` → crear org manual con:
   - slug: `demo-gym`
   - nombre: "EVA Demo Gym"
   - plan: `enterprise`, status: `trial`
   - Invitar 2-3 coaches de prueba con emails propios
3. Usar esta org para mostrar en demos de venta

---

## MT-37 — Cloudflare Turnstile (auth captcha) · ⏳ Antes de flip de flags eva_auth_v2_*

Plan: `docs/plans/improve-logins-coach-enterprise.md` (Fase 0).

1. Cloudflare dashboard → Turnstile → "Add Site"
   - Domains: `eva-app.cl`, `enterprise.eva-app.cl`, `localhost` (dev)
   - Widget mode: **Managed** (auto-select challenge según riesgo)
2. Copiar Site Key + Secret.
3. Vercel → Project → Settings → Environment Variables (Production + Preview):
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>`
   - `TURNSTILE_SECRET=<secret>` (NO marcar como public)
4. Local: agregar ambas en `.env.local` (opcional — sin esto, captcha widget no aparece y `verifyTurnstile` fails-open hasta 5 intentos consecutivos).
5. Smoke test post-deploy:
   ```bash
   # 3 fallos consecutivos → widget Turnstile debe aparecer en /login y /org/login
   ```
6. Documentado en `.env.example` (sección "Cloudflare Turnstile").

---

## MT-36 — Post-deploy checklist completo · ⏳ Cuando todos los planes estén en prod

Hacer UNA VEZ después de que Plan A + B + C estén mergeados y en producción.

### CSP check (enterprise.eva-app.cl)
1. Abrir Chrome DevTools → Console en `enterprise.eva-app.cl`
2. Verificar que no hay errores `Content-Security-Policy`
3. Si hay errores de `connect-src` o `img-src`: agregar dominios faltantes en `apps/web/vercel.json` CSP header

### Rate limit test (enterprise login)
```bash
for i in $(seq 1 42); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://enterprise.eva-app.cl/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Últimas respuestas deben ser 429
```

### Routing verification
- `enterprise.eva-app.cl/` → landing amber (NO login)
- `enterprise.eva-app.cl/login` → org login form
- `eva-app.cl/org/anything` → redirect 302 a `enterprise.eva-app.cl/org/anything`
- `enterprise.eva-app.cl/[slug]` → org dashboard (si autenticado)

### Cookie isolation
- Login en `enterprise.eva-app.cl` → abrir `eva-app.cl` → debe pedir login de nuevo (sesiones separadas)

### OG/SEO
- Verificar que `enterprise.eva-app.cl` tiene OG tags correctos (`EVA Enterprise — Panel para Gyms...`)

---

## MT-35 — NEXT_PUBLIC_ENTERPRISE_URL en Vercel · ✅ 2026-05-22

1. Ir a Vercel → proyecto EVA → Settings → Environment Variables
2. Agregar en **Production** y **Preview**:
   - Key: `NEXT_PUBLIC_ENTERPRISE_URL`
   - Value: `https://enterprise.eva-app.cl`
3. Redeploy para que tome efecto
4. Verificar: `eva-app.cl` → sección Enterprise → botón "Ver EVA Enterprise" → lleva a `enterprise.eva-app.cl`

**Por qué:** El CTA del landing principal usa esta variable. Sin ella funciona con el valor hardcodeado en LandingEnterpriseSection.tsx, pero si el dominio cambia la variable permite actualizarlo sin código.

---

## MT-34 — Pipeline ventas Google Sheets · ⏳ Antes de primer prospecto

1. [sheets.google.com](https://sheets.google.com) → nuevo documento: **"EVA Enterprise Pipeline"**
2. Columnas: `Gym | Contacto | Email | Tel | Fuente | Coaches | Estado | Fecha Demo | Fecha Firma | Plan | MRR | Notas`
3. Estados: `Prospecto → Demo agendada → Demo hecha → Contrato → Trial → Pagando → Churned`

---

## MT-38 — Revisar copy legal al constituir EVA Technology SpA · ⏳ Cuando quede inscrita la SpA

Al quedar inscrita la sociedad (EVA Technology SpA, en proceso jun-2026), revisar y actualizar:

1. **Copy de precios** en cualquier página pública donde se mencionen valores (verificar que no quedaron precios de lista expuestos).
2. **Páginas legales** (`/legal`, `/privacidad`, `/legal/contrato-enterprise`): reemplazar "Juan Villegas (persona natural)" por razón social + RUT empresa + representante legal.
3. **Tratamiento de IVA**: una vez constituida la SpA, el coach pagará como empresa; revisar si corresponde añadir mención de IVA en los contratos o facturas.
4. **Aviso Legal §1**: actualizar domicilio legal con la dirección registrada en notaría.

---

## Nota — Search Console y páginas /enterprise

Search Console removal de `/enterprise` y `/legal/contrato-enterprise`: **INNECESARIO** (verificado 2026-06-11, Google no tiene nada indexado de esas rutas). El `noindex` agregado en ambas páginas queda como cinturón de seguridad preventivo.
