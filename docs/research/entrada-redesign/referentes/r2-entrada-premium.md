---
status: reference
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# r2 — Entrada dark premium fuera de fitness: splash luminoso, handoff sin flash y selector de rol

Referente r2. Investigacion web de la experiencia de primer arranque en productos premium fuera del mundo fitness (Linear, Arc/Dia, Revolut, N26, Copilot Money, Perplexity, ChatGPT, Notion Calendar, Phantom Wallet), mas la capa tecnica de plataforma (Apple HIG / LaunchScreen, Android 12 SplashScreen API, expo-splash-screen). Objetivo: extraer patrones concretos para la "familia de entrada" de EVA — splash nativo -> walkthrough de 3 slides -> selector de rol "Soy alumno / Soy coach" — bajo la direccion elegida por el owner: **Dark Premium Continuo**, una sola atmosfera oscura sin flash blanco, coherente con el ejecutor V3 dark.

Nota de alcance: varios referentes (Revolut, N26, ChatGPT, Notion Calendar, Copilot Money) solo tienen catalogos de capturas detras de paywall (Mobbin, Page Flows, App Fuel, 60fps PRO). Donde no hubo fuente citable con detalle de diseno, este documento lo dice explicitamente en vez de inventar specs.

## Resumen ejecutivo

- **El dark premium no se construye con glow: se construye con una escalera de superficies y UN acento escaso.** Linear apila `#08090a` (canvas) -> `#0f1011` (cards) -> `#161718` (elevado) y separa con hairlines de 0.5-1px (`#23252a`, `#383b3f`) en vez de sombras; el unico color cromatico se usa "escasamente, en la marca y los focus rings". (styles.refero.design, linear.app/now)
- Linear regenero su tema en **LCH** en vez de HSL porque LCH es perceptualmente uniforme: paso de definir 98 variables por tema a **tres** (base, accent, contrast de 30 a 100). La variable `contrast` existe justamente para usuarios que necesitan temas de altisimo contraste. (linear.app/now/how-we-redesigned-the-linear-ui)
- **Blanco puro sobre negro puro produce halation** (halo alrededor del texto y de los elementos), que hace la lectura lenta y cansadora. La recomendacion consistente es fondo `#121212` o gris muy oscuro y acentos ligeramente desaturados, no negro absoluto ni saturacion full. (atmos.style, accessibilitychecker.org, uxgen.academy)
- **Un logo animado bien cronometrado hace que 1.5s de carga se sientan instantaneos; una pantalla en blanco hace que los mismos 1.5s se sientan un atasco.** Material recomienda splash simple: icono + color + animacion opcional; sin texto, sin imagenes complejas. (mobbin.com/glossary/launch-screen, uxpin.com)
- **iOS prohibe animar el launch screen real.** `LaunchScreen.storyboard` es un asset estatico cargado antes de que el proceso este vivo: sin codigo, sin APIs, sin animaciones, sin timers, sin logica condicional. (dev.to/voinkoder)
- **La ilusion que Apple si permite es el "bait and switch"**: el sistema muestra el storyboard estatico -> la app presenta de inmediato un view controller que **replica visualmente** el launch screen -> la animacion corre ahi. El pitfall clave es que el color de fondo de la ventana debe coincidir con el del launch screen o aparece el flash. (dev.to/voinkoder)
- **Android 12+ permite lo inverso**: no se puede customizar la entrada del splash, pero si su salida, con `setOnExitAnimationListener`; el icono central puede ser un `AnimatedVectorDrawable` via `windowSplashScreenAnimatedIcon` + `windowSplashScreenAnimationDuration`. (developer.android.com, yggr.medium.com)
- **Expo ya trae las tres piezas necesarias**: `preventAutoHideAsync()` en scope global, `setOptions({ duration, fade })` (default 400ms, `fade` es iOS-only) y variante `dark: { image, backgroundColor }` en el config plugin, que resuelve el tema **antes** de que corra JS, sin costo en runtime. (docs.expo.dev/versions/latest/sdk/splash-screen)
- **El "white flash of death" es un problema de tres capas, no de una**: `windowBackground` en Android (usar tema DayNight con `?attr/colorBackground`), System Background Color en el storyboard de iOS, y el background del root view / navigator igualado al hex oscuro. Arreglar solo el splash no alcanza. (ripenapps, Medium)
- **Dos botones de igual peso no son el doble de eleccion: duplican la deliberacion.** Un primario de alto contraste "colapsa la decision en un unico camino obvio"; los secundarios se rinden como outline, gris o texto plano. Hick's Law: el tiempo de decision crece con el numero y complejidad de opciones equivalentes. (designmybit.com, nerdcow.co.uk)
- **La auto-segmentacion ("soy X" / "estoy aca para Y") es un patron reconocido de onboarding**, y su valor esta en el ruteo posterior: el selector de rol de Figma manda disenadores, devs y PMs a primeras acciones distintas porque "un dev que aterriza en el flujo de un disenador se desengancha en minutos". Lo notable es cuan pocas opciones presentan: dos o tres preguntas con sets chicos. (chameleon.io, createbytes.com)
- **Phantom onboardea con lenguaje llano y UNA decision por pantalla**, con "espaciado calmo, jerarquia clara y moderacion con el color y la densidad"; el autor remarca que la moderacion visual "es siempre la parte que los fundadores se tientan de saltarse". (925studios.co)
- **Dia (The Browser Company) administra un "presupuesto de novedad"**: todo lo conocido arranca donde cualquiera lo entenderia sin aprender, y la animacion y el color expresivos se reservan para lo que si es nuevo — "tambien buscamos entregar la sensacion de nuestra marca a traves de esa UI". (browsercompany.substack.com)
- **NN/G es contundente y hay que internalizarlo**: sus tests encontraron que "los tutoriales no mejoraron el desempeno en la tarea" y su recomendacion primaria es evitar el onboarding cuando se pueda e invertir en que la UI sea mas usable. Si igual se hace: corto, solo lo novel, skip muy visible, indicador de progreso. (nngroup.com/articles/mobile-app-onboarding)
- **Numeros de motion que sirven de guardarrailes**: bajo ~80ms se percibe roto, sobre ~500ms se siente lento en movil; micro-interacciones ~100ms; transiciones hero/modal/push 300-400ms; estandar 200-300ms con ease-out. Lo expresivo se reserva a momentos de baja frecuencia — onboarding, first-run, hitos — donde el stagger alarga la duracion legitimamente. (appypie.com, atlassian.design)
- **El wordmark grande es contenido, no decoracion.** Perplexity pone su wordmark en minusculas en su tipografia propia a **64px** por encima del campo de busqueda, tratado como display copy, sobre un canvas de un solo tono y un unico acento. En dark premium el titulo ES la imagen. (shadcn.io/design/perplexity)
- **Diagnostico del repo**: `apps/mobile/app.json` ya declara splash `backgroundColor: "#07080C"` con variante `dark` identica (bien), pero `apps/mobile/app/index.tsx` envuelve toda la familia de entrada en `ForceLightTheme(branded: false)`. Eso garantiza el salto oscuro -> claro que la direccion elegida quiere eliminar. Es el bug numero uno del arranque actual.

