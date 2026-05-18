# EVA — Plan de Ejecución Enterprise + React Native

> Fecha: 2026-05-17 (auditado y robustecido — versión final consolidada)
> Estado: ACTIVO — guía de ejecución paso a paso  
> Restricción crítica: `/coach/*` y clientes actuales no se rompen en ninguna fase  
> Auditoría de 14 roles integrada: Architect · Backend · Frontend · Mobile · DevOps · QA · Security · PM · UX · Sales · SDR · CSM · Legal · Fintech

---

## Tabla de Contenidos

| Sección | Línea aprox |
|---|---|
| [FASE INMEDIATA — Acciones de hoy](#fase-inmediata) | ~20 |
| [PRERREQUISITOS](#prerrequisitos) | ~80 |
| [Decisiones fijas](#decisiones-fijas) | ~200 |
| [Modelo Enterprise vs Standalone](#modelo) | ~250 |
| [Schema Enterprise](#schema) | ~280 |
| [JWT Custom Claims](#jwt) | ~490 |
| [Routing Enterprise](#routing) | ~520 |
| [Arquitectura de código v2](#arquitectura) | ~570 |
| [Cambios en código existente (Gaps 1-8)](#gaps) | ~600 |
| [FASE 0 — Git + Supabase + Monorepo](#fase-0) | ~860 |
| [FASE 1 — Backend Enterprise](#fase-1) | ~1010 |
| [FASE 2 — Frontend Enterprise](#fase-2) | ~1400 |
| [FASE 3 — Legal, Billing, Sales](#fase-3) | ~1760 |
| [FASE 4 — QA y Seguridad](#fase-4) | ~2120 |
| [FASE 5 — Onboarding Enterprise](#fase-5) | ~2230 |
| [FASE 6 — Monorepo + React Native](#fase-6) | ~2310 |
| [Deploy a producción](#deploy) | ~2900 |
| [Riesgos](#riesgos) | ~2920 |
| [Timeline resumen](#timeline) | ~2960 |
| [Checklist pre-launch](#checklist) | ~3020 |
| [Roadmap Futuro](#roadmap-futuro) | ~3150 |
| [Appendix: Stack + Env Vars](#appendix) | ~3250 |

---

## FASE INMEDIATA — Acciones de hoy (sin tocar código de features)
**Duración:** 2-3 horas | **Bloquea:** ventas, compliance, arquitectura mobile

Estas acciones no dependen de ninguna fase técnica y su demora tiene costo directo.

| Acción | Por qué hoy | Tiempo |
|---|---|---|
| Deploy `LandingEnterpriseSection` a master | Capta leads ahora. Cero riesgo técnico. | 4-6h |
| Crear cuenta Calendly gratuita | El CTA de la landing necesita el link | 5 min |
| Crear one-pager PDF (Google Slides) | Necesario para D+1 post-demo | 1h |
| Firmar DPA Vercel (vercel.com/legal) | Compliance pendiente — sin esto hay deuda legal activa | 15 min |
| **Decidir estrategia Apple IAP** | Bloquea arquitectura de 6B si se decide tarde | 30 min |
| Registrar Bundle IDs en App Store Connect | `cl.evaapp.eva` y `cl.evaapp.eva-enterprise` | 15 min |
| Crear Google Play Developer account ($25 USD) | Sin esto no hay Android. Pago único. | 30 min |
| Crear cuenta UptimeRobot (gratis) | SLA 99% firmado en contrato sin monitoreo = indefendible | 10 min |

> **Nota SII / Facturación (2026-05-17):** En proceso de constitución de empresa legal. Actualmente emitiendo boletas de honorarios manualmente en sii.cl por cada pago recibido. La facturación electrónica (Factura + CAF) se tramita cuando la empresa esté constituida. Acción pendiente owner: tramitar CAF antes de tener el 5to cliente enterprise con RUT de empresa.

### Decisión Apple IAP — documentar ahora, no durante Fase 6B

**El problema:** Apple prohíbe que apps iOS vendan subscripciones digitales sin usar In-App Purchase (30% cut). MercadoPago pre-approvals funcionan en web pero NO pueden ser el mecanismo de pago dentro de la app iOS.

**Decisión adoptada: Web-Only Billing (opción $0)**

- Coach gestiona plan en `/coach/settings/billing` en la web
- La app RN muestra solo el `subscription_status` — nunca un CTA de compra
- Alumno no tiene suscripción propia — no aplica
- Apple lo permite: "reader app exception" + billing management en web es explícitamente permitido por App Store Guidelines 3.1.3(a)
- **Consecuencia en código 6B:** Tab "Billing" en coach mobile NO existe. Si coach toca "gestionar plan" → deep link a `eva-app.cl/coach/settings/billing` en Safari

**Google Play:** misma lógica — sin IAP en Android tampoco. Google Play Billing solo es obligatorio si la app VENDE algo. Si la app solo muestra estado, no aplica.

#### Done cuando (Fase Inmediata)
- [ ] Landing enterprise section live en producción (`LandingEnterpriseSection` mergeado a master)
- [ ] DPA Vercel firmado
- [ ] Bundle IDs registrados en App Store Connect
- [ ] Google Play account creada ($25 USD pagado)
- [ ] One-pager PDF creado
- [ ] Calendly link configurado e insertado en componente
- [ ] Decisión IAP documentada en este archivo ✓ (ya está arriba)
- [ ] Cuenta UptimeRobot creada + monitores `eva-app.cl`, `enterprise.eva-app.cl`, `/api/health`

---

## PRERREQUISITOS — Verificar antes de empezar

### Herramientas requeridas

| Herramienta | Estado | Cómo verificar | Instalar si falta |
|---|---|---|---|
| Node.js 20+ | ? | `node --version` | nodejs.org |
| Docker Desktop | ✓ instalado | `docker --version` | ya instalado |
| Supabase CLI | ? | `npx supabase --version` | `npm i -g supabase` |
| Git | ✓ | `git --version` | ya instalado |
| GitHub CLI | ? | `gh --version` | cli.github.com |

### Cómo usar Docker con Supabase (paso a paso)

Docker Desktop solo necesita estar **corriendo** — no necesitas saber comandos de Docker directamente. Supabase CLI lo maneja por ti.

```bash
# 1. Abrir Docker Desktop (el ícono de la ballena en la barra de tareas)
#    Esperar hasta que diga "Engine running"

# 2. En tu terminal, dentro del proyecto:
npx supabase start
# Primera vez descarga imágenes (~2GB, tarda 5-10 min)
# Las siguientes veces: ~30 segundos

# 3. Verás algo así:
#    API URL:      http://localhost:54321
#    GraphQL URL:  http://localhost:54321/graphql/v1
#    DB URL:       postgresql://postgres:postgres@localhost:54322/postgres
#    Studio URL:   http://localhost:54323   ← abre esto en el browser
#    Inbucket URL: http://localhost:54324   ← emails de prueba aquí
#    anon key:     eyJ...
#    service_role key: eyJ...

# 4. Para aplicar tus migraciones:
npx supabase db reset
# → borra DB local, recrea desde cero con todas las migrations + seed.sql

# 5. Para parar:
npx supabase stop

# 6. Para ver logs de la DB local:
npx supabase db logs
```

**Studio local** (`localhost:54323`): igual que Supabase Dashboard pero local. Puedes explorar tablas, correr SQL, ver logs — todo sin tocar producción.

**Inbucket** (`localhost:54324`): captura todos los emails que Supabase envía (invitaciones, resets de contraseña). Úsalo para testear el flujo de invitaciones de coach.

### Variables de entorno — estado actual y V2

#### Vercel: vars activas y su estado

| Variable | Environments | Estado |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | All | ✓ |
| `RESEND_API_KEY` | All | ✓ |
| `UPSTASH_REDIS_REST_URL` | All | ✓ |
| `UPSTASH_REDIS_REST_TOKEN` | All | ✓ |
| `MERCADOPAGO_WEBHOOK_TOKEN` | All | ✓ |
| `PAYMENT_PROVIDER` | All | ✓ |
| `EMAIL_FROM` | All | ✓ |
| `EDGE_CONFIG` | All | ✓ |
| `TURNSTILE_SECRET_KEY` | Prod+Preview | ✓ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Prod+Preview | ✓ |
| `NEXT_PUBLIC_POSTHOG_HOST` | Prod+Preview | ✓ |
| `NEXT_PUBLIC_POSTHOG_TOKEN` | Prod+Preview | ✓ |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Prod+Preview | ✓ |
| `RESEND_FREE_COACH_AUDIENCE_ID` | Prod+Preview | ✓ |
| `BETA_INVITE_TOKEN` | Prod+Preview | ✓ |
| `MERCADOPAGO_ACCESS_TOKEN` | **Prod separado de Preview** ✓ | Preview = sandbox token |
| `MERCADOPAGO_TEST_PAYER_EMAIL` | Preview only | ✓ sandbox |
| `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` | All | ✓ |
| `NEXT_PUBLIC_APP_URL` | Prod+Preview (separados) | ✓ |
| `NEXT_PUBLIC_SITE_URL` | Prod+Preview (separados) | ✓ |
| `VAPID_EMAIL` | Prod+Preview | ✓ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Prod+Preview | ✓ |
| `VAPID_PRIVATE_KEY` | Prod+Preview | ✓ |
| `VAPID_PUBLIC_KEY` | Prod+Preview | ✓ |
| `CRON_SECRET` | Prod+Preview | ✓ |
| `ADMIN_EMAILS` | Prod+Preview | ✓ |

#### Vars muertas — borrar de Vercel (no están en ningún archivo de código)

| Variable | Motivo |
|---|---|
| `DRIP_CRON_TOKEN` | Dead — el código usa `CRON_SECRET` |
| `BETA_MONITOR_TOKEN` | Dead — no referenciada en nada |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | Dead — no existe en src/ |
| `NEXT_PUBLIC_COACH_DASHBOARD_V2` | Dead — no existe en src/ |

#### Lo único nuevo que falta para V2

| Variable | Cuándo | Cómo obtener |
|---|---|---|
| `STAGING_DB_URL` | Fase 0.2 | Segundo proyecto Supabase → Settings → Database → URI |

#### `.env.local` para desarrollo local

```bash
# .env.local — apunta al stack local cuando usas npx supabase start (NO commitear)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del output de npx supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key del output>
CRON_SECRET=dev-secret-local
ADMIN_EMAILS=jvillegas.dev@gmail.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
# VAPID, MP, Resend: usar los de producción o mocks — no afectan el flujo enterprise local

# Las keys de producción guardarlas en .env.production.local (NO commitear)
```

### Costos reales del proyecto

| Item | Costo | Cuándo |
|---|---|---|
| Vercel Pro | Ya pagado ✓ | — |
| Supabase free (2 proyectos) | $0 | Ahora |
| Docker Desktop | $0 (uso personal) | Ahora |
| GitHub Actions privado | 500 min/mes gratis | Al límite → optimizar |
| Apple Developer Program | **$0** — cuenta de Guimel (amigo), te da acceso como App Manager | Coordinar con Guimel antes de Fase 6B |
| Google Play Developer | **$25 USD** one-time (~$22.700 CLP) | Antes de publicar Android |
| EAS Build (Expo) | $0 (30 builds/mes free) | Al límite → EAS Pro $99 USD/mes |
| FirmaFácil / DocuSign | $0 con plan básico | Para contratos enterprise |
| SII boleta electrónica | $0 (manual en sii.cl) | Por cada pago recibido |

**Total para llegar a enterprise en producción: $0**  
**Total para publicar apps móviles: ~$124 USD** (Apple + Google, pago único — cubre AMBAS apps con las mismas cuentas)

---

## Decisiones fijas — no reabrir

| Decisión | Valor |
|---|---|
| Infraestructura | Mismo Supabase free + mismo Vercel Pro — sin proyectos nuevos de pago |
| Supabase isolation | `npx supabase start` (Docker local) + 2do proyecto Supabase FREE como staging |
| Monorepo tooling | npm workspaces — NO Turborepo (cero costo, suficiente escala) |
| Productos | **3 productos, 1 DB:** EVA Web + EVA App (coach+alumno) + EVA Enterprise (gym mgmt) |
| EVA App scope | Coach (standalone y enterprise) + Alumno — mismo app, role-based UX. SOY COACH → dashboard completo. SOY ALUMNO → código → workout/nutri/check-in |
| EVA Enterprise scope | Solo org_owner/org_admin — gestión pura (coaches, alumnos, billing, analytics). Sin ejercicios, sin nutrición, sin workout execution |
| Coach en org (EVA App) | Mismo dashboard que standalone, pero sin tab Billing ni Branding (org lo gestiona). `subscription_status = 'org_managed'` oculta esas tabs |
| Arquitectura web | **Un solo Next.js app.** `/coach/*` + `/c/[slug]/*` + `enterprise.eva-app.cl` → `/org/*`. Paridad total con las 3 apps nativas |
| Auth | Supabase Auth en todas las superficies (web + ambas apps RN) |
| Registro free coach | Supabase email confirmation link obligatorio. `coaches.subscription_status = 'pending_email'` hasta `/auth/confirm`; luego pasa a `active`. No usar código numérico custom en MVP. |
| JWT claims | Supabase Auth Hook (free) → `org_id` + `org_role` en JWT al login |
| Pagos coaches | MercadoPago pre-approvals (ya implementado, HMAC verificado) |
| Pagos enterprise | Manual: link MP o transferencia bancaria → activación manual |
| Stack RN | Expo SDK 53 + Expo Router v4 + NativeWind v4 — aplica a EVA App y EVA Enterprise |
| Git branching | `master` intocable → todo trabajo en `v2/enterprise` → PRs por sub-fase |
| Identificador coach | `invite_code` 5 chars auto-generado (ej: `4XK7M`) — coaches existentes conservan slug |
| URLs web | Slugs existentes permanentes. Coaches nuevos: `/c/[invite_code]/` |
| Soft delete | `deleted_at timestamptz NULL` en todas tablas enterprise (Ley 21.719) |
| Audit log | `org_audit_logs` append-only desde MVP |
| Pricing enterprise | $49.990 CLP/mes (hasta 3 coaches) + $9.990/coach adicional |
| Pricing anual | $499.900 CLP/año (≈ 2 meses gratis) — ofrecer en cierre de contrato |
| Trial primeros 2 clientes | 30 días gratis desde go-live, sin tarjeta — `trial_ends_at` en `organizations` |
| **Apple IAP strategy** | **Web-only billing** — app RN nunca vende ni muestra CTA de compra. Billing siempre en web. Guideline §3.1.1 exime B2B multiplatform explícitamente. |
| **Android billing** | Sin Google Play Billing — mismo razonamiento que Apple. App solo consume. |
| **Apple Developer Program** | **Standard** ($99/año, cuenta Guimel) → App Store público. NUNCA Enterprise Program ($299/año) — ese es para apps internas de empleados; uso incorrecto = revocación cert = ambas apps se rompen instantáneamente. |
| **Sign in with Apple** | No requerido en MVP — Guideline §4.8 solo obliga si el app usa login social de terceros. EVA usa email/password puro vía Supabase. Agregar SiWA en v1.1 si hay demanda. |
| **Invite token storage** | `SHA-256(token)` en DB, token raw en email. Token solo verificable, no reversible. |
| **org_members uniqueness** | Partial unique index `(coach_id, org_id) WHERE deleted_at IS NULL` — un coach una membresía activa por org |
| **billing_start_date** | Día 1 de cada mes para todas las orgs. Primer mes: si sign-up después del día 10 → cobrar mes completo; si antes del día 10 → cobrar desde el día 1 del mes siguiente. Columna `billing_start_date date` en `organizations`. |
| **workout_programs ownership** | Programas creados por un coach dentro de una org pertenecen a la org. Al salir el coach → conservan `org_id`, quedan accesibles al org_admin. Coach pierde edit access vía RLS. |
| **MFA org_owner** | TOTP (Supabase Auth built-in) requerido para org_owner. Opcional para org_admin. No aplica para coaches. Flow: primer login → redirect `/org/setup-mfa` si `requires_mfa_setup` en JWT. |
| Soporte | WhatsApp group por cliente (org_admin + coaches clave + tú) |
| Onboarding orgs | Manual por ti hasta haber onboardeado 3+ orgs |
| Dunning | D+5 email manual, D+10 suspensión manual desde admin panel |
| SII facturación | Manual en sii.cl hasta >8 orgs pagando |
| Coach en org → billing | Mientras esté activo en org: su plan standalone se suspende (org paga por él). Al salir de org → debe reactivar plan standalone |
| Política reembolsos | Sin reembolso proporcional. Cancelación efectiva al fin del mes en curso |
| Admin panel auth | Middleware verifica email contra `ADMIN_EMAILS` env var (comma-separated) — ya implementado en `src/lib/admin/admin-gate.ts` |

---

## Modelo Enterprise vs Standalone

| Aspecto | Hoy (standalone) | Enterprise (org) |
|---|---|---|
| Dueño del cliente | Coach | Organización |
| Asignación | Implícita — coach crea cliente | Explícita — admin importa pool → asigna a coach |
| Vista coach | Sus propios clientes | Solo clientes asignados del pool org |
| Roles | — | `org_owner`, `org_admin`, `coach` |
| Billing | Por coach (MP pre-approval) | Por org (factura mensual manual) |
| Branding | Por coach (logo + color) | Por org (override de todos los coaches dentro) |
| Coach en múltiples orgs | — | Permitido — freelance coaches en 2 gyms |

**Regla de oro de compatibilidad:**
```
clients.org_id IS NULL  →  comportamiento actual 100% intacto, ni un archivo tocado
clients.org_id NOT NULL →  lógica enterprise nueva
```

### Fuentes del pool de clientes

**A) Admin importa** → CSV o manual → cliente con `org_id` → pool sin asignar → admin asigna

**B) Coach agrega dentro de org** → cliente con `org_id` → auto-asignado al coach que lo creó → aparece en pool

**Dedup obligatorio:**
```sql
ALTER TABLE clients ADD CONSTRAINT clients_org_email_unique UNIQUE (org_id, email);
```
Colisión → UI muestra alumno existente + opción de asignarlo al coach que intenta agregarlo.

**Límite CSV import:** 200 clientes por batch (síncrono). >200 → error: "Divide el archivo en partes de máximo 200 filas".

---

## Schema Enterprise

### Tablas nuevas

```sql
-- Organización (gym, box, clínica)
CREATE TABLE organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text UNIQUE NOT NULL,
  name               text NOT NULL,
  logo_url           text,
  primary_color      text,
  owner_user_id      uuid NOT NULL REFERENCES auth.users(id),
  plan               text NOT NULL DEFAULT 'enterprise',
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','cancelled','trial')),
  trial_ends_at      timestamptz,                         -- 30 días gratis primeros 2 clientes
  seats_included     int NOT NULL DEFAULT 3,              -- coaches incluidos en el plan base
  billing_start_date date,                                -- día 1 del mes de activación (FT2)
  billing_cycle      text DEFAULT 'monthly'
                     CHECK (billing_cycle IN ('monthly','annual')),
  purge_scheduled_at timestamptz,                         -- 2-step purge safety window (B5)
  onboarding_step    int DEFAULT 0,                       -- 0-4, para checkpoint server-side
  currency           text NOT NULL DEFAULT 'CLP',
  deleted_at         timestamptz,
  created_at         timestamptz DEFAULT now()
);
-- status='trial' + trial_ends_at = D+30 → cron health-alert revisa y alerta si no convierte

-- Coaches dentro de org (un coach puede estar en múltiples orgs)
CREATE TABLE organization_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id),
  coach_id   uuid NOT NULL REFERENCES coaches(id),
  role       text NOT NULL CHECK (role IN ('org_owner','org_admin','coach')),
  status     text NOT NULL DEFAULT 'invited'
             CHECK (status IN ('invited','active','suspended')),
  invited_at timestamptz DEFAULT now(),
  joined_at  timestamptz,
  deleted_at timestamptz
  -- SIN UNIQUE(coach_id) global — coach puede estar en múltiples orgs
  -- Pero solo UNA membresía activa por org (ver índice parcial abajo)
);

-- Garantiza que un coach no tenga dos membresías activas en la misma org
-- Soft delete (deleted_at) permite historial de salidas/reingreso
CREATE UNIQUE INDEX org_members_unique_active
  ON organization_members(coach_id, org_id)
  WHERE deleted_at IS NULL;

-- Invitaciones pendientes
CREATE TABLE organization_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('org_admin','coach')),
  token_hash  text UNIQUE NOT NULL,  -- SHA-256(raw_token), NO el token en plaintext
                                     -- raw_token = gen_random_bytes(32) hex, se envía por email
                                     -- Si DB es comprometida, tokens no son exploitables
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at     timestamptz,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  deleted_at  timestamptz
);
-- Verificación: encode(sha256(raw_token_input::bytea), 'hex') = token_hash

-- Asignación de clientes del pool a coaches
CREATE TABLE coach_client_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  coach_id    uuid NOT NULL REFERENCES coaches(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  deleted_at  timestamptz,
  UNIQUE(org_id, client_id)
);

-- Audit log append-only
CREATE TABLE org_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  action      text NOT NULL,
  target_id   uuid,
  target_type text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
  -- SIN deleted_at — append-only por diseño
);
```

### Cambios a tablas existentes (backwards-compatible)

```sql
-- Clientes
ALTER TABLE clients ADD COLUMN org_id uuid REFERENCES organizations(id);
ALTER TABLE clients ADD CONSTRAINT clients_org_email_unique UNIQUE (org_id, email);

-- Coaches
ALTER TABLE coaches ADD COLUMN invite_code text;
-- (backfill + constraint en migración 007, ver abajo)

-- subscription_events: soporte para pagos enterprise
ALTER TABLE subscription_events ADD COLUMN org_id uuid REFERENCES organizations(id);
-- org_id NULL = pago de coach standalone (comportamiento actual)
-- org_id NOT NULL = pago enterprise de org
```

### Trigger invite_code

```sql
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TRIGGER AS $$
DECLARE
  code  text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin O/0/I/1
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      NEW.invite_code := code;
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- colisión (1 en 33M) → reintentar
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coaches_invite_code_trigger
  BEFORE INSERT ON coaches
  FOR EACH ROW
  WHEN (NEW.invite_code IS NULL)
  EXECUTE FUNCTION generate_invite_code();
```

### Índices obligatorios

```sql
CREATE INDEX ON organizations(slug);
CREATE INDEX ON organizations(status) WHERE deleted_at IS NULL;
CREATE INDEX ON organizations(trial_ends_at) WHERE status = 'trial';  -- cron trial check
CREATE INDEX ON organization_members(org_id, coach_id);
CREATE INDEX ON organization_members(coach_id);
CREATE INDEX ON organization_members(status) WHERE deleted_at IS NULL;
CREATE INDEX ON clients(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX ON coach_client_assignments(coach_id, org_id);
CREATE INDEX ON coach_client_assignments(client_id);
CREATE INDEX ON org_audit_logs(org_id, created_at DESC);
CREATE INDEX ON org_audit_logs(org_id, actor_id, created_at DESC);  -- queries "acciones de este coach"
CREATE INDEX ON organization_invites(token_hash);                    -- lookup en accept_invite
CREATE INDEX ON organization_invites(email, org_id) WHERE used_at IS NULL;  -- "ya invitado?"
```

### RLS — sin tocar políticas existentes

```sql
-- REGLA: políticas actuales NO se modifican. Solo se agregan nuevas.

CREATE POLICY "org_admin_see_pool" ON clients
  FOR SELECT USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = clients.org_id
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "org_coach_see_assigned" ON clients
  FOR SELECT USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM coach_client_assignments cca
      JOIN organization_members om
        ON om.coach_id = cca.coach_id AND om.org_id = cca.org_id
      WHERE cca.client_id = clients.id
        AND cca.deleted_at IS NULL
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- org_audit_logs: INSERT para miembros activos, cero UPDATE/DELETE
CREATE POLICY "org_members_insert_audit" ON org_audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_audit_logs.org_id
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- org_invoices: solo org_owner/org_admin ven sus facturas. INSERT/UPDATE solo service_role.
ALTER TABLE org_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_admin_see_own_invoices" ON org_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_invoices.org_id
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );
CREATE POLICY "service_role_manage_invoices" ON org_invoices
  FOR ALL USING (auth.role() = 'service_role');

-- payment_exceptions: solo org_owner/org_admin. Escritura solo service_role.
ALTER TABLE payment_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_admin_see_exceptions" ON payment_exceptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = payment_exceptions.org_id
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );
CREATE POLICY "service_role_manage_exceptions" ON payment_exceptions
  FOR ALL USING (auth.role() = 'service_role');

-- purge_audit: solo service_role puede insertar. Nadie puede leer vía API (datos de orgs eliminadas).
ALTER TABLE purge_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_purge_audit" ON purge_audit
  FOR ALL USING (auth.role() = 'service_role');
```

---

## JWT Custom Claims (Auth Hook — gratis)

```sql
-- Supabase Dashboard → Authentication → Hooks → Custom Access Token
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  uid       uuid := (event->>'user_id')::uuid;
  coach_rec record;
  org_rec   record;
  claims    jsonb;
BEGIN
  claims := event->'claims';
  SELECT id INTO coach_rec FROM coaches WHERE user_id = uid LIMIT 1;

  IF coach_rec.id IS NOT NULL THEN
    claims := jsonb_set(claims, '{coach_id}', to_jsonb(coach_rec.id));

    -- Usa active_org_id (elegido explícitamente por el coach via org-switcher)
    -- Fallback: joined_at DESC si active_org_id es NULL (coach nuevo, nunca hizo switch)
    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.coach_id = coach_rec.id
      AND om.org_id = COALESCE(
        (SELECT active_org_id FROM coaches WHERE id = coach_rec.id),
        (SELECT org_id FROM organization_members
          WHERE coach_id = coach_rec.id AND status = 'active' AND deleted_at IS NULL
          ORDER BY joined_at DESC NULLS LAST LIMIT 1)
      )
      AND om.status = 'active'
      AND om.deleted_at IS NULL
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**JWT stale:** Al suspender coach, JWT viejo dura hasta 1h. Mitigación: RLS chequea `status = 'active'` en DB → JWT es optimización, DB es la verdad. Riesgo aceptado para MVP.

---

## Routing Enterprise

```
enterprise.eva-app.cl/               → redirect → /login
enterprise.eva-app.cl/login          → login org_admin (no marketing)
enterprise.eva-app.cl/invite/[token] → aceptar invitación coach
enterprise.eva-app.cl/setup-account  → primer login de org_owner: set password + acepta ToS + redirect /org/[slug]/onboarding

/org/[org_slug]/                     → dashboard org
/org/[org_slug]/coaches              → lista coaches, invitar, suspender
/org/[org_slug]/clients              → pool clientes, CSV, asignar
/org/[org_slug]/assign               → matriz asignación (@dnd-kit)
/org/[org_slug]/settings             → branding, billing
/org/[org_slug]/settings/billing     → historial pagos, link MP, suspender

/admin/orgs                          → panel admin interno (solo tú)

/coach/*       → SIN TOCAR
/c/[slug]/*    → SIN TOCAR
/c/[invite_code]/* → coaches nuevos
```

**Middleware para enterprise.eva-app.cl:**
```typescript
// src/middleware.ts — agregar al middleware existente
if (request.headers.get('host') === 'enterprise.eva-app.cl') {
  const url = request.nextUrl.clone()
  if (!url.pathname.startsWith('/invite') && !url.pathname.startsWith('/login')) {
    url.pathname = '/org' + url.pathname
  }
  return NextResponse.rewrite(url)
}
```

**Admin panel auth:**

Ya implementado — `src/middleware.ts` líneas 127-148 llama a `isAdminEmail()` de
`src/lib/admin/admin-gate.ts`, que lee `process.env.ADMIN_EMAILS` (emails separados
por coma). No hay que agregar código nuevo para esta protección.

```bash
# Vercel env var (Production only):
ADMIN_EMAILS=jvillegas.dev@gmail.com
```

**Error handling org:** Página custom `/org/[slug]/not-found.tsx`: "No tienes acceso a esta organización. Contacta a tu administrador." + botón "Ir a mi dashboard".

---

## Arquitectura de código v2

Solo código nuevo. El código existente `/coach/*` no se refactoriza.

| Patrón | ¿Toca existente? | ¿Aplica a nuevo? | Dónde |
|---|---|---|---|
| **Clean Architecture** | No | Sí | Data → Domain (`packages/`) → Presentation (`apps/`) |
| **Feature First** | No | Sí | `/org/[slug]/coaches/` tiene `_data/`, `_actions/`, `_components/` |
| **SDD** | No retroactivo | Sí | Zod schema en `packages/schemas/` ANTES de implementar |

**PR checklist:**
```
[ ] Schema Zod existe en packages/schemas/ antes de esta implementación
[ ] Sin SELECT * en queries nuevas
[ ] RLS testeado desde SDK (no SQL Editor)
[ ] Dark mode en componentes nuevos
```

**Estructura durante enterprise (Fases 0-5):**
```
gymappjp/
├── src/app/coach/*          ← sin tocar
├── src/app/c/[slug]/*       ← sin tocar
├── src/app/org/[slug]/*     ← NUEVO
├── src/app/admin/           ← NUEVO (panel interno)
└── packages/
    ├── types/               ← @eva/types
    └── schemas/             ← @eva/schemas
```

---

## Cambios en código existente requeridos para v2

Solo estos archivos se modifican fuera de `/org/*` y `/admin/*`. Todos mantienen
compatibilidad: si `org_id IS NULL` → comportamiento actual 100% intacto.

> **Cuándo aplicar:** **Fase 1** (Gaps 1, 3, 6, 7 — bloquean coaches con `invite_code`)
> y **Fase 2** (Gaps 2, 4, 5 — bloquean clientes enterprise).

---

### Gap 1 — `middleware.ts:106` — slug-only lookup (Fase 1)

**Problema:** `/c/4XK7M/` devuelve 404 — el middleware busca solo por `slug` pero los
coaches nuevos tienen `invite_code` sin slug asignado.

```typescript
// ⚠️ ANTES de cualquier query — validar y bifurcar por formato:
const INVITE_CODE_RE = /^[A-Z2-9]{5}$/
const SLUG_RE = /^[a-z0-9-]{3,50}$/

const isInviteCode = INVITE_CODE_RE.test(cRouteSlug)
const isSlug = SLUG_RE.test(cRouteSlug)

if (!isInviteCode && !isSlug) {
  return NextResponse.rewrite(new URL('/not-found', request.url))
}

// DESPUÉS — bifurcar en vez de concatenar en .or() (más seguro Y usa índice correcto):
const query = supabase.from('coaches').select('id, slug, invite_code, ...')
const { data: coach } = isInviteCode
  ? await query.eq('invite_code', cRouteSlug).maybeSingle()
  : await query.eq('slug', cRouteSlug).maybeSingle()
```

> **Por qué bifurcar y no `.or()`:** El filtro `.or(`slug.eq.${cRouteSlug},...`)` construye la query pegando el valor del usuario directamente en el string. Aunque Supabase JS lo envía como query param (no SQL directo), caracteres especiales de PostgREST (`,`, `(`, `)`, `.`) podrían manipular el filtro. La bifurcación usa `.eq()` puro — parameterizado, sin riesgo, y usa el índice específico (slug o invite_code según corresponda).

---

### Gap 2 — `middleware.ts:270,294` — verificación cliente org (Fase 2)

**Problema:** Clientes enterprise (`coach_id IS NULL`, asignados via
`coach_client_assignments`) fallan `.eq('coach_id', coach.id)` → redirect loop
infinito a `/login`.

```typescript
// ANTES (mismo patrón en líneas :270 y :294)
const { data: clientData } = await supabase
  .from('clients')
  .select('id, coach_id, ...')
  .eq('id', user.id)
  .eq('coach_id', coach.id)
  .maybeSingle()

// DESPUÉS — standalone primero, org como fallback
const { data: standaloneClient } = await supabase
  .from('clients')
  .select('id, coach_id, org_id, force_password_change, onboarding_completed, is_active, is_archived, use_coach_brand_colors')
  .eq('id', user.id)
  .eq('coach_id', coach.id)
  .maybeSingle()

let clientData = standaloneClient
if (!clientData) {
  const { data: orgClient } = await supabase
    .from('clients')
    .select('id, coach_id, org_id, force_password_change, onboarding_completed, is_active, is_archived, use_coach_brand_colors')
    .eq('id', user.id)
    .not('org_id', 'is', null)
    .maybeSingle()
  if (orgClient) {
    const { data: assignment } = await supabase
      .from('coach_client_assignments')
      .select('id')
      .eq('client_id', user.id)
      .eq('coach_id', coach.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (assignment) clientData = orgClient
  }
}
```

*El fallback solo corre si el usuario no es cliente standalone — zero impacto en standalone existentes.*

---

### Gap 3 — `coach-subscription-gate.ts` — status `org_managed` (Fase 1)

**Problema:** `resolveCoachSubscriptionRedirect` no reconoce `'org_managed'` → coaches
en org son redirecteados a `/coach/reactivate`.

```typescript
// ANTES — primera línea de resolveCoachSubscriptionRedirect:
if (!subscriptionStatus) return null

// DESPUÉS — agregar early return para org_managed:
if (!subscriptionStatus || subscriptionStatus === 'org_managed') return null
```

En `hasEffectiveAccess` (si es llamada directamente):
```typescript
// Agregar antes de la lógica de blocked statuses:
if (status === 'org_managed') return true
```

**En `src/lib/constants.ts`:** agregar `'org_managed'` al union type `SubscriptionStatus`
para que TypeScript no rechace el valor nuevo.

---

### Gap 4 — `src/lib/coach-context.ts` (nuevo) — helper scope (Fase 2)

Centraliza "¿es este coach standalone o parte de una org?". Solo se usa en las
funciones modificadas de Gaps 2 y 5 — no hay refactor masivo.

```typescript
// src/lib/coach-context.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type CoachScope =
  | { type: 'standalone'; coachId: string }
  | { type: 'org'; coachId: string; orgId: string }

export async function getCoachClientScope(
  supabase: SupabaseClient,
  coachId: string
): Promise<CoachScope> {
  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  return data
    ? { type: 'org', coachId, orgId: data.org_id }
    : { type: 'standalone', coachId }
}
```

**Qué NO migrar ahora:** Los 60+ usos de `.eq('coach_id', coachId)` en
`/coach/builder/`, `/coach/nutrition/`, check-ins, etc. Esos solo se migran
cuando se implemente la UI org en esas secciones (Fase 2+). Regla: si no hay
org coaches usando esa feature en prod, no migrar.

---

### Gap 5 — `coach/clients/actions.ts:~133` — createClient para org (Fase 2)

**Problema:** `insert({ coach_id: coach.id, ... })` hardcodeado → coach enterprise
crea cliente standalone en lugar de un cliente del pool org.

```typescript
// ANTES:
await supabase.from('clients').insert({ coach_id: coach.id, email, ...camposRestantes })

// DESPUÉS:
const scope = await getCoachClientScope(supabase, coachId)

if (scope.type === 'org') {
  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({ org_id: scope.orgId, email, ...camposRestantes /* sin coach_id */ })
    .select('id')
    .single()

  if (error?.code === '23505') {
    // Violación de clients_org_email_unique
    return { error: 'Este alumno ya existe en tu organización.' }
  }
  if (error) return { error: error.message }

  await supabase.from('coach_client_assignments').insert({
    org_id: scope.orgId,
    coach_id: scope.coachId,
    client_id: newClient.id,
    assigned_by: userId,
  })
} else {
  // Comportamiento actual intacto — standalone
  await supabase.from('clients').insert({ coach_id: coach.id, email, ...camposRestantes })
}
```

---

### Gap 6 — `c/[coach_slug]/login/actions.ts:62,81` — slug + org client (Fase 1)

**Fix A — lookup del coach (línea ~62):**
```typescript
// ANTES
.eq('slug', coach_slug).single()

// DESPUÉS
.or(`slug.eq.${coach_slug},invite_code.eq.${coach_slug}`).single()
```

**Fix B — verificación de acceso del cliente (línea ~81):**
```typescript
// ANTES
const { data: client } = await adminSupabase
  .from('clients').select('id')
  .eq('id', userId).eq('coach_id', coachData.id).single()
if (!client) { /* signOut + error */ }

// DESPUÉS
const { data: standaloneClient } = await adminSupabase
  .from('clients').select('id')
  .eq('id', userId).eq('coach_id', coachData.id).maybeSingle()

const hasAccess = !!standaloneClient || await (async () => {
  const { data } = await adminSupabase
    .from('coach_client_assignments').select('id')
    .eq('client_id', userId).eq('coach_id', coachData.id)
    .is('deleted_at', null).maybeSingle()
  return !!data
})()

if (!hasAccess) {
  await adminSupabase.auth.admin.signOut(userId)
  return { error: 'No tienes acceso a esta plataforma' }
}
```

---

### Gap 7 — `api/manifest/[coach_slug]/route.ts:18` — slug-only (Fase 1)

```typescript
// ANTES
.eq('slug', slug).maybeSingle()

// DESPUÉS
.or(`slug.eq.${slug},invite_code.eq.${slug}`).maybeSingle()
```

*Branding de org en manifest:* Diferir a Fase 2 — no bloquea Fase 1.

---

### Gap 8 — Admin gate: `ADMIN_EMAILS` (sin cambio de código)

**No hay cambio de código.** `src/lib/admin/admin-gate.ts` ya usa
`process.env.ADMIN_EMAILS` (comma-separated) correctamente.

El plan tenía `ADMIN_USER_ID` mal documentado. Correcciones en este documento:
ver sección "Decisiones fijas" y Fase 0.5.

```bash
# Vercel env var correcta (Production only):
ADMIN_EMAILS=jvillegas.dev@gmail.com
# Múltiples admins: ADMIN_EMAILS=a@b.cl,c@d.cl
```

---

### Tabla resumen: cuándo aplicar cada cambio

| Gap | Archivo | Línea aprox | Fase | Bloquea qué si no se hace |
|---|---|---|---|---|
| 1 | `middleware.ts` | 106 | **Fase 1** | Coaches con `invite_code` → 404 |
| 3 | `coach-subscription-gate.ts` | top | **Fase 1** | Coaches en org → redirect loop a reactivate |
| 6 | `c/[slug]/login/actions.ts` | 62, 81 | **Fase 1** | Clientes org → "No tienes acceso" |
| 7 | `api/manifest/route.ts` | 18 | **Fase 1** | Coaches con `invite_code` → manifest vacío |
| 2 | `middleware.ts` | 270, 294 | **Fase 2** | Clientes org → login loop infinito |
| 4 | `lib/coach-context.ts` (nuevo) | — | **Fase 2** | Queries org coach fallan en clients |
| 5 | `coach/clients/actions.ts` | ~133 | **Fase 2** | Coach crea cliente standalone vs pool org |
| 8 | Solo documentación | — | n/a | — |

---

## Fases de Ejecución

---

### FASE 0 — Git + Supabase local + Monorepo base
**Duración:** 3 días | **Riesgo:** Bajo

#### 0.0 — Acción inmediata (HOY, antes de cualquier código)

**DPA Supabase:** Dashboard → Settings → Legal → Data Processing Agreement → firmar. Gratis, 2 minutos. Sin esto no puedes tener datos de clientes enterprise (Ley 21.719).

#### 0.1 — Git branch

```bash
git checkout -b v2/enterprise
git push -u origin v2/enterprise
```

#### 0.2 — Supabase local

```bash
# Docker Desktop debe estar corriendo (ícono ballena en taskbar)
npx supabase start
# Primera vez: ~10 min descargando imágenes. Siguiente vez: 30 seg.

# Aplica todas las migrations actuales + seed:
npx supabase db reset

# Ver Studio local:
# http://localhost:54323
```

**Staging (crear ahora):**
1. Ir a supabase.com → New project (segundo proyecto free)
2. Guardar URL y keys en `.env.staging.local` (no commitear)
3. En Vercel: Settings → Environment Variables → agregar para environment `Preview`:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL del proyecto staging
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key staging
   - `SUPABASE_SERVICE_ROLE_KEY` = service role staging
4. Environment `Production` conserva las keys del proyecto actual (prod)

**⚠️ Crítico:** Nunca mezclar keys de staging y prod en Vercel. La separación de environments en Vercel (`Preview` vs `Production`) es lo que garantiza que los PRs de `v2/enterprise` no toquen producción.

#### 0.3 — Monorepo base (npm workspaces)

```json
// package.json raíz — agregar:
{
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "tsc --noEmit && npm run typecheck --workspaces --if-present"
  }
}
```

```
packages/
├── types/
│   ├── package.json    → { "name": "@eva/types", "version": "0.0.1", "main": "./index.ts" }
│   └── index.ts        → re-export de database.types.ts
└── schemas/
    ├── package.json    → { "name": "@eva/schemas", "version": "0.0.1", "main": "./index.ts" }
    └── index.ts        → re-export de schemas Zod enterprise
```

**tsconfig.json — agregar paths para que Next.js resuelva los packages:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@eva/types": ["../../packages/types/index.ts"],
      "@eva/schemas": ["../../packages/schemas/index.ts"]
    }
  }
}
```

**Regenerar tipos después de cada migración:**
```bash
npx supabase gen types typescript --local > packages/types/database.types.ts
```

**El código existente** (`src/lib/database.types.ts`) se conserva como está — los nuevos imports enterprise usan `@eva/types`. No migrar el código existente.

#### 0.4 — Domain alias

DNS de tu dominio `.cl`: agregar CNAME `enterprise` → `cname.vercel-dns.com`  
Vercel Pro: Settings → Domains → Add → `enterprise.eva-app.cl`

#### 0.5 — CSP headers + `ADMIN_EMAILS` + Edge Config + Seguridad

**`vercel.json`** — ya existe, agregar headers:
```json
{
  "crons": [...],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com;"
        },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/invite/(.*)",
      "headers": [
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Cache-Control", "value": "no-store, no-cache" }
      ]
    }
  ]
}
```

Agregar a Vercel env vars (Production only):
- `ADMIN_EMAILS` = tu email (`jvillegas.dev@gmail.com`). Múltiples admins: separar por coma. Leído por `src/lib/admin/admin-gate.ts`.

**Edge Config — estructura (feature flags + slug cache):**
```json
{
  "flags": {
    "enterprise_v2": true,
    "org_csv_import": true,
    "org_assign_dnd": false,
    "maintenance_mode": false
  },
  "coach_slug_cache": {}
}
```
> **CSP — `'unsafe-eval'` removido.** Next.js production build no necesita `unsafe-eval` (solo dev/HMR). `'unsafe-inline'` en `script-src` queda por ahora — eliminarlo requiere implementar nonces (middleware genera `crypto.randomBytes(16).toString('base64')` por request y lo pasa via header `x-nonce` a `layout.tsx`). Tarea v2.1 si hay auditoría de seguridad. **Por ahora el win más grande es sacar `unsafe-eval`.**

Kill-switch: si enterprise explota en prod → `flags.enterprise_v2 = false` en 2 segundos sin redeploy → `/org/*` devuelve 503 "Mantenimiento".  
`coach_slug_cache` reduce queries de DB en middleware (hot path `/c/[slug]/`).

**Dependabot — `.github/dependabot.yml`:**
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-patch"]
```

**CORS — Supabase Dashboard → Settings → API → Additional allowed origins:**
```
https://enterprise.eva-app.cl
```

**Sentry — error tracking web (Next.js):**
```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```
```typescript
// sentry.server.config.ts — generado por wizard, solo ajustar:
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  tracesSampleRate: 0.1,  // 10% traces en prod, no quema free tier
  ignoreErrors: ['ResizeObserver loop limit exceeded'],
})
```
```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0,  // no session replay — no burns free tier
})
```
Variables nuevas en Vercel (All environments):
- `SENTRY_DSN` — server-only
- `NEXT_PUBLIC_SENTRY_DSN` — client
- `SENTRY_AUTH_TOKEN` — para source maps upload (generado en sentry.io → Settings → Auth Tokens)

> **Nota:** El plan tiene Sentry para React Native (Fase 6B.0). Este es un **proyecto Sentry separado** (`eva-web`) — misma org Sentry, $0 adicional. Free tier: 5.000 errores/mes por proyecto. Las server actions que fallan silenciosamente en producción serán visibles en Sentry web.

**Uptime monitoring — UptimeRobot (gratis, 50 monitores):**
- Crear cuenta en uptimerobot.com → 3 monitores tipo HTTP(s), intervalo 5 min:
  - `https://eva-app.cl` → alerta si responde != 200
  - `https://enterprise.eva-app.cl` → alerta si responde != 200
  - `https://eva-app.cl/api/health` → alerta si responde != 200
- Alerta: email a `jvillegas.dev@gmail.com` + SMS (gratis en UptimeRobot)

```typescript
// src/app/api/health/route.ts — nuevo endpoint
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient()
    // Verifica DB con timeout implícito de Supabase (3s default)
    const { error } = await supabase.from('coaches').select('id').limit(1).single()
    if (error && error.code !== 'PGRST116') throw error  // PGRST116 = no rows, ok
    return NextResponse.json({ status: 'ok', ts: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
```

**`npm audit` en CI — agregar a `.github/workflows/ci.yml`:**
```yaml
# Agregar como primer job, antes de lint/typecheck:
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20 }
    - run: npm ci --ignore-scripts
    - run: npm audit --audit-level=high
      # Falla el CI si hay vulnerabilidad alta o crítica
      # Para ignorar una vuln específica: npm audit --ignore-scripts --audit-level=high 2>&1 | grep -v "GHSA-xxxx"
```

**Procedimiento de rotación de secrets (documentar, no codear):**
| Secret | Cuándo rotar | Procedimiento |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Si comprometido o anual | Generar nuevas keys → Vercel → Redeploy → Borrar `push_subscriptions` (re-subscriben solos) |
| `MERCADOPAGO_ACCESS_TOKEN` | Si comprometido | Revocar en MP → generar nuevo → Vercel → verificar webhook HMAC |
| `CRON_SECRET` | Anual | `crypto.randomUUID()` → Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo si comprometido | Supabase Dashboard → Roll key → Vercel inmediatamente |

**VAPID keys para Web Push (generar una sola vez):**
```bash
npx web-push generate-vapid-keys
# Copia los dos valores que imprime:
```
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la clave pública (ya referenciada en `PushNotificationBanner.tsx`)
- `VAPID_PRIVATE_KEY` = la clave privada — **NUNCA** agregar prefijo `NEXT_PUBLIC_`, es server-only

Agregar en **Production Y Preview** (los crons corren en ambos environments).

#### 0.6 — GitHub Actions — optimizar para repo privado (500 min/mes)

El CI actual corre lint + typecheck + Vitest + Playwright E2E en cada push. Con repo privado eso consume ~15-20 min/run. Solución: separar jobs por trigger.

```yaml
# .github/workflows/ci.yml — reemplazar el job e2e:
e2e:
  needs: quality
  # Solo corre E2E en merge a v2/enterprise o master, NO en cada PR
  if: github.ref == 'refs/heads/v2/enterprise' || github.ref == 'refs/heads/master'
  runs-on: ubuntu-latest
```

Ahorra ~10-15 min/run en PRs de feature. E2E full solo cuando importa.

#### Done cuando
- [ ] `v2/enterprise` branch pusheado
- [ ] `npx supabase start` levanta sin errores, Studio accesible en `localhost:54323`
- [ ] Segundo proyecto Supabase staging creado, keys en Vercel `Preview`
- [ ] `npm run typecheck` pasa con paths de `@eva/types` y `@eva/schemas`
- [ ] DPA Supabase firmado
- [ ] `enterprise.eva-app.cl` resuelve en Vercel
- [ ] `ADMIN_EMAILS` en Vercel Production env vars

---

### FASE 1 — Backend Enterprise
**Duración:** 2 semanas | **Riesgo:** Medio — migraciones en local/staging

#### 1.1 — Orden de migraciones

```
001_enterprise_organizations.sql      ← trial_ends_at, seats_included, billing_start_date, billing_cycle, purge_scheduled_at, onboarding_step
002_enterprise_members.sql            ← partial unique index (coach_id, org_id) WHERE deleted_at IS NULL
003_enterprise_invites.sql            ← token_hash (SHA-256), NO token plaintext
004_enterprise_assignments.sql
005_enterprise_audit_logs.sql         ← + audit_log_checksums tabla
006_enterprise_org_invoices.sql       ← org_invoices + payment_exceptions
007_clients_org_id.sql                ← + age_confirmed_at
008_coaches_invite_code.sql           ← ADD COLUMN invite_code + active_org_id + backfill + trigger
009_enterprise_workout_programs.sql   ← workout_programs.org_id + created_by_coach_id (B2)
010_enterprise_indexes.sql            ← todos los índices nuevos
011_enterprise_rls.sql
012_enterprise_auth_hook.sql          ← incluye active_org_id en lugar de ORDER BY joined_at
013_enterprise_constraints.sql        ← ON CONFLICT index para race condition (B1):
                                         CREATE UNIQUE INDEX organization_members_active_unique
                                           ON organization_members(org_id, coach_id)
                                           WHERE deleted_at IS NULL AND status = 'active';
```

**Por qué migración 013 separada:** El partial unique index `organization_members_active_unique` es para `ON CONFLICT` en el RPC `accept_org_invite`. Separarlo permite aplicarlo después de que los datos existentes sean consistentes, sin riesgo de conflicto en la migración de backfill.

**Nota:** `subscription_events.org_id` NO se agrega. `org_invoices` reemplaza esa necesidad.

**Migración 007 — backfill invite_code (atómico):**
```sql
ALTER TABLE coaches ADD COLUMN invite_code text;

DO $$
DECLARE
  rec   RECORD;
  code  text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR rec IN SELECT id FROM coaches WHERE invite_code IS NULL LOOP
    LOOP
      code := '';
      FOR i IN 1..5 LOOP
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      BEGIN
        UPDATE coaches SET invite_code = code WHERE id = rec.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE coaches ADD CONSTRAINT coaches_invite_code_unique UNIQUE (invite_code);
ALTER TABLE coaches ALTER COLUMN invite_code SET NOT NULL;
-- Trigger definido arriba en el schema
```

**Migración 008 — coaches active_org_id (sin tocar subscription_events):**
```sql
-- ⚠️ NO agregar org_id a subscription_events — contradice la decisión de usar org_invoices.
-- Pagos enterprise van a org_invoices. subscription_events queda solo para coaches standalone.
-- Solo agregar active_org_id que no se cubrió en otra migración:
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS active_org_id uuid REFERENCES organizations(id);
CREATE INDEX ON coaches(active_org_id) WHERE active_org_id IS NOT NULL;
```

#### 1.2 — Storage bucket para logos de orgs

```sql
-- En Supabase Dashboard → Storage → New bucket
-- Nombre: org-assets
-- Public: false (acceso controlado por signed URLs)

-- Policy: org_admin puede subir/leer logos de SU org
CREATE POLICY "org_admin_upload_logo" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'org-assets' AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = (storage.foldername(name))[1]::uuid
        AND om.coach_id = (SELECT id FROM coaches WHERE user_id = (SELECT auth.uid()))
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
    )
  );

-- MIME: validar en código antes de upload (image/jpeg, image/png, image/webp, max 2MB)
-- Storage policies no filtran MIME — la validación va en la Server Action
```

#### 1.3 — Email templates

Supabase Dashboard → Authentication → Email Templates → Actualizar el template "Invite user":

**Template org-owner-invite (Resend, no Supabase Auth — EVA crea la cuenta vía admin API):**
```
Subject: Tu cuenta de administrador en [Org Name] está lista — EVA

Hola {{nombre}},

EVA configuró tu cuenta de administrador para {{org_name}}.

[  Configurar mi cuenta  ]   ← magic link, expira en 24h

Después de configurar tu contraseña, podrás:
✓ Invitar a tus coaches
✓ Importar tu lista de alumnos
✓ Configurar el branding de tu organización

¿Preguntas? Responde este email o escríbenos a contacto@eva-app.cl
```

URL destino: `enterprise.eva-app.cl/setup-account?token=<magic_link_token>`

**Template coach-invite (Supabase Auth, ya existe — personalizar):**

```html
<!-- Template mínimo para invitación coach a org -->
<h2>Te invitaron a unirte a {{ .OrganizationName }} en EVA</h2>
<p>{{ .InviterName }} te invitó como {{ .Role }} en {{ .OrganizationName }}.</p>
<p>
  <a href="{{ .ConfirmationURL }}">Aceptar invitación</a>
</p>
<p>Este link expira en 7 días.</p>
<p>Si no esperabas esta invitación, ignora este email.</p>
```

Para el MVP, el template se personaliza con variables que pasas en el RPC `invite_coach_to_org`. Supabase maneja el envío vía SMTP configurado.

#### 1.4 — RPCs

```sql
create_organization(slug, name, logo_url, primary_color)
  → crea org + creator como org_owner + audit_log

invite_coach_to_org(org_id, email, role)
  → token = encode(gen_random_bytes(32), 'hex')
  → inserta en organization_invites
  → audit_log

accept_org_invite(raw_token)
  → hash = encode(sha256(raw_token::bytea), 'hex')
  → busca organization_invites WHERE token_hash = hash
  → valida: no expirado, no usado (respuesta uniforme en ambos casos — previene enumeración)
  → caso A — coach YA tiene cuenta EVA:
      → busca coaches WHERE user_id = auth.uid()
      → INSERT INTO organization_members ON CONFLICT ON CONSTRAINT organization_members_active_unique DO NOTHING
      → si DO NOTHING (ya era miembro activo) → RAISE EXCEPTION 'Ya eres miembro activo de esta organización'
      → crea organization_members con coach_id encontrado
  → caso B — coach NO tiene cuenta EVA (email nuevo en el sistema):
      → crea auth.users via supabase.auth.admin.createUser({ email, email_confirm: true })
      → usuario recibe email "Crea tu contraseña" de Supabase Auth
      → crea coaches row con user_id nuevo
      → crea organization_members
      → nota: el coach queda en status='invited' hasta que confirme email y cree password
  → si coach tenía plan standalone activo → suspender (coaches.subscription_status = 'org_managed')
  → CANCELAR pre-approval de MercadoPago activo del coach:
      → buscar en subscription_events el preapproval_id más reciente del coach
      → llamar MP API: PUT /preapproval/{id} con status: 'cancelled'
      → registrar el evento en subscription_events
  → marca invite used_at = now()
  → audit_log

-- RPC paginado para audit log completo (B3)
get_org_audit_logs(org_id, limit=20, offset=0, action_filter=NULL) SECURITY DEFINER
  → JOIN auth.users para nombre del actor
  → LIMIT LEAST(p_limit, 100) — cap en 100 por página
  → filtro opcional por action type

assign_client_to_coach(org_id, coach_id, client_id)
  → valida coach en org + cliente en pool
  → upsert coach_client_assignments
  → audit_log

unassign_client(org_id, client_id)
  → soft delete assignment (deleted_at = now())
  → notificación pendiente: implementar en Fase 5 (email simple)
  → audit_log

get_org_dashboard_stats(org_id) SECURITY DEFINER
  → coaches activos, clientes pool/asignados, workouts 7d, health_score
  → LIMIT explícito en cada subquery

import_clients_to_org(org_id, clients jsonb[])
  → MAX 200 elementos (error si >200)
  → insert en clients con org_id
  → dedup via constraint
  → retorna { inserted, duplicates, errors[] }
  → audit_log

remove_coach_from_org(org_id, coach_id)
  → soft delete organization_members
  → clientes asignados al coach → quedan en pool sin asignar (deleted_at en assignment)
  → coach.subscription_status vuelve a null (debe reactivar plan standalone)
  → enviar push/email al coach: "Fuiste removido de [Org]. Reactivá tu plan standalone."
  → audit_log con metadata: { clients_unassigned: N }

-- Audit log tamper-evident checksums (S3)
CREATE TABLE audit_log_checksums (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL UNIQUE,
  checksum     text NOT NULL,  -- SHA-256 del JSON de audit_logs de esa semana
  row_count    int NOT NULL,
  generated_at timestamptz DEFAULT now()
  -- SIN deleted_at, SIN UPDATE policy — append-only como org_audit_logs
);

-- Excepciones de pago / créditos (FT5)
CREATE TABLE payment_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id),
  amount_clp       int NOT NULL,
  reason           text NOT NULL,
  approved_by      uuid REFERENCES auth.users(id),
  approved_at      timestamptz DEFAULT now(),
  resend_message_id text,
  notes            text
);

-- Audit de purgas (Ley 21.719) — append-only, NUNCA borrar esta tabla
-- Referenciada en cron org-data-purge. Definida aquí aunque se usa en Fase 3.
CREATE TABLE purge_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,        -- SIN FK — la org ya fue eliminada
  org_slug     text NOT NULL,        -- nombre para auditoría post-purga
  purged_at    timestamptz DEFAULT now(),
  rows_deleted jsonb,                -- { clients: N, members: M, assignments: K, audit_logs: J }
  initiated_by text DEFAULT 'cron'  -- 'cron' | 'manual_admin'
);

-- Programas creados dentro de org (B2 — ownership al salir coach)
ALTER TABLE workout_programs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE workout_programs ADD COLUMN IF NOT EXISTS created_by_coach_id uuid REFERENCES coaches(id);
-- org_id NOT NULL en programas enterprise → si coach sale, quedan en la org accesibles al admin
-- created_by_coach_id → referencia histórica (coach ya no tiene acceso vía RLS)

-- active_org_id en coaches para multi-org switching (A2)
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS active_org_id uuid REFERENCES organizations(id);
-- Org-switcher actualiza active_org_id → supabase.auth.refreshSession() → nuevo JWT correcto
-- Elimina la dependencia de ORDER BY joined_at DESC LIMIT 1 en el Auth Hook

-- TABLA ADICIONAL: facturas de org separadas de subscription_events de coaches
-- subscription_events mezclaría pagos B2C (coach) y B2B (org) — separar ahora evita deuda
CREATE TABLE org_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  amount_clp   int NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at      timestamptz,
  payment_ref  text,           -- número de transferencia o ID de MP
  notes        text,
  created_at   timestamptz DEFAULT now()
);
-- org_id en subscription_events se depreca — usar org_invoices para todo lo enterprise
CREATE INDEX ON org_invoices(org_id, period_start DESC);
CREATE INDEX ON org_invoices(status) WHERE status IN ('pending','overdue');
```

#### 1.5 — Rate limits (agregar a `src/lib/rate-limit.ts`)

```typescript
// invite accept: 10 intentos / IP / hora
export async function rateLimitInviteAccept(identifier: string)

// org creation: 3 orgs / user / día
export async function rateLimitOrgCreation(identifier: string)
```

**Comportamiento si Upstash Redis está caído:** definir explícitamente en `src/lib/rate-limit.ts`:
- `rateLimitInviteAccept`: fail-CLOSED (bloquear si Redis no responde). Motivo: es el endpoint más sensible a abuso.
- `rateLimitOrgCreation`: fail-OPEN (permitir si Redis no responde). Motivo: bloquear creación de orgs por caída de Redis es peor que el abuso (raro) de crear orgs.

```typescript
// Patrón fail-closed para invite accept:
try {
  const result = await ratelimit.limit(identifier)
  if (!result.success) return { error: 'Demasiados intentos. Intenta en 1 hora.' }
} catch {
  return { error: 'Servicio temporalmente no disponible.' } // fail-closed
}
```

#### 1.5b — MFA para org_owner (Supabase TOTP built-in)

```typescript
// En custom_access_token_hook — si es org_owner Y no tiene MFA enrollado:
const { data: factors } = await supabase.auth.mfa.listFactors()
if (factors?.totp?.length === 0 && org_rec.role === 'org_owner') {
  claims = jsonb_set(claims, '{requires_mfa_setup}', 'true')
}
```

En middleware para rutas `/org/*`:
```typescript
if (jwt.requires_mfa_setup && !url.pathname.includes('/setup-mfa')) {
  return NextResponse.redirect(new URL('/org/setup-mfa', request.url))
}
```

La página `/org/setup-mfa` usa `supabase.auth.mfa.enroll({ factorType: 'totp' })` — built-in, $0, no librerías extras.

#### 1.5c — Idempotency en webhook MercadoPago

MercadoPago puede enviar el mismo evento dos veces (retry automático). Agregar guard en el handler de webhook:

```typescript
// src/app/api/webhooks/mercadopago/route.ts — agregar ANTES de procesar:
const existing = await supabase
  .from('subscription_events')
  .select('id')
  .eq('external_payment_id', event.data.id)
  .maybeSingle()
if (existing.data) return new Response('OK', { status: 200 }) // ya procesado — idempotente
```

Campo `external_payment_id` debe existir en `subscription_events`. Si no existe → agregar en migración 008 (ahora 007, ver arriba).

#### 1.6 — Server Actions

```
src/app/org/[slug]/_actions/
├── org.actions.ts          ← createOrganization, updateOrgSettings, suspendOrg
├── members.actions.ts      ← inviteCoach, acceptInvite, revokeInvite, suspendMember, removeCoach
├── clients.actions.ts      ← assignClient, unassignClient, importClients (→ Edge Function)
└── billing.actions.ts      ← registerPayment, generatePaymentLink, suspendForNonPayment
```

Regla en todas las actions: `org_id` siempre desde `auth.uid()` vía DB, nunca del body.

**CSV import → Supabase Edge Function (evita timeout 60s de Vercel):**
```typescript
// clients.actions.ts — importClients llama a Edge Function en vez de insert directo
const result = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/import-clients`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ org_id, clients }),
  }
)
// La Edge Function (Deno, sin timeout en free tier) procesa hasta 200 clientes
// Retorna { inserted: N, duplicates: M, errors: [...] }
```
Edge Function en `supabase/functions/import-clients/index.ts` — Deno, sin timeout, 500k invocaciones/mes gratis.

#### 1.7 — P0: Offline workout queue + Push send (críticos HOY)

Estos dos gaps afectan producción actual. Aplicar en Fase 1, **antes** del onboarding enterprise.

##### 1.7.1 — Offline workout log queue

**Problema:** El alumno pierde WiFi en el gym → loguea una serie → server action falla → dato perdido silenciosamente. La nutrición tiene cola offline; el workout NO.

```typescript
// NUEVO: src/lib/workout-offline-queue.ts
type WorkoutOfflineLog = {
  blockId: string; setNumber: number; weightKg: number | null
  repsDone: number | null; rpe: number | null; rir: number | null
  planId: string; coachSlug: string; timestamp: number
}
const QUEUE_KEY = 'eva:workout-offline-queue'
export const readWorkoutOfflineQueue = (): WorkoutOfflineLog[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}
export const enqueueWorkoutLog = (log: WorkoutOfflineLog): void => {
  const q = readWorkoutOfflineQueue(); q.push(log)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}
export const writeWorkoutOfflineQueue = (q: WorkoutOfflineLog[]): void =>
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
```

```typescript
// NUEVO: src/app/c/[coach_slug]/_components/OfflineWorkoutQueueSync.tsx
// Mismo patrón que OfflineNutritionQueueSync.tsx:
// - useEffect drena la cola al montar
// - window.addEventListener('online', flushQueue) al reconectar
// - flushQueue() llama logSetAction() por cada item pendiente
// Agregar en layout.tsx del /c/[slug]/ junto a OfflineNutritionQueueSync
```

```typescript
// MODIFICAR: LogSetForm.tsx — en el catch del submit / cuando !navigator.onLine:
if (!navigator.onLine) {
  enqueueWorkoutLog({ blockId, setNumber, weightKg, repsDone, rpe, rir,
    planId, coachSlug, timestamp: Date.now() })
  addOptimisticLogged(true)
  toast.info('Sin conexión — el log se guardará al reconectar', { icon: '📶' })
  return
}
```

##### 1.7.2 — Push notification send (completar sistema existente)

**Problema:** `push_subscriptions` tabla existe y subscribe funciona, pero `VAPID_PRIVATE_KEY` no estaba configurado y no hay lógica de envío. El banner de nutrición pide permisos que no sirven todavía.

**Instalar:**
```bash
npm install web-push && npm install --save-dev @types/web-push
```

**NUEVO: `src/lib/push.ts`**
```typescript
import webpush from 'web-push'
import { createServiceRoleClient } from './supabase/admin-client'

webpush.setVapidDetails(
  'mailto:contacto@eva-app.cl',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = { title: string; body: string; url: string; icon?: string }

export async function sendPushToClient(clientId: string, payload: PushPayload): Promise<void> {
  const admin = createServiceRoleClient()
  const { data: subs } = await admin
    .from('push_subscriptions').select('endpoint, p256dh, auth').eq('client_id', clientId)
  if (!subs?.length) return

  const json = JSON.stringify({
    ...payload,
    icon: payload.icon ?? '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
  })

  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, json
      )
    } catch (err: any) {
      // 410 Gone / 404 = suscripción expirada → limpiar
      if (err.statusCode === 410 || err.statusCode === 404) {
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }))
}

export async function sendPushToCoachClients(coachId: string, payload: PushPayload): Promise<void> {
  const admin = createServiceRoleClient()
  const { data: clients } = await admin
    .from('clients').select('id').eq('coach_id', coachId).eq('is_active', true)
  if (!clients?.length) return
  await Promise.allSettled(clients.map((c) => sendPushToClient(c.id, payload)))
}
```

**Integrar en cron `nutrition-reminder`** (`src/app/api/cron/nutrition-reminder/route.ts`):
```typescript
import { sendPushToClient } from '@/lib/push'
// Por cada cliente con plan activo que tenga suscripción:
await sendPushToClient(client.id, {
  title: '🥗 Hora de registrar tu comida',
  body: `Tienes comidas sin registrar hoy`,
  url: `/c/${coachSlug}/nutrition`,
})
```

**Nuevo trigger: cuando coach asigna workout nuevo → push al alumno.**
En la server action de asignación de plan: `await sendPushToClient(clientId, { title: '💪 Nuevo entrenamiento', ... })`.

**Seguridad:** `/api/push/send` NO debe ser endpoint público. El envío siempre desde server actions o crons autenticados — nunca desde el cliente.

#### Done cuando
- [ ] `npx supabase db reset` aplica las 11 migraciones sin error en local
- [ ] RLS tests desde SDK pasan (ver Fase 4)
- [ ] `npm run typecheck` pasa con tipos regenerados
- [ ] Bucket `org-assets` creado con policies correctas
- [ ] `web-push` instalado, `VAPID_PRIVATE_KEY` en Vercel, `sendPushToClient` funciona
- [ ] Cron `nutrition-reminder` envía push real (verificar con Inbucket/dispositivo físico)
- [ ] `OfflineWorkoutQueueSync` drena correctamente al reconectar

---

### FASE 2 — Frontend Enterprise
**Duración:** 2 semanas | **Riesgo:** Bajo para standalone, medio para enterprise

#### 2.1 — Layout org + Admin panel

```
src/app/org/[slug]/
├── layout.tsx          ← OrgAdminLayout: verifica membresía, carga branding
├── error.tsx           ← error boundary por layout (DB timeout, JWT inválido)
├── not-found.tsx       ← "No tienes acceso. Contacta a tu administrador."
├── page.tsx            ← dashboard
├── loading.tsx
├── coaches/
│   ├── page.tsx
│   └── error.tsx       ← error boundary por módulo
├── clients/
│   ├── page.tsx
│   └── error.tsx
├── assign/
│   ├── page.tsx
│   └── error.tsx
└── settings/
    ├── page.tsx
    └── error.tsx

src/app/admin/
├── layout.tsx          ← verifica ADMIN_EMAILS via isAdminEmail() en middleware
├── orgs/
│   └── page.tsx        ← lista todas las orgs: status, coaches, último pago, health score
└── ...
```

**Error boundary mínimo (copiar en cada `error.tsx`):**
```tsx
// src/app/org/[slug]/error.tsx
'use client'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-8">
      <p className="text-sm text-destructive">Error al cargar esta sección</p>
      <button onClick={reset} className="text-xs text-muted-foreground underline">
        Reintentar
      </button>
    </div>
  )
}
```
> Copiar en `coaches/error.tsx`, `clients/error.tsx`, `assign/error.tsx`, `settings/error.tsx`. El `digest` lo genera Next.js automáticamente y aparece en Sentry para correlacionar con logs de servidor.

#### 2.2 — Empty states (crítico para primer onboarding)

Cada pantalla tiene 3 estados: loading skeleton → empty state → contenido.

| Pantalla | Empty state |
|---|---|
| Dashboard org | "Tu organización está lista. Comienza invitando coaches →" + CTA |
| Lista coaches | "Aún no hay coaches. Invita al primero →" + botón invitar |
| Pool clientes | "El pool está vacío. Importa desde CSV o agrega manualmente →" |
| Asignaciones | "Hay [N] clientes sin asignar. Asígnalos a un coach →" |

Sin empty states el onboarding parece "roto" aunque no lo esté.

#### 2.3 — Pantallas detalladas

**Dashboard `/org/[slug]/`:**
- Stats cards: coaches activos / clientes pool / clientes asignados / workouts semana
- Actividad reciente (audit_log últimas 20 acciones con iconos por tipo)
- Skeletons por sección (RSC + Suspense)
- Dark mode día 1

**Pool de clientes `/org/[slug]/clients`:**
- Server-side pagination: 20 por página con búsqueda nombre/email
- Búsqueda usa índice `pg_trgm` — agregar en migración 010:
  ```sql
  -- pg_trgm ya está habilitado en Supabase
  CREATE INDEX clients_name_trgm  ON clients USING gin (name  gin_trgm_ops) WHERE org_id IS NOT NULL;
  CREATE INDEX clients_email_trgm ON clients USING gin (email gin_trgm_ops) WHERE org_id IS NOT NULL;
  -- Query: .or(`name.ilike.%${q}%,email.ilike.%${q}%`) — usa índice con pg_trgm, no seq scan
  ```
  Sin este índice: `ILIKE '%query%'` → seq scan en cada búsqueda → lento con 500+ clientes.
- Import CSV: preview primeras 5 filas + conteo errores antes de confirmar
- Logo upload: validación MIME client (UX) + Storage policy server (seguridad)
  - Permitidos: `image/jpeg`, `image/png`, `image/webp`, max 2MB
  - Rechazado → mensaje: "Solo se aceptan imágenes JPG, PNG o WebP de hasta 2MB"

**Matriz asignación `/org/[slug]/assign`:**
- Drag-and-drop o dropdown (max 2 clicks para asignar)
- Optimistic update con rollback
- Mobile responsive — org_admin asigna desde celular

**Admin panel `/admin/orgs`:**
- Tabla: Org Name | Status | Coaches | Último pago | Health Score | Acciones
- Acciones: Suspender | Reactivar | Ver detalle | Registrar pago
- Solo accesible con tu cuenta (middleware verifica `ADMIN_EMAILS` via `isAdminEmail()`)

#### 2.4 — Coach dentro de org — cambios mínimos a /coach/

```typescript
// src/app/coach/clients/_data/clients.queries.ts — agregar:
async function getClientsForCoach(coachId: string) {
  const isOrgCoach = await checkIsOrgCoach(coachId) // consulta organization_members
  if (isOrgCoach) {
    return supabase
      .from('coach_client_assignments')
      .select('clients(*)')
      .eq('coach_id', coachId)
      .is('deleted_at', null)
  }
  // Comportamiento actual intacto
  return supabase.from('clients').select('*').eq('coach_id', coachId)
}
```

- Cero cambio visual
- Header muestra: "Parte de **[Org Name]**" + logo org (pequeño)
- Tab billing deshabilitada + tooltip: "Tu organización gestiona el billing"

#### 2.5 — Org-switcher (coach en múltiples orgs)

JWT trae `org_id` del `active_org_id` del coach (o el más reciente si es NULL).  
Si coach pertenece a 2+ orgs → dropdown en header.  
Cambiar org:
```typescript
// 1. Actualizar active_org_id en DB
await supabase.from('coaches').update({ active_org_id: newOrgId }).eq('id', coachId)
// 2. Refrescar sesión → nuevo JWT con org_id actualizado
await supabase.auth.refreshSession()
// 3. Router.refresh() para recargar RSC con nuevo contexto
```
No se invalidan sesiones en otros dispositivos. `active_org_id` en DB es la fuente de verdad.

#### 2.6 — Onboarding org (5 pasos)

```
Paso 1 (bloqueante): Crear org → nombre, slug, logo, color
Paso 2 (libre):      Invitar coaches → email → reciben email desde Inbucket/SMTP
Paso 3 (libre):      Importar clientes → CSV preview → confirmar
Paso 4 (libre):      Asignar → matriz coach ↔ clientes
Paso 5 (review):     Resumen → confirmar go-live
```

**Recovery si admin abandona el wizard a mitad:**
```typescript
// src/app/org/[slug]/onboarding/layout.tsx
// Al cargar: leer organizations.onboarding_step → redirigir al paso correcto
const org = await getOrg(slug)  // incluye onboarding_step (0-4)
if (org.onboarding_completed_at) {
  redirect(`/org/${slug}`)  // ya terminó el onboarding
}
if (org.onboarding_step > 0) {
  redirect(`/org/${slug}/onboarding/step-${org.onboarding_step}`)
}

// En cada "Siguiente" del wizard (server action):
await supabase
  .from('organizations')
  .update({ onboarding_step: nextStep })
  .eq('id', orgId)
// onboarding_step column ya existe en el schema (DEFAULT 0)
// Paso 5 completo → UPDATE SET onboarding_completed_at = now(), onboarding_step = 5
```
Sin recovery → si el admin cierra el browser en paso 3 y vuelve mañana, vuelve al paso 1 y repite trabajo. Con recovery → vuelve al paso 3 directamente.

#### 2.7 — Demo org (para ventas)

Crear en staging: "EVA Demo Gym"
- 3 coaches con fotos de Unsplash
- 30 clientes ficticios con programas asignados
- Actividad simulada de 4 semanas

Acceso solo tú. Usar en demos de ventas via screenshare.

#### 2.8 — Web APIs + Banner "Bájate la app" (features cliente)

> **Aclaración importante:** Las features de esta sección son **Web APIs del browser** — no son "PWA". Corren igual en Chrome/Safari sin que el usuario instale nada. El concepto de "instalar la PWA" queda **descartado** porque la app RN lo reemplaza completamente. No construir ni mostrar ningún prompt de instalación PWA.

Progressive enhancement — todo degrada silenciosamente si el browser no soporta. Van en la app cliente `/c/[slug]/`.

##### 2.8.0 — Banner "Descarga la app EVA" — P0 (2h)

Reemplaza el PWA install prompt. Cuando un alumno abre `/c/[slug]/` desde iOS o Android, mostrar banner invitando a bajar la app nativa.

```tsx
// src/components/client/AppDownloadBanner.tsx
'use client'
import { useState, useEffect } from 'react'
import { Smartphone, X } from 'lucide-react'

export function AppDownloadBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('app_banner_dismissed')
    const isNative = navigator.userAgent.includes('EVANative') // header Expo
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
    if (isMobile && !dismissed && !isNative) setVisible(true)
  }, [])

  if (!visible) return null

  const isIOS = /iPhone|iPad/.test(navigator.userAgent)
  const storeUrl = isIOS
    ? 'https://apps.apple.com/app/eva-fitness/idXXXXXXXXX'
    : 'https://play.google.com/store/apps/details?id=cl.evaapp.eva'

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
      <Smartphone className="h-8 w-8 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Mejor en la app</p>
        <p className="text-xs text-muted-foreground">Notificaciones, offline y más</p>
      </div>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shrink-0"
      >
        {isIOS ? 'App Store' : 'Google Play'}
      </a>
      <button
        onClick={() => {
          localStorage.setItem('app_banner_dismissed', '1')
          setVisible(false)
        }}
        className="shrink-0 text-muted-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- Montar en `src/app/c/[coach_slug]/layout.tsx` — aplica a todas las rutas cliente
- `EVANative` en userAgent: Expo pasa `navigator.userAgent` custom via `expo-constants` → ya viene en la app RN, no mostrar el banner dentro de la app
- URLs de stores: placeholders hasta que existan los listings reales — reemplazar en Fase 6B antes de submission
- Coaches (`/coach/*`): nunca mostrar este banner

**Patrón "Solo disponible en la app móvil":**
Para features que existen en RN pero NO en web, mostrar en la posición donde iría el feature:
```tsx
function AppOnlyFeatureBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <Smartphone className="h-4 w-4 shrink-0 text-primary/60" />
      <span>
        <span className="font-semibold">{label}</span>
        {' — '}
        <span>Disponible en la app EVA móvil</span>
      </span>
    </div>
  )
}
```
Usar en: sección de pedómetro, HealthKit, NFC check-in, background timer real.

##### 2.8.1 — Media Session API — P1 (3h)

Muestra el ejercicio actual y timer en la **pantalla de bloqueo** del teléfono. Sin desbloquear.

**Soporte:** Chrome 73+, Safari 15+, Firefox 82+. PWA instalada y browser normal.

**Modificar `RestTimer.tsx`** — al iniciar el timer:
```typescript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: exerciseName,        // prop nueva — nombre del ejercicio actual
    artist: 'Descanso activo',
    album: `Serie ${currentSet} de ${totalSets}`,
    artwork: [{ src: coachLogoUrl, sizes: '512x512', type: 'image/png' }]
  })
  navigator.mediaSession.setActionHandler('pause', () => setIsActive(false))
  navigator.mediaSession.setActionHandler('play', () => setIsActive(true))
  // Actualizar posición cada segundo en el interval existente:
  navigator.mediaSession.setPositionState({
    duration: totalSeconds,
    position: totalSeconds - timeLeft,
    playbackRate: 1,
  })
}
// Al cerrar: navigator.mediaSession.metadata = null
```

Props nuevas a pasar desde `WorkoutExecutionClient.tsx` via `WorkoutTimerProvider`:
`exerciseName`, `coachLogoUrl`, `currentSet`, `totalSets`.

```
Resultado en pantalla de bloqueo:
┌──────────────────────────────────────┐
│ [Logo Coach]   Sentadilla — Serie 3/5│
│               Descanso: 1:23         │
│   [◀]     [⏸ Pausar]     [▶]        │
└──────────────────────────────────────┘
```

##### 2.8.2 — Web Share + PR Card (Canvas) — P1 (6h)

Comparte récords personales y workout completado al menú nativo iOS/Android (WhatsApp, Instagram, etc.).

**Modificar `WorkoutSummaryOverlay.tsx`** — botón "Compartir":
```typescript
async function handleShare(title: string, stats: Stats, branding: Branding) {
  const text = `¡Completé "${title}" 💪 — ${stats.setsLogged} series, ${stats.volume}kg`

  // Generar imagen branded en canvas
  const canvas = document.createElement('canvas')
  canvas.width = 1080; canvas.height = 1080
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = branding.primaryColor; ctx.fillRect(0, 0, 1080, 1080)
  // ... dibujar logo coach, nombre alumno, stats, marca EVA

  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  const file = new File([blob], 'eva-workout.png', { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'EVA Fitness', text })
  } else if (navigator.share) {
    await navigator.share({ title: 'EVA Fitness', text })    // sin imagen
  } else {
    await navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
  }
}
```

También en `PersonalRecordsBanner.tsx`: botón "📤" que genera imagen de PR y comparte.

##### 2.8.3 — Fullscreen + Orientation lock — P2 (2h)

Elimina chrome del browser durante workout. Bloquea portrait en Android Chrome.

**Modificar `WorkoutExecutionClient.tsx`** — botón `Maximize2` en header:
```typescript
async function toggleWorkoutMode() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {})
    await screen.orientation.lock('portrait').catch(() => {})  // Android only
  } else {
    document.exitFullscreen().catch(() => {})
    screen.orientation.unlock()
  }
}
// Al desmontar: cleanup en useEffect return
// Mostrar botón solo si: 'fullscreenEnabled' in document && document.fullscreenEnabled
```

##### 2.8.4 — Speech Synthesis (voz del coach) — P2 (2h)

Voz nativa del teléfono anuncia fin de descanso y confirma series. Toggle on/off en settings.

**Agregar en `src/lib/audioUtils.ts`:**
```typescript
export function speakWorkoutCue(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-CL'; u.rate = 1.1; u.pitch = 1.0
  const esVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es'))
  if (esVoice) u.voice = esVoice
  window.speechSynthesis.speak(u)
}
```

**Integrar en `RestTimer.tsx`** — en `triggerAlarm()`:
```typescript
if (voiceEnabled) speakWorkoutCue('¡Tiempo! Prepárate para la siguiente serie.')
```

**En `WorkoutTimerSettingsPanel.tsx`:** nuevo toggle "Voz del coach" — persiste en localStorage junto a `sound` y `volume`.

##### 2.8.5 — Badging API — P2 (1h)

Número rojo en el ícono de la PWA instalada cuando hay workouts nuevos.

**Modificar `public/sw.js`:**
```javascript
self.addEventListener('push', (event) => {
  // ... código existente showNotification ...
  if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(1).catch(() => {})
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {})
  // ... código existente openWindow ...
})
```

**En dashboard `page.tsx`** (server component, llamar desde client component al montar):
```typescript
useEffect(() => { navigator.clearAppBadge?.() }, [])
```

**Requiere** que push send (1.7.2) esté implementado.

##### 2.8.6 — Background timer real — SOLO APP MÓVIL

En la web, el Wake Lock es best-effort y el OS puede revocarlo. Si el alumno minimiza el browser, el timer puede pausarse o perder precisión.

**En la web:** el timer existente usa `endTimeRef` (timestamp absoluto) que compensa el drift. Es lo mejor posible en web.

**En la posición del settings donde estaría el "timer en background":**
```tsx
<AppOnlyFeatureBadge label="Timer en background real" />
```

En RN: `expo-task-manager` + `expo-background-fetch` → timer corre aunque la app esté minimizada. Implementar en Fase 6B.

#### Done cuando
- [ ] Onboarding 5 pasos funciona end-to-end en staging
- [ ] Empty states presentes en todas las pantallas
- [ ] Coach standalone: cero cambios visibles en /coach/*
- [ ] Dark mode en todas las pantallas enterprise
- [ ] Admin panel `/admin/orgs` funciona y está protegido
- [ ] Logo upload rechaza no-imágenes en server side
- [ ] `AppDownloadBanner` visible en mobile `/c/[slug]/`, no visible en `/coach/*`
- [ ] Media Session muestra ejercicio en pantalla de bloqueo (Chrome + Safari)
- [ ] Web Share funciona en iOS Safari + Android Chrome + fallback clipboard desktop
- [ ] Fullscreen workout activo con botón visible solo si browser lo soporta
- [ ] Speech synthesis toggle funcional y persistido
- [ ] Badge API se activa con push y se limpia al abrir dashboard
- [ ] Cero prompts de instalación PWA en toda la app

---

### FASE 3 — Legal, Billing, Sales y Procesos
**Duración:** 1 semana (paralelo a Fase 2) | **Riesgo:** Alto si se saltea

#### 3.1 — Legal

**Contratos (Google Docs → compartir por link para firma):**

Alternativa gratuita a DocuSign: enviar por email, pedir que respondan confirmando aceptación. En Chile, aceptación por email es válida legalmente para servicios digitales (Art. 12 Ley 19.799). Para mayor seguridad → FirmaFácil (plan básico gratuito).

Cláusulas obligatorias:
- EVA como procesador, gym como controlador de datos
- Datos de alumnos pertenecen al gym
- Retención post-cancelación: 90 días → export JSON + purga
- Para menores de 14: gym responsable de consentimiento parental
- SLA: disponibilidad 99% mensual, soporte WhatsApp en horario hábil
- **Sin reembolsos proporcionales** — cancelación efectiva al fin del mes en curso
- Precio y seats negociados en este contrato
- Escalación de soporte: Coach → org_admin → EVA (no coaches directamente)

**Terms of Service (actualizar antes de Fase 4):**
- Agregar sección: "Planes Enterprise"
- Roles: org_owner, org_admin, coach dentro de org
- Datos de alumnos: gym es el controlador, EVA procesa
- Qué pasa si coach sale de org: sus programas se conservan en el pool, datos pertenecen a la org
- Jurisdicción: Santiago de Chile

**Política de privacidad (actualizar antes de Fase 4):**
- Mención de datos de salud (workout, nutrición, check-in)
- EVA como procesador / gym como controlador
- Derechos ARCO (Acceso, Rectificación, Cancelación, Oposición)
- Retención: 90 días post-cancelación
- Email de contacto visible para ejercer ARCO: `privacidad@eva-app.cl` (alias de tu email)
- SLA de respuesta: 15 días hábiles (Ley 21.719 lo exige)

**Implementación técnica ARCO (mínimo para MVP):**
- Agregar en footer de la app cliente y coach: "Ejercer derechos ARCO → privacidad@eva-app.cl"
- Respuesta manual por email — sin UI de autoservicio por ahora (aceptable hasta 10+ orgs)
- Documentar el proceso interno: qué datos exportar (JSON de workouts, nutrición, check-ins), qué tabla borrar (clientes.deleted_at + cascade)

**Menores de 14 años — implementación técnica:**
El contrato enterprise dice "gym responsable del consentimiento parental". Pero si un alumno de 13 años se registra directamente con invite_code, no hay verificación. Agregar en el onboarding del alumno (web y RN):

```typescript
// Pantalla "Confirmar edad" — mostrar antes del primer login de alumno nuevo:
// "Declaro tener 14 años o más, o cuento con autorización de mis padres o tutores"
// Checkbox requerido + guardar timestamp en clients.age_confirmed_at
```

```sql
ALTER TABLE clients ADD COLUMN age_confirmed_at timestamptz;
-- NULL = alumno antiguo (grandfathered) o no ha completado el paso
```

**DPA Vercel — confirmar está firmado:**
- vercel.com/legal → descargar DPA → firmar digitalmente
- Si no está firmado: es deuda de compliance activa (Fase Inmediata lo debería haber resuelto)
- Agregar checkbox en "Done cuando" de Fase 4: `[ ] DPA Vercel firmado y guardado`

**DPA chain:**
- Supabase: Dashboard → Settings → Legal → DPA → firmar (FASE 0, ya hecho)
- Vercel: vercel.com/legal → descargar DPA → firmar
- MercadoPago: términos vigentes incluyen tratamiento de datos — suficiente para MVP

**Nota SII / Facturación (estado actual 2026-05-17):**
En proceso de constitución de empresa legal. Actualmente emitiendo boletas de honorarios manualmente en sii.cl por cada pago recibido. La **Factura Electrónica** (para empresas con RUT) requiere CAF (Código de Autorización de Folios) — tramitar en SII.cl cuando la empresa esté constituida, antes de tener el 5to cliente enterprise que pague como empresa. Mientras tanto: si el gym paga como persona natural → boleta de honorarios. Si paga como empresa → documentar en el contrato que la factura se emitirá una vez tramitado el CAF.

**Cookie consent — Ley 21.719 (cookies analíticas):**
PostHog usa cookies/localStorage para analytics. La Ley 21.719 clasifica cookies analíticas como no esenciales → requieren consentimiento previo del usuario.

```typescript
// src/components/CookieConsent.tsx — implementar en landing y /coach/*, /c/[slug]/*
'use client'
import { useEffect, useState } from 'react'
import posthog from 'posthog-js'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) setVisible(true)
    else if (localStorage.getItem('cookie_consent') === 'accepted') {
      posthog.opt_in_capturing()
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-4 flex items-center justify-between gap-4">
      <p className="text-xs text-muted-foreground">
        Usamos cookies analíticas para mejorar la plataforma. Puedes aceptar o rechazar.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { posthog.opt_out_capturing(); localStorage.setItem('cookie_consent', 'rejected'); setVisible(false) }}
          className="text-xs text-muted-foreground underline"
        >Rechazar</button>
        <button
          onClick={() => { posthog.opt_in_capturing(); localStorage.setItem('cookie_consent', 'accepted'); setVisible(false) }}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
        >Aceptar</button>
      </div>
    </div>
  )
}
```
Montar en `src/app/layout.tsx` (root layout). PostHog debe inicializarse con `opt_out_capturing_by_default: true` en `src/lib/posthog.ts` — captura solo después del consent.

**Reinvitar org_owner — flujo si magic link expiró (24h):**
```typescript
// src/app/admin/orgs/[orgId]/_actions/resend-owner-invite.ts
// En admin panel: botón "Reenviar invitación" visible si org.status = 'trial' y owner no logueó
export async function resendOwnerInvite(orgId: string, ownerEmail: string) {
  const admin = createServiceRoleClient()
  // Revocar link anterior e invitar de nuevo — Supabase invalida el token previo
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { org_id: orgId, role: 'org_owner' },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/org/setup-account`,
  })
  if (error) return { error: error.message }
  // Actualizar audit log
  await admin.from('org_audit_logs').insert({
    org_id: orgId, actor_id: adminUserId,
    action: 'owner_invite_resent', target_type: 'owner', metadata: { email: ownerEmail }
  })
  return { success: true }
}
```
Agregar en Admin panel `/admin/orgs/[orgId]/` → botón "Reenviar invitación" con confirmación.

#### 3.2 — Billing y pricing

```
Plan Base:      $49.990 CLP/mes → hasta 3 coaches + 100 alumnos
Coach extra:    +$9.990 CLP/mes por coach adicional
Alumnos extra:  +$4.990 CLP/mes por cada 50 alumnos adicionales
Plan Anual:     $499.900 CLP/año (≈ 2 meses gratis) — ofrecer en cierre de contrato
Primeros 2 org: precio negociado + 30 días trial gratis (status='trial', trial_ends_at = D+30)
```

**Reglas de billing_start_date:**
- `billing_start_date` = día 1 del mes en que el cliente activa su plan
- Sign-up después del día 10 → cobrar el mes completo desde hoy
- Sign-up antes del día 10 → cobrar desde el día 1 del mes siguiente (primer mes gratis parcial)
- Los 2 primeros clientes de prueba → `billing_start_date = trial_ends_at + 1 day`

**Límite de alumnos por plan — enforcement en DB:**
```sql
-- Agregar a organizations en migración 001 (o nueva migración):
ALTER TABLE organizations ADD COLUMN client_limit int NOT NULL DEFAULT 100;
-- El plan base incluye 100 alumnos. Límites custom negociados → actualizar en admin panel.
-- Alumnos extra: +$4.990/mes por cada 50 adicionales → client_limit aumenta en 50 por cada bloque comprado.
```
```sql
-- Verificar en RPC import_clients_to_org (agregar ANTES del INSERT):
DECLARE
  current_count int;
BEGIN
  SELECT COUNT(*) INTO current_count FROM clients WHERE org_id = p_org_id AND deleted_at IS NULL;
  IF current_count + array_length(p_clients, 1) > (SELECT client_limit FROM organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Límite de alumnos alcanzado (%). Contacta a EVA para ampliar tu plan.', current_count;
  END IF;
```
Misma verificación en `createClient` cuando coach org crea uno manualmente.

**Facturación (proceso manual MVP):**
- Personas naturales → Boleta de honorarios manual en sii.cl (situación actual)
- Empresas con RUT → documentar en contrato que factura se emitirá cuando empresa EVA esté constituida y tenga CAF. Ver nota SII en sección 3.1.
- >5 orgs pagando → integrar Bsale (~$15 USD/mes, API REST) como feature flag

**Flujo de cobro mensual (manual):**
```
Día 1 del mes:
  1. Ir a Admin panel → /admin/orgs
  2. Ver orgs activas + expected_amount_clp calculado por org
  3. Generar link MP o enviar datos de transferencia por WhatsApp
  4. Cliente paga
  5. Admin panel → Registrar pago:
     a. Ingresar actual_amount_clp recibido
     b. Si actual ≠ expected → alerta visual "⚠️ Monto recibido ($X) ≠ esperado ($Y)"
     c. INSERT en org_invoices (status='paid', paid_at=now(), payment_ref, amount_clp)
  6. Emitir boleta de honorarios en sii.cl
  7. Enviar comprobante al org_admin por WhatsApp
```

**Agregar a `org_invoices`:**
```sql
ALTER TABLE org_invoices ADD COLUMN expected_amount_clp int;  -- calculado: plan_base + extras
-- Si actual_amount_clp != expected_amount_clp → registrar divergencia en notes
```

**Dunning:**
- D+5: WhatsApp + email: "Hola [nombre], el pago de [mes] está pendiente. Link: [link MP]"
- D+10: Admin panel → "Suspender org" → `organizations.status = 'suspended'`
  - Coaches: read-only
  - Alumnos: conservan contenido
- D+30: Cancelación → soft delete → cron de purga empieza cuenta 90 días

#### 3.3 — Crons operacionales

**Cron 1: Purga de datos en 2 pasos (Ley 21.719) — cada domingo 3am:**
```json
{ "path": "/api/cron/org-data-purge", "schedule": "0 3 * * 0" }
```
```typescript
// src/app/api/cron/org-data-purge/route.ts
// STEP 1: orgs con deleted_at < now() - 83 días Y purge_scheduled_at IS NULL
//   → Exportar datos a JSON → email al owner (Resend)
//   → SET purge_scheduled_at = now() + interval '7 days'
//   → Si el email falla → NO avanzar a step 2 (org queda pendiente hasta próximo domingo)
//
// STEP 2: orgs con purge_scheduled_at < now()
//   → Hard delete en cascada: clients, assignments, members, invites, audit_logs
//   → Borrar Storage files (logos)
//   → Hard delete org
//   → Insertar en tabla purge_audit (nunca se borra)
```
Total: 83 días soft delete + 7 días aviso = 90 días efectivos de retención post-cancelación.

**Cron 2: Alerta de salud — cada lunes 9am:**
```json
{ "path": "/api/cron/org-health-alert", "schedule": "0 9 * * 1" }
```
Calcula health score por org. Score < 60 → email a ADMIN_EMAIL con lista.
También detecta `status='trial' AND trial_ends_at < now()` → suspend automático → email al org_owner.

**Cron 3: Recordatorio de pago — días 1, 6, 11 de cada mes a las 9am:**
```json
{ "path": "/api/cron/payment-reminder", "schedule": "0 9 1,6,11 * *" }
```
```typescript
// Día 1: verificar org_invoices sin paid_at del mes actual → email via Resend 'org-payment-reminder'
// Día 6 (D+5): reenviar si sigue sin pago + flag visual en admin panel
// Día 11 (D+10): email final + badge "Suspensión pendiente" en admin panel
// Suspensión manual en admin panel (no automática en D+10 — evitar falsos positivos)
```

**Cron 4: Checksum audit logs — cada domingo 2am (antes de la purga):**
```json
{ "path": "/api/cron/audit-checksum", "schedule": "0 2 * * 0" }
```
```typescript
// SHA-256 de los últimos 7 días de org_audit_logs → INSERT en audit_log_checksums
// Email a ADMIN_EMAIL con checksum (verificación externa)
// Detecta modificaciones masivas en logs — suficiente para Ley 21.719 MVP
```

**Cron 5: Reconciliación MercadoPago — cada viernes 10am:**
```json
{ "path": "/api/cron/mp-reconcile", "schedule": "0 10 * * 5" }
```
```typescript
// src/app/api/cron/mp-reconcile/route.ts
// MercadoPago puede perder webhooks (retry 3 veces → silencio).
// Este cron verifica divergencias entre estado MP y estado EVA.
//
// Para cada coach con pre-approval activo en subscription_events:
//   → GET https://api.mercadopago.com/preapproval/{preapproval_id}
//   → Comparar status MP vs coaches.subscription_status en DB
//   → Si status_mp = 'cancelled' pero coaches.subscription_status != 'cancelled':
//       → Flag divergencia → email a ADMIN_EMAILS con lista
//
// Para cada org_invoice con status='pending' y created_at > 10 días:
//   → Ya el cron payment-reminder cubre esto con email
//   → Este cron agrega: flag 'payment_overdue_verified' en admin panel
//
// No mover nada automáticamente — solo flag para revisión manual.
// Costo: 1 MP API call por coach activo. Con 50 coaches = 50 calls/semana, dentro de rate limits.
```

**Monitoreo de crons con PostHog:**
```typescript
// Al inicio de cada cron: posthog.capture('cron_started', { cron: 'payment-reminder' })
// Al final: posthog.capture('cron_completed', { cron: 'payment-reminder', orgs_checked: N })
// En catch: posthog.capture('cron_failed', { cron: 'payment-reminder', error: err.message })
// Configurar alerta en PostHog si cron_failed → email a ADMIN_EMAIL
```

#### 3.4 — Health score — alerta semanal automática

```json
// vercel.json — agregar:
{ "path": "/api/cron/org-health-alert", "schedule": "0 9 * * 1" }
```

```typescript
// src/app/api/cron/org-health-alert/route.ts
// Corre cada lunes a las 9am
// Calcula health score por org (fórmula mejorada con profundidad de uso):
//
//   score_actual =
//     (coaches_logged_7d / total_coaches) * 35          // adopción coach
//     + (clients_assigned / total_clients) * 25          // activación pool
//     + (workouts_logged_7d / max(clients_assigned, 1)) * 25  // profundidad uso real
//     + (days_since_admin_login < 7 ? 15 : 0)           // admin engaged
//
//   score_anterior = el score_actual de la semana pasada (guardar en organizations.last_health_score)
//
// Alertar si:
//   A) score_actual < 60 (umbral absoluto)
//   B) score_actual < score_anterior - 10 (caída brusca aunque score_actual > 60)
//   → Caso B detecta churn antes que A. Una org de 75 que cae a 64 es más urgente que una de 55 estable.
//
// Email a ADMIN_EMAILS: org name | score_actual | delta | coaches_inactivos | días_desde_admin_login
```
```sql
-- Agregar a organizations:
ALTER TABLE organizations ADD COLUMN last_health_score int;
ALTER TABLE organizations ADD COLUMN last_health_score_at timestamptz;
-- El cron actualiza estos campos cada lunes después de calcular
```

Agregar `ADMIN_EMAIL` a Vercel env vars Production.

#### 3.5 — Pipeline de ventas + ICP

**ICP (Ideal Customer Profile) — EVA Enterprise MVP:**
```
ICP Primario (perseguir activamente):
  Tipo:       CrossFit box, boutique fitness (pilates, funcional, HIIT), academia de deportes
  Ubicación:  Santiago RM primero → otras regiones en v2.1
  Tamaño:     3-8 coaches internos (no solo freelance)
  Alumnos:    50-300 activos
  Herramienta actual: Excel / WhatsApp / TrueCoach (en CLP = raro) / nada centralizado
  Decision maker: dueño del gym o director (no el head coach)
  Presupuesto: pagan en CLP — si pagan en USD ya tienen solución extranjera

Señales de compra (priorizar):
  - Coach standalone EVA refiere su gym → CANAL B → conversión histórica más alta
  - Gym owner vio la app de un alumno y preguntó cómo tenerla para su gym
  - Busca activamente "software gym Chile" o "app coach Chile"
  - Se queja de que TrueCoach no tiene soporte en español o precios en CLP

Descalificar (NO perseguir en MVP):
  - Cadenas con >3 sucursales → proceso de compra largo, requiere customización enterprise real
  - Estudios de yoga/meditación puro → no usan workout logging
  - Clínicas de rehabilitación → requieren compliance médico diferente (fichas clínicas, Fonasa)
  - Gyms que ya usan Mindbody/Gympass enterprise → ciclo de decisión >6 meses

Calificación en demo (BANT mínimo):
  B (Budget):    "¿Tienes presupuesto aprobado para software de gestión este año?"
  A (Authority): "¿Eres tú quien toma la decisión de contratar un servicio nuevo?"
  N (Need):      "¿Qué problema específico quieres resolver?" (coordinación coaches? datos?)
  T (Timeline):  "¿Cuándo necesitarías tenerlo funcionando?"
```

**Pipeline Google Sheets — "EVA Enterprise Pipeline":**

| Columna | Descripción |
|---|---|
| Gym Name | Nombre del prospect |
| Contacto | Nombre + WhatsApp |
| Fuente | Canal B (coach referido) / Instagram / Calendly / Otro |
| Coaches aprox | Cuántos coaches tiene |
| Alumnos aprox | Cuántos alumnos |
| Software actual | TrueCoach / Excel / Nada / Otro |
| BANT | B/A/N/T calificados (✓/✗ por cada uno) |
| Estado | Lead / Demo agendada / Demo hecha / Propuesta enviada / Cerrado / Perdido / Nurturing |
| Fecha demo | — |
| Fecha follow-up | — |
| Notas | — |

**Secuencia post-demo:**
- D+1: Email resumen con one-pager PDF + link para agendar call
- D+3: WhatsApp: "¿Alguna pregunta sobre lo que viste?"
- D+7: "¿Seguimos? Puedo darte acceso al demo org para que explores"
- D+14: Si silencio → marcar como "Nurturing" → seguir en 30 días

**Objeciones comunes y respuestas:**
| Objeción | Respuesta |
|---|---|
| "TrueCoach es más barato" | "TrueCoach cobra en USD y no tiene soporte enterprise en Chile. EVA cobra en CLP, soporte en WhatsApp en horario hábil, onboarding acompañado incluido." |
| "Excel es gratis" | "Cuánto tiempo pasa tu staff coordinando asignaciones por WhatsApp cada semana? Eso tiene costo." |
| "¿Puedo verlo antes de pagar?" | "Sí. Te muestro una demo con datos reales en 30 minutos, y si quieres, te doy acceso al demo org por 48h." |
| "Necesito aprobación de socios" | "Perfecto. ¿Puedo enviarte el resumen por escrito para que lo compartas? También puedo hacer una segunda demo con ellos presentes." |

#### 3.6 — Landing page: cambios para enterprise

> **Puede deployarse a producción en cualquier momento** — es contenido estático que
> no depende del código enterprise. Captura leads desde el día 1. Tiempo estimado: 4-6h.

##### Diagnóstico actual (14 roles)

| Rol | Problema identificado |
|---|---|
| Head of Sales | Una línea `contacto@eva-app.cl` al fondo del pricing no convierte prospects B2B |
| SDR | El gym owner que llega a la landing no tiene sección que le hable directamente |
| PM | No hay path claro para gyms: nav → sección → CTA demo. Bounce garantizado |
| UX/UI | El visual de pricing (6 planes individuales) intimida a gym owner — ve precios de coach individual, no de gym |
| SEO | `<title>` y description no incluyen "gym", "academia", "centro deportivo" — no rankea |
| Legal | Precios mostrados sin aclarar IVA — en B2B Chile el IVA es del comprador, debe especificarse |
| CSM | La landing no establece que hay onboarding acompañado — gym espera autoservicio y se frustra |
| Architect | El componente es puramente estático, sin backend. No afecta las rutas existentes |

##### Archivos a modificar / crear

**1. `src/app/page.tsx` — SEO metadata**

```typescript
export const metadata: Metadata = {
  title: 'EVA | Software para Coaches, Personal Trainers y Gyms en Chile',
  description: 'EVA: plataforma SaaS para coaches individuales y gyms. Panel centralizado por organización, rutinas, nutrición y app white-label. Desde gratis hasta planes enterprise.',
  // JSON-LD: agregar mentions de gym management
}

// En jsonLd:
applicationCategory: 'BusinessApplication, SportsApplication',
// Agregar:
keywords: ['software gym chile', 'software academia deportiva', 'app personal trainer', 'gestión coaches'],
```

También en `page.tsx`, insertar el nuevo componente:
```tsx
// Entre <LandingStudentTabs /> y <LandingFinalCTA />:
<LandingEnterpriseSection />
```

**2. `src/components/landing/LandingPillNav.tsx` — nav link**

```typescript
// En el array de nav items (desktop + mobile sheet), agregar entre "Precios" y "Contacto":
{ key: 'landing.nav.enterprise', id: 'enterprise' }
// i18n key: "Para Gyms" (es) / "For Gyms" (en)
```

**3. `src/components/landing/LandingPricingPreview.tsx` — upgrade enterprise callout**

Reemplazar la línea actual (1 línea con mailto) por un banner diferenciado al final de la sección:

```tsx
{/* ANTES — una línea mínima: */}
<p className="mt-8 text-center text-xs text-muted-foreground">
  {t('landing.pricing.enterprise')}{' '}
  <a href="mailto:contacto@eva-app.cl">contacto@eva-app.cl</a>
</p>

{/* DESPUÉS — banner prominente con CTA scroll: */}
<div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-amber-500/20 border-t-[3px] border-t-amber-400/70 bg-card/80 p-5 shadow-sm">
  <div>
    <p className="text-sm font-bold text-foreground">¿Gym o academia con múltiples coaches?</p>
    <p className="mt-0.5 text-xs text-muted-foreground">
      Panel centralizado · Pool de alumnos · Branding unificado · Desde $49.990/mes
    </p>
  </div>
  <a
    href="#enterprise"
    className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
  >
    Ver planes →
  </a>
</div>
```

**4. Nuevo componente: `src/components/landing/LandingEnterpriseSection.tsx`**

```
Sección con id="enterprise", scroll-mt-28 (compensa nav flotante)
Background: diferente del resto — usa landing-section-alt o bg-muted/30

┌─────────────────────────────────────────────────────────────────┐
│  PARA GYMS Y ACADEMIAS                    [eyebrow pill]        │
│                                                                 │
│  "Un panel para todo tu equipo"           [H2 font-display]    │
│  "Gestiona coaches, alumnos y reportes   [subtítulo]           │
│   desde un solo lugar. Sin hojas de                            │
│   cálculo. Sin confusión entre coaches."                       │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 🏢 Pool de  │  │ 🔒 Datos   │  │ 📊 Reportes │            │
│  │  alumnos    │  │  aislados   │  │  por coach  │            │
│  │  compartido │  │  por coach  │  │             │            │
│  │             │  │             │  │             │            │
│  │  Importa CSV│  │  Cada coach │  │  Ve quién   │            │
│  │  Asigna con │  │  ve solo    │  │  está activo│            │
│  │  1 clic     │  │  sus alumnos│  │  y quién no │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  Desde $49.990/mes (hasta 3 coaches) · +$9.990/mes extra       │
│  Precios + IVA · 30 días gratis · Sin tarjeta de crédito       │
│                                                                 │
│  [  Agendar demo de 30 min  →  ]  "o contacto@eva-app.cl"     │
│                                                                 │
│  ──────────────────────────────────────────────────────────    │
│  "Te acompañamos desde el primer día. Onboarding incluido."    │
└─────────────────────────────────────────────────────────────────┘
```

Value props (iconos Lucide recomendados):
- `Users2` → Pool de alumnos compartido
- `ShieldCheck` → Datos aislados por coach
- `BarChart3` → Reportes de actividad semanal

CTA principal: Calendly link (crear cuenta gratis → compartir link "Agendar 30 min").
CTA secundario: `mailto:contacto@eva-app.cl`

**No usar Google Forms** — agrega fricción ("esperamos tu respuesta"). Calendly permite
al prospect elegir horario ahora = mayor conversión.

**5. `src/components/landing/LandingFinalCTA.tsx` — secondary path para gyms**

```tsx
{/* Bajo el botón principal, agregar: */}
<p className="mt-6 text-xs text-muted-foreground">
  ¿Gestionas un gym o academia?{' '}
  <a href="#enterprise" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
    Ver planes enterprise →
  </a>
</p>
```

##### Mensajes clave validados por 14 roles

| Pregunta del gym owner | Respuesta en la landing |
|---|---|
| ¿Qué es EVA para mí? | "Panel centralizado para gyms: coaches, alumnos, reportes" |
| ¿Por qué no Excel? | "Sin confusión entre coaches. Sin hojas duplicadas." |
| ¿Cuánto cuesta? | "$49.990/mes para hasta 3 coaches" (+ nota IVA) |
| ¿Es self-serve? | "Te acompañamos desde el primer día. Onboarding incluido." |
| ¿Cómo empiezo? | "Agendar demo de 30 min" → Calendly |

**Social proof:** No inventar métricas. Si hay clientes en onboarding → "Primeros gyms
en proceso de onboarding en Santiago". Si no hay ninguno → omitir social proof
(silencio es mejor que mentir).

##### Consideraciones legales (Chile)

- **IVA:** En B2B Chile, el precio publicado es típicamente + IVA (19%). El landing debe
  decir "Precios + IVA" para evitar confusión al momento de la factura.
- **Contrato:** El CTA no promete autoservicio. La demo precede al contrato — correcto.
- **Datos:** No pedir datos personales en el landing (el Calendly pide email, eso es
  responsabilidad de Calendly, no EVA).

##### QA — tests mínimos para esta sección

```
[ ] Enlace "Para Gyms" en nav desktop lleva a #enterprise sin offset
[ ] Enlace "Para Gyms" en nav mobile (Sheet) cierra el Sheet antes de scroll
[ ] Banner en pricing "Ver planes →" hace scroll a #enterprise
[ ] "Agendar demo" abre Calendly en tab nueva (target="_blank" rel="noopener")
[ ] "contacto@eva-app.cl" abre cliente de mail
[ ] Sección visible y legible en mobile (320px mínimo)
[ ] Dark mode: todos los colores tienen contraste suficiente (WCAG AA)
[ ] "Ver planes enterprise →" en FinalCTA lleva a #enterprise
[ ] SEO: <title> contiene "Gyms" (verificar con View Source)
```

##### Cuándo deployar

Esta sección puede mergearse a `master` directamente **antes de Fase 1** — no hay
dependencias técnicas. Requiere solo:
1. Cuenta Calendly gratuita creada (5 min)
2. Link Calendly en el componente
3. PR a master → merge → Vercel auto-deploy

Riesgo: nulo. Si llega un prospect y aún no hay enterprise live, la demo es la
oportunidad de vender el servicio y gestionarlo manualmente.

#### Done cuando
- [ ] Contratos firmados por ambos clientes
- [ ] ToS + Política privacidad actualizados en producción
- [ ] DPA Supabase + Vercel firmados
- [ ] Cron purga y health alert en vercel.json + routes implementadas
- [ ] Pipeline Google Sheets creado
- [ ] Landing: `LandingEnterpriseSection` live en producción
- [ ] Landing: nav link "Para Gyms" → `#enterprise` funciona
- [ ] Landing: SEO `<title>` incluye "Gyms"
- [ ] Landing: Calendly link funcional (cuenta creada)
- [ ] Landing: "Precios + IVA" visible en sección enterprise

---

### FASE 4 — QA, Seguridad y Launch
**Duración:** 1 semana | **Riesgo:** Alto — última línea antes de datos reales

#### 4.1 — Seeds para tests

```sql
-- supabase/seed.sql — agregar sección enterprise:
-- Org A: "CrossFit Test Norte" (3 coaches, 30 clientes asignados)
-- Org B: "Box Test Sur" (2 coaches, 20 clientes, 5 sin asignar)
-- Coach standalone test: sin org
-- Coach en 2 orgs: pertenece a Org A y Org B
-- Clientes standalone: 10 (org_id IS NULL)
-- Invite pendiente no expirado: Org A
-- Invite expirado: Org B
-- Invite ya usado: Org A
```

#### 4.2 — Testing con Inbucket (flujo invitaciones)

Inbucket corre en `localhost:54324` cuando usas `npx supabase start`. Captura todos los emails de Supabase Auth.

```typescript
// tests/enterprise/invite-flow.spec.ts
test('invite coach completo', async () => {
  // 1. Admin invita coach → Supabase envía email → Inbucket lo captura
  const emails = await fetch('http://localhost:54324/api/v1/mailbox/test-coach@test.cl')
  const token = extractTokenFromEmail(emails)
  
  // 2. Coach navega al link con el token
  await page.goto(`http://localhost:3000/invite/${token}`)
  
  // 3. Coach acepta → queda como member activo
  expect(await page.locator('[data-testid="org-member-status"]').textContent()).toBe('active')
})
```

#### 4.3 — RLS isolation tests (Playwright + SDK, nunca SET ROLE)

```typescript
// tests/enterprise/rls-isolation.spec.ts
// Usar supabase.auth.signInWithPassword() para crear sesiones reales

