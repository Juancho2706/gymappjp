# Plan de Corrección: Modo Claro Dashboard

Este plan detalla los pasos para lograr que el Dashboard del Coach sea perfectamente legible y estéticamente idéntico al Landing Page en su versión de modo claro.

## 1. Fundamentos del Layout
- [ ] **Fondo Global**: Asegurar que `src/app/coach/layout.tsx` o el contenedor principal use `bg-white` en modo claro en lugar de grises oscuros o negros.
- [ ] **Contraste de Textos**: Revisar todas las clases `text-muted-foreground` y `text-foreground` para asegurar que cumplen con los estándares de accesibilidad sobre fondo blanco.

## 2. Refinamiento de Glassmorphism Claro
- [ ] **Componente `GlassCard`**:
    - Ajustar para usar `bg-white/70` con `backdrop-blur-xl`.
    - Bordes más definidos en modo claro (`border-black/5` o `border-blue-500/10`).
    - Sombras (`shadow-xl`) más suaves pero perceptibles para dar elevación sobre el blanco.
- [ ] **Degradados Radial**:
    - Cambiar el azul intenso por un azul pastel o más traslúcido (`rgba(0, 122, 255, 0.05)`) que no ensucie el blanco de la tarjeta.

## 3. Visualización de Datos
- [ ] **Recharts en Claro**:
    - Cambiar colores de ejes a `text-zinc-500`.
    - Ajustar Tooltips para que tengan fondo blanco traslúcido y texto oscuro.
    - Líneas de rejilla casi invisibles.

## 4. Componentes Específicos
- [ ] **Terminal de Actividad**:
    - Evitar el fondo negro puro en modo claro. Usar un gris ultra claro o blanco con bordes.
    - Cambiar los colores de los tokens (Cian, Verde) por versiones que contrasten mejor sobre blanco.
- [ ] **Alertas**:
    - El estilo de las alertas de vencimiento debe usar un rojo/rosa más suave en el fondo para no ser agresivo al ojo en fondo blanco.

## 5. Verificación Final
- [ ] **Consistencia con Landing**: Comparar lado a lado con la sección de precios/features del landing page para asegurar que los blancos y efectos blur coinciden.
