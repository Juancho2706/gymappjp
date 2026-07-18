# SPEC — Unidad `directory-create-import` (Seccion 3, COACH)

> Flujos de ALTA de alumnos: **CreateClientModal** (nuevo alumno) + **ImportClientsForm** (wizard de importacion masiva).
> Web = fuente de verdad. Cada afirmacion cita `archivo:linea`. Copy VERBATIM (web ya en latino neutro; ojo excepciones marcadas).

## 0. Archivos y fronteras

**rnFiles PROPIOS (esta unidad edita):**
- `apps/mobile/components/coach/directory/CreateClientModal.tsx` (125 L actuales)
- `apps/mobile/components/coach/directory/ImportClientsForm.tsx` (385 L actuales)

**READ-ONLY (otras unidades — NO tocar; cambios necesarios → `cambiosShell`):**
- `apps/mobile/app/coach/(tabs)/clientes.tsx` (owner `directory-screen`) — monta ambos: `CreateClientModal` (496-501) via `showCreate`, `onCreated={() => load()}`; `ImportClientsForm` (503-511) dentro de `<NativeDialog open={showImport} title="Importar alumnos">`, props `maxClients` (506), `activeCount={clients.filter((c) => !c.isArchived).length}` (507), `onDone={() => { setShowImport(false); load() }}`, `onCancel`. `maxClients` viene de `getCoachProfile().then(...c.maxClients)` (115).
- `apps/mobile/components/coach/directory/directory-shared.ts` (owner) — exporta `SUCCESS=#1FB877` (13), `WARNING=#F5A524` (14), `DANGER=#F4365A` (15) — excepcion documentada del token-contract §1 (colores de estado fijos, la rampa de marca NO los pisa).
- `apps/mobile/lib/import-wizard.ts` (logica pura del wizard; es lib, no ownership de esta unidad) — matcher/parser/validacion. Ver §7.
- `apps/mobile/lib/api.ts` (`apiFetch`/`ApiError`), `apps/mobile/lib/client-actions.ts` (`whatsappUrl`/`openWhatsApp`), `apps/mobile/components/Input.tsx`, `apps/mobile/components/NativeDialog.tsx`.

**webFiles (verdad):**
- `apps/web/src/app/coach/clients/CreateClientModal.tsx` (306 L)
- `apps/web/src/app/coach/clients/_actions/clients.actions.ts` (`createClientAction`, 39-231)
- `apps/web/src/app/coach/clients/_lib/create-client-internal.ts`
- `apps/web/src/app/coach/clients/import/page.tsx` + `import/_components/{ImportContent,ImportWizard,Step1Upload,Step2MapColumns,Step3Preview,Step4Confirm}.tsx` + `import/_actions/import.actions.ts`
- `apps/web/src/lib/import/header-matcher.ts`, `packages/schemas/client.ts` (`CreateClientSchema` 18-25)
- endpoint mobile real: `apps/web/src/app/api/mobile/coach/clients/route.ts` (POST)

---

## 1. GOTCHAS DE CLASE — evaluacion para esta unidad

- **6a (bomba -999 @gorhom):** SIN RIESGO. Ambos usan `Modal` nativo RN, NO `@gorhom`. `CreateClientModal` monta su propio `<Modal ... animationType="slide">` (`CreateClientModal.tsx:69`); `ImportClientsForm` va dentro de `NativeDialog` = `<Modal ... animationType="fade">` (`NativeDialog.tsx:20`). No migrar a `nativeModal` — ya son Modal RN. Al portar mantener el mecanismo Modal RN (no introducir @gorhom).
- **6c (Fabric 45798, TextInput focus):** ALTO (varios inputs). El `Input` DS pinta el borde por `style` (`borderColor` estable, `Input.tsx:103,143`) y el focus-ring es hermano absoluto SIEMPRE montado que solo varia `opacity` (`Input.tsx:105-107,137-140`) → SEGURO. Regla dura: campos nuevos usan `<Input>` DS o replican ese patron; NUNCA envolver un `TextInput` en un wrapper con estilo condicional por focus. El `TextInput` crudo de pegado en Import (`ImportClientsForm.tsx:210-218`) NO cambia estilo por focus → OK.
- **6b (congelamiento fetch/tabs):** N/A. Ninguno hace fetch propio de catalogos al montar. `activeCount`/`maxClients` llegan por props desde `clientes.tsx`. POST es on-submit. No agregar fetch de catalogo on-mount.
- **6d (claves de dia Santiago):** relevante en Import — ver §7 (BUG del default de fecha).
- **6e (notif locales):** N/A.

