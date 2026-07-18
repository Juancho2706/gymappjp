# 10 — Inventario consolidado de tareas (gaps G01–G11)

> Consolidación mecánica de las secciones "Tareas propuestas" de los 11 informes de gap
> (`research/gaps/G01..G11`). Fiel a los originales: sin tareas inventadas, sin re-estimación de
> esfuerzo. IDs = ID original del gap prefijado por dominio (ej. `G03-B2`).
>
> Convención de esfuerzo (de los propios informes): **S = 1-2d, M = 3-5d, L = 1-2sem, XL = 3+sem.**
> Para el cálculo de días se usa el promedio de rango pedido: **S=1.5, M=4, L=7.5, XL=15.**
>
> **Total: 181 tareas.**

---

## 1. Tabla maestra

| ID | Dominio | Tarea (1 línea) | Tipo | Esf. | Dependencias | Fuente |
|---|---|---|---|---|---|---|
| G01-F0.1 | Fundaciones DS | Reconciliar los 3 mismatches de token dark + duraciones de motion | [SEAM][VISUAL] | S | ninguna | G01 |
| G01-F0.2 | Fundaciones DS | Definir y documentar la frontera de theming (className vs objeto `theme`) | [FUNCIONAL] | S | ninguna | G01 |
| G01-F0.3 | Fundaciones DS | Tokens formales de tipografía: escala + roles como helper RN | [VISUAL] | M | G01-F0.1 | G01 |
| G01-F0.4 | Fundaciones DS | Escala de sombras/elevación centralizada + glow-ember + retune dark | [VISUAL] | S | G01-F0.2 | G01 |
| G01-F0.5 | Fundaciones DS | Declarar paleta `--viz-1..6` en global.css + tailwind.config.js | [VISUAL][SEAM] | S | G01-F0.1 | G01 |
| G01-F0.6 | Fundaciones DS | Toast/Sonner provider + `useToast` | [FUNCIONAL] | M | G01-F0.3, G01-F0.4 | G01 |
| G01-F0.7 | Fundaciones DS | Switch DS + Select/Picker DS | [FUNCIONAL] | M | G01-F0.3 | G01 |
| G01-F0.8 | Fundaciones DS | Subcomponentes de Card (Header/Content/Footer/Title/Description/Action) | [VISUAL] | S | G01-F0.3, G01-F0.4 | G01 |
| G01-F0.9 | Fundaciones DS | Unificar Sheet/Dialog + quitar Montserrat del título | [FUNCIONAL] | M | G01-F0.3 | G01 |
| G01-F0.10 | Fundaciones DS | Dark mode: restaurar modo "system" + `ThemeToggle` DS reutilizable | [FUNCIONAL] | S | G01-F0.2 | G01 |
| G01-F1.1 | Fundaciones DS | DropdownMenu / Popover / ActionSheet | [FUNCIONAL] | M | G01-F0.9 | G01 |
| G01-F1.2 | Fundaciones DS | Textarea + Form wrapper (rhf+zod) | [FUNCIONAL] | M | G01-F0.7 | G01 |
| G01-F1.3 | Fundaciones DS | Registro de nav declarativo (matar hardcode de los 2 chrome) | [SEAM][FUNCIONAL] | M | G01-F0.3 | G01 |
| G01-F1.4 | Fundaciones DS | GlassButton + unificar GlassCard con variantes web | [VISUAL] | S | G01-F0.4 | G01 |
| G01-F1.5 | Fundaciones DS | AmbientBrandGlow / GlowBorderCard RN (Skia/gradiente) | [VISUAL] | M | G01-F0.4, G01-F0.5 | G01 |
| G01-F1.6 | Fundaciones DS | Command palette / búsqueda global RN | [FUNCIONAL] | M | G01-F0.7 | G01 |
| G01-F1.7 | Fundaciones DS | InfoTooltip/MetricInfo touch (popover on tap) | [VISUAL] | S | G01-F1.1 | G01 |
| G01-F1.8 | Fundaciones DS | Tokens de spacing 4px como escala formal | [VISUAL] | S | G01-F0.1 | G01 |
| G01-D.1 | Fundaciones DS | Purga de Inter/Montserrat (incremental, 408 usos/69 archivos) | [VISUAL] | L | G01-F0.3 | G01 |
| G02-A1 | Alumno auth/chrome | Cápsula flotante del nav alumno (reescribir AlumnoMobileChrome) | [VISUAL] | S | primitivas DS existentes | G02 |
| G02-A2 | Alumno auth/chrome | Hide-on-scroll del nav (minimizar >80px) | [VISUAL] | S | G02-A1 | G02 |
| G02-A3 | Alumno auth/chrome | Sheet "Más" rico (fila perfil + Historial + Cerrar sesión) | [VISUAL] | S | G02-A1, BottomSheet | G02 |
| G02-A4 | Alumno auth/chrome | Login branded (visual): hero de marca + botón "Entrar a {brand}" + theming | [VISUAL] | M | G02-B1 | G02 |
| G02-A5 | Alumno auth/chrome | Onboarding wizard 3 pasos (barra segmentada + AnimatePresence) | [VISUAL] | S | ninguna (cruza G02-B3) | G02 |
| G02-A6 | Alumno auth/chrome | Suspended/change-pwd/forgot/reset pulido DS + fix typo "contraseña" + TopBar sin Montserrat | [VISUAL] | S | ninguna | G02 |
| G02-B1 | Alumno auth/chrome | Ampliar `branding.ts` (welcome_message, tier, layout, colores...) + GRANT anon | [SEAM] | S | revisar grants | G02 |
| G02-B2 | Alumno auth/chrome | Gate Pro+ del branding del login (`isBrandingAllowed`) | [FUNCIONAL] | S | G02-B1 | G02 |
| G02-B3 | Alumno auth/chrome | Onboarding: draft en storage + checkbox de términos/privacidad | [FUNCIONAL] | S | G02-A5 | G02 |
| G02-B4 | Alumno auth/chrome | Gate de nutrición en el nav (ocultar tab "Plan" si OFF) | [FUNCIONAL] | S | coordinar dominio entitlements | G02 |
| G02-B5 | Alumno auth/chrome | Suspended team-aware + CTA WhatsApp | [FUNCIONAL] | S | G02-B1 o extensión perfil | G02 |
| G02-B6 | Alumno auth/chrome | Login: validación de workspace/coach (email pertenece al coach) | [FUNCIONAL] | S | ninguna | G02 |
| G02-B7 | Alumno auth/chrome | Limpieza autoritativa de `force_password_change` (endpoint service-role) | [FUNCIONAL] | S | backend | G02 |
| G02-B8 | Alumno auth/chrome | iOS universal links (`associatedDomains` + AASA) | [FUNCIONAL] | S | config + .well-known | G02 |
| G03-A1 | Alumno workout | Migrar ejecución (planId/RestTimer/SummaryModal) de hex/fuentes literales a tokens DS | [VISUAL] | S | consolidación theming (G01) | G03 |
| G03-A2 | Alumno workout | Re-skin BlockCard → forma de SingleExerciseCard (dots, chip sobrecarga, cue técnica) | [VISUAL] | M | G03-A1 | G03 |
| G03-A3 | Alumno workout | Header de ejecución: línea "Ejercicio X de Y · volumen · tiempo" + barra DS | [VISUAL] | S | G03-A1 | G03 |
| G03-A4 | Alumno workout | Actualizar cápsula flotante AlumnoMobileChrome a 1:1 web (transversal chrome/DS) | [VISUAL] | M | transversal chrome/DS | G03 |
| G03-A5 | Alumno workout | Home: refrescar StreakRibbon + Hero (ProgressRing) + Momentum | [VISUAL] | S | primitivas DS | G03 |
| G03-B0 | Alumno workout | Extraer `packages/@eva/workout-engine` (lógica pura de ejecución) + shim web | [SEAM] | L | ninguna (bloquea B1–B8) | G03 |
| G03-B1 | Alumno workout | Keypad numérico custom RN + flujo peso→reps→(RPE/RIR) | [FUNCIONAL] | M | G03-B0 | G03 |
| G03-B2 | Alumno workout | EffortScale/ScaleDots RN + chips de incremento de peso | [FUNCIONAL] | M | G03-B1 | G03 |
| G03-B3 | Alumno workout | Resiliencia sesión (draft/snapshot + recuperación + cap 4h + duración) | [FUNCIONAL] | L | G03-B0 | G03 |
| G03-B4 | Alumno workout | Modo Paso a paso (StepperExecution RN + toggle Lista/Pasos) | [FUNCIONAL] | L | G03-B0, G03-A3 | G03 |
| G03-B5 | Alumno workout | Sustitución de ejercicio (SubstituteExerciseSheet + columnas log) | [FUNCIONAL] | M | G03-B0 | G03 |
| G03-B6 | Alumno workout | Timers polimórficos (Hold/Interval/Stopwatch + Provider + Settings + RestTimer protagonista) | [FUNCIONAL] | L | G03-B0 | G03 |
| G03-B7 | Alumno workout | Ejecución polimórfica cardio/mobility/roller (query tipada + TypedTargetGrid) | [FUNCIONAL] | XL | G03-B0, G03-B6 | G03 |
| G03-B8 | Alumno workout | HR zones (cardio): cablear entitlement + domain/cardio + endpoint + zonas FC | [FUNCIONAL] | L | gate módulos (transversal), G03-B7 | G03 |
| G03-B9 | Alumno workout | WorkoutSummary a paridad (PR guard, mapa muscular SVG, conteo polimórfico, next hint) | [FUNCIONAL] | M | G03-B0, G03-B5, G03-B7 | G03 |
| G03-B10 | Alumno workout | Share-cards v2 branded (PR/progreso/racha/resumen) canvas nativo | [FUNCIONAL] | M | G03-B9 | G03 |
| G03-B11 | Alumno workout | Superseries robustas end-to-end consumiendo `workout-block-grouping` compartido | [FUNCIONAL] | S | G03-B0 | G03 |
| G03-B12 | Alumno workout | Áreas custom en ejecución (`workout-areas` + fetch) | [FUNCIONAL] | S | G03-B0 | G03 |
| G03-B13 | Alumno workout | Técnica video INLINE en modal (webview YouTube / expo-av mp4) | [FUNCIONAL] | S | G03-A2 | G03 |
| G03-B14 | Alumno workout | "Última vez" tap-to-autofill + "Supera tu marca" inline | [FUNCIONAL] | S | G03-A2 | G03 |
| G03-C1 | Alumno workout | Días pendientes de la semana en home (CTA "Recuperar Día X") | [FUNCIONAL] | M | — | G03 |
| G03-C2 | Alumno workout | WeightQuickLog + TrendArrow en WeightWidget | [FUNCIONAL] | S | — | G03 |
| G03-C3 | Alumno workout | PRDetailSheet (progresión del lift on-demand) | [FUNCIONAL] | S | — | G03 |
| G03-C4 | Alumno workout | ProgramPhaseBar + estados de plan (today/completed/pending/upcoming) | [FUNCIONAL] | S | — | G03 |
| G04-A1 | Alumno nutrición | Header nutrición: título/subtítulo + glow de marca; purgar `theme.*` del shell | [VISUAL] | S | ninguna | G04 |
| G04-A2 | Alumno nutrición | Purgar Montserrat legacy + hex fijos en nutricion.tsx → tokens/fuentes DS | [VISUAL] | S | G04-A1 | G04 |
| G04-A3 | Alumno nutrición | Re-skin MealCardExpandable a fidelidad MealCard (círculo 44px, tokens) | [VISUAL] | M | G04-A2 | G04 |
| G04-A4 | Alumno nutrición | DayNavigator (swipe/dots) + banners DS + banner "comidas filtradas" | [VISUAL] | S | G04-A1 | G04 |
| G04-A5 | Alumno nutrición | Verificar/re-skin MacroRingSummary + AdherenceStrip + NutritionStreakBanner | [VISUAL] | S | G04-A2 | G04 |
| G04-B1 | Alumno nutrición | Adoptar `@eva/nutrition-engine` (path tsconfig + borrar nutrition-utils) | [SEAM] | S | ninguna | G04 |
| G04-B2 | Alumno nutrición | Reemplazar loop de racha/adherencia por `computeNutritionAdherence` | [SEAM] | S | G04-B1 | G04 |
| G04-B3 | Alumno nutrición | Adoptar feature-prefs + module-catalog + `/api/mobile/config` (gating secciones/nav) | [SEAM] | M | endpoints ya existen | G04 |
| G04-B4 | Alumno nutrición | Módulo exchanges/equivalencias (Nutrición Pro por-alumno) | [FUNCIONAL] | L | G04-B1, G04-B3, module-catalog | G04 |
| G04-B5 | Alumno nutrición | Swaps de alimento interactivos + favoritos (recálculo macros) | [FUNCIONAL] | M | G04-B1, G04-A3 | G04 |
| G04-B6 | Alumno nutrición | Panel de micros (base + avanzados Pro) con topes del coach | [FUNCIONAL] | M | G04-B1, G04-B3, API micros | G04 |
| G04-B7 | Alumno nutrición | Plato visual (PlatePanel/proporción) | [FUNCIONAL] | S | G04-B1 | G04 |
| G04-B8 | Alumno nutrición | Off-plan logger (quick-add + recientes, día de hoy) | [FUNCIONAL] | M | API intake | G04 |
| G04-B9 | Alumno nutrición | Notas coach ⇄ alumno (NotesThread) | [FUNCIONAL] | M | API notas | G04 |
| G04-B10 | Alumno nutrición | Lista de compras (por pasillo, marcar, agregar, compartir) | [FUNCIONAL] | M | API shopping | G04 |
| G04-B11 | Alumno nutrición | Weekly recap card | [FUNCIONAL] | S | recap engine/endpoint | G04 |
| G04-B12 | Alumno nutrición | Recetas-idea asignadas | [FUNCIONAL] | S | query recetas | G04 |
| G04-B13 | Alumno nutrición | Export día: PDF branded (expo-print) + Copiar detalle/WhatsApp con macros | [FUNCIONAL] | M | G04-B1 | G04 |
| G04-B14 | Alumno nutrición | Pulido: porción "Plan completo", confetti día-completo, PushBanner, medidas caseras, HabitsTracker | [FUNCIONAL] | S | G04-A3, G04-B1 | G04 |
| G05-T1 | Alumno checkin/perfil | Fundación de toast DS en RN (provider + `useToast`) | [VISUAL] | S | ninguna | G05 |
| G05-T2 | Alumno checkin/perfil | Re-skin Check-in a EVA DS (Card/Button/Input + disclaimer + stepper + wave/confetti) | [VISUAL] | M | G05-T1, primitiva SuccessWave | G05 |
| G05-T3 | Alumno checkin/perfil | Re-skin Historial a Card/ListRow DS + reveal opcional | [VISUAL] | S | ninguna | G05 |
| G05-T4 | Alumno checkin/perfil | Completar Perfil (stats grid, fila Historial, card baja de cuenta) | [VISUAL] | S | datos streak/totalWorkouts | G05 |
| G05-T5 | Alumno checkin/perfil | Re-skin Ejercicios a DS + FeaturedExerciseCard | [VISUAL] | M | ninguna | G05 |
| G05-T6 | Alumno checkin/perfil | Check-in: prefill peso/energía + limpiar badge nativo | [FUNCIONAL] | S | G05-T2 | G05 |
| G05-T7 | Alumno checkin/perfil | Perfil: preferencia "Alarma de descanso" (AsyncStorage + preview) | [FUNCIONAL] | M | G05-T4 | G05 |
| G05-T8 | Alumno checkin/perfil | Adoptar `@eva/feature-prefs` + fetch enabled_modules + helper getStudentModuleNav | [SEAM] | M | confirmar RLS/gate server-side | G05 |
| G05-T9 | Alumno checkin/perfil | Perfil: filas read-only "Movimiento"/"Composición" gated | [FUNCIONAL] | M | G05-T8 | G05 |
| G05-T10 | Alumno checkin/perfil | Vista Movimiento read-only del alumno (reporte + evolución + disclaimer) | [SEAM+FUNCIONAL] | L | G05-T8 | G05 |
| G05-T11 | Alumno checkin/perfil | Vista Composición corporal read-only (BIA/ISAK + trend + disclaimer) | [SEAM+FUNCIONAL] | L | G05-T8 | G05 |
| G05-T12 | Alumno checkin/perfil | Ejercicios: paginación server + instrucciones on-demand + video + deep-link | [FUNCIONAL] | L | G05-T5 | G05 |
| G05-T13 | Alumno checkin/perfil | Share-cards v2 desde perfil (Progreso/Racha/Resumen mensual branded) | [FUNCIONAL] | L | G05-T4 + datos | G05 |
| G06-A1 | Coach dash/clientes/ficha | Re-skin home.tsx error/loading states (quitar Montserrat → tokens DS) | [VISUAL] | S | ninguna | G06 |
| G06-A2 | Coach dash/clientes/ficha | Corregir header dashboard (Insights sheet, campana badge, brand tile + switcher) | [VISUAL] | M | independiente (solapa B-func) | G06 |
| G06-A3 | Coach dash/clientes/ficha | Re-skin completo de clientes.tsx (directorio) patrón B → A | [VISUAL] | L | primitivas DS | G06 |
| G06-A4 | Coach dash/clientes/ficha | Re-skin shell de ficha [clientId] + ClientHero (tokens + glow) | [VISUAL] | M | primitiva glow (diferible) | G06 |
| G06-A5 | Coach dash/clientes/ficha | ClientHero: alinear a 4 chips fijos 2×2 con mini-barra en Adherencia | [VISUAL] | S | G06-A4 | G06 |
| G06-A6 | Coach dash/clientes/ficha | Auditar y re-skinear los 6 tab-panels de ficha a DS | [VISUAL] | M | G06-A4 | G06 |
| G06-A7 | Coach dash/clientes/ficha | Decisión chrome de tabs (5 web+nombres vs mantener 6 mobile) | [VISUAL] | S | G06-A4 + decisión producto | G06 |
| G06-B1 | Coach dash/clientes/ficha | Extraer `profile-analytics` a paquete compartido (web+mobile importan) | [SEAM] | M | leer 3 archivos web fuente | G06 |
| G06-B2 | Coach dash/clientes/ficha | Cablear entitlements en mobile (feature-prefs + module-catalog + gate) | [SEAM] | L | ninguna (packages existen) | G06 |
| G06-B3 | Coach dash/clientes/ficha | Sección Módulos en Resumen de ficha (cardio/movement/bodycomp gated) | [FUNCIONAL] | L | G06-B2 + pantallas de módulo | G06 |
| G06-B4 | Coach dash/clientes/ficha | Pestaña Progreso con composición corporal (mover domain/bodycomp) | [FUNCIONAL] | L | G06-B2, C.7 | G06 |
| G06-B5 | Coach dash/clientes/ficha | Editores ficha: biometría (altura/sexo/peso inicial) + goal weight con línea objetivo | [FUNCIONAL] | M | G06-A6; verificar GRANTs | G06 |
| G06-B6 | Coach dash/clientes/ficha | Export dossier PDF (portar buildClientDossier) o formalizar progress-pdf | [FUNCIONAL] | M | G06-A6 | G06 |
| G06-B7 | Coach dash/clientes/ficha | Import wizard de clientes multi-paso (mapeo columnas + preview + confirm) | [FUNCIONAL] | M | G06-A3 | G06 |
| G06-B8 | Coach dash/clientes/ficha | Dashboard: WorkspaceSwitchSheet + NewsBell con badge + búsqueda global | [FUNCIONAL] | M | G06-A2 | G06 |
| G06-B9 | Coach dash/clientes/ficha | Extraer/compartir `deriveClientStatus` + `getProfileTopAlert` | [SEAM] | S | G06-B1 | G06 |
| G06-B10 | Coach dash/clientes/ficha | Verificar/alinear forma MobileDashboardData vs DashboardV2Data | [FUNCIONAL] | S | ninguna | G06 |
| G07-A1 | Coach builder/ejercicios | Re-skin ejercicios.tsx a paridad fina EVA DS + toggle "Con video" | [VISUAL] | S | ninguna | G07 |
| G07-A2 | Coach builder/ejercicios | Re-skin ExerciseFormSheet + ExercisePreviewSheet a patrón A | [VISUAL] | M | G07-A1 | G07 |
| G07-A3 | Coach builder/ejercicios | Re-skin program-builder.tsx (manteniendo modelo legacy) patrón B → A | [VISUAL] | L | ninguna | G07 |
| G07-A4 | Coach builder/ejercicios | Re-skin BuilderBlockCard + BlockEditorSheet (fuerza) + SeriesStepper 44px | [VISUAL] | M | G07-A3 | G07 |
| G07-A5 | Coach builder/ejercicios | Re-skin sheets de programa (Config/Phases/Preview/Template/MuscleBalance/Assign/Onboarding) | [VISUAL] | M | G07-A3 | G07 |
| G07-A6 | Coach builder/ejercicios | Re-skin builder.tsx (lista de programas) a EVA DS | [VISUAL] | M | ninguna | G07 |
| G07-B1 | Coach builder/ejercicios | Extraer `builderReducer` puro + workout-areas + workout-block-grouping + tipos a `@eva/plan-builder` | [SEAM] | L | ninguna (bloquea B2/C) | G07 |
| G07-B2 | Coach builder/ejercicios | Mobile adopta `@eva/plan-builder` (borra fork reducer/types) | [SEAM] | M | G07-B1 | G07 |
| G07-C1 | Coach builder/ejercicios | Cargar `areas: WorkoutArea[]` en el builder mobile | [FUNCIONAL] | M | G07-B2 | G07 |
| G07-C2 | Coach builder/ejercicios | Reemplazar agrupación 3 secciones por ÁREAS (AreaDropZone + buildAreaVMs) | [FUNCIONAL] | L | G07-C1 | G07 |
| G07-C3 | Coach builder/ejercicios | Reconstruir BlockEditorSheet como editor polimórfico (strength/cardio/mobility/roller) | [FUNCIONAL] | L | G07-B2 + gating cardio (externo) | G07 |
| G07-C4 | Coach builder/ejercicios | Chip resumen typed en BuilderBlockCard (typedBlockSummary + icono + "Incompleto") | [FUNCIONAL] | M | G07-C3 | G07 |
| G07-C5 | Coach builder/ejercicios | Validación de guardado por TIPO + serialización effectiveAreaKey + conflicto expectedUpdatedAt | [FUNCIONAL] | M | G07-C3 | G07 |
| G07-D1 | Coach builder/ejercicios | Añadir `exercise_type` (EXERCISE_TYPE_OPTIONS) al ExerciseFormSheet | [FUNCIONAL] | S | G07-B1 (tipos) | G07 |
| G07-D2 | Coach builder/ejercicios | Recorte de video (start/end) + reproducción INLINE con recorte | [FUNCIONAL] | M | G07-A2 | G07 |
| G07-D3 | Coach builder/ejercicios | Alinear gate de creación con regla workspace (no por tier) | [FUNCIONAL] | S | dominio entitlements | G07 |
| G07-D4 | Coach builder/ejercicios | Cablear historial del ejercicio en el editor de bloque | [FUNCIONAL] | S | G07-C3 o G07-A4 | G07 |
| G08-A1 | Coach nutrición/checkins | Re-skin hub de Nutrición a primitivas DS (tabs+conteos, cards ricas, board sync/custom, buscador+filtros) | [VISUAL] | M | primitivas overlay (Toast/Select) | G08 |
| G08-A2 | Coach nutrición/checkins | Re-skin builder nutrición (TopBar, Cards, banner DS, purgar colores hardcodeados) | [VISUAL] | M | (no indicada) | G08 |
| G08-A3 | Coach nutrición/checkins | Re-skin check-ins (Card DS, quitar Montserrat, estrellas energía, fecha relativa, visor foto) | [VISUAL] | S | (no indicada) | G08 |
| G08-A4 | Coach nutrición/checkins | Re-skin foods.tsx o fusionarlo como tab embebido del hub (FoodLibrary) | [VISUAL] | S | decisión de arquitectura | G08 |
| G08-B1 | Coach nutrición/checkins | Adoptar `@eva/nutrition-engine` (borrar macro-calculator + re-export nutrition-utils) | [SEAM] | S | revisar consumidores | G08 |
| G08-B2 | Coach nutrición/checkins | Extraer/compartir `reconcileMeals` + cablear en saveClientPlan/propagateTemplate (cascade-safety) | [SEAM/FUNCIONAL] | M | G08-B1 opcional | G08 |
| G08-B3 | Coach nutrición/checkins | Check-ins: firmar/mostrar side_photo_url + "Marcar como revisado" (toggle + badge/filtro) | [FUNCIONAL] | S | (puede ir con G08-A3) | G08 |
| G08-B4 | Coach nutrición/checkins | Builder: surface de alérgenos/intolerancias/disgustos en FoodSearchSheet | [FUNCIONAL] | S | (no indicada) | G08 |
| G08-C1 | Coach nutrición/checkins | Gating de módulos en mobile (module-catalog + mirror entitlements + gate endpoints) | [FUNCIONAL/SEAM] | M | (bloqueante de C2) | G08 |
| G08-C2 | Coach nutrición/checkins | Modo intercambios (nutrition_exchanges) en el builder mobile + PDF equivalencias | [FUNCIONAL] | L | G08-C1, esquemas | G08 |
| G08-C3 | Coach nutrición/checkins | Pantalla Grupos de comidas + acción "guardar comida como grupo" | [FUNCIONAL] | M | (no indicada) | G08 |
| G08-C4 | Coach nutrición/checkins | Tab/pantalla Recetas (RecipeLibrary, crear/asignar/editar) | [FUNCIONAL] | M | (no indicada) | G08 |
| G08-C5 | Coach nutrición/checkins | Feature-prefs de nutrición (ocultar/mostrar secciones por preferencia) | [FUNCIONAL] | S | (solapa dominio settings) | G08 |
| G08-C6 | Coach nutrición/checkins | Panel Pro "objetivos por composición corporal" (goals_bodycomp) | [FUNCIONAL] | S | G08-C1 | G08 |
| G08-C7 | Coach nutrición/checkins | Medidas caseras completas (household_grams/label) en custom-food-form + cálculo | [FUNCIONAL] | S | G08-B1 | G08 |
| G09-T1 | Coach opciones/sub/team | Re-skin Suscripción display (subscription.tsx patrón B → DS) | [VISUAL] | S | primitivas DS existentes | G09 |
| G09-T2 | Coach opciones/sub/team | Re-skin Mi Marca / brand studio (settings.tsx 554 L, patrón B → A) | [VISUAL] | M | Switch DS | G09 |
| G09-T3 | Coach opciones/sub/team | Hub de Opciones (nueva pantalla-índice + mover brand studio a ruta hija) context-aware | [FUNCIONAL] | M | G09-T7 (variantes) | G09 |
| G09-T4 | Coach opciones/sub/team | Suscripción display rico (consumir subscription-status: desglose, add-ons, tarjeta, historial) | [FUNCIONAL] | L | G09-T7, G09-T8 | G09 |
| G09-T7 | Coach opciones/sub/team | Contexto de workspace en mobile (getWorkspaceContext: standalone/team/enterprise) | [SEAM/FUNCIONAL] | M | ninguna dura | G09 |
| G09-T8 | Coach opciones/sub/team | Adoptar module-catalog + feature-prefs + fetch enabled_modules (paths tsconfig) | [SEAM] | S | ninguna | G09 |
| G09-T9 | Coach opciones/sub/team | Catálogo de Módulos (display, read-only + CTA por contexto) | [FUNCIONAL] | M | G09-T8, G09-T3 | G09 |
| G09-T10 | Coach opciones/sub/team | Funciones (feature-prefs): presets + master switch + toggles de sección con lock Pro | [FUNCIONAL] | M | G09-T8, G09-T3 | G09 |
| G09-T11 | Coach opciones/sub/team | Áreas del builder (CRUD) + scope team/standalone + lock no-gestor | [FUNCIONAL] | S | G09-T3, G09-T7 | G09 |
| G09-T12 | Coach opciones/sub/team | Mi Equipo/Team (hero + rol + stats + ShareLink + BrandStudio + MembersManager) | [FUNCIONAL] | L | G09-T7, G09-T8 | G09 |
| G09-T13 | Coach opciones/sub/team | Workspace switcher (bottom-sheet, null si ≤1) | [FUNCIONAL] | M | G09-T7 | G09 |
| G09-T14 | Coach opciones/sub/team | News bell global con unreadCount + bottom-sheet de feed | [FUNCIONAL] | M | ninguna dura | G09 |
| G09-T15 | Coach opciones/sub/team | Nav registry compartido (separar dato de coach-nav.ts + getVisibleNavItems en CoachMobileChrome) | [SEAM] | M | G09-T7, G09-T8 | G09 |
| G09-T16 | Coach opciones/sub/team | Mi Marca avanzada (logo oscuro, ThemeGallery, LoginLayoutPicker, BrandAdvanced, glow, loader) | [VISUAL/FUNCIONAL] | M | G09-T2, G09-T3 | G09 |
| G10-T1 | Módulos de pago | Extraer `domain/cardio/*` a `packages/@eva/cardio` | [SEAM] | S | — | G10 |
| G10-T2 | Módulos de pago | Extraer `domain/bodycomp/*` (12 archivos) a `packages/@eva/bodycomp` | [SEAM] | M | — | G10 |
| G10-T3 | Módulos de pago | Añadir paths tsconfig mobile + deps (calc, module-catalog, feature-prefs, nutrition-engine, cardio, bodycomp) | [SEAM] | S | G10-T1, G10-T2 | G10 |
| G10-T4 | Módulos de pago | Capa de entitlements mobile (leer enabled_modules + kill-switch + hasModuleClient) | [FUNCIONAL] | M | G10-T3 | G10 |
| G10-T5 | Módulos de pago | Cablear `/api/mobile/config` (kill-switch + prefs flag + support) + cache | [FUNCIONAL] | S | G10-T3 | G10 |
| G10-T6 | Módulos de pago | Borrar macro-calculator.ts + nutrition-utils.ts → `@eva/nutrition-engine` (corrige drift) | [SEAM] | S | G10-T3 | G10 |
| G10-T7 | Módulos de pago | Re-skin alumno/(tabs)/nutricion.tsx a patrón A puro | [VISUAL] | M | — | G10 |
| G10-T8 | Módulos de pago | Re-skin coach nutricion + nutrition-builder + foods a patrón A | [VISUAL] | M | — | G10 |
| G10-T9 | Módulos de pago | Componente RN `ModuleOffNotice` reutilizable | [VISUAL] | S | G10-T4 | G10 |
| G10-T10 | Módulos de pago | Cardio: hub (SegmentedTabs Zonas/Pace/Plantillas) + perfil del alumno + empty-state | [FUNCIONAL] | L | G10-T1, G10-T3, G10-T4, G10-T9 | G10 |
| G10-T11 | Módulos de pago | Movement assessment completo (hub + wizard 7 pasos + reporte + vista alumno) | [FUNCIONAL] | XL | G10-T3, G10-T4, G10-T9 | G10 |
| G10-T12 | Módulos de pago | Body composition (BIA/ISAK captura + IsakResultCard + trends + vista alumno) | [FUNCIONAL] | XL | G10-T2, G10-T3, G10-T4, G10-T9 | G10 |
| G10-T13 | Módulos de pago | Catálogo de Módulos en settings mobile (cards read-only + CTA + evento) | [FUNCIONAL] | M | G10-T3, G10-T4 | G10 |
| G10-T14 | Módulos de pago | Modelo Funciones vs Módulos (feature-prefs + panel presets + resolver visible) | [FUNCIONAL] | M | G10-T4 | G10 |
| G10-T15 | Módulos de pago | Nutrición Pro (exchanges) en el builder coach (gramos↔porciones + targets + PDF) | [FUNCIONAL] | L | G10-T8, G10-T14 | G10 |
| G10-T16 | Módulos de pago | Vista alumno de nutrición en porciones (si coach activó exchanges) | [FUNCIONAL] | M | G10-T7, G10-T15 | G10 |
| G11-A1 | Infra transversal | Adoptar packages `@eva/*` faltantes (paths + Metro) + reemplazar duplicados por re-export | [SEAM] | S | ninguna (bloquea posteriores) | G11 |
| G11-A2 | Infra transversal | Fix `assetlinks.json` SHA256 real (Android App Links) — P0 | [FUNCIONAL] | S | sin deps | G11 |
| G11-A3 | Infra transversal | `associatedDomains` iOS (applinks + webcredentials) + build — P0 | [FUNCIONAL] | S | sin deps | G11 |
| G11-A4 | Infra transversal | Cliente de entitlements mobile (config + enabled_modules + hook `useEntitlements`) | [FUNCIONAL] | M | G11-A1 | G11 |
| G11-A5 | Infra transversal | Telemetría de errores (Sentry RN + source maps EAS) — P1 | [FUNCIONAL] | M | sin deps duras | G11 |
| G11-B1 | Infra transversal | Google Sign-In coach nativo (signInWithIdToken + client IDs) — P1 | [FUNCIONAL] | M | build EAS nuevo | G11 |
| G11-B2 | Infra transversal | Badge numérico nativo (`setBadgeCountAsync`) — P2 | [FUNCIONAL] | S | sin deps | G11 |
| G11-B3 | Infra transversal | Token color canal Android + re-skin estados transversales (OfflineBanner/SyncStatusPill/BiometricLock/error) | [VISUAL] | S | (ola visual core) | G11 |
| G11-C1 | Infra transversal | Cola offline generalizada + idempotencia por `client_log_id` (portar reconcile puro) | [SEAM] | L | coordinar dominio ejecución | G11 |
| G11-C2 | Infra transversal | Verificar/agregar GRANTs de columna para features nuevas (por feature) | [FUNCIONAL] | S | cada feature que mute columnas | G11 |
| G11-C3 | Infra transversal | Cablear endpoints mobile sin usar (cardio/movement/bodycomp/exchanges/team) | [FUNCIONAL] | XL | G11-A4 | G11 |
| G11-D1 | Infra transversal | Hook de OTA en foreground (checkForUpdateAsync + prompt) — P3 | [FUNCIONAL] | S | sin deps | G11 |
| G11-D2 | Infra transversal | i18n exchanges (portar dict `es`, solo si se cablea exchanges) | [FUNCIONAL] | S | G11-C3-exchanges | G11 |

