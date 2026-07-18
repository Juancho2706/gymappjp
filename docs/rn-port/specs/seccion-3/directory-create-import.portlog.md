# Port-log — `directory-create-import` (Seccion 3, COACH)

GATE: `npx tsc --noEmit` en `apps/mobile` = EXIT 0 (limpio).

## Archivos tocados (PROPIOS)
- `apps/mobile/components/coach/directory/CreateClientModal.tsx` — reescrito (3 estados).
- `apps/mobile/components/coach/directory/ImportClientsForm.tsx` — parches de paridad + bugfix 6d.

## CreateClientModal — Ola 0 (9 discrepancias) resueltas
1. **P0 exito+WhatsApp** — nuevo `phase='success'`: captura la respuesta del POST (`apiFetch<CreateClientResponse>`), muestra circulo `CheckCircle2` (SUCCESS), "¡Alumno creado!", "Envía el link de acceso a {clientName} por WhatsApp." (clientName bold), boton `#25D366` "Enviar link por WhatsApp" (`Linking.openURL` con el mensaje VERBATIM del web L75), "Omitir por ahora". Sin telefono → `handleClose()` (auto-cierre). `onCreated()` se llama al crear (refresca cartera por debajo).
2. **P0 gate upgrade** — catch `e?.code === 'UPGRADE_REQUIRED'` (402) → `phase='upgrade'`: circulo Lock (WARNING), titulo "Límite de {n} alumnos alcanzado", copy VERBATIM web L139, CTA "Ver planes →" (`router.push('/coach/subscription')`), "Ahora no".
3. **P1 checkbox edad Ley 21.719** — checkbox real (TouchableOpacity + box + check), texto VERBATIM, envia `ageConfirmed` real (ya no hardcode). Validado en cliente via `CreateClientSchema`.
4. **P1 Inicio de mensualidad** — campo agregado; se envia `subscriptionStartDate` (omitido si vacio). Ver PENDIENTE-DECISION-CEO #1.
5. **P1 password** — placeholder "Mín. 8 caracteres", validacion `min(8)` (schema), toggle Eye/EyeOff (`rightIcon`), `hint` "Comparte esta clave...". Default VISIBLE (= web). Ver PENDIENTE #2.
6. **P2 fieldErrors** — validacion cliente con `CreateClientSchema` (import `@eva/schemas`) → `flatten().fieldErrors` mapeados por `Input error` (full_name/email/temp_password) + linea bajo el checkbox (age_confirmed). NOTA: los fieldErrors del SERVIDOR siguen sin exponerse (ver cambiosShell api.ts).
7. **P2 copy** — titulo "Agregar Nuevo Alumno" + subtitulo, labels "Email del alumno"/"Teléfono (WhatsApp)", placeholders de ejemplo, submit "Creando alumno..."/"Crear Alumno".
8. **P2 icono** — `leftIcon={UserPlus}` en el submit; se mantiene `variant="sport"` (rampa de marca, token-safe) — NO se clona el gradiente esmeralda/teal (hex crudo fuera del token-contract).
9. **P2 reset** — `handleClose()` unico resetea form/error/fieldErrors/phase/showPw y llama `onClose()`; usado en X, Cancelar, overlay, y ambos dismiss de estado.

Gotchas de clase: 6a OK (Modal RN nativo, sin @gorhom), 6c OK (todos los campos = `Input` DS; el checkbox no envuelve TextInput), 6b N/A (sin fetch on-mount).

## ImportClientsForm — parches de paridad
- **BUG 6d (clave de dia)** — eliminado `new Date().toISOString().slice(0,10)` como default de `subscriptionStartDate`; ahora `?? undefined` (omite → endpoint guarda null, = web). Comentario explicativo agregado.
- **Confirmar** — agregada linea "⏱️ Tiempo estimado: ~{Math.ceil(n/10)*2} segundos"; email line alineada a "✉️ {n} emails de bienvenida se enviarán"; titulo "📥 {n} alumnos serán creados".
- **Exceso** — copy VERBATIM "Tu plan permite {maxClients} alumnos y tienes {activeCount}. No puedes importar {n} alumnos más." + link "Actualiza tu plan →" (`router.push('/coach/subscription')`).
- **Consent VERBATIM** — texto completo Ley 19.628/21.719 con las dos leyes en bold (antes condensado).
- **Link "Política de privacidad y DPA"** — agregado (`Linking.openURL(getApiBaseUrl()+'/privacy')`).
- **Preview** — pill "{n} con advertencia" (antes "advertencia").
- **Resultado** — "✅ {ok} alumnos importados" + linea secundaria "{fail} fallaron · {skipped} omitidos" solo si fail>0 (= web).
- **Boton** — "Importar {n} alumnos" / "Importando..." (antes "Importar {n}" / "Importando…").
- Import `Alert` (no usado) removido; agregados `Linking`, `getApiBaseUrl`, `useRouter`.

## PENDIENTE-DECISION-CEO (cambian gesto/flujo)
1. **Inicio de mensualidad = campo de TEXTO ("AAAA-MM-DD")**, no date-picker nativo (no hay dep de picker en `apps/mobile` y no se agregan deps). Web usa `<input type="date">` (picker). Cambia el gesto (tipear vs seleccionar). Opcional; se omite si vacio.
2. **Password VISIBLE por defecto** (toggle a oculto) en CreateClientModal — replica que el web muestra la clave para copiar. Confirmar si mobile debe nacer oculto.
3. **Import solo CSV/pegado** (heredado; sin parser xlsx) — sigue como estaba; no se toco la entrada.

## cambiosShell (archivos AJENOS — NO tocados, requieren wiring)
- `apps/mobile/app/coach/(tabs)/clientes.tsx` (owner directory-screen): pasar `maxClients={maxClients}` a `<CreateClientModal>` para que el titulo del gate de upgrade muestre el numero exacto (hoy usa el prop opcional; sin el, cae a "Límite de alumnos alcanzado" sin cifra). El prop es OPCIONAL → compila sin el cambio.
- `apps/mobile/lib/api.ts` (READ-ONLY, lib): para fidelidad P2 total, `ApiError` deberia exponer el `payload` (o `fieldErrors`/`currentLimit`) del body 4xx. Hoy solo lleva `message/status/code`, por eso: (a) los fieldErrors del servidor no se mapean por campo (se cubre con validacion cliente), y (b) `currentLimit` del 402 se toma del prop `maxClients` en vez del body.
