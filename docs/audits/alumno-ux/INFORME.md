# INFORME — Experiencia del Alumno: orden + mejoras (2026-07-02)

> Síntesis ejecutiva. Detalle completo: `estructura-desorden.md` (auditoría de código, archivo:línea por hallazgo) y `research-mejoras.md` (22 propuestas con evidencia 2025-2026 y fuentes). **Regla del CEO respetada: cero features de AI.**

---

## Parte 1 — El "desorden" es real: diagnóstico

La sensación de desorden tiene una causa estructural: **la app creció por capas y cada capa agregó su propia puerta a las mismas cosas**. Hoy:

| Qué | Dónde está repetido | Veredicto |
|---|---|---|
| Tema claro/oscuro + Colores del coach + Cerrar sesión | **4 lugares**: sidebar desktop, sheet "Más", engranaje del dashboard, /perfil | Deben vivir SOLO en /perfil. El resto = ruido |
| Check-in | **4-5 entradas** desde el dashboard: tab del nav, CheckInBanner, card "Tu coach", botón "Registrar" del peso | 2 entradas bastan (tab + banner cuando toca) |
| Módulos (Movimiento/Composición) | 3 lugares: sidebar, sheet Más, /perfil | Sidebar (desktop) + /perfil (móvil); fuera del sheet |
| Hábitos | **2 UIs distintas** editando la misma tabla (dashboard nuevo + nutrición legacy) | Unificar en el componente nuevo |
| Records/PRs | 3 superficies, **ninguna** con fecha ni detalle | Ver Parte 2 |

Agravantes:
- **El sheet "Más" y la pantalla /perfil ahora compiten**: mismo título ("Más"), acciones duplicadas. El sheet quedó obsoleto tras crear /perfil ayer — debe adelgazar a puro navegador (Historial, Perfil) o morir.
- **El engranaje del dashboard** (ClientSettingsModal) es 90% redundante; su único contenido propio es "Alarma de descanso" → mover eso a /perfil y matar el modal.
- **La card "Tu coach" parece un chat pero navega a check-in** — afordancia engañosa; o es contacto real o cambia de copy.
- **Nomenclatura**: Ejercicios tiene 5 nombres distintos según la pantalla (Aprender/Biblioteca/Catálogo/...); Nutrición 4. Elegir UNO por concepto.
- Código muerto de records (2 diseños viejos sin imports) — borrar.

**Propuesta de modelo mental (una regla):** *"Todo lo que es MÍO o CONFIGURACIÓN vive en Perfil. Todo lo que es HACER vive en su tab. El dashboard solo muestra, con máximo un atajo por cosa."*

## Parte 2 — Records/trofeos con fecha y detalle (pedido explícito)

La data YA existe — cero schema nuevo:
- `getPersonalRecords` ya trae `achievedAt` + `exerciseId` (hoy se descartan en el render).
- El historial completo del lift está en `workout_logs` → contrato propuesto `getExercisePRHistory(clientId, exerciseId)` (query nueva de lectura, mismas tablas).

Diseño propuesto (las 3 superficies):
1. **Fecha visible** en cada trofeo: "82.5 kg · 12 jun" (formato corto, `text-muted`).
2. **Tap → bottom-sheet de detalle**: nombre del ejercicio, PR actual con fecha, mini-gráfica de progresión del lift (mismos sparkline components), lista de los últimos records superados ("80 kg → 82.5 kg, +2.5"), y CTA "Ver técnica" (link al catálogo).
3. Celebración existente (confetti) intacta; el sheet es el "después".

Esfuerzo: S/M (1 query + 1 sheet + 3 touch-points).

## Parte 3 — Mejoras con evidencia actual (lo mejor del research)

**Hallazgo transversal que ordena todo lo demás:** la investigación 2025 (análisis de 58.881 posts, British Journal of Health Psychology) muestra que el mayor riesgo de las apps fitness no es falta de features sino la **CULPA**: rachas que se rompen a cero, notificaciones de "no cumpliste", metas rígidas → vergüenza → abandono. EVA hoy tiene lenguaje interno de coach ("Atrasada", "riesgo") que NO debe filtrarse al alumno.

### Quick wins (S — esta rama o la próxima)
1. **P3 Lenguaje sin culpa**: auditoría de copy del alumno — jamás "fallaste/atrasada"; reencuadre positivo ("retomá hoy"). Barato y de impacto directo.
2. **P1 Racha compasiva**: escudo/freeze (1-2 por mes) + "recuperá tu racha" + contar "semanas al día" en vez de días perfectos. Duolingo redujo churn 21% con freeze.
3. **P12 Rendimiento anterior inline**: "la última vez: 80 kg × 8" visible al loggear + micro-reto "superá la última vez" (data ya existe, lastSessionByBlock).
4. **P16 Badging API**: numerito en el ícono PWA cuando hay algo nuevo (soportado iOS 16.4+) — nudge sin notificación invasiva.

### Medianas (M — post-merge)
5. **P6 Comparador de fotos lado-a-lado** con ghost overlay + swipe — EVA ya guarda las fotos de check-in; falta el comparador. Feature "wow" clásica del nicho.
6. **P8 Reacciones del coach a los logs** (emoji/comentario sobre un workout/comida/check-in): "sentirse visto" es el predictor #1 de retención con coach humano — y es el foso de EVA vs apps genéricas.
7. **P5 "EVA Wrapped"**: recap semanal/mensual auto-generado, compartible CON LA MARCA DEL COACH (marketing orgánico del coach — sinergia white-label).
8. **P15 Check-in <5 min** con deep-link directo desde push y barra de progreso.
9. **P17 Push rico**: botones de acción + respuesta inline.
10. **P14 Blindar offline**: "nunca perder un log" — la queja #1 que mata a Trainerize en reviews (gimnasio subsuelo sin señal). EVA ya tiene cola offline; endurecerla + indicador claro de "guardado local".

### Para RN (anotar, no ahora)
11. **P9 Notas de voz del coach** (1:1 y broadcast) — feature más querida de Future/TrueCoach.
12. **P21 Health Connect + HealthKit** (Google Fit está deprecado) — pasos/peso automáticos.
13. Widgets + shortcuts (iOS no los da a PWA — argumento pa'l app RN).

### Descartado por diseño
- Comunidad/leaderboards: solo opt-in y con mucho cuidado (evidencia mixta, riesgo de comparación negativa). No priorizar.
- Todo lo AI: fuera por regla del CEO.

## Decisiones que necesito del CEO

1. **Orden (Parte 1)**: ¿apruebo el modelo "config vive en Perfil, un atajo máximo por cosa" y ejecuto la limpieza (sheet Más adelgazado, engranaje muerto, entradas de check-in a 2, nombres unificados)?
2. **Records (Parte 2)**: ¿apruebo fecha + sheet de detalle con progresión?
3. **Research (Parte 3)**: ¿cuáles de los quick wins S entran ya (recomiendo 1-4 completos) y cuáles M agendamos post-merge?
