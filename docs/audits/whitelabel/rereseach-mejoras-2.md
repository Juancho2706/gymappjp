# White-label EVA — ronda 2 de mejoras (qué MÁS puede hacer)

**Fecha:** 2026-07-02 · **Método:** 14 búsquedas web frescas (jul-2026), priorizando qué NO está hecho.
**Baseline ya shippeado (NO re-proponer):** 14 temas curados con WCAG automático (chau color picker), 4 layouts de login brandeado, compositor de loaders, emails con marca del coach, push con marca, `apple-touch-icon` per-coach (ícono en home screen), OG cards brandeadas, manifest brandeado, PDFs con marca, powered-by discreto, 12 fuentes, logo claro/oscuro, color2, acentos por-modo, tinte neutro.
**Restricción dura:** CERO features de AI. Todo lo de abajo es determinístico (presets, plantillas, generación de imagen/PDF, DNS, wallet passes).

---

## 0. TL;DR — ranking por (impacto de marca × novedad ÷ esfuerzo)

| # | Mejora | Esfuerzo | Plataforma | Impacto marca |
|---|--------|----------|------------|---------------|
| 1 | Dominio/subdominio propio por coach | L | Web | **ALTO** |
| 2 | Carnet en Apple/Google Wallet brandeado | M–L | Nativo (both) | **ALTO** |
| 3 | Momento de instalación PWA brandeado | S–M | Web | **ALTO** |
| 4 | Tarjetas compartibles auto-generadas (PR/racha) + link referido | M | Ambas | **ALTO** |
| 5 | Certificados/diplomas de hitos brandeados | S–M | Ambas | Medio-Alto |
| 6 | QR de invitación brandeado | S | Ambas | Medio |
| 7 | Watermark de marca en fotos de progreso | S | Ambas | Medio |
| 8 | Presets de tono/voz por coach (microcopy, sin AI) | M | Ambas | Medio |
| 9 | Programa de referidos con link único por coach | M | Web/both | Medio |
| 10 | Emails desde el dominio del coach (DKIM/SPF por tenant) | L | Web | Medio |
| 11 | Presets de sonido + haptic de marca (biblioteca curada) | M | Ambas (RN mejor) | Medio-Bajo |
| 12 | `background_color` del splash Android = color de marca | S | Ambas | Bajo-Medio |
| 13 | Feed/comunidad in-app brandeada | L | Ambas | Medio |

**Insight transversal:** la decisión "app única en store = EVA" sacrifica el ícono de tienda del coach. Las mejoras #2 (Wallet), #3 (instalación PWA) y #4 (share cards con link) son las que **más compensan** ese sacrificio: meten la marca del coach en el *lock screen* y en el *home screen* del alumno sin depender de una app en la tienda.

---

## 1. Superficies que faltan

### 1.1 Dominio o subdominio propio por coach — esfuerzo L · Web · impacto ALTO
**Qué es:** que el alumno entre por `coach.eva-app.cl` (subdominio, barato: wildcard SSL + host-header routing) o incluso `app.suentrenador.cl` (bring-your-own-domain, caro: SSL por dominio automatizado). Hoy EVA usa `/c/[coach_slug]` bajo el dominio EVA; la barra de direcciones sigue diciendo "eva-app.cl". El líder del nicho (FitBudd) y todo el mundo no-fitness (Softr, Kajabi) tratan el dominio propio como la pieza central del white-label: "todo tu contenido vive bajo TU marca".
**Por qué mueve la aguja:** la URL es una superficie de marca de altísima frecuencia y confianza; además mejora deliverability de emails y percepción de "producto propio, no herramienta de terceros". EVA ya tiene el andamiaje mental (subdominio aislado `enterprise.eva-app.cl` + política de cookies por subdominio), así que el subdominio por coach es el 80/20.
**Recomendación:** empezar por subdominio `coach.eva-app.cl` (wildcard cert, un solo SSL, onboarding instantáneo); BYO-domain como tier superior más adelante (exige automatizar cert por dominio — "certificate automation es mandatorio, el SSL manual no escala").
**Fuentes:** https://www.dchost.com/blog/en/custom-domains-and-subdomains-for-multi-tenant-saas/ · https://saascustomdomains.com/blog/posts/white-labelling-and-custom-domains-for-saas · https://www.fitbudd.com/post/fitbudd-vs-trainerize · https://www.courseplatformsreview.com/blog/kajabi-white-label/ · https://www.fahimai.com/softr-vs-glide

