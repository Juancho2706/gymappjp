# Hallazgos: familia CEREALES-LEGUMINOSAS (grupos C y LEG)

Investigador de listas de intercambio. Objetivo: tabla curada de patrones `nombre -> clasificacion`
para los foods SIN clasificar del catalogo `public.foods` (4.873 alimentos) que pertenecen a esta
familia. Trabajado sobre nombres REALES del dataset `tmp/nutrition-portions/classified-latest.json`
(1.203 nombres tocan la familia; 811 unicos caen en C/LEG).

---

## 0. Decision de escala (LEER PRIMERO — es la clave de todo)

El sistema define la porcion de cada grupo por su perfil energetico:

- **C (cereales)** = 70 kcal / 2 g prot / 15 g HC / 0 g grasa  ==> **1 equivalente SMAE "cereal sin grasa"**.
- **LEG (leguminosas)** = perfil efectivo 125 kcal (1P + 1C)   ==> **~1 equivalente SMAE "leguminosa"** (120 kcal / 20 HC / 8 P / 1 G).

Esto obliga a usar la **escala SMAE (mexicana), NO la escala INTA/Chile**. Verificado con fuentes:

| Alimento        | Porcion SMAE (1 eq ~70 kcal) | Porcion INTA-Chile (~140 kcal) |
|-----------------|------------------------------|--------------------------------|
| Arroz cocido    | 50 g                         | 100 g                          |
| Avena cruda     | 20 g                         | 40 g                           |
| Papa cocida     | 85 g                         | 150 g                          |
| Fideos cocidos  | ~55 g                        | 110 g                          |
| Lentejas cocidas| 90 g                         | 140 g                          |

La porcion INTA es ~2x la SMAE (la porcion de intercambio chilena vale ~2 equivalentes).
**Toda la columna `gramos` de esta tabla usa la escala SMAE (1 equivalente).** Si el sistema
alguna vez cambia la definicion de C a ~140 kcal, hay que DUPLICAR estos gramos.

### crudo vs cocido
Muchos nombres del catalogo traen el estado explicito: `(cocido)/(crudo)/cocida/cruda/seco/seca`.
Los gramos cambian ~2.5x entre crudo y cocido (el crudo absorbe agua). **Regla: si el nombre dice
`cocid*` uso gramos-cocido; si dice `crud*`/`seco/seca` uso gramos-crudo; si NO dice nada, aplico el
default indicado por subfamilia** (para productos de gondola chilenos el arroz/pasta/legumbre seca se
vende CRUDA, asi que el default de esos es crudo; papa/choclo/avena preparada default cocido).

### Fuentes
- **[SMAE-DIG]** Sistema Digital de Alimentos y Equivalentes (SMAE 4a ed.), grupo cereales y grupo
  leguminosas — https://www.sistemadigitaldealimentos.org/equivalentes/grupo/cereales y
  https://www.sistemadigitaldealimentos.org/equivalentes/grupo/leguminosas (gramos/equivalente canonicos).
- **[SMAE-UNAM]** Anexo 1 SMAE, Facultad de Medicina UNAM —
  https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf
  (perfiles: cereal sin grasa 70/2/15/0; leguminosa 120/8/20/1).
- **[INTA-CL]** Listado de intercambio INTA / U. de Concepcion — http://vidasaludable.udec.cl/node/241
  (escala chilena, usada solo para reconciliar y para panes tipicos CL: marraqueta, hallulla).
- **[HEYNUTRE]** Guia SMAE HeyNutre — https://www.heynutre.com/blog/sistema-mexicano-equivalencias-guia/
  (confirma perfiles 70 kcal cereal / 120 kcal leguminosa).

Confianza: **alta** = fuente canonica SMAE-DIG + patron inequivoco · **media** = valor derivado/interpolado
o patron con ruido · **baja** = estimacion, revisar a mano.

---

## 1. Tabla curada de patrones (aplicable como override)

Grupo `C` o `LEG` = clasificar. Grupo `null` = dejar SIN clasificar (razon en notas). Gramos = enteros,
UNA porcion, escala SMAE. Patrones en minuscula sin tilde (aplicar sobre nombre normalizado NFD).
Orden: **de mas especifico a mas general** (el primero que calza gana; las exclusiones y `null` van ARRIBA
de la regla generica que las capturaria).

