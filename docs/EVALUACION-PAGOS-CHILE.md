# Evaluación de Plataformas de Pago para Chile — EVA Fitness

> **Generado:** 2026-04-16 America/Santiago
> **Contexto:** EVA es un SaaS de suscripción recurrente mensual/anual en CLP. El motor de pagos actual usa MercadoPago (pre-approvals). Este documento evalúa alternativas y analiza los límites reales de MP a escala.

---

## Índice

1. [Estado actual — MercadoPago y sus límites](#1-estado-actual--mercadopago-y-sus-límites)
2. [Transbank / WebPay](#2-transbank--webpay)
3. [Flow.cl](#3-flowcl)
4. [Stripe](#4-stripe)
5. [Kushki](#5-kushki)
6. [Khipu](#6-khipu)
7. [Comparativa técnica y de negocio](#7-comparativa-técnica-y-de-negocio)
8. [Recomendación para EVA](#8-recomendación-para-eva)
9. [Cómo integrar un nuevo proveedor en el código](#9-cómo-integrar-un-nuevo-proveedor-en-el-código)

---

# 1. Estado actual — MercadoPago y sus límites

## 1.1 Cómo usa EVA MP hoy

EVA usa **MP Pre-approvals** (suscripciones recurrentes). El flujo es:
1. Coach elige plan → EVA llama a `POST /preapproval` en MP → obtiene `init_point` (URL de pago)
2. Coach paga en la UI de MP → webhook notifica a EVA → EVA activa la cuenta
3. MP cobra automáticamente cada mes/año usando el preapproval activo

El código está en `src/lib/payments/providers/mercadopago.ts` e implementa la interfaz `PaymentsProvider`.

## 1.2 Límites reales de MercadoPago Chile

Este es el punto crítico que preocupa con razón:

### Límites de cuenta nueva (sin verificar)
| Límite | Valor aproximado |
|--------|-----------------|
| Saldo disponible acumulable | $200.000–$500.000 CLP hasta completar verificación |
| Retiros a cuenta bancaria | Bloqueados hasta completar KYC |
| Preapprovals activos simultáneos | Sin límite documentado, pero MP puede congelar cuentas con volumen inusual |
| Volumen mensual sin documentación | ~$1.000.000–$2.000.000 CLP antes de que MP solicite docs |

### Proceso de verificación requerido
Para operar a escala como negocio SaaS, MP Chile requiere:
- ✅ RUT (persona natural o empresa)
- ✅ Cuenta bancaria chilena verificada
- ✅ Fotos de cédula/pasaporte
- ✅ Comprobante de domicilio
- ✅ En algunos casos: declaración de actividad económica

**Sin esto**, al llegar a ~30-50 coaches pagando, MP puede congelar fondos o pedir documentación urgente. Con documentación completa, el límite sube significativamente.

### Límites de cuenta verificada
| Límite | Valor |
|--------|-------|
| Volumen mensual | Sin límite explícito documentado para MCC estándar |
| Preapprovals activos | Miles (MP tiene SaaS chilenos procesando millones) |
| Retiro de fondos | 2-4 días hábiles, automático |
| Soporte | Solo por chat/email, sin account manager salvo a partir de ciertos volúmenes |

### Riesgo principal con MP
MP Chile puede **pausar el acceso** unilateralmente si detecta:
- Picos de volumen no habituales
- Muchos chargebacks (> 1-2%)
- Cambio de categoría de negocio percibido

**Conclusión:** MP es viable hasta ~200-500 coaches, pero requiere la cuenta completamente verificada como empresa. El riesgo real no es técnico sino regulatorio/operativo.

---

# 2. Transbank / WebPay

**WebPay es la plataforma de pagos más usada en Chile**, operada por Transbank (consorcio de los principales bancos chilenos). Si tienes una tarjeta bancaria en Chile, puedes pagar con WebPay.

## 2.1 Productos relevantes para EVA

| Producto | Descripción | ¿Sirve para suscripciones? |
|----------|-------------|--------------------------|
| **WebPay Plus** | Pago único (redirige al banco) | ❌ Solo one-time |
| **WebPay OneClick** | Tokeniza la tarjeta, cobra cuando quieras | ✅ **Perfecto para SaaS** |
| **Webpay Oneclick Mall** | OneClick con múltiples tiendas | ❌ Sobre-engineered |
| **Patpass** | Suscripción automática (PAT = Pago Automático con Tarjeta) | ✅ Excelente |

### WebPay OneClick — El más relevante para EVA

**Cómo funciona:**
1. El coach hace un primer pago de $1 (o del primer mes) para inscribir su tarjeta
2. Transbank devuelve un `tbkUser` (token de la tarjeta, guardado en tu BD)
3. Mensualmente, EVA llama a la API con el `tbkUser` para cobrar sin redirigir al banco
4. El coach nunca vuelve a ingresar su tarjeta

**Ventaja clave: soporta Redcompra (tarjeta de débito CLP)**
Esto es enorme en Chile — una gran parte de la población no tiene tarjeta de crédito pero sí Redcompra. MercadoPago también soporta débito, pero WebPay/Transbank es la opción nativa que los chilenos conocen y confían.

## 2.2 Requisitos para integrar Transbank

| Requisito | Detalle |
|-----------|---------|
| **Tipo de entidad** | Persona natural con inicio de actividades O empresa (SPA/EIRL/SA) |
| **RUT** | Obligatorio |
| **Cuenta corriente bancaria** | Banco chileno (cualquier banco) |
| **Sitio web activo** | EVA debe estar en producción con dominio real |
| **Certificado SSL** | HTTPS obligatorio (Vercel lo incluye) |
| **Proceso de afiliación** | Formulario en transbank.cl → revisión 5-15 días hábiles |
| **Costo de afiliación** | Gratuito |
| **Comisión por transacción** | ~1,5%–2,5% + IVA (varía por volumen y tipo de tarjeta) |

## 2.3 SDK oficial para Node.js

Transbank tiene un SDK oficial publicado en npm:

```bash
npm install transbank-sdk
```

```typescript
import { WebpayPlus, OneClickMall } from 'transbank-sdk'

// Configuración (staging o producción)
const tx = new WebpayPlus.Transaction(
    new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration)
)
```

El SDK cubre: WebPay Plus, OneClick, Patpass. Está mantenido activamente por Transbank.

## 2.4 Flujo de integración OneClick para EVA

```
1. Coach hace clic en "Suscribirse"
   └─▶ EVA llama a POST /inscriptions (OneClick)
       └─▶ Redirigir a URL de Transbank (inscripción)
           └─▶ Coach ingresa tarjeta (una sola vez)
               └─▶ Transbank redirige a EVA /webhook/transbank
                   └─▶ EVA guarda tbkUser en coaches.tbk_user_token
                       └─▶ Activar cuenta coach

Mes siguiente (o cualquier fecha):
   EVA corre cron job (o trigger en webhook) →
   POST /transactions (OneClick con tbkUser) →
   Transbank cobra directamente →
   EVA actualiza current_period_end
```

## 2.5 Ventajas y desventajas

| Aspecto | Evaluación |
|---------|------------|
| Confianza en Chile | ⭐⭐⭐⭐⭐ La más alta — es "el banco" |
| Soporte Redcompra | ✅ Sí (tarjetas de débito CLP) |
| Suscripciones recurrentes | ✅ Sí (OneClick + tu propio scheduler) |
| Límites de volumen | ✅ Sin límites artificiales (eres tú quien llama a cobrar) |
| Chargebacks/disputas | 🔶 Proceso formal con bancos (más lento pero más estructurado) |
| DX (Developer Experience) | 🔶 Medio — SDK bueno, pero documentación menos pulida que Stripe |
| Tiempo de onboarding | ❌ 5-15 días hábiles de espera |
| Pagos internacionales | ❌ Solo tarjetas chilenas |

---

# 3. Flow.cl

**Flow** es una plataforma de pago chilena más ágil que Transbank, pensada para eCommerce y SaaS.

## 3.1 Por qué es relevante

- Soporta múltiples medios: WebPay (Transbank), tarjetas internacionales, transferencia bancaria, Redcompra
- **Tiene su propia gestión de suscripciones** (sin necesidad de un scheduler propio)
- Onboarding más rápido que Transbank (3-7 días)
- API REST bien documentada con sandbox gratuito

## 3.2 Requisitos

| Requisito | Detalle |
|-----------|---------|
| RUT | Obligatorio (persona natural o empresa) |
| Cuenta bancaria chilena | Para retiros |
| Registro en flow.cl | Formulario online + documentos |
| Tiempo de aprobación | 3-7 días hábiles |
| Comisión | ~2.95% + IVA por transacción exitosa |
| Mensualidad fija | Hay planes; el básico suele ser gratuito o $5.000–10.000 CLP/mes |

## 3.3 Suscripciones en Flow

Flow tiene una API de suscripciones nativa:
```
POST /subscription/create      → crear plan de suscripción
POST /subscription/customers   → suscribir un cliente al plan
GET  /subscription/{id}        → consultar estado
DELETE /subscription/{id}      → cancelar
```

**Diferencia clave vs MP y Transbank:** Flow maneja el ciclo de cobro automáticamente. Tú defines el plan (monto + frecuencia), suscribes al cliente, y Flow cobra y te notifica por webhook.

## 3.4 Ventajas y desventajas

| Aspecto | Evaluación |
|---------|------------|
| Facilidad de integración | ⭐⭐⭐⭐ Muy buena |
| Suscripciones nativas | ✅ Sí |
| Medios de pago soportados | ✅ WebPay + crédito + débito + transferencia |
| Onboarding | ✅ Más rápido que Transbank |
| Confianza del usuario final | 🔶 Conocida pero menos "institucional" que WebPay |
| Límites de volumen | ✅ Sin límites artificiales reportados |
| Soporte | 🔶 Chat/email, sin account manager en planes básicos |
| Pagos internacionales | 🔶 Solo con tarjetas que operan en Chile |

---

# 4. Stripe

Stripe es el estándar global de pagos online. Disponible en Chile para empresas desde 2022.

## 4.1 ¿Qué soporta en Chile?

| Feature | Chile |
|---------|-------|
| Tarjetas Visa/Mastercard internacionales | ✅ |
| Tarjetas de crédito chilenas | ✅ (si son Visa/MC) |
| Redcompra (débito CLP) | ❌ **No soportado** |
| Pagos en CLP | ✅ |
| Suscripciones (Stripe Billing) | ✅ |
| Facturas automáticas | ✅ |
| Portal de cliente (autogestión) | ✅ |

**El problema principal de Stripe en Chile: no acepta Redcompra.** Esto excluye a una porción significativa de coaches chilenos que solo tienen tarjeta de débito bancaria.

## 4.2 Por qué igual es relevante para EVA

- Si EVA se expande a otros países de LATAM (Colombia, México, Argentina), Stripe es el proveedor más sencillo
- Para coaches que tienen tarjeta de crédito internacional, la experiencia de pago con Stripe es superior
- El SDK ya está mencionado en `types.ts`: `name: 'mercadopago' | 'stripe'` — hay un stub preparado
- **Stripe Billing** maneja todo el ciclo de vida de la suscripción de forma autónoma (sin cron jobs propios)

## 4.3 Requisitos

| Requisito | Detalle |
|-----------|---------|
| Tipo de entidad | Empresa chilena registrada O persona natural con actividades (en proceso de habilitación) |
| Cuenta bancaria | USD o CLP (Stripe convierte) |
| Onboarding | ~1-3 días, completamente online |
| Comisión | 2.9% + US$0.30 por transacción (más alto que locales) |

---

# 5. Kushki

Plataforma de pagos LATAM, relevante si EVA planea expandirse regionalmente.

## 5.1 Por qué considerarla

- Soporta Chile, Colombia, Ecuador, Perú, México con un solo contrato
- API unificada para todos los países
- Soporta suscripciones recurrentes
- En Chile: WebPay, Redcompra, tarjetas internacionales

## 5.2 Estado en Chile

- Funcional pero menos penetración de mercado que Transbank/Flow
- Onboarding puede ser más lento (requiere representante comercial)
- Ideal si se piensa en expansión regional desde el inicio

---

# 6. Khipu

Plataforma de transferencias bancarias. Muy popular en Chile para pagos puntuales.

- **No es apto para suscripciones automáticas** (cada cobro requiere acción del usuario)
- Útil como método adicional de pago inicial ("paga el primer mes por transferencia")
- Comisión muy baja (~1%)
- No es relevante para el modelo SaaS recurrente de EVA

---

# 7. Comparativa técnica y de negocio

| Criterio | MercadoPago (actual) | WebPay OneClick | Flow.cl | Stripe |
|----------|---------------------|-----------------|---------|--------|
| **Suscripciones recurrentes** | ✅ Pre-approvals | ✅ OneClick manual | ✅ Nativas | ✅ Billing nativo |
| **Redcompra (débito CLP)** | ✅ Sí | ✅ Sí | ✅ Sí | ❌ No |
| **Tarjetas internacionales** | ✅ Sí | 🔶 Solo emitidas en Chile | 🔶 Limitado | ✅ Excelente |
| **Confianza del usuario CL** | 🔶 Media | ⭐⭐⭐⭐⭐ Muy alta | 🔶 Media-alta | 🔶 Baja (desconocida para muchos) |
| **Tiempo de onboarding** | ✅ Inmediato (con KYC luego) | ❌ 5-15 días | 🔶 3-7 días | ✅ 1-3 días |
| **Límites de escala** | ⚠️ Requiere verificación | ✅ Sin límites artificiales | ✅ Sin límites artificiales | ✅ Sin límites |
| **DX / API Quality** | 🔶 Medio | 🔶 Medio (SDK bueno) | 🔶 Bueno | ⭐⭐⭐⭐⭐ Excelente |
| **Comisión aprox.** | ~3.49% | ~1.5–2.5% | ~2.95% | ~2.9% + US$0.30 |
| **Soporte técnico** | 🔶 Chat/email | ✅ Equipo Transbank | 🔶 Chat/email | ✅ Documentación excelente |
| **Expansión LATAM** | ✅ Sí | ❌ Solo Chile | ❌ Solo Chile | ✅ Global |
| **Webhooks confiables** | 🔶 A veces lentos | ✅ Sí | ✅ Sí | ⭐⭐⭐⭐⭐ Muy confiables |
| **Complejidad de integración** | Baja (ya hecho) | Media | Baja | Baja |

---

# 8. Recomendación para EVA

## Corto plazo (ahora — primeros 50 coaches)

**Mantener MercadoPago, pero verificar la cuenta YA.**

Lo que hay que hacer esta semana:
1. Completar el KYC en MercadoPago Chile (RUT, cédula, cuenta bancaria)
2. Declarar la actividad como "Servicios de software / SaaS"
3. Activar la cuenta como negocio (no persona natural si ya tienes empresa)
4. Subir límites de retiro contactando a soporte de MP Chile

Esto resuelve el riesgo inmediato sin tocar el código.

## Mediano plazo (50–200 coaches)

**Agregar Flow.cl como proveedor alternativo/principal.**

**¿Por qué Flow y no Transbank directo?**
- Flow usa WebPay internamente → el usuario ve la experiencia de Transbank/banco
- Onboarding 3-7 días vs 5-15 de Transbank directo
- Suscripciones nativas (no necesitas tu propio scheduler de cobros mensuales)
- Soporta múltiples medios (WebPay + transferencia + crédito)

**Estrategia:** ofrecer al coach elegir medio de pago al registrarse:
```
¿Cómo quieres pagar?
● MercadoPago (Visa, Mastercard, Redcompra, efectivo)
● WebPay / Transferencia (vía Flow)
```

Esto maximiza conversión (cada coach elige lo que le resulta más fácil).

## Largo plazo (200+ coaches, expansión regional)

**Multi-proveedor real:**
- Chile: Flow.cl o WebPay OneClick (nativo, alta confianza)
- LATAM: MercadoPago (ya funciona en Argentina, Colombia, México, Perú)
- Internacional: Stripe (coaches fuera de LATAM o con tarjetas internacionales)

---

# 9. Cómo integrar un nuevo proveedor en el código

## 9.1 La arquitectura ya está preparada

El código de EVA ya tiene una interfaz abstracta en `src/lib/payments/types.ts`:

```typescript
export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'   // ← agregar | 'flow' | 'transbank'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
    fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot>
    cancelCheckoutAtProvider(checkoutId: string): Promise<void>
}
```

Para agregar Flow.cl (ejemplo), se necesita:

## 9.2 Pasos concretos para integrar Flow.cl

**Paso 1 — Crear el proveedor:**
```
src/lib/payments/providers/flow.ts   ← implementa PaymentsProvider
```

```typescript
export class FlowProvider implements PaymentsProvider {
    name = 'flow' as const

    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
        // POST https://www.flow.cl/api/subscription/create
        // Retornar checkoutId (subscriptionId de Flow) y checkoutUrl
    }

    async processWebhook(payload: unknown): Promise<WebhookProcessResult> {
        // Validar firma HMAC del webhook de Flow
        // Mapear evento de Flow a WebhookProcessResult
    }

    async fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot> {
        // GET https://www.flow.cl/api/subscription/{id}
    }

    async cancelCheckoutAtProvider(checkoutId: string): Promise<void> {
        // DELETE https://www.flow.cl/api/subscription/{id}/cancel
    }
}
```

**Paso 2 — Registrar en el factory:**
```typescript
// src/lib/payments/providers/index.ts
export function getPaymentsProvider(name: string): PaymentsProvider {
    if (name === 'flow') return new FlowProvider()
    if (name === 'transbank') return new TransbankProvider()
    return new MercadoPagoProvider()  // default
}
```

**Paso 3 — Campo en DB:**
```sql
-- coaches ya tiene payment_provider (default 'mercadopago')
-- Solo actualizar el valor al registrar con Flow:
UPDATE coaches SET payment_provider = 'flow' WHERE id = $1;
```

**Paso 4 — UI del registro:**
Agregar selector de proveedor en `src/app/(auth)/register/` (paso 2 del wizard).

**Paso 5 — Webhook endpoint:**
El endpoint `/api/payments/webhook/route.ts` ya detecta el proveedor desde la BD del coach. Agregar el manejo del payload de Flow/Transbank.

## 9.3 Para WebPay OneClick (Transbank directo)

Requiere un paso adicional de inscripción de tarjeta. El flujo es ligeramente diferente:

```
coach.tbk_user_token (nuevo campo en coaches) ← guardado tras inscripción inicial
```

Esto implica un campo extra en la tabla `coaches` y una pantalla de inscripción de tarjeta antes del primer cobro.

## 9.4 Esfuerzo estimado por proveedor

| Proveedor | Días de desarrollo |
|-----------|-------------------|
| Flow.cl | 3-4 días |
| WebPay OneClick (Transbank) | 5-7 días (flujo de inscripción + scheduler) |
| Stripe | 2-3 días (SDK excelente, stub ya existe) |

---

## Resumen en una página

| Pregunta | Respuesta |
|----------|-----------|
| **¿MP aguanta 200 coaches pagando?** | Sí, **con la cuenta verificada**. Sin verificar, puede congelar fondos a los 30-50 coaches. |
| **¿WebPay es mejor que MP?** | Para Chile: conversión probablemente mayor (más confianza). Para LATAM: MP gana. |
| **¿Cuál es la mejor plataforma para Chile?** | **Flow.cl** a corto/mediano plazo. Usa WebPay internamente, suscripciones nativas, onboarding en menos de una semana. |
| **¿Cuánto código hay que escribir para Flow?** | ~3-4 días. La interfaz `PaymentsProvider` ya existe y el patrón está definido. |
| **¿Hay riesgo de quedarse sin poder cobrar?** | Sí si solo depende de MP y no está verificado. Mitigación: verificar MP ahora + integrar Flow como alternativa antes de 50 coaches. |
| **¿Se puede tener MP + Flow al mismo tiempo?** | Sí. El campo `coaches.payment_provider` ya existe para esto. El coach elige al registrarse. |

---

*Este documento es de análisis. Antes de integrar cualquier proveedor, verificar los términos y comisiones vigentes directamente con cada plataforma — pueden cambiar.*
