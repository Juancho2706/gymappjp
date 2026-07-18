# Digest de documentación previa — RN mobile paridad + rediseño EVA DS

> Preparado 2026-07-08. Fuente: 11 docs pedidos (`docs/audits/*` + `apps/mobile/CODEX_HANDOFF.md`). Objetivo: extraer qué sigue vigente hoy (post-rediseño EVA DS en master, post Fase L, post resiliencia ejecutor alumno) y qué quedó obsoleto, más las decisiones vinculantes que el plan de paridad RN debe respetar.

---

## 1. `docs/audits/rn-web-parity-2026-06-21.md` (2026-06-21)

**Contexto:** primer barrido de 11 agentes (workflow `rn-web-parity-audit`), TL;DR de alto nivel sobre coach standalone.

**Sigue vigente:**
- Tesis central: mobile NO está abandonado, el core loop (dashboard, alumnos, builder fuerza, nutrición gramos, brand editor, theming, check-in) es un port fiel — algunos puntos incluso superan a web. Esto sigue siendo cierto estructuralmente.
- Los 3 clusters de gap identificados (módulos de pago 0%, nutrition overhaul ausente, workout execution polimórfico ausente en mobile) **siguen siendo el gap dominante** — no hay evidencia de que se hayan cerrado desde jun-21.
- Riesgos sistémicos: `domain/cardio`/`domain/bodycomp` siguen viviendo en `apps/web/src/domain` (no en `packages/`) — extraer antes de portar sigue siendo la secuencia correcta.
- Corrección de memoria: cupones/discount codes NO están en master aún (confirmar antes de asumir paridad ahí).

