# PLAN — Meta Pixel + eventos de conversion

## Arquitectura

```
apps/web/src/lib/meta/pixel.ts        (browser)  ID saneado · tipos fbq · gate de rutas · trackMetaEvent · captureFbclidCookie
apps/web/src/lib/meta/capi.ts         (server)   hash SHA-256 · contexto del request · POST Graph v21.0 · queueMetaCapiEvent
apps/web/src/components/meta/
  MetaPixel.tsx        'use client'   <Script afterInteractive> + MetaRouteTracker (Suspense)
  MetaTrackEvent.tsx   'use client'   dispara UN evento al montar (usable desde Server Components)
```

## Decisiones

1. **Gate de consentimiento por evento DOM.** `setStoredConsent` (en `@/lib/posthog/consent`, unica
   fuente de verdad del banner) emite `eva:consent-change`. `MetaPixel` escucha y se arma en el acto
   al aceptar, sin recargar. `localStorage` no notifica en la misma pestana (el evento `storage` es
   cross-tab), por eso la notificacion es explicita. Es el cambio minimo coherente con el codigo
   existente y no altera el comportamiento de PostHog.

2. **Latch `armed`.** El script se monta cuando se cumplen las 3 condiciones (env var + consent +
   ruta trackeable) y **no se desmonta**. Motivo: `next/script` no re-ejecuta un inline con el mismo
   `id`, asi que desmontarlo al pasar por `/c/...` perderia el `PageView` del regreso. El filtro de
   rutas vive en el tracker de eventos, no en el ciclo de vida del script.

3. **PageView sin doble conteo.** El snippet dispara el inicial; `MetaRouteTracker` salta su primer
   effect con un `useRef` y solo emite en cambios posteriores de ruta/query.

4. **`trackMetaEvent` con espera acotada.** Los eventos de pagina pueden montarse antes de que el
   `<Script afterInteractive>` ejecute. En vez de perderse, reintentan cada 250ms hasta ~5s; si no
   hubo consentimiento, `fbq` nunca aparece y el helper muere en silencio.

5. **CAPI dentro del Server Action, no un endpoint nuevo.** El action ya corre en servidor, ya tiene
   el email en claro y acceso a cookies/headers. Se recolecta el contexto del request en linea y el
   POST se difiere con `after()` de Next (corre despues de enviar la respuesta) → el usuario nunca
   espera a Meta. Fallback a fire-and-forget si `after()` no esta en scope.

6. **`event_id` unico por registro** generado con `randomUUID()`, mandado al servidor (`event_id`) y
   al browser (`?eid=` → `fbq(..., { eventID })`).

## Pasos

1. `lib/meta/pixel.ts` — helpers de navegador. ✔
2. `lib/posthog/consent.ts` — emitir `CONSENT_CHANGE_EVENT` en `setStoredConsent`. ✔
3. `components/meta/MetaPixel.tsx` + montaje en `app/layout.tsx` junto a `<CookieConsent />`. ✔
4. `components/meta/MetaTrackEvent.tsx` + `ViewContent` en `/pricing`. ✔
5. `lib/meta/capi.ts` — helper server-only reutilizable. ✔
6. `register.actions.ts` — `CompleteRegistration` por CAPI + `&eid=` en el redirect. ✔
7. `/verify-email` — espejo browser con el mismo `event_id`. ✔
8. `.env.example` — `NEXT_PUBLIC_FB_PIXEL_ID` + `META_CAPI_TOKEN`. ✔
9. Gates: `tsc --noEmit` de `@eva/web` + eslint sobre los archivos tocados. ✔

## Riesgos

- **Registro de tier PAGO** redirige a `/coach/subscription/processing`: no hay espejo browser, ese
  `CompleteRegistration` entra **solo** por CAPI (y por ahora, sin token, no entra). Aceptado: el
  volumen del funnel de ads es free-first.
- **`fbclid` antes de aceptar cookies**: la cookie `_fbc` solo se escribe una vez armado el pixel.
  Es la eleccion conservadora bajo Ley 21.719; el fbclid sobrevive en la URL hasta que el usuario
  decide, asi que solo se pierde si rechaza (en cuyo caso no queremos trackearlo igual).
- **StrictMode en dev** remonta `MetaTrackEvent` → `ViewContent` puede verse dos veces en local. No
  ocurre en produccion.