---

## 2. CreateClientModal — spec web (line-by-line)

Web = **3 estados excluyentes** en el mismo `<Dialog>`: (A) formulario, (B) exito+WhatsApp, (C) upgrade. Seleccion por `state` de `useActionState(createClientAction)` (`CreateClientModal.tsx:55`).

### 2.A Estado FORMULARIO (default, 168-305)
- `<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>` (169) → `<DialogContent className="bg-card border border-border text-foreground max-w-md rounded-2xl shadow-2xl">` (170).
- Header (171-179): `DialogTitle` **"Agregar Nuevo Alumno"** `text-lg font-extrabold text-foreground` (172-174). Subtitulo `text-sm text-muted-foreground` (175-178): **"Se creará una cuenta con contraseña temporal. El alumno deberá cambiarla en su primer ingreso."**
- Form (181): `action={formAction}`, `className="space-y-4 mt-2"`, `ref={formRef}`.
- Campos (cada uno `<div className="space-y-1.5">` con `<Label className="text-sm text-foreground font-semibold">` + `<Input className="h-10 bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary">`):
  1. **Nombre completo** (183-197): `name="full_name"`, `placeholder="Juan González"`, `required`. Error `state.fieldErrors?.full_name[0]` en `text-xs text-destructive` (194-196).
  2. **Email del alumno** (199-215): `name="email"`, `type="email"`, `placeholder="alumno@ejemplo.com"`, `required`. Error `fieldErrors?.email[0]` (212-214).
  3. **Teléfono (WhatsApp)** (217-229): `name="phone"`, `type="tel"`, `placeholder="+56xxxxxxxxx"`. Sin `required`, sin error.
  4. **Inicio de mensualidad** (231-242): `name="subscription_start_date"`, `type="date"`. Sin `required`, sin error.
  5. **Contraseña temporal** (244-266): `name="temp_password"`, `type="text"` (VISIBLE, `font-mono`), `placeholder="Mín. 8 caracteres"`, `required`, `minLength={8}`. Helper `text-xs text-muted-foreground` (258-260): **"Comparte esta clave con tu alumno. Se le pedirá cambiarla al entrar."** Error `fieldErrors?.temp_password[0]` (261-265).
- **Checkbox edad — Ley 21.719** (268-282): `<input name="age_confirmed" type="checkbox" required className="... accent-emerald-500">` (270-275) + `<span className="text-xs text-muted-foreground leading-snug">` (276-278): **"Confirmo que el alumno tiene 14 años o más, o que cuento con el consentimiento de su tutor legal (Ley 21.719)."** Error `fieldErrors?.age_confirmed[0]` (280-282). Schema: `packages/schemas/client.ts:24` `age_confirmed: z.literal('on', ...)`.
- Error global (284-288): si `state.error`, caja `rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive`.
- Footer (290-301): boton **"Cancelar"** `type="button" onClick={onClose}` `flex-1 h-11 rounded-xl border border-border text-muted-foreground` (291-297) + `<SubmitButton/>` (299).
- **SubmitButton** (21-47): `type="submit"`, `disabled={pending}` (useFormStatus). `bg-gradient-to-r from-emerald-500 to-teal-600 text-white h-11 rounded-xl font-bold` (28-32). Pending: `<Loader2 spin/> Creando alumno...` (34-38). Idle: `<UserPlus/> Crear Alumno` (40-44).

