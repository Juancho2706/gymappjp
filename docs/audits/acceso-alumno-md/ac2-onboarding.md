# 2. Onboarding del alumno (wizard 3 pasos)

Asistente que completa el perfil del alumno **antes de poder usar la app**. Es el ultimo gate del embudo de activacion: tras login + cambio de clave forzado, el alumno cae aqui y no llega al dashboard hasta finalizarlo. Vive en `apps/web/src/app/c/[coach_slug]/onboarding/`.

Piezas:

- `page.tsx` — RSC. Resuelve estado y decide si muestra el form o redirige fuera.
- `OnboardingForm.tsx` — `'use client'`. El wizard de 3 pasos (UI + draft local + validacion client-side).
- `_actions/onboarding.actions.ts` — `submitIntakeForm` (server action). Persiste y redirige.
- `_data/onboarding.queries.ts` — `getClientOnboardingState` (lectura cacheada del estado).

> Nota de scope: el alumno de **pool/team** (`/t/[team_slug]`) y el de **enterprise** (`/e/[org_slug]`) usan el MISMO arbol via rewrite del proxy a `/c/[coach_slug]`; el `OnboardingForm` y `submitIntakeForm` son los mismos. El path base se resuelve con `getClientBasePath` (header `x-client-base-path` que setea el proxy, fallback `/c/${coachSlug}`). Por eso todos los `redirect` usan `base`, no `/c/...` hardcodeado. El alta por invitacion (`/join`) y los gates de `/t` se cubren en otras secciones; aqui solo el wizard.

---

## 2.1 Datos que llegan precargados (onboarding.queries)

`getClientOnboardingState` (envuelto en `React.cache`) es lo unico que la page consulta. **NO precarga ningun campo del formulario** — el wizard arranca vacio en backend. Lo unico que devuelve:

| Campo | Origen | Como se obtiene |
|-------|--------|-----------------|
| `user` | JWT | `supabase.auth.getClaims()` (verificacion local ES256, sin round-trip a `/user`; el proxy ya valido/refresco la sesion). `user = claims.sub ? { id } : null`. |
| `onboardingCompleted` | tabla `clients` | `SELECT onboarding_completed FROM clients WHERE id = user.id` (`.single()`). `true` solo si `onboarding_completed === true`. |

> El unico "precargado" real es el **draft en `localStorage`** del navegador, manejado 100% client-side en `OnboardingForm` (clave `onboarding_draft_${coachSlug}`) — ver 2.5. El servidor nunca rehidrata el form.

---

## 2.2 page.tsx — gate de entrada / salida

`OnboardingPage` (RSC):

1. `coach_slug` de `params`; `base = await getClientBasePath(coach_slug)`.
2. `{ user, onboardingCompleted } = await getClientOnboardingState()`.
3. Si `!user` → `redirect(\`${base}/login\`)`.
4. Si `onboardingCompleted` → `redirect(\`${base}/dashboard\`)` (no se puede re-hacer el onboarding una vez completo).
5. Si no, renderiza el `<main>` con titulo "Completa tu perfil", el disclaimer legal ("EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud") y `<OnboardingForm coachSlug={coach_slug} />`.

Esta page **no fuerza** el onboarding por si sola — solo evita re-entrar si ya esta completo. El forzado vive en el proxy (ver 2.6).

---

## 2.3 Los 3 pasos — que valida cada uno

El estado del wizard (`OnboardingForm`) vive en un solo objeto `formData`:

```
weight, height, goals, experience_level, availability, injuries, medical_conditions
```
+ dos flags aparte: `ageConfirmed` (checkbox) y `ageError`. `touched` rastrea que campos tocar para mostrar errores.

`STEP_REQUIRED_FIELDS = { 1: ['weight','height'], 2: ['goals','experience_level','availability'], 3: [] }`.

### Paso 1 — "Tus datos biometricos" (Bio)

