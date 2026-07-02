# 2. Brand Studio del equipo (marca del pool)

Editor white-label a nivel **tenant del equipo**. Lo edita solo el owner o un co-gestor (`can_manage`) del pool. A diferencia de "Mi Marca" del coach standalone, la marca que se guarda aquí vive en la tabla `teams` y la usan **todos los alumnos del pool** (la ven en `/t/[team_slug]/*` y los coaches la ven en el shell en contexto team). El componente cliente es `apps/web/src/app/coach/team/_components/TeamBrandStudio.tsx`; la acción servidor es `updateTeamBrandAction` en `apps/web/src/app/coach/team/_actions/team.actions.ts`.

---

## 2.1 De dónde sale el dato y cómo se monta el editor

El RSC `apps/web/src/app/coach/team/page.tsx` arma el `brand` con las columnas crudas de `teams` y se lo pasa al componente como prop `TeamBrandValues` (líneas 151-168):

- `name`, `primary_color`, `logo_url`, `logo_url_dark`, `accent_light`, `accent_dark`, `neutral_tint`, `splash_bg_color`, `loader_text`, `loader_text_color`, `loader_icon_mode`, `use_custom_loader`.
- `canEdit={team.isManager}` — **el gate de edición es `isManager`** (owner o co-gestor). Si es `false`, todos los inputs van `disabled` y la barra de Publicar nunca aparece (`canEdit && dirty`).

El componente mantiene **dos estados**: `draft` (lo que el gestor está tocando) y `saved` (lo último publicado). Ambos arrancan de `toDraft(brand)`, que normaliza nulos a string vacío y aplica defaults (`primary_color ?? '#10B981'`, `loader_icon_mode || 'logo'`). Los nulos de `accent_*`, `splash_bg_color`, `loader_text`, `loader_text_color` se vuelven `''` para los inputs controlados.

`dirty` se computa por `JSON.stringify(draft) !== JSON.stringify(saved)` **o** `logoFilePicked` (un logo elegido no se refleja en el draft de texto, por eso se rastrea aparte con su propio booleano).

---

## 2.2 Campos de marca como DATOS

### Identidad

- **Nombre del equipo** (`name`): input controlado, `minLength=2`, `maxLength=80`. Es el único campo que también afecta el header de la vista previa (`draft.name || 'Tu equipo'`).
- **Logo modo claro** (`logo`) y **Logo modo oscuro** (`logo_dark`): cada `LogoDrop` es un `<input type="file" accept="image/jpeg,image/png">` oculto disparado por botón. Al elegir archivo se crea un `URL.createObjectURL(f)` para preview local (`logoPreview` / `logoDarkPreview`) y se marca `logoFilePicked=true`. El `name` del input (`logo` / `logo_dark`) es lo que el form manda como multipart al action. Copy de ayuda: "PNG/JPEG · ideal 512×512 · ≤2 MB".

### Colores

- **Color principal** (`primary_color`): 8 presets curados (`PRESET_COLORS`: `#EC4899 #8B5CF6 #F59E0B #10B981 #0EA5E9 #EF4444 #14B8A6 #F97316`) + selector `<input type="color">` libre. Siempre tiene valor (no se puede limpiar a vacío desde la UI; el draft mantiene el hex).
- **Ajustes avanzados de color** (dentro de un `<details>` colapsable):
  - **Acento modo claro** (`accent_light`) y **Acento modo oscuro** (`accent_dark`): `ColorInput` con swatch `<input type="color">` + input hex de texto (`maxLength=7`, mono) + botón **"limpiar"** que setea `''`. Hint: "Vacío = usa el color principal".
  - **Fondo del splash** (`splash_bg_color`): mismo `ColorInput`, fallback al `primary`.
  - **Teñir grises con el color de marca** (`neutral_tint`): checkbox booleano.

### Pantalla de carga (loader del equipo)