test('coach Org A no ve clientes de Org B', async () => { ... })
test('coach standalone no ve datos de orgs', async () => { ... })
test('org_admin no ve datos de otra org', async () => { ... })
test('org_coach no ve clientes no asignados a él', async () => { ... })
test('invite token expirado → error 400', async () => { ... })
test('invite token usado dos veces → error 400', async () => { ... })
```

**Estrategia limpieza entre tests:** cada test crea sus propios usuarios/orgs con UUIDs únicos y los borra en `afterEach`. Nunca depender de datos previos.

#### 4.4 — Regression tests existentes

```bash
npx playwright test tests/coach/
# Si cualquier test falla → NO mergear. Investigar primero.
```

#### 4.5 — Enterprise journey E2E

```typescript
test('journey completo org', async () => {
  // crear org → invitar coach (capturar email en Inbucket) →
  // coach acepta invite → admin importa CSV 5 clientes →
  // preview muestra 5 filas → confirmar → admin asigna a coach →
  // coach loguea y ve sus 5 clientes asignados
})
test('logo upload rechaza PDF', async () => { ... })
test('CSV >200 filas → error controlado', async () => { ... })
test('coach en 2 orgs puede cambiar org activa', async () => { ... })
test('coach suspendido → read-only, no puede crear workout', async () => { ... })
```

#### 4.6 — Performance benchmark

```sql
-- Correr en Supabase Studio local ANTES de aplicar nuevas RLS policies:
EXPLAIN ANALYZE
SELECT * FROM clients WHERE coach_id = '[id-coach-con-100-clientes]';