### 2.B Estado EXITO + WhatsApp (73-118)
- Activa si `state.success && state.newClientPhone` (73). Si `success` sin telefono → auto-cierra + reset (60-65).
- Calculos (74-76): `digits = phone.replace(/\D/g,'')`; `message = "Hola ${clientName}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${loginUrl}"`; `waUrl = https://wa.me/${digits}?text=${encodeURIComponent(message)}`.
- UI (80-115): circulo `bg-emerald-500/15` + `<CheckCircle2 h-8 w-8 text-emerald-500>` (82-84); titulo **"¡Alumno creado!"** `text-lg font-extrabold` (86-88); texto (89-93) **"Enviá el link de acceso a {clientName} por WhatsApp."** (`clientName` en `font-semibold`).
  - Boton `<a href={waUrl} target="_blank" onClick={handleClose}>` `bg-[#25D366] ... hover:bg-[#1ebe5d] active:scale-[0.98]` + `<MessageCircle/>` + **"Enviar link por WhatsApp"** (96-105).
  - Secundario `type="button" onClick={handleClose}` **"Omitir por ahora"** `text-sm text-muted-foreground` (107-113).

### 2.C Estado UPGRADE requerido (121-166)
- Activa si `state.upgradeRequired` (121). `DialogContent max-w-sm` (129).
- UI: circulo `bg-amber-500/15` + `<Lock h-8 w-8 text-amber-400>` (131-133); titulo **"Límite de {currentLimit} alumnos alcanzado"** (135-137); copy (138-140) **"Hacé upgrade para seguir creciendo. Tus alumnos actuales no se ven afectados."**
- CTA `<Link href="/coach/subscription">` `bg-primary text-primary-foreground h-11 rounded-xl font-bold` **"Ver planes →"** (142-151); boton **"Ahora no"** (152-161).
- PostHog (`usePostHog`, 57): `upgrade_modal_dismissed` (125,155), `upgrade_initiated` (145) — gate `client_limit`, incluye `current_limit`.

### 2.D handleClose / reset (67-70)
`handleClose = () => { formRef.current?.reset(); onClose() }` — reabre limpio. Usado en 79, 100, 109, 146, 156.

### 2.E Server action (verdad de datos) — `createClientAction` (clients.actions.ts:39-231)
- Zod `CreateClientSchema.safeParse` (52-55) → `fieldErrors` si falla. Campos 43-50.
- Auth+scope (57-71); tier+`maxClients` (73-74); conteo activos `applyClientScope` (75-81); si `!isEnterprise && !activeTeamId && count>=maxClients` → email upgrade + `{ error, upgradeRequired, currentLimit }` (87-102).
- `createUser` GoTrue admin (114-118) + INSERT `clients` user-scoped `force_password_change:true`, `age_confirmed_at:now`, `org_id`, `team_id` (128-140). Dup email `23505` (144-147). Rollback deleteUser en dbError (143). Assignment enterprise (160-179). loginPath `/t/[slug]/login` vs `/c/[slug]/login` (183-195). Email bienvenida (205-222). `revalidatePath('/coach/clients')` (224).
- HIBP: en creacion el password lo escribe el coach (visible). En import se genera → patron `Eva${pin}!`.

### 2.F Endpoint mobile real — `api/mobile/coach/clients` POST
- Acepta `fullName|full_name`, `email`, `phone`, `subscriptionStartDate|subscription_start_date`, `tempPassword|temp_password`, `ageConfirmed===true|age_confirmed==='on'` → `CreateClientSchema` (40-47). 400 → `{ error:'Datos invalidos.', code:'VALIDATION_ERROR', fieldErrors }` (49-58).
- Bearer (34-37,60-66). Coach load (68-84). Workspace (86-90). Cap: solo `coach_standalone`, `count>=maxClients` → **402 `code:'UPGRADE_REQUIRED'` + `currentLimit`** (109-129). Email dup → **409 `code:'EMAIL_UNAVAILABLE'`** (132-135,144-152,170-177).
- Exito (223-228): `{ ok:true, clientName, newClientPhone: phone||null, loginUrl }`. El endpoint YA devuelve lo necesario para 2.B/2.C.

---

## 3. Import wizard — spec web (line-by-line)