---

## 2. Duplicados y solapamientos

Tareas que aparecen en 2+ dominios (mismo trabajo reclamado desde distintos gap files). Coordinar
para no duplicar esfuerzo ni divergir.

### 2.1 Capa de entitlements / adopción de `@eva/feature-prefs` + `@eva/module-catalog` (el solape más grande — 8 dominios)
- **IDs que chocan:** `G02-B4`, `G03-B8` (gate cardio), `G04-B3`, `G05-T8`, `G06-B2`, `G07-D3`/`G07-C3` (gate cardio), `G08-C1`, `G09-T8`, `G10-T3`+`G10-T4`, `G11-A1`+`G11-A4`.
- **Qué proponen distinto:** `G10-T3/T4` y `G11-A1/A4` son la construcción base (paths tsconfig + hook `useEntitlements` + fetch enabled_modules + kill-switch por `/api/mobile/config`). `G09-T8`, `G06-B2`, `G05-T8`, `G04-B3`, `G08-C1` re-piden la MISMA adopción cada uno para su superficie. `G02-B4`, `G03-B8`, `G07-C3/D3` la consumen para gatear una feature concreta (nav nutrición, HR zones, editor cardio, gate de creación de ejercicios). Debe hacerse UNA vez (G10/G11) y el resto consumir.