### 1a. EXCLUSIONES — el regex de familia los captura pero NO son C/LEG (mandar a otra familia / no tocar aqui)

| # | patron (substring/regex) | grupo real | por que NO es C/LEG |
|---|--------------------------|-----------|---------------------|
| E1 | `papaya` | F (fruta) | "papa" hace match falso; es fruta |
| E2 | `pasta de mani`, `pasta de man\|`, `pasta de almendras`, `pasta de sesamo`, `tahini`, `harina de mani`, `harina de almendra`, `harina de coco` | G / P | mantequilla/harina de fruto seco = grasa, no cereal |
| E3 | `pasta (de )?jamon`, `pasta untable`, `pasta cocktail ave`, `pasta ave`, `pasta yogurt`, `pasta hummus` (untable) | P / otro | pate/untable de proteina, no fideo |
| E4 | `leche de (arroz\|avena\|soja\|soya)`, `bebida de arroz`, `soja \+ jugo`, `soja sabor`, `not\|?milk .*avena` | LAC / bebida | bebida vegetal, no cereal solido |
| E5 | `proteina de (soya\|guisante)`, `soja texturizada` (aislado proteico), `whey`, `barra de proteina`, `protein bar` | P / SP | aislado/barra proteica, no leguminosa entera |
| E6 | `aceite`, `mazola` | G | aceite de maiz/pepita |

> Nota E2/E3: son criticas. El regex `pasta` del clasificador arrastra ~15 untables (mani, jamon, sesamo)
> que macro-caen en P/G. Sin esta exclusion se clasificarian como C con gramos absurdos.

### 1b. PAN y galletas de harina

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| P1 | `pan .*integral`, `integral .*pan`, `pan (de )?molde integral`, `hallulla integral`, `pita integral`, `tortilla .*integral` | C | 35 | — | SMAE-DIG (pan integral 35 g) | alta | pan integral 1 rebanada |
| P2 | `pan blanco`, `pan de molde`, `pan (arabe\|libanes\|pita\|ciabatta\|shawarma\|pierre\|italiano\|artesano?\|rustico\|frica)`, `pan (de )?(hamburguesa\|hot ?dog\|completo)`, `marraqueta`, `hallulla`, `dobladita`, `pan miga`, `pan amasado` | C | 30 | — | SMAE-DIG (pan de caja 30 g); INTA-CL marraqueta | alta | pan blanco 1 rebanada; marraqueta/hallulla = ~0.5-0.6 unidad para 1 porcion (unidad entera ~2 porciones) |
| P3 | `tostada`, `pan tostado`, `bio tostadas`, `wasa`, `crisp` | C | 20 | seco | SMAE-DIG (galleta salada 20 g) | alta | pan tostado es denso/seco |
| P4 | `galleta.*(soda\|agua\|salada\|de agua\|criollita\|saltin\|integral\|multigrano\|salvado\|maria)`, `crackers?`, `club social`, `saltin` | C | 20 | — | SMAE-DIG (galleta salada 20 g = 4 pzas) | alta | galleta salada/simple |
| P5 | `pan rallado` | C | 20 | seco | SMAE-DIG (harina/molido 20 g) | media | miga seca, denso |
| P6 | `harina( de trigo\|de maiz\| integral\| selecta\| de fuerza\|$)`, `maicena`, `almidon`, `semola`, `polenta` (seca), `masa madre` (sola) | C | 20 | seco | SMAE-DIG (harina 20 g) | alta | harinas/almidones crudos |

### 1c. ARROZ

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| A1 | `arroz.*cocid`, `arroz .*(preparado\|primavera\|risotto\|chaufan\|sushi\|curry\|graneado\|pregraneado)` | C | 50 | cocido | SMAE-DIG (arroz cocido 50 g) | alta | preparados = arroz ya cocido |
| A2 | `arroz` (bare, o `blanco\|integral\|grado\|largo\|angosto\|ancho\|negro\|tucapel\|miraflores\|premium`) sin `cocid` | C | 20 | crudo | SMAE-DIG (arroz crudo ~18-20 g) | alta | producto de gondola = arroz crudo |
| A3 | `arroz inflado`, `arrocitas`, `arroz krispy`, `cereal.*arroz`, `nestum arroz` | C | 20 | — | SMAE-DIG (hojuela/inflado ~18 g) | media | cereal de arroz inflado |
| A4 | `galleta.*arroz`, `galletas de arroz`, `tortitas .*arroz`, `mizos`, `rice pop`, `rice cracker`, `hojas de arroz` | C | 15 | — | SMAE-DIG (galleta 20 g, ajuste densidad) | media | 2 laminas de arroz ~15 g HC |