### 3.A ImportContent (gating+carga) — `ImportContent.tsx`
- `useEffect` → `getImportContext()` (24-39); ruta directa (no embedded), `!allowed`: `org_coach`→`/coach/clients`, `unauth`→`/login` (31-35).
- Loading (41-48): `<Loader2 spin/> Cargando…`. `allowed` → `<ImportWizard coachId orgId maxClients activeCount embedded/>` (50-60). `reason==='upsell'` → `<UpsellGate variant="client_import" currentTier={tier}/>` (64-66). Otro → `null`.
- `getImportContext` (import.actions.ts:59-102): `getClaims` → `getCoachOrgContext`; org-coach NO importa (68-70); tier caps `canImportClients` (79-83); conteo activos scoped. Devuelve `{ allowed, coachId, orgId, maxClients: coach.max_clients ?? 10, activeCount }`.

### 3.B ImportWizard (stepper) — `ImportWizard.tsx`
- Contenedor `max-w-4xl mx-auto animate-fade-in` (41). Header no-embedded (42-49): `<h1 text-2xl font-extrabold>` **"Importar Alumnos"** + `<p text-sm text-muted-foreground>` **"Importá tu cartera desde un archivo Excel o CSV."**
- Stepper (52-81): `STEP_LABELS = ['Subir archivo','Mapear columnas','Revisar datos','Confirmar']` (32). Circulo `h-7 w-7 rounded-full`: done → `bg-primary text-primary-foreground` + `✓` (clickable, 60,69); current → `bg-primary` + num; futuro → `bg-muted text-muted-foreground` + num. Conector `h-px w-8` `bg-primary`/`bg-border` (75-77). Label `hidden sm:inline` (71-73).
- Estado local `sheet/mapping/mappedRows` (36-38).

### 3.C Step1Upload — `Step1Upload.tsx`
- Limites (10-18): `MAX_BYTES=5MB`, `MAX_ROWS=1000`, exts `.xlsx/.xls/.csv`.
- Dropzone (89-118): `border-2 border-dashed rounded-2xl p-12 cursor-pointer`; dragging → `border-primary bg-primary/5`. `<input type="file" accept=".xlsx,.xls,.csv" className="sr-only">`. Texto: parsing **"Procesando archivo..."** / idle **"Arrastrá tu archivo o hacé click para seleccionar"** + **".xlsx, .xls o .csv · Máximo 5 MB · Hasta 1.000 alumnos"**.
- Parseo (26-73): `import('xlsx')` (41), `sheet_to_json header:1` (45-49). Mensajes: **"Formato no soportado. Usá .xlsx, .xls o .csv."** / **"El archivo supera el límite de 5 MB."** / **"El archivo está vacío o solo tiene encabezados."** / **"El archivo tiene más de 1000 filas. Dividilo en partes de hasta 1000 alumnos."** / catch **"No se pudo leer el archivo. Verificá que sea un Excel o CSV válido."**
- Card ayuda (126-149): **"¿Qué columnas necesito?"** + `<a href="/templates/import-alumnos.xlsx" download>` **"Descargar template"**. Lista (140-145): **Nombre completo — requerido / Email — requerido / Teléfono — opcional / Fecha de inicio — opcional (DD/MM/AAAA)**. Nota **"Los nombres de columna pueden estar en español o inglés. Los detectamos automáticamente."**

### 3.D Step2MapColumns — `Step2MapColumns.tsx`
- Auto `matchHeaders` (50); `mapping` inicial=auto (52-59). `FIELD_OPTIONS` (39-45): `-- No importar --`, `Nombre completo`, `Email`, `Teléfono`, `Fecha de inicio`. `REQUIRED=['full_name','email']` (47).
- Texto (83-85): **"Detectamos las siguientes columnas. Verificá que el mapeo sea correcto."**
- Tabla (87-140): cols **"Columna del archivo" / "Ejemplos" / "Campo EVA"**. `<select>` (111-122); badge **Auto** (exact, emerald) / **Sugerido** (fuzzy, amber).
- Falta requerido (142-146): **"Debés mapear: {labels}"**.
- `normalizeImportDate` (17-37): Date→partes locales; DD/MM/YYYY; DD-MM-YYYY; YYYY-MM-DD; else null.
- Footer (148-162): **"← Volver"** / **"Continuar →"** (`disabled={!canContinue}`).

