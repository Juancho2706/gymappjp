# Informe Interno — Cuánto cobrarle a Movida y por qué

> **Para qué sirve:** documento PRIVADO (no se envía a Movida). Define el precio que pedimos, con respaldo de mercado investigado y verificado el **10 de junio de 2026**. Responde al audio de Ani de hoy: los socios quieren "el valor real de la app" para armar dos contrapropuestas en su reunión del lunes. Hay que mandarles el valor **antes del viernes 12**.
>
> Documento hermano (este SÍ se envía): `06-DESGLOSE-VALOR-PARA-MOVIDA.md`.

---

## 1. Resumen ejecutivo — el número

| Concepto | CLP/mes + IVA | Equivalente |
|---|---:|---|
| Precio lista EVA Team (ancla, tachado) | $1.200.000 | 29,4 UF · ~USD 1.330 |
| **Precio Fundador Movida (lo que se pide)** | **$890.000** | **21,8 UF · ~USD 990** |
| Target de cierre realista | $750.000 – $890.000 | 18,4 – 21,8 UF |
| Escalones de concesión (solo a cambio de algo) | $815.000 → $750.000 | — |
| Piso / walk-away | $540.000 | 13,2 UF · ~USD 600 |

Condiciones que acompañan el número: setup bonificado ($450.000), congelado 18 meses, contrato de 12 meses renovable. **Decisión 10-jun: SIN meses gratis ni rampa de adopción** — el setup bonificado es la única concesión de arranque incluida; meses gratis/rampa quedan en la manga como carta de concesión si el lunes aprietan (regalar arranque antes que tocar el recurrente).

**Recomendación nueva (respaldada por datos):** expresar el precio del contrato en **UF** (hoy 1 UF = $40.766, SII 10-jun-2026). Con IPC a 12 meses de 3,9% (INE, mayo 2026), un precio fijo en CLP pierde ~$35.000/mes de valor real al año. "Congelado 18 meses" puede ser en UF: congelás el precio real, no el nominal. $890.000 = **21,8 UF**.

**Coherencia de documentos:** la propuesta económica (doc 02) dice $890k y el MOU (doc 03) dice $815k. Se presenta **$890.000**; el $815.000 queda como **primer escalón de concesión ya escrito en el MOU** (jugada: "les dejo el precio del MOU en $815k si firmamos 12 meses + piloto pago + referencias por escrito"). No corregir el MOU: es munición.

---

## 2. Lo que pidió Ani hoy (audio 10-jun) y cómo se responde

Lo que dijo, en limpio:

1. Los socios se reúnen el **lunes** y quieren llegar con **dos propuestas** propias.
2. Para armarlas necesitan saber "**cuánto nos saldría la app mensual**" — el valor real.
3. Un socio rechazó la propuesta que Ani circuló (la de la pantalla LED) y quiere proponer otra.
4. Quieren "equiparar parte del valor" con sus servicios: kinesiología, nutrición, clases — es decir, **pagar parte en canje**.

Cómo se responde (antes del viernes):

- Se envía **un solo número mensual claro** ($890.000 + IVA, fundador) dentro del documento de desglose (doc 06), que justifica el valor con cifras de mercado citadas. No se manda el número pelado por WhatsApp: el número sin el desglose se convierte en piñata de regateo el lunes.
- Se reitera que el **convenio de marca / Brand Lab es un acuerdo separado** y que EVA lo toma **en especie, nunca en efectivo** (su propuesta: $200.000 + IVA/mes).
- **Canje de servicios = misma respuesta que el Brand Lab:** "Nos encanta y lo armamos como convenio aparte, con factura cruzada por el valor de cada servicio. Pero la licencia del software se paga en dinero: es lo que sostiene servidores, soporte y desarrollo." El software corre con costos reales en USD todos los meses; las sesiones de kine no pagan a Vercel.
- Si presionan: cada parte emite factura por su servicio a valor de mercado (ellos boletean sus sesiones, nosotros facturamos la licencia completa). Flujo de plata limpio, SII contento, y el precio de la licencia nunca se contamina.

