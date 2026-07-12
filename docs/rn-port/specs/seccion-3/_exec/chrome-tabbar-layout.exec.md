# Ejecución — unidad `chrome-tabbar-layout`

Gate: `npx tsc --noEmit` en `apps/mobile` → **EXIT 0 (limpio)**.
Archivos tocados (solo los propios): `apps/mobile/components/coach/CoachMobileChrome.tsx`.
`apps/mobile/app/coach/(tabs)/_layout.tsx` → NO modificado (gate de suscripción L18-30 intacto).
NO commiteado.

## Cambios aplicados (fixes auto-sancionables — preservan lo que el usuario ve/hace)

1. **Ola 0 4.1.8 (P2) — icono Movimiento.** `Activity` → `PersonStanding` (web CoachSidebar.tsx:103).
   - Import: removido `Activity`, agregado `PersonStanding` (orden alfabético).
   - `NAV_ROUTE.movement.icon`.

2. **Ola 0 4.1.7 (P2) — icono size/stroke barra.** RN size 23 stroke 2.4/2.1 → **size 24 strokeWidth 2 constante** (web `<Icon size={24}/>` lucide default stroke=2, CoachSidebar.tsx:409). El diferencial de foco lo dan `fill 0.18` + peso de fuente + color + translateY(-1) (idéntico a web). Aplicado a los tabs primarios y al slot "Más" (`MoreHorizontal` 23/2.1 → 24/2).

3. **Ola 0 4.1.5 (P2) — fondo cápsula hex crudo → token.** `hexToRgba(isDark?'#0E1117':'#FFFFFF', isDark?0.62:0.74)` → `hexToRgba(theme.card, 0.74)`. `theme.card` = surface-card (#FFFFFF light / #161B22 dark) = espejo de web `color-mix(--surface-card 74%)` (CoachSidebar.tsx:345). Corrige la hue dark (era #0E1117, web es #161B22) y unifica alpha a 74% (web es 74% constante). Aplicado en la cápsula principal Y en `ReactivateBar`.

4. **Ola 0 4.1.6 (P2) — offset inferior.** `insets.bottom + 8` → `insets.bottom + 16` (web `+16`, CoachSidebar.tsx:340). Cápsula principal + `ReactivateBar`.

5. **P0 gotcha 6a — sheet "Más" a `nativeModal`.** `<Sheet ... snapPoints={['55%']}>` → agregado prop `nativeModal`. El sheet "Más" es CRÍTICO (única vía a Suscripción/Check-ins/Mi cuenta/Soporte/Equipo/Cardio/Movimiento en mobile); su fallo cold-start (-999 containerHeight, primer present desde Home) bloquearía el flujo. Clase 6a manda migrar sheets críticos a `nativeModal` (camino `<Modal>` RN, patrón KeypadHost probado; API idéntica; '55%' pasa a ser cap de maxHeight). Como no hay device para verificar el primer present, se aplica la mitigación gotcha-compliant en vez de dejar el camino @gorhom frágil.

`isDark` sigue consumido por `BlurView` intensity/tint (sin var muerta).

## NO tocado (divergencias documentadas — regla 2 / PENDIENTE-CEO)

- **Ola 0 4.1.1 (P1) — minimizado on-scroll ausente en RN.** Web colapsa la barra a pill icon-only al scrollear (listener `window.scroll`, insets 14→72, labels fade). Portarlo exige plomería de offset de scroll desde CADA scene (archivos ajenos, fuera de esta unidad) y cambia un comportamiento/gesto. NO auto-sancionable → **parity debt anotada**. Requiere decisión de alcance (¿se porta el minimize?).
- **Ola 0 4.1.2 (P1) — 5 tabs sin "Más" (web) vs 4 tabs + "Más" (RN).** §7.3 spec: cambia el GESTO de acceso a Opciones → **PENDIENTE-DECISION-CEO**. `MAX_BAR_SLOTS`/`barSlots` intactos.
- **Ola 0 4.1.9 (P2) — estado bloqueado.** Web = tab "Reactivar" normal en la barra; RN = `ReactivateBar` CTA full-width + `router.replace`. Dos UIs para el mismo estado → **PENDIENTE-DECISION-CEO** (cuál es fuente de verdad). Conservado.
- **Ola 0 4.1.10 (P2) — `LEGACY_OVERFLOW` (Suscripción/Check-ins/Mi cuenta).** Accesos solo-RN; regla 2 = NO eliminar. Conservados. Parity debt: web los pliega dentro de Opciones.
- **Ola 0 4.2 (P2) — chevron multi-workspace.** Pertenece a `dashboard-sections` (CoachMobileChrome NO monta avatar). Fuera de esta unidad.

## Residual de tokens (NO fixeado — requiere tocar shim compartido, va a cambiosShell)

- **Ola 0 4.1.3 (P2) — color tab activo.** Web `--sport-600` (#1462DC light / #7FB0FF dark, white-label aware). RN usa `theme.primary` (= sport500/brand accent). El shim imperativo `lib/theme.ts` NO expone `sport600` (`resolveSportRamp` solo da 300/400/500; sport600 flipea en dark) y es archivo AJENO + frozen ("DO NOT add new consumers"). Fixearlo exige raw hex nuevo (viola regla 3) o extender el shim compartido. Anotado como residual.
- **Ola 0 4.1.4 (P2) — color tab inactivo.** Web `--ink-400` (#818C9A ambos modos). RN usa `theme.mutedForeground` (#5A6573 light / #8A95A3 dark). `ink-400` tampoco existe en el shim imperativo. Mismo bloqueo. Anotado como residual.

Ambos residuales cerrarían agregando `sport600` + `ink400` (o `nav-tab-*`) al shim `apps/mobile/lib/theme.ts` (resolver white-label aware para sport600) — cambio de archivo compartido, no propiedad de esta unidad.

## Gotchas de clase — estado
- 6a: aplicado (sheet "Más" → nativeModal).
- 6b: BlurView ya usa `experimentalBlurMethod="dimezisBlurView"` (preexistente, intacto).
- 6c/6d/6e: N/A (sin TextInput, sin claves de día, sin notificaciones locales en esta unidad).