### 1.2 Carnet de socio en Apple/Google Wallet brandeado — esfuerzo M–L · Nativo · impacto ALTO
**Qué es:** emitir un pase de wallet (`.pkpass` / Google Wallet) con el logo, color y nombre del coach — "carnet de alumno de [coach]" que vive en Apple/Google Wallet, se agrega en un tap, **no requiere descargar nada**, se actualiza solo (próxima sesión, racha, vencimiento de plan) y aparece en el lock screen. Puede llevar el QR de invitación/check-in embebido.
**Por qué mueve la aguja:** dato duro del sector loyalty 2026 — las apps standalone tienen **83% de desinstalación**; los wallet passes logran **90% de open rate de push** y **3× más enrolamiento** porque no hay nada que bajar; 65-75% de los que enrolan efectivamente cargan el pase. Es exactamente la superficie que compensa el "store = EVA": pone la marca del coach en el lock screen del alumno sin app en la tienda. Novedad total: no aparece en la auditoría de código actual.
**Fuentes:** https://mmpos.app/blogs/details/wallet-loyalty-passes-in-2026-build-a-punch-card-customers-actually-use-apple-wa · https://www.loyaltypass.co/blog/guide/loyalty-app-for-small-business · https://paperlessperks.com/blog/apple-wallet-loyalty-cards-the-complete-guide-for-small-businesses-2026

### 1.3 QR de invitación brandeado — esfuerzo S · Ambas · impacto MEDIO
**Qué es:** generar por coach un QR con su logo al centro y su color, que hace deep-link a `/c/[slug]` (registro o instalación). El coach lo pone en su clipboard, en el gym, en Instagram, en tarjetas. Hoy EVA tiene `invite_code` pero no un QR brandeado listo para imprimir/compartir.
**Por qué:** los PTs ya usan QR brandeados para intake y referidos; "materiales con QR integrado demuestran profesionalismo" y enrutan al dashboard del coach correcto. Barato (una lib de QR + overlay de logo, reusa el motor de branding).
**Fuentes:** https://bitly.com/blog/qr-codes-for-personal-trainers/ · https://qrdex.io/blog/144-how-to-use-qr-codes-in-gyms-and-fitness-studios-10-ideas-to-engage-members-in-2026

### 1.4 Certificados/diplomas de hitos brandeados — esfuerzo S–M · Ambas · impacto MEDIO-ALTO
**Qué es:** al cumplir un hito (100 entrenamientos, -5 kg, 30 días de racha) generar un certificado/diploma con logo+color del coach, descargable como PDF y como imagen compartible. EVA **ya tiene motor de PDF brandeado** (nutrición) y generación de imagen server-side (`/api/splash`) → reuso directo, sin infra nueva.
**Por qué:** Trainerize usa milestone badges compartibles y empuja a compartir en redes; plataformas de badges white-label (Virtualbadge) tratan la "milestone compartible" como estándar. "Cada deliverable lleva TU logo, no el del software" = percepción de valor premium + retención. Sin AI (plantilla + datos).
**Fuentes:** https://help.trainerize.com/hc/en-us/articles/360041662991-Motivate-Your-Clients-with-Milestone-Badges-for-Workouts-and-Achievements · https://www.virtualbadge.io/badge-templates/custom-fitness-badge-templates

### 1.5 Watermark de marca en fotos de progreso compartidas — esfuerzo S · Ambas · impacto MEDIO
**Qué es:** cuando el alumno comparte un antes/después o foto de progreso, superponer un watermark discreto con el logo/handle del coach + su color. Opt-in del alumno; el coach elige posición/opacidad.
**Por qué:** "el watermark mantiene tu nombre/logo visible dondequiera que se comparta la imagen" — branding gratis en el feed del alumno. Varias apps de progreso ya lo hacen (y las premium *quitan* el watermark, señal de que es percibido como valor de marca). Barato: overlay canvas sobre la imagen ya optimizada del check-in.
**Fuentes:** https://watermarkly.com/ · https://www.fitbudd.com/post/how-to-brand-a-fitness-app · https://www.hevyapp.com/features/progress-photos/

