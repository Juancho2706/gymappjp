# Investigación: mejorar la experiencia del ALUMNO en EVA (UI/UX + funciones, SIN AI)

**Fecha:** 2026-07-02
**Autor:** investigación de producto (subagente)
**Alcance:** qué hace que la app del alumno (PWA web + futura RN) se sienta mejor, enganche más y ayude más — diseño, psicología de hábitos, features mecánicas/funcionales.
**Regla dura del CEO:** CERO features de AI (nada de chatbot, "AI coach", generación automática). Todo lo de abajo es diseño, psicología y mecánica.

> **Ya lo tiene EVA (no re-propuesto):** rutinas con superseries + timers + cola offline, nutrición con macros/porciones/hábitos, check-in mensual con fotos, streaks básicas, PRs con confetti, push web, white-label por coach. Las propuestas son lo NUEVO o lo MEJORABLE.

Cada propuesta trae: **qué es · por qué (evidencia con URL) · esfuerzo (S/M/L) · plataforma**.

---

## Hallazgo transversal #0 — El mayor riesgo de UX no es falta de features, es la CULPA

La evidencia 2025 más contundente para EVA no es "agregá gamificación", es **no lastimar al alumno**. Un estudio de 2025 en el *British Journal of Health Psychology* analizó **58.881 posts en X** sobre las 5 apps de fitness más taquilleras y encontró que **13.799 eran de sentimiento negativo**, dominados por vergüenza, culpa y frustración. Los disparadores concretos:

- **Streaks que se resetean a cero:** *"Estaba a tres días de mi racha de 100 días de log… perdí un día y volvió a cero."*
- **Notificaciones de "logueá tu comida":** *"No quiero loguear porque me da vergüenza que me acabo de comer un Domino's."*
- **Metas rígidas inalcanzables** y apps que "penalizan" el ejercicio bajando el déficit ("feeling penalized for physical activity").

La recomendación del propio estudio: diseñar para **autonomía, competencia y relación** (self-determination theory), con **metas flexibles, feedback más preciso, reglas de racha más amables y recordatorios sin juicio.**
Fuentes:
- British Journal of Health Psychology 2025 (Sheen et al.): https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjhp.70026
- Resumen con quotes: https://studyfinds.com/fitness-app-motivation-study-myfitnesspal/
- Cobertura: https://www.usnews.com/news/health-news/articles/2025-10-24/fitness-apps-undermine-motivation-for-some-users-experts-say
- Systematic review "dark side" de self-service fitness tech (2024): https://journals.sagepub.com/doi/10.1177/07439156231224731

**Implicación para EVA:** varias propuestas de abajo (P1, P2, P3, P8) apuntan directo a esto. Es el diferenciador de marca más barato y defendible que tiene una app de coach humano: **el humano es el que perdona, no el algoritmo que castiga.**

---

## A. Rachas compasivas (arreglar lo que EVA ya empezó)

### P1 — Streak "escudo"/freeze + "recuperá tu racha" (earn-back), y contar semanas, no días perfectos
**Qué es:** que una racha no se destruya por un día perdido. Dos mecanismos, ambos probados por Duolingo: (1) un **escudo/freeze** limitado (p.ej. 1–2 por mes) que absorbe un día flojo automáticamente; (2) **earn-back / "recuperá tu racha"**: si se rompió, completá una acción chica dentro de una ventana corta y se restaura. Además, medir la racha en **"semanas al día"** (cumplir X sesiones/semana) en vez de días perfectos consecutivos — se alinea con el ciclo semanal real del entrenamiento.
**Por qué:** Duolingo reportó que el Streak Freeze **redujo el churn 21%** en usuarios en riesgo de romper la racha; investigación UPenn/UCLA muestra que dar "slack" (holgura) motiva MÁS que reglas rígidas; llegar a una racha de 7 días → 3,6× más probable de completar el curso. El reseteo-a-cero es literalmente uno de los disparadores de abandono citados en el estudio de BJHP.
- https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- https://www.justanotherpm.com/blog/the-psychology-behind-duolingo-s-streak-feature
- https://duolingo.deconstructoroffun.com/mechanics/streaks
**Esfuerzo:** S (freeze) / M (earn-back + re-modelo semanal). **Plataforma:** ambas (lógica en server/domain → 1:1).

