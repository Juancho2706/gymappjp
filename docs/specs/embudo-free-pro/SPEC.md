---
status: active
owner: product-engineering
last_verified: "2026-09-05"
canonical: false
---

# SPEC — Embudo Free → Pro («El camino a Pro» v2): venta afuera, verdad adentro

**Estado: APROBADA por el owner el 2026-08-21 (artifact «El camino a Pro» `ca4a3741`). EN EJECUCIÓN por waves; W0+W1 primero, aprobación del owner antes de W2.**

## Origen y alcance

Investigación del 21-08 (compliance de tiendas + números reales de LIVE). Decisiones del owner, **cerradas, no se
reabren**:

1. **IAP / StoreKit descartado.** El rail de cobro sigue siendo la web con MercadoPago y Flow.
2. **iOS: CERO** botón, link, URL, precio, tier ajeno o texto que lleve a pagar. Ni un botón que dispare un correo.
   Ni renombrar rutas (Apple cita comportamiento, no URLs, y navega la web).
3. **Android: UNA línea sin link** — «Los cambios de plan se hacen en eva-app.cl» — porque Google publica como
   aceptable para apps *consumption-only* la frase «Go to our website to upgrade your subscription to Premium».
   Split por `Platform.OS`, **nunca** por storefront.
4. **Correo y WhatsApp sin límites**: ahí viven precio, link y oferta (3.1.3 lo autoriza; consentimiento + baja).
5. `starter` se retiró del proyecto el 2026-09-05 ([retiro-starter-y-enterprise](../retiro-starter-y-enterprise/SPEC.md)). El cobro coach→alumno es otro plan (artifact «La escalera del cobro» `49fd620e`).

Fuera de alcance: IAP, cambios de catálogo/precio (ver [pricing-v3](../pricing-v3/SPEC.md)), mensajería in-app.

## Los números que ordenan el plan (LIVE, 21-08-2026)

47 coaches (40 free + 7 pro) · 6 pagando activos · MRR 173.942 CLP · **8 cobros en toda la historia** ·
23/40 free con **cero alumnos** (57,5 %) · **15 free en o sobre su cupo hoy** · 0 add-ons autoservicio · 2 cupones.
**7/7 pagadores tienen alumnos; 0/23 con cero alumnos paga.** El cuello no es el checkout: es la activación.

El correo de venta por cupo (`sendClientLimitReachedEmail`) existe, está desplegado, tiene kill-switch
(`EVA_SALES_EMAILS_DISABLED`) y dedupe por cooldown contra `admin_audit_logs` — y **se ha enviado cero veces**:
solo dispara cuando el coach INTENTA agregar y es rechazado; nadie barre a los que ya están arriba.

## Diseño: cuatro capas

```text
CAPA 1  · iOS       SOLO ESTADO. Cero botón, cero URL, cero precio, cero tier ajeno.
CAPA 1' · ANDROID   estado + UNA línea sin link («Los cambios de plan se hacen en eva-app.cl»).
CAPA 2  · DISPARADORES SERVER-SIDE sin UI que los invoque:
          cupo alcanzado (evento) · cupo alcanzado (cron diario con escalera) <- NUEVO
          D+1 · D+2 · D+7 · D+14 · pago rechazado · reactivación
CAPA 3  · CANAL EXTERNO  correo (Resend) + WhatsApp: precio, link, oferta.
CAPA 4  · RETORNO   el correo aterriza logueado en el checkout (?next=) ->
          «Actualizar estado» en la app -> entitlements frescos -> la app celebra el cambio.
```

## Reglas de producto

1. **El correo lo dispara el servidor cuando pasa algo; nunca el dedo cuando quiere algo.**
2. **Un mismo evento, un mismo ledger.** Todo envío del correo de cupo (evento o cron) escribe
   `coach.sales_email_client_limit_reached` en `admin_audit_logs` con `payload.source` y `payload.current_limit`.
3. **Cadencia del barrido (cron `cap-nudge`)**: máximo **3 toques por nivel de cupo** — T0, T0+7 d, T0+28 d —
   y después silencio hasta que cambie `max_clients` (subir de plan o grandfather). El cooldown de 7 días del
   service es la segunda barrera (cubre el cruce evento↔cron). Razón: con Free = 1, 11 coaches con 1 alumno están
   «en cupo» de forma permanente; un correo semanal eterno es spam y quema el dominio.
4. **Variante de copy por gatillo**: `attempt` (el coach intentó y fue rechazado: copy actual) y `sweep`
   (barrido: «ya tienes tu cupo ocupado; el próximo alumno que quieras sumar no va a entrar»). Jamás decir
   «intentaste agregar» a quien no intentó.
5. **Precios en correos: solo catálogo-driven, nunca literales.** Los correos de VENTA por evento (`sales-templates`)
   y los transaccionales no llevan precio (`assertNoPrices`); los únicos correos que lo muestran son los que
   venden explícitamente (drip `day2_pro`/`day14_last_call`, avisos de fin de trial) y SIEMPRE desde
   `TIER_CONFIG.<tier>.monthlyPriceClp` formateado es-CL, pinneado por test (`assertOnlyCatalogPrice`). Un precio
   escrito a mano en cualquier plantilla es un bug. Cupos siempre vía `studentCountLabel`.
6. **Fail-open por coach, fail-closed del ledger**: un 500 de Resend o una excepción en un coach no abortan la
   corrida (`try/catch` por coach, `failed`/`errors` en el resumen). Pero si el ledger `admin_audit_logs` **no se
   puede leer, el barrido aborta sin enviar nada** (500 + resumen con `ledger_unreadable: true`): con el mapa vacío
   todos vuelven a `first_touch` y la única barrera que queda es el cooldown de 7 d ⇒ spam semanal eterno. Perder un
   día de nudges no cuesta nada. El resumen `cron.cap_nudge_ran` se escribe siempre (`finally`).