### 3.E Step3Preview — `Step3Preview.tsx`
- `rowSchema` (8-13): `full_name min(2) 'Nombre muy corto' max(100)`, `email 'Email inválido'`.
- Anotacion (34-58): **"Email duplicado en este archivo (se omitirá)"** (46-48); `isDangerousCell` → **"Celda con carácter especial — se sanitizará automáticamente"** (51-53). `_status`: error>warning>valid.
- Pills (74-78): `✅ {n} válidas` / `⚠️ {n} con advertencia` / `❌ {n} con error`.
- Tabla (81-129): cols **# / Nombre / Email / Teléfono / Estado**; muestra 50, **"Mostrando 50 de {n} filas."**; estado `Error: {msg}` / `⚠ {warn}` / `✓ OK`.
- Footer (131-145): **"← Volver"** / **"Continuar con {validCount} alumnos →"** (`disabled={validCount===0}`).

### 3.F Step4Confirm — `Step4Confirm.tsx`
- `wouldExceedLimit = activeCount + rows.length > maxClients` (22); `canImport = consent && !wouldExceedLimit && !isPending` (23).
- Card (76-94): `📥 {rows.length} alumnos serán creados`; `{activeCount} actuales + {rows.length} nuevos = {suma} / {maxClients} del plan`; `✉️ {n} emails de bienvenida se enviarán`; `⏱️ Tiempo estimado: ~{Math.ceil(rows.length/10)*2} segundos`.
- Exceso (96-103): **"Tu plan permite {maxClients} alumnos y tenés {activeCount}. No podés importar {rows.length} alumnos más."** + `<a href="/coach/subscription?upgrade=true">` **"Actualizá tu plan →"**.
- Consent (106-120): checkbox `border-primary bg-primary/5` si activo; texto **"Confirmo que tengo el consentimiento expreso de las personas listadas para procesar sus datos personales conforme a la Ley 19.628 sobre Protección de la Vida Privada (Chile), modificada por la Ley 21.719."** (Ley 19.628 y 21.719 en `font-bold`).
- Error (122-126). Footer (128-143): **"← Volver"** / `isPending ? "Importando..." : "Importar {n} alumnos"` (`disabled={!canImport}`).
- Link (145-147): `<a href="/privacy" target="_blank">` **"Política de privacidad y DPA"**.
- **EXITO** (33-70): `✅ {succeeded} alumnos importados`; si `failed>0` → **"{failed} fallaron · {skipped} omitidos"**; tabla `Filas con error ({n})` con `#{row} {full_name} ({email}) {error}`; boton **"Ir a mi cartera →"** → `/coach/clients`.
- `importClientsAction` (import.actions.ts:128-334): consent obligatorio (**"Debes confirmar el consentimiento de protección de datos (Ley 19.628) para continuar."**, 133-135); gating (141-196); `client_imports` audit (198-212); dedupe emails existentes (214-225); chunks de 10 `Promise.allSettled` (237-308); `createClientInternal` + `generateTempPassword()` (288); resumen `{ total, succeeded, failed, skipped }` + `rowErrors` (323-333).

### 3.G Tokens/tipografia (web)
Fondos `bg-card/bg-secondary/bg-muted/50/bg-primary/5`; bordes `border-border/divide-border`; texto `text-foreground/text-muted-foreground/text-destructive/text-primary`; radios `rounded-2xl/rounded-xl/rounded-lg/rounded-full`; pesos `font-extrabold/font-bold/font-semibold`; tamanos `text-sm/text-xs/text-[10px]`. Claro/oscuro: roles CSS que flipean por tema. Hex crudos SOLO `#25D366`/`#1ebe5d` (WhatsApp) y gradiente `emerald-500/teal-600` del submit (Ola 0: hardcode fuera del token-contract).

---

## 4. Estado RN actual (divergencias con cita)

