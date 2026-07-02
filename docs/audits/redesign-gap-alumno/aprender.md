# Auditoría de fidelidad visual — ALUMNO › Aprender (catálogo de técnica)

Área: `aprender` (app white-label `/c/[coach_slug]/exercises/*`)
Fecha: 2026-07-02

## Fuentes comparadas
- **Kit mobile (viewport primario <760):** `docs/design-source/ui_kits/eva-app/screens/alumno.jsx` → `Aprender()` (líneas 611-734).
- **Kit desktop (≥760):** `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` → `DesktopAprender()` (líneas 791-859) + CSS `.dt-*` en `eva-desktop/index.html` (líneas 261-264, 311-315, 713-729, 797-798).
- **App:** `apps/web/src/app/c/[coach_slug]/exercises/page.tsx` + `ClientExerciseCatalog.tsx` + `loading.tsx`.

## Veredicto general
La pantalla es de **altísima fidelidad**, prácticamente **1:1 en mobile** (el viewport primario). Estructura completa presente: header con ícono+título+subtítulo, search, chips de músculo scrollables, grilla 2-col de video-cards (media banner + tag músculo + nombre + equipo), paginación "Ver más", y modal-detalle (bottom-sheet en mobile / centrado en desktop) con banner media, título, subtítulo uppercase sport, instrucciones numeradas y botón Cerrar. Tokens semánticos usados en todos lados (`sport-*`, `text-strong/body/muted`, `rounded-control/card/pill`, `radius-sheet`). **Cero P0.** Las diferencias son de estilo en la capa **desktop** (secundaria) y micro-spacing sub-pixel.

Notas de intención (NO gaps):
- **Header sticky branded** (`sticky top-0 backdrop-blur-xl`) en `page.tsx:37` es el **shell app-wide del alumno** (idéntico patrón en `dashboard/DashboardHeader.tsx:24`, `nutrition/page.tsx:139`). El kit renderiza dentro de un phone-frame sin chrome propio; el sticky es decisión de app consistente. Los tokens del header (ícono 38×38 `rounded-control`=14px sobre `bg-sport-100 text-sport-600`, h1 22/900/-0.02em, subtítulo 12.5/muted) coinciden 1:1 con el kit (`alumno.jsx:642-648`).
- **Card "Destacado" + heading "Biblioteca"** (`ClientExerciseCatalog.tsx:53-106, 282-294`) son **riqueza extra** de la app (hero con media real que el kit-mock no tiene). Se MANTIENE, no es gap.
- **Thumbnails reales** (gif/YouTube/mp4) reemplazan el play-placeholder del kit cuando hay media → diferencia de DATOS, no gap.
- Infinite-scroll + spinner sobre el botón "Ver más" = riqueza extra, se mantiene.

---

## Findings

### [P1] Search desktop chunky sobre card en vez del compact-sunken del kit
- **Verdict:** CONFIRMED. Verificado contra código Y kit. App (`ClientExerciseCatalog.tsx:242-249`) pasa `iconLeft` → rich-mode del `<Input>` compartido (`input.tsx:85-110`): `h-12`=48px, `border-[1.5px]`, `bg-surface-card` (l.90), `text-[15px]` (l.107); **sin ningún override `md:`** (el wrapper sólo trae `md:max-w-[360px] md:flex-1`). Kit desktop `.dt-md-search input` (`index.html:239`) = 36px / `radius-md` / 1px `border-subtle` / `surface-sunken` / 13.5px, inline en `.dt-aprender-bar` (flex gap16 wrap, l.713) con los chips (`desktop-coach.jsx:814-822`) — fuente desktop válida (eva-desktop). No hay variante `size`/`density` en el primitivo `<Input>` que cierre el gap, ni componente hermano, ni `@utility`, ni escape por kit legacy top-level. Mobile SÍ coincide 1:1 (mismo primitivo ambos lados). Delta real y desktop-only, cualitativamente mayor que los nits P2 sub-pixel (otro surface token + 12px de alto + peso de borde) → severidad P1 consistente.
- **Kit:** `DesktopAprender` usa `.dt-md-search` (`eva-desktop/index.html:237-240`) → `input { height: 36px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); background: var(--surface-sunken); font-size: 13.5px }`, dentro de `.dt-aprender-bar` (línea 713) inline con los chips.
- **App:** `ClientExerciseCatalog.tsx:242-249` reutiliza el `<Input>` compartido (`components/ui/input.tsx:88` → `h-12` = **48px**, `border-[1.5px]`, `bg-surface-card`, texto `text-[15px]`) sólo acotado con `md:max-w-[360px] md:flex-1`.
- **Diferencia:** En desktop el campo de búsqueda queda **12px más alto (48 vs 36)**, sobre fondo `card` (no `sunken`), con borde 1.5px (no 1px) y tipografía 15px (no 13.5px) — lee notoriamente más pesado que la barra compacta del kit. **En mobile ambos usan el mismo primitivo `<Input>` → coincide 1:1** (este gap es desktop-only).
- **Fix:** En el branch `md:` del wrapper de search, o bien envolver en un contenedor `md:h-9 md:bg-surface-sunken md:border md:text-[13.5px]`, o exponer una variante `size="sm"`/`density="compact"` del `<Input>` para desktop que espeje `.dt-md-search`.