### 2.2 Extracción `domain/cardio` → `@eva/cardio`
- **IDs:** `G10-T1` (extracción), `G03-B8` (HR zones alumno la consume), `G07-C3` (editor cardio builder la consume).
- **Distinto:** G10-T1 mueve el domain puro a package; G03/G07 lo importan. Riesgo de doble port si G03/G07 no esperan a G10-T1.

### 2.3 Extracción `domain/bodycomp` → `@eva/bodycomp`
- **IDs:** `G10-T2` (extracción), `G05-T11` (vista alumno read-only), `G06-B4` (pestaña Progreso coach).
- **Distinto:** los tres reclaman "mover domain/bodycomp a packages". G10-T2 es la extracción canónica; G05/G06 construyen UI sobre ella.

### 2.4 `workout-block-grouping` (reclamado por G03 y G07)
- **IDs:** `G03-B0`/`G03-B11` (dentro de `@eva/workout-engine`) vs `G07-B1` (dentro de `@eva/plan-builder`).
- **Distinto:** ambos extraen el MISMO módulo `workout-block-grouping.ts` a paquetes con nombres distintos. Choque de destino: decidir un solo package (o dependencia compartida) o se duplica la lógica de superseries.

### 2.5 `workout-areas` (reclamado por G03 y G07)
- **IDs:** `G03-B0`/`G03-B12` (ejecución alumno) vs `G07-B1`/`G07-C1`/`G07-C2` (builder coach).
- **Distinto:** G03 lo quiere para leer áreas en ejecución; G07 para el editor de áreas dinámicas. Misma lógica pura, dos consumidores; extraer una vez.

