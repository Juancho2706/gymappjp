# PLAN MAESTRO: REWORK VISUAL COMPLETO — EVA GYM APP
**Proyecto:** EVA — SaaS B2B de Coaching Fitness  
**Rama de trabajo:** `pruebasui` (crear desde `master`)  
**Fecha:** 2026-04-18  
**Alcance:** Rework visual y UX total — todos los componentes, todas las páginas

---

## CONTEXTO

EVA es una plataforma SaaS premium donde los entrenadores (coaches) gestionan a sus alumnos con programas de entrenamiento, nutrición, check-ins visuales y más. Actualmente usa un design system basado en iOS blue (#007AFF), glassmorphism básico, Montserrat + Inter, y un dark mode oscuro neutro. El producto es técnicamente sólido pero visualmente genérico — se parece demasiado a cualquier otro SaaS de fitness del mercado.

**Objetivo de este rework:** Transformar EVA en una plataforma que visualmente comunique "herramienta de élite para coaches de élite" — que cuando un coach potencial la vea por primera vez diga "quiero usar esto." El rework mantiene exactamente la misma mecánica y funcionalidad, pero redefine completamente la identidad visual, la jerarquía de información, los patrones de interacción y la experiencia emocional del producto.

---

## FASE 0: SETUP INICIAL

### 0.1 — Crear Branch de Trabajo

```bash
git checkout -b pruebasui
```

---

## FASE 1: NUEVO DESIGN SYSTEM — "CARBON ATHLETE"

Esta es la base de todo el rework. Antes de tocar una sola página, redefinimos el sistema de diseño completo. Todos los cambios posteriores dependen de esta fase.

### 1.1 — Nueva Paleta de Colores

Nos alejamos del azul iOS genérico y adoptamos una paleta que evoca **rendimiento, precisión y élite deportiva**. La inspiración viene de la Fórmula 1, equipos de atletismo de alto rendimiento, y plataformas como Whoop y Volt Athletics.

#### Paleta Principal (CSS Variables en `globals.css`)

```css
/* ============================================================
   CARBON ATHLETE — Design System 2.0
   EVA — Elite Coaching Platform
   ============================================================ */

:root {
  /* === BACKGROUND SYSTEM === */
  --background: #F7F7F8;          /* Off-white premium, no puro blanco */
  --background-secondary: #EFEFF1; /* Superficies secundarias */
  --foreground: #0A0A0F;          /* Negro profundo, no puro negro */

  /* === SURFACE SYSTEM === */
  --card: #FFFFFF;
  --card-foreground: #0A0A0F;
  --popover: #FFFFFF;
  --popover-foreground: #0A0A0F;

  /* === BRAND PRIMARIO: Violeta Élite === */
  /* Reemplaza el iOS blue por un violeta profundo y eléctrico */
  --primary: #6B21FE;             /* Violeta eléctrico */
  --primary-light: #8B5BFF;       /* Violeta claro para hover */
  --primary-dark: #5010D4;        /* Violeta oscuro para pressed */
  --primary-foreground: #FFFFFF;
  --primary-rgb: 107, 33, 254;    /* Para uso en rgba() */

  /* === ACENTO SECUNDARIO: Mint Neon === */
  --accent: #00F5C4;              /* Verde menta eléctrico */
  --accent-foreground: #0A0A0F;
  --accent-rgb: 0, 245, 196;

  /* === SISTEMA SEMÁNTICO === */
  --success: #10B981;             /* Esmeralda */
  --success-light: #D1FAE5;
  --success-foreground: #FFFFFF;

  --warning: #F59E0B;             /* Ámbar */
  --warning-light: #FEF3C7;
  --warning-foreground: #FFFFFF;

  --destructive: #EF4444;         /* Rojo */
  --destructive-light: #FEE2E2;
  --destructive-foreground: #FFFFFF;

  --info: #3B82F6;                /* Azul info */
  --info-light: #DBEAFE;

  /* === NEUTRAL SCALE === */
  --secondary: #F1F0F5;
  --secondary-foreground: #0A0A0F;
  --muted: #F1F0F5;
  --muted-foreground: #71717A;

  /* === BORDERS === */
  --border: rgba(10, 10, 15, 0.1);
  --border-strong: rgba(10, 10, 15, 0.2);
  --input: rgba(10, 10, 15, 0.08);
  --ring: #6B21FE;

  /* === SIDEBAR === */
  --sidebar: #FFFFFF;
  --sidebar-foreground: #0A0A0F;
  --sidebar-primary: #6B21FE;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #F1F0F5;
  --sidebar-accent-foreground: #0A0A0F;
  --sidebar-border: rgba(10, 10, 15, 0.08);

  /* === CHARTS (5-color system) === */
  --chart-1: #6B21FE;   /* Violeta */
  --chart-2: #00F5C4;   /* Mint */
  --chart-3: #F59E0B;   /* Ámbar */
  --chart-4: #EF4444;   /* Rojo */
  --chart-5: #3B82F6;   /* Azul */

  /* === RADIUS SYSTEM === */
  --radius: 1rem;          /* 16px base — más redondeado que antes */
  --radius-xs: 0.375rem;  /* 6px — inputs pequeños */
  --radius-sm: 0.625rem;  /* 10px — badges, pills */
  --radius-md: 0.75rem;   /* 12px — botones */
  --radius-lg: 1rem;      /* 16px — cards */
  --radius-xl: 1.25rem;   /* 20px — modales */
  --radius-2xl: 1.5rem;   /* 24px — hero sections */
  --radius-full: 9999px;  /* Full circle */

  /* === SHADOWS === */
  --shadow-xs: 0 1px 2px rgba(10, 10, 15, 0.05);
  --shadow-sm: 0 2px 8px rgba(10, 10, 15, 0.06), 0 1px 2px rgba(10, 10, 15, 0.04);
  --shadow-md: 0 4px 16px rgba(10, 10, 15, 0.08), 0 2px 4px rgba(10, 10, 15, 0.04);
  --shadow-lg: 0 8px 32px rgba(10, 10, 15, 0.12), 0 4px 8px rgba(10, 10, 15, 0.06);
  --shadow-xl: 0 16px 48px rgba(10, 10, 15, 0.16), 0 8px 16px rgba(10, 10, 15, 0.08);
  --shadow-2xl: 0 24px 64px rgba(10, 10, 15, 0.20), 0 12px 24px rgba(10, 10, 15, 0.10);

  /* Glow especial para elementos de acción */
  --shadow-glow: 0 0 24px rgba(107, 33, 254, 0.35), 0 4px 16px rgba(107, 33, 254, 0.20);
  --shadow-glow-accent: 0 0 20px rgba(0, 245, 196, 0.40), 0 4px 12px rgba(0, 245, 196, 0.20);
  --shadow-glow-success: 0 0 20px rgba(16, 185, 129, 0.35);

  /* === TRANSITIONS === */
  --transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);

  /* === THEME WHITE-LABEL (overridable por coach) === */
  --theme-primary: 107, 33, 254;
  --theme-primary-hex: #6B21FE;
}

/* ============================================================
   DARK MODE — Carbon Obsidian
   ============================================================ */
.dark {
  --background: #09090E;          /* Casi negro, profundo */
  --background-secondary: #111118; /* Un tono más claro */
  --foreground: #F0F0F5;          /* Blanco ligeramente cálido */

  --card: #131320;                /* Cards levemente más claras que bg */
  --card-foreground: #F0F0F5;
  --popover: #1A1A28;
  --popover-foreground: #F0F0F5;

  /* Primary se vuelve más brillante en dark */
  --primary: #8B5BFF;
  --primary-light: #A07AFF;
  --primary-dark: #6B21FE;
  --primary-foreground: #FFFFFF;
  --primary-rgb: 139, 91, 255;

  --accent: #00F5C4;              /* Mint se mantiene igual */
  --accent-foreground: #09090E;

  --success: #34D399;
  --warning: #FBBF24;
  --destructive: #F87171;

  --secondary: #1E1E2E;
  --secondary-foreground: #F0F0F5;
  --muted: #1E1E2E;
  --muted-foreground: #A1A1B5;

  --border: rgba(240, 240, 245, 0.08);
  --border-strong: rgba(240, 240, 245, 0.15);
  --input: rgba(240, 240, 245, 0.06);
  --ring: #8B5BFF;

  --sidebar: #0F0F1C;
  --sidebar-foreground: #F0F0F5;
  --sidebar-primary: #8B5BFF;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #1E1E2E;
  --sidebar-accent-foreground: #F0F0F5;
  --sidebar-border: rgba(240, 240, 245, 0.06);

  --shadow-glow: 0 0 32px rgba(139, 91, 255, 0.50), 0 4px 16px rgba(139, 91, 255, 0.30);
  --shadow-glow-accent: 0 0 24px rgba(0, 245, 196, 0.50), 0 4px 12px rgba(0, 245, 196, 0.25);
}
```

### 1.2 — Nueva Tipografía

Reemplazamos Montserrat + Inter por una pareja más moderna y premium:

- **Display/Headings:** `Space Grotesk` — geométrico, moderno, con carácter. Evoca tecnología de alto rendimiento. Pesos: 500, 600, 700.
- **Body/UI:** `Plus Jakarta Sans` — más refinado que Inter, con formas más amigables pero igualmente legibles. Pesos: 400, 500, 600.
- **Datos/Números:** `Space Grotesk` también — sus números son excelentes para métricas.

**Implementación en `layout.tsx`:**
```tsx
import { Space_Grotesk, Plus_Jakarta_Sans } from 'next/font/google'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})
```

**CSS Variables de tipografía:**
```css
--font-sans: var(--font-plus-jakarta), system-ui, sans-serif;
--font-display: var(--font-space-grotesk), system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale tipográfico */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */
--text-5xl: 3rem;      /* 48px */
--text-6xl: 3.75rem;   /* 60px */
--text-7xl: 4.5rem;    /* 72px */
```

### 1.3 — Nuevo Sistema de Clases Utility

Reemplazar y expandir las clases utility en `globals.css`:

```css
/* ============================================================
   UTILITY CLASSES — Carbon Athlete Design System
   ============================================================ */

/* Glassmorphism Tiers */
.glass-subtle {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.glass-medium {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.glass-strong {
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

/* Light mode glass */
.light .glass-subtle { background: rgba(255, 255, 255, 0.60); border-color: rgba(10,10,15,0.08); }
.light .glass-medium { background: rgba(255, 255, 255, 0.80); border-color: rgba(10,10,15,0.10); }

/* Gradient Mesh Backgrounds */
.bg-mesh-violet {
  background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(107,33,254,0.15) 0%, transparent 60%);
}

.bg-mesh-mint {
  background: radial-gradient(ellipse 80% 60% at 50% 120%, rgba(0,245,196,0.12) 0%, transparent 60%);
}

.bg-aurora {
  background: 
    radial-gradient(ellipse 60% 40% at 20% 30%, rgba(107,33,254,0.12) 0%, transparent 50%),
    radial-gradient(ellipse 50% 30% at 80% 70%, rgba(0,245,196,0.10) 0%, transparent 50%),
    radial-gradient(ellipse 40% 50% at 60% 10%, rgba(139,91,255,0.08) 0%, transparent 50%);
}

/* Glow Effects */
.glow-primary {
  box-shadow: var(--shadow-glow);
}

.glow-accent {
  box-shadow: var(--shadow-glow-accent);
}

.glow-success {
  box-shadow: var(--shadow-glow-success);
}

/* Text Gradients */
.text-gradient-primary {
  background: linear-gradient(135deg, #6B21FE 0%, #A07AFF 50%, #00F5C4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-gradient-gold {
  background: linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Number display font */
.font-metric {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* Divider gradient */
.divider-gradient {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-strong), transparent);
}

/* Card Shine Effect */
.card-shine {
  position: relative;
  overflow: hidden;
}
.card-shine::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.04),
    transparent
  );
  transition: left 600ms ease;
}
.card-shine:hover::before {
  left: 100%;
}

/* Noise Texture Overlay */
.noise {
  position: relative;
}
.noise::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.03;
  border-radius: inherit;
  pointer-events: none;
}

/* Skeleton loading */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--muted) 25%,
    color-mix(in srgb, var(--muted) 70%, white) 50%,
    var(--muted) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-wave 1.5s ease-in-out infinite;
}

@keyframes skeleton-wave {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: var(--shadow-glow); }
  50% { box-shadow: 0 0 40px rgba(107, 33, 254, 0.60), 0 8px 24px rgba(107, 33, 254, 0.35); }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes aurora-shift {
  0%, 100% { transform: translate(0%, 0%) scale(1); }
  33% { transform: translate(3%, -4%) scale(1.05); }
  66% { transform: translate(-2%, 3%) scale(0.98); }
}

.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
.animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.animate-slide-down { animation: slideDown 0.4s ease-out forwards; }
.animate-scale-in { animation: scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.animate-glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
.animate-float { animation: float 4s ease-in-out infinite; }
.animate-aurora { animation: aurora-shift 8s ease-in-out infinite; }

/* Safe Areas */
.pt-safe { padding-top: env(safe-area-inset-top); }
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
.pl-safe { padding-left: env(safe-area-inset-left); }
.pr-safe { padding-right: env(safe-area-inset-right); }

/* Scrollbar Styling */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: var(--border-strong); 
  border-radius: 3px; 
}
::-webkit-scrollbar-thumb:hover { 
  background: var(--muted-foreground); 
}

/* Selection */
::selection {
  background: rgba(107, 33, 254, 0.25);
  color: var(--foreground);
}
```

### 1.4 — Componentes Base Rediseñados

#### `components/ui/button.tsx` — Nuevas variantes

```tsx
const buttonVariants = cva(
  // Base: más sólido, border-radius redondeado, font display
  `inline-flex items-center justify-center gap-2 whitespace-nowrap 
   font-sans font-semibold tracking-tight
   rounded-[var(--radius-md)] transition-all duration-200
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
   disabled:pointer-events-none disabled:opacity-40
   active:scale-[0.97] select-none`,
  {
    variants: {
      variant: {
        // Primario: Violeta eléctrico con glow
        default: `bg-primary text-primary-foreground 
                  shadow-[0_2px_8px_rgba(var(--primary-rgb),0.35)]
                  hover:bg-primary-light hover:shadow-[0_4px_16px_rgba(var(--primary-rgb),0.50)]
                  hover:-translate-y-px`,

        // Secondario: outline limpio
        outline: `border-2 border-primary text-primary bg-transparent
                  hover:bg-primary hover:text-primary-foreground
                  hover:shadow-[0_2px_8px_rgba(var(--primary-rgb),0.25)]`,

        // Ghost: ultra sutil
        ghost: `text-foreground hover:bg-muted hover:text-foreground`,

        // Glass: glassmorphism
        glass: `bg-white/10 dark:bg-white/6 text-foreground
                border border-white/20 dark:border-white/10
                backdrop-blur-sm
                hover:bg-white/20 dark:hover:bg-white/12`,

        // Destructivo: rojo
        destructive: `bg-destructive text-destructive-foreground
                      hover:bg-destructive/90
                      shadow-[0_2px_8px_rgba(239,68,68,0.30)]`,

        // Secondary: neutro
        secondary: `bg-secondary text-secondary-foreground
                    hover:bg-muted`,

        // Link
        link: `text-primary underline-offset-4 hover:underline p-0 h-auto`,

        // Mint accent
        accent: `bg-accent text-accent-foreground
                 shadow-[0_2px_8px_rgba(0,245,196,0.35)]
                 hover:opacity-90 hover:shadow-[0_4px_16px_rgba(0,245,196,0.50)]
                 hover:-translate-y-px`,
      },
      size: {
        xs: `h-7 px-2.5 text-xs rounded-[var(--radius-xs)]`,
        sm: `h-8 px-3 text-sm`,
        default: `h-10 px-4 text-sm`,
        lg: `h-12 px-6 text-base`,
        xl: `h-14 px-8 text-lg`,
        icon: `h-10 w-10 p-0`,
        'icon-sm': `h-8 w-8 p-0`,
        'icon-xs': `h-6 w-6 p-0`,
        'icon-lg': `h-12 w-12 p-0`,
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)
```

#### `components/ui/card.tsx` — Nuevo diseño

```tsx
// Card base: fondo limpio, shadow sutil, sin blur pesado
// En dark mode: ligero glassmorphism
const Card = ({ className, ...props }) => (
  <div
    className={cn(
      // Light: blanco con shadow
      'bg-card text-card-foreground rounded-[var(--radius-lg)]',
      'border border-border shadow-sm',
      'transition-shadow duration-200',
      // Dark: glassmorphism sutil
      'dark:bg-card dark:border-border dark:shadow-lg',
      className
    )}
    {...props}
  />
)

// PremiumCard: con shine effect y glow opcional
const PremiumCard = ({ glow = false, className, ...props }) => (
  <div
    className={cn(
      'card-shine bg-card border border-border rounded-[var(--radius-xl)]',
      'shadow-md transition-all duration-300',
      'hover:shadow-lg hover:-translate-y-0.5',
      glow && 'glow-primary',
      className
    )}
    {...props}
  />
)
```

#### `components/ui/input.tsx` — Rediseño

```tsx
// Input más premium: fondo sutil, borde fino, focus con glow
const Input = ({ className, ...props }) => (
  <input
    className={cn(
      'flex h-11 w-full',
      'rounded-[var(--radius-md)] px-4',
      'bg-background border border-border',
      'text-sm font-sans placeholder:text-muted-foreground',
      'transition-all duration-150',
      'focus:outline-none focus:border-primary',
      'focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)]',
      'hover:border-border-strong',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      className
    )}
    {...props}
  />
)
```

### 1.5 — Sistema de Iconos

Mantener Lucide React pero estandarizar tamaños:
- Iconos en navegación: `size={20}` 
- Iconos en botones: `size={16}`
- Iconos decorativos grandes: `size={24}` o `size={32}`
- Iconos en métricas: `size={20}` con color `text-primary` o `text-muted-foreground`

---

## FASE 2: LANDING PAGE — `src/app/page.tsx`

### 2.1 — Estructura General Nueva

La landing actual es funcional pero genérica. La nueva versión será editorial, con scroll storytelling.

**Arquitectura de secciones:**

```
1. HERO — "El Sistema que Escala tu Coaching"
2. PROOF BAR — Logos / números de social proof
3. DEMO FEATURE — Mockup interactivo del dashboard
4. FEATURE GRID — Bento de características clave (6 cards)
5. HOW IT WORKS — 3 pasos animados
6. TESTIMONIALS — Carousel o grid de 3
7. PRICING PREVIEW — Resumen de planes con CTA
8. FINAL CTA — Hero secundario de conversión
9. FOOTER — Mínimo y elegante
```

### 2.2 — Sección HERO

**Diseño:**
- Background: `bg-aurora` con mesh gradient sutil de violeta + mint en esquinas
- Noise texture overlay para profundidad
- Badge superior animado: `✦ Nueva versión — Rework 2.0`
- H1 gigante (5xl-7xl responsive): en dos líneas, con `text-gradient-primary` en palabra clave
- Subtítulo: 1-2 líneas, muted-foreground
- CTA row: Botón primario grande + link secundario "Ver demo"
- Trust badges: "Sin tarjeta requerida", "14 días gratis", "Cancela cuando quieras"
- Hero mockup: Screenshot/mockup flotante del dashboard con `animate-float` y sombra dramática

```tsx
// Estructura del Hero
<section className="relative min-h-[100dvh] flex items-center overflow-hidden">
  {/* Aurora Background */}
  <div className="absolute inset-0 bg-aurora animate-aurora pointer-events-none" />
  <div className="absolute inset-0 noise pointer-events-none" />
  
  {/* Gradient fade bottom */}
  <div className="absolute bottom-0 left-0 right-0 h-32 
    bg-gradient-to-t from-background to-transparent" />

  <div className="relative z-10 container mx-auto px-4 py-24">
    <div className="max-w-5xl mx-auto text-center">
      
      {/* Animated Badge */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 mb-8
          bg-primary/10 border border-primary/20 
          text-primary text-sm font-semibold
          px-4 py-1.5 rounded-full"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        La plataforma que los mejores coaches eligen
      </motion.div>

      {/* H1 */}
      <motion.h1
        className="font-display font-bold tracking-tight
          text-5xl sm:text-6xl lg:text-7xl xl:text-8xl
          leading-[1.05] mb-6"
      >
        Escala tu coaching.
        <br />
        <span className="text-gradient-primary">Multiplica</span> tu impacto.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto mb-10"
      >
        EVA es la plataforma todo-en-uno para entrenadores que quieren 
        profesionalizar su negocio, automatizar su operación y dar 
        resultados excepcionales a sus alumnos.
      </motion.p>

      {/* CTAs */}
      <motion.div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
        <Button size="xl" className="glow-primary text-base font-bold px-10">
          Comenzar gratis — 14 días
          <ArrowRight size={18} />
        </Button>
        <Button variant="ghost" size="xl" className="text-base">
          <Play size={18} className="text-primary" />
          Ver demo en vivo
        </Button>
      </motion.div>

      {/* Trust badges */}
      <div className="flex flex-wrap gap-6 justify-center text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Check size={14} className="text-success" /> Sin tarjeta de crédito
        </span>
        <span className="flex items-center gap-1.5">
          <Check size={14} className="text-success" /> Setup en 5 minutos
        </span>
        <span className="flex items-center gap-1.5">
          <Check size={14} className="text-success" /> Cancela cuando quieras
        </span>
      </div>
    </div>

    {/* Dashboard Mockup */}
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      className="mt-20 relative max-w-5xl mx-auto"
    >
      <div className="relative rounded-2xl overflow-hidden 
        shadow-[0_32px_80px_rgba(107,33,254,0.25),0_0_0_1px_rgba(107,33,254,0.15)]">
        <DashboardMockup />
      </div>
      {/* Glow under mockup */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 
        w-3/4 h-16 bg-primary/20 blur-3xl rounded-full" />
    </motion.div>
  </div>
</section>
```

### 2.3 — Proof Bar (Social Proof)

```tsx
<section className="py-12 border-y border-border">
  <div className="container mx-auto px-4">
    <p className="text-center text-sm text-muted-foreground mb-8 font-semibold uppercase tracking-widest">
      Coaches que ya confían en EVA
    </p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
      {/* Stat cards */}
      {[
        { value: "500+", label: "Coaches activos" },
        { value: "12,000+", label: "Alumnos gestionados" },
        { value: "98%", label: "Satisfacción" },
        { value: "4.9★", label: "Calificación promedio" },
      ].map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="font-display font-bold text-3xl text-foreground">
            {stat.value}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  </div>
</section>
```

### 2.4 — Feature Grid (Bento Layout)

```tsx
// 6 features en bento asimétrico
// Layout:
// [  Grande 2x1  ] [ Normal ] [ Normal ]
// [ Normal ] [ Normal ] [  Grande 1x2  ]

const features = [
  {
    size: "col-span-2",  // Grande
    icon: Dumbbell,
    title: "Constructor de Rutinas Drag & Drop",
    desc: "Crea programas de entrenamiento en minutos con nuestro builder visual.",
    visual: <BuilderMiniPreview />,
    gradient: "from-primary/10 to-transparent",
  },
  // ... más features
]
```

### 2.5 — How It Works (3 pasos)

```
Paso 1: Crea tu cuenta → Configura tu marca en 5 min
Paso 2: Agrega tus alumnos → Invita con link personalizado  
Paso 3: Gestiona y crece → Dashboard con todo centralizado
```

Cada paso: número grande en `text-gradient-primary`, icono, título, descripción. Conectados visualmente con línea punteada animada.

### 2.6 — Footer Minimalista

```tsx
<footer className="border-t border-border py-12">
  <div className="container mx-auto px-4">
    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
      {/* Logo + tagline */}
      <div>
        <EVALogo />
        <p className="text-sm text-muted-foreground mt-1">
          La plataforma para coaches que van en serio.
        </p>
      </div>
      {/* Links */}
      <nav className="flex gap-6 text-sm text-muted-foreground">
        <Link href="/pricing">Precios</Link>
        <Link href="/legal">Términos</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/login">Iniciar sesión</Link>
      </nav>
      {/* Theme + Lang toggles */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
    </div>
    <div className="divider-gradient my-8" />
    <p className="text-center text-xs text-muted-foreground">
      © 2026 EVA. Todos los derechos reservados.
    </p>
  </div>
</footer>
```

---

## FASE 3: PRICING PAGE — `src/app/pricing/page.tsx`

### 3.1 — Nuevo Layout de Pricing

La página actual muestra plans en una grilla simple. La nueva versión usa un layout editorial de alto impacto.

**Estructura:**

```
HEADER: Logo + "Ya tengo cuenta" link
HERO: Título + Toggle mensual/anual + ahorro badge
PLANS GRID: 2 tiers gratuitos/básicos + 3 tiers pro (highlighted)
FEATURE COMPARISON TABLE: (Opcional, toggle "ver comparativa completa")
TESTIMONIAL STRIP: 3 quotes de coaches reales
FAQ ACCORDION: 6 preguntas clave
ENTERPRISE CTA: Card destacada para plan custom
```

### 3.2 — Plan Cards Rediseñadas

```tsx
// Cada PlanCard tiene:
// - Header con icono de categoría y nombre del tier
// - Precio grande con toggle mensual/anual
// - Badge de ahorro si aplica ("Ahorra 20%")
// - Lista de features con checkmarks de colores
// - CTA button prominent
// - Badge "Más popular" en card destacada

// El plan PRO (30 alumnos) será el "destacado":
// - Background: gradient violeta sutil
// - Border: border-primary con glow
// - Scale: transform scale-105 en desktop
// - Badge flotante: "⭐ Más popular"

// Variante para plan starter_lite y starter:
// - Tono más neutro, sin highlight
// - CTA secundario

// Variante para elite y scale:
// - Tono premium, ámbar/dorado
// - Badge: "Para negocios que escalan"
```

### 3.3 — Toggle Mensual/Anual

```tsx
// Toggle animado con Framer Motion
// Al cambiar a anual: precio animado con counter animation
// Badge verde: "Ahorra hasta $155,880 al año"
// Precios se animan: cross out mensual → mostrar anual

<div className="flex items-center gap-3 bg-muted p-1 rounded-full">
  <button className={cn(
    "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
    billing === 'monthly' 
      ? "bg-background shadow-sm text-foreground" 
      : "text-muted-foreground"
  )}>Mensual</button>
  <button className={cn(
    "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
    billing === 'annual' 
      ? "bg-background shadow-sm text-foreground" 
      : "text-muted-foreground"
  )}>
    Anual
    <span className="ml-1.5 text-xs bg-success text-success-foreground px-1.5 py-0.5 rounded-full">
      -20%
    </span>
  </button>
</div>
```

### 3.4 — FAQ Accordion Elegante

```tsx
// Usar Radix Accordion con animación de altura
// 6 preguntas frecuentes
// Diseño: pregunta en bold, respuesta en muted
// Separador: divider-gradient entre items
// Icon: ChevronDown que rota con animación
```

---

## FASE 4: PÁGINAS DE AUTENTICACIÓN

### 4.1 — Layout Compartido Auth (`(auth)/layout.tsx`)

**Concepto nuevo: Split Screen con Visual Impact**

```tsx
// Desktop: 50/50 split
// Left: Form side (fondo claro/oscuro neutro)
// Right: Visual side (gradient + mockup + quotes)
// Mobile: Solo form side, logo arriba

<div className="min-h-[100dvh] grid lg:grid-cols-2">
  {/* Left: Form */}
  <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
    {/* Logo */}
    <Link href="/" className="mb-10">
      <EVALogo />
    </Link>
    {/* Form content */}
    {children}
  </div>

  {/* Right: Visual (hidden en mobile) */}
  <div className="hidden lg:flex relative overflow-hidden
    bg-gradient-to-br from-primary/90 via-primary to-primary-dark">
    
    {/* Aurora overlay */}
    <div className="absolute inset-0 bg-aurora opacity-40" />
    
    {/* Noise */}
    <div className="absolute inset-0 noise" />
    
    {/* Content */}
    <div className="relative z-10 flex flex-col justify-between p-12 text-white">
      {/* Top quote */}
      <blockquote className="max-w-sm">
        <p className="text-xl font-display font-semibold leading-relaxed mb-4">
          "EVA transformó completamente cómo gestiono mis 40+ alumnos. 
          Antes tardaba horas, ahora minutos."
        </p>
        <footer className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20" />
          <div>
            <p className="font-semibold text-sm">Carlos Mendoza</p>
            <p className="text-white/70 text-xs">Coach de Fuerza · 42 alumnos</p>
          </div>
        </footer>
      </blockquote>
      
      {/* Floating dashboard preview */}
      <div className="rounded-2xl overflow-hidden shadow-2xl opacity-90
        border border-white/20 mt-8">
        <DashboardMiniPreview />
      </div>
      
      {/* Bottom stats */}
      <div className="grid grid-cols-3 gap-4 mt-8">
        {[
          { v: "500+", l: "Coaches" },
          { v: "12K+", l: "Alumnos" },
          { v: "4.9★", l: "Rating" },
        ].map(s => (
          <div key={s.l} className="text-center">
            <div className="font-display font-bold text-2xl">{s.v}</div>
            <div className="text-white/70 text-xs mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
</div>
```

### 4.2 — Login Page (`(auth)/login/page.tsx`)

```tsx
// Form rediseñado:
// - Título: "Bienvenido de vuelta" (H2 bold)
// - Subtítulo muted
// - Inputs: nuevo estilo premium
// - Toggle password visibility
// - Remember me checkbox elegante
// - "¿Olvidaste tu contraseña?" como link secundario
// - Submit button: full width, grande, con glow
// - Divider con "o continúa con" (si hay social auth)
// - Link a registro al fondo

<div className="w-full max-w-sm">
  <h2 className="font-display font-bold text-2xl mb-1">
    Bienvenido de vuelta
  </h2>
  <p className="text-muted-foreground text-sm mb-8">
    Ingresa a tu cuenta para continuar
  </p>

  <form className="space-y-4">
    {/* Email input con floating label effect */}
    <div className="space-y-1.5">
      <Label>Correo electrónico</Label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 
          text-muted-foreground" size={16} />
        <Input 
          type="email" 
          placeholder="coach@ejemplo.com"
          className="pl-9"
        />
      </div>
    </div>

    {/* Password con toggle */}
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <Label>Contraseña</Label>
        <Link href="/forgot-password" 
          className="text-xs text-primary hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 
          text-muted-foreground" size={16} />
        <Input 
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          className="pl-9 pr-10"
        />
        <button type="button" 
          className="absolute right-3 top-1/2 -translate-y-1/2
          text-muted-foreground hover:text-foreground transition-colors">
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>

    {/* Error message */}
    {error && (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 text-destructive text-sm
          bg-destructive/10 border border-destructive/20 
          rounded-[var(--radius-md)] px-3 py-2"
      >
        <AlertCircle size={14} />
        {error}
      </motion.div>
    )}

    {/* Submit */}
    <Button type="submit" size="lg" className="w-full glow-primary mt-2">
      {isPending ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>Iniciar sesión <ArrowRight size={16} /></>
      )}
    </Button>
  </form>

  <p className="text-center text-sm text-muted-foreground mt-8">
    ¿No tienes cuenta?{' '}
    <Link href="/register" className="text-primary font-semibold hover:underline">
      Crea una gratis
    </Link>
  </p>
</div>
```

### 4.3 — Register Page (`(auth)/register/page.tsx`)

**Nuevo diseño multi-step con progress indicator visual:**

```tsx
// Step indicator: Circles conectados con línea
// Paso 1: Tu perfil
// Paso 2: Tu plan  
// Paso 3: Confirmar

// Step indicator component:
<div className="flex items-center gap-0 mb-10">
  {steps.map((step, i) => (
    <Fragment key={step.id}>
      {/* Step circle */}
      <div className={cn(
        "flex items-center justify-center w-9 h-9 rounded-full",
        "text-sm font-bold font-display transition-all duration-300",
        currentStep > i 
          ? "bg-primary text-primary-foreground shadow-glow" 
          : currentStep === i 
          ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
          : "bg-muted text-muted-foreground"
      )}>
        {currentStep > i ? <Check size={16} /> : i + 1}
      </div>
      
      {/* Label */}
      <span className={cn(
        "ml-2 text-sm font-medium hidden sm:block",
        currentStep === i ? "text-foreground" : "text-muted-foreground"
      )}>
        {step.label}
      </span>
      
      {/* Connector */}
      {i < steps.length - 1 && (
        <div className="flex-1 mx-3 h-px bg-border relative overflow-hidden">
          {currentStep > i && (
            <motion.div 
              className="absolute inset-y-0 left-0 bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            />
          )}
        </div>
      )}
    </Fragment>
  ))}
</div>

// Paso 1: Datos personales
// Form elegante con label + input groups
// Avatar upload opcional (nuevo — no existía)
// Validación en tiempo real

// Paso 2: Selección de plan
// Cards de plan rediseñadas (ver Pricing Phase)
// Toggle mensual/trimestral/anual integrado
// Plan recomendado destacado con animación

// Paso 3: Resumen + pago
// Summary card con breakdown claro
// Checkbox de términos con link inline
// Botón de pago con logos de métodos
```

### 4.4 — Forgot Password (`(auth)/forgot-password/page.tsx`)

```tsx
// Diseño simplificado y tranquilizador:
// - Icono grande: Lock + Mail animation
// - Título: "Recupera tu acceso"  
// - Subtítulo: instrucciones claras
// - Input email solo
// - Submit button
// - Link "Volver al login"
// Estado success: check animado + instrucciones
```

### 4.5 — Reset Password (`(auth)/reset-password/page.tsx`)

```tsx
// Form limpio:
// - Nueva contraseña + confirmar
// - Password strength indicator (barra animada)
// - Checkmarks de requisitos (8 chars, mayúscula, número)
// - Submit button
// Estado success: redirect automático con countdown
```

---

## FASE 5: COACH ONBOARDING CHECKLIST

**Archivo:** `src/app/coach/dashboard/CoachOnboardingChecklist.tsx`

### 5.1 — Rediseño del Checklist

El checklist actual es una lista simple. Lo convertimos en una **Experience Guide** interactiva:

```tsx
// Card prominente en el dashboard, colapsa cuando está completo
// Título: "Configura tu coaching en 5 pasos"
// Progress ring circular mostrando % completado
// Cada paso: icono categorizado + título + descripción breve
// Estado: pending (gris) / in-progress (violeta pulse) / done (verde check)
// CTA inline para cada paso
// Al completar: confetti + badge "Listo para empezar"

<motion.div
  layout
  className="rounded-[var(--radius-xl)] border border-border bg-card overflow-hidden"
>
  <div className="p-6">
    {/* Header */}
    <div className="flex items-start justify-between mb-6">
      <div>
        <h3 className="font-display font-bold text-lg">
          Comienza tu journey
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Completa estos pasos para aprovechar EVA al máximo
        </p>
      </div>
      <div className="relative w-14 h-14">
        <CircularProgress value={completedPct} />
        <span className="absolute inset-0 flex items-center justify-center
          font-display font-bold text-sm">
          {completedPct}%
        </span>
      </div>
    </div>

    {/* Steps */}
    <div className="space-y-3">
      {checklistItems.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07 }}
          className={cn(
            "flex items-center gap-4 p-4 rounded-[var(--radius-md)]",
            "border transition-all duration-200",
            item.done 
              ? "bg-success/5 border-success/20" 
              : "bg-muted/50 border-transparent hover:border-primary/20 hover:bg-primary/5"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            item.done ? "bg-success text-white" : "bg-primary/10 text-primary"
          )}>
            {item.done ? <Check size={16} /> : <item.icon size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm font-semibold",
              item.done && "line-through text-muted-foreground"
            )}>
              {item.title}
            </p>
            {!item.done && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </p>
            )}
          </div>
          {!item.done && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={item.href}>
                Ir <ChevronRight size={14} />
              </Link>
            </Button>
          )}
        </motion.div>
      ))}
    </div>
  </div>
</motion.div>
```

---

## FASE 6: COACH DASHBOARD — `src/app/coach/dashboard/page.tsx`

### 6.1 — Layout Bento Grid

Reemplazar el layout actual por un **sistema bento asimétrico** que maximiza la información visible y crea jerarquía visual clara.

```
DESKTOP (1280px+):
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER: Logo + Nav + User Menu + Notifications bell                   │
├──────────────────────────────────────────────────────────────────────┤
│ KPI ROW: [Alumnos activos] [Adherencia promedio] [Nuevos esta semana] │
├──────────────┬─────────────────────┬───────────────────────────────  │
│ CLIENTS LIST │  ADHERENCIA CHART   │   CHECKLIST / RECENT ACTIVITY   │
│ (30% width)  │  (40% width)        │   (30% width)                   │
├──────────────┴─────────────────────┴──────────────────────────────── │
│ RECENT CHECK-INS STRIP (full width — horizontal scroll de fotos)      │
└──────────────────────────────────────────────────────────────────────┘

MOBILE:
- KPI Cards: 2x2 grid
- Charts: full width  
- Clients: lista compacta
```

### 6.2 — KPI Cards Rediseñadas

```tsx
// 4 KPI cards en row
// Diseño: icono colorido + número grande + label + trend badge
const KPICard = ({ icon: Icon, value, label, trend, trendValue, color }) => (
  <div className="bg-card border border-border rounded-[var(--radius-xl)] p-5
    hover:shadow-md transition-all duration-200 group">
    <div className="flex items-start justify-between mb-4">
      <div className={cn(
        "w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center",
        `bg-${color}/10`
      )}>
        <Icon size={20} className={`text-${color}`} />
      </div>
      <span className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full",
        trend === 'up' 
          ? "bg-success/10 text-success" 
          : "bg-destructive/10 text-destructive"
      )}>
        {trend === 'up' ? '+' : ''}{trendValue}%
      </span>
    </div>
    <div className="font-display font-bold text-3xl tracking-tight">
      {value}
    </div>
    <div className="text-sm text-muted-foreground mt-1">{label}</div>
  </div>
)
```

### 6.3 — Coach Sidebar Rediseñada (`components/coach/CoachSidebar.tsx`)

```tsx
// Sidebar más compacta y elegante
// Width: 240px collapsed / 64px icon-only mode
// Top: Logo + coach brand name
// Nav items: icon + label, con active state violeta
// Footer: Plan badge + settings + logout

// Nav Items organizados por sección:
// MAIN: Dashboard, Alumnos
// CONTENIDO: Programas, Ejercicios, Nutrición, Recetas, Alimentos
// NEGOCIO: Suscripción, Configuración

// Cada NavItem:
<Link
  href={item.href}
  className={cn(
    "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]",
    "text-sm font-medium transition-all duration-150",
    isActive 
      ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(var(--primary-rgb),0.30)]"
      : "text-sidebar-foreground hover:bg-sidebar-accent"
  )}
>
  <item.icon size={18} className={cn(!isActive && "text-muted-foreground")} />
  <span>{item.label}</span>
  {item.badge && (
    <span className="ml-auto bg-primary/20 text-primary text-xs px-1.5 rounded-full">
      {item.badge}
    </span>
  )}
</Link>
```

---

## FASE 7: COACH CLIENTS PAGE — `src/app/coach/clients/page.tsx`

### 7.1 — Lista de Alumnos Rediseñada

**Toggle: Vista Cards / Vista Lista**

```tsx
// VISTA CARDS (default):
// Grid responsive: 1 col mobile, 2 col tablet, 3 col desktop
// ClientCardV2 rediseñado (ver abajo)

// VISTA LISTA:
// Tabla con columnas: Avatar+Nombre / Adherencia / Último log / Programa / Acciones
// Rows hover highlight
// Sorting por columnas
```

### 7.2 — ClientCardV2 Rediseñada

**Nuevo concepto: "Athletic Profile Card"**

```tsx
// Diseño más limpio y menos condensado que la versión actual
// Eliminar el sparkline de peso (ocupa espacio)
// Añadir: estado de streak más prominente

<div className="bg-card border border-border rounded-[var(--radius-xl)] 
  overflow-hidden hover:shadow-md hover:-translate-y-0.5
  transition-all duration-200 card-shine group">
  
  {/* Color bar top: muestra estado de adherencia como color */}
  <div className={cn(
    "h-1 w-full",
    adherence > 80 ? "bg-success" 
    : adherence > 50 ? "bg-warning" 
    : "bg-destructive"
  )} />
  
  <div className="p-5">
    {/* Header row */}
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="w-12 h-12 ring-2 ring-border" />
          {/* Online indicator */}
          {isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 
              rounded-full bg-success border-2 border-card" />
          )}
        </div>
        <div>
          <p className="font-display font-semibold text-sm leading-tight">
            {client.full_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {client.email}
          </p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        {/* ... menu items */}
      </DropdownMenu>
    </div>
    
    {/* Metrics row: 3 métricas clave */}
    <div className="grid grid-cols-3 gap-2 mb-4">
      <MetricPill label="Adherencia" value={`${adherence}%`} 
        color={adherence > 80 ? 'success' : adherence > 50 ? 'warning' : 'destructive'} />
      <MetricPill label="Racha" value={`${streak}d`} color="primary" />
      <MetricPill label="Último log" value={lastLogLabel} 
        color={daysSinceLog > 7 ? 'destructive' : 'muted'} />
    </div>
    
    {/* Program info (si tiene) */}
    {program && (
      <div className="bg-primary/5 border border-primary/10 
        rounded-[var(--radius-md)] px-3 py-2 mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-primary truncate">
            {program.name}
          </span>
          <span className="text-xs text-muted-foreground ml-2 shrink-0">
            Sem {program.currentWeek}/{program.totalWeeks}
          </span>
        </div>
        <div className="h-1 bg-primary/15 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${program.progress}%` }}
          />
        </div>
      </div>
    )}
    
    {/* Action buttons */}
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
        <Link href={`/coach/clients/${client.id}`}>
          <Eye size={12} /> Perfil
        </Link>
      </Button>
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`https://wa.me/${client.phone}`} target="_blank">
          <MessageCircle size={14} className="text-success" />
        </a>
      </Button>
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href={`/coach/builder/${client.id}`}>
          <Dumbbell size={14} className="text-primary" />
        </Link>
      </Button>
    </div>
  </div>
