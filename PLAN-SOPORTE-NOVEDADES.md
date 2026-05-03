# Plan Técnico y de Producto — Soporte Coach + Centro de Novedades

> > **Estado:** Implementación completada 2026-05-02 22:30 America/Santiago  
> **Fecha:** 2026-05-02  
> **Scope:** Fase 1 Revenue MVP — Módulos `support` + `newsfeed`  
> **Target:** Desktop + Mobile (PWA)  
> **Decisión clave:** No historial de tickets en MVP. Solo email.  

---

## 1. Resumen Ejecutivo (PM)

### 1.1 Problema
- Los coaches no tienen canal directo para reportar bugs, pedir ayuda o sugerir mejoras. El feedback llega disperso (WhatsApp, email directo, llamadas).
- Los coaches no saben qué features nuevos existen ni cómo usarlos. Baja adopción, tickets de soporte evitables.
- Como CEO no tengo un panel centralizado para comunicar novedades ni medir quién las lee.

### 1.2 Solución
| Feature | Descripción corta |
|---------|-------------------|
| **Soporte Coach** | Formulario en `/coach/support` para enviar ayuda/bug/idea. Llega por email a `contacto@eva-app.cl` usando Resend (ya activo en el proyecto). Reply-to = email del coach. Sin historial en MVP. |
| **Centro de Novedades** | Panel CEO integrado en `/admin/novedades` para CRUD de novedades. Botón en navegación coach con badge "NEW". Feed modal/sheet. Tracking de lectura por coach. |

### 1.3 Investigación competitiva (hallazgos clave)

**SaaS general (Linear, Vercel, Stripe, Gleap, Canny):**
- El estándar es "2 clicks or less" para feedback. No esconder la opción, pero no ser disruptivo.
- Los bug reports con screenshot tienen 3x más resolución exitosa que los textuales.
- El changelog/cierra el loop: cuando una feature pasa a "Shipped", los usuarios que la pidieron reciben notificación automática.
- Badge de novedades en esquina superior derecha (desktop) o top header (mobile) es el patrón dominante. Nunca en bottom nav primario.

**Competencia fitness (My PT Hub, Trainerize, TrueCoach):**
- My PT Hub tiene página pública `/all-updates` y notificaciones in-app push para nuevos features. Pinchan anuncios importantes.
- Trainerize/TrueCoach no destacan changelog visible; My PT Hub usa esto como diferenciador de comunidad.
- My PT Hub separa updates por plataforma: "Cross-platform", "Web", "Mobile".
- Ninguno de los tres tiene feedback integrado visible para el coach; el soporte es por email externo o chat.

**Oportunidad para EVA:** Ser la primera plataforma de coaching en Latinoamérica con feedback in-app + novedades con badge unread. My PT Hub lo hace bien pero en inglés y sin badge inteligente.

### 1.4 KPIs objetivo
- Tiempo medio de respuesta a ticket < 24h (Fase 1).
- % coaches que abren novedades en 7 días > 60%.
- Reducción de 30% en consultas de "¿cómo hago X?" en 90 días post-lanzamiento.

---

## 2. Diseño UX/UI

### 2.1 Soporte Coach — Flujo

```
[Coach Dashboard]
    └── Menú global (sidebar desktop / bottom bar mobile)
            └── "Soporte" (icono life-buoy)
                    └── /coach/support
                            ├── Tabs: [Necesito ayuda] [Reportar bug] [Sugerir mejora]
                            ├── Inputs: Asunto, Descripción, Prioridad (solo bug), Adjunto (opt)
                            └── Botón: Enviar → Toast success
```

**Mobile:** Pantalla completa. `min-h-dvh`. Textarea con `pb-safe`.  
**Desktop:** Página dedicada dentro del shell coach.

**Wireframe mental mobile:**
```
┌─────────────────────────┐
│ ← Centro de Ayuda       │
├─────────────────────────┤
│ [Ayuda] [Bug]  [Idea]   │ ← segmented control
├─────────────────────────┤
│ Asunto *                │
│ ┌─────────────────────┐ │
│ │                     │ │
│ └─────────────────────┘ │
│ Descripción *           │
│ ┌─────────────────────┐ │
│ │ Escribe aquí...     │ │
│ │                     │ │
│ │                     │ │
│ └─────────────────────┘ │
│ Adjunto (opcional)      │
│ [📎 Subir captura]      │
│                         │
│ [    Enviar mensaje   ] │
└─────────────────────────┘
```

