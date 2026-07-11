# Spec §6 Coach presence + §1 Anuncios de la org — key `coach-org-banners`

Fuente de verdad web:
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/coach/CoachPresenceCard.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/OrgAnnouncementBanner.tsx` (NO en `_components/coach/`; el path del brief estaba mal)

Contraparte RN:
- `apps/mobile/components/alumno/home/CoachPresenceCard.tsx`
- `apps/mobile/components/alumno/home/OrgAnnouncementBanner.tsx`

Datos web:
- `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts` (`getClientProfile` L23, `OrgAnnouncement` type L468-474, `getActiveOrgAnnouncements` L476-491)
- Cableado en `apps/web/.../dashboard/page.tsx` (import CoachPresenceCard L12, imports queries L23, import Banner L24, fetch announcements L58, render Banner L77, render CoachPresenceCard L106-110)

Datos RN:
- `apps/mobile/lib/org-announcements.ts` (type + `getActiveOrgAnnouncements` L13-27)
- `apps/mobile/app/alumno/(tabs)/home.tsx` (query coaches L103-107, announcements L110, render Banner L304, render CoachPresenceCard L329)

---

## A. §1 OrgAnnouncementBanner

### A.1 Layout y jerarquia (web)
- Componente cliente/servidor puro sin estado. Early return `if (announcements.length === 0) return null` (banner web L8).
- Contenedor externo: `<div className="flex flex-col gap-2 px-4 pt-2">` (banner web L11) — columna, gap 8px, padding horizontal 16px, padding-top 8px.
- Un `<div>` por anuncio, `key={a.id}` (banner web L13-14).
- Card de anuncio: `rounded-card border ... px-4 py-3` (banner web L15) → radio 20px (`--radius-card:20px`, globals.css L130), padding H 16px / V 12px.
- Dentro: dos `<p>` apilados — titulo (L17) y cuerpo (L18).

### A.2 Tokens, clases, color claro/oscuro (web)
- Borde: `border-[color-mix(in_srgb,var(--info-500)_30%,transparent)]` (banner web L15). `--info-500:#2680FF` (globals.css L387) = rgb(38,128,255) → efectivo `rgba(38,128,255,0.30)`. En dark `--info-500` no se redefine ⇒ mismo borde.
- Fondo: `bg-[var(--info-100)]` (banner web L15). Light `--info-100:#E8F1FF` (globals.css L388); dark `--info-100:rgba(38,128,255,0.18)` (globals.css L615).
- Texto titulo y cuerpo: `text-[var(--info-600)]` (banner web L17, L18). Light `--info-600:#1462DC` (globals.css L386); dark `--info-600:#7FB0FF` (globals.css L627).
- **info-* es rampa DS FIJA (nunca white-label).** El comentario del RN (banner RN L6) lo confirma.

### A.3 Tipografia (web)
- Titulo: `text-sm font-bold` (banner web L17) = 14px, weight 700.
- Cuerpo: `mt-0.5 text-sm` (banner web L18) = margin-top 2px, 14px, weight normal.

### A.4 Interactividad / estados
- **Cero elementos interactivos**: no hay handlers, links, toasts. Es informativo puro.
- Estado vacio: no renderiza nada (L8).
- Carga: el fetch ocurre en `page.tsx` (server, L58); el banner solo recibe el array ya resuelto. No hay skeleton propio.
- Error: `getActiveOrgAnnouncements` desestructura `{ data }` sin manejar `error` (queries web L479); si falla devuelve `data ?? []` = `[]` (L490) ⇒ banner no renderiza. Fail-invisible.