</div>
```

### 7.3 — MetricPill Component (nuevo)

```tsx
const MetricPill = ({ label, value, color }) => (
  <div className={cn(
    "bg-muted rounded-[var(--radius-sm)] px-2 py-2 text-center",
  )}>
    <div className={cn(
      "font-display font-bold text-base leading-none",
      color === 'success' && "text-success",
      color === 'warning' && "text-warning",
      color === 'destructive' && "text-destructive",
      color === 'primary' && "text-primary",
      color === 'muted' && "text-muted-foreground",
    )}>
      {value}
    </div>
    <div className="text-[10px] text-muted-foreground mt-0.5 leading-none">
      {label}
    </div>
  </div>
)
```

---

## FASE 8: CLIENT PROFILE PAGE — `src/app/coach/clients/[clientId]/page.tsx`

### 8.1 — Header de Perfil Rediseñado

```tsx
// Banner de perfil con gradient de fondo
// Avatar grande con ring de color de adherencia
// Stats rápidos en pills
// Tab navigation pegada y sticky

<div className="relative mb-6">
  {/* Background gradient */}
  <div className="h-32 rounded-[var(--radius-xl)] bg-gradient-to-r 
    from-primary/20 via-primary/10 to-accent/10" />
  
  {/* Profile info overlay */}
  <div className="flex items-end gap-4 -mt-8 px-6">
    <div className="relative">
      <Avatar className="w-20 h-20 ring-4 ring-card shadow-xl" />
      <div className={cn(
        "absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full text-xs font-bold",
        adherence > 80 ? "bg-success text-white" 
        : adherence > 50 ? "bg-warning text-white" 
        : "bg-destructive text-white"
      )}>
        {adherence}%
      </div>
    </div>
    <div className="pb-2 flex-1">
      <h1 className="font-display font-bold text-xl">{client.full_name}</h1>
      <p className="text-sm text-muted-foreground">{client.email}</p>
    </div>
    {/* Quick actions */}
    <div className="pb-2 flex gap-2">
      <Button variant="outline" size="sm">
        <MessageCircle size={14} /> WhatsApp
      </Button>
      <Button size="sm">
        <Dumbbell size={14} /> Builder
      </Button>
    </div>
  </div>
