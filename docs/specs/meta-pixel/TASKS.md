# TASKS — Meta Pixel + eventos de conversion

## Codigo (hecho)

- [x] `apps/web/src/lib/meta/pixel.ts` — `META_PIXEL_ID` saneado a digitos, tipos de `window.fbq`,
      `isMetaTrackableRoute` (excluye `/join`, `/c`, `/e`, `/t` sin comerse `/coach`),
      `trackMetaEvent` con espera acotada, `captureFbclidCookie` (`fb.1.<ms>.<fbclid>`, 90d, solo si
      hay fbclid real y la cookie no existe).
- [x] `apps/web/src/lib/posthog/consent.ts` — `CONSENT_CHANGE_EVENT` emitido en `setStoredConsent`
      para que el pixel se arme al aceptar el banner sin recargar.
- [x] `apps/web/src/components/meta/MetaPixel.tsx` — `<Script afterInteractive>` con `fbq('init')` +
      UN `PageView`, gateado por consentimiento/env/ruta, mas `MetaRouteTracker` (`usePathname` +
      `useSearchParams` bajo `<Suspense>`) que salta el primer render.
- [x] `apps/web/src/app/layout.tsx` — `<MetaPixel />` dentro de `PostHogProvider`, junto a
      `<CookieConsent />`.
- [x] `apps/web/src/components/meta/MetaTrackEvent.tsx` — dispara un evento estandar al montar, con
      `eventID` opcional para dedup.
- [x] `apps/web/src/app/pricing/page.tsx` — `ViewContent` con `content_name: 'pricing'`.
- [x] `apps/web/src/lib/meta/capi.ts` — helper server-only: SHA-256 normalizado, `fbp`/`fbc` en
      claro, contexto del request (cookies `_fbp`/`_fbc`, `x-forwarded-for`, `user-agent`),
      POST a Graph `v21.0`, no-op si falta `META_CAPI_TOKEN`, diferido con `after()`.
- [x] `apps/web/src/app/(auth)/register/_actions/register.actions.ts` — `CompleteRegistration` por
      CAPI (`em` + `external_id` hasheados) antes de cada redirect + `&eid=` al redirect de
      `/verify-email`.
- [x] `apps/web/src/app/(auth)/verify-email/page.tsx` — espejo browser
      `fbq('track','CompleteRegistration', {}, { eventID: eid })`, solo si `eid` viene en la URL.
- [x] `.env.example` — `NEXT_PUBLIC_FB_PIXEL_ID` y `META_CAPI_TOKEN` documentados.
- [x] `docs/specs/meta-pixel/{SPEC,PLAN,TASKS}.md`.

## Gates corridos

- [x] `pnpm --filter @eva/web exec tsc --noEmit` → VERDE.
- [x] `pnpm --filter @eva/web exec eslint <archivos tocados>` → VERDE (0 problemas).

## Pendiente (fuera de codigo / fase 2)

- [ ] Setear `NEXT_PUBLIC_FB_PIXEL_ID=1586483219694806` en Vercel (preview + prod).
- [ ] Generar el token CAPI desde un **System User** de Business Settings y cargarlo como
      `META_CAPI_TOKEN` (server-only, NUNCA `NEXT_PUBLIC_`). Sin el, CAPI no envia nada.
- [ ] Activar **Automatic Advanced Matching** en Events Manager.
- [ ] Verificar con **Test Events** + **Meta Pixel Helper** en produccion: `PageView` en cada
      navegacion SPA, `ViewContent` en `/pricing`, y **UN solo** `CompleteRegistration` marcado
      Browser + Server (deduplicado), no dos.
- [ ] Confirmar **EMQ >= 6.0** en `CompleteRegistration`.
- [ ] Fase 2: `Subscribe` por CAPI desde el webhook de MercadoPago/Flow (`@/lib/meta/capi` ya lo
      soporta: `eventName: 'Subscribe'`, `customData: { value: 30000, currency: 'CLP' }`).
- [ ] Fase 2: `InitiateCheckout` en el click de plan de `/pricing` y `StartTrial`.
- [ ] Evaluar espejo browser de `CompleteRegistration` para el flujo de tier PAGO (hoy solo CAPI).