**Contexto automático (campos ocultos en email):**
El email que llega a EVA debe incluir metadata automática: URL actual del coach, user agent, coach ID, timestamp. Esto acelera la resolución de bugs un 40% (dato de Gleap).

**Post-envío:** Toast "Mensaje enviado. Te responderemos a la brevedad." Limpieza de formulario.  
**Email destino:** `contacto@eva-app.cl`  
**Reply-To:** email del coach (desde `coaches.email`).  
**Asunto email:** `[EVA Soporte] [Bug] Asunto del coach — [coach_name]`

### 2.2 Centro de Novedades — Flujo

```
[CEO Panel]
    └── /admin/novedades
            ├── Lista de novedades (draft / published / archived)
            ├── Botón "Crear novedad" → Sheet overlay
            └── Editor: Título, Tipo, Contenido, Imagen opt, CTA link opt, Pin, Publicar

[Coach Dashboard]
    └── Campana "Novedades" en mobile top header + desktop sidebar footer
            └── Badge rojo "NEW" superpuesto si hay unread_count > 0
                    └── Click → Sheet (mobile) / Popover (desktop) con lista cronológica
                            ├── Pinned primero
                            ├── Fecha relativa ("Hoy", "Ayer", "Hace 3 días")
                            └── CTA opcional por novedad ("Probar ahora" → link interno)
```

**Wireframe mental badge:**
```
┌────────────────────────────┐
│ EVA          🔔  ☀️  Salir │  ← mobile top header
│                     3      │  ← badge rojo con count
└────────────────────────────┘
```

**Wireframe mental feed mobile (Bottom Sheet):**
```
┌─────────────────────────┐
│         ───             │  ← drag handle
│ Novedades           [✕] │
├─────────────────────────┤
│ 📌 Anuncio importante   │  ← pinned, fondo sutil diferente
│ Nuevo pricing 2026      │
│ Hoy                     │
│ Lee más →               │
├─────────────────────────┤
│ 🟢 Nueva función        │
│ Carga de alumnos bulk   │
│ Hace 2 días             │
│ Ahora puedes... [Probar]│ ← CTA button opcional
├─────────────────────────┤
│ 🔧 Mejora               │
│ Editor de planes v2     │
│ Hace 5 días             │
└─────────────────────────┘
```

**Wireframe mental desktop (Popover desde campana):**
```
        ┌─────────────────────────┐
   🔔──→│ Novedades          Ver  │
        ├─────────────────────────┤
        │ 📌 Nuevo pricing 2026   │
        │    Hoy                  │
        ├─────────────────────────┤
        │ Carga de alumnos bulk   │
        │ Hace 2 días        [→]  │
        ├─────────────────────────┤
        │ Editor de planes v2     │
        │ Hace 5 días             │
        └─────────────────────────┘
```

**Nota de producto:** Al abrir el feed, TODAS las novedades visibles se marcan como leídas. Badge desaparece inmediatamente (`useOptimistic`). No hay lectura item-by-item en MVP.

### 2.3 Estados del badge

| Estado | Condición | UI |
|--------|-----------|-----|
| Visible con count | `unread_count > 0` y count ≤ 9 | Badge rojo, número exacto |
| Visible "9+" | `unread_count > 9` | Badge rojo, texto "9+" |
| Visible dot | `unread_count > 0` y espacio reducido | Dot rojo sin número |
| Oculto | `unread_count = 0` | Sin badge |

**Posicionamiento descubierto en investigación:**
- **Mobile:** La campana va en el **top header fijo** (z-[55]), no en el bottom bar. El bottom bar de coach ya tiene 7 items (Dashboard, Alumnos, Programas, Ejercicios, Nutrición, Mi Marca, Suscripción) y está saturado. Además, la competencia (Instagram, GitHub, Vercel) pone notificaciones en top header.
- **Desktop:** La campana va en el **footer de la sidebar** (junto a ThemeToggle y Logout) o como un item más arriba en la nav. Dado que el sidebar tiene espacio, se puede agregar como navItem adicional, pero el badge funciona mejor si está en el área de "tools" (footer).

---

## 3. Frontend Development