| Campo | name | Control | Requerido | Validacion client |
|-------|------|---------|-----------|-------------------|
| Peso actual (kg) | `weight` | `<Input type=number step=0.1>` | Si | no vacio + `Number > 0` |
| Estatura (cm) | `height` | `<Input type=number>` | Si | no vacio + `Number > 0` |

`validateCurrentStep()` para paso 1: `weight !== '' && height !== ''`. `fieldError()` agrega la regla `<= 0 → 'Ingresa un valor válido'` solo para `weight`/`height`. Avanzar con campos invalidos NO pasa; marca los required como `touched` para mostrar "Este campo es requerido".

### Paso 2 — "Metas y disponibilidad" (Metas)

Tres `<select>` con opciones fijas (valores que se persisten tal cual, son strings en español):

| Campo | name | Opciones (value) |
|-------|------|------------------|
| Objetivo principal | `goals` | `Perder grasa`, `Aumentar masa muscular`, `Recomposición corporal`, `Mantenimiento general`, `Rendimiento deportivo` |
| Experiencia | `experience_level` | `Principiante`, `Intermedio`, `Avanzado` |
| Días/semana | `availability` | `2 días`, `3 días`, `4 días`, `5 días`, `6+ días` |

`validateCurrentStep()` paso 2: los tres `!== ''`.

### Paso 3 — "Salud y seguridad" (Salud)

| Campo | name | Control | Requerido |
|-------|------|---------|-----------|
| Lesiones o limitaciones | `injuries` | `<textarea>` | No (opcional) |
| Condiciones médicas | `medical_conditions` | `<textarea>` | No (opcional) |
| Confirmacion de edad + terminos | `age_confirmed` | `<input type=checkbox>` (estado `ageConfirmed`) | **Si** |

El checkbox dice: "Confirmo que tengo 14 años o más y acepto los terminos de uso y la politica de privacidad" (links a `/legal/terms` y `/legal/privacy`). `validateCurrentStep()` paso 3: si `!ageConfirmed` → `setAgeError(true); return false`. Tambien hay un disclaimer medico repetido.

**Gotcha de submission documentado en el codigo:** como cada paso se monta/desmonta con `AnimatePresence` (conditional render), los inputs de pasos 1-2 NO estan en el DOM cuando se envia desde el paso 3. Solucion implementada: el paso 3 incluye **`<input type="hidden">`** para `weight`, `height`, `goals`, `experience_level`, `availability` (valores tomados de `formData`). Sin esos hidden, el `FormData` del server action solo traeria los campos del paso 3 → validacion fallaria. `injuries`/`medical_conditions` ya estan visibles en el paso 3 como textareas. El checkbox `age_confirmed` viaja como `'on'` (checkbox HTML estandar).

El submit (`type=submit`) ademas tiene un guard `onClick`: si `!ageConfirmed`, `preventDefault()` y muestra `ageError`. El boton muestra "Guardando..." mientras `isPending` (de `useActionState`).

---

## 2.4 submitIntakeForm — persistencia y redirect

Server action en `onboarding.actions.ts`, bindeada con `submitIntakeForm.bind(null, coachSlug)` (el `coach_slug` es el primer arg; `prevState` y `formData` los pasa `useActionState`). Tipo de retorno `OnboardingState = { error?: string; success?: boolean }`.

Flujo backend:

1. `createClient()` (cliente Supabase con cookies del usuario → corre como el alumno, sujeto a RLS).
2. `supabase.auth.getUser()`. Si `!user` → `return { error: 'No estás autenticado' }`.
3. Lee del `FormData`: `weight`, `height`, `goals`, `experience_level`, `injuries`, `medical_conditions`, `availability`, y `ageConfirmed = formData.get('age_confirmed') === 'on'`.
4. **Validacion server-side** (espejo del client, defense-in-depth):
   - Si falta `weight || height || goals || experienceLevel || availability` → `{ error: 'Por favor, completa todos los campos obligatorios.' }`. (Nota: `injuries`/`medical_conditions` NO son obligatorios; `availability` SI.)
   - Si `!ageConfirmed` → `{ error: 'Debes confirmar que tienes 14 años o más.' }`.