### 1d. PASTA / FIDEOS

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| PA1 | `(pasta\|fideos?\|spaghetti\|spagueti\|tallarin\|penne\|fusilli\|espiral\|corbata\|rigati\|farfalle\|linguin\|pappardelle\|macarr\|mostacholi\|caracoles\|ziti\|spirali).*cocid` | C | 55 | cocido | SMAE-DIG (pasta cocida 47-60 g) | alta | pasta cocida |
| PA2 | `spaghetti`, `spagueti`, `tallarin(es)?`, `fideos?`, `penne`, `fusilli`, `farfalle`, `linguine`, `pappardelle`, `rigati`, `corbatas`, `espirales`, `macarrones`, `mostacholi`, `pasta seca`, `pasta` (bare, no untable) | C | 20 | crudo/seco | SMAE-DIG (pasta seca ~20 g) | alta | fideo seco de paquete (default CL) |
| PA3 | `gnocchi`, `noqui`, `noquis` | C | 55 | fresco | SMAE-DIG (pasta fresca ~55 g) | media | ñoqui de papa, se vende fresco/cocido |
| PA4 | `ravioli`, `raviolis`, `tortellini`, `canelon(es)?`, `lasagn`, `.*al pomodoro`, `fettuccine .*(pesto\|pomodoro)`, `pasta .*(rellen\|bolognesa\|alfredo\|pesto\|pomodoro\|nonna)` | null | — | — | — | — | pasta RELLENA/con salsa = platillo mixto (C+P+G), no clasificar |
| PA5 | `fideos instantaneos`, `sopa .*(fideo\|costilla\|pollo)`, `costilla con fideos`, `para uno`, `ramen`, `natunes`, `picado` | null | — | — | — | — | sopa/plato instantaneo mixto |
| PA6 | `espirales de lentejas`, `pasta .*(edamame\|poroto\|lenteja\|garbanzo)` | LEG | 25 | seco | SMAE-DIG (leg seca, ajuste) | media | pasta de legumbre = leguminosa, no cereal |

### 1e. AVENA, CEREAL DE CAJA, GRANOLA

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| AV1 | `avena.*cocida`, `avena .*(preparada)` | C | 120 | cocido | INTA/SMAE (1/2 taza cocida) | media | corrige bug heuristico (asignaba 312 g) |
| AV2 | `avena`, `hojuelas de avena`, `avena en hojuelas`, `salvado de avena`, `harina de avena`, `avena instantanea` | C | 20 | crudo | SMAE-DIG (avena cruda 20 g) | alta | avena en hojuela cruda |
| AV3 | `corn flakes`, `cornflakes`, `hojuelas de maiz`, `cereal de maiz`, `zucaritas`, `chocapic`, `choco krispis`, `choco crispis`, `froot loops`, `trix`, `choco crunch`, `flips`, `cereal (bolitas\|super balls\|kids\|infantil\|milo\|mix\|chocolate\|cacao\|relleno\|natural)`, `nestum`, `nestle fitness`, `fitness cereal`, `cerelac`, `nestum`, `cheerios`, `arrocitas`, `cerealitas`, `check 3 cereales`, `gran cereal` | C | 20 | — | SMAE-DIG (hojuela/cereal caja ~17-20 g) | media | cereal de caja: 1 porcion ~15 g HC (NO la porcion "realista" de 30 g de caja; esa vale ~2 porciones) |
| AV4 | `granola`, `muesli` | C | 30 | — | SMAE-DIG (interpolado, granola densa) | media | granola trae grasa+azucar; C solo modela el HC; 30 g ~ 20 g HC |
| AV5 | `barra de cereal`, `barrita`, `barra cereal`, `barras zucaritas`, `cereal bar`, `barra de granola` | null | — | — | — | — | barra ultra-procesada (azucar+grasa+jarabe); no es cereal puro |