### A.5 Queries / datos (web — `getActiveOrgAnnouncements`, queries L476-491)
- Envuelto en `cache(...)` (L476). Tabla `org_announcements` (L480).
- `.select('id, title, body, active_until, created_at, audience')` (L481).
- Filtros: `.eq('org_id', orgId)` (L482), `.eq('is_active', true)` (L483), `.in('audience', ['all','clients'])` (L484).
- Vigencia: `.or('active_until.is.null,active_until.gt.'+now)` (L485) — sin fecha fin O aun no vence.
- Publicacion: `.or('published_at.is.null,published_at.lte.'+now)` (L487) — legacy sin published_at O ya publicado.
- Orden: `.order('created_at',{ascending:false})` (L488). Limite `.limit(5)` (L489).
- `now = new Date().toISOString()` (L478).
- Solo se llama si `client.org_id` truthy (page.tsx L58); si no → `[]`.
- Type `OrgAnnouncement`: `{ id, title, body, active_until:string|null, created_at:string }` (queries L468-474). Nota: `audience` se selecciona pero NO esta en el type expuesto.

### A.6 Animaciones / accesibilidad (web)
- Web: sin animacion de entrada (componentes servidor). Sin roles ARIA explicitos; `<p>` semanticos.

---

## B. §6 CoachPresenceCard

### B.1 Proposito documentado (web L5-16)
Tarjeta **INFORMATIVA que NO navega**. El JSDoc explica que antes linkeaba al check-in con icono de mensaje (afordancia enganosa de "chat") y se degrado: sin canal de contacto real (no hay telefono/WhatsApp en `coaches`) muestra la nota sin prometer mensajeria (L8-11).

### B.2 Layout y jerarquia (web)
- `async` component; recibe props `{ userId, brandName?, note? }` (L17-25).
- `<Card padding="md" className="flex-row items-center gap-3">` (L33) → padding 16px (cardPadding.md `p-4`, card.tsx L31), fila, items centrados, gap 12px, radio 20px (`rounded-card`, card.tsx L54), fondo `bg-surface-card`, borde `--border-subtle`, `shadow-sm` (variant default, card.tsx L15-16).
- `<Avatar name={displayName} size="md" ring="ember" />` (L34).
- Columna de texto `<div className="min-w-0 flex-1">` (L35).
  - Fila superior `<div className="flex items-center gap-1.5">` (L36): nombre + badge.
  - Nombre `<span className="min-w-0 truncate text-[13.5px] font-extrabold text-strong">` (L37).
  - Badge `<span className="shrink-0 whitespace-nowrap rounded-pill bg-ember-100 px-1.5 py-px text-[10px] font-bold text-ember-700">Tu coach</span>` (L38-40).
  - Nota `<p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">` (L42).

### B.3 Tokens / color claro-oscuro (web)
- Avatar `ring="ember"` — halo ember alrededor.
- Badge fondo `bg-ember-100`: light `--ember-100:#FFEDE6` (globals.css L363); dark `rgba(255,106,61,0.20)` (globals.css L617).
- Badge texto `text-ember-700`: light `--ember-700:#C23E14` (globals.css L357); dark `#FFB79E` (globals.css L631).
- Badge forma `rounded-pill`, `px-1.5 py-px` (H 6px, V 1px).
- Nombre `text-strong`; nota `text-muted` (ambos flipean via `.dark` en globals.css).

### B.4 Tipografia (web)
- Nombre: `text-[13.5px] font-extrabold` (L37, weight 800), `truncate` (una linea con elipsis).
- Badge: `text-[10px] font-bold` (L38).
- Nota: `text-xs leading-snug` (L42) = 12px, line-height snug, `line-clamp-2` (max 2 lineas con elipsis), `mt-0.5` (2px).

### B.5 Datos / fallbacks (web L26-30)
- `const { client } = await getClientProfile(userId)` (L26) — `cache`d, queries L23.
- `coachRow = client?.coaches`; `coachBrand = Array.isArray(coachRow) ? coachRow[0] : coachRow` (L27-28) — normaliza la fila anidada.
- `CoachBrand` = Pick de `coaches` con `brand_name, primary_color, logo_url, welcome_message, welcome_modal_*` (queries L12).
- **Cadena de fallback nombre (L29):** `brandName (prop) || coachBrand?.brand_name || 'Tu coach'`.
- **Cadena de fallback nota (L30):** `note (prop) || coachBrand?.welcome_message || 'Estoy atento a tu progreso. ¡Seguimos!'`.
- Copy verbatim: badge `Tu coach`, nota fija `Estoy atento a tu progreso. ¡Seguimos!`.