### 1.6 Tarjetas compartibles auto-generadas (PR/racha/resumen) + link referido — esfuerzo M · Ambas · impacto ALTO
**Qué es:** al terminar un workout / batir un PR / cerrar una racha, generar una imagen tipo "story" con el color+logo del coach y el dato (volumen, PR, distribución muscular, racha), lista para IG stories, con un **link de referido único** al `/c/[slug]` embebido. EVA ya genera imágenes server-side (`/api/splash`/OG) → reusar.
**Por qué:** doble palanca (marca + adquisición). Fitbod/Hevy generan share cards de workout; en gyms "cada post con logro + link de referido genera ~3,2 consultas por post" y "8% de clicks sociales → visita, 30% → alta". Es la superficie que más compensa la ausencia de ícono en tienda: la marca del coach viaja en el feed del alumno.
**Fuentes:** https://www.hevyapp.com/features/shareable/ · https://fitbod.zendesk.com/hc/en-us/articles/360006427453-Sharing-a-Workout-Gym-Profile-Settings · https://blog.jericommerce.com/resources/referral-program-examples-gyms-fitness-studios

---

## 2. Sonido / haptics de marca — ¿vale?

### 2.1 Presets de sonido + haptic de marca (biblioteca curada, opt-in) — esfuerzo M · Ambas (RN mejor) · impacto MEDIO-BAJO
**Qué es:** en momentos clave (workout completo, PR, check-in enviado) reproducir un sonido corto (<1s) + un patrón de vibración de "firma". Coherente con el modelo EVA de **presets curados** (como los 14 temas y 7 loaders): NO pedirle al coach que grabe audio, sino ofrecer una pequeña biblioteca de "sound + haptic kits" que combinan con el "feel" del tema (bold/calm/techy/warm), y opt-in del alumno.
**Veredicto:** vale **con cautela**. La evidencia 2026 dice que el audio/haptic en microinteracciones "hace la app más premium y memorable" y que el multisensorial (visual+audio+haptic, tipo el logo háptico de Mastercard) fortalece reconocimiento y conexión emocional — PERO "el sonido no salva un mal producto" y mal usado es decoración molesta. Recomendación: haptics primero (barato, RN tiene `Haptics`; web tiene Vibration API solo Android), sonido como opt-in silencioso por default. No es prioridad #1, pero es un diferenciador de "premium feel" que casi nadie en fitness hace.
**Fuentes:** https://ampsoundbranding.com/audio-logo-haptic-design · https://www.uxmate-blog.com/2025/09/28/what-is-sonic-branding-the-complete-guide-to-audio-identity-and-ux/ · https://www.newsletter.designproject.io/p/sonic-branding-strategy-why-audio-design-is-your-secret-ux-weapon-in-2025

---

## 3. Copy / tono por coach (sin AI)

### 3.1 Presets de tono/voz por coach — esfuerzo M · Ambas · impacto MEDIO
**Qué es:** el copy del SISTEMA (empty states, felicitaciones, recordatorios, prompts de check-in, copy de push) cambia entre **2–3 presets de voz curados** que elige el coach: *Motivador* ("¡Vamos que puedes, crack!"), *Técnico* ("Sesión registrada. RPE promedio 7.5.") o *Cercano* ("Bien ahí 💪 nos vemos mañana"). Sin AI: son sets de strings curados, como los temas. Se persiste un `voice_preset_key` y el copy layer resuelve por key.
**Por qué:** es la palanca de **"branding behavioral"** que la ronda 1 identificó como el elemento de marca más olvidado (FitBudd): la marca gana por estar en el hábito y el tono, no solo en la paleta. "El microcopy alineado al tono introduce la personalidad de la marca de forma sutil y diferencia el producto." Las plataformas de coaching 2026 empujan a "mantener la personalidad del entrenador" en la comunicación. EVA ya tiene i18n/copy centralizado → agregar una dimensión de "tono" es una tabla de mapping, no un rewrite.
**Fuentes:** https://blog.copyfol.io/on-brand-microcopy · https://www.figma.com/community/file/855866809479506624/tone-of-voice-kit · https://truecoach.co/blog/the-best-personal-trainer-apps-with-voice-messaging-2026-guide/ · https://www.fitbudd.com/insights/white-label-fitness-app-customization-guide

---

## 4. Qué hacen las plataformas FUERA de fitness que EVA no hace

- **Softr / Kajabi / FitBudd → dominio propio como pieza central** (ver 1.1). Softr's *único* diferenciador real vs Glide es white-label + dominio propio + CSS custom. Kajabi da dominio custom y quita su marca del portal desde el plan Basic.
  Fuentes: https://www.fahimai.com/softr-vs-glide · https://www.courseplatformsreview.com/blog/kajabi-white-label/
- **Loyalty/salones → wallet passes** (ver 1.2). El mundo no-app (loyalty small-business) ya migró de "app propia" a "pase de wallet" por el 83% de desinstalación de apps standalone. EVA puede robarse ese patrón.
  Fuente: https://www.loyaltypass.co/blog/guide/loyalty-app-for-small-business