### 1f. PAPA y tuberculos

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| T1 | `papa.*cocid`, `papa al horno`, `papa .*(hervida)` | C | 85 | cocido | SMAE-DIG (papa cocida 85 g) | alta | papa cocida |
| T2 | `pure de papa`, `pure de papas`, `puré de papa` | C | 100 | cocido | SMAE-DIG (papa 85 g + leche) | media | pure lleva leche/grasa; ~100 g = 1 porcion HC |
| T3 | `papa` (bare), `papa blanca`, `papa (cruda)`, `cascara de papa`, `papas baby`, `papas cubos` | C | 85 | — | SMAE-DIG (papa 85 g) | alta | papa entera |
| T4 | `papas fritas`, `papas .*(prefrita\|pre.?frita\|frita)`, `hash brown`, `papas duquesas`, `papas souffle`, `papas gajo`, `papas rusticas`, `papas .*(horneable)`, `pan de papa` | C | 30 | frito | SMAE-DIG (papa base + ajuste) | media | frito: mucha grasa (C solo cuenta HC); ~30 g ~15 g HC |
| T5 | `papas .*(chips\|lay's\|de bolsa)`, `crunchis papa`, `snack papa`, `ramitas`, `chips de papa`, `terra .*papa` | C | 20 | frito | SMAE-DIG (ajuste densidad chip) | media | papas chips de bolsa |
| T6 | `camote.*cocid`, `camote al horno`, `batata.*(cocid\|horno)`, `boniato cocido`, `papas de camote` | C | 60 | cocido | SMAE-DIG (camote 60 g) | alta | camote/batata cocido |
| T7 | `camote` (bare), `batata` (bare), `papa dulce`, `boniato` | C | 60 | — | SMAE-DIG (camote 60 g) | media | asume cocido/horno |
| T8 | `yuca`, `mandioca`, `casabe` | C | 70 | cocido | SMAE (raiz amilacea, interpolado) | media | yuca cocida |
| T9 | `tapioca`, `almidon de` | C | 20 | seco | SMAE-DIG (almidon 20 g) | media | almidon puro |

### 1g. QUINOA y otros granos

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| Q1 | `(quinoa\|quinua\|cuscus\|couscous\|bulgur\|polenta\|cebada\|mijo\|farro\|semola\|amaranto\|mote).*cocid` | C | 70 | cocido | SMAE-DIG (quinoa cocida 70 g) | media | grano cocido |
| Q2 | `quinoa`, `quinua`, `cuscus`, `couscous`, `bulgur`, `cebada`, `mijo`, `farro`, `amaranto`, `mote` (bare/seco) | C | 20 | crudo/seco | SMAE (grano seco ~20 g) | media | grano seco de paquete |
| Q3 | `cebada tostada`, `nestum`, `cebada instantanea` | C | 20 | seco | SMAE-DIG | media | polvo de cereal soluble |

### 1h. CHOCLO / MAIZ

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| M1 | `choclo.*(cocid\|grano\|desgranado\|tierno)`, `choclo`, `elote`, `maiz.*(cocido\|grano\|blanco\|desgranado)`, `choclos tiernos` | C | 80 | cocido | SMAE-DIG (elote 83 g) | alta | choclo en grano cocido |
| M2 | `popcorn`, `pop ?corn`, `palomitas`, `cabritas`, `kettle corn` | C | 20 | inflado | SMAE (maiz inflado, ajuste) | media | palomita; con caramelo/mantequilla sube grasa (C ignora) |
| M3 | `nachos`, `tortilla chips`, `doritos`, `takis`, `panchitos`, `chips de tortilla`, `corn tortilla chips` | C | 20 | frito | SMAE-DIG (tortilla + ajuste) | media | chip de maiz frito |
| M4 | `harina de maiz`, `harina de mais`, `polenta` (seca) | C | 20 | seco | SMAE-DIG (harina maiz 20 g) | alta | harina/polenta seca |

