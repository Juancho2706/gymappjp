---
status: draft
owner: product-engineering
last_verified: "2026-08-19"
canonical: false
---

# SPEC — Compartir Entreno («share card» post-sesión)

Idea del socio (WhatsApp 19-08) + decisiones del owner (19-08, opción múltiple). Mockup aprobable:
artifact `3d5e94c1-08ea-4aa0-b0a1-bcc85295672c` (9 artboards). Investigación técnica/mercado/legal
con fuentes: journal del workflow `wf_e2a28c4f-23e` (sesión 19-08).

## Qué es

Al terminar un entrenamiento, el alumno compone una imagen (su foto opcional + resumen del día +
músculos trabajados + marca del coach) y la comparte a cualquier red desde la hoja nativa, con
salto directo a Instagram/Facebook Stories. Cada share es publicidad orgánica DEL COACH (loop:
share → audiencia del alumno ve la marca → leads al coach → retención de coaches EVA).

## Decisiones del owner (19-08 — no re-preguntar)

1. **Lanzamiento: todo junto en el binario 1.1.2** (core + Stories directo). Nada por OTA antes.
2. **Editor completo en v1**: 6 presets + toggles + paso «Acomodar» con stickers arrastrables.
3. **Growth completo en v1**: @handle impreso + atribución first-party + evento de coach.
4. **Facebook App ID**: trámite del owner esta semana (developers.facebook.com) — BLOQUEANTE del
   binario. El Pixel ID existente NO sirve.
5. El botón de compartir del resumen debe ser llamativo (glow + shimmer 2 pasadas + redes
   visibles + mini-thumbnail del card real) y entrar ~1,2-1,8 s después del confetti.
6. PWA: fase 2 (Web Share API con files + rasterizado canvas; sin Stories directo ni Póster).

## Flujo (4 pasos)

1. **Resumen** (rework de `WorkoutSummaryOverlay`/`SessionCompleteV3`): volumen héroe, mapa
   anatómico real, récords, CTA de compartir prominente.
2. **Editor**: preset (6) + fuente de foto (cámara frontal por defecto · galería · sin foto =
   fondo de marca) + fondo claro/oscuro/**transparente** (sticker mode: se pega sobre la foto
   DENTRO de Instagram) + 10 toggles: volumen, duración, series, récords, 1RM, músculos
   (silueta/chips/ambos), logo coach, @handle, fecha, racha.
3. **Acomodar**: cada elemento es sticker arrastrable (guías de alineación, mantener apretado =
   quitar, slider de tamaño, flip frente⇄espalda). Cambiar de preset resetea posiciones a los
   defaults del nuevo; los toggles se conservan.
4. **Compartir**: botones de destino EXPLÍCITOS — `Stories` (IG directo) · `WhatsApp` · `Guardar`
   · `Más…` (hoja nativa: TikTok/FB/Telegram/X/todo). Los botones por destino son además la única
   medición fiable del target (Android no reporta la app elegida).

## Los 6 presets

Placa (default) · Heatmap (sin foto, cuerpo gigante) · Sello (tarjeta-recibo lateral) · Marcador
(scoreboard broadcast) · Póster (número gigante DETRÁS del sujeto vía segmentación nativa del OS;
sin segmentación degrada a número-adelante con alpha bajo) · Set-list (los ejercicios del día con
series×reps×kg — el pedido literal del socio).

## Reglas no negociables

- **La marca del coach no se edita**: colores SIEMPRE del branding, tipografía fija. El alumno
  controla posición/tamaño/on-off, jamás fuentes ni colores. Todo card que sale de EVA se ve
  profesional; white-label estricto (sin logo EVA en el card; footer `«marca» · via EVA` actual
  del motor se mantiene como única mención).
- **Privacidad**: la imagen se compone y rasteriza ON-DEVICE; la foto jamás sube a servidores.
- **Ley 21.719**: los eventos de analytics NO llevan stats de salud (ni kg, ni músculos, ni
  ejercicios) — solo `card_kind`, `style`, `has_photo`, `target`. Los datos de salud son
  sensibles y el interés legítimo no los cubre.
- Compartir es SIEMPRE acción explícita del alumno; nada se publica solo.

## Growth (v1, completo)

- **@handle del coach impreso** junto al footer de marca (mecanismo principal — sobrevive a
  screenshots y re-posts; patrón Everfit). Campo nuevo `coaches.instagram_handle` + input en
  Mi Marca con validación de formato.
- **Atribución first-party, sin SDKs** (Branch/AppsFlyer descartados — el alta ocurre en la web):
  el link del share lleva `?ref={client_id_corto}&src=share_card&k={card_kind}`; `/join/[código]`
  captura y persiste; `clients` gana columnas de referral (DDL aditiva + grants).
- **Evento de cierre `coach_client_referred`** — la métrica que prueba que la feature trae altas.
- Patrón Strava para IG: al tocar Stories se copia el link de invitación al portapapeles + toast
  «pegalo en el sticker Link de tu historia» (Meta no permite adjuntar links programáticamente).
- QR: OFF por defecto; solo disponible en la variante «Guardar» (inescaneable en una story desde
  el mismo teléfono; caso real = presencial).

## Fuera de alcance v1

TikTok Share Kit directo (trámite caro, PHAsset, fingerprints vs Play App Signing — el share
sheet lo cubre) · PWA (fase 2) · auto-selección de foto · video cards · compartir programado.