**Quedó obsoleto / hay que re-verificar (esto es PRE-rediseño EVA DS, jun-21, mientras que el rediseño se mergeó a master 2026-07-04 con ~118 commits + Fase L + resiliencia ejecutor):**
- Toda referencia visual (tokens shadcn viejos, `SYSTEM_PRIMARY_COLOR #007AFF`/`BRAND_PRIMARY_COLOR #10B981`) es **pre-rediseño**. La web hoy usa el nuevo design system EVA DS (sport blue `#2680FF`, ember, aqua, Archivo+Hanken+JetBrains Mono) — ver doc `redesign-eva-ds-informe-2026-06-29.md` abajo. El plan de paridad RN debe apuntar al DS nuevo, no al viejo.
- Los efforts (S/M/L/XL) fueron estimados antes de Fase L y de la resiliencia del ejecutor — el "workout execution polimórfico" web ganó más superficie desde entonces (duración+cap 4h, drafts/snapshot, keypad, check-in P0 — PR #113, live 2026-07-08) que el audit no contempla.

**Decisiones vinculantes que reafirma:**
- Checkout/pagos/tarjeta = web+MercadoPago only (money-safety). Ícono app + splash = EVA-only (un solo binario, no per-coach).

---

## 2. `docs/audits/rn-mobile-vs-web-parity.md` (vivo, iniciado 2026-06-05, última entrada 2026-06-06 con tanda de fixes)

**Contexto:** documento vivo, auditoría menú-por-menú del coach standalone (9 menús: Dashboard, Alumnos, Programas, Ejercicios, Nutrición, Mi Marca, Suscripción, Soporte, Huérfanos), con tracker de remediación. Es el doc MÁS detallado y accionable de los 11.

**Estado de remediación (ya ejecutado a la fecha del doc, ~63 ítems):** todos los 7 S1 originales cerrados (favoritos nutrición N-F1, dashboard fallback D-F1, ghost-loader M-F1, editar-datos-alumno A-F1, variante AB/cíclica A-F2, doble-programa-activo P-F2, sync-stub P-F1), más TX-5/6(parcial)/7/9, y una capa gruesa de S2 por menú. **Esto significa que el gap real hoy (2026-07-08) es MENOR al que describe la tabla original de hallazgos** — hay que leer la sección "Estado de remediación (implementación)" (final del doc) como la verdad actual, no la tabla de hallazgos cruda.
- Sigue **bloqueado** (⛔) por decisión explícita: TX-6 (adoptar `@eva/schemas`/`@eva/types` en mobile) — requiere agregar el workspace dep + `pnpm install`, "lo hace el usuario". Si el plan de paridad quiere cerrar drift de contratos, este es un prerequisito no resuelto.
- Sigue **diferido por decisión/riesgo** (no tocar Supabase live durante ese trabajo autónomo): RPC transaccional real para el builder (unificar path org-blind del editor vs hub org-aware), org-filter reads profundos en algunos paths.
- **NO verificado si el resto de S2/S3 pendientes (Wave 2 incompleta: A-F6/F15/F16/F19/F20/F26, N-F9 meal-groups, N-F13 diet cycles, N-F14 history snapshot, E-F5 org path, SU-F4 historial pagos, SO-F2 adjunto) siguen abiertos hoy** — el doc no se ha vuelto a tocar desde 2026-06-06 según lo leído; asumir que siguen abiertos salvo evidencia de código más reciente.

**Hallazgos S1 estructurales (ya remediados, pero relevantes como paridad histórica a no rebotar):**
- Reducer plan-builder = port verbatim 1:1 con web — **esto es el mejor ejemplo de anti-drift del proyecto**, patrón a replicar.
- `db-compat.ts` (`selectWithFallback`) es el mecanismo por el que mobile tolera 2 shapes de DB (standalone vieja vs org-aware) — sigue siendo relevante mientras exista drift de schema entre lo que el APK espera y prod.

**Quedó obsoleto:**
- Referencias visuales puntuales (colores, "AppBackground" con blobs/grid, glass cards Skia) son del **viejo lenguaje visual mobile**, anterior al EVA DS. **Confirmado por git (ver doc #10 abajo): esta capa YA fue reemplazada en gran parte** por 52 commits `feat(redesign)` (Fases 0-9 + waves de pulido) — pero de forma **parcial/heterogénea**, no total (ver matiz de `06-mobile-inventory.md`: conviven Patrón A EVA-DS-nuevo y Patrón B legacy `theme`+`StyleSheet` según pantalla). No asumir "ya reemplazado en todos lados" ni "aún sin tocar" — verificar pantalla por pantalla contra `06-mobile-inventory.md`.
- El propio audit nota que un audit *previo* (`apps/mobile/AUDIT_RN_vs_WEB.md`, 2026-06-02) quedó obsoleto en varios puntos (decía "RN sin templates/foods/swaps" cuando ya existían) — ese archivo viejo NO debe consultarse como fuente de verdad; usar este doc en su lugar.

**Decisiones vinculantes:**
- MercadoPago no es nativo en móvil, documentado explícitamente como "web-only por diseño, NO portar" (confirmado también en CODEX_HANDOFF).
- El coach NO se auto-borra desde mobile (decisión usuario 2026-06-05): flujo reemplazo = "Solicitar baja por correo" mailto, no endpoint destructivo client-side.
- Código de invitación (`invite_code`) es el identificador primario/permanente del coach (decisión 2026-06-06), slug editable solo para legacy.

---

## 3. `docs/audits/alumno-web-vs-mobile.md` (2026-06-06)

**Contexto:** 9 áreas del alumno standalone auditadas, con verificación adversarial.

**Sigue vigente (probablemente, sin evidencia de fix posterior):**
- Los S1 de integridad de datos consolidados (A1-A9): duplicación de `workout_logs` por `upsert` sin `onConflict`, fecha UTC en vez de Santiago, nutrición offline muerta (NetInfo no instalado), sin gates de suspendido/force-password, dashboard con progreso hardcodeado 18%, sin baja de cuenta (Ley 21.719), sin aplicar swaps de nutrición. **Ninguno de estos aparece mencionado como resuelto en ningún otro doc leído** — hay que verificar contra código actual, no asumir cerrado.
- Patrón transversal: sin capa de datos central, contratos no compartidos, offline frágil, gates de acceso no portados — mismas causas raíz que el coach.

**Muy importante para el plan actual — nota de ALCANCE:** este doc es de **alumno standalone contra la web VIEJA (pre-rediseño)**. La resiliencia del ejecutor alumno (PR #113, live 2026-07-08: duración+cap 4h, check-in P0, drafts/snapshot, keypad) y el rediseño EVA DS cambiaron sustancialmente la superficie de la web que hay que igualar — este audit **describe el alumno viejo de ambos lados**, útil para los bugs de datos (probablemente siguen ahí) pero **no cubre las features nuevas del ejecutor resiliente ni el keypad/RPE/RIR de Fase L**.

**Decisión vinculante que reafirma:** el objetivo explícito es que el alumno mobile "supere" a la PWA usando ventajas nativas (cámara, HealthKit, Live Activity) — no es solo paridad, hay ambición de mejora nativa documentada en detalle en `mobile-native-advantages.md`.

---

## 4. `docs/audits/coach-mobile-readiness-review.md` (2026-06-06)

**Contexto:** revisión multidisciplinaria (14 roles) de readiness de LANZAMIENTO, no de paridad funcional pura. Va más allá de "¿está la feature?" a "¿se puede vender/lanzar esto?".

**Sigue vigente como marco de riesgo (release/legal/enterprise), aunque el estado puntual de cada P0 no está re-verificado:**
- Go/No-Go: standalone B2C 🟡 condicional, Enterprise B2B 🔴 No-Go (bloqueado, el flujo coach-enterprise no existe en mobile), Compliance 🔴 condicional.
- P0 técnicos (build sin env Supabase en prod, sin ErrorBoundary/Sentry, biometría escribe a tabla equivocada `clients` en vez de `client_intake`, push roto, reset-password roto, consentimiento de edad hardcodeado) — **relevantes para cualquier plan de "lanzar" la app, pero fuera del alcance estricto de "paridad visual+funcional 1:1"** que es el objetivo actual del proyecto. El plan de paridad puede/debe anotarlos como riesgo pero no necesariamente resolverlos en la misma ola.
- Causa raíz #5 explícita: "Enterprise no portado" — **coherente con la decisión ya tomada del proyecto** de excepciones intencionales (enterprise fuera de scope de paridad por ahora — aunque el `AuthProvider` debe diseñarse para soportarlo después).

**Quedó parcialmente obsoleto:** varias correcciones ya se hicieron dentro del mismo doc (§8, catálogo de ejercicios NO es create-only, biometría es mapeo no migración) — leer §8 antes de citar el resto del doc. Además varios P0 (build env, biometría) probablemente se tocaron en la tanda de fixes del `rn-mobile-vs-web-parity.md` (2026-06-06) — no está 100% claro cuáles se solaparon; verificar contra código.

**Decisión vinculante:** enterprise mobile = No-Go explícito hasta que se decida abordarlo — refuerza que el plan de paridad actual (alumno primero, standalone) es la secuencia correcta y no debe intentar cerrar enterprise de paso.

---

## 5. `docs/audits/mobile-roadmap.md` (2026-06-06)

**Contexto:** tablero maestro — índice de documentos + plan por olas (coach+alumno standalone, enterprise diferido).

**Sigue vigente como estructura de fases**, aunque el contenido de cada ola (qué incluye) hay que actualizarlo con lo aprendido después (rediseño DS, Fase L, resiliencia ejecutor):
- Ola 0 (cimientos compartidos: AuthProvider único, gates de navegación, hook de carga estándar, capa infrastructure/, motion tokens, NetInfo+idempotencia, push foundation, EAS env prod+CI) — **secuencia arquitectónica correcta, sigue aplicando como prerequisito antes de portar pantallas**, independientemente del rediseño visual.
- Ola 1 (alumno standalone paridad+integridad+deleite v1) — el contenido específico (swaps, porción parcial, PRs, etc.) hay que cruzarlo con lo que Fase L/resiliencia ya cambiaron en la web.
- Reglas de seguridad/ejecución autónoma (§0): NUNCA tocar Supabase live, NUNCA commit/push sin permiso, NUNCA acciones destructivas — **estas reglas siguen aplicando siempre**, son transversales a cualquier plan futuro de trabajo autónomo en mobile.

**Quedó obsoleto:** el mapa de documentos lista `mobile-enterprise.md` como "⏳ futuro" (nunca escrito) — sigue siendo cierto, no se encontró ese doc.

**Decisión vinculante explícita repetida:** ícono/splash EVA-only, checkout/pagos/tarjeta web-only — coincide exactamente con las "excepciones intencionales" del brief del usuario.

---

## 6. `docs/audits/mobile-shared-foundation.md` (2026-06-06)

**Contexto:** especifica los cimientos técnicos compartidos coach+alumno que hay que construir antes de pantallas (AuthProvider, capa de datos, contratos `packages/`, offline core, push, build/CI).

**Sigue totalmente vigente como especificación técnica** — es agnóstico al rediseño visual (habla de arquitectura, no de UI). Ningún punto contradice el estado actual del proyecto:
- `AuthProvider` único con gates (suspendido/force-password/onboarding), manejo central de 401, sesión en `expo-secure-store`.
- Adoptar `@eva/schemas`/`@eva/types`/`@eva/brand-kit/motion.ts` en mobile — sigue bloqueado según el tracker del doc #2 (TX-6 ⛔), es decir **este cimiento NO se ha construido todavía**, sigue siendo trabajo pendiente real.
- Fix de integridad `workout_logs` (upsert sin onConflict) — coincide con A1 de `alumno-web-vs-mobile.md`, sigue sin evidencia de fix.

**No hay nada obsoleto aquí** — es un documento de arquitectura pura, no de estado de pantallas.

---

## 7. `docs/audits/mobile-ux-design-language.md` (2026-06-06)

**Contexto:** research de lenguaje visual + motion para el alumno RN, PRE-rediseño EVA DS (referencia explícitamente el look "viejo" de mobile — dark-first genérico, color de marca dinámico, tokens propios).

**MUY IMPORTANTE — este doc está SUPERSEDED por el rediseño EVA DS del 2026-06-29/07-04.** El doc de rediseño (`redesign-eva-ds-informe-2026-06-29.md`) define un sistema de tokens/tipografía/color mucho más específico y ya mergeado a master en web (Archivo+Hanken+JetBrains Mono, sport/ember/aqua, radios/sombras/motion propios). Este doc de UX language:
- **Sigue útil** como investigación de **motion/microinteracción** (los tokens `DURATION`/`EASING`/`SPRING`, la regla "solo transform+opacity", el catálogo de tech por efecto — Skia/Moti/Reanimated/haptics) porque el informe de rediseño NO cubre motion en detalle, solo tokens de color/tipografía/forma. **Complementario, no contradictorio.**
- **Obsoleto** en la parte de paleta/color ("dark-first...", "acento de marca único") — el DS nuevo ya define el sistema de color completo (sport/ember/aqua fijos + white-label vía ramp `--sport-*`), reemplaza cualquier decisión de paleta de este doc.
- El plan actual debe: tomar los tokens de MOTION de este doc + los tokens de COLOR/TIPO del informe de rediseño — son dos capas complementarias.

**Decisión vinculante que aporta (motion, sigue aplicando):** `@eva/brand-kit/motion.ts` como fuente única web↔RN, reduce-motion global obligatorio, solo `transform`/`opacity` en loops, haptics siempre acoplado al frame visual.

---

## 8. `docs/audits/mobile-native-advantages.md` (2026-06-06)

**Contexto:** catálogo de features nativas (push, offline, cámara/scan, biometría, HealthKit, Live Activity, widgets) factibles en Expo SDK 54.

**Nota de versión:** el proyecto ahora corre **Expo SDK 54** confirmado en `CODEX_HANDOFF.md` y coherente con el brief del usuario (el doc dice SDK 54 también) — **no hay drift de versión**, el doc sigue siendo actual en ese eje.

**Sigue totalmente vigente** — es investigación de capacidades nativas, no de estado de pantallas. No hay evidencia en ningún otro doc de que se haya implementado ninguna de estas features nativas todavía (push local recordatorios, scan de barras, Face ID, HealthKit, Live Activity). Confirmar contra código si alguna se agregó después de jun-06.

**Relevancia para el plan actual:** el brief del proyecto dice "visual primero, luego olas funcionales" — este doc es material para las **olas funcionales posteriores** (Ola 2+ del roadmap), no para la ola de re-skin visual actual. No debería influir el plan inmediato de paridad 1:1, pero sí queda como backlog documentado de "superar a la web" post-paridad.

---

## 9. `docs/audits/pwa-screens-map-2026-06-22.md` (2026-06-22)

**Contexto:** mapa exhaustivo y VERIFICADO EN CÓDIGO de todas las rutas reales de la PWA web (42 coach + 13 alumno + 8 auth compartido = 63 rutas núcleo), con flujos de navegación.

**Sigue vigente en su mayoría como mapa de rutas** — es el inventario más confiable de "qué pantallas existen en web" porque está verificado contra `href`/`router.push`/`redirect` reales, no inferido. Es la referencia estructural clave para que el plan de paridad sepa **qué pantallas RN necesita** (rutas coach y alumno, redirects, gates).

**Posible desactualización (2026-06-22 es 2 semanas antes de hoy):**
- El rediseño EVA DS se mergeó 2026-07-04 (después de este mapa) — es posible que haya cambios de nomenclatura de rutas o nuevas pantallas desde entonces (Fase L agregó: kill `/join` explícito, búsqueda global, días pendientes). El doc menciona `/join/[invite_code]` como vivo — verificar si Fase L lo mató como dice el memory index ("kill /join").
- Resiliencia ejecutor alumno (PR #113) pudo agregar sub-estados a `/c/[coach_slug]/workout/[planId]` (drafts/snapshot) que este mapa no captura (es un mapa de rutas, no de sub-flujos internos).
- Confirmar si `/coach/reactivate`, `/coach/subscription/*` cambiaron con el trabajo reciente de pagos Flow+MercadoPago (rama actual del repo, `feat/pagos-flow-mercadopago`).

**Decisión vinculante que aporta (dato duro, no interpretación):** regla `<760px` no está en este doc — está en el informe de rediseño (doc #10) — pero este mapa confirma la arquitectura de "3 fachadas" del árbol alumno (`/c/`, `/e/`, `/t/` — standalone/enterprise/team, mismo árbol, distinto `basePath`), relevante si el plan de paridad RN alguna vez debe distinguir estos modos (team es feature permanente, ver CLAUDE.md).

---

## 10. `docs/audits/redesign-eva-ds-informe-2026-06-29.md` (2026-06-29)

**Contexto:** el informe que precede y especifica el rediseño EVA DS — describe el design system nuevo (tokens, 13 componentes, 2 UI kits ~55 pantallas) y el gap analysis vs el estado de código de ESE momento (antes de implementar).

**Estado: la implementación descrita aquí YA SE EJECUTÓ y mergeó a master** (memoria del proyecto: "Rediseño total EVA DS — LIVE EN PROD", merge 2026-07-04, ff 118 commits). Por tanto este doc debe leerse como **"la especificación de lo que ya está construido en la web hoy"**, no como plan pendiente. Es el documento MÁS IMPORTANTE de los 11 para el plan de paridad RN actual porque:
- Define el DS canónico que la web (web = fuente de verdad) ya implementa: sport blue `#2680FF`, ember `#FF6A3D` (nutrición, fijo), aqua `#18ABD4` (recovery, fijo), Archivo (display)+Hanken Grotesk (UI)+JetBrains Mono (data), radios iOS (cards 20px/controles 14px/pill), Lucide 2px stroke, motion quick&confident (ease-out 140-220ms).
- Define la capa semántica de tokens (`--surface-*`, `--text-*`, `--border-*`, `--action-*`) que reemplaza los tokens shadcn crudos viejos.
- **Regla vinculante crítica para RN:** "a <760px el desktop debe quedar idéntico a la mobile app" — el responsive web a ancho móvil ES la especificación visual de la app RN. Esto significa que **auditar la web en viewport móvil (<760px) es la fuente de verdad visual directa para el plan de paridad RN**, más confiable que inferir de capturas separadas.
- Ya declara "mobile" (`apps/mobile`) como parte del scope del rediseño (§3, estado actual mobile) con tokens `global.css`+`tailwind.config.js`+`lib/theme.ts`, motor `@eva/brand-kit` compartido, 82 componentes RN — es decir, el informe YA contemplaba portar el DS a mobile.
- **VERIFICADO CONTRA GIT/CÓDIGO (esta pasada, 2026-07-08) — corrige la especulación anterior:** el rediseño en `apps/mobile` **SÍ se ejecutó**, y va bastante más allá del plan original de este informe. `git log --oneline --grep="feat(redesign)"` en `master` (todos ancestros de HEAD de este worktree) muestra **52 commits** de rediseño, empezando por las Fases 0-9 explícitamente "web + mobile" (`a6ddfd83` Fase 0 fundación de tokens, `4b97f0bf` Fase 1 librería de 13 componentes, `b864a7a5` Fase 2 shell+nav, `67bc9bb5` Fase 3 dashboards, `1604ec69` Fase 4 alumnos+ficha, `2018d19b` Fase 5 programas+builder, `7c7ad951` Fase 6 nutrición, `1a85e0d2` Fase 7 módulos [solo web], `eb2e46db` Fase 8 opciones+sub+teams, `411a5e4b` Fase 9 auth+estados+rutina) y siguiendo con **~28 commits adicionales de pulido específico** posteriores a la Fase 9: olas de paridad desktop web (`Ola 1-7`), y — lo relevante para RN — waves mobile-específicas como `298f0ea9` "mobile dashboard + alumnos polish (1:1)", `afa68647` "alumnos ficha 1:1 + tabbar press feedback", `d6c0f365` "ficha del alumno 1:1 con el CD nuevo (chrome + 5 pestañas)", `3e87f9ad` "mini-rework UI/UX ejecución de rutina del alumno (estilo CD)", `cd954ff4` "re-skin workout-exec (web+mobile)", `bac65ece`/`e6545256` "backlog CEO" y `928ee1a4` "version ALUMNO — cápsula flotante, dashboard 1:1, pantalla Perfil nueva, nutrición, polish transversal". `apps/mobile/tailwind.config.js` tiene la rampa completa `ink-50…950`/`sport-100…700`/`ember-*`/`aqua-*` + alias semánticos; `app/_layout.tsx` carga Archivo/Hanken Grotesk/JetBrains Mono.
- **Matiz importante (fuente: `06-mobile-inventory.md` de esta misma investigación, no inventar más allá):** el re-skin mobile está **a medias, no completo** — conviven dos patrones de estilado: **Patrón A** (EVA DS nuevo, clases NativeWind + primitivas `Button`/`Card`/`Badge`) ya aplicado en pantallas como `alumno/home`, `alumno/perfil`, `coach/ejercicios`, todo `(auth)`, dashboard coach; y **Patrón B** (legacy, objeto `theme` de `lib/theme.ts` + `StyleSheet.create` + fuentes `Inter_*`/`Montserrat_*` literales) todavía vigente en la mayoría de pantallas coach (`builder`, `clientes`, `nutricion`, `settings`, `subscription`, `support`, `program-builder`, `nutrition-builder`, `foods`, `cliente/[clientId]`) y varias de alumno (`workout/[planId]`, `check-in`, `exercises`, `history`, `workout`). Incluso pantallas "modernas" mezclan ambos patrones (p.ej. `alumno/home.tsx` usa clases DS para tipografía pero sigue leyendo `theme.primary`/`theme.cyan` para color dinámico). **Conclusión operativa: el plan de paridad NO parte de cero para el re-skin visual mobile — parte de un estado heterogéneo que hay que terminar de unificar (matar/reducir el objeto `theme` legacy, migrar el resto de pantallas al Patrón A), no de instalar el DS desde cero.** Ver `06-mobile-inventory.md` §0 para el detalle pantalla-por-pantalla.
- Decisiones D0-D4 pendientes de resolver en el doc original (proyecto canónico, estrategia de fase horizontal/vertical, reconciliación white-label ramp vs `@eva/brand-kit` OKLCH, adopción de 3 tipografías, specs SDD) — **probablemente ya resueltas dado que el rediseño está LIVE en web**; el plan de paridad RN debería heredar esas mismas decisiones (D2 recomendada: extender `@eva/brand-kit` para emitir la ramp completa desde el color del coach — coherente con "packages compartidos web+mobile").

**No hay nada obsoleto en este doc en sí** — es el propio blueprint del DS actual. Lo que puede estar desactualizado es su §2-3 "estado actual" (foto de antes de implementar), no la especificación del DS.

---

## 11. `apps/mobile/CODEX_HANDOFF.md` (handoff continuo, entradas 2026-06-02 → 2026-06-04, rama `v2/enterprise`)

**Contexto:** bitácora técnica cronológica del trabajo de re-skin/paridad mobile hecho por Codex/Claude, con reglas operativas y estado "HECHO"/"PENDIENTE" detallado por feature.

**Sigue vigente como registro histórico de qué se construyó** (builder 1:1 web con reducer verbatim, nutrición templates reales, foods CRUD, deep links W5, fixes de loaders/db-compat, listado de alumnos con cards+stack animation) — útil para saber qué NO hay que reconstruir desde cero.

**Reglas operativas que siguen aplicando (transversales, no ligadas al rediseño):**
- "Solo `apps/mobile`" salvo excepción `.well-known` para deep links — NO tocar master/prod NI `apps/web` salvo esa excepción.
- Sin cambios de BD — todas las tablas ya existen, mutations bajo sesión coach (RLS), service-role NUNCA en RN.
- Validar cada cambio con `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android`.
- El usuario hace los commits, NO commitear salvo que se pida.
- Convención de pantallas: tabs coach usan `SafeAreaView edges={[]}` (header propio ya paga el inset), tabs alumno usan default (sin header global), pantallas pusheadas usan `edges={['top']}`.

**Obsoleto / probablemente reemplazado por el rediseño DS (2026-07-04):**
- Todo el trabajo de "AppBackground" (blobs Skia + grid), "GlassCard" con `cornerGlow`, glass cards con `expo-blur`+velo — es el **lenguaje visual VIEJO pre-EVA DS**. El nuevo DS especifica un lenguaje distinto (paper claro por defecto, hero superficies ink-950 oscuras, radios iOS, sin mención de blobs/grid ambiental) — el plan de paridad probablemente reemplaza esta capa completa, no la extiende.
- "Splash rework" (`EvaSplash.tsx` con wordmark multicolor) — confirmar si sigue vigente o si el rediseño define un splash distinto; de cualquier forma splash = EVA-only (excepción intencional, no cambia).
- Rama de trabajo es `v2/enterprise` — **contradice** la decisión posterior "enterprise diferido" de los audits de 2026-06-06 (mismo día/días después). El propio handoff dice "El coach enterprise también loguea acá (guardas de org)" pero los audits posteriores dicen "Enterprise B2B 🔴 No-Go" en mobile. Tomar la decisión MÁS RECIENTE (audits 2026-06-06 + roadmap: enterprise diferido) como vigente sobre este handoff más viejo.
- Limitación confirmada y vigente: "Ícono de app instalada = EVA (no por-coach)" — coincide con la excepción intencional del brief actual.

**Pendientes explícitos no confirmados como resueltos en ningún otro doc:**
- Nutrición ciclos (`nutrition_plan_cycles`) — power-web, pendiente.
- Deep links routing interno completo (`app/+native-intent.ts` mapee `/c/<slug>`).
- Android assetlinks SHA256 real (placeholder).
- Store prep (iconos, perfiles EAS, TestFlight/Play).

---

## Decisiones vinculantes consolidadas

Estas decisiones aparecen repetidas y consistentes across múltiples docs (nunca contradichas por un doc más reciente, salvo donde se anota) — el plan de paridad RN 1:1 DEBE respetarlas:

1. **Checkout/pagos/cambio de tarjeta = web-only.** MercadoPago (y ahora Flow, según la rama actual del repo) NO son nativos en mobile por money-safety + políticas IAP de las stores. Mobile solo hace link-out/view. Confirmado en 3 docs independientes (rn-web-parity-2026-06-21, rn-mobile-vs-web-parity §7, CODEX_HANDOFF §"Onboarding coach").
2. **Ícono de app + splash = EVA-only**, un solo binario compartido, no white-label por coach. El resto del white-label (color/loader/logo en-app) sí debe funcionar en mobile. Confirmado en 4 docs.
3. **Enterprise mobile = diferido/No-Go**, standalone primero. La decisión más reciente (audits 2026-06-06 + roadmap) prevalece sobre el handoff más viejo (`v2/enterprise` branch) que sugería trabajo enterprise en curso. El `AuthProvider` de los cimientos debe diseñarse para no requerir reescritura después, pero no construir enterprise ahora.
4. **Alumno primero** (decisión explícita del roadmap y del brief del usuario) — coincide con la secuencia ya elegida para este proyecto.
5. **Regla `<760px` = la app.** El responsive web en viewport móvil DEBE quedar visualmente idéntico a la app RN (regla del informe de rediseño DS). Implicación operativa fuerte: auditar la web en viewport <760px es la fuente de verdad visual más directa y confiable para el plan de paridad RN — más que inferir de capturas de mobile viejo.
6. **NUNCA tocar Supabase live** en trabajo autónomo mobile (sin aprobación explícita); mutaciones bajo sesión del coach/alumno con RLS, jamás service-role desde RN.
7. **`@eva/brand-kit` es el motor de white-label único**, compartido web+mobile (OKLCH, clamp WCAG AA) — cualquier reconciliación del DS nuevo (ramp `--sport-100…700`) debe extender este motor, no reemplazarlo (decisión D2 recomendada del informe de rediseño).
8. **`pnpm` exclusivo**, deps con postinstall declaradas en `pnpm-workspace.yaml#allowBuilds`.
9. **El usuario hace commits/builds** — el trabajo de agentes queda en el working tree sin commitear salvo pedido explícito.

---

## Ideas aprovechables de docs viejos (para después de la paridad 1:1)

Material de investigación válido y no ligado al rediseño visual, útil como backlog post-paridad ("superar a la web" con ventajas nativas):

- **`mobile-native-advantages.md`**: catálogo completo v1/v2/later de features imposibles en PWA — push local + recordatorios sin backend, HealthKit/Health Connect (peso+pasos v1, sesiones/FC/sueño v2), rest timer que sobrevive lock screen (v1 notificación local, v2 Live Activity Dynamic Island), scan de código de barras (Open Food Facts) para nutrición fuera de plan, Face ID quick-unlock, widgets home/lock (requiere subir a SDK 56). Todas con librería específica y gotchas de SDK 54 documentados — listo para retomar cuando el proyecto entre en "Ola 2/3" post-paridad.
- **`mobile-ux-design-language.md`**: sistema de motion completo y reusable independiente de la paleta (tokens `DURATION`/`EASING`/`SPRING`, regla transform+opacity-only, mapa de "3 momentos emocionales" a animar — registrar/progresar/celebrar, celebraciones offline-first, tech por efecto Skia/Moti/Reanimated/expo-haptics). Esto complementa al DS nuevo (que no especifica motion en detalle) y debería adoptarse tal cual dentro de `@eva/brand-kit/motion.ts`.
- **`mobile-shared-foundation.md`**: especificación arquitectónica de cimientos (AuthProvider único, capa `infrastructure/` sin `supabase.from` en componentes, hook `{loading|error|empty|data}` + `ErrorState` con retry, offline core con `client_log_id` idempotente) — sigue siendo el orden de trabajo correcto independientemente del re-skin visual; construir esto ANTES o EN PARALELO al re-skin evita heredar los mismos bugs de datos en las pantallas nuevas.
- **`coach-mobile-readiness-review.md`**: aunque es de "readiness de lanzamiento" (fuera del alcance de paridad 1:1), su lista de P0 técnicos (ErrorBoundary/Sentry, build env reproducible, biometría a tabla correcta) es un buen checklist de "no vender esto todavía" para cuando el proyecto llegue a fase de lanzamiento real — separado del trabajo de paridad visual/funcional.
- **Reducer plan-builder verbatim 1:1** (`lib/plan-builder/reducer.ts` en mobile = copia literal del hook web) es el patrón de anti-drift más exitoso documentado — replicar esta técnica (copiar lógica pura verbatim en vez de reimplementar) para cualquier motor nuevo que el plan de paridad necesite portar.
