# R5 — Auditoría pixel 1:1 COACH · Opciones + Mi Marca + Funciones + Áreas + Equipo + Suscripción/Reactivate + Tools/Módulos/Cardio/Movement/Bodycomp + Auth

Referencia: árbol web `md<760` (bloques `md:hidden` / secciones móviles). Reglas: valores EXACTOS del código web; PROHIBIDO heredar estilo legacy mobile (StyleSheet + `theme.foreground` + `FONT.*` inline en vez de tokens DS + roles `TYPE`); COPY web neutralizado (sin voseo, tildes SÍ).

Clasificación: **DIFF-pixel** (valor distinto) · **DIFF-EST** (elemento/sección falta, sobra o cambia de forma/lugar).

> **Prioridad crítica del fixer (bugs de idioma, verificados):**
> - `tools.tsx` y `register.tsx` están **escritos en estilo legacy** (StyleSheet + `theme.*` + `FONT.*` inline, NO tokens DS) **y con tildes borradas** en casi todo el copy. Son los dos peores infractores del dominio.
> - Voseo restante en `areas.tsx`, `settings.tsx` (hub), `reactivate.tsx`, `modules.tsx`.

---

## 0. Voseo / tildes (regla CEO — corrección textual literal)

| Archivo:línea | Actual (RN) | Debe decir (neutro + tildes) | DIFF |
|---|---|---|---|
| `app/coach/settings/areas.tsx:192` | "**Organizá** los días de entrenamiento…" | "Organiza los días…" | pixel |
| `app/coach/(tabs)/settings.tsx:243` | subtitle Áreas "**Organizá** los días del planificador" | "Organiza los días del planificador" | pixel |
| `app/coach/reactivate.tsx:35` | "**Reactivala** para recuperar…" | "Reactívala para recuperar…" | pixel |
| `app/coach/reactivate.tsx:37` | "**Regularizá** el pago…" | "Regulariza el pago…" | pixel |
| `app/coach/modules.tsx:219` | "**Gestioná** las bajas desde Suscripción." | "Gestiona las bajas desde Suscripción." | pixel |

### 0b. `tools.tsx` — tildes borradas (todas verificadas)
| Línea | Actual | Correcto |
|---|---|---|
| 70 | "…con semaforo de prioridad y evolucion." | "…semáforo… evolución." |
| 76 | "Bioimpedancia y antropometria ISAK con tendencia por metodo." | "antropometría… método." |
| 148 | "Tus modulos" / "Modulos" | "Tus módulos" / "Módulos" |
| 161-162 | "Aun no **tenes** modulos activos" | "Aún no tienes módulos activos" (voseo `tenes`→`tienes`) |
| 164-165 | "…evaluacion de movimiento y composicion corporal… **Activalas** para verlas **aca**." | "…evaluación… composición corporal… Actívalas para verlas acá." |
| 168 | "Ver modulos" | "Ver módulos" |
| 181 | "**Elegi** el modulo y despues el alumno." | "Elige el módulo y después el alumno." |
| 195 | "**Elegi** un alumno" | "Elige un alumno" |
| 196 | "Composicion corporal · se mide a una persona a la vez" | "Composición corporal · …" |
| 282 | "Aun no **tenes** alumnos… mediciones de composicion corporal." | "Aún no tienes alumnos… composición corporal." |

### 0c. `register.tsx` — tildes borradas (todas verificadas)
| Línea | Actual | Correcto |
|---|---|---|
| 120 | "La **contrasena** necesita al menos 8 caracteres." | "contraseña" |
| 152 | "Debes aceptar los **terminos**…" | "términos" |
| 159 | "…marca (**minimo** 2 caracteres)." | "mínimo" |
| 316 | hint "…se genera con un **codigo unico** en tu panel." | "código único" |
| 346 | label "**Contrasena**" | "Contraseña" |
| 348 | placeholder "**Minimo** 8 caracteres" | "Mínimo" |
| 376 | "**Contrasena** segura" | "Contraseña segura" |
| 377 | "8+ caracteres con letras y **numeros**." | "números" |
| 409 | "**Ya tienes cuenta?** " (falta `¿`) | "¿Ya tienes cuenta? " |
| 410 | "Inicia **sesion**" | "Inicia sesión" |
| 454 | "Sin tarjeta de **credito**." | "crédito" |
| 465 | SummaryRow "**Nutricion**" | "Nutrición" |
| 481 | "…los **terminos** de servicio y la **politica** de privacidad." | "términos… política" |
| 550-551 | feature "Planes de **nutricion**" | "nutrición" |
| 592 | badge "**Mas** popular" | "Más popular" |