### 2.6 `session-logs.reconcile` (reclamado por G03 y G11)
- **IDs:** `G03-B0`/`G03-B3` (workout-engine + resiliencia sesión) vs `G11-C1` (cola offline generalizada).
- **Distinto:** G03 lo mete en `@eva/workout-engine` para la ejecución; G11 lo quiere como base de la cola offline genérica. Ambos "portan reconcile puro" — coordinar el mismo módulo compartido.

### 2.7 Share-cards v2 branded (reclamado por G03 y G05)
- **IDs:** `G03-B10` (desde ejecución/summary) vs `G05-T13` (desde perfil).
- **Distinto:** G03 = PR share tras finalizar rutina; G05 = Progreso/Racha/Resumen mensual desde perfil. Comparten el motor de canvas nativo (view-shot/Skia) + datos; construir el renderer una vez.

### 2.8 Glow de marca (AmbientBrandGlow / GlowBorderCard RN)
- **IDs:** `G01-F1.5` (primitiva DS), `G06-A4` (ClientHero con glow), `G09-T16` (Mi Marca avanzada con glow); mencionado también en home/hero de `G03-A5`.
- **Distinto:** G01-F1.5 crea la primitiva; G06/G09 la aplican a superficies concretas. Debe construirse en G01 y consumirse.