## Hallazgos

### 1. Linear: la receta reproducible del dark premium

Linear es el referente mas documentado y el mas directamente copiable como sistema.

**Escalera de superficies** (todo lo separa el tono, no la sombra):

| Rol | Hex |
|---|---|
| Canvas / void | `#08090a` |
| Cards, nav | `#0f1011` |
| Elevado (dropdown, sheet) | `#161718` |
| Borde hairline | `#23252a` |
| Borde alto contraste | `#383b3f` |

**Texto**: `#ffffff` (primario), `#d0d6e0` (secundario), `#8a8f98` (terciario), `#62666d` (muted). **Acento**: un unico color cromatico usado con escasez en marca y focus rings; el sistema derivado publicado usa un lime acido `#e4f222` como CTA, descrito como una "linterna funcional: chica, de alto contraste, usada con moderacion para senalar accion". (https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1)

**Bordes y elevacion**: el sistema usa "hairline borders en vez de sombras para separar superficies", con anchos de 0.5px y 1px. Las unicas sombras declaradas son `rgba(0,0,0,0.4) 0 2px 4px` (sm) y `rgba(8,9,10,0.6) 0 4px 32px` (xl). Esa xl — difusa, oscura, de radio 32 — es el unico "glow" del sistema, y ni siquiera es un bloom luminoso: es profundidad.