> Nota: `login.tsx` SÍ usa tildes ("Contraseña", "Iniciar sesión"); `register.tsx` es inconsistente incluso dentro de auth. `bodycomp/[clientId].tsx` está OK (STEPS "Perímetros/Diámetros/Revisión" con tilde). `cardio/index.tsx` y `movement/index.tsx` están OK en tildes (pero ver §9-10 por estilo legacy).

---

## 1. Hub "Opciones" — `app/coach/(tabs)/settings.tsx` vs `coach/settings/page.tsx` (bloque `md:hidden`, líneas 318-406)

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Título "Opciones" | `font-display font-black uppercase tracking-tighter text-xl` (~21px) · L322 | `font-display-black` 26px, ls -0.52, **sin uppercase** · L129 | pixel (uppercase falta; 21 vs 26) |
| Subtítulo | `text-sm leading-relaxed text-muted` (14px, lh 1.6) · L323 | 13px, lineHeight 19 · L132 | pixel (14→13; lh) |
| **Sección "Apariencia" (ThemeToggleCard)** | Card de tema JUSTO tras el hero · L330-333 | **AUSENTE** (RN manda tema a "Mi cuenta") · — | **EST** (sección faltante) |
| Patrón de card | **HubCard**: card bordeada individual, tile icono 46×46 `rounded-control`, `p-4`, icono 22px · L78-102 | **ListRow** en `Card padding="none"` con dividers, IconTile **36×36** `rounded-md`, icono 18px · L63-69, L166 | **EST** (vocabulario de card distinto: bordeada-individual vs lista-agrupada) |
| IdentityHero avatar | `h-14 w-14` (56px) rounded-full, `font-display text-2xl (24px) font-black`, solo inicial · L120 | Avatar `size="xl"` (verificar px), name-derived · L147 | pixel (24px inicial) |
| IdentityHero subtítulo | standalone `Coach · {N} alumnos` · L328 | "Tu negocio EVA" · heroSubtitle L116 | **EST/copy** (dato de alumnos vs frase estática) |
| IdentityHero nombre | `font-display text-xl (21px) font-black` · L124 | 20px, ls -0.4 · L149 | pixel (21→20) |
| Card "Funciones" título | "Funciones **de nutrición**" · L380 | "Funciones" · L233 | pixel/copy |
| Card "Funciones" desc | "…qué ven **los** alumnos" · L381 | "…qué ven **tus** alumnos" · L234 | pixel/copy |
| Card Áreas desc | "Organiza los días del planificador" · L387 | "**Organizá**…" · L243 | pixel (voseo, ver §0) |
| Card Módulos badge | `{ADDON_MODULE_KEYS.length} módulos` · L371 | `{MODULE_CATALOG_KEYS.length} módulos` · L219 | pixel (contar que coincidan) |
| Sección "Cuenta": logout | **CoachSignOutCard** (card con acción de logout inline) · L399 | ListRow "Mi cuenta" → /coach/perfil · L263 | **EST** |
| **DangerZone** (eliminar cuenta) | Presente en hub móvil · L403 | **AUSENTE** del hub (vive como "Solicitar baja" dentro de Mi Marca) · — | **EST** |
| Footer | 1 línea `EVA · Ejercicio Virtual Avanzado · v2.4` (`text-xs font-semibold`), wordmark `text-2xl font-black` · L108-110 | 2 líneas: wordmark "EVA" 22px + "Ejercicio Virtual Avanzado · v2.4" 11px · L276-281 | pixel (wordmark 24→22; string partido) |

> El hub añade una sección **"Tu equipo"** (row Mi Equipo) que no está en el hub standalone web (web sólo la muestra en la rama `team_managed`). En standalone eso es **EST (sobra)**; verificar contra la intención del arquitecto E7.

