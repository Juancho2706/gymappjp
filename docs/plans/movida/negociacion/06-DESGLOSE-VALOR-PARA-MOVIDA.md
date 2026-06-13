# Movida powered by EVA — Valor de la plataforma y desglose del precio

---

## 1. Qué es lo que están valorizando

"Movida powered by EVA" no es una app de entrenamiento más. Es la **plataforma central del centro**, con la marca de Movida, que reúne en una sola ficha del alumno lo que hoy está repartido en 5 herramientas que no conversan entre sí:

- **Ficha única multi-profesional:** entrenador, kinesiólogo y nutricionista trabajan sobre el mismo alumno, cada uno desde su módulo; la dirección técnica ve todo en tiempo real.
- **Entrenamiento** con el pilar técnico de Movida (Roller / Movilidad / Core / Principal), biblioteca de +800 ejercicios y los ejercicios de kinesiología propios del centro.
- **Cardio y carrera** (ritmos, zonas de frecuencia cardiaca, intervalos).
- **Nutrición** con base de alimentos chilenos, antropometría completa y pautas en PDF con la marca de Movida.
- **Evaluaciones** (FMS y formatos de ingreso del centro).
- **Fidelización integrada** (estampillas, niveles, QR en recepción, campañas) — exclusiva de Movida en la V Región por 12 meses.
- Auto-registro de alumnos por link, importación masiva desde Excel (Medilink), y cumplimiento de la **Ley 21.719 de protección de datos de salud**.

El detalle completo está en el *Documento de Funcionalidades* ya entregado. La pregunta de este documento es otra: **¿cuánto vale esto en el mercado?**

---

## 2. Camino A — Construir una plataforma así desde cero

Es la referencia más directa del "valor real de la app": qué costaría desarrollarla a medida. Cifras de la industria 2025-2026, verificadas en fuentes públicas:

| Quién la desarrolla | Costo de construcción (una vez) | En CLP |
|---|---:|---:|
| Agencia chilena mediana (plataforma web compleja + app móvil) | USD 67.000 – 145.000 | **$60 – $130 millones** |
| Software factory establecida en Chile / LatAm (equipo 3-5 personas, 6-12 meses) | USD 150.000 – 400.000 | $135 – $360 millones |
| Agencia internacional especializada en salud/fitness | USD 250.000 – 450.000 | $225 – $405 millones |
| Agencia de EE.UU. | USD 600.000 – 1.200.000 | $540 – $1.080 millones |

¿Por qué tanto? Porque el alcance es grande: una plataforma de este tipo equivale a **4.000 – 7.000 horas de desarrollo**. Solo una ficha clínica digital (web + móvil) ya suma más de 2.000 horas según los estudios del sector; una app de fitness sola, ~1.900 horas. Y a eso se agregan dos costos que no son opcionales:

- **Cumplimiento de normativa de datos de salud:** USD 15.000 – 50.000 adicionales (cifrado, control de acceso por rol, registro de auditoría).
- **Mantenimiento permanente: 15 – 25% del costo de desarrollo, cada año.** Sobre un desarrollo chileno "económico" de $60-130 millones, son **$9 – 26 millones al año, para siempre**, más hosting ($100.000 – 500.000/mes). Un solo desarrollador senior en Chile cuesta $4,4 – 6,1 millones/mes como costo de empresa.

> **Conclusión del Camino A:** tener una plataforma propia como esta cuesta **mínimo $60 millones de entrada más $10+ millones al año**, demora 6-12 meses, y la responsabilidad de que funcione queda en el centro.

---

## 3. Camino B — Armarla con herramientas sueltas (lo más parecido a hoy)

La alternativa es contratar por separado cada pieza. Precios vigentes a junio 2026:

| Pieza | Herramienta de referencia | CLP/mes aprox |
|---|---|---:|
| Gestión clínica (agenda, fichas por profesional) | Medilink, 25-30 profesionales | $230.000 – 275.000 |
| App de entrenamiento con marca propia (hasta 500 alumnos) | Trainerize Studio / PT Distinction | $223.000 – 441.000 |
| Software de nutrición profesional | Avena (por nutricionista; plan empresa se cotiza) | $50.000+ |
| Fidelización con tarjeta digital, QR y geofence | Loopy Loyalty / Stamp Me | $44.000 – 90.000 |
| Email marketing a toda la base | Brevo / Mailchimp | $8.000 – 54.000 |
| **Total del paquete** | **5 contratos separados** | **~$550.000 – 900.000/mes** |

Y aun pagando todo eso, el paquete **no incluye lo más importante**: la ficha única compartida entre entrenador, kine y nutri; la antropometría integrada al resto de los datos; los bloques de la línea técnica de Movida; ni un soporte que responda por el conjunto. Cada herramienta es de una empresa distinta, en inglés, y ninguna conversa con la otra.

Un dato adicional de esta investigación: las plataformas internacionales de gestión para un centro del tamaño de Movida (300 alumnos activos) cuestan entre **$270.000 y $1.700.000/mes** según el proveedor (Zenoti $270-540 mil + instalación; Glofox estimado ~$1,17 millones para 300 miembros; TrainingPeaks ~$1,7 millones con 300 atletas) — todas sin ficha multi-profesional y sin adaptación a la metodología del centro.

---

## 4. Lo que cuesta operar este servicio cada mes

Una plataforma viva no es un gasto que se hace una vez: corre sobre servicios contratados en dólares y sobre horas de ingeniería todos los meses. Para transparencia, el costo operativo de servir a Movida se compone de:

| Componente | Detalle | Valor de mercado CLP/mes |
|---|---|---:|
| Infraestructura cloud | Servidores y base de datos (Vercel Pro, Supabase Pro), distribución de la app (Expo/stores Apple y Google), correo transaccional (Resend), APIs de nutrición, dominios, correo profesional (Google Workspace) | $125.000 – 330.000 |
| Ingeniería y soporte dedicados | Desarrollo de los módulos de Movida, carga de ejercicios kine, soporte en horario hábil, mantenimiento y seguridad — fracción dedicada de un ingeniero senior (costo de mercado en Chile: $4,4 – 6,1 millones/mes) | $1.100.000 – 2.100.000 |
| Cumplimiento y respaldo | Ley 21.719 (datos de salud), respaldos, control de accesos, auditoría | incluido en lo anterior |
| **Costo de mercado de servir a Movida** | | **~$1,3 – 2,4 millones/mes** |

Este es el contexto del precio: **el valor de mercado del servicio supera el precio fundador**. La diferencia la cubre lo que Movida aporta como primer centro (sección 6).

---

## 5. El precio

| Concepto | Valor |
|---|---:|
| Precio lista EVA Team (centro hasta 30 cupos de profesional) | ~~$1.200.000 CLP/mes + IVA~~ |
| **Precio Fundador Movida — congelado 18 meses** | **$890.000 CLP/mes + IVA** |
| Setup, migración de 300 alumnos y capacitación del equipo (valor $450.000) | **Bonificado** |
| Vigencia | Contrato de 12 meses, renovable |

Notas:

- Los precios son **+ IVA (19%)**: desde 2023 todos los servicios de software en Chile están afectos (Ley 21.420).
- En perspectiva anual: el año completo cuesta **$10,7 millones** — del orden de lo que cuesta solo *mantener* (no construir) una app propia, y ~6 veces menos que el piso de construirla.
- El precio puede expresarse en UF ($890.000 ≈ **21,8 UF** al 10-jun-2026) para que el congelamiento sea transparente para ambas partes.

### Lo que incluye

- Plataforma completa con la marca de Movida, hasta 30 cupos de profesional y alumnos del centro.
- Todos los módulos: entrenamiento (con el pilar técnico de Movida), cardio, nutrición + antropometría, kinesiología/FMS, ficha multi-profesional, fidelización.
- **Exclusividad del módulo de fidelización en la V Región por 12 meses.**
- Campañas de correo a toda la base de alumnos (correo transaccional y masivo incluido en la plataforma).
- Importación desde Excel/Medilink, auto-registro por link.
- Soporte en horario hábil con interlocutor directo.
- Evolución continua de la plataforma (las mejoras del producto llegan a Movida sin costo extra).