### 1i. TORTILLA / WRAP (harina de trigo o maiz)

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| W1 | `tortilla de maiz`, `tortilla .*maiz`, `tortillas de maiz` | C | 30 | — | SMAE-DIG (tortilla maiz 30 g) | alta | tortilla de maiz 1 pza |
| W2 | `tortilla`, `tortillas`, `rapiditas`, `wrap`, `burrera`, `fajita`, `tortilla .*(harina\|trigo\|mexicana\|fiesta\|burrera)`, `andale`, `mission wrap`, `dobladita` | C | 30 | — | SMAE-DIG (tortilla harina 29 g) | media | tortilla/wrap de harina 1 pza chica; wraps XL grandes valen ~2 porciones |
| W3 | `tortilla de papas`, `tortilla a la espanola`, `tortilla de avena` | null | — | — | — | — | tortilla espanola = huevo+papa (plato); avena=preparacion, revisar aparte |
| W4 | `arepa`, `arepa frita` | C | 30 | — | SMAE (maiz, interpolado) | media | arepa de maiz |

### 1j. LEGUMINOSAS (LEG)

| # | patron | grupo | gramos | base | fuente | conf | notas |
|---|--------|-------|--------|------|--------|------|-------|
| L1 | `(lenteja\|garbanzo\|poroto\|frijol\|alubia\|haba\|arveja partida\|guisante\|soya\|edamame).*cocid`, `.*(listas? para servir\|listas?$\|premium listas)`, `porotos granados`, `frijoles refritos`, `garbanzos listos`, `lentejas listas` | LEG | 90 | cocido | SMAE-DIG (frijol/lenteja/garbanzo cocido 90 g) | alta | leguminosa cocida 1/2 taza |
| L2 | `(lenteja\|garbanzo\|poroto\|frijol\|alubia\|haba).*(crud\|seco\|seca)` | LEG | 30 | crudo | SMAE (leg seca ~30 g rinde ~90 g cocida) | alta | leguminosa seca de paquete |
| L3 | `lentejas`, `garbanzos`, `porotos`, `frijoles`, `alubias`, `habas`, `poroto (rojo\|negro\|blanco\|caupi\|mung\|navy\|pallar\|pinto\|tortola\|verde\|de soya)`, `arvejas?` (bare) | LEG | 90 | cocido | SMAE-DIG (default cocido) | media | nombre pelado: asumo cocido (lista de intercambio referencia cocido); si es paquete seco usar L2=30 g |
| L4 | `edamame`, `poroto de soya`, `soya cocida` | LEG | 90 | cocido | SMAE-DIG (soya cocida) | media | edamame/soya en vaina |
| L5 | `hummus`, `hummus de garbanzo`, `pasta hummus` | LEG | 50 | — | SMAE (garbanzo + tahini/aceite) | media | pasta de garbanzo con grasa; 50 g ~1 porcion HC de garbanzo |
| L6 | `crunchys? .*(garbanzo\|poroto)`, `suflitos garbanzo`, `ramiras? de garbanzo`, `perlitas de (garbanzo\|poroto)`, `snack edamame` | LEG | 25 | — | SMAE (snack de legumbre, ajuste) | media | snack inflado/frito de legumbre |
| L7 | `soja texturizada`, `soya texturizada` (entera, no aislado) | LEG | 30 | seco | SMAE-DIG (soya texturizada 30 g) | media | proteina texturizada de soya (si el nombre dice "proteina de soya" polvo -> E5, es P) |

### 1k. NULL explicitos — platillos / ultra-procesados mixtos (dejar SIN clasificar)