---

## 2. Mi Marca — `app/coach/settings/brand.tsx` vs `settings/BrandSettingsForm.tsx`

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Brand Score layout | fila única `[label + %] [barra max-w-200] [dot + "Sin guardar"]` · L406-426 | fila `[label][("Sin guardar")(%)]` y barra **full width debajo** · L415-430 | **EST** (orden/estructura) |
| Brand Score pesos | logo20/color15/welcomeMsg**10**/modal10/brandName10/loader10/font10/variant10/sec5 · L212-224 | logo20/color15/welcomeMsg**15**/customLoader**15**/brandName**15**/font10/variant5/sec5; **sin peso de welcomeModal** · L230-241 | **EST** (fórmula distinta → % mostrado diverge) |
| "Sin guardar" chip | `text-[10px] font-bold` + dot, color warning-600 · L421-424 | pill `bg-warning-100 text-warning-700` 10.5px · L420-422 | pixel |
| **Vista previa** | **BrandThemePreview** (mockup de teléfono con tabs, dark toggle, expand) · L433-451, 788-806 | Card resumen (logo 64 + nombre + swatch + EvaLoader) + botón "Ver app del alumno (pantalla completa)" → ruta · L434-476 | **EST** (mockup fiel vs card-resumen + preview por ruta) |
| Logo card título | h2 "Logo **de tu marca**" `text-base font-bold` · L458 | SectionCard "Logo" 14px · L489 | pixel/copy |
| Logo desc | "…**También es el ícono** que ven al instalar… PNG o JPG · máx 2 MB · 512×512 px… Se guarda al presionar Guardar." · L459-461 | info-box "…El **ícono de la app instalada usa el de EVA** (limitación de la tienda)." · L515-517 | **EST/copy** (mensaje inverso; en mobile el ícono NO es el logo) |
| LogoSlot borde | `border-2 border-dashed` · L78 | `border` (1px) dashed · L1113 | pixel (2px→1px) |
| LogoSlot hint claro | "Para fondos claros (modo claro)." · L465 | "Para fondos claros." · L498 | pixel/copy |
| LogoSlot "Sin guardar" | badge esquina en el slot · L91 | — (RN sube al instante, no stage) · — | **EST** (flujo: web stage+FAB, RN upload inmediato) |
| **Orden Identidad** | brand_name PRIMERO ("Nombre de tu marca"), luego full_name ("Tu nombre completo") · L500-558 | fullName PRIMERO ("Tu nombre"), luego brandName ("Nombre de marca") · L523-524 | **EST** (orden invertido) |
| Identidad título | "Identidad **de tu marca**" + desc "Esta información es lo primero…" · L494-498 | "Identidad" (sin desc) · L522 | pixel/copy + EST (desc falta) |
| Campos: helper text | cada input con `text-[10px] text-muted` de ayuda · L511,554 | sin helper bajo inputs · — | **EST** |
| **Bienvenida** | UNA card "Mensajes de bienvenida" (login + modal juntos), desc "Dos mensajes distintos…" · L562-685 | DOS SectionCards: "Bienvenida" (login) + "Mensaje al entrar al dashboard" (modal) · L536-588 | **EST** (1 card → 2 cards) |
| Login msg label | "Mensaje en el login" · L574 | "Mensaje en el login **del alumno**" · L538 | pixel/copy |
| Modal tabs Texto/Video | botones con iconos FileText/Play, `rounded-lg border` · L616-642 | SegmentedTabs sin iconos · L559-563 | **EST** |
| Modal textarea | `rows={5}` · L653 | `minRows={3}` · L568 | pixel |
| **Color de marca** | **NO existe** (rueda muerta W1b); sólo ThemeGallery + `hidden primary_color` · L687-695 | SectionCard completa "Color de marca": 9 swatches + paleta 12×3 matices + hex input + contraste WCAG · L625-699 | **EST (MAYOR: RN reintroduce el color-picker legacy que la web eliminó)** |
| "Usar mi marca en mi panel" | card PROPIA tras LoginLayoutPicker · L705-719 | anidado DENTRO de "Color de marca" · L693-698 | **EST** (ubicación) |
| **Loader animado** | dentro del acordeón **BrandAdvancedSection** · L722-734 | SectionCard top-level "Loader animado" · L702-749 | **EST** (top-level vs dentro de avanzado) |
| Tema (galería) | componente **ThemeGallery** · L689 | SectionCard propia + FeelChips + PresetCard grid · L592-622 | verificar 1:1 vs ThemeGallery (no auditado) |
| Login layout | **LoginLayoutPicker** · L698 | SectionCard "Diseño del login" + 4 thumbs · L753-786 | verificar 1:1 (no auditado) |
| Compartir QR | `QRCodeSVG size={96} level="M"`, code chip `font-mono tracking-[0.22em]`, input readonly + botón Copy (clipboard) · L226,747-777 | QR **150**, code chip `font-display-bold ls 4`, ReadonlyRow + botón "Compartir link" (share nativo) · L957-965 | pixel (96→150; font mono→display) + EST (copy vs share) |
| "Cuenta / Solicitar baja" | **NO existe** aquí (DangerZone es del hub) · — | SectionCard "Cuenta" "Solicitar baja por correo" · L970-981 | **EST (sobra en RN — compensa el DangerZone ausente del hub)** |
| Upsell (Free) | componente **BrandUpsell** · page L255 | Card Lock inline "Marca personalizada en **Starter+**" / "Sube a **Starter** (o superior)…" · L383-388 | **copia potencialmente ERRÓNEA**: el gate real es **Pro** (memoria: "upsell Mi Marca corregido a Pro #118"). Verificar contra BrandUpsell; RN dice Starter |