**Por qué importa no ceder en el canje:** los dos pagamos IVA igual (el canje no lo evita), el canje no paga nuestros costos en USD, y el precio que aceptemos hoy es el precio de referencia para los próximos 5 años de EVA Team.

---

## 3. Cuánto cuesta construir "una app como esta" — la investigación (jun-2026)

Esto es lo que el usuario final preguntó y lo que los socios quieren saber de fondo. Todas las cifras verificadas contra fuente original (dólar usado: promedio 30 días = ~$900; observado hoy = $916,39 BCCh).

### 3.1 Construirla desde cero (one-time)

| Quién la construye | USD | CLP | Fuente |
|---|---:|---:|---|
| Agencia chilena mediana (plataforma compleja + app móvil) | 67.000 – 145.000 | **$60M – $130M** | Aeurus abr-2026 (plataforma compleja CLP 50M-80M+) + CEODATA (app compleja CLP 25M-60M+) |
| Software factory tier-1 Chile / nearshore premium (USD 50-99/h, squad 3-5, 6-12 meses) | 150.000 – 400.000+ | $135M – $360M+ | Clutch Chile may-2026 + Curotec 2026 |
| Agencia especializada fitness/salud nearshore o Europa del Este | 250.000 – 450.000+ | $225M – $405M+ | Topflight (fitness full-scale USD 250-450k, verificado) + Purrweb jun-2026 (EHR con portales USD 90-250k; CRM médico USD 150-400k) |
| Agencia mid-market de EE.UU. (USD 120-250/h) | 600.000 – 1.200.000 | $540M – $1.080M | FullStack Labs oct-2025 + Netguru may-2026 |

Base de cálculo: el alcance (SaaS web multi-tenant + app en stores + 6 módulos: entrenamiento, cardio, nutrición+ISAK, kine/FMS, fidelización wallet+QR, white-label + ley de datos de salud) equivale a **~4.000-7.000 horas**. Solo el componente tipo ficha clínica ya suma ~2.041 h (Appinventiv jun-2026); una app fitness de UNA plataforma, ~1.900 h (Cleveroad nov-2025). Extras que se suman solos: compliance datos de salud USD 15-50k one-time (proxy HIPAA, Kellton/Purrweb) y el módulo de fidelización standalone USD 25-80k.

### 3.2 Mantenerla (todos los años, para siempre)

- **15-25% del costo de desarrollo por año** (consenso de 4 fuentes 2025-2026: Purrweb, Netguru, Aeurus, CEODATA). Sobre un build chileno de $60M-130M: **$6M-26M/año**, más hosting $100k-500k/mes.
- Un solo full-stack senior en Chile cuesta **$3,5M-4,5M brutos/mes** (IT Workers 2026; Robert Half mediana $4,0M) = **$4,4M-6,1M/mes costo empresa** (+25-35% leyes sociales, MAXXA).

### 3.3 La conclusión para la mesa

La opción "nos hacemos nuestra propia app" (la universidad, estudiantes, otra agencia) cuesta **mínimo $60M de entrada + $10M+/año para siempre**, demora 6-12 meses, y la IP/soporte son un problema de ellos. Contra eso, EVA fundador cuesta **$10,7M/año** ($890k × 12), arranca en semanas, con soporte con nombre y apellido. **El precio anual de EVA es ~6 veces menor que el costo de solo construirla, sin contar mantenerla.** Este es el argumento más fuerte que tenemos y es 100% honesto.

---

## 4. Comparables SaaS — lo que de verdad muestra el mercado (¡leer antes del lunes!)

⚠️ **Hallazgo importante de la verificación:** el argumento "Mindbody cuesta $640k-1,6M" (docs 02 y 04) es **defendible solo en parte**. Lo verificado:

| Plataforma (1 ubicación, ~300 alumnos, staff 20-30) | USD/mes | CLP/mes aprox | Nota |
|---|---:|---:|---|
| Mindbody Starter → Ultimate Plus | 99-159 → 499-699+ | $90k → $450k-630k | Oficial es quote-only; staff ilimitado. Guías 2026 (Koalendar, FitBudd). + processing 2,99-3,6% |
| Zenoti (típico por ubicación) | 300-600 | $270k-540k | + implementación USD 2.000-5.000 one-time. Equipos chicos reportan hasta USD 1.800/mes |
| Glofox para gym de 300 miembros | ~1.300 (estimado) | ~$1,17M | Estimación MakoCRM 2026; software base USD 110-400+ |
| Virtuagym club mediano | 300-600 | $270k-540k | App de marca = add-on pagado |
| TrainingPeaks con 300 atletas premium | ~1.905 | ~$1,71M | El único comparable que supera nuestra lista |
| PT Distinction (300 clientes, trainers ilimitados) | ~490 | ~$441k | App de marca incluida |
| Everfit Pro (300 clientes) | 290 + add-ons | ~$261k+ | Add-ons: nutrición $39, autoflow $29... |
| Trainerize Studio Plus (hasta 500 clientes) | 248-275 | ~$223k-248k | App de marca incluida. Solo entrenamiento |
| Boxmagic Chile (Gold Plus, hasta 2.000) | — | $176k-220k +IVA | Lo que Ani ya conoce. Sin ficha multi-profesional, sin kine/nutri/fidelización |
| Fitco LatAm (Growth, ilimitado) | 169 | ~$152k | Sin ficha multi-profesional ni módulo kine |
| Medilink (25-30 profesionales) | 250-300 | ~$230k-275k | Solo agenda/clínico; es lo que ya pagan en parte |

**Lectura honesta:** ningún SaaS genérico de UNA ubicación cuesta $890k/mes por sí solo. Si los socios googlean "Mindbody pricing" van a ver USD 159-699. **El precio nuestro NO se defiende con "Mindbody cuesta más"; se defiende con:**

1. **Costo de reemplazo** (§3): construir esto = $60M-405M+. Es la categoría correcta: ellos no quieren un Mindbody, quieren SU plataforma con SUS módulos.
2. **Suma de lo que reemplaza + lo que no existe en el mercado:** la combinación real que necesitarían es Medilink ($230k-275k) + app de entrenamiento con marca propia (Trainerize/PT Distinction $223k-441k) + Avena/nutrición ($50k+) + fidelización wallet (Loopy/Stamp Me $44k-90k) + email marketing ($8k-54k) ≈ **$550k-900k/mes en 5 contratos que NO conversan entre sí** — y aún así nadie les da la ficha multi-profesional compartida ni ISAK ni FMS.
3. **El servicio:** soporte local en español, carga de ejercicios kine con Tito, migración asistida, socio de diseño. Trainerize no se sienta con Tito.
4. **Glofox real para 300 miembros (~$1,17M) y TrainingPeaks ($1,71M)** son los dos comparables citables que SÍ superan la lista — usarlos con nombre.

El stack-DIY de herramientas sueltas (sin app de marca seria): USD 300-500+/mes = **$270k-450k/mes** (Loopy Growth $69 + Brevo $9 + Trainerize Studio $248...). Es el piso real del mercado — por eso nuestro **piso de $540k** está bien puesto: nunca por debajo del costo del Frankenstein que venimos a reemplazar.

**Nota mensajería (decisión 10-jun):** el bulk de mensajes/campañas de EVA va por **email (Resend)**, no por WhatsApp. No usar WhatsApp como argumento ni prometerlo: las campañas a toda la base de alumnos (no solo los 197 contactos escaneados de Trek) salen por correo, ya incluido en la plataforma.

---

## 5. Nuestros costos reales (para saber dónde está nuestro margen — NO se comparte entero)

Infra mensual a precios oficiales jun-2026 (dólar ~$900):

| Ítem | USD/mes | CLP/mes |
|---|---:|---:|
| Vercel Pro (2 seats) | 40 | $36.000 |
| Supabase Pro + compute Small | 40 | $36.000 |
| Google Workspace (2 usuarios, Starter CLP 6.500 c/u) | ~14 | $13.000 |
| Resend Pro (50k emails) | 20 | $18.000 |
| Expo EAS (Starter $19 hoy → Production $199 al escalar stores) | 19-199 | $17.000-179.000 |
| Edamam API (Basic) | 9 | $8.100 |
| Apple Developer ($99/año) + Google Play ($25 one-time) | ~8 | $7.500 |
| Upstash Redis (free → PAYG) | 0-10 | $0-9.000 |
| Dominio .cl (NIC Chile $9.990/año) | ~1 | $833 |
| Cloudflare Free + GitHub Free | 0 | $0 |
| **Subtotal infra** | **~137-358** | **~$125.000-330.000** |

