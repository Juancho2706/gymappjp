# Estado del port 1:1 PWA → React Native (corrida nocturna)

> Documento vivo. Se actualiza y pushea en cada checkpoint. Si la sesión muere,
> retomar leyendo este archivo desde la sección "Dónde retomar".

**Branch de trabajo:** `claude/new-branch-rnmobile-x6qxw6`
**Metodología:** olas por sección — inventario → spec con evidencia (citas de archivo:línea del código web) → implementación contra la spec → verificación adversarial hasta 2 rondas consecutivas en cero → typecheck/lint → commit+push.

## Orden de secciones

| # | Sección | Estado |
|---|---------|--------|
| 0 | Fundación: tokens no-color + paridad de componentes compartidos | ✅ parcial (ver nota) |
| 1 | Vista de workout del alumno (inputs kg/reps + barras RIR/RPE) | 🔄 en curso (Opus) |
| 2 | Dashboard del alumno completo | ⏳ pendiente |
| 3 | Dashboard del coach completo | ⏳ pendiente |
| 4 | Nutrición (coach y alumno) | ⏳ pendiente |
| 5 | Builder del coach | ⏳ pendiente |
| 6 | Resto de secciones descubiertas en inventario | ⏳ pendiente |

## Hechos establecidos (reconocimiento)

- Web fuente de verdad: `apps/web/src/app` — coach en `coach/*`, alumno en `c/[coach_slug]/*`.
- Mobile: `apps/mobile/app` (Expo Router), componentes en `apps/mobile/components`.
- Paridad de tokens de COLOR ya gobernada: `pnpm check:tokens` pasa (86 tokens, claro+oscuro). Contrato: `specs/redesign-eva-ds/token-contract.md`. La Ola 0 cubre lo NO gobernado: tipografía, tamaños, espaciados, radios, sombras.
- Superficies web sin contraparte mobile (fuera de alcance): landing, admin, enterprise, org, pricing.

## Resultado Ola 0 (cortada a propósito, no fallida)

- ✅ Tokens no-color corregidos y pusheados (radios, tipografía, sombras, motion — commit c193a68a). Gate `pnpm check:tokens` sigue pasando.
- ✅ Mapa de 132 componentes compartidos web→RN construido.
- ✅ 1,293 discrepancias de paridad documentadas con evidencia (archivo:líneas) en `docs/rn-port/ola0-hallazgos.json`.
- ⚠️ Los FIXES de componentes NO se aplicaron (la cola se saturó de auditorías y se cortó la ola para preservar cuota del modelo grande). Las olas por sección deben consumir `ola0-hallazgos.json` al tocar cada componente.

## Dónde retomar

Sección 1 (workout del alumno) corriendo en Opus. Si murió: relanzar el workflow del script de sección 1 (scratchpad de la sesión) o rehacerlo desde este doc; los hallazgos de fundación están en `docs/rn-port/ola0-hallazgos.json`.

## Decisiones tomadas

1. Ola 0 recortada de 123→41 componentes y luego cortada tras las auditorías: el valor (tokens + hallazgos) ya estaba capturado y la cuota de Fable estaba por agotarse.
2. Desde la Sección 1 en adelante, TODOS los agentes corren en Opus; Fable solo orquesta.
3. Los componentes compartidos sin fix se corrigen dentro de la sección que los usa, consumiendo los hallazgos de la Ola 0.

## QA visual reportado por el usuario (build del 10-jul, dashboard alumno) — entrada P0 para Sección 2

1. **Barra blanca fea en el navbar** (tab bar inferior): franja blanca visible alrededor/detrás de la tab bar flotante en dark mode. Revisar fondo del contenedor de tabs / safe area / edge-to-edge en Android.
2. **Overlay "Entrenamiento completado"** (toast/badge verde con check): NO tapa el contenido de atrás — el texto de la card se lee a través/alrededor. Debe llevar backdrop/scrim u opacidad plena como en web (verificar contra el equivalente web).
3. **Header "Buenas tardes, Catalina" superpuesto con otro texto** (se ve texto duplicado/marquee detrás del saludo). Posible doble render del header o animación de entrada rota.

## Hallazgos pendientes / bloqueos

- ~1,293 discrepancias de componentes compartidos pendientes de aplicar (ver `docs/rn-port/ola0-hallazgos.json`).