### 3.1 Rutas nuevas

| Ruta | Tipo | Auth | Notas |
|------|------|------|-------|
| `/coach/support` | Página | Coach (`is_coach`) | Nueva página en app coach |
| `/admin/novedades` | Página | Admin (`isAdminEmail`) | Nueva sección en panel CEO existente |

**Integración con panel existente:**
- Agregar entrada "Novedades" en `src/app/admin/(panel)/AdminSidebar.tsx` bajo grupo **Plataforma**.
- Seguir patrón de `/admin/coaches` y `/admin/clients`:
  - `src/app/admin/(panel)/novedades/page.tsx` — RSC, fetch lista.
  - `src/app/admin/(panel)/novedades/_data/novedades.queries.ts` — queries paginadas.
  - `src/app/admin/(panel)/novedades/_actions/novedades-actions.ts` — CRUD server actions con `assertAdmin()`.
  - `src/app/admin/(panel)/novedades/_components/` — tabla/lista, botón crear, sheet de edición.

### 3.2 Componentes nuevos

```
src/app/coach/support/
├── page.tsx                 # RSC — renderiza form cliente
├── SupportForm.tsx          # Client — react-hook-form + zod + useTransition
└── actions.ts               # Server action: sendSupportMessage

src/components/coach/
├── NewsBellButton.tsx       # Client — botón campana + badge
├── NewsFeedSheet.tsx        # Client — bottom sheet mobile
├── NewsFeedPopover.tsx      # Client — popover desktop
└── NewsFeedProvider.tsx     # Context — unreadCount + markAllAsRead

src/app/admin/(panel)/novedades/
├── page.tsx
├── _data/
│   └── novedades.queries.ts
├── _actions/
│   └── novedades-actions.ts
└── _components/
    ├── NewsAdminList.tsx    # Tabla/cards con status + pin
    ├── NewsCreateSheet.tsx  # Sheet para crear/editar
    └── NewsTypeBadge.tsx    # Badge de tipo (Feature/Mejora/Fix/Anuncio)
```

### 3.3 Modificaciones a archivos existentes

| Archivo | Cambio |
|---------|--------|
| `src/components/coach/CoachSidebar.tsx` | Agregar `Soporte` a `navItems`. Agregar `<NewsBellButton />` en mobile top header (entre brand y ThemeToggle) y en desktop sidebar footer (sobre ThemeToggle). |
| `src/lib/email/send-email.ts` | Extender `SendEmailInput` con `replyTo?: string` y pasarlo al body del fetch a Resend. |
| `src/app/admin/(panel)/AdminSidebar.tsx` | Agregar `{ href: '/admin/novedades', label: 'Novedades', icon: Newspaper }` a `NAV_PLATAFORMA` y `NAV_MOBILE`. |

### 3.4 Estado cliente

- `NewsFeedProvider` (React Context) en `src/app/coach/layout.tsx`. Inicializado vía prop desde RSC layout (`initialUnreadCount`).
- Expone: `unreadCount`, `markAllAsRead()`.
- `useOptimistic` para ocultar badge instantáneamente al abrir feed.
- `refreshCount()` al hacer focus de página (`visibilitychange`) para detectar novedades publicadas mientras tenía la app abierta.

### 3.5 Mobile-specific

- `h-dvh`, `safe-area-inset`, `overflow-x: clip`.
- Bottom sheet para novedades en mobile: usar `Sheet` de shadcn/ui con `side="bottom"`.
- Soporte: textarea con `rows={5}` y padding-bottom que respete safe area.

### 3.6 CEO Editor

- **Título:** input text.
- **Tipo:** select (Feature / Mejora / Fix / Anuncio).
- **Contenido:** `textarea` simple. Saltos de línea se respetan con `white-space: pre-line`. Sin Markdown parser en MVP.
- **Imagen:** upload a bucket `news` en Supabase Storage. Preview de URL.
- **CTA opcional:** `cta_url` (text, ej: `/coach/clients`) + `cta_label` (text, ej: "Probar ahora"). Si existen, se renderizan como botón/link en la tarjeta de novedad.
- **Pin:** checkbox `is_pinned`. Las pinned se muestran primero y con fondo distinto.
- **Estado:** `draft` → `published`. Botón "Publicar ahora" setea `published_at = now()`.
- **Tabla admin:** columnas = Título, Tipo, Estado, Pin, Fecha publicación, Acciones.

