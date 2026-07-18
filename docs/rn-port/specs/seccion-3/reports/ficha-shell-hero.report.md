# Reporte — Unidad `ficha-shell-hero` (Seccion 3, COACH)

Gate: `npx tsc --noEmit` en `apps/mobile` (worktree rnmobiledenuevo) = **LIMPIO (EXIT 0)**.
No commit. Solo archivos propios tocados.

## Cambios aplicados (2)

### 1. GOTCHA 6b — `useFocusEffect` para `load()` (accionable §12.6)
Archivo: `apps/mobile/app/coach/cliente/[clientId].tsx`
- Antes: `async function load()` + `useEffect(() => { load() }, [clientId])`. La ficha es ruta stack-push (no se desmonta al abrir program-builder / nutrition-builder); al volver, `load()` no re-corria → datos stale (plan editado no se reflejaba).
- Ahora: `load` = `useCallback(async (opts?: { silent?: boolean }) => {...}, [clientId])` + `useFocusEffect(useCallback(() => { void load({ silent: loadedOnceRef.current }) }, [load]))`.
- Primera carga = loader full-screen (no silent); refrescos on-focus (volver del builder) = **silenciosos** (`loadedOnceRef`) para no flashear `EvaLoaderScreen`.
- Imports: `useCallback` (react), `useFocusEffect` (expo-router).
- Firma `(opts?) => Promise<void>` sigue asignable a `reload: () => void` de los tabs (OverviewTab/ProgresoTab/FacturacionTab) — verificado: param opcional + retorno Promise<void>→void. `confirmArchive`/`EditClientForm.onDone` llaman `load()` sin args (no-silent, comportamiento previo intacto).

### 2. Fondo hero DARK near-black (accionable §2.3/§12.3, no PENDIENTE-CEO)
Archivo: `apps/mobile/components/coach/clientDetail/ClientHero.tsx`
- Web fuerza en dark `bg-[color-mix(in_srgb,surface-card 55%,surface-app)]` (≈#11151B) porque `surface-inverse` dark (#2A323D) leia "plomo" y lavaba texto (feedback CEO). RN `Card variant="inverse"` rendia exactamente ese #2A323D.
- Fix token-clean: `mixSurfaces(theme.card, theme.background)` deriva el color de los MISMOS tokens del theme (theme.card=surface-card #161B22, theme.background=surface-app #0A0D12) con los mismos 55/45 del color-mix web → rgb(17,21,27)=#11151B. **Sin hex crudo autoral nuevo** (usa `hexToChannels` ya exportado en lib/theme). Solo se aplica en DARK; en LIGHT la Card conserva `bg-surface-inverse` (#0B0E13 ink-950) — MATCH web light.
- Aplicado como `backgroundColor` en el `style` de la Card (mismo mecanismo con que ya pisa `borderColor:'transparent'`).

## NO tocado (deliberado)

- **Regla 3:** no se toco global.css/tailwind.config.js; los hex crudos pre-existentes del hero (#F4F6F8/#939DAB/#FF8A5B/#F5A524/#5C9DFF/#2680FF/rgba white) = deuda anotada, no ampliada. El #11151B es DERIVADO de tokens, no autoral.
- Todos los R5 §3.1/§3.2/§3.3 ya estaban resueltos en el RN (verificado linea por linea: nombre fs24/ls-1.2, iniciales fs20, delta toFixed(1), barra track rgba/0.10=border-inverse fill #2680FF=sport-500, Activity #5C9DFF=sport-400, glass BlurView `experimentalBlurMethod="dimezisBlurView"`=gotcha 6a OK, WhatsApp #16A34A/44-38/glifo 1:1).
- Ola 0: 0 hallazgos propios del shell (los 14 hits ProfileOverviewB3 = contenido del tab Resumen, unidad hermana READ-ONLY).
- Gotcha 6d (dias Santiago): ya cumplido (`getTodayInSantiago().iso` en selectedDate + lookup timeline). Sin cambio.
- Gotcha 6a (sheets): esta unidad NO usa @gorhom/bottom-sheet. El menu ⋮ usa `ActionSheet` de `components/DropdownMenu` (archivo AJENO — no tocado); `NativeDialog`/`PhotoLightbox` idem. Si alguno usara @gorhom con reanimated 4 el riesgo seria de ESA unidad; se anota, no se migra desde aca (disciplina de archivos).

## PENDIENTE-DECISION-CEO (cambian gesto/flujo — NO auto-sancionados)

1. **Status neutral/urgent** (§12.2): RN inline (`[clientId].tsx:200-205`) muestra "Archivado"/"Inactivo" (nivel `neutral`, que web no produce) y NUNCA escala a "Urgente" (rojo, que web SI via `deriveClientStatus` puro/compartido). Decision: adoptar `deriveClientStatus` (paridad de niveles ok/attention/urgent) o formalizar la extension RN `neutral`. Cambia el badge que el usuario VE. No tocado.
2. **WhatsApp texto prellenado** (§4): RN abre `wa.me/{digits}?text=Hola {nombre}! Te escribo desde EVA.` + gating por `Alert('Sin telefono')`; web abre `wa.me/{digits}` SIN texto y con boton `disabled` si <10 digitos. Cambia payload + estado observable. No tocado (mantener texto o igualar a web).
3. **Menu ⋮ reducido** (§12.1): RN 2 acciones (Editar datos, Archivar/Reactivar) vs web `ClientActionsSheet` 6 (editar, WhatsApp, reset-pass, pausar, archivar, eliminar) + loginUrl. Port completo excede el shell (componente compartido con el directorio). Gap anotado, ActionSheet actual NO borrado (regla 2).

## Divergencias PX menores anotadas (no accionadas — fuera de recomendacion directa)

- TabBar sin estado **stuck** (web eleva border-default+sombra al pegarse; RN mantiene border-subtle). `ClientTabBar.tsx:38`.
- Sin **transicion** de tab (web AnimatePresence 0.18s + skeleton isPending; RN swap inmediato de View). §6/§8.
- `planCurrentWeek` client-side (ceil sobre start_date) vs web server compliance — mismo formato "Semana N", riesgo de N distinto. §2.2.
- Badges de tab con fuentes de conteo distintas (entreno=weeklyPRs.length vs web prCount||workoutHistory; programa=planCount vs web programTrainingDayCount) — responsabilidad de tabs hermanos + data layer; el shell solo pinta. §3.2.
- Chevron de scroll sin dismiss persistente (RN loop mientras haya overflow; web oculta hint tras primer scroll). §3.5.
- Nombre duplicado TopBar nativo + hero H1 (idiomatica RN, preserva accion volver). §1.2.
- Error export via `Alert.alert` (RN) vs `exportError` inline role=alert (web). Idiomatica, preserva "el usuario ve el error". §2.1.

## shared.tsx (owner = esta unidad)
Sin cambios de firma. Los 3 tabs hermanos lo consumen read-only; no habia recomendacion de tocar sus primitivos.
