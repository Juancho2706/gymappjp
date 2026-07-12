# VERIFY/FIX — `directory-screen`

Fecha: 2026-07-12  
Fuente de verdad: responsive/PWA en `apps/web/src/app/coach/clients/**`.

## Resultado

Unidad cerrada a nivel código/spec. La pantalla RN vuelve a reproducir la jerarquía,
las dos vistas y los gestos visibles del directorio web móvil. No se tocó el árbol
del alumno.

## Fixes verificados

| Superficie | Web | RN final |
|---|---|---|
| Header | `CoachWarRoom.tsx:257-284` | Eyebrow uppercase 12, título 26 black, acciones soft 36; vive dentro del scroll (`clientes.tsx:283-294,584-614`). |
| Herramientas | `CoachWarRoom.tsx:287-306` | Card 20 px, shadow-xs, tile 38/11 y ramp SPORT scheme/brand-aware; chevron `ink-300` (`clientes.tsx:459-462,617-640`). |
| Orden vertical | WarRoom antes de `DirectoryActionBar` | Header → Herramientas → resumen/alertas → action bar → chips/conteo (`clientes.tsx:611-718`). |
| Action bar | `DirectoryActionBar.tsx:211-263` | Search ellipsis + Filtros/Orden/Vista 48 px; activo ink sólido; badge usa todos los chips; separador `border-strong` (`clientes.tsx:670-718`). |
| Vista cards | `ClientsDirectoryClient.tsx:298-311` | `FlatList` de `DirRowCard`, sin doble gutter (`clientes.tsx:784-820`). |
| Vista table | `DirTableMobile.tsx:9-207` | Tabla densa de 9 columnas, primera columna fija, scroll horizontal, header sortable, status/score/adherencia/peso/último/programa/días/acciones; lote inicial 48 + “Cargar más” (`clientes.tsx:143-279,821-860`). |
| Orden | `clientsDirectorySort.ts:4-7, ClientsDirectoryClient.tsx:132-146` | Nueva clave toma dirección default; tocar el mismo header alterna dirección. Se eliminó long-press oculto (`clientes.tsx:463-470,680-691,854-864`). |
| Acciones tabla | `DirTableMobile.tsx:187-200` + `ClientActionsSheet` | More abre el sheet existente y conserva todas las acciones/confirmaciones (`clientes.tsx:263-272,886-903`). |
| Zero state | `ClientsDirectoryClient.tsx:195-198` + `ClientsDirectoryEmpty.tsx` | Sin action bar ni FAB; conserva CTAs Crear/Importar. El vacío filtrado conserva Limpiar y sí mantiene FAB (`clientes.tsx:670,721-744,843-857`). |
| Frescura | RSC fresco por navegación | `useFocusEffect`; roster y pulse se cargan en paralelo y el roster no se pierde si falla pulse (`clientes.tsx:341-405`). |
| Score | `ClientsDirectoryClient.tsx:50-53` | Riesgo/orden/resumen consumen `pulse.attentionScore`; sin pulse usan 0, no el score local divergente (`clientes.tsx:415-432`). |
| Workspace | `clients.queries.ts:22-42` | Query RN scopea enterprise por `org_id`, team por `team_id`, standalone por ambos `NULL` (`clients-directory.ts:112-145`). |

## Decisiones

- Se reemplazó `ClientCard` + parallax por la tabla densa: era una sustitución RN
  sin equivalente PWA, no una mejora nativa necesaria.
- Se eliminó persistencia local de vista: web inicia en cards y no persiste el
  toggle entre montajes.
- Se mantiene un único FAB `Nuevo alumno`, igual que web. No se implementó el
  doble-FAB pendiente de decisión CEO.
- El endpoint pulse compartido todavía no resuelve métricas team; la web también
  entrega pulse vacío en ese contexto. RN limpia el pulse anterior y evita inventar
  un banner exclusivo. No se amplió backend dentro de esta unidad visual.

## Gates

- `pnpm exec tsc --noEmit` — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- `pnpm exec expo export --platform android` — PASS.
- Smoke visual device light/dark × EVA/custom — pendiente de build/device.