---

## 4. Backend Development

### 4.1 Esquema de datos (Supabase)

#### Tabla: `news_items`
```sql
create table news_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('feature', 'improvement', 'fix', 'announcement')),
  content text not null,
  image_url text,
  cta_url text,
  cta_label text,
  is_pinned boolean default false,
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices
create index idx_news_items_status_published on news_items(status, published_at desc);
create index idx_news_items_pinned on news_items(is_pinned) where is_pinned = true;

-- RLS (lectura coach)
alter table news_items enable row level security;

create policy "news_items_select_published"
  on news_items for select
  using (status = 'published' and published_at <= now());
```
**Nota:** Las operaciones admin usan `service role` vía `assertAdmin()`. No se necesita RLS de escritura.

#### Tabla: `news_reads`
```sql
create table news_reads (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id) on delete cascade not null,
  news_item_id uuid references news_items(id) on delete cascade not null,
  read_at timestamptz default now(),
  unique(coach_id, news_item_id)
);

create index idx_news_reads_coach on news_reads(coach_id);
create index idx_news_reads_news on news_reads(news_item_id);

alter table news_reads enable row level security;

create policy "news_reads_own"
  on news_reads for all
  using (coach_id in (
    select id from coaches where user_id = auth.uid()
  ));
```

### 4.2 Server Actions

```ts
// src/app/admin/(panel)/novedades/_actions/novedades-actions.ts
// Todas usan assertAdmin() + logAdminAction()

async function createNewsItem(formData: FormData): Promise<{id: string}>
async function updateNewsItem(id: string, formData: FormData): Promise<void>
async function deleteNewsItem(id: string): Promise<void>
async function publishNewsItem(id: string): Promise<void>
async function togglePinNewsItem(id: string, isPinned: boolean): Promise<void>

// src/app/coach/support/actions.ts
async function sendSupportMessage(prevState: any, formData: FormData): Promise<{success: boolean; error?: string}>
// 1. Validar Zod
// 2. Obtener coach_email, coach_name desde coaches table
// 3. Si hay adjunto: subir a bucket 'support-attachments' vía supabase storage
// 4. Construir email con metadata: URL del coach (de formData), userAgent, timestamp
// 5. Llamar sendEmail({ to: 'contacto@eva-app.cl', replyTo: coachEmail, subject, html, text })
//    NOTA: sendEmail debe soportar replyTo (modificar send-email.ts)
// 6. NO guardar en DB (MVP sin historial)

// src/components/coach/actions.ts
async function markAllNewsAsRead(): Promise<void>
// 1. Obtener coach_id desde session
// 2. Insertar en news_reads todos los published no leídos:
//    INSERT INTO news_reads (coach_id, news_item_id)
//    SELECT :coach_id, ni.id FROM news_items ni
//    WHERE ni.status = 'published' AND ni.published_at <= now()
//      AND NOT EXISTS (SELECT 1 FROM news_reads nr WHERE nr.news_item_id = ni.id AND nr.coach_id = :coach_id)
//    ON CONFLICT DO NOTHING;
// 3. RevalidatePath('/coach/dashboard')
```

### 4.3 Query de unread count (optimizada)

```sql
select count(*)
from news_items ni
where ni.status = 'published'
  and ni.published_at <= now()
  and not exists (
    select 1 from news_reads nr
    where nr.news_item_id = ni.id
      and nr.coach_id = :coach_id
  );
```
- `NOT EXISTS` es más eficiente que `NOT IN` con NULLs.
- Usar `React.cache` en RSC para deduplicar por request.
- Llamar desde layout coach y pasar como prop inicial al provider.

### 4.4 Envío de emails (patrón existente, con mejora)

**Servicio actual:** `src/lib/email/send-email.ts` usa `fetch` directo a Resend API.

**Cambio requerido en `send-email.ts`:**
```ts
type SendEmailInput = {
  to: string
  subject: string
  html: string
  replyTo?: string        // ← NUEVO
  text?: string           // ← NUEVO (fallback anti-spam)
}

// En el body del fetch:
body: JSON.stringify({
  from,
  to: [input.to],
  subject: input.subject,
  html: input.html,
  reply_to: input.replyTo,    // ← Resend API usa snake_case
  text: input.text,
})
```