### Lo que no incluye (se cotiza aparte si se necesita)

- Integración por API con Medilink.
- Migración manual del histórico completo de los 300 alumnos (se ofrece carga asistida).
- Desarrollos del roadmap futuro (relojes/gadgets, notificaciones push nativas, wallet del teléfono, pago directo en la app) — llegan con la app nativa y se comunican cuando tengan fecha real.

---

## 6. Por qué existe un precio fundador

El precio lista de EVA Team es $1.200.000/mes. Movida accede a $890.000 congelado por 18 meses porque es el **primer centro** que adopta EVA Team y aporta valor real más allá del pago:

- **Socio de diseño:** los módulos de kinesiología y fidelización se definen con el equipo de Movida.
- **Caso de éxito:** EVA puede mostrar a Movida como centro de referencia.
- **Red:** presentaciones con UNAP, Colegio Kingston y clubes, por escrito.

Este descuento tiene fecha y no se repite cuando EVA Team escale a otros centros.

---

## 7. Convenio de marca (Partner Tecnológico Oficial) — acuerdo separado

Valoramos la propuesta del Brand Lab y queremos el sello de Partner Tecnológico Oficial. Nuestra propuesta es tratarlo **como intercambio de valor, no como pago en efectivo**, en un convenio aparte: EVA ya es la plataforma del alumno de Movida (no una marca de retail comprando exposición), y la contraprestación natural es la propia plataforma más contenido conjunto con el equipo audiovisual y los deportistas del centro. Si hay intercambio de servicios (kinesiología, nutrición, clases), cada parte factura su servicio a valor de mercado, en un acuerdo separado de esta licencia.

**La licencia del software se paga en dinero** porque es lo que sostiene los servidores, el soporte y el desarrollo continuo — los costos de la sección 4 se pagan en dólares todos los meses.

---

## 8. Resumen

| Camino | Costo |
|---|---|
| Construir una plataforma propia | $60 – 405+ millones de entrada + $9 – 26 millones/año de mantenimiento + 6-12 meses de espera |
| Armar el equivalente con 5 herramientas sueltas | $550.000 – 900.000/mes, sin ficha única, sin integración, sin soporte unificado |
| **Movida powered by EVA — precio fundador** | **$890.000/mes + IVA, congelado 18 meses, operativa en semanas, con la marca y la metodología de Movida** |

---

### Fuentes (consultadas y verificadas el 10 de junio de 2026)

Costos de desarrollo: Topflight Apps (fitness, sep-2025), Purrweb (salud/EHR, jun-2026), Appinventiv (jun-2026), Cleveroad (nov-2025), Netguru (may-2026), FullStack Labs (tarifas por región, oct-2025), Aeurus y CEODATA (Chile), Clutch.co (tarifas de agencias chilenas, may-2026), IT Workers y Robert Half Chile (sueldos TI 2026). Comparables: páginas oficiales de Trainerize, PT Distinction, Everfit, TrueCoach, TrainingPeaks, Boxmagic, Fitco y Avena; guías comparativas 2026 para Mindbody (Koalendar/FitBudd), Zenoti (Pabau) y Glofox (Gymdesk/MakoCRM). Email marketing: Brevo, Mailchimp. Indicadores: Banco Central de Chile / SII (dólar observado y UF al 10-jun-2026), INE (IPC 12 meses: 3,9%, may-2026), SII (IVA servicios, Ley 21.420). Infraestructura: páginas oficiales de precios de Vercel, Supabase, Google Workspace, Resend, Expo, Apple Developer, Google Play, NIC Chile, MercadoPago y Edamam. Valores en pesos chilenos; conversiones al dólar observado promedio del último mes (~$900 CLP/USD, Banco Central de Chile).