### P2 — "Semana perfecta" y recap de racha positivo, nunca el conteo del fracaso
**Qué es:** en vez de mostrar "llevás 0 días" o "racha rota" en rojo, mostrar el **mejor logro** ("tu mejor racha: 24 días") y micro-celebrar la semana completa. El estado vacío nunca acusa.
**Por qué:** el conteo del fracaso es exactamente lo que dispara culpa (ver #0). Framing positivo sostiene la motivación (autonomía/competencia de SDT).
- https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjhp.70026
**Esfuerzo:** S. **Plataforma:** ambas.

---

## B. Lenguaje y notificaciones sin culpa (bienestar / accesibilidad)

### P3 — Auditoría de "lenguaje sin culpa" en toda la app del alumno
**Qué es:** pasada sistemática de copy en estados de alumno: nunca "fallaste", "atrasada", "incumpliste", "no lograste tu meta". Reemplazar por lenguaje de invitación y progreso ("¿retomamos?", "vas 4 de 5 esta semana", "¡buen trabajo esta semana!"). Estados vacíos que animan, no que regañan. Nota interna: hoy el dashboard del alumno clasifica estados como "atrasada/riesgo" — ese vocabulario es interno del coach, NO debe filtrarse tal cual al alumno.
**Por qué:** el estudio de BJHP muestra que "notifications of unmet goals triggered disappointment, guilt, and anxiety" y que metas/feedback mal enmarcados son la técnica que MÁS aparece en experiencias negativas. Cambiar palabras es casi gratis y ataca la causa raíz.
- https://studyfinds.com/fitness-app-motivation-study-myfitnesspal/
- https://www.medscape.com/viewarticle/research-asks-whether-fitness-apps-do-more-harm-than-good-2025a1000xqj
**Esfuerzo:** S. **Plataforma:** ambas (i18n keys compartidas).

### P4 — Notificaciones amables, con control granular del alumno
**Qué es:** el alumno elige qué le llega y cuándo (horario, días, tipos). NUNCA una notificación automática de "no cumpliste tu meta/racha". Recordatorios de tono positivo, y "snooze" fácil. Respetar quiet hours.
**Por qué:** las notificaciones de "logueá"/meta-no-cumplida son un disparador de vergüenza documentado; el control del usuario refuerza autonomía (SDT).
- https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjhp.70026
- https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/
**Esfuerzo:** S/M. **Plataforma:** ambas.

---

## C. Progreso visible y celebración (retención por competencia)

### P5 — "EVA Wrapped": recap semanal + mensual automático, compartible con la marca del coach
**Qué es:** un resumen personalizado auto-generado (no AI: plantillas + datos) al cierre de semana/mes: entrenamientos hechos, volumen total, PRs, adherencia a comidas/hábitos, mejor día, foto de progreso del mes. **Compartible como imagen** con el branding del coach (marketing orgánico para el coach). Estilo "Year in Sport" de Strava pero recurrente.
**Por qué:** Strava reporta 14 mil millones de kudos en 2025 y su "Year in Sport" es su pieza de engagement más viral, con escenas compartibles a IG/TikTok/WhatsApp. "Clientes que no ven progreso claro tienen 4× más probabilidad de abandonar en 3 meses; trackear progreso sube el éxito hasta 42%."
- https://support.strava.com/hc/en-us/articles/22067973274509-Your-Year-in-Sport
- https://press.strava.com/articles/strava-releases-12th-annual-year-in-sport-trend-report-2025
- https://gymkee.com/blog/personal-training-client-check-in-template/ (4× / 42%)
**Esfuerzo:** M (semanal simple) / L (mensual rico + share image render). **Plataforma:** ambas; el render de imagen compartible aplica web y RN.

### P6 — Comparador de fotos de progreso lado-a-lado (ghost overlay + swipe)
**Qué es:** EVA ya guarda fotos en el check-in mensual; falta el **comparador**. Elegir dos fechas y verlas lado a lado, con **guía fantasma (ghost overlay)** para repetir la pose, y un modo **swipe/slider** de "antes-después". Opcionalmente correlacionado con la curva de peso/medidas.
**Por qué:** es la feature de "wow" más citada en apps de progreso — "the visual results really help drive home what all those hours accomplished in a single side-by-side"; el ghost overlay para igualar la pose es estándar en Progress by Lasmit / My Body Tracker. La mejora visual la ve el alumno donde no ve el cambio diario.
- https://localonelabs.com/pages/blog/best-fitness-progress-photo-apps
- https://www.fitsw.com/blog/fitness-progress-photo-comparison-ios-app/
- https://www.trainerize.com/blog/how-to-pose-for-progress-pictures/
**Esfuerzo:** M. **Plataforma:** ambas.

### P7 — Hitos/badges más allá del PR: consistencia, primer mes, "vuelta al ruedo"
**Qué es:** celebraciones micro para hitos que hoy pasan sin fanfarria: primer entrenamiento, primer mes completo, N entrenamientos acumulados, semana perfecta, retorno tras ausencia ("qué bueno tenerte de vuelta"). Confetti/haptic/sonido opcional, coleccionables visibles en el perfil.
**Por qué:** micro-recompensas instantáneas disparan el loop de dopamina que forma hábito; el "First Win" badge sube activación. Cuidado: badges de consistencia/esfuerzo (controlables por el alumno), no de resultados (peso), para no caer en la trampa de culpa.
- https://studiokrew.com/blog/app-gamification-strategies-2025/
- https://clevertap.com/blog/app-gamification-examples/
- https://lifecyclearchitect.com/guides/activation-optimization-for-fitness-apps/
**Esfuerzo:** S (reusar motor de confetti de PR) / M (colección + reglas). **Plataforma:** ambas.

---

## D. "Sentirse acompañado" por el coach humano (el foso de EVA, sin AI)

### P8 — Reacciones y comentarios del coach sobre los logs del alumno
**Qué es:** el coach puede reaccionar (emoji) o dejar un comentario corto **directamente sobre un entrenamiento loggeado, una comida o un check-in**. El alumno recibe un push suave ("tu coach vio tu entreno de hoy 💪") y ve el pulgar/comentario in-context.
**Por qué:** es la feature de engagement estándar en Everfit/Trainerize y la más citada para prevenir el "quiet quitting": "cuando el cliente siente que el coach presta atención entre sesiones, se siente valorado, y cuando se siente valorado, se queda." Emoji reactions + voice/broadcast son diferenciadores explícitos de Everfit sobre TrueCoach (que carece de ellos).
- https://truecoach.co/blog/the-ultimate-guide-to-client-engagement-and-retention-strategies-for-personal-trainers/
- https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach
- https://www.trainerize.com/blog/client-communication-tools/
**Esfuerzo:** M. **Plataforma:** ambas (el alumno consume; el coach produce desde web/RN).

### P9 — Notas de voz del coach (1:1 y broadcast)
**Qué es:** el coach graba un audio corto (feedback de la semana, ánimo, corrección) y le llega al alumno. Broadcast (un audio a todo el roster) y 1:1.
**Por qué:** "voice messaging permite transmitir tono, matiz y claridad que el texto solo no puede." Future intercala **grabaciones de voz del coach** durante la sesión (pep talks + instrucciones) y es una de sus features más queridas; TrueCoach publica una guía dedicada de apps con voice messaging.
- https://truecoach.co/blog/the-best-personal-trainer-apps-with-voice-messaging-2026-guide/
- https://future.co/
- https://www.forbes.com/health/weight-loss/future-review/
**Esfuerzo:** M/L (grabación + storage + player; reusar bucket de check-in). **Plataforma:** ambas.

### P10 — "Lo que toca hoy", con un toque del coach
**Qué es:** al abrir la app, una tarjeta de "hoy" con la sesión del día y, si el coach quiere, una nota/voz de contexto ("hoy vamos pesado en sentadilla, calentá bien"). Voz-en-off opcional que se puede togglear.
**Por qué:** Ladder/Future: "la presencia del coach en pantalla hace sentir al usuario que tiene un compañero de entreno, con el coach virtualmente en la sala." El voiceover se puede prender/apagar según el nivel de guía deseado (autonomía).
- https://www.outdoorsynomad.com/ladder-fitness-app-review/
- https://future.co/
**Esfuerzo:** M. **Plataforma:** ambas.

---

## E. UX de logging de entrenamiento (rápido = placentero)

### P11 — Calculadora de discos (plate calculator) + calculadora de series de calentamiento
**Qué es:** dado un peso objetivo, mostrar **qué discos cargar por lado**; y auto-generar sets de calentamiento por porcentaje. EVA ya tiene superseries/timers; esto quita mate mental en el momento.
**Por qué:** "plate calculators salvan del cálculo mental; warm-up helpers"; es núcleo del fast-logging de Strong/Hevy/Setgraph y feature dedicada en Hevy.
- https://www.hevyapp.com/features/warm-up-set-calculator/
- https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters
**Esfuerzo:** S (plate calc) / M (warm-up %). **Plataforma:** ambas.

### P12 — Rendimiento anterior inline + "superá la última vez"
**Qué es:** en cada ejercicio, mostrar por defecto el **último peso×reps loggeado** como fantasma/placeholder; resaltar cuando el alumno lo iguala o supera ("+2,5 kg vs. la semana pasada 🔥"). Gráfica full-screen de progresión de ese lift.
**Por qué:** Boostcamp muestra "el último peso loggeado" y sugiere el siguiente; Hevy calcula 1RM y grafica volumen/mejor peso/reps totales — "progress charts son más motivadores que números crudos." Refuerza competencia (SDT) con datos que el alumno controla.
- https://www.boostcamp.app/workout-tracker
- https://apps.apple.com/us/app/hevy-workout-tracker-gym-log/id1458862350
**Esfuerzo:** S/M (EVA ya tiene los logs; es sobre todo presentación). **Plataforma:** ambas.

### P13 — Haptics + autoavance al marcar serie + rest timer por-ejercicio
**Qué es:** al tildar una serie: haptic sutil, arranca el timer de descanso automáticamente, y el foco avanza a la próxima serie/ejercicio. Descansos configurables **por ejercicio** (pesado vs. aislado), y timer opcional (off en superseries/circuitos).
**Por qué:** Hevy fue "puliéndose con más haptic feedback"; tildar la serie dispara el rest timer; descansos distintos por movimiento; timer opcional para no romper superseries. Es lo que hace el logging "intuitivo y rápido".
- https://www.hevyapp.com/features/workout-rest-timer/
- https://www.hevyapp.com/features/track-workouts/
**Esfuerzo:** S (autoavance/timer) — haptics: **RN** nativo pleno; en **web** solo Android (Vibration API), iOS Safari no vibra. **Plataforma:** ambas con caveat de haptics.

### P14 — Blindar el offline: "nunca perder un log"
**Qué es:** EVA ya tiene cola offline; endurecerla: indicador claro de "guardado localmente / sincronizando", reintento robusto, y **cero pérdida** si se cierra la app en un subsuelo sin señal. Confirmación visible de que la serie quedó.
**Por qué:** la queja #1 que mata apps de coach es perder trabajo — Trainerize: "la app a veces no guarda los entrenamientos loggeados, perdiendo todo"; su propio help center lista crashes al ingresar peso. El subsuelo del gym sin señal es el caso de uso crítico de offline.
- https://help.trainerize.com/hc/en-us/articles/360034499751-Known-Issues-We-Are-Currently-Working-On
- https://getfitcraft.com/blog/best-fitness-apps-offline
**Esfuerzo:** M. **Plataforma:** ambas (PWA service worker + RN local store).

---

## F. Check-in que la gente SÍ completa

### P15 — Check-in de baja fricción (<5 min) con deep-link directo y progreso a la vista
**Qué es:** el recordatorio de check-in abre **directo el formulario** (deep-link), no la home. Formulario corto, guardable a medias, con las respuestas de la semana pasada pre-cargadas. Al terminar, el alumno ve su propia curva/foto (recompensa inmediata). Considerar frecuencia semanal opcional además del mensual actual.
**Por qué:** "para el 80% de los clientes el check-in semanal funciona mejor" y "debe tomar menos de 5 minutos"; "la razón #1 de no completarlo no es pereza, es confusión/fricción"; ver progreso al instante cierra el loop (competencia).
- https://gymkee.com/blog/personal-training-client-check-in-template/
- https://usecoached.com/blog/how-to-do-client-check-ins-personal-trainers
- https://hubfit.com/blog/the-ultimate-guide-to-online-coaching-check-ins
**Esfuerzo:** S/M. **Plataforma:** ambas.

---

## G. Superpoderes PWA 2026 (aplican a la web; RN los tiene nativos)

### P16 — Badging API: número en el ícono para "algo te espera"
**Qué es:** badge numérico en el ícono de la PWA instalada: rutina de hoy pendiente, mensaje/nota de voz del coach sin leer, check-in por vencer. Se limpia al entrar.
**Por qué:** el Badging API funciona en **iOS 16.4+** y Android para PWAs instaladas; es un nudge de baja fricción y sin culpa (número neutro, no notificación acusatoria).
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon
- https://blog.logrocket.com/display-notification-badges-pwas-using-badging-api/
**Esfuerzo:** S. **Plataforma:** web/PWA (RN: equivalente nativo).

### P17 — Push rico: botones de acción + respuesta inline + imagen
**Qué es:** notificaciones con **botones** ("Marcar hecho", "Ver rutina", "Responder al coach"), **respuesta inline** (texto directo desde la notificación, tipo `action: text`), y **banner image** (foto del PR, thumbnail de la rutina).
**Por qué:** el Notification API soporta `actions` y acciones tipo texto para reply inline; Chrome/Edge soportan imágenes grandes (Safari más limitado — degradar con gracia). Reduce fricción a "un tap desde la cama".
- https://developer.mozilla.org/en-US/docs/Web/API/Notification/actions
- https://web.dev/articles/push-notifications-notification-behaviour
- https://www.pushwoosh.com/blog/rich-push-notifications/
**Esfuerzo:** S/M. **Plataforma:** web/PWA (soporte de `actions` desigual en iOS — feature-detect).

### P18 — Share Target + shortcuts (con expectativas realistas por plataforma)
**Qué es:** registrar la PWA como **share target** para que el alumno comparta una foto de comida/progreso desde la galería directo a EVA; **app shortcuts** (long-press del ícono → "Registrar comida", "Empezar rutina").
**Por qué:** acelera el logging. **Caveat 2026:** iOS PWA **no** soporta shortcuts ni widgets (sí Android); no prometer paridad. Widgets iOS = solo vía la app RN. Documentar el gap.
- https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- https://www.mobiloud.com/blog/progressive-web-apps-ios
**Esfuerzo:** S (Android) / — (iOS shortcuts no disponible; widgets → RN). **Plataforma:** Android PWA + RN.

---

## H. Onboarding: primera victoria en <5 minutos

### P19 — "Primera victoria" del alumno el día 1
**Qué es:** que el primer ingreso del alumno termine en un **valor real y rápido**: primer entrenamiento hecho, o primer check-in inicial con foto, que desbloquea el primer badge y su tarjeta de progreso. Pedir datos pesados (historial, objetivos) DESPUÉS de la primera victoria, no antes.
**Por qué:** "las primeras 72 horas son las más críticas — si no hay un quick win, el usuario se va"; retención D7 en fitness suele ser <15%; un +10 pts en activación D1 → +15–20% en retención D30. "El mejor onboarding no parece onboarding, se siente como valor ahora."
- https://lifecyclearchitect.com/guides/activation-optimization-for-fitness-apps/
- https://www.fitnessondemand247.com/news/fitness-app-onboarding
- https://enable3.io/blog/app-retention-benchmarks-2025
**Esfuerzo:** M. **Plataforma:** ambas.

---

## I. Comunidad opt-in (con MUCHO cuidado)

### P20 — Retos/leaderboards opt-in dentro del roster del coach, basados en consistencia
**Qué es:** retos y rankings **opcionales** entre los alumnos de un mismo coach (no global, no ranking de peso/físico). Basados en acciones controlables: entrenamientos completados, semanas al día, hábitos. Siempre desactivable.
**Por qué:** los leaderboards satisfacen la necesidad de **relación** (SDT) y predicen mayor frecuencia de entrenamiento — pero "pueden pasar de motivar a generar ansiedad cuando las brechas se agrandan"; por eso: opt-in, cohorte chica (roster del coach), y métrica de esfuerzo no de resultado. Everfit usa challenges/leaderboards como su capa de gamificación.
- https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full
- https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach
**Esfuerzo:** M/L. **Plataforma:** ambas.

---

## J. Salud del cuerpo y accesibilidad

### P21 — Importar datos de salud del teléfono (pasos, peso, sueño)
**Qué es:** sincronizar automáticamente pasos/peso/sueño desde el teléfono para enriquecer check-ins y contexto del coach sin data-entry manual.
**Por qué:** reduce fricción y da al coach señal pasiva. **Caveat crítico 2026:** **Google Fit está deprecado** — integrar contra **Android Health Connect** (su reemplazo) + **Apple HealthKit**. Esto es **nativo → prioridad RN**, no PWA (los navegadores no leen HealthKit/Health Connect).
- https://support.google.com/googlehealth/answer/17037331
- https://medium.com/@rohandhalpe05/integrating-apple-health-and-google-health-connect-in-health-fitness-apps-f9e04218c645
**Esfuerzo:** M/L. **Plataforma:** RN (prioridad); web no aplica.

### P22 — Accesibilidad: tamaños de fuente que respetan el sistema + dark automático
**Qué es:** EVA ya tiene dark mode; agregar **dark automático** por preferencia del sistema y soporte real de **escalado de fuente** (Dynamic Type / font-size del OS) sin romper layouts. Contraste alto en pantallas de ejercicio (se leen a distancia del rack).
**Por qué:** la accesibilidad amplía adherencia (alumnos mayores — Everfit destaca "hasta clientes de 70 años encuentran todo"); el alto contraste es citado como fortaleza de UX de Everfit; SDT y bienestar piden reducir barreras.
- https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach
- https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
**Esfuerzo:** S/M. **Plataforma:** ambas.

---

## Priorización sugerida (para el jefe/CEO)

**Quick wins de alto impacto (S, atacan culpa/retención):** P1 (freeze), P2 (framing racha), P3 (lenguaje sin culpa), P4 (notifs amables), P16 (badging), P12 (rendimiento anterior).

**Diferenciadores de "coach humano" (M, foso competitivo):** P8 (reacciones del coach), P9 (notas de voz), P5 (EVA Wrapped), P6 (comparador de fotos).

**Robustez que retiene sin brillar (M):** P14 (blindar offline), P15 (check-in <5 min), P19 (primera victoria).

**Apuestas mayores / RN-first (L):** P21 (Health Connect/HealthKit), P20 (comunidad opt-in), P10 (voz-en-off en sesión).

**Hilo conductor:** el estudio de BJHP 2025 dice que el humano perdona donde el algoritmo castiga. EVA tiene un coach humano real detrás de cada alumno — la UX del alumno debería **amplificar esa presencia humana** (P8/P9/P10) y **nunca castigar** (P1/P2/P3/P4). Ese es el ángulo que ninguna app self-service puede copiar barato.

---

## Fuentes (índice)

**Apps de coach — features del cliente y quejas:**
- Everfit vs Trainerize vs TrueCoach (2026): https://blog.everfit.io/everfit-vs-trainerize-vs-truecoach
- Trainerize known issues (crashes/logs perdidos): https://help.trainerize.com/hc/en-us/articles/360034499751-Known-Issues-We-Are-Currently-Working-On
- Trainerize reviews (Capterra): https://www.capterra.com/p/140262/Trainerize/reviews/
- Client communication tools 2025: https://www.trainerize.com/blog/client-communication-tools/
- TrueCoach engagement/retention: https://truecoach.co/blog/the-ultimate-guide-to-client-engagement-and-retention-strategies-for-personal-trainers/
- Voice messaging apps 2026: https://truecoach.co/blog/the-best-personal-trainer-apps-with-voice-messaging-2026-guide/

**Logging UX:**
- Hevy rest timer: https://www.hevyapp.com/features/workout-rest-timer/
- Hevy track workouts: https://www.hevyapp.com/features/track-workouts/
- Hevy warm-up calculator: https://www.hevyapp.com/features/warm-up-set-calculator/
- Setgraph — apps testeadas por lifters: https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters
- Boostcamp tracker: https://www.boostcamp.app/workout-tracker

**Psicología de hábitos / rachas:**
- Duolingo streak habit: https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- Psicología del streak (freeze/churn -21%): https://www.justanotherpm.com/blog/the-psychology-behind-duolingo-s-streak-feature
- Streaks & retención 2×: https://duolingo.deconstructoroffun.com/mechanics/streaks
- Reminders/retention architecture: https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/

**Framing sin culpa / bienestar:**
- BJHP 2025 (social listening, 58.881 posts): https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjhp.70026
- Resumen con quotes: https://studyfinds.com/fitness-app-motivation-study-myfitnesspal/
- US News: https://www.usnews.com/news/health-news/articles/2025-10-24/fitness-apps-undermine-motivation-for-some-users-experts-say
- Medscape: https://www.medscape.com/viewarticle/research-asks-whether-fitness-apps-do-more-harm-than-good-2025a1000xqj
- "Dark side" systematic review 2024: https://journals.sagepub.com/doi/10.1177/07439156231224731

**Recaps / progreso / celebración:**
- Strava Year in Sport: https://support.strava.com/hc/en-us/articles/22067973274509-Your-Year-in-Sport
- Strava trend report 2025: https://press.strava.com/articles/strava-releases-12th-annual-year-in-sport-trend-report-2025
- Apps de fotos de progreso: https://localonelabs.com/pages/blog/best-fitness-progress-photo-apps
- FitSW photo comparison: https://www.fitsw.com/blog/fitness-progress-photo-comparison-ios-app/
- Gamificación 2025: https://studiokrew.com/blog/app-gamification-strategies-2025/
- CleverTap gamification: https://clevertap.com/blog/app-gamification-examples/

**Check-ins / retención / onboarding:**
- Gymkee check-in templates (4×/42%): https://gymkee.com/blog/personal-training-client-check-in-template/
- Coached check-ins: https://usecoached.com/blog/how-to-do-client-check-ins-personal-trainers
- HubFit check-ins 2026: https://hubfit.com/blog/the-ultimate-guide-to-online-coaching-check-ins
- Activación fitness (72h/quick win): https://lifecyclearchitect.com/guides/activation-optimization-for-fitness-apps/
- Onboarding fitness: https://www.fitnessondemand247.com/news/fitness-app-onboarding
- Benchmarks retención 2026: https://enable3.io/blog/app-retention-benchmarks-2025

**PWA capabilities 2026:**
- PWA iOS limits: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- PWA iOS guía 2026: https://www.mobiloud.com/blog/progressive-web-apps-ios
- Badging API (MDN): https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon
- Badging API (LogRocket): https://blog.logrocket.com/display-notification-badges-pwas-using-badging-api/
- Notification actions (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Notification/actions
- Notification behavior (web.dev): https://web.dev/articles/push-notifications-notification-behaviour
- Rich push (Pushwoosh): https://www.pushwoosh.com/blog/rich-push-notifications/

**Comunidad / SDT / social:**
- Frontiers Psychology 2025 (gamificación/SDT/leaderboards): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full
- Social media fitness / motivación intrínseca: https://pmc.ncbi.nlm.nih.gov/articles/PMC12339431/

**Coach humano / voz / acompañamiento:**
- Ladder review 2026: https://www.outdoorsynomad.com/ladder-fitness-app-review/
- Future: https://future.co/
- Forbes Future review: https://www.forbes.com/health/weight-loss/future-review/

**Integración de salud:**
- Google Fit → Health Connect: https://support.google.com/googlehealth/answer/17037331
- HealthKit + Health Connect integración: https://medium.com/@rohandhalpe05/integrating-apple-health-and-google-health-connect-in-health-fitness-apps-f9e04218c645