### B.6 Wiring en page.tsx
- `greetingBrandName = isTeamContext ? headerTeamBrandName : coachBranding?.brand_name` (page.tsx L70).
- `greetingWelcomeMessage = isTeamContext ? null : coachBranding?.welcome_message` (page.tsx L71). En contexto team se suprime la nota personal del coach.
- Render dentro de `<Suspense fallback={null}>` (page.tsx L105) con `brandName={greetingBrandName} note={greetingWelcomeMessage}` (L108-109). **Siempre se renderiza** (no hay gate por presencia de coach; la 3ra capa de fallback garantiza 'Tu coach').

### B.7 Interactividad / estados / accesibilidad
- **Cero interactividad**: sin onClick, sin link, sin toast (por diseno, ver B.1).
- Carga: `Suspense fallback={null}` (page.tsx L105).
- Vacio: nunca vacio — siempre hay `displayName` y `noteText` por los fallbacks.
- Sin roles ARIA; `span`/`p` semanticos; truncado por CSS.

### B.8 Animaciones (web)
- Sin animacion de entrada.

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)
- **CoachPresenceCard** (L10631-10636): webPath `.../dashboard/_components/coach/CoachPresenceCard.tsx`, mobilePath `apps/mobile/components/alumno/home/CoachPresenceCard.tsx`, `usedIn:"alumno"`, `priority:"baja"`, reason "Card de presencia del coach en dashboard alumno. Mobile mismo nombre."
- **OrgAnnouncementBanner** (L10663-10668): webPath `.../dashboard/_components/OrgAnnouncementBanner.tsx` (confirma que NO esta en `coach/`), mobilePath `apps/mobile/components/alumno/home/OrgAnnouncementBanner.tsx`, `usedIn:"alumno"`, `priority:"baja"`, reason "Web OrgAnnouncementBanner.tsx:7. Mobile mismo nombre."
- **Sin P0 QA asignado** a esta unidad (prioridad baja en ambos).

---

## Estado RN actual (divergencias observadas)

### OrgAnnouncementBanner RN (`components/alumno/home/OrgAnnouncementBanner.tsx`)
- **Colores fieles pero como hex crudo, no tokens** (RN L7-10): objeto `INFO` con `light/dark` hardcodeado (`#E8F1FF`, `rgba(38,128,255,0.30)`, `#1462DC` / dark `rgba(38,128,255,0.18)`, `#7FB0FF`). Valores == globals.css web (A.2). Los tokens `info-100/info-600` SI existen en mobile/global.css (L80-82, L174-186) y el Badge DS los consume como clases — divergencia con la regla "cero valores crudos"; el comentario RN L6 lo justifica como rampa fija. Evaluar migrar a `className` info-*.
- **Tipografia levemente menor**: titulo `text-[13.5px]` (RN L32) vs web `text-sm`=14px (banner web L17); cuerpo `text-[13px]` lineHeight 18 (RN L33, L43) vs web `text-sm`=14px (banner web L18). Web body no fija line-height explicito.
- **Padding/gap/ radio == web**: card `paddingHorizontal:16, paddingVertical:12, borderRadius:20, borderWidth:1` (RN L42), stack `gap:8` (RN L41). Coincide con `px-4 py-3 rounded-card` + `gap-2` (banner web L11,L15).
- **Falta `px-4 pt-2` externo del web** (banner web L11): el RN monta el stack sin padding horizontal propio (lo aporta `styles.content` de home.tsx). Adaptacion valida si el resultado visual coincide.
- **Animacion agregada (idiomatica RN)**: `MotiView` fade+translateY 10→0, 380ms (RN L23-28). Web no anima. Paridad valida (regla 10).
- Early return `announcements.length===0 → null` == web (RN L19, banner web L8).
- Usa `resolvedScheme` de `ThemeContext` para elegir rampa (RN L18, L20) — correcto para dark/light.
- Type RN `OrgAnnouncement` incluye `active_until, created_at` extra (RN lib L4-10) igual que web; su query mobile (org-announcements.ts L13-27) replica filtros web 1:1 (select con `audience`, eq org/is_active, in audience all/clients, doble `.or` vigencia+publicacion, order created_at desc, limit 5).