</div>
```

### 8.2 — Tab Navigation Rediseñada

```tsx
// 8 tabs en scroll horizontal en mobile
// Tabs: Overview, Entrenamiento, Nutrición, Check-ins, 
//       Evolución, Historial, Notas, Configuración
// Active tab: background violeta con text white
// Tab con badge de notificación (ej: "2 check-ins pendientes")

<div className="flex gap-1 overflow-x-auto pb-0.5 border-b border-border">
  {tabs.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium",
        "whitespace-nowrap transition-all duration-150 border-b-2 -mb-px",
        activeTab === tab.id 
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <tab.icon size={14} />
      {tab.label}
      {tab.badge && (
        <span className="bg-primary text-primary-foreground text-[10px] 
          font-bold px-1.5 rounded-full min-w-[16px] text-center">
          {tab.badge}
        </span>
      )}
    </button>
  ))}
</div>
```

---

## FASE 9: WORKOUT BUILDER — `src/app/coach/builder/[clientId]/page.tsx`

### 9.1 — Header del Builder Rediseñado

```tsx
// Header sticky con:
// - Breadcrumb: "Alumnos > Juan Pérez > Builder"
// - Nombre del programa editable inline
// - Botones de acción a la derecha: Preview, Guardar, Asignar
// Colores: fondo oscuro (dark mode), borde inferior sutil