### 2.9 Búsqueda global / command palette
- **IDs:** `G01-F1.6` (command palette RN, primitiva) vs `G06-B8` (búsqueda global coach `/api/coach/search`).
- **Distinto:** G01 = primitiva de UI reutilizable; G06 = la superficie coach concreta que la usaría. Solape parcial de la capa de UI.

### 2.10 Toast/Sonner DS
- **IDs:** `G01-F0.6` (provider canónico) vs `G05-T1` (fundación de toast RN); dependido por `G08-A1`.
- **Distinto:** G01-F0.6 y G05-T1 son literalmente la misma fundación de toast pedida dos veces. Hacer una.

### 2.11 Adopción `@eva/nutrition-engine` (borrar macro-calculator / nutrition-utils)
- **IDs:** `G04-B1` (alumno), `G08-B1` (coach), `G10-T6` (módulos), `G11-A1` (infra).
- **Distinto:** cuatro dominios piden borrar los duplicados y re-exportar del engine. Idéntico trabajo — una sola vez.

### 2.12 Switch DS
- **IDs:** `G01-F0.7` (Switch + Select DS) vs `G09-T2` (Re-skin Mi Marca "incluye Switch DS si no existe").
- **Distinto:** G01-F0.7 es la primitiva canónica; G09-T2 la absorbe como fallback. Riesgo de dos implementaciones.