---

## 3. Funciones — `app/coach/settings/features.tsx` vs `components/coach/FeaturePrefsPanel.tsx`

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Selector de preset | grid `grid-cols-3` de **botones-card** (radiogroup), sel = `bg-sport-500 text-on-sport shadow-sm`, `min-h-44 rounded-xl border` · L257-283 | **SegmentedTabs** · L288-292 | **EST** (grid-cards vs segmented) |
| Fila de sección | label + badge + **InfoTooltip** (hover); descripción del tooltip NO inline · L370-378 | label + badge + **tooltip SIEMPRE inline** como texto bajo el label · L349-360 | **EST** (tooltip hover vs texto inline permanente) |
| Badge Pro | `bg-amber-500/10 text-amber-600` uppercase tracking-wide 10px + Sparkles 2.5 · L466-470 | `Badge tone="warning"` label "Pro" size sm + Sparkles 10 · L351 | pixel (tono/estilo del chip) |
| Badge Base | `bg-muted text-muted-foreground` uppercase 10px · L472-475 | `Badge tone="neutral"` size sm · L353 | pixel |
| CTA locked | "**Desbloquear con {module.label}**" `border-primary/30 bg-primary/5 text-primary rounded-xl min-h-44` · L390-402 | pill "**Desbloquear**" (sin nombre de módulo) `bg-sport-100 text-sport-600 rounded-pill` · L364-374 | pixel/copy (texto acortado) + pixel (estilo) |
| Botón Guardar | `bg-primary text-primary-foreground` · L445-449 | `bg-cta-fill text-on-sport` · L407-410 | pixel (token) |
| Título de pantalla | (embebido; título lo pone la page/pane) | añade "Funciones" `font-display-black` 26px + subtítulo + back header · L138-146 | EST (RN full-screen; esperable) |

---

## 4. Áreas — `app/coach/settings/areas.tsx` vs `settings/areas/_components/AreasManager.tsx`

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Badge de área | `rounded border px-1.5 py-0.5 text-[9px] font-black uppercase` con `vm.badgeClass` (**fondo tintado**) · L154-161 | borde-only `borderColor:color, rounded 7, px7 py3, minWidth 38, font-display-black 10px`, **sin uppercase**, sin fondo · L296-298 | pixel (relleno vs outline; 9→10; uppercase falta) |
| Nombre de área | `truncate font-semibold text-strong` (~16px) · L163 | `font-sans-bold` 14.5px · L301 | pixel (semibold→bold; 16→14.5) |
| "Orden N" | `text-xs text-muted` (12px) · L164 | 11.5px · L302 | pixel |
| Input crear | `h-11 rounded-control px-4 text-sm`, botón `bg-sport-500 shadow-glow-sport` · L223-245 | height 46 `rounded-xl` px14, botón `bg-cta-fill` · L374-406 | pixel (44→46; radio; token de botón) |
| Input editar | `h-10 rounded-control`, orden `w-20` (80px) · L115-130 | height 42 `rounded-xl`, orden width **62** · L247-268 | pixel |
| Botón guardar edit | 44/36px `rounded-control bg-sport-100` · L132-140 | 40px `rounded-xl bg-sport-100` · L269-280 | pixel |
| **Empty state** | ninguno (lista `<ul>` vacía) · — | Card `EmptyState` con icono + título + subtítulo · L219-231 | **EST** (RN añade empty-state) |
| Subtítulo | (título/desc lo pone la page) | "**Organizá** los días…" voseo · L192 | pixel (§0) |