**Template de soporte:** Crear `src/lib/email/support-templates.ts`:
```ts
export function buildSupportEmail(ctx: {
  coachName: string;
  coachEmail: string;
  gymName?: string;
  type: 'help' | 'bug' | 'idea';
  priority?: string;
  subject: string;
  description: string;
  attachmentUrl?: string;
  metadata: { url: string; userAgent: string; timestamp: string; coachId: string };
}) {
  return {
    subject: `[EVA Soporte] [${ctx.type.toUpperCase()}] ${ctx.subject} — ${ctx.coachName}`,
    html: `...tabla con metadata + descripción...`,
    text: `...versión plain text...`,
  };
}
```

**Variables de entorno a asegurar:**
```env
RESEND_API_KEY=re_xxxx
EMAIL_FROM=noreply@eva-app.cl
SUPPORT_EMAIL_TO=contacto@eva-app.cl
```

---

## 5. DevOps / Infraestructura

### 5.1 Storage buckets
- **`news`**: Imágenes de novedades. Public read. Upload solo admin.
- **`support-attachments`**: Adjuntos de soporte. Private. Coach sube y lee sus propios; admin lee todos.

### 5.2 Rate limiting
- **Soporte:** 5 mensajes / hora / coach. Verificar `src/lib/rate-limit.ts` para reutilizar la abstracción existente (patrón similar a `rateLimitAuth`).
- **Admin:** Ya existe `rateLimitAdmin` en middleware para POSTs `/admin/*`.

### 5.3 Migración SQL
- Archivo: `supabase/migrations/20260502_support_news.sql`
- Contenido: `news_items`, `news_reads`, índices, triggers `updated_at` (ver si existe extensión `moddatetime` o similar en proyecto).

### 5.4 Monitoreo
- Loguear errores de `sendEmail` en consola.
- Alerta manual si llegan > 20 tickets en 24h (posible incidente general).

---

## 6. QA Engineering — Criterios de Aceptación

### 6.1 Soporte
- [ ] Coach puede enviar ticket con asunto, descripción y tipo.
- [ ] Bug report muestra selector de prioridad (Baja/Media/Alta).
- [ ] Email llega a `contacto@eva-app.cl` con formato correcto en < 30s.
- [ ] Reply-To del email es el email del coach.
- [ ] Email incluye metadata: URL del coach, user agent, timestamp, coach ID.
- [ ] Adjunto opcional (PNG/JPG/PDF, max 2MB) sube a Storage y aparece link en email.
- [ ] Muestra error claro si falla envío.
- [ ] Rate limit: 6to intento en 1h muestra "Has enviado muchos mensajes. Intenta más tarde."
- [ ] Mobile: teclado no tapa botón enviar. CTA accesible con `pb-safe`.
- [ ] Al enviar, formulario se limpia y aparece toast success.

### 6.2 Novedades (Coach)
- [ ] Admin publica novedad; coach la ve en feed inmediatamente.
- [ ] Badge "NEW" aparece en campana del top header (mobile) / sidebar (desktop).
- [ ] Badge muestra count exacto (hasta 9, luego "9+").
- [ ] Al abrir feed, badge desaparece (optimistic) y vuelve a 0.
- [ ] Recargar página: badge sigue en 0.
- [ ] Novedades se ordenan: pinned primero, luego `published_at` descendente.
- [ ] Novedades archivadas/draft no aparecen en feed coach.
- [ ] Mobile: bottom sheet se cierra con swipe/tap backdrop. Drag handle visible.
- [ ] Desktop: popover desde campana. ESC cierra.
- [ ] Imagen de novedad se renderiza con `<Image>` de Next.js.
- [ ] CTA opcional se renderiza como botón/link funcional.
- [ ] Fecha relativa correcta ("Hoy", "Ayer", "Hace X días").

### 6.3 Novedades (CEO Panel)
- [ ] Admin puede crear novedad en draft.
- [ ] Admin puede publicar novedad; fecha se setea automáticamente.
- [ ] Admin puede editar novedad publicada.
- [ ] Admin puede pin/unpin novedad.
- [ ] Admin puede archivar/eliminar novedad.
- [ ] Lista muestra estado, tipo, pin, fecha. Filtros por estado y tipo.
- [ ] Acceso protegido por admin gate.
- [ ] Acciones logueadas en `admin_audit_logs`.