**Tipografia**: Inter Variable en pesos 300 / 400 / **510** (peso firma) / 590, con features OpenType `cv01`, `ss03`, `zero`; Berkeley Mono como companion. En el rediseno oficial adoptaron **Inter Display** para titulares "para agregar mas expresion a nuestros headings manteniendo su legibilidad", dejando Inter estandar para el cuerpo. Display 72px / peso 510 / line-height 1.0 / letter-spacing **-0.022em**. (https://linear.app/now/how-we-redesigned-the-linear-ui)

**Radios**: 2 / 4 / 6 (inputs y botones) / 12 (cards) / 9999 (pills). **Spacing** base 4px; gap de elemento 8px, padding de card 24px.

**Temas en LCH**: eligieron LCH sobre HSL porque es perceptualmente uniforme — "un rojo y un amarillo con lightness 50 se veran mas o menos igual de claros al ojo humano" — lo que permite generar temas consistentes sea cual sea el color base. Resultado: tres variables (base, accent, contrast 30-100) en lugar de 98, y las elevaciones de superficie se derivan por calculo. Ademas bajaron el "chrome" (su azul) en los calculos para lograr una apariencia mas neutra y atemporal, y subieron contraste haciendo texto e iconos neutros mas claros en dark.

Lectura para EVA: esto es literalmente el mismo problema que el white-label. Un generador LCH con `base`, `accent = theme.primary del coach` y `contrast` resuelve de una vez el dark premium parametrizado por marca sin que ningun coach pueda romper la legibilidad.

### 2. Como se logra una marca luminosa sobre fondo oscuro sin quemar

Tres reglas convergentes de las fuentes de dark mode:

1. **No negro absoluto**. Blanco puro (`#FFF`) florece de noche y negro puro (`#000`) genera halation en texto chico; el halo hace la lectura lenta, cansadora y hasta dolorosa. Un negro suave `#121212` o gris muy oscuro reduce el glare manteniendo la legibilidad "sin que parezca brillar". (https://atmos.style/blog/dark-mode-ui-best-practices, https://www.accessibilitychecker.org/blog/dark-mode-accessibility/)
2. **Desaturar el acento**. Los colores de marca se sientan mas naturalmente en una interfaz oscura si se desaturan levemente, conservando identidad y enfasis sin abrumar. (https://www.wildnetedge.com/blogs/dark-mode-ui-essential-tips-for-color-palettes-and-accessibility)
3. **Moderacion con los efectos**. Las mismas guias piden explicitamente cuidado con "efectos visuales excesivos como sombras, glows y contrastes filosos" en dark mode, y cumplir APCA/WCAG. (https://inkbotdesign.com/dark-mode/, https://fivejars.com/insights/dark-mode-ui-9-design-considerations-you-cant-ignore/)

Traduccion operativa del "glow" que si funciona: **un gradiente radial muy amplio y de bajisimo alpha detras del mark** (mismo rol que la sombra xl de Linear, invertida en signo) mas el propio mark en el color de acento a full opacidad. El contraste lo genera la diferencia de luminancia entre el mark y el canvas, no un blur saturado. Un blur fuerte y saturado alrededor del logo es exactamente el halation que las guias piden evitar.

Referencias de "brand moment" citadas por las guias de launch screen: el gradiente de Instagram, el `#` de Slack, el pulso verde de Spotify y la animacion de Uber, esta ultima descrita como "nativa, acelerada por GPU y verificada contra objetivos de frame rate". Google recomienda mantener el splash simple: icono, color y animacion opcional; sin texto ni imagenes complejas. (https://mobbin.com/glossary/launch-screen, https://www.uxpin.com/studio/blog/splash-screen/)

Y el argumento economico del splash animado: "una animacion de logo bien cronometrada o una transicion suave hace que una carga de 1.5 segundos se sienta instantanea, mientras que una pantalla blanca en blanco hace que esos mismos 1.5 segundos se sientan un atasco".

### 3. Transicion splash -> primer frame JS: la ilusion que Apple permite

Esta es la seccion mas accionable del documento, porque el "sin flash" de la direccion elegida es un problema de plataforma, no de diseno.

**iOS — lo que esta prohibido.** El asset oficial de lanzamiento (`LaunchScreen.storyboard`) es un asset estatico cargado antes de que el proceso de la app este completamente vivo, con limitaciones estrictas: sin codigo, sin APIs, sin animaciones, sin timers, sin logica condicional. (https://dev.to/voinkoder/animated-ios-splash-screens-the-illusion-apple-actually-allows-52ej)

**iOS — la ilusion permitida (bait & switch), en tres pasos:**

1. *El anzuelo*: el sistema muestra el `LaunchScreen.storyboard` estatico al instante.
2. *El cambio*: la app presenta de inmediato un `UIViewController` que **replica visualmente** el launch screen — mismos assets, mismo background color, misma posicion (en el ejemplo del articulo, un logo de 200x200 centrado).
3. *La animacion*: ahi si corre codigo. El disparo va en `viewDidAppear`, **no** en `viewDidLoad`, porque renderiza mas suave.

**Salida**: se toma un snapshot de la vista de splash, se reemplaza el root view controller y recien despues se hace fade del snapshot (0.5s en el ejemplo) antes de removerlo. **Pitfall unico y critico**: el background color de la ventana debe coincidir con el del launch screen para evitar el flash durante el traspaso.

**Android 12+.** La SplashScreen API invierte los permisos: no se puede customizar la animacion de **entrada**, pero si la de **salida** con `splashScreen.setOnExitAnimationListener { splashScreenView -> ... }` (ejemplo tipico: `ObjectAnimator` de slide-up con interpolator, 500ms). El icono central puede ser un drawable normal, un `AnimatedDrawable` o un `AnimatedVectorDrawable` via `windowSplashScreenAnimatedIcon`, con `windowSplashScreenAnimationDuration` para su duracion. Google Drive fue la primera app en enviar un splash animado con esta API. (https://developer.android.com/develop/ui/views/launch/splash-screen, https://yggr.medium.com/exploring-android-12-splash-screen-21f88cc8e8f8, https://medium.com/@mohitrajput987/splash-screen-api-from-android-f922ed0dd515)

**Expo (lo que EVA ya tiene disponible).** (https://docs.expo.dev/versions/latest/sdk/splash-screen/)

```tsx
import * as SplashScreen from 'expo-splash-screen'
SplashScreen.preventAutoHideAsync()          // en scope global, NO dentro de un componente
SplashScreen.setOptions({ duration: 1000, fade: true })  // duration default 400ms; fade es iOS-only
```

Config plugin con variante por apariencia, resuelta a nivel nativo sin costo en runtime:

```json
["expo-splash-screen", {
  "backgroundColor": "#07080C",
  "image": "./assets/eva-mark-filled.png",
  "imageWidth": 180,
  "resizeMode": "contain",
  "dark": { "image": "./assets/eva-mark-dark.png", "backgroundColor": "#07080C" }
}]
```

Regla: asegurarse de que el contenido este listo antes de llamar `hideAsync()` para no provocar blank flashes, y devolver `null` mientras carga para no renderizar a medias.

**El "white flash of death" tiene tres capas, no una.** La causa raiz es que el SO controla la UI primero y JS recien toma el control cuando el bundle carga. El fix completo: (a) Android, tema `Theme.MaterialComponents.DayNight.NoActionBar` con `android:windowBackground` apuntando a `?attr/colorBackground` en vez de un hex fijo; (b) iOS, System Background Color en la vista principal del storyboard en vez de un hex fijo; (c) el background del root view / navigator igualado al hex oscuro de la app. Solo la combinacion de las tres "garantiza la sincronizacion del splash nativo con el estado de JavaScript". (https://medium.com/@ripenapps-technologies/the-white-flash-of-death-solving-theme-flickering-in-react-native-production-apps-d732af3b4cae)

Matiz importante para EVA: como la direccion es **dark siempre** en la familia de entrada (no "seguir al sistema"), lo mas robusto es fijar el mismo hex oscuro en las tres capas y en ambas variantes (`light` y `dark`) del splash — que es justo lo que `app.json` ya hace — y **eliminar el forzado a light del primer frame JS**.

### 4. Dia / The Browser Company: presupuesto de novedad

La estrategia declarada de Dia es la "tecnica del martes por la manana": permitir que cualquiera cambie de browser a las 10am sin friccion. El razonamiento: "si no tienen sus contrasenas, marcadores, o no encuentran como hacer una accion de rutina, van a abandonar el browser inmediatamente". (https://browsercompany.substack.com/p/the-strategy-behind-dias-design)

De ahi sale una regla de asignacion de presupuesto que aplica exactamente a una entrada:

- Todo lo estandar arranca "en un lugar donde cualquiera que haya usado un browser antes lo entenderia inmediatamente" — a diferencia de Arc, que innovaba sin disculpas sobre las mecanicas centrales.
- El craft se gasta en detalles baratos y silenciosos: el color de la pagina se extiende a la pestana activa para reforzar la relacion browser-contenido; los botones de marcador y ajustes solo aparecen en hover, preservando la calma de la UI.
- La animacion y el color expresivos se reservan para lo que si es nuevo (Chat, Skills), donde el usuario ya espera aprender: "tambien buscamos entregar la sensacion de nuestra marca a traves de esta UI".

Traduccion para EVA: el momento de marca (splash + selector) es donde se gasta el presupuesto de motion. El login, el codigo de coach y el reset de password deben ser aburridos, familiares y rapidisimos.

### 5. Selector de rol: jerarquia cuando una opcion es mayoritaria

**El patron existe y tiene nombre.** La auto-segmentacion (self-selected segmentation) es un tipo de welcome survey donde el usuario elige activamente su camino: "estoy aca para hacer X" o "soy [rol]". Su valor real esta en el ruteo: el selector de rol de Figma manda disenadores, devs y PMs a primeras acciones distintas, porque "un dev que aterriza en el flujo de un disenador se desengancha en minutos". Lo notable es cuan pocas opciones presentan: dos o tres preguntas, cada una con un set chico de opciones. (https://www.chameleon.io/blog/onboarding-ux-patterns, https://createbytes.com/insights/designing-ux-for-multi-role-platforms)

**La jerarquia asimetrica esta respaldada.** Sobrecargar una pantalla con CTAs de igual peso aumenta la carga cognitiva y la paralisis de decision: "dos botones del mismo peso no son el doble de eleccion; duplican la deliberacion". Un boton primario claro "colapsa esa decision de vuelta a un unico camino obvio". Los secundarios se rinden deliberadamente mas callados: outline, gris o texto plano. Hick's Law respalda el mecanismo: el tiempo de decision crece con el numero y la complejidad de opciones. (https://designmybit.com/designing-better-buttons-placement-and-cognitive-load/, https://nerdcow.co.uk/blog/cta-hierarchy/)

Esto es exactamente el caso de EVA: **alumno es mayoria de volumen, coach es el negocio**. La lectura correcta no es "los dos igual de grandes por respeto", sino un primario visualmente dominante para alumno y un secundario legible-pero-callado para coach. El coach entra pocas veces y sabe lo que busca; el alumno entra confundido y sin contexto.

**Precedentes concretos.** PayPal pregunta si la cuenta es personal o de negocio como paso explicito temprano del onboarding. (https://userpilot.com/blog/fintech-onboarding/) En fintech tambien esta documentado un patron de momentum: un equipo elimino el boton "Siguiente" en las preguntas obligatorias y el panel avanza en el momento en que el usuario hace la seleccion, "lo que redujo la fatiga mental y de dedo y creo sensacion de impulso". (https://www.theskinsfactory.com/uiux-design-blog/fintech-onboarding-ux-design)

**Phantom** resuelve la bifurcacion crear-wallet / importar-wallet con "lenguaje llano, una decision por pantalla y copy accesible en vez de jerga criptografica", y una superficie que "se ve como una app de consumo moderna: espaciado calmo, jerarquia clara, avatares y nombres de cuenta amigables, y moderacion con el color y la densidad". El autor remarca que "la moderacion visual es siempre la parte que los fundadores se tientan de saltarse". Ademas la guia oficial ordena las opciones: crear nuevo es el camino seguro, importar solo si ya tenes wallet. (https://www.925studios.co/blog/phantom-wallet-design-breakdown)

### 6. Walkthrough de 3 slides: cuanto vale realmente

NN/G identifica tres componentes de onboarding movil: **promocion de features** (tiende a percibirse como marketing), **customizacion** (pedir datos para personalizar) e **instrucciones** (ensenar la interfaz). Entre los formatos instruccionales, el "deck of cards" tipo carrusel esta **desaconsejado**; prefieren overlays contextuales y walkthroughs interactivos de aprender-haciendo. (https://www.nngroup.com/articles/mobile-app-onboarding/)

El hallazgo duro: en su investigacion "los tutoriales no mejoraron el desempeno en la tarea", y los flujos de onboarding requieren atencion y esfuerzo, o sea suben el costo de interaccion. Su recomendacion primaria es literal: **evitar crear onboarding cuando sea posible y gastar los recursos en hacer la UI mas usable**.

Cuando si se justifica: (a) cuando hace falta informacion del usuario para arrancar (el ejemplo que dan es setup de cuenta bancaria), (b) cuando la funcionalidad se adapta mucho a preferencias, (c) cuando las features son genuinamente novedosas o se apartan de patrones estandar.

Reglas de ejecucion si igual se hace: lo primero que el usuario busca ante un carrusel de onboarding es un boton "skip", asi que tiene que ser muy visible; 3 a 5 slides es el patron tradicional pero hay que minimizar a lo need-to-know; indicador de progreso en flujos multi-paso; si auto-rota, 1 segundo por cada 3 palabras. (https://www.smashingmagazine.com/2022/04/designing-better-carousel-ux/, https://www.nngroup.com/videos/carousels-websites-mobile-apps/)

Lectura para EVA: 3 slides es el maximo defendible, y su contenido debe ser **beneficio + novedad**, no tour de features. El caso (a) de NN/G aplica parcialmente: EVA si necesita un dato para arrancar (el codigo/enlace del coach), pero eso ya vive en el flujo de alumno, no en el walkthrough.

### 7. Micro-motion de entrada: numeros defendibles

Guardarrailes convergentes de guias de motion:

- **Bajo ~80ms se percibe roto** (el usuario no alcanza a percibir la animacion); **sobre ~500ms se siente lento** en una pantalla movil. (https://www.appypie.com/blog/mobile-app-animation-guide)
- **Micro-interacciones** (taps, ripples, toggles): ~100ms. **Transiciones hero** (entrada de modal, page push): 300-400ms. **Estandar general**: 200-300ms con ease-out.
- **Lo expresivo se reserva a momentos de baja frecuencia**: onboarding, first-run, celebraciones de hito. Y ahi el stagger es la herramienta legitima para alargar: "escalonar y ralentizar el movimiento de muchos elementos puede alargar la duracion". (https://atlassian.design/foundations/motion)
- Material 3 publica tokens de duracion (`md.motion.duration.short1 = 50ms`, etc.) y una curva **emphasized** `cubic-bezier(0.2, 0.0, 0, 1.0)` pensada para transiciones donde el contenido **entra** al viewport — container transforms y page transitions. Las micro-interacciones usan standard easing. (https://m3.material.io/styles/motion/easing-and-duration)
- **Accesibilidad**: `prefers-reduced-motion` no es opcional; el dato citado es que ~35% de usuarios a nivel global lo necesitan respetado (WebAIM 2026).

Material 1 lo resume bien: acertar en duracion y easing "garantiza que la gente tenga tiempo suficiente para notar el movimiento e interpretar que comunica".

### 8. Tipografia display y wordmark como elemento visual

**Perplexity** trata su wordmark como contenido, no como logo decorativo: va en minusculas, en su tipografia propia `pplxSans`, a **64px**, ubicado encima del campo de busqueda y descrito explicitamente como *display copy*. El resto del sistema es de una austeridad extrema: un canvas de un solo tono y un unico acento teal `#016a71`. (https://www.shadcn.io/design/perplexity)

**Linear** llega al mismo lugar por otro camino: adopto Inter Display en headings "para agregar mas expresion a nuestros headings manteniendo su legibilidad", con display a 72px, peso 510 y letter-spacing -0.022em. El apretado negativo del tracking en tamanos grandes es lo que separa un titular premium de uno generico.

La leccion combinada, que es exactamente lo que la familia de entrada de EVA necesita: **en dark premium el titular ES la imagen**. No hace falta ilustracion ni mascota si el wordmark y el H1 estan tratados como elemento grafico (tamano grande, tracking negativo, peso intermedio-alto, un solo acento cromatico). Esto ademas es compatible con white-label: el acento se parametriza, la escala tipografica no.

### 9. Que anima Perplexity en su entrada (catalogo 60fps)

El catalogo de animaciones documentadas de la app iOS de Perplexity incluye, entre otras: **"Getting Started Options"** (pantalla propia de arranque, no un modal escondido), **"Loader Animation Morph"** (indicador de carga que muta de forma, no un spinner generico), **"Number Flip Animation"**, **"Model Selection Sheet Morph Interaction"** (la sheet **morfea**, no aparece de golpe) y varias stroke animations para voz. (https://60fps.design/apps/perplexity)

Dos patrones portables: (1) las opciones de arranque merecen pantalla propia y motion propio; (2) el estado de carga de la entrada debe ser una **forma de marca que muta**, no un `ActivityIndicator` del sistema — que es exactamente la diferencia entre "premium" y "plantilla".

### 10. Lo que no se pudo verificar con fuente citable

Para honestidad del referente: los flujos de primer arranque de **Revolut** (53 pantallas documentadas), **N26**, **ChatGPT** y **Copilot Money** existen catalogados en Page Flows, App Fuel, Mobbin y NicelyDone, pero las capturas estan detras de paywall o no renderizan en fetch, y las descripciones publicas no contienen specs de color, timing ni jerarquia. De **Copilot Money** solo pudo verificarse que ofrece dark mode con "interfaz genuinamente hermosa", que su onboarding permite agregar cuentas manualmente **antes** de pedir credenciales bancarias (movida que construye confianza) y que usa tooltips contextuales en vez de un tour previo. (https://stackswitch.app/review/copilot-money) De **Notion Calendar** no se encontro material de teardown citable. **No se inventaron specs** para ninguno de estos.

El patron de Copilot si es portable y vale por si solo: **pedir lo barato antes que lo caro**. Traducido a EVA, el selector debe poder dejar al alumno mirar/avanzar antes de exigirle el codigo del coach, si el flujo lo permite.

## Aplicabilidad a EVA

### Diagnostico del estado actual (verificado en el repo)

- `apps/mobile/app.json` ya declara el splash correcto para la direccion elegida: `image: "./assets/eva-mark-filled.png"`, `imageWidth: 180`, `backgroundColor: "#07080C"`, y una variante `dark` con **el mismo** background y la misma imagen. Bien: el nativo ya es dark premium en ambas apariencias del sistema.
- **Pero** `apps/mobile/app/index.tsx` exporta `RoleSelectorRoute` envolviendo todo en `<ForceLightTheme branded={false}>`. El comentario explica el porque (la familia publica usa identidad EVA y no el color del ultimo coach cacheado), y ese razonamiento es correcto — pero el efecto colateral es que **el primer frame JS es claro**. Con splash `#07080C`, el salto oscuro -> claro esta garantizado en cada cold start. Es el hallazgo numero uno: la direccion "sin flash" se rompe en el propio codigo, no en la config nativa.
- La estructura del selector ya es la correcta segun §5: `role-alumno` es una card **rellena** con `theme.primary` y foreground de marca; `role-coach` es una card `bg-surface-card border border-default`. La asimetria de jerarquia ya existe. Falta la atmosfera, no la arquitectura.
- El motion del selector ya usa stagger de tres pasos (header delay 0, alumno delay 90ms, coach delay 150ms) con duraciones 360/380ms y `useReducedMotion()` respetado. Esta dentro de los guardarrailes de §7 sin cambios.
- El estado `checking` renderiza `EvaLoaderScreen` con subtitulo "Preparando EVA...". Ese es exactamente el punto donde aplica §9: forma de marca que muta, no spinner.

### RN nativo (la experiencia debe ser la mejor)

1. **Un solo hex de canvas en las cuatro capas.** Fijar `#07080C` (o el canvas final que elija diseno) en: splash `backgroundColor` light y dark (ya esta), `android:windowBackground`, el background del root view/navigator, y el `bg-surface-app` que renderiza el primer frame. Es el fix de tres capas de §3, extendido a la capa de tema de la app.
2. **Retirar `ForceLightTheme` de la familia de entrada** y reemplazarlo por un "tema EVA dark fijo, no-branded". Se conserva la intencion original (no heredar el color del ultimo coach) y se elimina el flash. Este es el cambio de mayor impacto/costo del documento.
3. **Handoff con replica, no con corte.** Montar como primer frame JS una replica exacta del splash (mismo mark, mismo tamano 180, misma posicion, mismo fondo) y recien desde ahi animar hacia el walkthrough o el selector. Es el bait & switch de §3 aplicado a RN: `preventAutoHideAsync()` en scope global, `hideAsync()` solo cuando la replica ya esta montada, y `setOptions({ fade: true, duration: 300-400 })` para que el cruce sea un fade y no un corte. En Android, la salida se puede complementar con el exit animation listener; en iOS el `fade` de Expo alcanza.
4. **Glow de marca correcto (§2)**: gradiente radial amplio y de bajo alpha detras del mark (analogo invertido de la sombra `xl` de Linear, `0 4px 32px` a `rgba(...,0.6)`), con el mark en el acento a opacidad plena. Nada de blur saturado. El repo ya tiene `AmbientBrandGlow` — reusarlo, no crear un segundo sistema, y verificar que su alpha no produzca halation sobre `#07080C`.
5. **Escalera de superficies dark (§1)** para las cards del selector: canvas -> card -> elevado con hairlines de 1px en vez de sombras. Con `theme.primary` del coach ausente en la entrada (identidad EVA), el acento unico es el de EVA.
6. **Tipografia del selector como imagen (§8)**: el "EVA" del header y el H1 "Elige como entrar" deben subir de escala y bajar tracking (letter-spacing negativo). Reusar `TYPE`/`FONT` existentes, agregando si hace falta un nivel display.
7. **Loader de marca (§9)**: `EvaLoaderScreen` debe ser una forma que muta, no un spinner. Ya es un componente propio; el requisito es que su motion sea continuo con el del splash (misma masa visual, mismo acento).
8. **Walkthrough acotado (§6)**: maximo 3 slides, skip persistente y muy visible desde el slide 1, indicador de progreso, contenido de beneficio y no tour de features. `hasSeenWalkthrough()` ya evita repetirlo.
9. **Motion dentro de guardarrailes (§7)**: mantener 200-400ms con ease-out y stagger de 60-150ms; nada sobre 500ms; `useReducedMotion()` ya respetado en `index.tsx` — replicarlo en cualquier pieza nueva.
10. **Sin deps nativas nuevas**: todo lo anterior se hace con Moti + Reanimated 4 + Skia (para el gradiente radial si hace falta calidad) + expo-splash-screen, que ya estan. Lottie sigue prohibido y no hace falta.

### PWA responsive (hereda diseno y todo lo funcionalmente posible)

- La web no tiene splash nativo real, pero si `theme-color` y el manifest: fijar el mismo canvas oscuro para que el arranque desde home screen no destelle blanco. El equivalente del fix de §3 en web es el background del `<html>`/`<body>` seteado antes de que hidrate React.
- La escalera de superficies, la tipografia display con tracking negativo y la jerarquia asimetrica del selector (§1, §5, §8) son 100% portables y deben salir de los mismos tokens.
- El `prefers-reduced-motion` de §7 es directo en CSS.
- Lo que no exista (exit animation de Android, fade nativo de iOS) simplemente no se simula: la web hace fade de opacidad y listo.

### Compartido en packages

- **Tokens de la escalera dark** (canvas / card / elevado / hairline / hairline-fuerte + los cuatro niveles de texto) como constantes compartidas, no hardcodeadas por plataforma.
- **Tabla de motion de la entrada** (duracion + delay por elemento + easing) compartida, para que RN y web escalonen igual.
- **Generador de tema estilo LCH** (§1) como candidato de mediano plazo para el white-label: `base` + `accent = theme.primary del coach` + `contrast`, resolviendo de una vez que ningun color de coach rompa la legibilidad en dark.

## 10 patrones accionables para EVA

1. **Un solo hex de canvas, cuatro capas.** Splash (light y dark), `windowBackground` de Android, root view/navigator y primer frame JS comparten el mismo `#07080C`. El flash no se arregla en el splash: se arregla eliminando toda superficie que no sea ese hex durante el arranque. (§3)
2. **Matar `ForceLightTheme` en la entrada.** Sustituirlo por un tema EVA dark fijo y no-branded. Se conserva la razon original (no heredar el color del ultimo coach) y desaparece el salto oscuro -> claro. (§3, diagnostico)
3. **Handoff por replica + fade, nunca por corte.** Primer frame JS = replica pixel-a-pixel del splash (mark 180, centrado, mismo fondo); `preventAutoHideAsync()` global, `hideAsync()` solo con la replica montada, `setOptions({ fade: true, duration: ~350 })`. (§3)
4. **Glow = gradiente radial amplio de bajo alpha, no blur saturado.** El contraste lo hace la diferencia de luminancia entre mark y canvas. Reusar `AmbientBrandGlow` y auditar su alpha contra halation. (§2)
5. **Escalera de superficies con hairlines, no sombras.** canvas -> card -> elevado, separados por bordes de 0.5-1px. Es lo que hace que dark se lea premium en vez de plano. (§1)
6. **Jerarquia asimetrica explicita en el selector**: alumno como card primaria rellena de alto contraste (es la mayoria y llega sin contexto), coach como card outline callada pero perfectamente legible. Dos primarios igualados duplican la deliberacion. La estructura ya existe en `index.tsx` — hay que preservarla al oscurecer. (§5)
7. **Una decision por pantalla, en lenguaje llano.** El selector no debe pedir nada mas que el rol; nada de campos, nada de terminos, nada de logos de terceros compitiendo. (§5, Phantom)
8. **El wordmark y el H1 son la imagen.** Escala grande, tracking negativo (~-0.02em), peso intermedio-alto, un solo acento cromatico. Sin ilustracion ni mascota. (§8)
9. **Presupuesto de novedad**: todo el motion expresivo se gasta en splash + selector; login, codigo de coach y reset son deliberadamente aburridos, familiares e instantaneos. (§4)
10. **Motion con guardarrailes y stagger corto**: 200-400ms ease-out, delays de 60-150ms, techo duro de 500ms, `useReducedMotion()` obligatorio en toda pieza nueva. Y el loader de la entrada debe ser una forma de marca que muta, no un spinner del sistema. (§7, §9)

## 3 anti-patrones

1. **Confiar en que "el splash ya es dark" alcanza.** Es la trampa exacta en la que EVA esta parada hoy: config nativa impecable y primer frame JS forzado a claro. El flash lo produce la capa que nadie audita — el tema de la app, el background del navigator, el `windowBackground` de Android. Auditar las cuatro capas o el "sin flash" es ficcion. (§3, diagnostico)

2. **Confundir "luminoso" con "glow saturado".** Blur fuerte y de color detras del logo, blanco puro sobre negro puro, sombras y glows apilados: eso es halation, produce halo, cansa la vista y en pantallas OLED se ve barato. Las mismas guias de dark mode que piden marca luminosa piden explicitamente moderacion con glows y contrastes filosos, y desaturar el acento. El premium sale de la escalera de superficies y de UN acento escaso, no de encender luces. (§1, §2)

3. **Convertir el walkthrough en un tour de features de 5 slides sin skip.** NN/G encontro que los tutoriales no mejoran el desempeno y recomienda evitarlos; el carrusel deck-of-cards esta desaconsejado explicitamente y lo primero que busca el usuario es el skip. Un walkthrough largo, auto-rotante o sin salida convierte el mejor momento de marca de la app en un peaje. Maximo 3 slides, skip visible desde el primero, y contenido de beneficio y no de features. (§6)

## Fuentes

- [Linear design system — Refero Styles](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1)
- [How we redesigned the Linear UI (part II) — Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [The strategy behind Dia's design — The Browser Company](https://browsercompany.substack.com/p/the-strategy-behind-dias-design)
- [Phantom Wallet Design Breakdown: How Web3 Onboards Non-Crypto Users — 925 Studios](https://www.925studios.co/blog/phantom-wallet-design-breakdown)
- [Sign in to or import an existing wallet into Phantom — Phantom Help](https://help.phantom.com/hc/en-us/articles/15079894392851-Sign-in-to-or-import-an-existing-wallet-into-Phantom)
- [Animated iOS Splash Screens: The Illusion Apple Actually Allows — DEV Community](https://dev.to/voinkoder/animated-ios-splash-screens-the-illusion-apple-actually-allows-52ej)
- [Splash screens — Android Developers](https://developer.android.com/develop/ui/views/launch/splash-screen)
- [Exploring Android 12: Splash Screen — M Farhan Majid, Medium](https://yggr.medium.com/exploring-android-12-splash-screen-21f88cc8e8f8)
- [Splash Screen API from Android — Mohit Rajput, Medium](https://medium.com/@mohitrajput987/splash-screen-api-from-android-f922ed0dd515)
- [SplashScreen — Expo Documentation](https://docs.expo.dev/versions/latest/sdk/splash-screen/)
- [How to Build Instagram-Style Splash Screens with Expo 52 — Andrew Chester, Medium](https://medium.com/@andrew.chester/how-to-build-instagram-style-splash-screens-with-expo-52-fdfd9855a110)
- [The 'White Flash' of Death: Solving Theme Flickering in React Native Production Apps — RipenApps, Medium](https://medium.com/@ripenapps-technologies/the-white-flash-of-death-solving-theme-flickering-in-react-native-production-apps-d732af3b4cae)
- [Launch Screen UI Design: Best practices, Design variants & Examples — Mobbin Glossary](https://mobbin.com/glossary/launch-screen)
- [Splash Screen Design: Best Practices, Examples, and Guidelines (2026) — UXPin](https://www.uxpin.com/studio/blog/splash-screen/)
- [Dark Mode UI Design: 7 Best Practices for Accessible Dark Themes — Atmos](https://atmos.style/blog/dark-mode-ui-best-practices)
- [The Designer's Guide to Dark Mode Accessibility — Accessibility Checker](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/)
- [Dark Mode UI: Essential Tips for Color Palettes and Accessibility — Wildnet Edge](https://www.wildnetedge.com/blogs/dark-mode-ui-essential-tips-for-color-palettes-and-accessibility)
- [Dark Mode UI/UX Design: Best Practices For Apps & Websites — Inkbot Design](https://inkbotdesign.com/dark-mode/)
- [Mastering Dark Mode UI: 9 Design Considerations You Can't Ignore — Five Jars](https://fivejars.com/insights/dark-mode-ui-9-design-considerations-you-cant-ignore/)
- [Mobile-App Onboarding: An Analysis of Components and Techniques — Nielsen Norman Group](https://www.nngroup.com/articles/mobile-app-onboarding/)
- [Designing Effective Carousels for Websites and Mobile Apps — Nielsen Norman Group](https://www.nngroup.com/videos/carousels-websites-mobile-apps/)
- [Usability Guidelines For Better Carousels UX — Smashing Magazine](https://www.smashingmagazine.com/2022/04/designing-better-carousel-ux/)
- [Onboarding UX Patterns: A Data-Backed Guide — Chameleon](https://www.chameleon.io/blog/onboarding-ux-patterns)
- [Multi-Role UX: The 2026 Guide to Platform Design — Createbytes](https://createbytes.com/insights/designing-ux-for-multi-role-platforms)
- [Designing Better Buttons: Placement and Cognitive Load — The UX Bit](https://designmybit.com/designing-better-buttons-placement-and-cognitive-load/)
- [CTA hierarchy — optimal website buttons for UX and CRO — NerdCow](https://nerdcow.co.uk/blog/cta-hierarchy/)
- [What I Learned From These Best Fintech Onboarding Processes — Userpilot](https://userpilot.com/blog/fintech-onboarding/)
- [Fintech Onboarding UX: Why 68% of Users Quit Before They Start — The Skins Factory](https://www.theskinsfactory.com/uiux-design-blog/fintech-onboarding-ux-design)
- [Mobile App Animation Guide: Timing, Easing, and What Works — Appy Pie](https://www.appypie.com/blog/mobile-app-animation-guide)
- [Motion Overview — Atlassian Design System](https://atlassian.design/foundations/motion)
- [Easing and duration — Material Design 3](https://m3.material.io/styles/motion/easing-and-duration)
- [Duration & easing — Material Design 1](https://m1.material.io/motion/duration-easing.html)
- [Perplexity Design System for React — pplxSans, teal #016a71 — shadcn.io](https://www.shadcn.io/design/perplexity)
- [Perplexity iOS App UI/UX animation catalog — 60fps.design](https://60fps.design/apps/perplexity)
- [Copilot Money Review (2026): Best Design at $95/yr — StackSwitch](https://stackswitch.app/review/copilot-money)
- [Revolut iOS Onboarding Flow — Mobbin](https://mobbin.com/explore/flows/70f2366e-3bb2-4745-84f5-fd7e98605cfb)
- [Revolut Onboarding (53 pantallas) — App Fuel](https://theappfuel.com/examples/revolut_onboarding)
- [N26 iOS — User Flow Recordings — Page Flows](https://pageflows.com/ios/products/n26/)
- [Arc Browser Onboarding Design — SaaSUI](https://www.saasui.design/pattern/onboarding/arc-browser)
