# E8-01 · Barrido de paridad — Coach: Settings + Módulos + Auth

Revisor de paridad RN 1:1 vs referencia web móvil (md<760). Solo lectura de código.
Fecha: 2026-07-09. Rama `rnmobiledenuevo`. Referencia: research/04-05 + código web `apps/web/.../coach`.

Veredicto global: **paridad muy alta**. 0 GAP-mayor. Los desvíos son cosméticos o
decisiones de IA móvil / money-safety documentadas en el propio código.

| Pantalla | Archivo RN | Veredicto | Detalle |
|---|---|---|---|
| Hub Opciones | `app/coach/(tabs)/settings.tsx` | OK / GAP-menor | IdentityHero + secciones (Personalización/Equipo/Plan/Config/Cuenta) 1:1 con bloque `md:hidden` web (settings/page.tsx). Badge "Pro" en Mi Marca si `!brandingOk` presente. **GAP-menor:** footer dice "Ejercicio Virtual Avanzado · v2.4" vs web "EVA · v2.4" (L279). **GAP-menor (IA):** Apariencia (ThemeToggle), DangerZone y SignOut NO viven en el hub — movidos al tab "Mi cuenta"/perfil (L263-270); web los tiene inline. Decisión móvil deliberada. |
| Mi Marca (base) | `app/coach/settings/brand.tsx` | OK | Brand score+dirty, live preview con glow, logo 2 slots, identidad (código permanente + slug legacy read-only), bienvenida login + modal dashboard (texto/video), ThemeGallery por feel, color+matices+hex+contraste WCAG, `use_brand_colors_coach`, login layout (4), QR+share, gate tier upsell (L371). 1:1 con BrandSettingsForm. |
| Mi Marca (avanzado) | `app/coach/settings/brand.tsx` L788+ | OK / GAP-menor | Acordeón PRO: secundario, fuente (Select), tinte, acento por modo, variante loader (7) con previews en vivo `@eva/brand-kit`. **GAP-menor:** sin `splash` (BrandAdvancedSection lo tiene); loader icon mode presente. |
| Funciones | `app/coach/settings/features.tsx` | OK | Preset (Básico/Inter/Pro) + master switch `_enabled` + acordeón secciones con badge Base/Pro + lock Pro→web `#addons`. ManagedLock + ReadOnlyBanner (team no-gestor). Borrador local + Guardar/Descartar + explainer Módulos-vs-Funciones. 1:1 con FeaturePrefsPanel. |
| Áreas del builder | `app/coach/settings/areas.tsx` | OK | Lista system read-only + propias, crear (≥2 chars), editar inline (nombre+orden), eliminar 2 pasos, lock banner por scope, empty/error/loading states. 1:1 con AreasManager. |
| Mi Equipo | `app/coach/settings/team.tsx` | OK | Hero inverse (logo/rol/pool/accesos login+invite/stats anillo cupos), Brand Studio subset (nombre+color; logos/loader web-only, documentado), Miembros (agregar/co-gestor/remover 2 pasos), empty-states (sin team / no cargó). 1:1 variante móvil web. |
| Suscripción | `app/coach/(tabs)/subscription.tsx` | OK / GAP-menor | Plan actual inverse (tier+total+desglose+tarjeta), avisos dunning/cancel/expired con link-out, add-ons con estados EXACTOS (cortesía/activo/baja/Pro+), historial, managed lock. **GAP-menor (money-safety by design):** sin CouponRedeemCard, sin selector cambiar-plan (ciclo+tier cards), sin panel cancelar — todo link-out a web (§E spec). Display completo. |
| Reactivate | `app/coach/reactivate.tsx` | OK | Muro por estado (canceled/paused/past_due/expired), plan anterior, aviso alumnos en pausa, CTA link-out + logout. 1:1 con /coach/reactivate. |
| Herramientas | `app/coach/tools.tsx` | OK | Launcher solo módulos ENTITLED, empty 0-módulos→catálogo, picker single-alumno para bodycomp con empty 0-alumnos (no crash, memoria module_page_crash). Sin equivalente web-móvil directo pero coherente. |
| Módulos (catálogo) | `app/coach/modules.tsx` | GAP-menor | Read-only, 4 cards con estado Activo/De pago, pitch+superficies+alcance, precio, CTA link-out `#addons`. **GAP-menor:** CTA NO es context-aware (web: team no-gestor "Pídelo al owner", team gestor mailto, standalone flag-OFF mailto) — RN siempre "Agregar"→ADDONS_URL. Falta aviso `killedByOperator` (mantenimiento) y cross-link a Funciones para nutrition_exchanges. Back label "Ajustes" (resto usa "Opciones"). |
| Cardio | `app/coach/cardio/index.tsx` | OK | SegmentedControl Zonas/Pace/Plantillas, cálculo puro `@eva/cardio`, ModuleOffNotice, empty 0-alumnos cae a manual (no crash). 1:1 con CardioToolsClient. |
| Movement | `app/coach/movement/index.tsx` | OK | Lista con PriorityBadge + score/21 + fecha o "Sin screening", badge borrador, CTA Evaluar/Retomar, disclaimer, ModuleOffNotice, empty 0-alumnos. 1:1 con MovementHubList. |
| Body composition | `app/coach/bodycomp/[clientId].tsx` | OK | Tabs BIA/ISAK/Tendencias, ISAK wizard 4 pasos + autosave + IsakResultCard preview puro, series por método sin mezclar, ModuleOffNotice, mutaciones server-side. 1:1 con BodyCompositionTabB6b. |
| Auth login coach | `app/(auth)/login.tsx` | OK | Login coach genérico (hero panel + Google Sign-In nativo + remember + forgot + crear cuenta). Rama alumno white-label (4 layouts) también. 1:1. |
| Auth register coach | `app/(auth)/register.tsx` | OK | Wizard 3 pasos, tiers radio-cards (free registrable + pagos referencia web-only), Google onboarding mode, consentimientos legal/health. Money-safety = solo free in-app. 1:1 con delta §4.2. |

## Notas
- No se detectó ningún token legacy ni lenguaje pre-DS en el dominio revisado (grep visual OK).
- Todos los módulos de pago replican el gate server + `ModuleOffNotice` y NO heredan el crash web
  con 0 alumnos (memoria `project_module_pages_crash_no_clients`).
- Money-safety consistente: todo cobro/cambio de plan/tarjeta/add-on es link-out al navegador.