### 2.13 Cápsula flotante del nav alumno (AlumnoMobileChrome)
- **IDs:** `G02-A1`+`G02-A2`+`G02-A3` (dominio auth/chrome) vs `G03-A4` (dominio workout, "1:1 web, transversal").
- **Distinto:** el mismo componente re-skineado reclamado por dos dominios; G03-A4 se declara explícitamente transversal.

### 2.14 Nav registry declarativo (matar hardcode de chrome)
- **IDs:** `G01-F1.3` (registro genérico de los 2 chrome), `G09-T15` (nav registry coach compartido), `G02-B4` (gate nutrición en nav alumno).
- **Distinto:** G01-F1.3 abarca ambos chrome; G09-T15 se centra en `CoachMobileChrome` + `getVisibleNavItems`; G02-B4 es un caso puntual del nav alumno. Riesgo de tres enfoques del mismo registro.

### 2.15 Re-skin de nutrición (coach y alumno) duplicado con dominio módulos
- **IDs:** coach → `G08-A1`+`G08-A2` vs `G10-T8`; alumno → `G04-A1..A5` vs `G10-T7`.
- **Distinto:** G10 (módulos de pago) reclama el re-skin base de nutrición que G04/G08 ya cubren en detalle. G10 lo trata como prerequisito de exchanges; hacerlo una vez.