### 6.4 Seguridad
- [ ] RLS impide lectura/escritura directa de `news_items` por coaches.
- [ ] RLS en `news_reads` impide cross-coach reads.
- [ ] Solo admin accede a CRUD de novedades.
- [ ] Adjuntos de soporte solo accesibles por dueño y admin.

---

## 7. Data Science / Analytics

### 7.1 Eventos a trackear

| Evento | Props | Objetivo |
|--------|-------|----------|
| `support_ticket_sent` | `type`, `has_attachment`, `priority` | Volumen y tipo de solicitudes |
| `news_feed_opened` | `unread_count_before` | Engagement comunicaciones |
| `news_item_cta_clicked` | `news_id`, `type`, `cta_url` | Drive adoption de nuevas features |
| `news_badge_seen` | `count` | Impresiones del badge |

### 7.2 Métricas dashboard CEO
- Tickets por tipo y semana.
- Top 3 categorías de bugs.
- Tasa de apertura = `unique_coaches_opened / total_active_coaches`.
- Tasa de click en CTA = `cta_clicks / impressions`.
- Tiempo medio entre publicación y primera apertura.
- Comparación: ¿Features o Fixes generan más aperturas?

### 7.3 Decisiones data-driven futuras
- Si `idea` = 60% de tickets → implementar votación pública de features (tabla `feature_votes`).
- Si apertura < 40% → evaluar notificación push o email digest semanal.
- Si CTA click < 10% → los links no son claros; probar botones más prominentes.

---

## 8. Product Marketing Manager (PMM)

### 8.1 Comunicación del lanzamiento
- **Pre-lanzamiento:** Email a coaches: "Pronto: Centro de Ayuda y Novedades integrados".
- **Lanzamiento:** Primera novedad automática: "Bienvenido a Novedades" con Loom de 60s explicando el feed + CTA a `/coach/support`.
- **Post-lanzamiento:** Cada nueva feature debe lanzarse con novedad el mismo día del deploy. No acumular.

### 8.2 Naming
- Botón: "Novedades".
- Soporte: "Centro de Ayuda". Sub-CTAs: "Necesito ayuda", "Reportar un problema", "Sugerir mejora".

### 8.3 Changelog público (futuro)
- My PT Hub tiene `/all-updates` pública. EVA podría exponer `/changelog` desde `news_items` para SEO y transparencia de producto. Scope post-MVP.

---

## 9. Customer Success Manager

### 9.1 Flujo de respuesta a tickets
1. Email llega a `contacto@eva-app.cl` con metadata completa.
2. CEO/CS responde directo al coach vía Reply-To.
3. Conversación continúa por email. Sin historial en app en MVP.

### 9.2 Escalamiento
- **Bug crítico** (coach bloqueado) → SLA 4h → llamada directa.
- **Idea** → taggear y revisar en planning quincenal.
- **Ayuda** → linkear a futura base de conocimiento.

### 9.3 Onboarding
- Paso final del onboarding coach: "Si tienes dudas, usa Centro de Ayuda. Si lanzamos algo nuevo, te avisamos en Novedades."

---

## 10. Legal / Cumplimiento

### 10.1 Privacidad
- Adjuntos pueden contener datos personales de alumnos.
- **Disclaimer:** "No adjuntes información sensible de terceros sin su consentimiento."
- Bucket `support-attachments`: RLS estricto. Retención 12 meses.

### 10.2 Propiedad intelectual
- Línea debajo del botón: "Al enviar, aceptas nuestras condiciones de uso."

### 10.3 Email transaccional
- Footer: "Este mensaje fue enviado desde EVA Fitness Platform."
- `Reply-To` siempre = email del coach.

---

## 11. Roadmap de Implementación

### Semana 1 — Soporte Coach
- [x] Modificar `src/lib/email/send-email.ts` para soportar `replyTo`.
- [x] Crear `src/lib/email/support-templates.ts`.
- [x] Crear bucket `support-attachments` + policies.
- [x] Implementar server action `sendSupportMessage`.
- [x] UI `/coach/support/page.tsx` + `SupportForm.tsx`.
- [x] Agregar `Soporte` a `CoachSidebar.tsx` navItems.
- [x] Rate limiting: 5/h por coach.
- [x] QA manual (automated: build + typecheck + lint + 111 Vitest + 4 Playwright E2E).