- **Kajabi / EGYM → comunidad brandeada dentro de la app** (ver 4.1 abajo). El branded app de Kajabi bundlea *community* como superficie de marca; EGYM vende "branded member app" con feed.
  Fuentes: https://help.kajabi.com/en/articles/12696396-kajabi-branded-app-faqs · https://us.egym.com/en-us/digital/brandedmemberapp
- **Email marketing white-label → envío desde el dominio del cliente** (ver 4.2 abajo). ZeptoMail/Mailgun tratan "send on behalf of clients using their domains" como estándar; EVA ya brandeó el *cuerpo* del email pero sigue enviando desde `eva-app.cl`.
  Fuente: https://www.mailgun.com/solutions/white-label-email-service/

### 4.1 Feed/comunidad in-app brandeada — esfuerzo L · Ambas · impacto MEDIO
**Qué es:** un feed/comunidad de los alumnos del coach, bajo su marca (color/logo), donde ven progreso y se apoyan. Opcional (no todo coach lo quiere). Alto esfuerzo, por eso queda abajo en el ranking, pero es una superficie de marca recurrente que Kajabi/EGYM tratan como estándar.

### 4.2 Emails desde el dominio del coach (DKIM/SPF por tenant) — esfuerzo L · Web · impacto MEDIO
**Qué es:** el email ya se ve brandeado (shippeado), pero el "From" sigue siendo `noreply@eva-app.cl`. Siguiente nivel: enviar desde `noreply@dominio-del-coach` con SPF/DKIM/CNAME por tenant (Resend/Mailgun/ZeptoMail lo soportan). Mejora deliverability y percepción ("email de MI coach, no de una plataforma"). Alto esfuerzo por el onboarding DNS por coach → parear con 1.1 (dominio propio): quien trae dominio, trae sender.
**Fuentes:** https://www.mailgun.com/solutions/white-label-email-service/ · https://dev.to/whoffagents/email-deliverability-for-saas-spf-dkim-dmarc-setup-and-resend-integration-1hpd

---

## 5. El "momento de instalación" perfecto

### 5.1 Momento de instalación PWA brandeado — esfuerzo S–M · Web · impacto ALTO
**Qué es:** hoy EVA tiene `apple-touch-icon`/manifest per-coach (el ícono ya sale brandeado). Falta el **momento**: una UI de instalación diseñada y brandeada — capturar `beforeinstallprompt`, mostrar un coach-mark con logo+color del coach ("Instala la app de [coach] en tu inicio"), disparado en el **momento correcto** (después del primer workout / primer check-in, no al aterrizar), + una hoja de instrucciones para iOS (que no soporta el prompt nativo), + rellenar `screenshots` y `description` en el manifest para que el diálogo de instalación de Chrome/Android se transforme en el grande tipo app-store.
**Por qué:** el ícono en home screen es la palanca #1 (ronda 1: "el touchpoint más frecuente de la relación"); el momento de instalación es el **embudo** hacia ese ícono, y hoy está sin diseñar. Best practice 2026: no forzar el banner, ponerlo tras un journey crítico, con botón custom, y aprovechar `description`+`screenshots` del manifest para el diálogo enriquecido. Bajo esfuerzo, alto retorno.
**Fuentes:** https://web.dev/learn/pwa/installation-prompt · https://simicart.com/blog/pwa-add-to-home-screen/ · https://love2dev.com/blog/beforeinstallprompt/ · https://medium.com/anuix/how-to-customize-the-add-to-home-screen-banner-for-a-pwa-68f9d1f00830

### 5.2 (Cierre de borde) `background_color` del splash Android = color de marca — esfuerzo S · Ambas · impacto BAJO-MEDIO
Gap conocido (G6 de la auditoría): el `background_color` del manifest queda `#000000` para coach/org, así que el splash nativo Android arranca negro en vez del color del coach. Fix de una línea por-tenant; cierra la última costura del "primer frame es EVA".

---

## Nota de método
14 búsquedas frescas (jul-2026) cubriendo: dominio/subdominio multi-tenant, QR de invitación, certificados/badges de hito, watermark de fotos, sonic/haptic branding, presets de tono/microcopy, Kajabi/Softr/Glide, Booksy/Fresha, wallet passes, instalación PWA, email sender por dominio, share cards + referidos, check-in con personalidad. Todas las mejoras propuestas son deterministas (CERO AI) y reusan motores que EVA ya tiene (branding engine, PDF brandeado, generación de imagen `/api/splash`, i18n/copy centralizado, política de subdominios/cookies).