<header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl 
  border-b border-border">
  <div className="container mx-auto px-4 h-14 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href={`/coach/clients/${clientId}`}>
          <ChevronLeft size={16} />
        </Link>
      </Button>
      <div>
        <EditableTitle value={programName} onChange={setProgramName} />
        <p className="text-xs text-muted-foreground">
          {clientName} · {totalWeeks} semanas
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={openPreview}>
        <Eye size={14} /> Preview
      </Button>
      <Button size="sm">
        <Save size={14} /> Guardar
      </Button>
    </div>
  </div>
</header>
```

### 9.2 — Workout Blocks Rediseñados

```tsx
// Cada día del programa: card con header de día
// Exercise blocks dentro: drag handle visible + mejor info

// Day Card:
<div className="bg-card border border-border rounded-[var(--radius-xl)] overflow-hidden">
  <div className="flex items-center justify-between px-4 py-3 
    border-b border-border bg-muted/30">
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground 
        flex items-center justify-center font-display font-bold text-xs">
        {dayNumber}
      </div>
      <span className="font-semibold text-sm">{dayName}</span>
    </div>
    <Button variant="ghost" size="icon-xs" onClick={addExercise}>
      <Plus size={14} />
    </Button>
  </div>

  {/* Exercise Blocks */}
  <div className="p-3 space-y-2">
    {blocks.map(block => (
      <ExerciseBlockRow key={block.id} block={block} />
    ))}
  </div>
