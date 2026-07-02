# INFORME — White-label "que se sienta suyo" (2026-07-02)

> Síntesis ejecutiva. Detalle: `audit-codigo.md` (inventario + gaps con archivo:línea + arquitectura de presets) y `research-mejores-practicas.md` (benchmark competidores + evidencia, fuentes jul-2026).

---

## 1. Dónde está parado EVA (la buena noticia primero)

El **motor** es estado del arte: `@eva/brand-kit` deriva una rampa completa + contraste WCAG automático desde 1-3 hex (mismo patrón que Material 3 seed-color), compartido web+RN por construcción. 13 elementos brandeables hoy (colores, 12 fuentes, 7 loaders, logo claro/oscuro, mensajes). El login del alumno ya es la superficie MEJOR brandeada. Y el benchmark dice que los líderes cobran el white-label aparte (Trainerize ~US$169/mes, FitBudd US$149+75/mes) — **EVA dándolo en Pro sin fee extra es un diferenciador real de pricing**.

**El problema no es el motor — es que la marca se corta en los bordes.** El alumno ve la marca del coach dentro de la app, pero cada vez que la app lo toca DESDE AFUERA, ve EVA:

## 2. Los gaps que rompen la ilusión (rankeados por percepción de marca)

| # | Gap | Qué ve el alumno hoy | Impacto |
|---|---|---|---|
| G1 | **Emails** (bienvenida, recordatorios, drip) | Header azul EVA + wordmark EVA; el coach solo en el texto | ALTO — es el canal "oficial" |
| G2 | **Push notifications** | Título "EVA Fitness" + ícono EVA hardcodeado en sw.js | ALTO — 20% open-rate vs 2% email; toque de marca de ALTA frecuencia |
| G-icon | **Ícono de instalación PWA en iOS** | apple-touch-icon fijo EVA (iOS ignora el manifest) | ALTO — el benchmark lo llama "la palanca #1": el ícono en el home screen se ve 5-10 veces/semana. El manifest per-coach NO está deprecado (nota de memoria stale) — falta solo el apple-touch-icon SSR por coach |
| G11 | OG/share card (links compartidos) | Imagen EVA fija | MEDIO — el "Compartí tu logro" nuevo comparte marca EVA, no del coach |
| G6 | Splash/background del manifest | Negro fijo | MEDIO |
| G8 | Logo en PDFs | Se resuelve client-side por fetch; si falla, PDF sin logo | MEDIO |
| — | Offline screen, error pages | Parcial | BAJO |

**Insight del research que ordena la inversión:** el branding que más retiene no es el visual sino el **conductual** — check-ins, fotos y hábitos atados a la marca crean el touchpoint diario. Visual parejo en TODAS las superficies + rituales diarios con la marca = "la app de mi coach".

## 3. Temas curados (tu decisión) — arquitectura lista

Matar la rueda de color es **consenso 2026** (curado > picker libre; el picker produce marcas ilegibles y "baratas"). Factibilidad: ALTA — el motor ya deriva todo desde semillas.

**Contrato del preset** (en `packages/brand-kit/presets.ts`, compartido web+RN):
```
BrandPreset = { key, label, brandColor, secondaryColor, accentLight?, accentDark?,
                fontKey (de las 12), loaderVariant, neutralTint, feel: bold|calm|techy|warm }
```
- **Cada preset pasa por el clamp WCAG existente → un tema curado NUNCA puede ser ilegible, en claro ni oscuro** (test de CI sobre el catálogo con `contrastReport`, gate que ya existe).
- DB: 1 columna aditiva `theme_preset_key` + su GRANT (lección 42501 aprendida). El catálogo vive en código → **podés retocar un preset y todos los coaches que lo usan mejoran solos**, sin migrar filas.
- **Grandfather sin dolor**: coaches existentes con color custom siguen igual (`NULL` = modo legacy); la rueda se OCULTA de la UI pero su columna se respeta. Sugerencia opcional: "tu marca se parece a Ember" (distancia de hue) — nunca auto-aplicar.
- Propongo lanzar con **12-16 presets** (4 feels × 3-4 paletas: Ember, Sport azul, Aqua, Violeta, Verde bosque, Mono/Ink, Coral, Dorado...) — cada uno con fuente y loader sugeridos que el coach puede sobreescribir (o no — decisión abajo).

## 4. Login con opciones + loaders (tus otras dos decisiones)

- **Login**: ya se brandea (hero, logo, fuente, tagline, animación de entrada). Lo pedido es aditivo: `login_layout_key` con 3-4 variantes de layout/animación (ej: "Clásico" actual, "Hero grande" logo centrado con fade, "Energía" con animación de entrada del loader del coach, "Minimal" tipografía pura). Cada variante hereda el tema — cero color nuevo. El research advierte: video de fondo pesa; variantes = CSS/motion liviano.
- **Loaders**: hoy hay 7 (6 variantes + legacy) y desde ayer se ven en la preview. "Crear el suyo" sin AI = **compositor simple**: elegir símbolo (su logo | inicial | ícono de la librería) × animación (pulso | órbita | barra | respiración) × ¿texto?. Son las mismas piezas de las variantes actuales parametrizadas — no es un editor libre, es un combinador curado. Esfuerzo M.

## 5. RN mobile (pa' que el plan ya lo contemple)

La decisión "una app en store + branding in-app post-login" es exactamente el patrón que el research recomienda (config-driven theming + temas por servidor, sin review de store). Deuda actual de paridad RN: color2, fuente, accents por-modo, neutral_tint, logo dark y las 6 animaciones de loader NO están espejadas — **los presets nacen en `packages/brand-kit` justamente pa' que RN los consuma gratis** cuando retomemos ese track.

## 6. Roadmap propuesto (fases)

| Fase | Qué | Esfuerzo |
|---|---|---|
| **W1 Presets** | Catálogo 12-16 temas + picker nuevo en Mi Marca (muere la rueda) + migración aditiva + CI de contraste | M |
| **W2 Bordes de marca** | Emails brandeados (logo+color del coach en base-layout) + push con nombre/ícono del coach + apple-touch-icon por coach + OG del share | M |
| **W3 Login + loaders** | 3-4 layouts de login + compositor de loader | M |
| **W4 Pulido** | Splash manifest, PDFs server-side, offline screen | S |

W1 y W2 son las que mueven la percepción según la evidencia; W3 es la que más "se siente" pa'l coach.

## Decisiones que necesito del CEO

1. **¿Apruebo W1 ya?** (presets + matar la rueda). Sub-decisión: ¿el preset fija fuente+loader como sugerencia EDITABLE (recomiendo) o el tema lo define TODO cerrado?
2. **¿W2 entra antes o después del merge a master?** (emails/push tocan superficies vivas de prod — recomiendo rama aparte post-merge).
3. **Cantidad de presets iniciales**: ¿12-16 está bien o querés más/menos?
4. **Compositor de loader**: ¿va en W3 o te alcanza con las 7 variantes + preview arreglada por ahora?