### CoachPresenceCard RN (`components/alumno/home/CoachPresenceCard.tsx`)
- **No hace fetch propio**: recibe `{ brandName, note }` (RN L13) desde el agregador de home.tsx (query coaches L103-107). Web hace `getClientProfile` interno para la 2da capa de fallback (web L26-30). Adaptacion valida: la marca ya viene de la query coaches upstream, cubriendo `coachBrand?.brand_name`. **Falta la 2da capa explicita** — solo `brandName || 'Tu coach'` (RN L14) y `note || 'Estoy atento...'` (RN L15) vs web triple/doble fallback (web L29-30). Aceptable porque home ya resolvio brand_name/welcome_message.
- **Gate de visibilidad divergente**: RN solo renderiza la card `if data?.coachName` (home.tsx L329). Web la renderiza SIEMPRE (page.tsx L105-110), degradando a 'Tu coach'. Divergencia funcional: en RN, alumno sin coachName no ve la tarjeta; en web si (con fallback). Anclado por el brief como comportamiento RN intencional — DOCUMENTAR, no promete regresion pero difiere del web.
- **Copy verbatim correcto**: badge `Tu coach` (RN L25), nota fija `Estoy atento a tu progreso. ¡Seguimos!` (RN L15) == web (L39, L30).
- **Estructura y tokens fieles**: `Card padding="md" flexDirection row gap:12` (RN L18) == web `padding="md" flex-row items-center gap-3` (web L33). `Avatar size="md" ring="ember"` (RN L19) == web (L34). Nombre `fontSize:13.5 FONT.uiExtra text-strong numberOfLines={1}` (RN L22-24) == web `text-[13.5px] font-extrabold text-strong truncate` (web L37). Nota `fontSize:12 lineHeight:16 marginTop:2 numberOfLines={2} text-muted` (RN L27-29) == web `text-xs leading-snug mt-0.5 line-clamp-2 text-muted` (web L42).
- **Badge via primitivo DS**: `<Badge tone="ember" variant="soft" size="sm">Tu coach</Badge>` (RN L25). Badge.tsx sm: height 20, paddingHorizontal 8, fontSize TYPE_SCALE['3xs'] (Badge.tsx L67), softBg `bg-ember-100 dark:bg-ember-100/20`, fg `text-ember-700` (Badge.tsx L58). Web badge es `span` inline `px-1.5 py-px text-[10px]` (web L38): el RN Badge tiene altura fija 20 y pad-H 8 (vs web 6px) — leve divergencia de forma/padding del pill, misma paleta ember. Verificar fontSize 3xs == 10px.
- **Animacion agregada (idiomatica)**: `MotiView` fade+translateY 12→0, 360ms delay 60 (RN L17). Web sin animacion. Paridad valida (regla 10).

---

## Cambios sugeridos (dentro de la unidad, sin tocar shell/primitivos)
1. OrgAnnouncementBanner RN: evaluar reemplazar el objeto `INFO` hardcodeado por clases token `bg-info-100 border-info-500/30 text-info-600` (tokens ya existen en mobile/global.css L80-82,174-186) para cumplir regla 3. Si se hace, respetar borde 30% (color-mix web). NO tocar global.css.
2. OrgAnnouncementBanner RN: subir tipografia a 14px (titulo y cuerpo) para 1:1 con web `text-sm` — hoy 13.5/13.
3. CoachPresenceCard RN: (opcional) igualar padding del badge a la forma web (px 6, sin altura fija) si se busca pixel-parity — pero es primitivo DS Badge compartido → NO tocar Badge.tsx; solo documentar.

## cambiosShell (archivos de otras unidades — NO tocados aqui)
- Ninguno requerido. `home.tsx` (query coaches L103-107, gate CoachPresenceCard L329, wiring Banner L304) es del shell/otra unidad: el gate `data?.coachName` para CoachPresenceCard difiere del web (que siempre renderiza). Si se decide igualar a web, el cambio es en `home.tsx:329` (quitar el gate y pasar fallback) — REPORTAR al dueno del shell, no editar aqui.