</div>

// ExerciseBlockRow:
<div className="flex items-center gap-3 p-3 bg-muted/50 rounded-[var(--radius-md)]
  border border-transparent hover:border-primary/20 group">
  {/* Drag handle */}
  <GripVertical size={14} className="text-muted-foreground cursor-grab" />
  
  {/* Exercise info */}
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate">{exercise.name}</p>
    <p className="text-xs text-muted-foreground">
      {sets} sets · {reps} reps · {rest}s descanso
    </p>
  </div>
  
  {/* Actions (show on hover) */}
  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
    <Button variant="ghost" size="icon-xs" onClick={edit}>
      <Pencil size={12} />
    </Button>
    <Button variant="ghost" size="icon-xs" onClick={remove}>
      <Trash2 size={12} className="text-destructive" />
    </Button>
  </div>
</div>
```

---

## FASE 10: ALUMNO DASHBOARD — `src/app/c/[coach_slug]/dashboard/page.tsx`

### 10.1 — Filosofía de Diseño Cliente

El dashboard del alumno es diferente al del coach: debe ser **motivacional y gamificado**, no analítico. Cada elemento debe incentivar al usuario a completar su workout, registrar su check-in, y mantener su racha.

### 10.2 — Hero Section del Alumno

```tsx
// Saludo personalizado con hora del día
// Stat de racha prominente
// Status del día (workout disponible / descanso / completado)
// Big action button

<section className="relative px-4 pt-8 pb-6">
  {/* Background gradient según estado del día */}
  <div className={cn(
    "absolute inset-0 pointer-events-none",
    hasWorkoutToday 
      ? "bg-gradient-to-b from-primary/8 to-transparent"
      : "bg-gradient-to-b from-muted/50 to-transparent"
  )} />
  
  <div className="relative">
    {/* Greeting */}
    <p className="text-sm text-muted-foreground mb-1">
      {getGreeting()}, 👋
    </p>
    <h1 className="font-display font-bold text-2xl leading-tight mb-4">
      {clientName.split(' ')[0]}
    </h1>
    
    {/* Streak Widget */}
    <div className="flex items-center gap-2 mb-6">
      <div className="flex items-center gap-1.5 bg-warning/10 border border-warning/20
        text-warning text-sm font-bold px-3 py-1.5 rounded-full">
        <Flame size={14} />
        {streak} días de racha
      </div>
      <div className="flex items-center gap-1.5 bg-muted text-muted-foreground
        text-xs font-medium px-2.5 py-1.5 rounded-full">
        Semana {currentWeek}/{totalWeeks}
      </div>
    </div>
    
    {/* Big CTA Card */}
    {hasWorkoutToday ? (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="bg-primary rounded-[var(--radius-2xl)] p-5 
          shadow-[0_8px_32px_rgba(var(--primary-rgb),0.40)]
          cursor-pointer"
        onClick={goToWorkout}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider mb-1">
              Entrenamiento de hoy
            </p>
            <p className="text-primary-foreground font-display font-bold text-xl">
              {workoutName}
            </p>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              {exerciseCount} ejercicios · ~{estimatedMinutes} min
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary-foreground/20 
            flex items-center justify-center">
            <Play size={20} className="text-primary-foreground ml-0.5" />
          </div>
        </div>
      </motion.div>
    ) : (
      <RestDayCard />
    )}
  </div>