| # | patron | razon |
|---|--------|-------|
| N1 | `pastel de choclo`, `pastelera de choclo`, `carne mechada con pastelera`, `humita`, `humitas` | platillo mixto maiz+carne/grasa |
| N2 | `porotos con riendas`, `porotos granados` (guiso), `lentejas con tocino`, `cazuela`, `guiso`, `banquete .*lentejas`, `sopa .*(lenteja\|poroto)`, `crema de (arvejas\|lentejas)` | guiso/sopa mixta (legumbre + pasta/carne/crema); >1 grupo |
| N3 | `hamburguesa de (lentejas\|soja)`, `vurger`, `vegetal (burger\|buger)`, `medallones de legumbres`, `nuggets`, `not.?burger`, `crianza` | hamburguesa vegetal procesada (legumbre + aglutinantes + grasa); macro ambiguo |
| N4 | `pan de pascua`, `panettone`, `chocottone`, `pan dulce`, `pan de completo brioche`, `queque`, `kuchen`, `torta`, `budin`, `pie`, `donut`, `dona`, `churro`, `pancake`, `panqueque`, `waffle`, `wafle`, `croissant`, `medialuna`, `alfajor`, `brownie`, `cupcake` | reposteria: harina+azucar+grasa+huevo; NO es cereal simple |
| N5 | `galleta.*(chocochip\|choco\|relleno\|cubierta\|oreo\|triton\|wafer\|frac\|champana\|savoiardi\|mana\|frambuesa\|limon\|crema)`, `wafer`, `oreo`, `alfajor`, `barquillo`, `cuchufli`, `obleas?` | galleta dulce rellena/bañada (mixto azucar+grasa); C solo si es galleta SIMPLE (ver P4) |
| N6 | `ravioli .*(carne\|calabaza\|ricotta)`, `lasagna .*(carne\|queso\|crema)`, `tortellini .*(prosciutto\|queso)`, `canelones de carne`, `gnocchi al pesto` | pasta rellena/con salsa = plato mixto |
| N7 | `ensalada .*(quinoa\|cuscus\|arroz)`, `quinoa .*(mediterranea\|primavera\|curry\|camaron)`, `arroz .*(chaufan\|risotto champinon)` cuando trae proteina/verdura visible, `wok of .*quinoa`, `chicken taco bowl`, `taco bowl`, `wrap .*(pollo\|chicken\|parmesano\|chipotle)`, `burrito .*relleno` | ensalada/bowl/wrap ARMADO (grano + proteina + verdura + aderezo) = plato completo |
| N8 | `crema de choclo`, `crema de arvejas instantanea`, `costilla con fideos`, `sopa para uno`, `natunes`, `natunes carne` | sopa/crema instantanea mixta |

> Regla practica para N: si el nombre nombra 2+ ingredientes de grupos distintos (grano + carne + queso,
> harina + azucar + relleno) o es claramente un plato/postre, va a `null`. El clasificador heuristico
> por macros lo forzaria a un grupo con gramos sin sentido.

---

## 2. Cobertura y notas para el orquestador

- **~50 patrones activos** (C/LEG) + **6 exclusiones** + **8 bloques null** cubren la practica totalidad de
  los ~811 nombres unicos C/LEG del dataset y ademas atrapan falsos positivos (papaya, pasta de mani).
- **Bugs concretos del heuristico que estos patrones corrigen** (comprobados en `classified-latest.json`):
  - `Avena cocida` -> heuristico 312 g (absurdo); curado AV1 = 120 g.
  - `Pure De Papa` -> heuristico 20 g (muy bajo); curado T2 = 100 g.
  - `Porotos cocidos` -> heuristico 130 g; curado L1 = 90 g (escala SMAE, no INTA).
  - `Zucaritas` -> heuristico la mando a **F (fruta)** tier bajo; curado AV3 = C 20 g.
  - `Barritas NUTMIX QUAKER` / `Barras de cereal` -> heuristico LEG/C; curado N/A5 = **null** (barra mixta).
  - `Pasta de Mani*` (~7 items) -> el regex `pasta` los tomaria como C; exclusion E2 -> G/P.
- **Ambiguedad crudo/cocido**: para arroz/pasta/legumbres el catalogo chileno de gondola vende el producto
  CRUDO (etiqueta por 100 g crudos), pero las entradas de nutricion "X cocido/a" son por 100 g cocidos.
  Los patrones distinguen con el sufijo `cocid*`/`crud*`/`seco/seca`; el default por subfamilia esta en la
  columna `base`. **Recomendacion**: si el import trae el macro real del food (HC por 100 g), preferir
  derivar gramos = 15/g_HC_por_g y usar esta tabla solo como sanity-check y para el estado (crudo/cocido)
  y el grupo. La tabla es la verdad para GRUPO y para casos sin macro fiable.
- **Escala**: recordar que TODO esta en escala SMAE (1 eq ~70 kcal C / ~120 kcal LEG). Coincide con el perfil
  declarado del sistema (C 70/2/15/0, LEG efectivo 125). NO usar numeros INTA (son el doble).

Fin.