5. **INSERT en `client_intake`** (tabla dedicada, NO `clients`):
   ```
   client_id: user.id
   weight_kg: parseFloat(weight)
   height_cm: parseFloat(height)
   goals
   experience_level: experienceLevel
   injuries: injuries || null
   medical_conditions: medicalConditions || null
   availability
   ```
   Manejo de error: si `intakeError && intakeError.code !== '23505'` → `{ error: 'Ocurrió un error al guardar tu información...' }`. El codigo **23505 (unique violation) se IGNORA a proposito** — `client_intake` tiene `UNIQUE(client_id)` (`client_intake_client_id_key`), asi que un reenvio del mismo alumno no rompe; simplemente se conserva el intake existente y se sigue al paso 6. (Limitacion: en un re-submit el INSERT duplicado falla con 23505 y se ignora → **no se actualizan** los datos del intake previo; el wizard no edita, solo crea la primera vez.)
6. **UPDATE en `clients`**: `{ onboarding_completed: true, age_confirmed_at: new Date().toISOString() }` `WHERE id = user.id`. Si error → `{ error: 'Ocurrió un error al actualizar tu estado...' }`. Este UPDATE es lo que marca el onboarding como completo y libera el gate del proxy.
7. `revalidatePath(\`/c/${coachSlug}/onboarding\`)`.
8. `redirect(\`${await getClientBasePath(coachSlug)}/dashboard\`)`.

> El action **no devuelve `{ success: true }`** en el happy path — hace `redirect()` directo. El `useEffect` del form que limpia el draft al ver `state.success` en la practica casi nunca dispara (el redirect ocurre antes); el draft se limpia igual porque el alumno ya no vuelve a `/onboarding` (la page lo manda a `/dashboard`). El campo `success` del tipo `OnboardingState` queda como contrato muerto en el happy path.

### Tabla destino — `client_intake`

`CREATE TABLE public.client_intake` (baseline):

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `client_id` | uuid | NOT NULL, FK → `clients(id)` ON DELETE CASCADE, **UNIQUE** |
| `weight_kg` | numeric | NOT NULL |
| `height_cm` | numeric | NOT NULL |
| `goals` | text | NOT NULL |
| `experience_level` | text | NOT NULL |
| `injuries` | text | nullable |
| `medical_conditions` | text | nullable |
| `availability` | text | NOT NULL |
| `created_at` / `updated_at` | timestamptz | trigger `handle_updated_at` |

El estado de "completo" NO vive aqui sino en `clients.onboarding_completed` (boolean, default `false`) + `clients.age_confirmed_at` (timestamptz, agregada en `20260517130007_clients_org_id.sql`).

### RLS y grants (backend)

- `client_intake` — politicas (baseline): `"Clients can insert own intake"` (`FOR INSERT WITH CHECK (auth.uid() = client_id)`), `"Clients can view own intake"` (SELECT), `"Clients can update own intake"` (UPDATE), y una `"Client can manage their own intake"` (USING `auth.uid() = client_id`). El INSERT del action corre como el alumno y pasa el `WITH CHECK` porque inserta `client_id: user.id`.
- `clients` — el UPDATE de `onboarding_completed`/`age_confirmed_at` exige **column-level GRANT UPDATE** (la tabla tiene REVOKE de UPDATE a nivel tabla + allowlist de columnas; ver `20260612140001_clients_scoping_grants.sql`). Ambas columnas (`onboarding_completed`, `age_confirmed_at`) estan explicitamente en la allowlist (comentadas como "mobile onboarding"). Sin esos grants el UPDATE daria `42501` en runtime. Las 4 columnas de scoping (`id`, `org_id`, `team_id`, `coach_id`) NO se granular → el alumno nunca puede re-scopearse via este path.

