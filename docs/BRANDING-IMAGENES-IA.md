# EVA — Guía de branding para generación de imágenes (IA)

Documento pensado para **pegar en el contexto** de un generador de imágenes (Midjourney, DALL·E, Ideogram, etc.) o como **system prompt** auxiliar. La marca pública del producto es **EVA** (plataforma B2B para personal trainers y coaches: rutinas, nutrición, alumnos, app white-label).

---

## 1. Identidad en una frase

**EVA** es software **premium, técnico y limpio** para escalar un negocio de coaching fitness: sensación de **control, datos y profesionalidad** (no “gym bro” gritón; más **arquitecto / científico / SaaS de alto nivel**).

---

## 2. Paleta de color (usar estos hex en prompts)

### Marca sistema (EVA / interfaz por defecto)

| Rol | Hex | Uso en imagen |
|-----|-----|----------------|
| **Primary (acento principal)** | `#007AFF` | Botones principales, links, focos, brillos suaves (azul iOS / eléctrico). |
| **Primary glow (referencia)** | `rgba(0, 122, 255, 0.4)` | Halos / sombras alrededor de CTAs o elementos hero. |
| **Cian acento** | `#00E5FF` | Detalles secundarios, gráficos, partículas de luz, acentos en degradados. |
| **Violeta (degradados de titular)** | aprox. `#5856D6` a violetas suaves | Segundo color en textos con gradiente (junto al azul y cielo). |
| **Cielo en degradados** | tonos **sky** (azul cielo profundo a claro) | Degradados tipo “sky → primary → violet”. |
| **Éxito / marca coach por defecto** | `#10B981` | Solo si la escena es “marca del coach” o éxito; **no** sustituye al azul EVA en la app core. |
| **Rojo error** | `#FF3B30` | Muy puntual (alertas), no dominar la composición. |

### Fondos y superficies (modo claro — landing típica)

| Rol | Hex |
|-----|-----|
| Fondo página | `#F5F5F5` (gris muy claro, casi blanco) |
| Tarjetas / superficies | `#FFFFFF` |
| Texto principal | `#121212` |
| Texto secundario | `#6B7280` |
| Bordes sutiles | negro ~10% opacidad |

### Modo oscuro (alternativa premium)

| Rol | Hex |
|-----|-----|
| Fondo | `#121212` |
| Tarjetas | `#1E1E1E` |
| Texto principal | `#F8F9FA` |
| Texto secundario | `#A1A1AA` |

---

## 3. Tipografía (para briefing textual en la imagen)

- **Texto UI y cuerpo:** sans geométrica **limpia y legible** (equivalente visual: **Inter**).
- **Titulares / marca “EVA”:** sans **más condensada y fuerte** (equivalente: **Montserrat** en peso **black / extrabold**, tracking algo ajustado).

Si la IA debe “dibujar” texto: palabra **EVA** en mayúsculas, sans bold, moderna, sin serif.

---

## 4. Forma del UI (lenguaje visual)

- **Esquinas:** redondeo generoso (aprox. **12px** base en tokens; botones hero a menudo **pill / rounded-full**).
- **Botones CTA:** forma **píldora**, fondo **azul `#007AFF`**, texto blanco, sombra suave tipo **glow azul** (no neón agresivo).
- **Navegación superior:** barra **flotante tipo cápsula** (“pill nav”), **glass** (fondo semitransparente + **blur**).
- **Tarjetas:** blanco sobre gris claro, borde fino; en oscuro: gris muy oscuro elevado.
- **Textura:** opcional **grid cuadriculado muy sutil** (cuaderno de ingeniero) y/o **ruido film** muy leve (“landing noise”).
- **Hero:** **orbs / blobs** difuminados (azul primario muy suave + gris o cielo), sensación **tech / espacial suave**; puede evocar **shader abstracto** (luz suave, no ciencia ficción barata).

Evitar: skeuomorfismo pesado, colores ácidos saturados sin control, tipografía script o “gótica gym”.

---

## 5. Contenido y metáforas que encajan

- **Dispositivos:** iPhone / mockups de **app móvil** limpia, dashboard con **gráficos**, listas de ejercicios, check-ins.
- **Dominio:** **dumbbells**, **datos**, **agenda**, **progreso**, **marca personal del coach** (white-label).
- **Público:** entrenador/coach profesional, **Chile / hispanohablante** es coherente con copy (no obligatorio en la imagen).
- **Tono emocional:** confianza, **escala**, **tecnología accesible**, **premium accesible** (no banco suizo frío; no startup infantil con mascota).

---

## 6. Activos de marca (referencia de archivos en el repo)

Rutas bajo `public/LOGOS/` (para que tú o la IA conozcan el estilo, no hace falta incrustarlos en todos los prompts):

- **Wordmark:** `eva-wordmark-outline.png`
- **Marca figurativa claro:** `LOGO NEGRO SIN LETRAS SIN BG BORDE BLANCO.png`
- **Icono app:** `eva-icon.png`
- **Open Graph (composición wide):** `eva-og.png` (1920×1080)

---

## 7. Prompts cortos listos para copiar (inglés suele funcionar mejor en IA de imagen)

**A) Hero abstracto (sin texto o con “EVA” mínimo):**

> Premium B2B fitness SaaS hero, clean minimal interface mockup, floating pill navigation bar with glassmorphism, soft electric blue `#007AFF` glow, subtle cyan `#00E5FF` accents, very light gray background `#F5F5F5`, white cards, faint engineering grid texture, soft blurred light orbs, Montserrat-black headline feel, Inter-like UI type, high-end tech dashboard mood, no clutter, 8k clean lighting

**B) Marca + dispositivo:**

> iPhone mockup showing a clean fitness coach dashboard app, EVA-style UI, primary blue `#007AFF`, white and pale gray `#F5F5F5`, pill-shaped blue CTA button with soft blue glow shadow, modern sans-serif typography, professional personal trainer software, subtle gradient sky-blue to violet in headline area, minimalist

**C) Modo oscuro premium:**

> Dark mode SaaS dashboard for fitness coaches, charcoal `#121212` background, card `#1E1E1E`, accents `#007AFF` and `#00E5FF`, subtle borders, data charts, calm premium lighting, not cyberpunk, not neon gamer

**D) Solo logo mood (sin reproducir logo exacto si hay riesgo de marca):**

> Abstract geometric mark suggesting fitness and data, flat modern, blue `#007AFF` and white, minimal, could accompany word EVA in Montserrat black, tech startup aesthetic

---

## 8. Negativo (qué pedir que evite la IA)

Evitar en el prompt o añadir como **negative prompt**:

> cluttered UI, neon green dominant, aggressive bodybuilding poster, comic sans, grunge textures, steampunk, cartoon mascot, stock photo smiling excessively, low resolution, muddy colors, purple-pink gradient cliché startup 2016

---

## 9. Metadatos del producto (contexto copy, no obligatorio en la imagen)

- **Nombre aplicación:** EVA  
- **Tagline orientativo (ES):** escala tu negocio de personal training y coaching; rutinas, nutrición, alumnos, app propia.  
- **Mercado:** fitness B2B, SaaS, white-label para coaches.

---

*Generado a partir del código y tokens del repositorio (`globals.css`, `brand-assets.ts`, `layout.tsx`, landing `page.tsx`). Actualiza este documento si cambias `--primary`, fuentes o nombre de marca.*