- **Texto** (`loader_text`): `maxLength=24`, placeholder = `draft.name.toUpperCase().slice(0, 12)`.
- **Color del texto** (`loader_text_color`): `ColorInput`, fallback `#FFFFFF`.
- **Ícono** (`loader_icon_mode`): radiogroup de 4 opciones (`ICON_MODES`): `logo` / `text` / `eva` / `none` (labels "Logo / Texto / EVA / Nada").
- **Activar loader personalizado** (`use_custom_loader`): checkbox booleano. En la preview, el texto del splash solo se muestra si `use_custom_loader && (loader_text || loader_icon_mode === 'text')`.

---

## 2.3 Vista previa del teléfono del alumno + splash

Preview en vivo, derivado del `draft` (no llama al servidor). Toggle **claro/oscuro** (`previewMode`) con iconos Sun/Moon.

- `primary` = `draft.primary_color` si matchea `/^#[0-9a-fA-F]{6}$/`, si no `#10B981`.
- `accentForMode` = según el modo, el `accent_light`/`accent_dark` válido, si no el `primary`.
- `splash` = `splash_bg_color` válido, si no `primary`.
- `shownLogo` = en oscuro prefiere `logoDarkPreview ?? brand.logo_url_dark ?? logoPreview ?? brand.logo_url`; en claro `logoPreview ?? brand.logo_url`.
- Los neutrales de la preview (`previewBg`, `previewSurface`, `previewText`, `previewMuted`, `previewBorder`) son fijos por modo (no derivados del brand-kit; es un mock visual, no el render real).

El frame muestra: header con logo + nombre, una card "HOY" con barra de progreso teñida con el acento, botón "Empezar entrenamiento", card de nutrición con badge %, y tab bar. Debajo, el **splash preview** (fondo = `splash`, ícono según `loader_icon_mode`, texto opcional) y la URL `/t/{teamSlug}`.

---

## 2.4 Guardia de legibilidad AA (en vivo, cliente)

Se importa `isThemeReadable` de `@eva/brand-kit` (`packages/brand-kit/index.ts`). En cada cambio de `primary` / `accent_light` / `accent_dark` / `neutral_tint`, el componente recalcula `readable` vía `useMemo` (con try/catch que asume `true` si rompe).

`isThemeReadable` corre `contrastReport(resolveBrandTheme(...))`: deriva tema claro+oscuro completo (motor OKLCH/culori), `clampAccent` ajusta lightness hasta cumplir AA UI (3:1), `pickOnColor` elige texto legible, y chequea 6 pares de contraste por modo (texto sobre fondo/superficie 4.5:1, texto del acento, acento sobre fondo, + los pares de `accent2`).

UI: banner verde (`ShieldCheck`, "Legibilidad AA: los textos se leen bien...") si pasa; ámbar (`AlertTriangle`, "Contraste bajo... EVA lo ajustará automáticamente...") si no. **No bloquea publicar** — es advisory; el contraste real se garantiza en runtime por el motor que clampa.

---

## 2.5 Barra flotante de cambios sin publicar

Solo aparece si `canEdit && dirty`. Muestra "Cambios sin publicar" (pulso ámbar) y dos botones:

- **Descartar**: resetea `draft` a `saved`, limpia `logoPreview`/`logoDarkPreview`, `logoFilePicked=false` y hace `formRef.current?.reset()` (limpia los `<input type=file>`).
- **Publicar marca** (`type=submit`): dispara el form `action={submit}` con spinner mientras `pending`.

Feedback post-submit: banner de error (rojo) con `res.error`, o éxito (verde, `Check`) "Marca publicada. El equipo y los alumnos ya la ven."

### Cómo viaja el draft al servidor

Los campos de texto/color/booleanos van como `<input type="hidden">` **controlados** (líneas 268-277), uno por columna, con el valor del `draft` (booleanos como `'true'`/`'false'`). Los logos van por sus inputs `type=file` reales (`name="logo"` / `name="logo_dark"`). El form es `action={submit}` → `submit(fd)` llama `updateTeamBrandAction(teamId, fd)`. En éxito: `setSaved(draft)` + `setLogoFilePicked(false)`.