---

## 5. Equipo — `app/coach/settings/team.tsx` vs `team/page.tsx` (sección `md:hidden`, L73-193)

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Título de pantalla | (no hay h1 sobre el hero en móvil) · — | "Mi equipo" `font-display-black` 26px · L375 | **EST** (RN añade título) |
| Hero avatar | `h-14 w-14` (56px) `rounded-control font-display text-[22px] black` · L77-91 | 54×54 `rounded-xl font-display-black 21px` · L382-389 | pixel (56→54; 22→21) |
| Hero nombre | `font-display text-[22px] black` · L93 | `font-display-black 21px` ls -0.4 · L391 | pixel (22→21) |
| Role pill | `bg-white/10 px-2.5 py-[3px]`, RoleIcon 13px, text 11.5px · L94-97 | `rgba(.10) px9 py3`, icon 12, text 11.5 · L392-398 | pixel (px 10→9; icon 13→12) |
| Stats "Cupos" ring | ring 52 r22 stroke5, count `font-mono text-xs (12) bold`, label 10.5px uppercase `tracking-[0.04em]` · L110-124 | ProgressRing 52, label `font-mono 11.5px`, "Cupos" 10px ls 0.4 · L416-424 | pixel (12→11.5; 10.5→10) |
| Stats Alumnos/Módulos count | `font-display text-[26px] black` · L127,132 | `font-display-black 25px` · L427,438 | pixel (26→25) |
| Brand Studio heading | `font-display text-[17px] font-extrabold tracking-[-0.02em]` · L142 | `font-display-bold 16px` ls -0.3 · L450 | pixel (17→16; extrabold→bold) |
| "Solo lectura" chip | `px-2.5 py-1 text-[11px] font-semibold` · L146 | `px9 py4 font-sans-bold 11px` · L454-456 | pixel (semibold→bold) |
| Brand Studio cuerpo | componente **TeamBrandStudio** (editor con logos/acentos subset) inline · L153-171 | Card resumen + botón "Editar marca" → **Sheet** (nombre + color solamente) · L461-491 | **EST** (editor inline vs sheet reducido — mobile no sube logos) |
| Miembros | **TeamMembersManager** · L176-185 | rows propias + sheet gestionar · L518-524 | verificar vs TeamMembersManager (no auditado en detalle) |
| Footer | **EvaBrandIcon** 6×6 + "EVA Teams · {name}" `text-xs font-semibold` · L189-192 | **Users icon** 20 + "EVA Teams · {name}" `font-sans-bold 12px` · L527-530 | pixel/EST (icono EvaBrandIcon vs Users; semibold→bold) |

---

## 6. Reactivate — `app/coach/reactivate.tsx` vs `reactivate/ReactivateClient.tsx`

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Naturaleza | selector completo tier/ciclo/add-ons + checkout MP/Flow + comparativa · L256-633 | **muro DISPLAY-only** con link-out a web (money-safety) · L88-150 | **EST (intencional por IAP/money-safety — NO replicar checkout in-app)** |
| Título | "Reactivar plan" `font-display text-xl font-extrabold` + "Tu suscripción está pausada" · L260-261 | dinámico por estado ("Tu plan está cancelado"…) `3xl displayBlack` · headlineFor L30-43 | copy (RN más rico) + pixel (tamaño) |
| Copy body | (estático) | voseo "Regularizá"/"Reactivala" · L35,37 | pixel (§0) |