### 4.A CreateClientModal RN (`CreateClientModal.tsx`)
- Solo el estado FORMULARIO. **Faltan 2.B (exito+WhatsApp) y 2.C (upgrade)** — tras POST `setForm/onCreated/onClose` descarta la respuesta (51-53).
- Campos (61-66): `fullName/email/phone/tempPassword`. **Faltan** `subscription_start_date` y checkbox edad (`ageConfirmed: true` hardcodeado, 48).
- Copy divergente: titulo **"Nuevo Alumno"** (75), sin subtitulo; labels `Nombre completo * / Email * / Teléfono (opcional) / Contraseña temporal *` (62-65); placeholder password **"Min. 6 caracteres"** (65) — INCORRECTO (server exige 8); sin placeholders de ejemplo; loading **"Creando…"** (102).
- Validacion cliente (33-36): solo no-vacio; sin `min(8)`, sin `email()`.
- Error: solo caja global `errorBox` (81-85); no mapea `fieldErrors` (el Input soporta `error`, `Input.tsx:37`, pero `apiFetch` no expone `fieldErrors` en `ApiError`, `api.ts:89-96`).
- Password `secureTextEntry` (97) sin toggle (web visible). Sin `hint`.
- Reset al cerrar: `onClose` directo (71,76) sin limpiar form/error (solo tras exito, 51) → reabre con valores/errores previos.
- Boton `variant="sport"` (azul) sin icono `UserPlus` (102).
- Presentacion: `Modal` slide con handle/backdrop + `X` (69-79); teclados `email-address`/`phone-pad` (96) — adaptaciones idiomaticas OK.

### 4.B ImportClientsForm RN (`ImportClientsForm.tsx`)
- Implementa 4 pasos + resultado. Logica pura en `import-wizard.ts` (matcher/parser/validacion 1:1 con web).
- **PENDIENTE-DECISION-CEO (cambia el GESTO de entrada):** mobile parsea **CSV/texto pegado**, NO xlsx (comentario `:33` "xlsx es web-only, DocumentPicker no lo parsea"). Web Step1 sube `.xlsx/.xls/.csv` con `import('xlsx')`. Mobile: `DocumentPicker` CSV (91-104) + `TextInput` de pegado (210-218). Distinta capacidad de entrada de datos → anotar.
- Presentacion: dentro de `NativeDialog` (Modal fade), no ruta `/coach/clients/import` — adaptacion idiomatica. Scroll interno `maxHeight:380` (72).
- Stepper: labels cortos `['Subir','Mapear','Revisar','Confirmar']` (37) vs web largos.
- Mapeo (227-284): chips tocables en vez de `<select>` (255-273) — adaptacion tactil. `FIELD_CHIPS` labels cortos `Ignorar/Nombre/Email/Teléfono/Fecha` (39-45). Badges `Auto`/`Sugerido` (241-249).
- Preview (287-315): pills `{n} válidas / {n} advertencia / {n} con error` (290-294) — web "con advertencia". Filas dot + `{nombre} · {email}` + nota. **"Mostrando 50 de {n} filas."** (310-312).
- Confirmar (318-352): resumen `{n} alumnos serán creados` + linea de cupos (322-325). **Falta** linea `⏱️ Tiempo estimado` (web); linea emails presente pero reformulada (326). `wouldExceedLimit` copy propio (331-333). Consent con texto legal CONDENSADO (346-348) — **NO VERBATIM** (web 115-119). **Falta** link "Política de privacidad y DPA".
- Escritura (127-156): loop fila-por-fila `POST /api/mobile/coach/clients` (134-145), NO batch. `tempPassword: Eva${pin}!` (142) — respeta HIBP. Dedupe `code==='EMAIL_UNAVAILABLE'`→skipped (149).
- **BUG clave de dia (§7):** `subscriptionStartDate` default = `new Date().toISOString().slice(0,10)` (141) — UTC, no dia Santiago; web manda `null` cuando falta.
- Resultado (159-171): `{ok} creados · {skipped} omitidos · {fail} con error` (162-164) + **"Ir a mi cartera"** (168). Web: `✅ {n} alumnos importados` + tabla de errores.