</section>
```

### 10.3 — Sección de Progreso Semanal

```tsx
// Calendario de la semana: 7 pills de días
// Cada pill: letra del día + estado (done/pending/rest/today)
// Tap en día completado: mostra resumen del workout

<div className="px-4 mb-6">
  <h2 className="font-display font-semibold text-base mb-3">Esta semana</h2>
  <div className="grid grid-cols-7 gap-1.5">
    {weekDays.map(day => (
      <button
        key={day.date}
        className={cn(
          "flex flex-col items-center gap-1 py-2 px-1 rounded-[var(--radius-md)]",
          "text-xs font-semibold transition-all duration-150",
          day.isToday && "ring-2 ring-primary",
          day.status === 'done' && "bg-success/15 text-success",
          day.status === 'rest' && "bg-muted text-muted-foreground",
          day.status === 'pending' && day.isToday && "bg-primary text-primary-foreground",
          day.status === 'pending' && !day.isToday && "bg-muted/50 text-muted-foreground",
        )}
      >
        <span className="opacity-70 text-[10px] uppercase">{day.letter}</span>
        {day.status === 'done' 
          ? <Check size={14} /> 
          : day.status === 'rest' 
          ? <Moon size={14} />
          : <Minus size={12} className="opacity-50" />
        }
      </button>
    ))}
  </div>
</div>
```

### 10.4 — Widgets de Métricas

```tsx
// Grid de 2x2 de metric cards
// Peso, Adherencia, PR más reciente, Check-in pendiente
// Cada card: tap lleva al área correspondiente

// WeightWidget rediseñado:
<Link href="./check-in" className="block">
  <div className="bg-card border border-border rounded-[var(--radius-xl)] p-4
    hover:shadow-md transition-all active:scale-[0.98]">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Peso actual
      </span>
      <Scale size={14} className="text-muted-foreground" />
    </div>
    <div className="font-display font-bold text-2xl">
      {weight} <span className="text-base font-normal text-muted-foreground">kg</span>
    </div>
    {weightDelta !== 0 && (
      <div className={cn(
        "flex items-center gap-1 text-xs font-medium mt-1",
        weightDelta < 0 ? "text-success" : "text-warning"
      )}>
        {weightDelta < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
        {Math.abs(weightDelta)} kg esta semana
      </div>
    )}
  </div>
</Link>
```

---

## FASE 11: WORKOUT EXECUTION — `src/app/c/[coach_slug]/workout/[planId]/page.tsx`

### 11.1 — Header de Ejecución

```tsx
// Header minimal con:
// - Progress bar arriba (% completado del workout)
// - Nombre del workout
// - Tiempo transcurrido
// - Botón pause/finish

<header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
  {/* Progress bar */}
  <div className="h-0.5 bg-muted">
    <motion.div 
      className="h-full bg-primary"
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.5 }}
    />
  </div>
  
  <div className="flex items-center justify-between px-4 h-14">
    <Button variant="ghost" size="icon-sm" onClick={pauseWorkout}>
      <Pause size={16} />
    </Button>
    <div className="text-center">
      <p className="text-sm font-display font-bold">{workoutName}</p>
      <p className="text-xs text-muted-foreground">{elapsedTime}</p>
    </div>
    <Button variant="outline" size="sm" onClick={finishWorkout}>
      Terminar
    </Button>
  </div>
</header>
```

### 11.2 — Set Logger Rediseñado

```tsx
// Cada set: card clara con estado visual
// Logged: fondo verde sutil, check visible
// Pending: fondo neutro con inputs

<div className={cn(
  "rounded-[var(--radius-xl)] border overflow-hidden transition-all duration-300",
  logged 
    ? "bg-success/8 border-success/25" 
    : "bg-card border-border"
)}>
  <div className="flex items-center gap-3 p-4">
    {/* Set number */}
    <div className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center",
      "font-display font-bold text-sm shrink-0",
      logged ? "bg-success text-white" : "bg-muted text-muted-foreground"
    )}>
      {logged ? <Check size={14} /> : setNumber}
    </div>
    
    {/* Inputs */}
    <div className="flex gap-2 flex-1">
      <div className="flex-1">
        <label className="text-[10px] font-semibold uppercase text-muted-foreground block mb-1">
          Peso (kg)
        </label>
        <input 
          type="number"
          min="0" step="0.5"
          className={cn(
            "w-full h-10 text-center font-display font-bold text-lg",
            "rounded-[var(--radius-md)] border bg-background",
            "focus:outline-none focus:border-primary",
            "focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)]"
          )}
        />
      </div>
      <div className="flex-1">
        <label className="text-[10px] font-semibold uppercase text-muted-foreground block mb-1">
          Reps
        </label>
        <input type="number" min="0" step="1" className={/* mismo */} />
      </div>
    </div>
    
    {/* Log button */}
    {!logged && (
      <Button 
        onClick={logSet}
        size="icon"
        className="shrink-0"
      >
        <Check size={16} />
      </Button>
    )}
  </div>
</div>
```

### 11.3 — Rest Timer Rediseñado

```tsx
// Timer como overlay sheet desde abajo
// Círculo grande con countdown
// Vibración haptica al finalizar
// Botones: Skip / +30s

<div className="fixed inset-x-0 bottom-0 z-50">
  <motion.div
    initial={{ y: "100%" }}
    animate={{ y: 0 }}
    exit={{ y: "100%" }}
    className="bg-card border-t border-border rounded-t-[var(--radius-2xl)] p-6"
  >
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold text-muted-foreground mb-4">
        Descanso
      </p>
      
      {/* Countdown circle */}
      <div className="relative w-28 h-28 mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" 
            stroke="var(--muted)" strokeWidth="6" />
          <circle cx="50" cy="50" r="44" fill="none"
            stroke="var(--primary)" strokeWidth="6"
            strokeDasharray="276.4"
            strokeDashoffset={276.4 * (1 - timeLeft / totalTime)}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-bold text-3xl">
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={addTime}>
          +30s
        </Button>
        <Button variant="ghost" size="sm" onClick={skipRest}>
          Saltar
          <SkipForward size={14} />
        </Button>
      </div>
    </div>
  </motion.div>
</div>
```

### 11.4 — Workout Summary Overlay Rediseñado

```tsx
// Overlay de resumen post-workout con:
// 1. Confetti animation
// 2. Trophy icon grande animado
// 3. Stats: tiempo total, sets completados, volumen total
// 4. PR badges si los hubo
// 5. Botones: Compartir, Volver al dashboard

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  className="fixed inset-0 z-50 bg-background flex flex-col items-center 
    justify-center px-6"
>
  {/* Confetti trigger */}
  <ConfettiBlast />
  
  {/* Trophy */}
  <motion.div
    initial={{ scale: 0, rotate: -20 }}
    animate={{ scale: 1, rotate: 0 }}
    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
    className="w-24 h-24 rounded-full bg-warning/15 flex items-center justify-center mb-6"
  >
    <Trophy size={40} className="text-warning" />
  </motion.div>

  <h1 className="font-display font-bold text-3xl mb-1">
    ¡Workout completado!
  </h1>
  <p className="text-muted-foreground text-sm mb-8">
    {workoutName} · {formatDate(today)}
  </p>
  
  {/* Stats grid */}
  <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
    <SummaryStatCard label="Tiempo" value={duration} icon={Clock} />
    <SummaryStatCard label="Sets" value={totalSets} icon={Repeat} />
    <SummaryStatCard label="Volumen" value={`${volume}kg`} icon={Weight} />
  </div>
  
  {/* PR Badges */}
  {prs.length > 0 && (
    <div className="flex flex-wrap gap-2 justify-center mb-8">
      {prs.map(pr => (
        <div key={pr.exercise} 
          className="flex items-center gap-1.5 bg-warning/10 border border-warning/20
          text-warning text-xs font-bold px-3 py-1.5 rounded-full">
          <Star size={12} />
          PR: {pr.exercise}
        </div>
      ))}
    </div>
  )}
  
  <Button size="lg" className="w-full max-w-sm" onClick={goToDashboard}>
    Volver al inicio
  </Button>
</motion.div>
```

---

## FASE 12: CHECK-IN PAGE — `src/app/c/[coach_slug]/check-in/page.tsx`

### 12.1 — Rediseño Check-in

```tsx
// Flow: Energía → Peso → Foto (opcional)
// Cada step: full-screen card con ilustración

// Step 1: Energía (1-5 estrellas grandes)
<div className="flex flex-col items-center text-center px-6 py-12">
  <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center 
    justify-center mb-6">
    <Zap size={28} className="text-warning" />
  </div>
  <h2 className="font-display font-bold text-2xl mb-2">
    ¿Cómo te sientes hoy?
  </h2>
  <p className="text-muted-foreground text-sm mb-10">
    Tu nivel de energía ayuda a tu coach a adaptar tu programa
  </p>
  
  {/* Energy selector: 5 opciones con emoji + label */}
  <div className="flex gap-3 flex-wrap justify-center">
    {energyLevels.map(level => (
      <button
        key={level.value}
        onClick={() => setEnergy(level.value)}
        className={cn(
          "flex flex-col items-center gap-2 px-4 py-4 rounded-[var(--radius-xl)]",
          "border-2 transition-all duration-150 w-[80px]",
          energy === level.value 
            ? "border-primary bg-primary/10 scale-105"
            : "border-border hover:border-primary/30"
        )}
      >
        <span className="text-2xl">{level.emoji}</span>
        <span className="text-xs font-medium text-center leading-tight">
          {level.label}
        </span>
      </button>
    ))}
  </div>