---

## 2.6 Guardado en backend — `updateTeamBrandAction` (lo importante)

### Autorización (gate de quién puede escribir)

1. `resolveTeamManagerContext(teamId)` (`apps/web/src/services/team/team.service.ts`):
   - `supabase.auth.getUser()` → sin user = "Sesión expirada".
   - Lee `teams` (id, name, slug, seat_limit, owner_coach_id, primary_color, logo_url) con `deleted_at IS NULL`.
   - `isOwner = owner_coach_id === user.id`. Sin `requireOwner`, exige `is_team_manager(p_team_id)` RPC `=== true` (owner **o** co-gestor). Para brand **no** se exige owner — basta manager.
   - Devuelve `{ supabase (user-scoped), admin (service-role), user, team, isOwner }`.
2. El write final a `teams` se hace con el **cliente user-scoped** (`supabase`), no service-role. El comentario es explícito: **"RLS (manager) es el techo real del write en teams"** (`team_teams_manager_update`). El service-role (`admin`) se usa **solo** para subir imágenes a Storage (que requiere bucket access), no para mutar columnas.

### Sanitización y validación servidor (re-valida todo, no confía en el cliente)

Construye un objeto `updates` campo a campo:

- **`name`**: `.trim()`; si no vacío, exige 2–80 chars, si no error "Nombre del equipo: 2 a 80 caracteres."
- **Colores** (`primary_color`, `accent_light`, `accent_dark`, `splash_bg_color`, `loader_text_color`): si `raw === null` se omite; `''` → `updates[field] = null` (limpiar, vuelve al default del sistema); si no, debe pasar `HEX_RE = /^#[0-9a-fA-F]{6}$/` o error "Color inválido en {field} (formato #RRGGBB)."
- **`loader_text`**: `.trim()`, `maxLength` 24 (error si excede). **Hardening anti stored-XSS**: rechaza cualquier `<` o `>` (`/[<>]/`) con "El texto del loader no puede contener < o >." El comentario lo justifica: este texto se inyecta en un `<style>` del shell del alumno (`c/[coach_slug]/layout.tsx`); sin esto un gestor podía guardar `</style><script>…` y XSSear al pool entero.
- **`loader_icon_mode`**: debe estar en `LOADER_ICON_MODES = {logo, text, none, eva}` (espeja el CHECK de DB) o error.
- **`use_custom_loader`** / **`neutral_tint`**: booleanos (`=== 'on' || === 'true'`).
- **Logos** (`logo`, `logo_dark`): solo si el File existe y `size > 0`, vía `uploadTeamImage`.

Si `Object.keys(updates).length === 0` → "Nada que actualizar."

### Subida de logos — `uploadTeamImage` (service-role)

- Tope **2 MB** (`file.size > 2*1024*1024`).
- `file.type` debe empezar con `image/`.
- **Validación de magic bytes** (no confía en el mime): lee los primeros 4 bytes y exige firma JPEG (`FF D8`) o PNG (`89 50 4E 47`), si no "El archivo no es una imagen válida (JPEG o PNG)."
- Path en Storage: `teams/${teamId}/${name}.${ext}` (name = `logo` o `logo-dark`), bucket **`logos`** (público), `upsert: true`.
- Devuelve `getPublicUrl(path)` con cache-buster `?t=${Date.now()}` (sobre-escritura del mismo path obliga a refrescar la URL). Esa URL se guarda en `updates.logo_url` / `updates.logo_url_dark`.

### Persistencia + side effects