-- Correr de nuevo DESPUÉS de agregar las policies
-- Si tiempo aumenta >50% → revisar índices antes de continuar
```

Target: p95 < 500ms en `/coach/clients` con 100+ clientes.

#### 4.7 — Security checklist pre-launch

- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en env `Production` de Vercel
- [ ] Invite tokens: `gen_random_bytes(32)` hex — NO uuid
- [ ] Rate limit `accept_org_invite`: 10/IP/hora
- [ ] Rate limit `create_organization`: 3/user/día
- [ ] CSP headers en `vercel.json` deployados
- [ ] MP webhook HMAC: ya implementado (`verifyMercadoPagoSignatureIfConfigured`) ✓
- [ ] Logo upload: MIME check en server action (no solo client)
- [ ] `org_id` nunca del body — siempre desde `auth.uid()`
- [ ] `org_audit_logs` sin policies UPDATE/DELETE — verificar en Supabase Dashboard
- [ ] `ADMIN_EMAILS` configurado en Vercel Production
- [ ] Rollback SQL documentado por migración

#### Done cuando
- [ ] RLS isolation tests: 6 escenarios todos verdes
- [ ] Suite E2E `/coach/*` pasa sin modificaciones
- [ ] Enterprise journey E2E completo sin errores
- [ ] Inbucket invite flow test pasa
- [ ] Security checklist 100%
- [ ] Performance: sin regresión en /coach/clients

---

### FASE 5 — Onboarding Clientes Enterprise
**Duración:** 1 semana por cliente | **Riesgo:** Operacional

#### Flujo completo de activación (cómo un gym se convierte en cliente)

```
CANAL A: Landing → "Para Gyms" → Calendly → Demo
CANAL B: Coach standalone refiere su gym → landing → demo
CANAL C: App Store → busca "gestión gym Chile" → descarga EVA Enterprise
          → pantalla login → toca "¿No tienes cuenta? → eva-app.cl/enterprise"
CANAL D: EVA envía TestFlight durante proceso de ventas

PASO 1 — Demo + Contrato (D-7 a D-3)
  → Demo via Google Meet + screenshare de demo org en staging
  → Contrato firmado via FirmaFácil
  → Org_owner entrega: slug, nombre, logo, color, emails coaches, CSV alumnos

PASO 2 — EVA crea la org (Admin panel → /admin/orgs → "Nueva organización")
  → Completa: slug, nombre, logo, color, billing_start_date, billing_cycle='monthly'
  → organizations.status = 'trial', trial_ends_at = hoy + 30 días
  → EVA invita org_owner:
      supabase.auth.admin.inviteUserByEmail(org_owner_email, { data: { org_id, role: 'org_owner' } })
  → Resend envía template 'org-owner-invite' con magic link (24h de expiración)

PASO 3 — Org_owner configura su cuenta (D-1)
  → Recibe email → clic → enterprise.eva-app.cl/setup-account?token=...
  → Establece password + acepta ToS + acepta Política de privacidad
  → Redirect a /org/[slug]/onboarding (wizard 5 pasos)
  → Configura branding, invita coaches, importa CSV

PASO 4 — Org_owner descarga EVA Enterprise App
  → App Store → "EVA Enterprise" → login con email ya configurado
  → App lista, sin configuración adicional

PASO 5 — Training + soporte (D0 PM a D7)
  → Sesión training 60 min (Google Meet): org_admin + coaches clave + EVA
  → WhatsApp group creado inmediatamente post-training
```

#### Playbook por cliente

| Día | Actividad | Owner |
|---|---|---|
| D-7 | Firma contrato | Cliente + EVA |
| D-5 | Cliente entrega: slug, logo, color, lista coaches (email), CSV alumnos | Cliente |
| D-3 | Crear org en staging, cargar branding, importar CSV de prueba, validar | EVA |
| D-1 | Cliente confirma que staging se ve bien. Preparar script go-live | Ambos |
| D0 AM | Crear org en prod + branding | EVA |
| D0 AM | Invitar coaches (reciben email) | EVA |
| D0 PM | Importar CSV validado de alumnos | EVA |
| D0 PM | Asignar alumnos a coaches según lista del cliente | EVA |
| D0 PM | Sesión training 60 min: org_admin + coaches (Google Meet) | EVA |
| D1-D7 | Soporte WhatsApp group: org_admin + coaches clave + tú | EVA |
| D14 | Check-in + calcular health score | EVA |
| D30 | Mini QBR: métricas, feedback, ¿agregar coaches? | EVA |

**Health score en D14:**
```sql
score = (coaches_logged_7d / total_coaches * 40)
      + (clients_assigned / total_clients * 40)
      + (workouts_logged_7d > 0 ? 20 : 0)
-- <60 = riesgo, 60-80 = normal, >80 = sano
```

**Escalación:** Coach → org_admin → tú. Coaches no contactan EVA directamente. En contrato.

**Métricas de éxito:**
- 100% coaches logueados en 48h
- >80% alumnos asignados en 72h
- 0 incidentes de aislamiento de datos
- Time-to-first-workout-logged < 72h por coach (mide activación real, no solo login)
- Client activation rate D7: >60% de alumnos que logean al menos 1 workout en 7 días
- Coach retention D30: >80% de coaches siguen activos 30 días post-onboarding

**Upsell triggers (mostrar en admin panel):**
- `active_coaches_count >= seats_included` → banner: "Alcanzaste el límite de coaches. Agrega uno por $9.990/mes →"
- `health_score < 60` → sugerencia: "¿Necesitás ayuda con la adopción? Agendá una llamada →"

**Template QBR D30:**
```
1. Health score del mes (número + comparación vs semana 2)
2. Top 3 coaches más activos (workouts logueados)
3. Alumnos sin entrenar en 14 días (lista con nombres)
4. Feedback abierto: "¿Qué te faltó encontrar en la plataforma?"
5. Propuesta de valor: "Tenés [N] coaches. ¿Agregamos uno más por $9.990/mes?"
```

**Secuencia de conversión trial → paid (30 días):**
```
D0:   Onboarding completado → WhatsApp inmediato:
      "¡Bienvenido a EVA! Ya tienes acceso completo los próximos 30 días. Cualquier duda aquí."

D7:   Calcular health score. Si score < 60:
      → Llamada proactiva: "¿Cómo va? Veo que algunos coaches aún no han logueado — ¿les damos un empujoncito?"
      Si score >= 60:
      → WhatsApp: "Primera semana genial. Tus coaches [N] ya loguearon [X] workouts."

D14:  Email + WhatsApp con métricas de adopción:
      → Si adopción buena → presentar plan anual: "¿Sabías que con el plan anual ahorras 2 meses? $499.900/año vs $599.880/año."
      → Si adopción baja → oferta de sesión training adicional gratuita

D21:  "Quedan 9 días de tu período de prueba gratuito. Para continuar sin interrupciones:"
      → Link de pago MP pre-armado con el monto del contrato
      → Alternativa: transferencia bancaria (datos en el mensaje)

D28:  WhatsApp: "Tu acceso gratuito termina el [fecha]. ¿Tienes alguna pregunta antes de activar?"
      → Si no responde en 48h → llamada corta de 10 min

D30:  Si no pagó → cron suspende automáticamente
      Email al org_owner: "Tu período de prueba venció. Reactiva tu plan:"
      → Link de pago MP + WhatsApp de seguimiento
      → Datos se conservan 30 días adicionales
```

**Offboarding del trial (si no convierte en D+30):**
- Cron `org-health-alert` detecta `status='trial' AND trial_ends_at < now()`
- Estado cambia a `suspended` automáticamente
- Email al org_owner: "Tu período de prueba venció. Activá tu plan para continuar."
- Datos se conservan 30 días adicionales antes del soft delete

**Para el segundo cliente:** iterar playbook con learnings del primero.

**Coach que sale de org (proceso):**
1. Admin suspende coach en org panel
2. Sistema soft delete en `organization_members`
3. Clientes del coach → pool sin asignar (assignment soft deleted)
4. Coach recibe notificación: "Fuiste removido de [Org]. Debes reactivar tu plan standalone para seguir usando EVA"
5. Admin recibe en dashboard: "[N] clientes sin asignar — asígnalos a otro coach"

#### Done cuando
- [ ] Ambos clientes en producción
- [ ] 100% coaches logueados
- [ ] >80% alumnos asignados
- [ ] Health score D14 calculado y registrado

---

### FASE 6 — Monorepo completo + React Native
**Condición de entrada:** ambos clientes enterprise estables 2+ semanas

#### 6A — Mover web a apps/web/ (1 semana)

> Al empezar Fase 6A: deprecar `/api/manifest/[coach_slug]/route.ts`. La razón de existir de esa ruta era que cada coach tuviera su app instalable con su propio ícono/color. Con la app RN aggregator (una sola app EVA en stores, N coaches dentro), ese concepto desaparece. El Service Worker (`public/sw.js`) queda — sigue siendo útil para offline caching en web para coaches y alumnos que no descarguen la app.

```bash
mkdir -p apps/web
# Mover: src/ public/ next.config.ts tsconfig.json → apps/web/
# Actualizar: Vercel root directory → apps/web
# Actualizar: tsconfig paths relativos
# Verificar: npm run typecheck && npm run build
```

Feature branch → PR exhaustivo → CI verde → merge. Sin cambio funcional.

#### 6B.0 — Pre-flight Mobile (1 semana, ANTES de escribir cualquier feature)
**Hacer esto primero. Sin esto, el primer bug en producción cuesta 1-7 días de App Store review.**

```bash
# 1. EAS CLI instalado globalmente
npm install -g eas-cli

# 2. Login con tu cuenta Expo
eas login

# 3. Configurar proyecto (dentro de apps/mobile/)
eas build:configure
```

**`eas.json` mínimo:**
```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "staging": {
      "distribution": "internal",
      "ios": { "buildConfiguration": "Release" },
      "env": { "APP_ENV": "staging" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "tu@email.com", "ascAppId": "XXXXXXXXXX" },
      "android": { "serviceAccountKeyPath": "./google-service-account.json" }
    }
  }
}
```

**`expo-updates` OTA (configurar ahora, antes de todo):**
```bash
npx expo install expo-updates
eas update:configure
```
Sin OTA, cada bugfix requiere App Store review (1-7 días). Con OTA, hotfixes llegan en minutos.

**Sentry crash reporting:**
```bash
npx expo install @sentry/react-native
```
Sin Sentry, los crashes de producción son invisibles. Free tier: 5000 errores/mes, más que suficiente.

**`app.json` — configuración crítica pre-código:**
```json
{
  "expo": {
    "name": "EVA",
    "slug": "eva-fitness",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "ios": {
      "bundleIdentifier": "cl.evaapp.eva",
      "buildNumber": "1",
      "supportsTablet": false,
      "infoPlist": {
        "NSCameraUsageDescription": "Para enviar fotos de progreso a tu coach",
        "NSPhotoLibraryUsageDescription": "Para seleccionar tu foto de perfil",
        "NSMotionUsageDescription": "Para contar tus pasos durante el entrenamiento"
      }
    },
    "android": {
      "package": "cl.evaapp.eva",
      "versionCode": 1,
      "targetSdkVersion": 35,
      "minSdkVersion": 26,
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "USE_BIOMETRIC"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-updates",
      ["@sentry/react-native/expo", { "organization": "eva-fitness", "project": "eva-rn" }]
    ]
  }
}
```

**`PrivacyInfo.xcprivacy` — escribir antes del primer build iOS:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeFitnessData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>3B52.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

**ThemeContext — definir ANTES de cualquier pantalla:**
```typescript
// apps/mobile/lib/theme.ts
export const lightTheme = {
  primary: '#007AFF',    // SYSTEM_PRIMARY_COLOR
  background: '#FFFFFF',
  card: '#F2F2F7',
  text: '#000000',
  muted: '#6B6B6B',
  border: '#C6C6C8',
}
export const darkTheme = {
  primary: '#0A84FF',
  background: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  muted: '#8E8E93',
  border: '#38383A',
}
// Override con branding del coach: primaryColor de la DB
```

**Push token rotation handler:**
```typescript
// apps/mobile/lib/push.ts
import * as Notifications from 'expo-notifications'
// Registrar nuevo token y actualizar en DB si cambió
export async function syncPushToken(userId: string, supabase: SupabaseClient) {
  const { data: token } = await Notifications.getExpoPushTokenAsync()
  const deviceId = await getDeviceId() // expo-device
  await supabase.from('push_tokens').upsert({
    user_id: userId,
    device_id: deviceId,
    token: token.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  }, { onConflict: 'user_id, device_id' })
}
// Llamar syncPushToken en cada app launch — upsert es idempotente
```

**GitHub Actions para builds (estrategia 2026-05-18):**

Android: usar `eas build --local` en runner Ubuntu → gratis, sin consumir créditos EAS.
iOS: usar EAS cloud (15 builds/mes gratis suficiente para etapa inicial).

```yaml
# .github/workflows/mobile-build.yml
name: Mobile Build
on:
  push:
    branches: [v2/enterprise]
    paths: ['apps/mobile/**']

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - run: npm ci
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      # --local = corre en el runner, NO consume créditos EAS
      - run: eas build --platform android --profile staging --local --non-interactive
        working-directory: apps/mobile
        env:
          EXPO_ROUTER_APP_ROOT: apps/mobile/app

  build-ios:
    runs-on: ubuntu-latest  # EAS cloud compila iOS remotamente
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: eas build --platform ios --profile staging --non-interactive
        working-directory: apps/mobile
```

**Monorepo fix — EXPO_ROUTER_APP_ROOT (2026-05-18):**
`_ctx.android.js` usa `require.context(process.env.EXPO_ROUTER_APP_ROOT)`. Metro no inyecta este env var automáticamente en monorepos. Solución: `apps/mobile/babel.config.js` setea el var en el worker process:
```js
process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT || path.resolve(__dirname, 'app')
```
También: `apps/mobile/metro.config.js` extiende watchFolders con monorepoRoot y configura `nodeModulesPaths` para evitar react duplicado.

**Maestro — mobile E2E testing (install local, gratis):**
```bash
# Mac/Linux (en tu máquina local para testear)
curl -Ls "https://get.maestro.mobile.dev" | bash
```

```yaml
# .maestro/alumni-login.yaml
appId: cl.evaapp.eva
---
- launchApp
- tapOn: "SOY ALUMNO"
- tapOn:
    id: "invite-code-input"
- inputText: "4XK7M"
- tapOn: "Continuar"
- assertVisible: "Iniciar sesión"
```

#### Done cuando (6B.0)
- [ ] `eas.json` con perfiles development/staging/production
- [ ] `expo-updates` configurado y probado con un update de test
- [ ] Sentry instalado y primer crash de test reportado
- [ ] `app.json` con `targetSdkVersion: 35` y permisos exactos
- [ ] `PrivacyInfo.xcprivacy` en repo
- [ ] ThemeContext definido
- [ ] Push token sync handler implementado
- [ ] `.well-known/apple-app-site-association` live en eva-app.cl
- [ ] `.well-known/assetlinks.json` live en eva-app.cl
- [ ] GitHub Actions para EAS Build creado
- [ ] Maestro instalado y primer test corriendo en simulador
- [ ] Age rating declarado 13+ en App Store Connect

---

#### 6B — EVA App: React Native coach + alumno (`apps/mobile/`) — 12 semanas

**Bundle ID:** `cl.evaapp.eva`  
**Stores:** App Store + Google Play  
**Cuentas:** Guimel (Apple, $0) + Google Play ($25 USD, pagar antes de *publicar* — no antes de empezar)  
**Timeline:** 12 semanas dev + 2-3 semanas review = **14-15 semanas hasta live**

**Estrategia de builds y testing (decisión 2026-05-18):**
- **Android sin Google Play:** EAS genera APK → instalar directo en celular Juan (ADB o link de descarga). Google Play ($25) solo necesario al momento de submisión pública.
- **iOS test externo:** Registrar UDID de dispositivo con `eas device:create` → build ad-hoc → link de descarga. TestFlight disponible cuando exista listing en App Store Connect (Sem 13).
- **Supabase local remoto:** ngrok (`ngrok http 54321`) expone Supabase al exterior para testeo desde celulares fuera de la red local. Ver MT-27.
- **Sentry:** descartado por costo (trial 2 semanas, sin plan gratuito viable).

**Implicaciones cuenta Guimel:**
- App aparece bajo nombre/empresa de Guimel — coordinar nombre neutral o usar nombre de EVA
- Guimel debe mantenerse activo titular — si cierra cuenta, ambas apps desaparecen
- Team ID: App Store Connect → Membership → copiar a `eas.json`
- Guimel agrega tu Apple ID como App Manager: App Store Connect → Users and Access

---

**Arquitectura del app:**

```
apps/mobile/
├── app/
│   ├── index.tsx                    ← SOY COACH / SOY ALUMNO
│   ├── (auth)/
│   │   ├── login.tsx                ← login compartido (Supabase)
│   │   └── forgot-password.tsx
│   ├── coach/                       ← solo si auth.role = 'coach'
│   │   ├── (tabs)/
│   │   │   ├── clientes/            ← lista clientes, búsqueda
│   │   │   ├── builder/             ← crear/editar programas (simplificado)
│   │   │   ├── nutricion/           ← planes nutricionales
│   │   │   ├── check-ins/           ← revisar check-ins pendientes
│   │   │   └── perfil/              ← settings, branding* (*solo standalone)
│   │   └── cliente/[id]/            ← detalle alumno
│   └── alumno/                      ← solo si auth.role = 'client'
│       ├── codigo.tsx               ← ingresar invite_code (5 chars)
│       ├── (tabs)/
│       │   ├── workout/             ← plan semanal + ejecución
│       │   ├── nutricion/           ← plan del día + log comidas
│       │   ├── check-in/            ← enviar check-in fotográfico
│       │   └── perfil/              ← settings personales
│       └── workout/[planId]/        ← ejecución con timer, sets, voz
├── components/
│   ├── shared/                      ← compartidos entre coach y alumno
│   └── coach/ / alumno/             ← específicos por rol
└── lib/
    ├── supabase.ts                  ← detectSessionInUrl: false
    ├── branding.ts                  ← cargar logo/color por invite_code o coach_id
    ├── offline-cache.ts             ← AsyncStorage para plan semanal
    └── push.ts                      ← expo-notifications handlers
```

---

**Pantalla de entrada:**
```
┌──────────────────────────┐
│         EVA              │
│                          │
│  ┌────────────────────┐  │
│  │    SOY COACH       │  │  → login → dashboard coach
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │    SOY ALUMNO      │  │  → ingresar código 5 chars → login
│  └────────────────────┘  │
└──────────────────────────┘
```

**Flujo COACH — login:**
```
Login (email + password)
  → Supabase Auth → JWT con coach_id, org_id (si aplica)
       → si org_managed: ocultar tabs Billing + Branding
       → si standalone: tabs completas
            → dashboard: clientes, builder, nutrición, check-ins
```

**Flujo ALUMNO — onboarding:**
```
Ingresar código (ej: 4XK7M)
  → API busca coach/org por invite_code
       → carga branding (logo, color primario, nombre)
            → login con ese branding aplicado
                 → tabs: Workout / Nutrición / Check-in / Perfil
                      → "Cambiar coach/gym" en Perfil → vuelve a ingresar código
```

---

**Scope completo EVA App:**

| Feature | Coach standalone | Coach enterprise | Alumno |
|---|---|---|---|
| Lista clientes | ✓ | ✓ (asignados por org) | — |
| Builder programas (mobile-optimized) | ✓ | ✓ | — |
| Crear plan nutricional | ✓ | ✓ | — |
| Ver check-ins alumnos | ✓ | ✓ | — |
| Push al alumno (nuevo workout) | ✓ | ✓ | — |
| Branding (logo, color) | ✓ | ✗ (org lo gestiona) | — |
| Billing / suscripción | ✓ | ✗ (org paga) | — |
| Ver plan workout semana | — | — | ✓ |
| Ejecutar workout + timer + voz | — | — | ✓ |
| Loguear sets | — | — | ✓ |
| Ver plan nutricional día | — | — | ✓ |
| Loguear comidas | — | — | ✓ |
| Enviar check-in | — | — | ✓ |
| Push notifications | — | — | ✓ |
| Offline: plan semanal cacheado | — | — | ✓ |
| Offline: log sets en cola | — | — | ✓ |
| Media Session (lock screen) | — | — | ✓ |
| Pedómetro | — | — | ✓ (v1.1) |
| HealthKit / Health Connect | — | — | ✓ (v1.1) |
| NFC check-in | — | — | ✓ (v1.1) |
| Background timer real | — | — | ✓ (v1.1) |
| Video form review | — | — | ✓ (v1.1) |

**Coach mobile vs web — qué va en mobile:**
- Mobile: acciones rápidas — ver clientes, enviar feedback, asignar workout, revisar check-in fotográfico
- Web: operaciones complejas — builder drag-drop de 12 semanas, analytics detallados, CSV export, template library. El app tiene un builder simplificado (bloques, series, ejercicios) pero para construcción de programas complejos → deep link a web

**Dependencias DB (agregar en Fase 6B antes de empezar):**
```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  method TEXT CHECK (method IN ('nfc', 'manual', 'qr'))
);

-- form review videos
CREATE TABLE IF NOT EXISTS form_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  exercise_name TEXT,
  video_url TEXT NOT NULL,
  coach_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Roadmap 6B — estado al 2026-05-18:**
```
[✅] Sem 1-2:  Auth + selector rol + ThemeContext + branding por invite_code + push_tokens migration
[✅] Sem 3-4:  Módulo alumno completo (workout/[planId], nutricion, check-in, offline cache)
[✅] Sem 5:    Push notifications — configurePushHandler, Android channel, syncPushToken,
               web/lib/push.ts fanout VAPID+Expo, app.json expo-image-picker plugin
[✅] Sem 6-7:  Módulo coach — clientes (búsqueda), check-ins (barra energía), builder (chip picker),
               coach/cliente/[clientId].tsx, lib/coach.ts
[✅] Sem 8:    Coach enterprise — lib/org.ts (JWT org_id/org_role), perfil.tsx org-aware,
               (auth)/reset-password.tsx, _layout.tsx Linking deep link handler
[✅] Stubs:    coach/nutricion.tsx (planes por cliente + macros), alumno/perfil.tsx (info + branding)
[⏸ v1.1] Sem 9:  In-app messaging — postergado. Coaches usan WhatsApp hoy.
               Schema messages documentado abajo (implementar cuando haya demanda real).
[⏸ v1.1] Sem 10: HealthKit/Health Connect + pedómetro + background timer
[⏸ v1.1] Sem 11: NFC check-in + video form review
[⏸ v1.1] Sem 12: Leaderboards + streaks de workout
[🎯 PRÓXIMO] Sem 13: Auditoría Guimel + App Privacy Labels + screenshots + polish final
```

**Stack real (difiere del plan original):**
- Expo SDK 54 (no 53) + Expo Router v6 (no v4) + React Native 0.81.5
- NativeWind descartado — StyleSheet nativo
- Sentry descartado (costo; revisar en v1.1)
- EAS: cuenta `juandeveva`, proyecto `eva`, ID `a5f4f7c0-861c-48b1-9ed6-fc46e7843844`

**Schema para in-app messaging (agregar en migración antes de Sem 9):**
```sql
CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES coaches(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  sender_role text NOT NULL CHECK (sender_role IN ('coach', 'client')),
  body        text NOT NULL CHECK (char_length(body) <= 2000),
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON messages(coach_id, client_id, created_at DESC);
CREATE INDEX ON messages(client_id, read_at) WHERE read_at IS NULL; -- mensajes no leídos

-- RLS: coach ve mensajes de SUS clientes. Cliente ve mensajes con SU coach.
-- Supabase Realtime: habilitar para tabla messages → updates en tiempo real sin polling
```

**En app RN:** usar `supabase.channel('messages').on('INSERT', ...)` para tiempo real. En web `/coach/clients/[id]/messages/` → página de conversación (Fase posterior, no bloquea el MVP web).

**P0 antes de App Store submission (EVA App):**
- [ ] `.well-known/apple-app-site-association` en eva-app.cl (ya live desde 6B.0)
- [ ] `assetlinks.json` en eva-app.cl (ya live desde 6B.0)
- [ ] EAS Update (OTA) configurado y probado (ya desde 6B.0)
- [ ] `PrivacyInfo.xcprivacy` en repo (ya desde 6B.0)
- [ ] App Privacy Labels: fitness, nutrition, health data, user content, messages
- [ ] Data Safety Form Google Play (incluir mensajes coach-alumno en "user content")
- [ ] Age rating: declarar 13+ en App Store Connect (datos corporales + fotos check-in)
- [ ] Screenshots iPhone 16 Pro Max 6.9" (coach mode + alumno mode, mínimo 3 cada uno)
- [ ] Screenshots iPad (si supportsTablet: true — si no, solo iPhone)
- [ ] Privacy policy live y actualizada (mención de: Camera, Photos, Motion, Push, Mensajes)
- [ ] `EVANative` en userAgent para que el web banner no aparezca dentro del app
- [ ] **NO hay ningún CTA de compra/suscripción dentro de la app** — billing es web-only
- [ ] Deep link "Gestionar plan" en coach perfil → `eva-app.cl/coach/settings/billing` en Safari
- [ ] App Review Notes redactados:
  ```
  - App tiene dos roles: Coach y Alumno con UX completamente separada
  - Subscripciones son gestionadas en eva-app.cl (web). App no vende nada.
  - Para testear como Coach: [credenciales demo]
  - Para testear como Alumno: invite_code = [código demo]
  - Demo org disponible en staging
  ```
- [ ] Sentry reportando crashes correctamente en production build
- [ ] `targetSdkVersion: 35` en app.json (requerido Google Play)

---

#### 6C — EVA Enterprise App: React Native (`apps/enterprise/`) — 8 semanas

**Bundle ID:** `cl.evaapp.eva-enterprise`  
**Stores:** App Store + Google Play (mismas cuentas Guimel/Google que EVA App)  
**Target:** org_owner y org_admin — gym owners, directores de academias  
**Timeline:** 8 semanas dev + 2-3 semanas review (puede correr paralelo a 6B semanas 5-12)

**Separado de EVA App porque:**
- Usuario distinto (dueño del negocio, no coach ni alumno)
- UX distinto (dashboards, matrices, reportes — no workout execution)
- Apple lo prefiere separado a tener un "admin mode" escondido en la misma app
- Dos listings en stores = más discoverability B2B

**Arquitectura del app:**

```
apps/enterprise/
├── app/
│   ├── index.tsx                    ← login org_admin
│   ├── (tabs)/
│   │   ├── dashboard/               ← health scores, coaches activos, alumnos
│   │   ├── coaches/                 ← lista, invitar, suspender, ver carga
│   │   ├── alumnos/                 ← pool completo, asignar, importar
│   │   ├── reportes/                ← actividad semanal, retención, workouts
│   │   └── ajustes/                 ← branding org, billing, perfil
│   ├── coach/[id]/                  ← detalle coach: alumnos asignados, actividad
│   └── alumno/[id]/                 ← detalle alumno: asignación, historial check-ins
├── components/
└── lib/
    ├── supabase.ts
    └── analytics.ts                 ← health score, retención, actividad
```

**Pantalla de entrada:**
```
┌──────────────────────────────┐
│     EVA Enterprise           │
│     Para tu gimnasio         │
│                              │
│  Email de organización       │
│  ┌──────────────────────────┐│
│  │ admin@crossfitnorte.cl   ││
│  └──────────────────────────┘│
│  Contraseña                  │
│  [       Login               │
│                              │
│  ¿Nuevo? Contacta a EVA      │
└──────────────────────────────┘
```

**Sin invite_code aquí** — org admins tienen cuenta directa. El invite_code es para coaches y alumnos en EVA App.

**Scope completo EVA Enterprise App:**

| Feature | Descripción |
|---|---|
| Dashboard org | Health score, coaches activos, alumnos asignados/sin asignar, workouts semana |
| Gestión coaches | Invitar por email, ver estado, suspender, remover, ver alumnos asignados |
| Pool de alumnos | Lista completa org, importar CSV, asignar a coach, reasignar, ver historial |
| Matriz asignación | Vista coach ↔ alumnos — touch-friendly para asignar desde tablet/teléfono |
| Reportes | Actividad por coach, retención alumnos, workouts completados, check-ins |
| Branding org | Cambiar logo, color primario — aplica a todos los coaches de la org |
| Billing | Ver historial pagos, próxima fecha de cobro, link de pago |
| Notificaciones push | Alerta cuando health score baja de 60, coach inactivo 7 días |
| Coach que sale | Proceso: suspender → clientes van al pool → notificación automática |

**NO incluye** (lo tiene EVA App, no este app):
- Builder de ejercicios / programas
- Planes nutricionales
- Timer de workout
- Check-in de alumno
- Ejecución de workout

**Roadmap 6C (8 semanas, paralelo a 6B semanas 5-12):**
```
Sem 1-2:  Setup + auth org_admin + dashboard con health score real
Sem 3:    Módulo coaches (lista, invitar, suspender)
Sem 4:    Pool de alumnos + asignación básica (dropdown)
Sem 5:    Importar CSV desde mobile (pick file + preview)
Sem 6:    Reportes + analytics visuales (charts simples)
Sem 7:    Branding + billing + proceso offboarding coach
Sem 8:    Push notifications + polish + screenshots
```

**P0 antes de App Store submission (EVA Enterprise):**
- [ ] Login solo funciona para org_owner/org_admin — `role` validado en server
- [ ] RLS: un admin nunca ve datos de otra org
- [ ] `PrivacyInfo.xcprivacy` (puede compartir estructura con EVA App)
- [ ] App Privacy Labels: contact info, usage data (no health data aquí)
- [ ] Data Safety Form Google Play (más simple — sin health/fitness data)
- [ ] Screenshots: dashboard org, lista coaches, pool alumnos (iPad + iPhone)
- [ ] Descripción en stores: "Para administradores de gyms y academias. Requiere cuenta enterprise de EVA."
- [ ] Deep link a EVA App en pantalla de login: "¿Eres coach o alumno? Descarga EVA →"

---

## Deploy a producción — proceso

```
1. Migraciones testeadas en local (npx supabase start + db reset)
2. Migraciones testeadas en staging (supabase db push --db-url $STAGING_DB_URL)
3. PR a v2/enterprise → CI verde (lint + typecheck + vitest)
4. E2E corre automáticamente al merge a v2/enterprise
5. PR de v2/enterprise a master → CI verde
6. ANTES del merge a master (manual):
   a. npx supabase db push --db-url $PROD_DB_URL
   b. Verificar migración OK en Supabase Dashboard prod
   c. Smoke test: abrir /coach/clients y verificar que carga
7. Merge a master → Vercel auto-deploy
8. Verificar /coach/clients funciona en producción
9. Si algo falla → ejecutar rollback SQL de la migración
```

**Rollback:** cada `XXXX_name.sql` tiene su `XXXX_name.rollback.sql` al lado. Sin PITR (requiere Pro).

---

## Riesgos

> **Incidente en producción →** ver `v2newEVA/RUNBOOK.md` para protocolo de respuesta P0/P1/P2.

| Riesgo | P | Impacto | Mitigación |
|---|---|---|---|
| RLS nueva degrada /coach/clients | Media | Alto | EXPLAIN ANALYZE antes/después de deploy |
| Coach standalone ve datos de org | Baja | Crítico | 6 RLS isolation tests desde SDK |
| Keys staging/prod mezcladas en Vercel | Media | Crítico | Environments separados en Vercel, verificar antes de cada PR |
| Mover web a apps/web/ rompe Vercel | Media | Alto | Fase 6A en feature branch, CI obligatorio |
| JWT stale tras expulsión (1h ventana) | Baja | Medio | RLS chequea status en DB como verdad final |
| JWT multi-org elige org equivocada | Media | Medio | Hook usa joined_at DESC LIMIT 1 — org-switcher hace refreshSession(). Documentado y aceptado para MVP. |
| Cliente enterprise no paga | Media | Medio | Contrato firmado + dunning D+5/D+10 + org_invoices tracking |
| CSV emails inválidos llenan pool | Media | Bajo | Preview antes de confirmar + límite 200 |
| EAS Build 30/mes insuficiente (2 apps) | Media | Medio | `eas build --local` para Android dev, EAS cloud solo releases iOS + prod |
| Supabase free 500MB límite | Baja | Alto | Monitorear en dashboard, migrar a Pro cuando haya revenue |
| GitHub Actions 500 min/mes privado | Media | Bajo | E2E solo en merge a v2/enterprise, npm cache en CI |
| App Store rechaza EVA App (dual-role) | Media | Alto | App Review Notes con credenciales demo por rol. Precedente: Airbnb, Uber. Screenshots separados por rol. |
| App Store rechaza por falta de IAP | Alta | Crítico | Web-only billing — app no vende nada. App Review Notes lo aclaran explícitamente. |
| App Store rechaza EVA Enterprise (demasiado simple) | Baja | Medio | Analytics/reportes sustanciales en screenshots. B2B management apps tienen precedente claro. |
| Android API 35 no configurado al submit | Alta | Crítico | `targetSdkVersion: 35` en app.json desde 6B.0. CI verifica esto. |
| Offline workout queue pierde datos | Media | Medio | Toast `beforeunload` si queue no vacía, límite 50 sets en queue |
| `sendPushToCoachClients` timeout (100+ clientes) | Media | Medio | Paginar en batches de 20 con Promise.allSettled. Mover a Vercel Queue si crece. |
| VAPID_PRIVATE_KEY leak | Baja | Alto | Solo en Vercel server env, nunca con prefijo `NEXT_PUBLIC_` |
| invite token en DB sin hash | Alta | Alto | **RESUELTO en schema** — `token_hash` con SHA-256. No hay token plaintext. |
| Upstash Redis caído → rate limit bypass | Baja | Medio | fail-closed en invite accept, fail-open en org creation. Documentado en código. |
| MercadoPago webhook duplicado | Media | Medio | Idempotency key en `external_payment_id` antes de procesar |
| MP pre-approval sigue activo al unirse a org | Media | Medio | `accept_org_invite` cancela el pre-approval via MP API al hacer org_managed |
| Trial termina sin conversión (datos huérfanos) | Media | Bajo | Cron detecta trial_ends_at < now() → suspend → 30 días extra → soft delete |
| ARCO request sin proceso documentado | Baja | Medio | Email privacidad@eva-app.cl + proceso manual documentado internamente |
| Menor de 14 sin consentimiento registrado | Baja | Alto | `age_confirmed_at` en clients + checkbox en onboarding alumno |
| Speech synthesis pronuncia HTML | Baja | Bajo | Strip HTML en `speakWorkoutCue()` |
| AppDownloadBanner vuelve en iOS Safari (ITP) | Baja | Bajo | Usar cookie httpOnly además de localStorage |
| Server action falla silenciosamente en prod (sin logs) | Alta | Alto | **RESUELTO** — Sentry web instalado en Fase 0.5 |
| Producción caída sin aviso a clientes enterprise | Media | Crítico | **RESUELTO** — UptimeRobot + RUNBOOK.md |
| Org supera 100 alumnos sin pagar extra | Media | Medio | `client_limit` en schema + verificación en RPC import/createClient |
| MP pre-approval cobra pero webhook se pierde | Media | Medio | Cron MP reconciliación viernes + idempotency guard existente |
| Admin abandona onboarding wizard → empieza de cero | Media | Medio | `onboarding_step` recovery en layout.tsx del wizard |
| Pool de clientes lento con 500+ alumnos | Media | Medio | **RESUELTO** — índices pg_trgm en clients.name y clients.email |
| org_invoices/payment_exceptions sin RLS | Alta | Crítico | **RESUELTO** — políticas RLS agregadas en migración 011 |

---

## Timeline resumen

```
━━━ FASE INMEDIATA (ANTES de todo) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Día 1 (hoy):   Landing enterprise section → master → producción (4-6h)
               DPA Vercel firmado (15 min)
               Calendly + one-pager PDF (1.5h)
               Bundle IDs registrados en App Store Connect (15 min)
               Google Play account creada si no existe ($25 USD)

━━━ FASE WEB + ENTERPRISE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Semana 1:      Fase 0 (git branch, Docker+Supabase local, monorepo, Vercel envs)
               + Fase 0.5: CSP headers, ADMIN_EMAILS, VAPID keys
Semanas 1-2:   Fase 1 inicio (11 migraciones → ahora 11, incluye org_invoices)
               + Fase 1.5b: idempotency en MP webhook
               + Fase 1.7 paralelo: offline workout queue + push send (broken en prod)
Semanas 2-3:   Fase 1 completa (RLS, auth hook, storage, email templates)
               + Fase 1.8: Publicar .well-known/ en producción (apple-app-site-association + assetlinks)
Semanas 3-4:   Fase 2 (frontend enterprise: /org/*, admin panel, empty states, PostHog tracking)
               + Fase 2.8 P1 paralelo: AppDownloadBanner, Media Session, Web Share
Semana 4:      Fase 2.8 P2 (Speech Synthesis, Fullscreen, Badging API)
               + Fase 3 paralelo (legal: ToS, privacidad, ARCO, DPA chain, age confirmation)
               + Fase 3.2: org_invoices en admin panel
               + Fase 3.5: pipeline ventas Google Sheets (o HubSpot free)
Semana 5:      Fase 4 (QA, RLS isolation, E2E enterprise journey, security checklist)
               + Fase 4 nuevo: test invite token hash, test multi-org switch, test trial expiry
Semana 6:      Onboarding Cliente Enterprise 1 (health score D0, D7, D14)
Semana 7:      Onboarding Cliente Enterprise 2
Semanas 8-9:   Estabilización enterprise web + upsell trigger activo + QBR D30 plantilla lista

━━━ FASE MÓVIL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Semana 10:     Fase 6A (mover web a apps/web/) + deprecar /api/manifest/
Semana 11:     Fase 6B.0 (pre-flight mobile: EAS, expo-updates, Sentry, app.json,
               PrivacyInfo.xcprivacy, ThemeContext, Maestro, GitHub Actions mobile)
Semanas 12-13: Fase 6B Sem 1-2: auth + selector rol + branding por invite_code
Semanas 14-15: Fase 6B Sem 3-4: módulo alumno completo (workout, nutrición, check-in, offline)
Semana 16:     Fase 6B Sem 5: push notifications + EAS dev build en dispositivo físico
               + Fase 6C inicio: EVA Enterprise App setup + auth org + dashboard
Semanas 17-18: Fase 6B Sem 6-7: módulo coach (lista clientes, builder mobile, check-ins)
               + EVA Enterprise — coaches + pool alumnos + asignación (paralelo)
Semana 19:     Fase 6B Sem 8: coach enterprise (sin billing/branding) + deep link testing
               + EVA Enterprise — reportes + branding + billing
Semana 20:     Fase 6B Sem 9: In-app messaging coach ↔ alumno (tabla messages + Realtime)
               + EVA Enterprise — push health score + polish
Semana 21:     Fase 6B Sem 10: HealthKit/Health Connect + pedómetro + background timer (v1.1)
Semana 22:     Fase 6B Sem 11: NFC check-in + video form review setup (v1.1)
Semana 23:     Fase 6B Sem 12: leaderboards básicos + streaks (v1.1 engagement)
Semana 24:     Fase 6B Sem 13: auditoría Guimel + App Privacy Labels + screenshots + polish
               Fase 6C: auditoría + screenshots iPad + polish

━━━ APP STORE REVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Semanas 25-27: Submit EVA App + EVA Enterprise → review Apple (~2-3 semanas)
               Android simultáneo (review ~3-7 días)
Semana 27-28:  Live en stores
```

**Total hasta enterprise web en producción: ~7 semanas** (+ Fase Inmediata: día 1)
**Total hasta EVA App live en stores: ~27 semanas** (incluye 6B.0 pre-flight + messaging + v1.1)
**Total hasta EVA Enterprise live en stores: ~27 semanas** (paralelo desde semana 16)
**Diferencia vs plan original:** +3 semanas por 6B.0 pre-flight + messaging + leaderboards = inversión que evita rechazos y mejora retención

---

## Checklist pre-launch enterprise

### Setup / DevOps
- [ ] DPA Supabase + Vercel firmados
- [ ] `enterprise.eva-app.cl` domain alias activo
- [ ] CSP headers en vercel.json deployados (`'unsafe-eval'` removido)
- [ ] Vercel: `Preview` env apunta a staging Supabase (NO prod)
- [ ] `ADMIN_EMAILS` + `ADMIN_EMAIL` en Vercel Production
- [ ] E2E solo en merge a v2/enterprise (no cada PR) — conservar 500 min/mes
- [ ] Sentry web (`@sentry/nextjs`) instalado — `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` en Vercel
- [ ] UptimeRobot activo: 3 monitores configurados + alerta email/SMS funcionando
- [ ] `/api/health` endpoint live → responde `{status:'ok'}` en producción
- [ ] `npm audit --audit-level=high` en CI (job `audit` antes de lint)

### Backend / Security
- [ ] Migraciones en staging sin errores (incluye `purge_audit`, `org_invoices`, `payment_exceptions`, `token_hash`, `trial_ends_at`, `age_confirmed_at`, `client_limit`, `last_health_score`)
- [ ] `org_invoices` tabla con RLS — org_owner/org_admin ven solo sus facturas, escritura solo service_role
- [ ] `payment_exceptions` tabla con RLS — mismo patrón que org_invoices
- [ ] `purge_audit` tabla con RLS — solo service_role, nunca borrar esta tabla
- [ ] `organization_invites.token_hash` es SHA-256, NO plaintext
- [ ] Gap 1 fix: `cRouteSlug` validado con regex ANTES de query (no `.or()` concatenado)
- [ ] Partial unique index `(coach_id, org_id) WHERE deleted_at IS NULL` en organization_members
- [ ] `organizations.trial_ends_at` existe y cron health-alert lo chequea
- [ ] `organizations.client_limit` existe y `import_clients_to_org` lo verifica
- [ ] `clients.age_confirmed_at` existe
- [ ] Rate limits: invite (10/IP/h) fail-CLOSED, org create (3/user/día) fail-OPEN
- [ ] Rate limit: comportamiento documentado en código si Upstash Redis está caído
- [ ] JWT Auth Hook deployado y verificado en Supabase
- [ ] `org_audit_logs` sin policies UPDATE/DELETE
- [ ] Bucket `org-assets` con policies correctas
- [ ] Logo MIME validado en Server Action (no solo client)
- [ ] `ADMIN_EMAILS` configurado en Vercel Production
- [ ] Rollback SQL por migración documentado
- [ ] `VAPID_PRIVATE_KEY` NO tiene prefijo `NEXT_PUBLIC_`
- [ ] Push send solo desde Server Actions y crons
- [ ] `sendPushToCoachClients` paginado en batches de 20 (no bloquea timeout Vercel)
- [ ] MP webhook: idempotency key via `external_payment_id` antes de procesar
- [ ] `accept_org_invite` cancela pre-approval MP del coach al hacer org_managed
- [ ] `accept_org_invite` maneja caso B: coach sin cuenta EVA aún (crear auth user)
- [ ] Respuesta uniforme en invite accept (no leak si email existe o no)
- [ ] DPA Vercel firmado (verificar documento guardado)
- [ ] Speech synthesis: strip HTML antes de `SpeechSynthesisUtterance`
- [ ] Offline workout queue: toast beforeunload si queue no vacía, límite 50 sets

### Frontend / UX
- [ ] Onboarding 5 pasos funciona end-to-end
- [ ] Empty states en todas las pantallas enterprise
- [ ] Coach standalone: cero cambios visibles
- [ ] Dark mode en todas las pantallas enterprise
- [ ] Mobile responsive: asignación desde celular funciona
- [ ] Admin panel `/admin/orgs` operativo

### Legal / Compliance / Sales
- [ ] Contratos firmados (ambos clientes) — incluye cláusula annual pricing option
- [ ] ToS enterprise actualizado en producción (secciones: roles, billing, qué pasa si coach sale)
- [ ] Política de privacidad actualizada (ARCO, datos de salud, retención 90 días, menores)
- [ ] **Cookie consent** implementado (`CookieConsent.tsx`) — PostHog `opt_out_capturing_by_default: true`
- [ ] Email `privacidad@eva-app.cl` funcionando (alias de tu email)
- [ ] Proceso ARCO documentado internamente (qué exportar, qué borrar, SLA 15 días hábiles)
- [ ] `age_confirmed_at` en onboarding alumno (web + RN)
- [ ] Refund policy en contrato ("sin reembolso proporcional, cancelación fin de mes")
- [ ] DPA Supabase firmado ✓
- [ ] DPA Vercel firmado (verificar)
- [ ] ICP documentado en 3.5 + checklist BANT en Google Sheets ✓
- [ ] Pipeline de ventas Google Sheets creado con columna BANT
- [ ] One-pager PDF creado
- [ ] Calendly configurado con tu disponibilidad real
- [ ] Competitive deck preparado (EVA vs TrueCoach, EVA vs Trainerize — diferenciadores CLP/español/MP)
- [ ] Oferta annual pricing documentada: $499.900/año = 2 meses gratis
- [ ] Secuencia trial → paid D0/D7/D14/D21/D28/D30 documentada ✓

### Landing page enterprise
- [ ] `LandingEnterpriseSection` live en producción (puede ir antes de Fase 1)
- [ ] Nav link "Para Gyms" → `#enterprise`
- [ ] Banner enterprise en sección pricing con CTA a `#enterprise`
- [ ] SEO: `<title>` contiene "Gyms" / description menciona enterprise
- [ ] Cuenta Calendly creada y link insertado en componente
- [ ] "Precios + IVA" visible en sección enterprise
- [ ] "Ver planes enterprise →" en FinalCTA funciona
- [ ] Dark mode + mobile 320px verificados (WCAG AA contraste)
- [ ] 8 QA checks de la sección 3.6 todos verdes

### PWA & Device APIs
- [ ] `AppDownloadBanner` visible en iOS/Android en `/c/[slug]/` — no visible en `/coach/*`
- [ ] Banner no aparece si viene de app RN (userAgent `EVANative`)
- [ ] Banner no aparece si ya fue cerrado (localStorage `app_banner_dismissed`)
- [ ] **Cero** prompts de instalación PWA — ningún `beforeinstallprompt` handler en el código
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` en Vercel Production
- [ ] `web-push` instalado (`npm install web-push`)
- [ ] VAPID keys generadas: `npx web-push generate-vapid-keys`
- [ ] `sendPushToClient()` probado con dispositivo real (no solo Inbucket)
- [ ] `OfflineWorkoutQueueSync` drena al reconectar (testear: loguear set offline → reconectar → verificar en DB)
- [ ] Media Session API: ejercicio y timer aparecen en pantalla de bloqueo (iOS Safari PWA + Android Chrome)
- [ ] Web Share: botón "compartir PR" genera imagen y abre share sheet nativo
- [ ] Speech Synthesis: voz anuncia "Descansando 60 segundos" + "¡A entrenar!" (toggle en settings funciona)
- [ ] Badging API: badge aparece en ícono PWA cuando hay nuevo workout asignado
- [ ] `AppOnlyFeatureBadge` visible en: timer background settings, pedómetro dashboard, HealthKit check-in, NFC check-in, video form review
- [ ] Fullscreen mode: botón en workout activa pantalla completa + portrait lock (Android Chrome)
- [ ] Wake Lock: pantalla no se apaga durante timer de descanso (testear con pantalla 30s timeout)

### QA
- [ ] Suite E2E /coach/* pasa sin modificaciones
- [ ] RLS isolation: 6 escenarios verdes
- [ ] Inbucket invite flow test pasa
- [ ] Enterprise journey E2E completo
- [ ] Performance /coach/clients: sin regresión

### Operacional
- [ ] Cron purga 90 días implementado y en vercel.json
- [ ] Cron health alert lunes 9am implementado (fórmula mejorada con tendencia)
- [ ] Cron MP reconciliación viernes 10am implementado
- [ ] Onboarding wizard recovery: `onboarding_step` persiste y redirige al paso correcto al volver
- [ ] Botón "Reenviar invitación" en admin panel para org_owner que no activó en 24h
- [ ] RUNBOOK.md creado en v2newEVA/ (P0 + P1 + comunicación SLA)
- [ ] Proceso offboarding coach (sale de org) documentado y testado
- [ ] Demo org "EVA Demo Gym" en staging lista para ventas

### EVA App — pre-submission (Fase 6B)
- [ ] `eas.json` configurado con `appleTeamId` de Guimel
- [ ] Guimel agregó tu Apple ID como App Manager en App Store Connect
- [ ] Google Play Developer account creada ($25 pagado) y `cl.evaapp.eva` registrado
- [ ] Bundle ID `cl.evaapp.eva` en App Store Connect
- [ ] `PrivacyInfo.xcprivacy` en repo
- [ ] App Privacy Labels (fitness, nutrition, health, user content)
- [ ] Data Safety Form Google Play completado
- [ ] `.well-known/apple-app-site-association` + `assetlinks.json` live en eva-app.cl
- [ ] EAS Update (OTA) configurado y probado con un hotfix real
- [ ] Screenshots iPhone 16 Pro Max: coach mode (3+) y alumno mode (3+) separados
- [ ] Coach org_managed NO ve tabs Billing ni Branding — verificado en dispositivo físico
- [ ] `EVANative` en userAgent → web no muestra AppDownloadBanner dentro del app
- [ ] App Review Notes redactado: roles distintos, no es template, screenshots por rol

### EVA Enterprise App — pre-submission (Fase 6C)
- [ ] Bundle ID `cl.evaapp.eva-enterprise` registrado en App Store Connect y Google Play
- [ ] Login rechaza usuarios que no son org_owner/org_admin — validado server-side
- [ ] RLS: admin Org A nunca ve datos de Org B (mismo criterio que web enterprise)
- [ ] App Privacy Labels: contact info, usage data (SIN health/fitness — eso es EVA App)
- [ ] Data Safety Form Google Play completado
- [ ] Screenshots: dashboard org + lista coaches + pool alumnos (iPad + iPhone)
- [ ] Descripción stores: "Para administradores de gyms. Requiere cuenta enterprise de EVA."
- [ ] Deep link a EVA App visible en pantalla de login enterprise

---

## Roadmap Futuro — Features no incluidas en V2

> Documentar decisiones de "no hacer ahora" evita redecidirlas. Estas features son válidas pero no son prioridad para las Fases 0-6C.

---

### Video Library — Reemplazar GIFs por Videos (v2.1)

**Estado actual:** GIFs animados de ejercicios en la biblioteca. Los GIFs son livianos pero de baja calidad y sin audio.

**Request documentado:** Coach (standalone) u organización puede reemplazar el GIF de un ejercicio con un video propio. Solo pegan el link y el video se reproduce inline, sin botones ni player evidente.

#### Análisis técnico de opciones:

**Opción A — YouTube embed (link → iframe)**
- Coach pega URL de YouTube (su canal, video unlisted está bien)
- Extraer `videoId` del URL: `https://youtube.com/watch?v=XXXXXXXXXXX` → `XXXXXXXXXXX`
- Render: `<iframe src="https://youtube.com/embed/XXXXXXXXXXX?autoplay=0&controls=0&loop=1&modestbranding=1" />`
- Pros: $0, cero almacenamiento, coach sube donde ya sube sus videos
- Contras: requiere internet, `controls=0` no elimina el logo de YouTube (aparece al hover), en app RN necesita `expo-av` o WebView con permisos especiales, Apple puede rechazar si el contenido de YouTube es inapropiado
- **Problema en app nativa:** YouTube no permite embeds en WKWebView (iOS) sin `enablejsapi=1` y consent, puede ser flakey
- Veredicto: **válido para web**, **problemático en RN**

**Opción B — Vimeo embed (link → iframe)**
- Mismo concepto pero Vimeo permite `background=1` → autoplay loop sin controles, sin logo
- URL: `https://vimeo.com/XXXXXXXXX` → `https://player.vimeo.com/video/XXXXXXXXX?background=1&autoplay=1&loop=1&byline=0&title=0`
- Pros: UX limpia (se ve igual que GIF pero en video), sin logo, sin controles
- Contras: coach necesita cuenta Vimeo (gratis tiene límite 5GB / semana de upload), mismos problemas en RN
- Veredicto: **la mejor opción para web**, **problemático en RN**

**Opción C — Self-hosted en Supabase Storage (upload directo, max 30s)**
- Coach sube video (MP4, max 30s, max 50MB) desde el builder
- Se guarda en Supabase Storage bucket `exercise-videos`
- Se sirve via signed URL (o public bucket con RLS)
- En web: `<video src={signedUrl} autoPlay loop muted playsInline />` — exactamente igual que un GIF pero mejor calidad
- En RN: `expo-av` `<Video source={{ uri: signedUrl }} shouldPlay isLooping />` — funciona perfectamente
- Pros: funciona en web y RN, experiencia uniforme, sin dependencia de terceros, control total
- Contras: Supabase free tiene 1GB de Storage total (cuidado con el límite), necesita UI de upload en el builder
- Veredicto: **la mejor opción técnica si el storage no es problema**

**Opción D — Link directo a video (cualquier CDN público)**
- Coach pega URL directa a un MP4 (ej: Cloudinary free, Google Drive, Dropbox)
- Se renderiza con `<video src={url}>` o `expo-av`
- Pros: $0, funciona con cualquier host
- Contras: el link puede expirar (Google Drive cambia URLs), CORS puede bloquear ciertos hosts, Dropbox no sirve videos directamente

#### Recomendación para cuando se implemente:

1. **Para web + RN con paridad perfecta → Opción C** (self-hosted Supabase Storage, MP4 max 30s/50MB)
2. **Para web solo → Opción B** (Vimeo background player, UX más limpia)
3. Agregar campo `exercise_video_url text` a la tabla de ejercicios (nullable — si NULL → mostrar GIF)
4. El campo acepta: URL de Supabase Storage (signed URL) o URL externa (Vimeo/YouTube)
5. Detectar en render: si URL contiene `vimeo.com` → iframe Vimeo, si es `.mp4` → `<video>` tag, si NULL → GIF actual

**Schema cuando se implemente:**
```sql
ALTER TABLE exercises ADD COLUMN custom_video_url text;
-- NULL = usar GIF por defecto
-- Storage path = video self-hosted: 'exercise-videos/coach_id/exercise_id.mp4'
-- URL externa = Vimeo/YouTube (solo web, no RN)
```

**Pendiente definir:**
- ¿El video es por coach (standalone) o por ejercicio global de la plataforma?
- ¿Orgs pueden tener videos propios que overridean los del coach?
- ¿Límite de storage por coach en el plan free vs paid?

---

### Features descartadas de V2 (re-evaluar en v3)

| Feature | Por qué no ahora | Cuándo reconsiderar |
|---|---|---|
| AI workout builder | Requiere LLM integration + UX compleja. Trainerize lo tiene desde mar 2026. | Cuando haya >20 coaches activos — el feedback directo definirá qué construir |
| Group training / Team features | TrainHeroic diferenciador. EVA está en B2B individual por ahora. | Cuando enterprise org pida explícitamente gestionar clases grupales |
| AI form correction (computer vision) | MediaPipe/MoveNet requiere expertise ML. 60%+ de apps lo tienen pero no es diferenciador aún en LATAM. | v3 — cuando los competidores LATAM lo tengan |
| Wearable integrations (Apple Watch, Garmin) | HealthKit/Health Connect declaraciones + review extras de Apple. v1.1 ya lo menciona. | v1.1 ya en roadmap (Sem 10) — HealthKit primero |
| Marketplace de programas (B2C) | Requiere otro modelo de negocio, facturación a usuarios finales, ToS diferentes | Post-Series A imaginario |
| Video coaching 1-on-1 | Zoom API, Twilio o Daily.co — costo + complejidad. Trainerize lo tiene. | Cuando coach lo pida directamente y esté dispuesto a pagar más |

---

## Appendix — Stack de herramientas EVA v2

### Infraestructura y hosting
| Herramienta | Uso | Costo |
|---|---|---|
| **Vercel Pro** | Hosting web, crons, Edge Config, Edge Functions | Ya pagado |
| **Supabase Free** | PostgreSQL, Auth, Storage, Edge Functions, Realtime | $0 (2 proyectos) |
| **GitHub Actions** | CI/CD web + EAS Build RN | 500 min/mes gratis |

### Comunicación y email
| Herramienta | Uso | Costo |
|---|---|---|
| **Resend** | Emails transaccionales (invites, dunning, health alerts, milestones, NPS) | Free: 3.000 emails/mes |
| **WhatsApp** | Soporte por org (grupo por cliente), dunning manual D+5 | $0 |
| **Calendly** | Booking de demos enterprise (link en landing) | Free: 1 tipo de evento |

### Pagos y finanzas
| Herramienta | Uso | Costo |
|---|---|---|
| **MercadoPago** | Pre-approvals coaches standalone + payment links enterprise | % por transacción |
| **SII.cl** | Boleta / factura electrónica manual | $0 |
| **Bsale** | Facturación electrónica automatizada (activar si >5 orgs pagando) | ~$20 USD/mes |

### Analytics y observabilidad
| Herramienta | Uso | Costo |
|---|---|---|
| **PostHog** | Product analytics, eventos, feature flags graduales (% de orgs), cookie consent | Free: 1M eventos/mes |
| **Sentry (web)** | Error tracking + stack traces Next.js — server actions, RSC, API routes | Free: 5.000 errores/mes (proyecto `eva-web`) |
| **Sentry (mobile)** | Crash reporting React Native (EVA App + Enterprise App) | Free: 5.000 errores/mes (proyecto `eva-rn`) |
| **UptimeRobot** | Uptime monitoring `eva-app.cl` + `enterprise.eva-app.cl` + `/api/health` | Free: 50 monitores, 5 min intervalo |
| **Vercel Analytics** | Web Vitals automáticos (ya incluido en Vercel Pro) | Incluido |

### Ventas y CRM
| Herramienta | Uso | Costo |
|---|---|---|
| **Google Sheets** | Pipeline de ventas enterprise, tracking NPS, registro de pagos | $0 |
| **Apollo.io** | Outbound prospecting (enrichment + email frío) | Free: 50 contactos/mes |
| **Canva / Google Slides** | One-pager PDF para ventas, presentaciones | $0 |

### Customer Success y soporte
| Herramienta | Uso | Costo |
|---|---|---|
| **Linear** | Ticket tracking para soporte enterprise (bugs, requests) | Free: 1 usuario, 250 issues |
| **Typeform** | Encuestas NPS mensual a org_admins | Free: 10 respuestas/mes |
| **Google Meet** | Onboarding calls, demos, QBR | $0 |

### Legal y contratos
| Herramienta | Uso | Costo |
|---|---|---|
| **FirmaFácil** | Firma electrónica de contratos enterprise | Free plan básico |
| **Google Docs** | Templates de contratos, ToS, política de privacidad | $0 |

### Desarrollo y QA
| Herramienta | Uso | Costo |
|---|---|---|
| **Vitest** | Unit tests (server actions, utils) | $0 |
| **Playwright** | E2E tests web + visual regression + a11y | $0 |
| **k6** | Load testing antes de cada go-live enterprise | $0 (open source) |
| **Inbucket** | Testing de email flows en local (viene con `npx supabase start`) | $0 |
| **axe-core** | Automated accessibility testing en CI | $0 |

### Mobile
| Herramienta | Uso | Costo |
|---|---|---|
| **Expo SDK 53** | Base React Native (EVA App + Enterprise App) | $0 |
| **EAS Build** | Compilación cloud iOS/Android | Free: 30 builds/mes |
| **EAS Update** | OTA updates sin App Store review | Free: básico |
| **Apple Developer** (Guimel) | App Store Connect, TestFlight, certificates | $0 (cuenta de Guimel) |
| **Google Play Developer** | Google Play Console, Play Store | $25 USD one-time |
| **web-push** | Push notifications en web (ya instalado en Fase 1.7.2) | $0 |
| **expo-notifications** | Push notifications nativas en RN | $0 |

### Push infrastructure
| Herramienta | Uso | Costo |
|---|---|---|
| **VAPID (web-push)** | Push web → Chrome/Firefox/Safari | $0 (VAPID es estándar abierto) |
| **APNs** (via Expo) | Push iOS nativo | $0 (incluido en Apple Developer) |
| **FCM** (via Expo) | Push Android nativo | $0 (Google) |

### Scheduling y demos
| Herramienta | Uso | Costo |
|---|---|---|
| **Calendly** | Demo booking (30 min) desde landing enterprise | Free: 1 tipo de evento |

---

**Total mensual herramientas externas en producción con <5 orgs: $0 (+ % MP por transacción)**
**Total al escalar >5 orgs: ~$20 USD/mes (Bsale facturación)**
**Total apps en stores: $25 USD one-time (Google Play)**

---