</div>
```

---

## FASE 13: NUTRITION PAGE — `src/app/c/[coach_slug]/nutrition/page.tsx`

### 13.1 — Nuevo Layout de Nutrición

```tsx
// Header: fecha selector (swipe entre días)
// Summary ring: calorías del día (circular progress)
// Macros: 3 barras (proteína / carbos / grasas)
// Meals sections: expandibles con +/- para log

// Calorie Ring Redesign:
<div className="flex items-center justify-center py-6">
  <div className="relative w-36 h-36">
    {/* Calorías totales */}
    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--muted)" strokeWidth="10" />
      <circle cx="60" cy="60" r="52" fill="none"
        stroke="var(--primary)" strokeWidth="10"
        strokeDasharray={326.7}
        strokeDashoffset={326.7 * (1 - caloriesConsumed / caloriesGoal)}
        strokeLinecap="round"
      />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="font-display font-bold text-2xl leading-none">
        {caloriesConsumed}
      </span>
      <span className="text-xs text-muted-foreground">
        de {caloriesGoal} kcal
      </span>
    </div>
  </div>
  
  {/* Macro pills */}
  <div className="ml-6 space-y-3">
    {macros.map(macro => (
      <div key={macro.name}>
        <div className="flex justify-between text-xs mb-1">
          <span className="font-medium">{macro.name}</span>
          <span className="text-muted-foreground">
            {macro.consumed}g / {macro.goal}g
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full w-32">
          <div 
            className="h-full rounded-full transition-all"
            style={{ 
              width: `${Math.min(100, (macro.consumed/macro.goal)*100)}%`,
              backgroundColor: macro.color 
            }}
          />
        </div>
      </div>
    ))}
  </div>
</div>
```

---

## FASE 14: ONBOARDING DE ALUMNO

**Archivo:** `src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx`

### 14.1 — Nuevo Flujo Visual de Onboarding

```tsx
// Secuencia de pasos tipo "wizard" con slide animations
// Cada paso: ilustración + formulario
// Progress: dots indicators en la parte superior
// Fondo: gradiente sutil de la marca del coach

// Pasos del onboarding:
// 1. Bienvenida personalizada del coach
// 2. Datos básicos (nombre preferido, fecha nacimiento)
// 3. Objetivos (perder peso / ganar músculo / mejorar condición / etc.)
// 4. Experiencia de entrenamiento (principiante / intermedio / avanzado)
// 5. Datos físicos (peso, altura, género)
// 6. Frecuencia de entrenamiento disponible
// 7. Confirmación + "¡Listo para empezar!"

// Transition entre pasos: slide left/right según dirección
// Validación: antes de continuar, con feedback inline
// No botón atrás (simplifica flujo)

// Welcome Screen (paso 0):
<div className="flex flex-col items-center text-center px-6 py-16">
  <motion.div
    animate={{ y: [0, -8, 0] }}
    transition={{ duration: 3, repeat: Infinity }}
    className="mb-6"
  >
    <CoachLogo size={72} />
  </motion.div>
  <h1 className="font-display font-bold text-3xl mb-3">
    Hola, bienvenido/a 👋
  </h1>
  <p className="text-muted-foreground text-base mb-2 max-w-xs">
    Soy <strong>{coachName}</strong>, tu coach personal. 
    Juntos vamos a trabajar en tus objetivos.
  </p>
  <p className="text-muted-foreground text-sm mb-10 max-w-xs">
    Necesito un par de minutos para configurar tu perfil. 
    ¡Empecemos! 💪
  </p>
  <Button size="lg" className="w-full max-w-xs glow-primary" onClick={next}>
    Comenzar
    <ArrowRight size={16} />
  </Button>
</div>
```

---

## FASE 15: LEGAL Y PRIVACIDAD

### 15.1 — Legal Page (`src/app/legal/page.tsx`)

```tsx
// Layout editorial con:
// - Header con logo + "Volver" link
// - Sidebar de anclas (sticky en desktop)
// - Content area: markdown-ish, tipografía grande y legible
// - Last updated badge
// - Footer con links de contacto

<div className="max-w-4xl mx-auto px-4 py-16">
  {/* Header */}
  <div className="mb-12">
    <div className="flex items-center gap-2 mb-6">
      <span className="text-xs font-semibold uppercase tracking-widest 
        text-muted-foreground bg-muted px-3 py-1 rounded-full">
        Legal
      </span>
      <span className="text-xs text-muted-foreground">
        Actualizado: {lastUpdated}
      </span>
    </div>
    <h1 className="font-display font-bold text-4xl mb-4">
      Términos de Servicio
    </h1>
    <p className="text-lg text-muted-foreground">
      Al usar EVA, aceptas estos términos. Léelos con atención.
    </p>
  </div>
  
  {/* Content con prose styles */}
  <div className="prose prose-lg max-w-none
    prose-headings:font-display prose-headings:font-bold
    prose-p:text-muted-foreground prose-p:leading-relaxed">
    {/* Legal content */}
  </div>
</div>
```

### 15.2 — Privacy Page (`src/app/privacidad/page.tsx`)

Mismo layout que Legal, adaptado para política de privacidad.

---

## FASE 16: SETTINGS DEL COACH — `src/app/coach/settings/page.tsx`

### 16.1 — Rediseño de Settings

```tsx
// Layout: sidebar de secciones + content area
// Secciones: Perfil, Branding, Notificaciones, Seguridad

// Branding Section (white-label):
<div className="space-y-6">
  <div>
    <h3 className="font-display font-semibold text-base mb-1">
      Identidad Visual
    </h3>
    <p className="text-sm text-muted-foreground mb-4">
      Personaliza la app que ven tus alumnos
    </p>
    
    {/* Color picker */}
    <div className="flex items-center gap-4">
      <div 
        className="w-12 h-12 rounded-[var(--radius-md)] cursor-pointer
          border-2 border-border shadow-sm"
        style={{ backgroundColor: brandColor }}
        onClick={openColorPicker}
      />
      <div>
        <p className="text-sm font-semibold">{brandColor}</p>
        <p className="text-xs text-muted-foreground">Color de tu marca</p>
      </div>
    </div>
  </div>
  
  {/* Preview mini */}
  <div className="border border-border rounded-[var(--radius-xl)] p-4">
    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
      Preview de cómo te ven tus alumnos
    </p>
    <ClientAppMiniPreview brandColor={brandColor} logo={brandLogo} />
  </div>
</div>
```

---

## FASE 17: SUBSCRIPTION PAGE — `src/app/coach/subscription/page.tsx`

### 17.1 — Rediseño de Gestión de Suscripción

```tsx
// Card principal con plan actual
// Métricas de uso: alumnos actuales / máximo permitido
// Opciones de upgrade/downgrade
// Historial de pagos como tabla elegante
// CTA de upgrade con highlight si está cerca del límite

<div className="space-y-6">
  {/* Current Plan Card */}
  <div className="relative overflow-hidden bg-card border border-border 
    rounded-[var(--radius-2xl)] p-6">
    {/* Background gradient */}
    <div className="absolute top-0 right-0 w-48 h-48 
      bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
    
    <div className="relative">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest 
            text-primary">Plan actual</span>
          <h2 className="font-display font-bold text-2xl mt-1">
            {planName}
          </h2>
        </div>
        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
          Activo
        </Badge>
      </div>
      
      {/* Usage bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Alumnos activos</span>
          <span className="font-semibold">
            {currentClients} / {maxClients}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all",
              clientsPct > 90 ? "bg-destructive" 
              : clientsPct > 70 ? "bg-warning" 
              : "bg-primary"
            )}
            style={{ width: `${clientsPct}%` }}
          />
        </div>
      </div>
      
      {/* Price */}
      <div className="flex items-baseline gap-1">
        <span className="font-display font-bold text-3xl">
          ${priceFormatted}
        </span>
        <span className="text-muted-foreground">/mes</span>
        {billingCycle !== 'monthly' && (
          <Badge className="ml-2 bg-success/10 text-success border-success/20">
            {billingCycle === 'annual' ? '-20%' : '-10%'}
          </Badge>
        )}
      </div>
    </div>
  </div>
  
  {/* Upgrade options grid */}
  {/* Payment history table */}
</div>
```

---

## FASE 18: NAVIGATION DEL CLIENTE — `components/client/ClientNav.tsx`

### 18.1 — Bottom Navigation Rediseñada

```tsx
// 5 tabs: Inicio / Workout / Nutrición / Progreso / Perfil
// Estilo: pill active state con primary color
// Animación: spring al cambiar tab