### Semana 2 — Novedades Backend + UI Coach
- [x] Migración SQL: `news_items`, `news_reads`.
- [x] Modificar `send-email.ts` si se detecta necesidad de text fallback.
- [x] Server actions: `markAllNewsAsRead`, unread count query.
- [x] Bucket `news` en Storage.
- [x] `NewsBellButton` en mobile top header + desktop sidebar footer.
- [x] `NewsFeedSheet` (mobile) + `NewsFeedPopover` (desktop).
- [x] `NewsFeedProvider` con `useOptimistic`.
- [x] QA flujo coach (automated + manual smoke).

### Semana 3 — Panel CEO Novedades
- [x] Rutas `/admin/novedades/*` siguiendo patrón coaches/clientes.
- [x] `_data/novedades.queries.ts`, `_actions/novedades-actions.ts`.
- [x] UI: lista, filtros, `NewsCreateSheet` con editor simple + pin + CTA.
- [x] Agregar "Novedades" a `AdminSidebar.tsx`.
- [x] Audit logging.
- [x] QA panel admin (automated + manual smoke).

### Semana 4 — Polish + E2E
- [x] Playwright E2E: smoke tests de rutas nuevas.
- [x] Build + typecheck + lint + Vitest: 111 tests pasaron, 0 errores.
- [x] Actualizar `PLAN-SOPORTE-NOVEDADES.md` con progreso.

---

## 12. Decisiones concretas tomadas

| Pregunta | Decisión |
|----------|----------|
| ¿Panel CEO existe? | Sí. Se integra `/admin/novedades` ahí. Patrón `_data`, `_actions`, `_components`. |
| ¿Servicio de email? | **Resend** activo. Modificar `send-email.ts` para agregar `replyTo`. Template nuevo. |
| ¿Novedades para quién? | Solo coaches. |
| ¿Formato contenido? | Texto plano + saltos de línea. Sin Markdown. |
| ¿Historial de tickets? | **No.** Solo email transaccional. Reply-To = email coach. |
| ¿Posición badge? | Mobile top header (z-[55]). Desktop sidebar footer. Nunca en bottom bar. |
| ¿Screenshots en soporte? | **Sí.** Adjunto opcional, máximo 2MB. Incluir URL actual en metadata. |

---

## 13. Archivos clave existentes a revisar/modificar

| Archivo | Acción |
|---------|--------|
| `src/components/coach/CoachSidebar.tsx` | Agregar `Soporte` navItem + `NewsBellButton` en header/footer |
| `src/app/admin/(panel)/AdminSidebar.tsx` | Agregar link "Novedades" |
| `src/lib/email/send-email.ts` | Agregar `replyTo` y `text` opcional al payload Resend |
| `src/lib/email/transactional-templates.ts` | Referencia de patrón |
| `src/lib/admin/admin-action-wrapper.ts` | Reutilizar `assertAdmin()` + `logAdminAction()` |
| `src/middleware.ts` | Verificar `/admin/novedades` pasa gate admin |
| `src/lib/rate-limit.ts` | Reutilizar para rate limit de soporte |
| `.env.example` | Documentar `SUPPORT_EMAIL_TO` |
| `supabase/migrations/` | Agregar `20260502_support_news.sql` |

---

## 14. Ideas futuras (post-MVP)

1. **Votación de features:** Tabla `feature_requests` + `feature_votes`. Coaches votan ideas de otros. Priorización democrática.
2. **Notificaciones push:** Cuando se publica novedad, enviar push a coaches activos via web push (ya tienen service worker PWA).
3. **Changelog público:** Página `/changelog` alimentada por `news_items` para marketing SEO.
4. **Auto-respuesta inteligente:** Si el ticket es "¿Cómo asigno un programa?", responder automáticamente con link al tutorial.
5. **Shake to report:** En mobile, agitar el teléfono abre el formulario de soporte con screenshot automático.
6. **Segmentación de novedades:** Mostrar novedades de "Nutrición" solo a coaches que usan ese módulo. Requiere tracking de uso por módulo.
7. **Digest semanal:** Email resumen de novedades no leídas para coaches que no abren la app frecuentemente.

---

*Fin del documento.*
