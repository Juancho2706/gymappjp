# QA visual RN vs Web — paridad de diseño

Carpeta de evidencia visual para el proyecto de paridad RN mobile 1:1 con web
(`specs/rn-mobile-parity-redesign/`). Un par de screenshots (web + RN) por pantalla y por
tema, agrupados por etapa del plan.

## Estructura de carpetas

```
docs/audits/rn-parity-qa/
├── README.md                      (este archivo)
├── <etapa>/                       (ej: etapa-0, etapa-1, etapa-2, ...)
│   ├── <pantalla>-web-light.png
│   ├── <pantalla>-web-dark.png
│   ├── <pantalla>-rn-light.png
│   └── <pantalla>-rn-dark.png
```

Convención de `<pantalla>`: slug corto y estable, ej. `alumno-login`, `alumno-home`,
`alumno-workout-detalle`, `alumno-checkin`, `alumno-nutricion`, `coach-home`,
`coach-builder`. Un slug por pantalla, reutilizado en todas las etapas donde se re-audite.

Cada etapa cierra con **4 archivos por pantalla auditada** (web × light/dark, RN × light/dark).
Si una pantalla no tiene modo claro/oscuro diferenciado en RN todavía, igual se captura el
placeholder y se anota en la matriz de fidelidad (ítem "estados" abajo) que falta el theming.

## Matriz de dispositivos

Mínimo 1 Android gama media + 1 iPhone. Completar antes de la primera ronda de capturas de
cada etapa — sin dispositivo real (o simulador equivalente) definido, las capturas RN no son
comparables entre etapas.

| Rol | Dispositivo | OS / versión | Fuente (físico / simulador) | Responsable |
|-----|-------------|---------------|------------------------------|-------------|
| Android gama media | PENDIENTE-CEO | PENDIENTE-CEO | PENDIENTE-CEO | PENDIENTE-CEO |
| iPhone | PENDIENTE-CEO | PENDIENTE-CEO | PENDIENTE-CEO | PENDIENTE-CEO |

## Checklist de fidelidad por pantalla

Al comparar el par web/RN de una pantalla, marcar cada ítem. Cualquier "NO" exige nota de
justificación (limitación de plataforma) o queda como gap abierto en TASKS.md.

- [ ] **Spacing** — paddings/gaps externos e internos equivalentes (mismo ritmo vertical,
      mismos márgenes de borde de pantalla).
- [ ] **Tipografía** — familia, peso, tamaño y line-height coinciden con los tokens del DS
      (`font-display-black`, `font-sans`, `font-sans-medium`, etc. en RN vs. clases Tailwind
      equivalentes en web).
- [ ] **Tokens de color** — mismos valores de `theme.primary`/`theme.background`/
      `theme.foreground`/estados (success/danger) en ambos, sin hardcode que rompa
      brand-awareness por coach.
- [ ] **Radios** — `borderRadius` de cards/botones/inputs coincide con la escala de radios
      del DS (no valores mágicos sueltos).
- [ ] **Glow / sombras** — efectos de glow de marca (`GlowBorderCard` y equivalentes)
      presentes y con la misma intensidad relativa en RN.
- [ ] **Motion** — transiciones de entrada (`MotiView`/equivalente web) con timing/curva
      comparable; nada que parpadee o salte en RN que en web sea suave.
- [ ] **Estados** — loading, error, vacío (empty-state), disabled y éxito capturados y
      visualmente equivalentes entre plataformas (no solo el estado "feliz").
- [ ] **Modo oscuro** — el par light/dark de ambas plataformas mantiene el mismo contraste
      relativo (ningún elemento se "pierde" en dark que sea visible en light, o viceversa).

## Cómo agregar una ronda de capturas

1. Crear/usar la carpeta `<etapa>/` correspondiente al hito del plan (ver `TASKS.md`).
2. Capturar web con Playwright (`mcp__playwright__browser_take_screenshot`) en viewport
   equivalente al dispositivo mobile de la matriz.
3. Capturar RN con el dispositivo/simulador de la matriz (o Maestro `takeScreenshot`, ver
   `.maestro/README.md`).
4. Nombrar siguiendo la convención de arriba y correr el checklist de fidelidad por cada
   par.
5. Documentar hallazgos (los "NO" del checklist) en `specs/rn-mobile-parity-redesign/TASKS.md`
   bajo la etapa correspondiente, no solo como comentario suelto en el PR.