### 2.16 Catálogo de Módulos en settings
- **IDs:** `G09-T9` vs `G10-T13`.
- **Distinto:** misma pantalla read-only de catálogo (copy de `@eva/module-catalog` + CTA por contexto) reclamada por settings (G09) y por módulos (G10).

### 2.17 Panel de Funciones (feature-prefs)
- **IDs:** `G09-T10` (panel coach genérico), `G10-T14` (modelo Funciones vs Módulos), `G08-C5` (feature-prefs de nutrición).
- **Distinto:** G09-T10/G10-T14 son el panel + resolver `visible = ENTITLED AND ENABLED`; G08-C5 es su aplicación a las secciones de nutrición. Solape de la capa base.

### 2.18 Nutrición Pro / exchanges (3 dominios)
- **IDs:** builder coach → `G08-C2` vs `G10-T15`; vista alumno → `G04-B4` vs `G10-T16`.
- **Distinto:** G10 y G08 reclaman el modo intercambios del builder coach; G10 y G04 reclaman la vista alumno en porciones. Mismo cableado a `/api/mobile/nutrition/exchanges/*`.

### 2.19 Vistas alumno read-only movement/bodycomp
- **IDs:** `G05-T10`/`G05-T11` (dominio alumno) vs `G10-T11`/`G10-T12` (incluyen "vista alumno read-only").
- **Distinto:** G05 las trata como pantallas del perfil alumno; G10 las incluye dentro del build completo del módulo. Definir dueño único.

### 2.20 Video inline de ejercicio (YouTube/mp4)
- **IDs:** `G03-B13` (técnica en ejecución alumno), `G05-T12` (catálogo "Aprender" alumno), `G07-D2` (preview coach + recorte).
- **Distinto:** tres superficies distintas que necesitan el mismo player inline RN (webview YouTube / expo-video). Componente compartible.

### 2.21 iOS universal links / deep links
- **IDs:** `G02-B8` (auth alumno) vs `G11-A3` (infra) + `G11-A2` (Android assetlinks).
- **Distinto:** G02-B8 y G11-A3 piden el mismo `associatedDomains` iOS. Infra (G11) es el dueño natural.

### 2.22 Badge nativo
- **IDs:** `G05-T6` (limpiar badge al abrir check-in) vs `G11-B2` (badge numérico nativo).
- **Distinto:** G11-B2 crea el mecanismo; G05-T6 lo consume (setBadgeCountAsync(0)). Solape parcial.