> Contenido restante de ReactivateClient (radio-cards de tier, pill de ciclo, add-ons pre-marcados, comparativa) **no tiene contraparte RN por diseño**. No es un gap a rellenar; documentar como divergencia money-safety.

---

## 7. Suscripción — `app/coach/(tabs)/subscription.tsx` vs `subscription/_components/SubscriptionContent.tsx`

Estado: RN es un **display money-safe** (plan actual + módulos + historial + link-outs a web para todo cobro). Usa correctamente tokens DS (`TYPE`, `textStyle`, className) y copy con tildes/neutro. **SubscriptionContent web no fue diffeado línea-a-línea en esta pasada** (es el gestor completo de billing que mobile deliberadamente link-outea). Pendiente: verificar labels exactos de estado/tono de badges y strings de aviso (dunning) contra `_lib/tier-display.ts` y `SubscriptionContent`. Sin hallazgos de voseo/tildes.

---

## 8. Módulos — `app/coach/modules.tsx` vs `settings/modules/_components/ModulesForm.tsx`

| Elemento | RN | DIFF |
|---|---|---|
| Back label | "**Ajustes**" · L184 | pixel — inconsistente: brand/features/areas/team usan "Opciones". Debe ser "Opciones". |
| Copy | "Gestioná las bajas…" voseo · L219 | pixel (§0) |

> ModulesForm web no diffeado en detalle (RN se declara read-only 1:1 vía `@eva/module-catalog`). Pendiente: comparar título/desc de pantalla, chips de superficie y badge Activo/De pago contra ModulesForm.

---

## 9. Tools — `app/coach/tools.tsx` vs `tools/_components/ToolsHub.tsx`

**Infractor grave: legacy-styled (StyleSheet + `theme.foreground/secondary/card`, `FONT.*` inline) + tildes borradas (§0b).** Además faltan secciones enteras.

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Header | `<header>` con h1 `font-display text-xl font-extrabold` + tile `size-9 (36) bg-sport-100`; **sin back** · L341-349 | back-btn circular 38px + tile 36 + título `FONT.displayBold 19px`; **con back** · L131-151 | **EST** (back sobra) + pixel |
| Empty-state | **Card inverse que VENDE**: tile 60px, h2 "Potencia tu evaluación" `text-[22px] black`, body "Cardio con zonas, screening… por alumno", CTA "Ver planes y módulos" · L354-378 | Card genérica: icono muted 52, "Aun no tenes modulos activos" 20px, copy distinto, CTA "Ver modulos" · L156-174 | **EST + copy** |
| **Tools bloqueados** | sección "Lo que puedes desbloquear" / "Descubre más" con locked cards + precio · L379-432 | **AUSENTE** (RN sólo lista activos) · — | **EST (MAYOR: sin upsell/locked)** |
| **Capa del plan (nutrition_exchanges)** | ModuleHubCard PLAN_TOOL "En el plan de nutrición" · L411-417 | **AUSENTE** · — | **EST** |
| Info banner | `bg-surface-sunken` "Elige el módulo y después el alumno…" · L389-393 | `bg theme.secondary` "**Elegi** el modulo y despues…" · L178-183 | pixel (§0b) + token |
| ToolCard CTA | `CTA_SPORT` (`bg-cta-fill min-h-12 text-[15px]`) "Usar" · L162-165 | Button variant sport leftIcon CirclePlay · L246-252 | pixel |
| Picker título | "Elige un alumno" `font-display text-lg extrabold` · L229 | "Elegi un alumno" (Sheet title) · L195 | pixel (§0b) |

---

## 10. Cardio — `app/coach/cardio/index.tsx` (+ CardioShared) vs `cardio/_components/CardioToolsClient.tsx`

Estado: **tildes OK** ("Cálculo manual", "Aún no tienes"). PERO **legacy-styled**: StyleSheet + `theme.foreground/border/card/secondary` + `FONT.*` inline en vez de tokens DS/`TYPE` (L99, 193-424). CardioShared limpio. **CardioToolsClient web no diffeado**; requiere pasada de valores exactos (SegmentedTabs vs tabs web, tamaños de summary/zonas, labels). Marcar como "estilo legacy a migrar + pendiente diff web". Sin voseo.

