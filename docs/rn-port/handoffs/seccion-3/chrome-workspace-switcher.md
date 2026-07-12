# Handoff — chrome-workspace-switcher (Seccion 3, COACH)

PORT 1:1 contra spec `docs/rn-port/specs/seccion-3/chrome-workspace-switcher.md`.
Archivo unico propio: `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` (reescrito).
GATE `npx tsc --noEmit` en `apps/mobile`: **exit 0 (limpio)**.

## Cambios aplicados (todos dentro del archivo propio)

| Div | Fix | Web (verdad) | RN aplicado |
|---|---|---|---|
| **D0 (P0/gotcha 6a)** | `<Sheet>` ahora pasa `nativeModal` → path RN Modal (patron ronda 7), evita bomba `containerHeight=-999` del path @gorhom bajo reanimated 4/Fabric en el primer `present()`. `snapPoints={['50%','80%']}` se conserva (largest fraction = cap de maxHeight, = web `max-h-[80dvh]`). | shadcn (estable web) | `WorkspaceSwitcherSheet.tsx` `<Sheet ... nativeModal>` |
| **D1** | Titulo copy VERBATIM. | ":62" ¿En qué espacio quieres trabajar? | `title="¿En qué espacio quieres trabajar?"` |
| **D1b** | Descripcion copy VERBATIM. | ":65" Cada espacio separa datos, marca y permisos. | `description="Cada espacio separa datos, marca y permisos."` |
| **D3** | Caja de icono ACTIVA rellena marca + icono on-sport. | ":92" `bg sport-500` + `text-on-sport` | `bg-sport-500` + `color={theme.primaryForeground}` (= on-sport white) |
| **D3b** | Fila ACTIVA tintada (fondo + borde). `ListRow` no expone tinte activo y es READ-ONLY → render custom `Pressable` (sub-comp `WorkspaceOption`) preservando haptic Light + tinte de press + a11y. | ":84" `border-sport-300 bg-sport-100` | `bg-sport-100` + `border-sport-300` (inactiva: `border-subtle bg-surface-card`, press → `bg-surface-sunken`) |
| **D5b** | Trailing activo con texto "Actual" junto al Check. | ":104-107" `Check + "Actual"` text-sport-600 font-extrabold | `<Check className="text-sport-600" size={14}/>` + `<Text className="text-[11px] font-sans-extra text-sport-600">Actual</Text>`. `cssInterop(Check)` para que className tinte el icono 1:1 (aislado a Check; los otros usos pasan `color`, sin regresion). |
| **D6** | Ocultar boton X (web no lo muestra). | ":52" `showCloseButton={false}` | `showCloseButton={false}` |
| **D7** | Iconos por tipo alineados a web. | `iconFor` :16-22 Dumbbell/UsersRound/Building2 | `KIND_META`: standalone→Dumbbell, team_owner/team_member→UsersRound, enterprise→Building2 (antes: User/Users) |

## Decisiones idiomaticas (spec-sancionadas, sin PENDIENTE-CEO)

- **D4 subtitulo LOCALIZADO conservado.** Web muestra el tipo crudo (`ws.type.replace(/_/g,' ')` capitalize, ej. "coach standalone"); RN mantiene frases DS ("Tu negocio personal", "Equipo · lo gestionas", "Equipo", "Organización"). Es mas legible, ya en latino neutro, NO cambia gesto. Recomendacion explicita de la spec seccion 11. Estilo alineado al web (`text-[11.5px] text-subtle`).
- **D5 sin spinner de transicion.** El cambio RN es local/sincronico (`setActiveWorkspace`, sin server action/red) → no hay ventana "cambiando"; el sheet cierra al instante. Web muestra `Loader2` porque su switch es navegacion+refresh JWT. Preserva el resultado. Adaptacion idiomatica documentada (spec seccion 11).
- **Navegacion vs flip de contexto.** Web navega a rutas separadas por espacio; RN tiene UN arbol coach que consume `useWorkspace()`, asi que el switcher cambia el contexto activo in-place (`handlePick`: `setActiveWorkspace(ws.id)` si inactivo, `onClose()` siempre). Mismo gesto (un tap en la fila), mismo resultado (operar en el espacio elegido). No CEO-gate (spec seccion 11).

## Funcionalidad RN preservada (rule 2)

- Guard `workspaces.length <= 1 → null` (sin switcher trivial). Intacto.
- `handlePick`: `!ws.isActive → setActiveWorkspace`; `onClose()` siempre. Intacto.
- Haptic Light en press-in + tinte de press (`bg-surface-sunken`): re-implementado en `WorkspaceOption` (antes lo daba `ListRow`).
- a11y por fila: `testID=workspace-option-{id}`, `accessibilityLabel` con estado (", activo"), + MEJORA `accessibilityState={{selected}}` (analogo a `aria-current` web). `testID=workspace-switcher-sheet` del contenedor intacto.
- Frescura sin congelamiento (gotcha 6b): el sheet NO hace fetch propio; consume el store `useWorkspace()` que revalida en foreground/auth-change. Cubierto por diseño del store.
- Sin claves de dia (gotcha 6d N/A — no hay logica de calendario).

## Cambio de dependencia (ListRow ya no se usa aqui)

Se dejo de usar `components/ListRow.tsx` en este archivo (era READ-ONLY de otra unidad; se importaba pero NO se modifico). Motivo: `ListRow` no expone tinte/borde de fila ACTIVA (bg siempre `surface-card`, `ListRow.tsx:80`) ni el badge "Actual", ambos requeridos por paridad web (D3b/D5b). Se reemplazo por render custom en el archivo propio, replicando haptic + press-tint + a11y. No se toco `ListRow.tsx`.

## Tokens (rule 3) — cero valores crudos nuevos

Todo via clases NativeWind DS: `bg-sport-100/500`, `border-sport-300`, `border-subtle`, `bg-surface-card/-sunken`, `text-strong`, `text-subtle`, `text-sport-600`, `rounded-card`, `rounded-control`, `font-sans-bold`, `font-sans-extra`. Colores literales para lucide (que exigen string) via `theme.primaryForeground` / `theme.mutedForeground` (expuestos, brand-tracking). NO se toco `global.css`/`tailwind.config.js`.

## Pendientes fuera de esta unidad (a coordinar, NO tocados)

- **D2 labels con sufijo de rol** ("… - Coach"/"… - Admin"/"… - Equipo"): requiere `apps/mobile/lib/workspace-core.ts:189,203` (compartido/READ-ONLY de otra unidad). NO tocado aqui. Va a `cambiosShell`.
- **Caret de multi-workspace en el avatar** (Ola 0 hallazgo 1, P2): el trigger vive en `apps/mobile/components/coach/CoachDashboardSections.tsx:1823-1833` (propiedad de `dashboard-sections`). NO tocado. Dependencia del cableado, no de esta unidad.