---

## 2.5 Draft local (localStorage) — persistencia client-side

`OnboardingForm` guarda el progreso en `localStorage` para que el alumno pueda cerrar y volver sin perder lo escrito:

- Clave: `onboarding_draft_${coachSlug}` (aislada por coach).
- `useEffect` de carga (al montar): parsea `{ formData, currentStep }` y rehidrata `setFormData` + `setCurrentStep`. Si el JSON esta corrupto, `console.error` y sigue con defaults.
- `useEffect` de guardado: en cada cambio de `formData` o `currentStep`, reescribe el draft.
- `clearDraft()` (borra la clave) se llama en el `useEffect` que observa `state.success`.

> El draft NO incluye `ageConfirmed` ni `touched` (estados aparte). El alumno que vuelve debe re-tildar el checkbox de edad.

---

## 2.6 Cuando se FUERZA vs cuando se puede saltar

El forzado del onboarding **no esta en la page ni en el layout** (ambos solo redirigen si ya esta completo / si falta sesion). Vive en **`proxy.ts`**, en cada uno de los tres arboles de alumno, y siempre DESPUES del gate de cambio de clave:

| Contexto | Gate en proxy (orden: force-password → onboarding) | Redirect |
|----------|----------------------------------------------------|----------|
| Standalone `/c` | `if (!isBlocked && !client.force_password_change && !client.onboarding_completed && !pathname.includes('/onboarding'))` (lee `clients.onboarding_completed` en el `SELECT id, coach_id, ..., onboarding_completed, ...`) | `/c/${coachSlug}/onboarding` |
| Enterprise `/e` | `if (!eBlocked && eCtx.force_password_change !== true && eCtx.onboarding_completed === false && !eRest.includes('/onboarding'))` | `/e/${eOrgSlug}/onboarding` |
| Pool/team `/t` | `if (!tBlocked && tHasActiveCoach && tCtx.force_password_change !== true && tCtx.onboarding_completed === false && !tRest.includes('/onboarding'))` (en `/t` ademas pasa primero por el gate de **consent** Ley 21.719) | `/t/${tTeamSlug}/onboarding` |

Consecuencias:

- **Se fuerza:** cualquier alumno con `onboarding_completed = false` que intente entrar a cualquier ruta del arbol de alumno (que no sea `/onboarding` ni `/change-password`) es redirigido al wizard. No hay forma de llegar al dashboard sin completarlo (siempre que el proxy corra; en `/t` y `/e` el rewrite no re-ejecuta los guards de `/c`, por eso cada branch tiene su propia copia del gate).
- **Se salta / no se fuerza:** solo si `onboarding_completed` ya es `true` (entonces la page de onboarding lo rebota a `/dashboard`). El alumno **no puede** saltarlo voluntariamente; los unicos campos opcionales dentro del wizard son `injuries` y `medical_conditions` (se pueden dejar vacios → se guardan `null`).
- **Precedencia:** `force_password_change` gana sobre onboarding (debe cambiar la clave temporal primero). En `/t`, el **consent** multidisciplinario gana sobre onboarding.

### Resumen del flujo de activacion (backend)

1. Alumno entra a cualquier ruta de su arbol → proxy verifica sesion → `force_password_change` → (en `/t`) `consent` → `onboarding_completed === false` → **redirect a `/onboarding`**.
2. Page renderiza el wizard (a menos que ya este completo).
3. Wizard valida 3 pasos client-side; submit envia FormData con hidden inputs de los pasos previos.
4. `submitIntakeForm`: valida server-side → INSERT `client_intake` (ignora 23505) → UPDATE `clients.onboarding_completed = true` + `age_confirmed_at` → `redirect` a `/dashboard`.
5. Proximas visitas: gate del proxy ya no dispara; page de onboarding rebota a dashboard.