## 10b. Movement — `app/coach/movement/index.tsx` vs `movement/_components/MovementHubList.tsx`

Igual patrón: **tildes/neutro OK** ("Evaluación de ingreso", "Toca un alumno…"), pero **legacy-styled** (StyleSheet + `theme.*` + `FONT.*`, L65-193). MovementShared usado. **MovementHubList web no diffeado**; pendiente pasada de valores (avatar, badge draft `#F5A52422`/`#B4700A` hardcode vs token warning, CTA Evaluar/Retomar).

## 10c. Bodycomp — `app/coach/bodycomp/[clientId].tsx` (+ BodyCompShared)

Estado: **tildes OK** (STEPS "Datos + pliegues / Perímetros / Diámetros / Revisión"). **No diffeado contra** `bodycomp/_components/*` (IsakCaptureForm, BiaCaptureForm, BodyCompositionTabB6b) — pendiente pasada de pixel (labels de campos, orden de pasos, tarjetas de resultado ISAK/BIA).

---

## 11. Auth — Login `app/(auth)/login.tsx` (rama coach) vs `login/_components/CoachLoginForm.tsx`

| Elemento | Web (valor · línea) | RN (valor · línea) | DIFF |
|---|---|---|---|
| Submit label | "**Entrar como coach**" / pending "Iniciando sesión..." · L96-97 | "**Ingresar al panel**" / "Ingresando…" · L382,760 | pixel/copy |
| Email placeholder | "coach@eva.app" · L55 | "tu@email.com" · L227 | pixel/copy |
| Password placeholder | "Tu contraseña" · L66 | "••••••••" · L247 | pixel/copy |
| Forgot link | `text-[13px] font-bold text-sport-600` · L74-77 | 12px, `font-sans-semibold`, color=accent · L258-265 | pixel (13→12; bold→semibold; token) |
| Register link | "**¿No tienes cuenta?** Regístrate" (Regístrate bold sport-600) · L112-119 | "Crear cuenta nueva" (solo) sport-600 semibold 13px · L399-405 | copy/EST |
| **Remember me** | NO existe en coach web · — | checkbox "Recordarme" · L270-293 | **EST (sobra; verificar si intencional para persistencia mobile)** |
| Hero copy | (en page.tsx — no auditado) | pill "Panel del coach" + "Bienvenido de vuelta" 30px + "Ingresa tus credenciales…" · L359-373 | pendiente vs `login/page.tsx` |

> Rama alumno del login (white-label hero/layouts) fuera de scope coach; ya cubierta en ronda 4 alumno.

## 11b. Register — `app/(auth)/register.tsx` vs `(auth)/register/page.tsx`

Estado: **infractor grave de tildes (§0c) + legacy-styled** (StyleSheet + `theme.*` + `FONT.*`). Es un **wizard 3 pasos mobile-only free** (money-safety: pagos en web), divergente por diseño del register web. Pendiente: diff de valores contra `register/page.tsx` (pill "Cuenta coach", title 26px, radio-cards de tier, consent rows). Prioridad = arreglar tildes primero.

## 11c. Onboarding coach

RN no tiene pantalla `coach/onboarding` dedicada: el alta Google/free se completa dentro de `register.tsx` (`googleMode`, `completeCoachOnboarding`). Web tiene `coach/onboarding/complete/_components/CompleteOnboardingForm.tsx`. **No auditado** — verificar si el flujo mobile debe replicar algún paso de CompleteOnboardingForm o si el register lo cubre.

---

## Cobertura de esta pasada
- **Auditado a fondo:** Hub, Mi Marca, Funciones, Áreas, Equipo, Reactivate, Tools, Módulos (RN), Login coach, Register (RN), Cardio/Movement (RN, estilo).
- **Pendiente (2ª pasada):** diff pixel de web ThemeGallery / LoginLayoutPicker / BrandAdvancedSection / BrandUpsell; SubscriptionContent; ModulesForm; CardioToolsClient; MovementHubList; bodycomp `_components/*`; login `page.tsx`; register `page.tsx`; CompleteOnboardingForm; TeamMembersManager/TeamBrandStudio.