- `supabase.from('teams').update(updates).eq('id', teamId)` (user-scoped). Errores crudos se mapean con `friendlyTeamError` (traduce mensajes de triggers/constraints: seat_limit, owner, can_manage, duplicate key).
- `writeTeamAuditEvent` (`team.service.ts`): inserta en `team_audit_logs` (append-only) la acción `team.brand_updated`, `targetType='team'`, `metadata.fields = Object.keys(updates)`. Se inserta con el cliente user-scoped (actor_coach_id = auth.uid() + manager) para pasar su RLS.
- `revalidatePath('/coach/team')` + `revalidatePath('/coach', 'layout')` (el segundo refresca el shell del coach, que también consume la marca del team).

---

## 2.7 RLS, GRANTs y triggers de las columnas de `teams` (capa DB)

Las columnas white-label viven en `teams`, agregadas por `supabase/migrations/20260610000000_team_brand_full.sql` (aditiva/idempotente):
`logo_url_dark`, `accent_light`, `accent_dark`, `neutral_tint` (bool DEFAULT false), `splash_bg_color`, `loader_text`, `loader_text_color`, `loader_icon_mode` (text DEFAULT 'logo', **CHECK IN ('logo','text','none','eva')**), `use_custom_loader` (bool DEFAULT false). `teams` **no tiene** `updated_at`.

### Column-level GRANT (compra-only / default-deny)

`supabase/migrations/20260612140000_modules_compra_only_grants.sql` hace `REVOKE INSERT,UPDATE,DELETE ON teams FROM authenticated,anon` y re-grantea UPDATE **solo** sobre la allowlist de columnas de marca:
`name, primary_color, accent_light, accent_dark, splash_bg_color, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, neutral_tint, logo_url, logo_url_dark`.

> Regla de mantenimiento obligatoria del repo: toda columna nueva de `teams` que el gestor deba editar user-scoped **exige un `GRANT UPDATE(col)` en la misma migración** que la crea. Sin el grant, PostgREST devuelve `42501` en runtime. Las columnas **no listadas** (`enabled_modules`, `seat_limit`, `owner_coach_id`, `suspended_at`, `slug`, `invite_code`, `deleted_at`) quedan **service-role-only** — el gestor no las puede tocar por PATCH.

### Triggers de gobernanza (segunda capa)

`teams_guard_owner_fields` (SECURITY DEFINER, endurecido en la misma migración): aunque el GRANT ya excluye `seat_limit` y `owner_coach_id`, el trigger bloquea cambiar `seat_limit` para **todo** authenticated (incluido el owner — lo fija el CEO en `/admin/teams`) y `owner_coach_id` salvo vía `transfer_team_ownership`. Defensa en profundidad sobre el grant.

### Lectura por el alumno (proxy /t)

`get_team_alumno_context(p_team_slug)` (SECURITY DEFINER STABLE, en la misma migración de brand) expone toda la marca al proxy de `/t`: primary_color, logo_url, logo_url_dark, accent_light/dark, neutral_tint, splash_bg_color, loader_text/color/icon_mode, use_custom_loader. `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`. Así el alumno del pool ve la marca publicada sin acceso directo de SELECT a la tabla.

---

## 2.8 Diferencia vs "Mi Marca" standalone

| Aspecto | Brand Studio del equipo | Mi Marca (standalone) |
|---|---|---|
| Tabla destino | `teams` | `coaches` |
| Quién edita | owner / co-gestor (`is_team_manager`) | el propio coach |
| A quién afecta | **todo el pool**: todos los alumnos en `/t/[team_slug]` + shell de cada coach del team | solo los alumnos de ese coach (`/c/[coach_slug]`) |
| Acción | `updateTeamBrandAction` | acción del coach settings (Mi Marca) |
| Visibilidad | en contexto team se muestra Brand Studio; "Mi Marca" del coach queda **oculta** en contexto team | solo standalone |

La marca aquí es propiedad **del equipo**, no del coach individual. Por eso al crear un coach nuevo dentro del pool (`createTeamCoachAction`) se le copia `brand_name = team.name`, `primary_color = team.primary_color`, `logo_url = team.logo_url` a su fila `coaches` como semilla, pero la fuente de verdad de la experiencia del alumno del pool es `teams`.
