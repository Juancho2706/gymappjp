# E8-01 — Barrido de paridad COACH CORE (RN vs web md)

Dominio: dashboard, directorio de clientes, ficha completa (hero + 5 tabs + dossier + herramientas + composicion).
Referencia: `apps/web` rama `md:hidden` + inventario `research/04-web-coach-core.md`.
Fecha: 2026-07-09. Solo lectura.

| Pantalla / seccion | Veredicto | Detalle (archivo:linea) |
|---|---|---|
| **Dashboard — estructura** | OK | `app/coach/(tabs)/home.tsx` — orden 1:1 con `DashboardShell` md: billing banners → tier banners → greeting header → PulseHero → FocusList (Prioridad+NextStep) → agenda → Novedades → onboarding chip → FAB. Loading/error/refresh presentes (L55-88). |
| Dashboard — header (Insights/campana/switcher) | OK | `CoachDashboardSections.tsx:1747` `MobileGreetingHeader` con Insights + `CoachNewsBell` (badge unread, sheet, L1973) + avatar/WorkspaceSwitcher (`useWorkspace`, caret si >1, L1759-1821). 1:1 con NewsBellButton + HeaderBrandTile web. |
| Dashboard — TeamsBridge gate | GAP-menor | `home.tsx:92` wrapper `showTierBanners` usa `totalClients >= 48` (umbral viejo); el banner interno ya guarda `>= 80` (`CoachDashboardSections.tsx:209`). El 48 quedo muerto/inconsistente, comportamiento final correcto. |
| **Directorio — action bar + filtros** | OK | `app/coach/(tabs)/clientes.tsx` — search, filter sheet (status), sort sheet + dir toggle (longpress), view cards/list, chips activos, resultCount+sortLabel, tools link gateado por `toolsEnabled` (L83, L316). Espeja `DirectoryActionBar`. |
| Directorio — WarRoom / banners / empty | OK | `DirectorySummary` (espejo CoachWarRoom, L235) + alert banners urgent/expired/sync/nutrition_low con dismiss (L243-254) + pulseError retry (L255) + empty contextual (L286). |
| Directorio — cards + FAB | OK | `DirRowCard`/`ClientCard` con pulse, acciones (whatsapp/share/toggle/reset/delete), FAB "Nuevo alumno" + FAB Importar (L402-420). |
| Directorio — import wizard | GAP-menor | Web = wizard 4 pasos (`/clients/import` Upload→MapColumns→Preview→Confirm). RN = `ImportClientsForm` en `NativeDialog` (paste CSV, un paso, L448). Funcion presente pero sin mapeo de columnas ni preview. |
| **Ficha — hero** | OK | `cliente/[clientId].tsx:261` `ClientHero`: eyebrow programa·semana, nombre, status (deriveClientStatus), chips 2×2 (peso/adherencia/workouts/comidas), racha/ultima act/desde/edad entreno, Export PDF (L234 `exportClientDossierPdf` + share nativo) + ⋮ ActionSheet. |
| Ficha — chrome tabs + floating | OK | `ClientTabBar` 5 pills scrollables label-only con badges (L222-228); `ProfileFloatingActions` solo WhatsApp, encoge al scroll (L299, compact L167). Facturacion removida (RULING D2) igual que web. |
| Ficha — tab Resumen | OK | `OverviewTab.tsx` — Cumplimiento semanal, Actividad año, Programa activo, Evolucion fotos, Herramientas (cardio/movimiento/bodycomp gateados por `hasModule`, L228-281), Ultimo check-in, Biometria editable. |
| Ficha — tab Progreso | OK | `ProgresoTab.tsx` — Evolucion peso (con goal ref), IMC, Energia 7d, Composicion corporal (gate body_composition), Historial check-ins. |
| Ficha — tab Entreno | OK | `AnalisisTab.tsx` — WeeklyPRBanner, Balance muscular radar, Volumen por grupo, Tonelaje diario + media movil, PRs de fuerza, day detail. |
| Ficha — tab Programa | OK | `PlanTab.tsx` — Programa (semanal/ciclico), dias colapsables (DayCard, rest/bloques), deep-link a builder. |
| Ficha — tab Nutricion | **GAP-mayor** | `NutricionTab.tsx` cubre Zona A (adherencia 7/30d, racha, rings hoy, macros) y Zona B (plan activo, calorias vs objetivo, day detail comidas colapsables, habitos). **Falta Zona C (coach): nota privada del coach, hilo bidireccional de comentarios del dia, editor de umbrales de micros (nutritionProEnabled) y panel override "Funciones para este alumno" (tri-state por seccion).** Confirmado ausente en `clientDetail` y `coach-client-detail.ts`. Solo hay alertas derivadas read-only. |
| Ficha — dossier PDF | OK | `lib/client-dossier-pdf.ts` + `exportClientDossierPdf` (share nativo en vez de descarga navegador; excepcion de plataforma esperada). |
| Ficha — subruta composicion | OK | `app/coach/bodycomp/[clientId].tsx` con `@eva/bodycomp` computeIsak, Bia/Isak capture + trend + result, gateado por entitlement. |

## Notas de tokens
- GAP-menor transversal (charts/tabs de ficha): `NutricionTab.tsx` usa hex hardcodeados (`#EF4444`, `#F59E0B`, `#8B5CF6`, `#F43F5E`, `#10B981`) y families literales (`Archivo_700Bold`, `HankenGrotesk_700Bold`) en vez de tokens `theme.*`/`FONT`. Consistente con el resto de charts mobile; no legacy roto, higiene.

## Resumen de veredictos
- OK: 12 secciones (dashboard completo, directorio nucleo, hero, 4 de 5 tabs, dossier, composicion).
- GAP-menor: 3 (umbral TeamsBridge muerto 48 vs 80; import sin wizard de mapeo; hex/fonts hardcode en nutricion).
- GAP-mayor: 1 (Zona C coach de nutricion ausente: nota privada, hilo comentarios, umbrales micros, override "Funciones para este alumno").