### 2.23 `reconcileMeals` (cascade-safety nutrición) — nota
- **ID:** `G08-B2` (única). No es cross-domain, pero es un módulo puro (`nutrition-propagation.reconcile.ts`) candidato al mismo paquete de nutrición que tocan G04/G08/G10 — coordinar destino.

---

## 3. Totales

### 3.1 Por dominio

| Dominio | Archivo | Tareas | S | M | L | XL |
|---|---|---|---|---|---|---|
| Fundaciones DS | G01 | 19 | 9 | 9 | 1 | 0 |
| Alumno auth/chrome | G02 | 14 | 13 | 1 | 0 | 0 |
| Alumno workout | G03 | 24 | 10 | 8 | 5 | 1 |
| Alumno nutrición | G04 | 19 | 10 | 8 | 1 | 0 |
| Alumno checkin/perfil | G05 | 13 | 4 | 5 | 4 | 0 |
| Coach dash/clientes/ficha | G06 | 17 | 5 | 8 | 4 | 0 |
| Coach builder/ejercicios | G07 | 17 | 4 | 9 | 4 | 0 |
| Coach nutrición/checkins | G08 | 15 | 8 | 6 | 1 | 0 |
| Coach opciones/sub/team | G09 | 14 | 3 | 9 | 2 | 0 |
| Módulos de pago | G10 | 16 | 5 | 7 | 2 | 2 |
| Infra transversal | G11 | 13 | 8 | 3 | 1 | 1 |
| **TOTAL** | | **181** | **79** | **73** | **25** | **4** |

### 3.2 Por esfuerzo + estimación en días

| Esfuerzo | # tareas | Días/tarea (prom.) | Días |
|---|---|---|---|
| S | 79 | 1.5 | 118.5 |
| M | 73 | 4 | 292.0 |
| L | 25 | 7.5 | 187.5 |
| XL | 4 | 15 | 60.0 |
| **TOTAL** | **181** | | **658.0 días-persona** |

> Nota: 658 días-persona es la suma bruta de esfuerzos, ANTES de descontar los ~20+ solapamientos
> de la §2 (varias tareas son el mismo trabajo reclamado por 2-8 dominios). El esfuerzo neto real
> es sustancialmente menor una vez consolidados los duplicados de entitlements, engines y primitivas DS.

---

## 4. Tareas sin dependencias (arrancables de inmediato)

Tareas con dependencia declarada `ninguna` / `—` / `sin deps` (hard-startable):

- **G01-F0.1** — Reconciliar mismatches de token dark + motion (S)
- **G01-F0.2** — Frontera de theming className vs objeto theme (S)
- **G02-A5** — Onboarding wizard 3 pasos (S)
- **G02-A6** — Pulido DS suspended/change-pwd/forgot/reset + fix typo (S)
- **G02-B6** — Login: validación de workspace/coach (S)
- **G03-B0** — Extraer `@eva/workout-engine` (L) — bloquea B1–B8
- **G03-C1** — Días pendientes de la semana en home (M)
- **G03-C2** — WeightQuickLog + TrendArrow (S)
- **G03-C3** — PRDetailSheet (S)
- **G03-C4** — ProgramPhaseBar + estados de plan (S)
- **G04-A1** — Header nutrición + glow + purgar theme (S)
- **G04-B1** — Adoptar `@eva/nutrition-engine` (S)
- **G05-T1** — Fundación de toast DS en RN (S)
- **G05-T3** — Re-skin Historial (S)
- **G05-T5** — Re-skin Ejercicios + FeaturedExerciseCard (M)
- **G06-A1** — Re-skin home.tsx error/loading (S)
- **G06-B2** — Cablear entitlements en mobile (L)
- **G06-B10** — Alinear MobileDashboardData vs DashboardV2Data (S)
- **G07-A1** — Re-skin ejercicios.tsx + toggle "Con video" (S)
- **G07-A3** — Re-skin program-builder.tsx (legacy) (L)
- **G07-A6** — Re-skin builder.tsx lista de programas (M)
- **G07-B1** — Extraer `@eva/plan-builder` (L) — bloquea B2/C
- **G09-T8** — Adoptar module-catalog + feature-prefs + fetch (S)
- **G10-T1** — Extraer `@eva/cardio` (S)
- **G10-T2** — Extraer `@eva/bodycomp` (M)
- **G10-T7** — Re-skin alumno nutricion.tsx (M)
- **G10-T8** — Re-skin coach nutrición/builder/foods (M)
- **G11-A1** — Adoptar packages `@eva/*` faltantes (S)
- **G11-A2** — Fix assetlinks.json SHA256 (S) — P0
- **G11-A3** — associatedDomains iOS (S) — P0

**Startables con dependencia "blanda"** (no bloqueante real: primitivas DS que ya existen, chequeos,
"ninguna dura", o solo un dato): `G02-A1`, `G02-B1` (revisar grants), `G03-A4` (transversal),
`G03-A5`, `G05-T4` (dato), `G06-A3`, `G07` re-skins que dependen solo de A3, `G08-A1`/`A2`/`A3`/`A4`,
`G08-B1` (revisar consumidores), `G09-T1`, `G09-T7` (ninguna dura), `G09-T14` (ninguna dura),
`G11-A5` (sin deps duras).

---

## 5. Notas de fidelidad / malformaciones detectadas

- **G09 salta la numeración T5 y T6:** las tareas van `T1–T4, T7–T16` (14 tareas, no 16). No hay
  `G09-T5` ni `G09-T6` en el informe original. Se conservó la numeración original sin renumerar.
- **G05:** las tareas se listan como `1.`–`13.` pero las dependencias internas las referencian como
  `T1`–`T13` (ej. "Dep: T2", "Dep: T8"). Se adoptó `G05-T1..T13` por coherencia con esas referencias.
- **G08:** varias tareas de Ola A/B (`A2`, `A3`, `B4`) no declaran dependencia explícita; se marcó
  "(no indicada)". El propio informe cierra con "recuento exacto en el bloque estructurado" pero el
  bloque estructurado no aparece más detallado — el recuento aquí es por conteo directo de la lista.
- **G02** tiene una sección "Diferido / excluido" (login Google alumno, PWA, layouts login extra) que
  NO define tareas con ID → no se contaron. Igual en G03/G05/G10/G11 hay secciones de excepciones
  intencionales sin ID, excluidas del inventario.
- Todos los 11 archivos tienen sección de "Tareas propuestas" bien formada con tipo y esfuerzo por
  tarea. No hubo archivos sin sección de tareas.