7. **Cuentas de prueba excluidas** del barrido por `isTestCoachEmail` (misma fuente que finanzas).
8. **Identidad por `uid`, nunca por email tipeado** en cualquier reenvío (W4). `generateLink({type:'magiclink'})`
   crea usuarios: no se acepta email suelto.
9. **`?next=` solo con allowlist** de rutas internas (`/coach/...`), nunca URL absoluta ni `//`.
10. **Todo lo que toca `packages/tiers` va en un solo OTA** a los tres runtimes (1.1.0 / 1.1.1 / 1.1.2),
    android e ios por separado, desde rama con master mergeado.

## Experiencia RN (mejora pedida por el owner el 21-08: «lo mejor y más visual posible»)

Principio: **la app dice la verdad, la hace visible y celebra el cambio** — sin vender. Ninguna de estas piezas es
un CTA de compra; son estado y acciones reales dentro del producto.

| Pieza | Dónde | Qué se ve | iOS | Android |
|---|---|---|---|---|
| **Medidor de cupo** | roster de alumnos + Mi plan | anillo/barra «1 de 1 alumnos activos», color semántico (marca <80 %, ámbar ≥80 %, lleno al 100 %), sin números de otros planes | ✓ | ✓ |
| **Muro de cupo rediseñado** | `CreateClientModal` | sheet con ícono, «Alcanzaste el cupo de tu plan», «Tu plan actual permite N alumno(s) activo(s)», acciones **[Archivar un alumno]** (abre selector de activos, archivado reversible, «su historial se mantiene intacto») y **[Entendido]** | sin línea extra | + «Los cambios de plan se hacen en eva-app.cl» (texto plano, `Platform.OS === 'android'`) |
| **Mi plan = verdad** | `subscription.tsx` | etiqueta del tier desde `@eva/tiers` (no `TIER_LABELS` a mano), cupo real (columna), activos/archivados, módulos incluidos con check (arreglo del predicado), «Actualizar estado» con pull-to-refresh + «Actualizado hace X» | sin precios ni tiers ajenos | ídem + la línea |
| **Celebración del cambio** | al refrescar entitlements | si el tier sube o el cupo crece: tarjeta «Tu cupo subió a 25 alumnos» con micro-animación motion-safe y el sello «Hecho con EVA» desapareciendo del preview | ✓ (es estado) | ✓ |
| **Dudas** | `subscription.tsx` | «¿Dudas con tu cuenta?» tocable (`mailto:`), no «plan» | ✓ | ✓ |
| **Tono** | `ProgresoTab`, `BuilderDayStrip`, `verify-email` | «Mejorar mi plan» → «Ver mi plan» | ✓ | ✓ |
| **Retorno web→app** | página de éxito del checkout web | botón «Abrir EVA en el teléfono» (universal link a `/coach/subscription`) — web→app es legal | — | — |

Detalle archivo:línea en `TASKS.md` §W5/§W6 (mapa verificado contra `rnmobiledenuevo`).

## Colisiones que fijan el orden (7)

| # | Colisión | Consecuencia |
|---|---|---|
| C1 | Los 4 call sites del correo de cupo son `void` (precedente de pérdida: `auth/confirm/route.ts:49`) | W0 antes que W1: el cron no sirve si el evento se pierde |
| C2 | El correo de cupo aterriza en el dashboard, no en el checkout | W3 (`?next=`) sube del 5º al 3º lugar |
| C3 | `templateByKey` cae a `''` en silencio | endurecer ANTES de tocar copys del drip (W2) |
| C4 | Drip agendado a 14 días en Resend sin ledger local | purga manual de la cola en el dashboard de Resend (W2) |
| C5 | El guard anti-precios en rojo sobre el drip viejo | guard + rediseño en el mismo PR (W2) |
| C6 | Todo `packages/tiers` exige OTA a 3 runtimes | W5 y W6 salen en un solo OTA |
| C7 | `proxy.ts` sin tests | tests de `safeNext` antes del cambio (W3) |

## Waves (resumen; detalle en PLAN.md y TASKS.md)

W0 desatascar (1,5 h) · **W1 `cap-nudge` (4 h)** · W2 canal correo (8 h) · W3 `?next=` (3 h) · W4 alta móvil (5 h) ·
W5 `packages/tiers` + OTA (7 h) · W6 verdad y visual en la app (4 h + RN visual) · W7 blindar + PostHog (3 h) ·
W8 activación (opcional, decisión del owner).

## Métricas de éxito

- `coach.sales_email_client_limit_reached` pasa de 0 a ≥15 filas en la primera corrida (con `source: cron_cap_nudge`).
- PostHog: `checkout_started` con `utm_source=cap_email` > 0 en 14 días; `coach_registered.platform` poblado.
- Cero rechazos de App Review por 3.1.1 en 1.1.2+.

## Gatillos para reconsiderar IAP (todos a la vez)

≥60 pagadores 3 meses · ≥40 % de altas desde iOS · ≥50 correos de cupo sin resultado · contrato ADP a nombre de
EVA SpA. Nunca si a 24 meses hay <30 pagadores. Excepción: rechazo 3.1.1 no revertido tras consulta 1-a-1.

## Referencias

- Artifact «El camino a Pro» `ca4a3741-6ab7-4a86-9c4a-078cec27f0c6` (plan v2, copys, colisiones).
- `docs/research/cta-pagos-externos-stores-2026-07-31.md` §6 (histórico; la regla vigente sube a `apps/mobile/AGENTS.md` en W7).
- [pricing-v3](../pricing-v3/SPEC.md) · [Runbook](../../operations/RUNBOOK.md#crons-activos).