<nav className="fixed bottom-0 inset-x-0 z-40 pb-safe">
  <div className="bg-card/80 backdrop-blur-xl border-t border-border">
    <div className="flex items-center justify-around px-2 py-2">
      {navItems.map(item => {
        const isActive = pathname.includes(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-col items-center gap-1 
              px-4 py-2 rounded-[var(--radius-lg)]
              transition-all duration-200"
          >
            {isActive && (
              <motion.div
                layoutId="nav-pill"
                className="absolute inset-0 bg-primary/10 rounded-[var(--radius-lg)]"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <item.icon 
              size={20} 
              className={cn(
                "relative transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className={cn(
              "relative text-[10px] font-semibold transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </div>
  </div>
</nav>
```

---

## FASE 19: COMPONENTES GLOBALES

### 19.1 — ThemeToggle Rediseñado

```tsx
// Toggle animado con sun/moon icons
// Background: pill que se desliza

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()
  
  return (
    <motion.button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="relative w-14 h-7 rounded-full bg-muted border border-border
        flex items-center transition-colors duration-200
        hover:bg-muted/80"
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute w-5 h-5 rounded-full bg-card shadow-sm
          flex items-center justify-center"
        animate={{ x: theme === 'dark' ? 2 : 30 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {theme === 'dark' 
          ? <Moon size={12} className="text-primary" />
          : <Sun size={12} className="text-warning" />
        }
      </motion.div>
    </motion.button>
  )
}
```

### 19.2 — Toast (Sonner) Customizado

```tsx
// En layout.tsx:
<Toaster
  richColors
  position="top-center"
  toastOptions={{
    classNames: {
      toast: 'font-sans rounded-[var(--radius-xl)] border shadow-lg',
      title: 'font-semibold font-sans',
      description: 'font-sans text-muted-foreground',
    },
  }}
/>
```

### 19.3 — Loading States

```tsx
// Skeleton components con nuevo estilo
const SkeletonCard = () => (
  <div className="bg-card border border-border rounded-[var(--radius-xl)] p-5">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-full skeleton" />
      <div className="flex-1 space-y-2">
        <div className="h-4 rounded skeleton w-1/2" />
        <div className="h-3 rounded skeleton w-1/3" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 rounded skeleton" />
      <div className="h-3 rounded skeleton w-5/6" />
      <div className="h-3 rounded skeleton w-4/6" />
    </div>
  </div>
)
```

---

## FASE 20: EXERCISE CATALOG — `src/app/coach/exercises/page.tsx`

### 20.1 — Rediseño del Catálogo

```tsx
// Layout: filters sidebar + grid de ejercicios
// Filters: muscle group, equipment, difficulty (chips seleccionables)
// Search: input con icon + clear button
// Exercise Cards: imagen/gif + nombre + tags de músculo

// Exercise Card:
<div className="bg-card border border-border rounded-[var(--radius-xl)] overflow-hidden
  hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
  onClick={() => openExerciseDetail(exercise)}
>
  {/* GIF/Image */}
  <div className="aspect-video bg-muted relative overflow-hidden">
    <img 
      src={exercise.gifUrl} 
      alt={exercise.name}
      className="w-full h-full object-cover"
    />
    {/* Difficulty badge */}
    <div className={cn(
      "absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold",
      exercise.difficulty === 'beginner' && "bg-success/90 text-white",
      exercise.difficulty === 'intermediate' && "bg-warning/90 text-white",
      exercise.difficulty === 'advanced' && "bg-destructive/90 text-white",
    )}>
      {exercise.difficulty}
    </div>
  </div>
  
  {/* Info */}
  <div className="p-3">
    <p className="font-semibold text-sm truncate">{exercise.name}</p>
    <div className="flex flex-wrap gap-1 mt-1.5">
      {exercise.muscleGroups.slice(0, 2).map(muscle => (
        <span key={muscle} 
          className="text-[10px] font-medium bg-primary/8 text-primary px-2 py-0.5 rounded-full">
          {muscle}
        </span>
      ))}
    </div>
  </div>
</div>
```

---

## RESUMEN DE ARCHIVOS A MODIFICAR

### Design System (crítico, primero)
1. `src/app/globals.css` — Paleta, variables, utilities, animaciones
2. `src/app/layout.tsx` — Nuevas fuentes (Space Grotesk + Plus Jakarta Sans)
3. `src/components/ui/button.tsx` — Nuevas variantes y tamaños
4. `src/components/ui/card.tsx` — Nuevo diseño base + PremiumCard
5. `src/components/ui/input.tsx` — Nuevo estilo
6. `src/components/ui/glass-card.tsx` — Refactor con nuevo sistema
7. `src/components/ui/glass-button.tsx` — Unificar en button.tsx

### Páginas Públicas
8. `src/app/page.tsx` — Landing completa
9. `src/app/pricing/page.tsx` — Pricing rework
10. `src/app/legal/page.tsx` — Layout editorial
11. `src/app/privacidad/page.tsx` — Layout editorial

### Auth
12. `src/app/(auth)/layout.tsx` — Split screen nuevo
13. `src/app/(auth)/login/page.tsx` — Form premium
14. `src/app/(auth)/register/page.tsx` — Multi-step mejorado
15. `src/app/(auth)/forgot-password/page.tsx` — Simplificado elegante
16. `src/app/(auth)/reset-password/page.tsx` — Con strength indicator

### Coach Area
17. `src/app/coach/dashboard/page.tsx` — Bento grid
18. `src/app/coach/dashboard/CoachOnboardingChecklist.tsx` — Experience Guide
19. `src/components/coach/CoachSidebar.tsx` — Sidebar premium
20. `src/components/coach/ClientCardV2.tsx` — Athletic Profile Card
21. `src/app/coach/clients/page.tsx` — Toggle cards/lista
22. `src/app/coach/clients/[clientId]/page.tsx` — Profile header + tabs
23. `src/app/coach/builder/[clientId]/page.tsx` — Builder header + blocks
24. `src/app/coach/settings/page.tsx` — Settings con preview
25. `src/app/coach/subscription/page.tsx` — Subscription dashboard
26. `src/app/coach/exercises/page.tsx` — Exercise catalog grid
27. `src/components/coach/dashboard/DashboardCharts.tsx` — Charts rediseñados

### Client Area
28. `src/app/c/[coach_slug]/dashboard/page.tsx` — Dashboard motivacional
29. `src/app/c/[coach_slug]/workout/[planId]/page.tsx` — Execution redesign
30. `src/app/c/[coach_slug]/check-in/page.tsx` — Check-in wizard
31. `src/app/c/[coach_slug]/nutrition/page.tsx` — Nutrition rework
32. `src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx` — Onboarding wizard
33. `src/components/client/ClientNav.tsx` — Bottom nav con pill animation

### Componentes Globales
34. `src/components/ThemeToggle.tsx` — Toggle animado
35. `src/components/ui/skeleton.tsx` — (crear si no existe)
36. `src/lib/animation-presets.ts` — Nuevos presets de animación

---

## ORDEN DE EJECUCIÓN

### Sprint 1 — Foundation (Prioridad máxima)
1. Crear branch `pruebasui`
2. Modificar `globals.css` — nueva paleta y utilities
3. Modificar `layout.tsx` — nuevas fuentes
4. Modificar componentes base: `button`, `card`, `input`
5. Verificar que la app corra sin errores (`npm run dev`)

### Sprint 2 — Auth & Public Pages
6. Layout auth split-screen
7. Login form
8. Register multi-step
9. Forgot/Reset password
10. Landing page
11. Pricing page
12. Legal + Privacy

### Sprint 3 — Coach Dashboard
13. Coach Sidebar
14. Coach Dashboard (bento grid + KPIs)
15. Onboarding Checklist
16. ClientCardV2
17. Clients page
18. Client Profile page (header + tabs)

### Sprint 4 — Coach Tools
19. Workout Builder
20. Exercise Catalog
21. Nutrition Plans
22. Settings + Subscription

### Sprint 5 — Client Experience
23. Client Dashboard (motivacional)
24. Workout Execution + Rest Timer + Summary
25. Check-in Wizard
26. Nutrition Client View
27. Onboarding Alumno

### Sprint 6 — Polish
28. Animaciones y microinteracciones
29. Skeleton loaders
30. Toast customization
31. Responsive testing en mobile
32. Dark mode refinement
33. Accesibilidad básica (contraste, focus states)

---

## VERIFICACIÓN

### Checklist técnico post-rework:
- [ ] `npm run dev` sin errores de compilación
- [ ] `npm run build` exitoso
- [ ] Paleta de colores aplicada en light y dark mode
- [ ] Fuentes Space Grotesk y Plus Jakarta Sans cargando correctamente
- [ ] Animaciones corriendo sin janks (60fps)
- [ ] Responsive en 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1280px+ (Desktop)
- [ ] Safe areas funcionando en mobile (notch top/bottom)
- [ ] Bottom navigation correctamente posicionada
- [ ] White-label theming: `--theme-primary` override funcionando
- [ ] Contraste WCAG AA en textos principales
- [ ] Focus states visibles para accesibilidad de teclado
- [ ] Toasts apareciendo con nuevo estilo
- [ ] Modales con backdrop blur correcto
- [ ] Drag & drop del builder aún funcionando
- [ ] Formularios de auth validando correctamente
- [ ] Workout execution completo (log → rest timer → summary)
- [ ] Check-in flow completo (energía → peso → foto)
- [ ] Onboarding flow completo (coach y alumno)

### Testing visual recomendado:
1. Abrir landing en incógnito → simular primer visit de coach potencial
2. Completar registro de coach desde cero
3. Crear un alumno y enviarlo por su onboarding
4. Asignar un programa al alumno
5. Ejecutar un workout completo como alumno
6. Hacer un check-in como alumno
7. Ver dashboard del coach con datos reales
8. Cambiar color de marca en settings y verificar que refleja en área del alumno
9. Probar en dark mode — todas las pantallas
10. Probar en mobile (Chrome DevTools → iPhone 14 viewport)

---

## NOTAS DE IMPLEMENTACIÓN

- **No cambiar lógica de negocio**: Solo cambiar JSX, clases CSS y estilos. Mantener todos los server actions, hooks, y utilidades intactos.
- **Backwards compat de white-label**: El sistema `--theme-primary` debe seguir funcionando. El nuevo violeta (#6B21FE) es el default, pero coaches que tengan su propio color verán ese color sobreescribir la variable.
- **Framer Motion**: Mantener los `animation-presets.ts` existentes y agregar nuevos. No remover presets existentes ya que pueden estar usados.
- **Shadcn components**: Los 26 componentes de `/components/ui/` ya están en el repo como código propio — modificar directamente sin reinstalar.
- **Iconos**: Mantener Lucide React. Solo estandarizar tamaños según el nuevo sistema de iconos.
- **i18n**: Todas las strings hardcoded nuevas deberían idealmente ir al `es.json` / `en.json`, pero en este sprint de rework visual está aceptable dejar strings en ES hardcoded y migrar después.
- **Tests**: El rework visual no debería romper tests de lógica (Vitest). Los tests de Playwright de UI pueden fallar y requerirán update posterior.