### [P2] Modal-detalle desktop: banner y chrome más grandes que el kit
- **Kit:** `.dt-vidbanner` height **190px** (`index.html:724`), `.dt-vidbanner-play` **60×60** (línea 725), `.dt-vidbanner-x` **36×36 top:14 right:14** (línea 726); `.dt-modal` `width: 620` (`desktop-coach.jsx:839`).
- **App:** `ClientExerciseCatalog.tsx:334` banner `h-[180px] md:h-64` (**256px** en desktop, +66px vs kit); play fallback `h-[58px] w-[58px]` (línea 415, 58 vs 60); close `h-[34px] w-[34px] right-3 top-3` (línea 423, 34/12 vs 36/14); modal `md:max-w-[600px]` (línea 329, 600 vs 620).
- **Diferencia:** El banner de media en desktop es ~66px más alto que el kit; play/close/ancho difieren 2-20px. Mobile coincide (banner 180px, play 58, close 34/top-12, sheet full-width). Desktop-only, cosmético.
- **Fix:** `md:h-[190px]` en el banner; `md:h-[60px] md:w-[60px]` en el play fallback; `md:right-3.5 md:top-3.5 md:h-9 md:w-9` en el close; `md:max-w-[620px]` en el `DialogContent`.

### [P2] Micro-spacing de vidcard en desktop (equip / tag / instrucciones)
- **Kit desktop:** `.dt-vidcard-equip` `margin-top: 3px` (`index.html:723`); `.dt-vidcard-tag` `padding: 2px 7px` (línea 720); `.dt-instr li` `font-size:14; line-height:1.5` (línea 728); `.dt-instr-n` `font-size:12` (línea 729).
- **App:** equip `mt-0.5` (2px, `ClientExerciseCatalog.tsx:174`); tag `px-1.5 py-0.5` (6/2px, línea 165); instrucciones `text-[14.5px] leading-[1.45]` (línea 453) y número `text-[13px]` (línea 455).
- **Diferencia:** Off-by-~1px en desktop (equip 2 vs 3, tag padding 6 vs 7, instr 14.5/1.45 vs 14/1.5, número 13 vs 12). **En mobile todos estos valores coinciden con el kit** (`alumno.jsx`: equip mt 2, instr 14.5/1.45, número 13) — la app usa los tokens mobile en ambos breakpoints y el kit desktop redondea distinto. Imperceptible; sólo para 1:1 estricto.
- **Fix (opcional):** agregar overrides `md:` que espejen los valores `.dt-*` de desktop, o aceptar como delta de densidad intencional.

### [P2] Media height / opacidad de tag en grid mobile (sub-pixel)
- **Kit:** card media `height: 92` (`alumno.jsx:674`); tag `background: rgba(0,0,0,0.35)` con `bottom:7 left:7` (línea 676).
- **App:** card media `h-24` = **96px** (`ClientExerciseCatalog.tsx:163`); tag `bg-black/40` (0.40) con `bottom-1.5 left-1.5` = 6px (línea 165).
- **Diferencia:** media +4px (96 vs 92), tag +5% opacidad (0.40 vs 0.35 — nota: el desktop del kit SÍ usa 0.4, la app unificó a 0.4), offset -1px. Nit puro.
- **Fix (opcional):** `h-[92px]` y `bg-black/35 bottom-[7px] left-[7px]` para clavar mobile; o dejar (el 0.40 alinea con el kit desktop).

---

Verificado 1:1

## Fix log (2026-07-02)

Implementado en `ClientExerciseCatalog.tsx` (mobile intacto 1:1):

- **[P1 CONFIRMED] Search desktop compact `.dt-md-search`** — el `<Input>` rich compartido hardcodea `h-12`/`bg-surface-card`/`border-[1.5px]` en un div interno que `className` no alcanza, y es primitivo cross-app (fuera de scope). Reemplazado por un field local que espeja EXACTO el look mobile del Input rich (48px · `border-[1.5px] border-border-default` · `bg-surface-card` · icono 18px · `text-[15px]` · focus ring sport) y añade overrides desktop: `md:h-9 md:border md:bg-surface-sunken md:px-3` + input `md:text-[13.5px]` + icono `md:size-4`. Import de `Input` removido (quedaba sin uso).
- **[P2] Modal-detalle desktop** — banner `md:h-64` → `md:h-[190px]`; play fallback `+md:h-[60px] md:w-[60px]`; close `+md:right-3.5 md:top-3.5 md:h-9 md:w-9`; `DialogContent` `md:max-w-[600px]` → `md:max-w-[620px]`.
- **[P2] Micro-spacing vidcard desktop** — tag `+md:px-[7px]`; equip `+md:mt-[3px]`.

No implementado (nits sub-pixel marcados "opcional"/"imperceptible" en el informe, y algunos en conflicto con el kit desktop): media mobile `h-24` vs 92, opacidad de tag 0.40 (el propio informe nota que 0.40 alinea con el kit desktop), y las micro-diferencias de `.dt-instr` (14.5/1.45 vs 14/1.5, número 13 vs 12).