---

## 5. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

**CreateClientModal — 9 discrepancias** (bloque "Auditoría línea por línea ... CreateClientModal.tsx 307L vs 125L"):
1. **P0** — Paso de exito con CTA WhatsApp ausente (RN descarta la respuesta con `clientName/newClientPhone/loginUrl`). Fix: estado `created`, wa.me via `Linking.openURL` (`whatsappUrl` ya existe `client-actions.ts:11`), "Omitir por ahora"; auto-cierre sin telefono.
2. **P0** — Gate de upgrade ausente. Endpoint 402 `UPGRADE_REQUIRED` + `currentLimit`; `apiFetch` expone `e.code` (`api.ts:29,94`). Fix: detectar en catch, render Lock ambar + titulo `currentLimit` + CTA suscripcion + "Ahora no".
3. **P1** — Checkbox edad (Ley 21.719) ausente (`ageConfirmed:true` hardcodeado). Fix: checkbox real requerido, texto VERBATIM, enviar valor real.
4. **P1** — Campo "Inicio de mensualidad" ausente (no envia `subscriptionStartDate`, endpoint lo acepta route:44). Fix: date picker + enviar.
5. **P1** — Password: placeholder "Min. 6" (server exige 8), sin `min(8)`, `secureTextEntry` sin toggle, sin helper. Fix: "Mín. 8 caracteres", validar ≥8, toggle Eye (`Input` soporta `rightIcon`), `hint`.
6. **P2** — `fieldErrors` no mapeados a campos (Input soporta `error`; `apiFetch` no propaga `fieldErrors`). Fix: exponer `fieldErrors` en `ApiError`, pasarlos por Input.
7. **P2** — Copy titulo/subtitulo/labels. Fix: "Agregar Nuevo Alumno" + subtitulo, "Email del alumno", "Teléfono (WhatsApp)", placeholders, "Creando alumno...".
8. **P2** — Boton gradiente esmeralda→teal + icono UserPlus vs CTA azul sin icono. Fix: al menos icono UserPlus; el gradiente web es hex fuera del token-contract (no clonar hex crudos; decidir fuente de verdad).
9. **P2** — Reset form/error al cerrar (web `handleClose` resetea; RN no). Fix: `handleClose` con `setForm(inicial)` + `setError(null)`.

**ImportClientsForm — SIN discrepancias en Ola 0.** No fue auditado en `discrepancias_por_resultado` (no existia al momento o no fue pareado); solo aparece en `mapa_componentes`. Esta spec cubre su paridad desde cero (§3, §4.B).

**Relacionado (bloque Label):** `Label` standalone se usa en `CreateClientModal.tsx` web fuera de RHF; en mobile usar `<Input label>` (ya integra el label). No requiere `FormLabel`/RHF.

---

## 6. Hallazgos ronda 5

**N/A** — el brief NO cita tablas de ronda 5 para esta unidad. Sin insumo r5 que absorber.

---

## 7. Notas de datos (queries/RPC, claves de dia)

- **Creacion:** un solo `POST /api/mobile/coach/clients` (endpoint real desplegado). Body camelCase. Scoping y cap server-side (service-role); el cap de UI (upgrade) es espejo. Sin claves de dia (fecha = string que elige el coach o null).
- **Importacion:** parseo local (`import-wizard.ts`) + insercion fila-por-fila via el MISMO endpoint (mobile no tiene batch server action; web usa `importClientsAction` con `client_imports` audit + chunks de 10). Fallos parciales: reportar `ok/skipped/fail` + errores (copy a alinear con web).
- **BUG clave de dia (gotcha 6d):** `ImportClientsForm.tsx:141` `new Date().toISOString().slice(0,10)` como default de `subscriptionStartDate` — dia UTC, no dia Santiago; ademas web NO pone default (manda `null` si la fila no trae fecha). Correccion: NO inventar default; si falta fecha, omitir el campo (o `getSantiagoIsoYmdForUtcInstant` SOLO si se decide un default consciente → PENDIENTE-DECISION-CEO).
- **HIBP:** password temporal del import = `Eva${pin}!` (pasa leaked-pwd; NO PIN numerico puro). Ya respetado (142).

