# SPEC — Meta Pixel + eventos de conversion (web)

## Problema

EVA va a invertir en Meta Ads (10-30 USD/dia) y hoy no existe ninguna integracion de Meta en el
repo. Sin dataset instalado no hay evento de optimizacion, y optimizar hacia un evento que no llega
es la forma mas rapida de quemar el presupuesto completo.

## Objetivo

Instalar el Meta Pixel (dataset `1586483219694806`) en `apps/web` y emitir los eventos de conversion
necesarios para que la campana optimice por **CompleteRegistration**, con calidad de matching (EMQ)
suficiente para que las conversiones se atribuyan.

Fuente: `private/marketing/meta-ads-research/informe-tecnico.md` (§4.2-4.6) e
`informe-conversion.md` (§3).

## Alcance

1. **Pixel gateado por consentimiento.** El script solo carga si `getStoredConsent() === 'accepted'`
   (`@/lib/posthog/consent`, misma puerta que PostHog). Ley 21.719 en vigencia 2026-12-01: los
   pixeles de seguimiento estan explicitamente en alcance. Sin `NEXT_PUBLIC_FB_PIXEL_ID` no se
   renderiza nada — no hay ID hardcodeado.
2. **PageView.** El snippet dispara UNO inicial; un tracker SPA (`usePathname` + `useSearchParams`
   bajo `<Suspense>`, patron de `PostHogProvider`) dispara los siguientes. Nunca ambos en el primer
   render.
3. **Exclusion de superficies de alumno / white-label.** Cero eventos en `/join`, `/c`, `/e`, `/t` y
   subrutas: no son la audiencia del ad y contaminan lookalikes.
4. **Captura de `fbclid`.** Cookie first-party `_fbc` = `fb.1.<ms>.<fbclid>`, 90 dias, solo si hay
   `fbclid` real y solo si la cookie no existe. Nunca se fabrica un `fbc`.
5. **Eventos.**
   - `ViewContent` (`content_name: 'pricing'`) en `/pricing`.
   - `CompleteRegistration` **server-side (CAPI)** desde el Server Action de registro + **espejo en
     el browser** en `/verify-email` con el mismo `event_id` (dedup de Meta = `event_name` +
     `event_id`, ventana 48h).
6. **Helper CAPI reutilizable** (`@/lib/meta/capi`) listo para sumar `Subscribe` desde el webhook de
   MercadoPago/Flow (fase 2), que es el evento que el browser mas pierde.

## No-objetivos (esta tanda)

- `InitiateCheckout`, `StartTrial`, `Subscribe`: quedan para la fase 2.
- Verificacion de dominio (`facebook-domain-verification` en metadata) — es tramite de Business
  Settings, se hace por DNS TXT.
- Automatic Advanced Matching: se activa en Events Manager, no en codigo.

## Invariantes

- Moneda siempre `'CLP'`, valores **enteros** (CLP no tiene decimales).
- `fbp` / `fbc` **jamas** se hashean. Los identificadores (`em`, `external_id`) se normalizan
  (trim + lowercase) antes del SHA-256.
- `META_CAPI_TOKEN` es server-only. Si falta, CAPI es no-op silencioso.
- Meta **nunca** puede bloquear ni romper un registro: el POST es fire-and-forget y no lanza.
- Sin dependencias nuevas: `node:crypto`, `fetch`, `next/script`, `next/server#after`.
- `MetaPixel` / `MetaTrackEvent` son client components aislados; no se re-exportan por barrels.