- MercadoPago si cobramos por link: 2,89-3,19% + IVA por transacción.
- **El costo dominante no es infra: es el tiempo de ingeniería.** A valor de mercado (senior $4,4M-6,1M/mes costo empresa), una dedicación de 25-35% a Movida (soporte + módulos exclusivos + evolución) vale **$1,1M-2,1M/mes**. Costo total de servirlos a precio de mercado: **~$1,3M-2,4M/mes.**
- Con $890k cubrimos infra + una fracción del tiempo; el resto lo "paga" el valor de design-partner (caso de éxito, referencias UNAP/Kingston, feedback). **Por debajo de $540k estamos literalmente subsidiando a Movida con plata nuestra.** El piso no es capricho.

En el doc 06 esto va presentado como "costo de operar el servicio" en rangos de valor de mercado (infra + ingeniería + compliance), sin abrir el detalle fino de nuestros contratos.

---

## 6. Jugada para esta semana

1. **Hoy/mañana:** pulir doc 06, exportarlo a PDF y mandárselo a Ani ("acá o al correo", como pidió) — **antes del viernes**.
2. Mensaje corto que acompaña (WhatsApp, tono Ani): el valor mensual es **$890.000 + IVA precio fundador** (lista $1,2M), congelado 18 meses, contrato de 12 meses, con setup, migración y capacitación bonificados; el detalle del porqué va en el PDF; el convenio de marca lo conversamos aparte como intercambio.
3. **Lunes:** Ani presenta a los socios con el PDF. Ofrecerse a estar disponible por llamada/WhatsApp durante esa reunión para responder dudas en vivo.
4. Cuando lleguen las dos contrapropuestas (seguro: una con canje de servicios y/o Brand Lab adentro), responder con el guion (doc 04): plata por software, especie por marca, escalones solo a cambio de 12 meses + piloto pago + referencias escritas.
5. No moverse del piso $540k. Si las dos propuestas vienen por debajo o 100% canje: "así no nos da para sostener el servicio que se merecen" + dejar el piloto pago como puerta.

---

## Anexo — Fuentes principales (verificadas 10-jun-2026)

- Tipo de cambio: BCCh vía mindicador.cl ($916,39 obs. 10-jun; prom. 30d $898,46) · UF: sii.cl ($40.765,97) · IPC 12m: INE 3,9% (may-2026) · IVA 19% servicios/SaaS SpA: sii.cl (Ley 21.420) · Retención honorarios 2026: 15,25% (sii.cl).
- Costos dev: topflightapps.com (fitness full-scale 250-450k USD) · purrweb.com jun-2026 (healthcare/EHR) · appinventiv.com jun-2026 (horas EHR) · cleveroad.com nov-2025 · fullstack.com oct-2025 (tarifas por región) · netguru.com may-2026 · aeurus.cl abr-2026 (Chile) · ceodata.cl (Chile) · clutch.co/cl/developers (tarifas agencias chilenas) · curotec.com / mismo.team (rates Chile) · itworkers.cl + roberthalf.com/cl (sueldos).
- Comparables SaaS: páginas oficiales de trainerize.com, ptdistinction.com, everfit.io, truecoach.co, trainingpeaks.com, boxmagicapp.com, precios.fitcolatam.com, avena.io; guías 2026 (Koalendar/FitBudd para Mindbody, Pabau para Zenoti, Gymdesk/MakoCRM para Glofox).
- Fidelización/canales: loopyloyalty.com, stampme.com, passkit.com, brevo.com, mailchimp (tramos).
- Infra: vercel.com/pricing, supabase.com/pricing, workspace.google.com/pricing, resend.com/pricing, upstash.com, expo.dev/pricing, developer.apple.com, nic.cl, mercadopago.cl/ayuda, developer.edamam.com, cloudflare.com/plans, github.com/pricing.