---

## 8. Mapa de interacciones (todos los tocables → efecto)

### CreateClientModal (objetivo de paridad)
| Tocable | Efecto esperado (web = verdad) |
|---|---|
| Input Nombre completo | edita `full_name`; error debajo si `fieldErrors.full_name` |
| Input Email del alumno | edita `email` (`email-address`); error `fieldErrors.email` |
| Input Teléfono (WhatsApp) | edita `phone` (`phone-pad`); opcional |
| Input Inicio de mensualidad | date picker → `subscription_start_date` (opcional) [falta en RN] |
| Input Contraseña temporal | edita `temp_password` VISIBLE (o toggle Eye); helper "Comparte esta clave..."; min 8 |
| Checkbox edad (Ley 21.719) | requerido; habilita submit; envia `ageConfirmed` real [falta en RN] |
| Boton "Cancelar" / X / backdrop | `handleClose` → reset form/error + `onClose` |
| Boton submit "Crear Alumno" | POST; pending "Creando alumno..."; exito→2.B si telefono / auto-cierra si no; 402→2.C; 409/otro→error |
| (2.B) "Enviar link por WhatsApp" | `Linking.openURL(wa.me/{digits}?text=...)`; luego cierra |
| (2.B) "Omitir por ahora" | `handleClose` |
| (2.C) "Ver planes →" | navega a suscripcion (+ PostHog `upgrade_initiated` si hay) |
| (2.C) "Ahora no" | cierra (+ PostHog `upgrade_modal_dismissed`) |

### ImportClientsForm (objetivo de paridad)
| Tocable | Efecto esperado |
|---|---|
| Stepper (paso done) | salta a ese paso (`setStep(num)`) |
| "Subir CSV" / DocumentPicker | lee CSV → `loadSheet` → paso 2 (mobile CSV; web xlsx/xls/csv — PENDIENTE-DECISION-CEO) |
| TextInput pegado | acumula `pasteText`; "Continuar" lo parsea |
| Chips de campo (paso 2) | set `mapping[col]`; badges Auto/Sugerido |
| "Continuar" (paso 2) | `disabled` si falta requerido; construye filas → paso 3 |
| Filas preview (paso 3) | no interactivas; muestran estado/nota |
| "Continuar ({n})" (paso 3) | `disabled` si 0 validas → paso 4 |
| Checkbox consentimiento (paso 4) | requerido para habilitar importar; texto Ley 19.628/21.719 VERBATIM |
| Link "Política de privacidad y DPA" | abre `/privacy` [falta en RN] |
| "Importar {n}" (paso 4) | loop POST; `disabled` si !consent / exceso / 0; pending "Importando..." |
| "← Volver" / "Cancelar" | paso-1→`onCancel`; resto→`setStep(s-1)` |
| (resultado) "Ir a mi cartera" | `onDone` (cierra + `load()`) |

---

## 9. Adaptaciones idiomaticas (documentadas)

- **Auto-sancionadas (preservan lo que el usuario ve/hace):** Dialog centrado → Modal sheet con handle/X; `<select>` → chips tocables; teclados nativos por tipo; hover → activeOpacity/haptics; ruta `/coach/clients/import` → wizard dentro de `NativeDialog`.
- **PENDIENTE-DECISION-CEO (cambian gesto/flujo):**
  1. **Entrada del import:** web sube xlsx/xls/csv (drag+file); mobile solo CSV/texto pegado (sin parser xlsx). Distinta capacidad de entrada.
  2. **Default de fecha en import** (§7): omitir (paridad web = null) vs dia Santiago consciente.
  3. **Password visible vs oculto** en CreateClientModal: web muestra la clave (para copiar); RN la oculta. Cambia como el coach obtiene la clave a compartir.

---

## 10. GATE
`npx tsc --noEmit` en `apps/mobile` limpio tras la implementacion. Esta unidad solo produce spec (docs); sin cambios de codigo RN en este entregable.
