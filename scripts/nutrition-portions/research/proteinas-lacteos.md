# Investigacion listas de intercambio — familia PROTEINAS / LACTEOS (grupos P, LAC, SP)

Fecha: 2026-07-18 · Investigador: subagente porciones-f1
Dataset base: `tmp/nutrition-portions/classified-latest.json` (dry-run sobre 4.873 foods).
Alcance: patrones nombre -> clasificacion para foods SIN clasificar de esta familia.

> Regla dura del pipeline: las 711 filas ya aplicadas (tier alto + manuales) JAMAS se pisan.
> Esta tabla es guia curada para el applier / revision CEO; los gramos son la porcion de
> intercambio canonica de referencia (el driver deriva gramos por-food desde macros, esta
> tabla los ancla y detecta los casos donde la heuristica se equivoca).

---

## 0. Perfiles del sistema (seed V1) y su equivalencia canonica

| Grupo | Perfil seed (kcal/P/C/G) | Equivalente canonico | Fuente |
|---|---|---|---|
| **P** (proteinas bajo grasa) | 55 / 7 / 0 / 3 | 1 equivalente AOA = **7 g proteina** (ADA "lean meat"; SMAE AOA "bajo aporte de grasa" 55 kcal/7P/3G) | ADA Exchange Lists; SMAE AOA |
| **LAC** (lacteo) | 95 / 9 / 12 / 2 | 1 equivalente leche = **240 ml** descremada (95 kcal/9P/12C/2G — calza EXACTO con SMAE leche descremada) | SMAE lacteos; ADA milk |
| **SP** (scoop proteina) | 120 / 24 / 2 / 1 | 1 scoop de suplemento = **~24 g proteina** (~30 g de polvo whey/isolate) | perfil seed + etiquetas whey estandar |

Referencias canonicas de la porcion de intercambio (7 g proteina para P; 9 g / 12 g CHO para LAC):

- **ADA / Diabetic Exchange Lists**: 1 intercambio de carne = **1 oz (28 g) cocida**, 7 g proteina; categorias very-lean/lean/medium-fat/high-fat (0/3/5/8 g grasa, 45-100 kcal). 1 intercambio de leche = 240 ml, 8 g P / 12 g CHO. Fuente: https://diabetesed.net/wp-content/uploads/2026/03/THE-DIABETIC-EXCHANGE-LIST.pdf
- **SMAE (Sistema Mexicano de Alimentos Equivalentes)** — AOA en 4 subgrupos por grasa, todos **7 g proteina/equivalente**: A muy bajo 40 kcal/1G · B bajo 55 kcal/3G · C moderado 75 kcal/5G · D alto 100 kcal/8G. Fuente: https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf y https://www.heynutre.com/blog/sistema-mexicano-equivalencias-guia/
- **SMAE AOA muy bajo (40 kcal, 7 g P)** — ejemplos de 1 equivalente: **35 g bistec/carne magra cocida · 40 g queso panela · 1/3 lata de atun · 5 camarones · 2 rebanadas de jamon · 1 huevo**. Fuente: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/origen_animal (grupo AOA)
- **SMAE lacteos**: leche entera 240 ml · semidescremada 250 ml · descremada 245 ml · yoghur natural leche entera 230 g · yogurt natural descremado ~150 ml · yogurt griego alto en proteina 1/3 taza (~80 ml concentrado). Fuente: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/lacteos
- **SMAE quesos** (1 equivalente): panela **40 g** · Oaxaca/fresco **30 g** · manchego (alto grasa) **25 g** · parmesano grasa reducida **20 g** · cheddar ~30 g. Fuentes: https://www.sistemadigitaldealimentos.org/equivalentes/alimentos/Queso_panela/3089/al · https://www.sistemadigitaldealimentos.org/equivalentes/alimentos/Queso_oaxaca/3088/al · https://www.heynutre.com/tabla-equivalencias-smae/

Convencion de gramos de esta tabla: **carnes/pescados/mariscos = porcion COCIDA** (~30 g, ADA 28 g + SMAE 35 g); cuando el nombre indica crudo (o cortes al peso crudo) la porcion sube a ~40 g. Se anota por fila.

---

## 1. GRUPO P — carnes, aves, pescados, mariscos, huevo, cecinas magras

Cada porcion = ~7 g proteina. Patrones normalizados (minusculas, sin tildes, substring salvo que se marque regex).

### 1.1 Carnes rojas magras (vacuno, cerdo, cordero) — ALTA confianza

| # | Patron (substring/regex es-CL, en) | Grupo | Gramos 1 porcion | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P1 | `posta` (negra/rosada/paleta) | P | 30 | SMAE AOA 35 g bistec cocido; ADA 28 g | alta | cocida; cruda ~40 |
| P2 | `lomo liso`, `lomo vetado`, `filete`, `solomillo` | P | 30 | ADA lean 28 g cocido | alta | cortes magros vacuno/cerdo |
| P3 | `bistec`, `bife`, `churrasco`, `sobrecostilla`, `plateada`, `asado de tira`, `punta` | P | 30 | SMAE AOA 35 g bistec | alta | cocido |
| P4 | `carne molida`, `pulpa`, `molida` + (vacuno/pavo/pollo) | P | 30 | SMAE/ADA lean-medium | alta | 80/20 sube grasa; 90/10+ = magra |
| P5 | `cerdo`, `pork`, `chuleta`, `pulpa de cerdo`, `pernil`, `lomo de cerdo` | P | 30 | ADA lean 28 g | alta | chuleta con hueso pesa mas |
| P6 | `cordero`, `lamb` (magro) | P | 30 | ADA lean | media | cordero suele ser medium-fat |
| P7 | `higado`, `liver`, `riñon`, `menudencia`, `pana`, `corazon` | P | 30 | SMAE visceras muy bajo/moderado | alta | cocido |
| P8 | `carne` (generico sin cecina) | P | 35 | SMAE AOA | media | crudo/generico |

### 1.2 Aves (pollo, pavo) — ALTA confianza

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P9 | `pechuga` (pollo/pavo, sin piel) | P | 30 | ADA very-lean 28 g cocido | alta | cruda ~40 |
| P10 | `pollo`, `chicken` (trutro/muslo/ala/pierna/entero) | P | 30 | SMAE AOA | alta | con piel sube grasa |
| P11 | `pavo`, `turkey` (molido/filete) | P | 30 | ADA very-lean | alta | |
| P12 | `filetito`, `filetitos de pollo`, `deshuesad` (pollo/pavo) | P | 30 | ADA | alta | |

### 1.3 Pescados y mariscos — ALTA confianza

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P13 | `merluza`, `reineta`, `congrio`, `corvina`, `tilapia`, `pejerrey`, `blanco fileteado` | P | 35 | SMAE AOA muy bajo (pescado magro) | alta | pescado magro cocido |
| P14 | `salmon`, `atun` fresco, `jurel`, `sardina`, `caballa`, `trucha`, `albacora` | P | 30 | SMAE AOA (pescado graso ~medium) | alta | graso: 30 g |
| P15 | `atun` (lata/lomitos/en agua/en aceite), `jurel en lata`, `sardina en lata` | P | 30 | SMAE 1/3 lata de atun = 1 equiv | alta | drenado |
| P16 | `pescado`, `fish`, `filete de pescado` (generico) | P | 35 | SMAE AOA | alta | |
| P17 | `camaron`, `shrimp`, `langostino`, `gamba` | P | 40 | SMAE 5 camarones = 1 equiv | alta | cocidos |
| P18 | `choro`, `mejillon`, `almeja`, `ostion`, `ostra`, `loco`, `jaiba`, `pulpo`, `calamar`, `machas`, `marisco`, `seafood` | P | 40 | SMAE AOA mariscos | alta | cocidos |
| P19 | `surimi`, `kanikama`, `kani`, `palito de mar` | P | 45 | ADA (pescado procesado + almidon) | baja | lleva CHO anadido; revisar |

### 1.4 Huevo — ALTA confianza

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P20 | `huevo`, `egg` (entero) | P | 50 | SMAE 1 huevo = 1 equiv AOA (moderado grasa) | alta | 1 unidad ~50 g; aporta grasa |
| P21 | `clara`, `egg white`, `claras de huevo` | P | 60 | SMAE clara AOA muy bajo | alta | ~2 claras; casi puro P |
| P22 | `tortilla de huevo`, `omelet` (sin relleno) | P | 50 | derivado huevo | media | |

### 1.5 Cecinas / embutidos MAGROS — media/alta

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P23 | `jamon de pavo`, `jamon pierna`, `jamon cocido`, `jamon magro`, `jamon acaramelado` | P | 40 | SMAE 2 rebanadas jamon = 1 equiv | alta | jamon cocido magro |
| P24 | `jamon serrano`, `jamon crudo`, `prosciutto`, `pastrami` | P | 30 | SMAE AOA (crudo curado, mas denso) | media | mas sodio/grasa |
| P25 | `jamon`, `ham` (generico) | P | 40 | SMAE 2 rebanadas | media | |
| P26 | `pechuga de pavo` fiambre, `lomito` (fiambre magro) | P | 40 | SMAE jamon | media | |

### 1.6 Cecinas GRASAS (SMAE AOA alto aporte de grasa, 100 kcal / 7 P / 8 G)

Decision (fuente SMAE): siguen siendo **P** (origen animal, 7 g proteina/porcion) pero con grasa alta; el
perfil P del seed (3 g grasa) SUBESTIMA su energia. Se clasifican P con confianza BAJA y nota; el CEO
puede preferir dejarlas null. Gramos ~porcion que aporta 7 g P (~25-30 g).

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| P27 | `salchicha`, `vienesa`, `frankfurter`, `hot dog` (carne) | P | 30 | SMAE AOA alto grasa | baja | grasa alta; energia subestimada |
| P28 | `salame`, `salami`, `pepperoni` | P | 25 | SMAE AOA alto grasa | baja | muy denso en grasa |
| P29 | `chorizo`, `longaniza`, `chistorra` | P | 30 | SMAE AOA alto grasa | baja | |
| P30 | `mortadela`, `arrollado`, `malaya`, `queso de cabeza` | P | 30 | SMAE AOA alto grasa | baja | |
| P31 | `nugget`, `apanado`, `croqueta` (pollo/pescado) | P | 40 | ADA (proteina + apanado CHO/grasa) | baja | lleva C y G anadidos |
| P32 | `hamburguesa` + (vacuno/carne/pollo/pavo/salmon/merluza/res) | P | 40 | ADA medium-fat patty | media | patty carnico |

---

## 2. GRUPO LAC — leches, yogures, quesillos, quesos

Cada porcion LAC = 9 g P / 12 g CHO (perfil leche descremada). Orden: LAC gana a ARL/G por token `leche`/`queso`.

### 2.1 Leches liquidas — ALTA

| # | Patron | Grupo | Gramos/ml | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| L1 | `leche descremada`, `leche semidescremada`, `leche entera`, `leche sin lactosa`, `leche natural`, `milk` (lactea) | LAC | 240 | SMAE leche 240-245 ml; ADA 240 ml | alta | 1 taza |
| L2 | `leche cultivada`, `kefir`, `kumis`, `leche fermentada` | LAC | 240 | SMAE leche cultivada | alta | 1 taza |
| L3 | `leche en polvo` (lactea, descremada/semi) | LAC | 30 | SMAE (reconstituye a ~1 taza) | media | 30 g polvo = 1 equiv |
| L4 | `leche evaporada` (lactea) | LAC | 120 | SMAE (concentrada ~2x) | media | media taza |
| L5 | `leche` chocolatada/`saborizada`/`con chocolate`/`break`/`capuccino`/`suizo` | LAC | 200 | SMAE + azucar anadida | baja | CHO extra; considerar null |

### 2.2 Yogures — ALTA

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| L6 | `yogur`/`yoghurt`/`yogurt` natural, batido, bebible, descremado | LAC | 200 | SMAE yoghur natural 230 g / descremado ~150 | alta | ~1 taza |
| L7 | `yogur griego`, `yoghurt griego`, `islandes`, `skyr`, `proteico`, `protein plus`, `protein+` (yogurt) | LAC | 150 | SMAE griego alto proteina (concentrado) | alta | mas proteina/menos volumen |
| L8 | `oikos`, `quillayes griego`, `yoplait griego` | LAC | 150 | marca griego | alta | |

### 2.3 Quesos frescos/blandos — ALTA

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| L9 | `quesillo`, `queso fresco`, `queso panela`, `ricotta`, `requeson`, `queso cottage`, `queso de cabaña`, `queso campo`, `queso batido` | LAC | 40 | SMAE queso panela 40 g | alta | |
| L10 | `queso mantecoso`, `gauda`, `gouda`, `chanco`, `edam`, `maasdam`, `mozzarella`, `laminado`, `mantecoso`, `queso de cabra`, `feta` | LAC | 30 | SMAE Oaxaca/semimaduro 30 g | alta | semiduro |
| L11 | `queso proteina`, `queso probiotico light`, `queso reducido en calorias` | LAC | 40 | SMAE queso panela (variantes light) | media | |

### 2.4 Quesos duros/rallados — ALTA (porcion pequena)

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| L12 | `parmesano`, `reggianito`, `romano`, `grana`, `pecorino`, `rallado` (fino) | LAC | 20 | SMAE parmesano grasa reducida 20 g | alta | muy concentrado |
| L13 | `queso maduro`, `manchego`, `emmental`, `gruyere`, `provolone` | LAC | 25 | SMAE manchego 25 g (alto grasa) | alta | |
| L14 | `cheddar`, `queso amarillo`, `queso crocante` (chip de queso) | LAC | 30 | SMAE cheddar ~30 g | media | |

---

## 3. GRUPO SP — proteina en polvo / suplementos

Porcion = 1 scoop ~24 g proteina (~30 g de polvo). SP gana a P/LAC por tokens `whey`/`isolate`/`scoop`.

| # | Patron | Grupo | Gramos | Fuente | Confianza | Nota |
|---|---|---|---|---|---|---|
| S1 | `whey`, `whey protein`, `proteina de suero`, `concentrado de suero`, `aislado de suero` | SP | 30 | perfil seed SP (24 g P) + scoop whey estandar | alta | 1 scoop |
| S2 | `isolate`, `aislado`, `hydrolyzed protein`, `hidrolizado` | SP | 30 | scoop isolate ~90% P | alta | |
| S3 | `caseina`, `casein`, `micelar` | SP | 33 | scoop caseina | alta | |
| S4 | `proteina en polvo`, `protein powder`, `vegan protein`, `proteina vegetal en polvo`, `pea protein powder` | SP | 33 | scoop proteina vegetal (~70-75% P) | alta | vegano rinde mas gramos |
| S5 | `scoop`, `mass gainer`, `ganador de masa`, `gainer` | SP | 30 | scoop base | media | gainer lleva mucho CHO; revisar |
| S6 | `100% whey`, `just protein`, `pro whey`, `muscle whey` | SP | 30 | marca whey | alta | |

> Nota: NO confundir con `yoghurt protein plus` / `leche protein` (son LAC con proteina anadida, no polvo)
> ni con `barra de proteina` (mixto -> null, seccion 4).

---

## 4. NULL EXPLICITO — no calzan (mixtos, ultraprocesados, no-lacteos)

Quedan SIN clasificar (group=null). La heuristica actual los fuerza a un grupo con gramos absurdos
(ej. `leche de avena` -> LAC 1800 g; `whey alfajor` -> SP 150 g): estos patrones los DES-clasifican.

| # | Patron | Razon (por que null) | Fuente/nota |
|---|---|---|---|
| N1 | `leche de almendras`, `leche de coco`, `leche de arroz`, `almond milk`, `coconut milk`, `rice milk` | Bebida vegetal: proteina ~0-1 g, NO es lacteo; el perfil LAC (9 g P) la distorsiona | SMAE: no es del grupo lacteo |
| N2 | `not milk`, `notmilk`, `milk excellence` (NotCo), `leche vegetal` | Bebida vegetal mezcla; proteina baja/variable | NotCo plant-based |
| N3 | `leche de soya`, `leche de soja`, `soy milk` | Bebida de soya: proteina moderada pero NO lacteo; iria a LEG-derivado, mejor null hasta revision | SMAE leguminosa, no lacteo |
| N4 | `leche de avena`, `oat milk` | Bebida de avena: casi todo CHO (grupo C), no LAC | mejor null o C manual |
| N5 | `leche condensada`, `condensed milk` | Postre azucarado (~55% azucar); no es porcion de leche | dessert |
| N6 | `leche asada`, `arroz con leche`, `flan`, `manjar`, `dulce de leche`, `quesillo con caramelo` (postre) | Postre lacteo mixto (azucar+huevo); no es intercambio limpio | dessert |
| N7 | `queso crema`, `crema` (de leche/acida/para batir/chantilly), `crema de leche`, `queso philadelphia` | Predomina GRASA (no 9 g P): distorsiona LAC; iria a ARL/G, dejar null hasta curar | SMAE queso crema = 110 g (es grasa) |
| N8 | `queso vegano`, `vegan cheese`, `queso de castañas` | No lacteo; base de aceite/almidon | plant-based |
| N9 | `tocino`, `bacon`, `panceta`, `tocineta` | Predomina grasa (no aporta 7 g P limpio); iria a ARL/G | SMAE lo trata como grasa/AOA alto |
| N10 | `pate`, `pâté`, `foie` | Predomina grasa; proteina baja por porcion | |
| N11 | `prieta`, `morcilla` | Mixto sangre+grasa+cereal | |
| N12 | `barra de proteina`, `barrita`, `protein bar`, `whey bar`, `wild protein` (barra), `alfajor de proteina`, `galleta protein`, `cookie protein`, `protein cookie` | Mixto (proteina + CHO + grasa + fibra): no es scoop ni carne | procesado mixto |
| N13 | `milkshake`, `batido` (comercial listo), `slim system`, `helado` (proteico o no) | Bebida/postre mixto | |
| N14 | `pizza`, `sopa`, `crema de` (zapallo/esparragos/verdura), `empanada`, `sandwich`, `completo`, `lasaña`, `pastel de` | Platillo compuesto | mixto |
| N15 | `pasta jamon`, `pasta de` (untable de fiambre) | Untable mixto (fiambre+grasa) | |
| N16 | `vienesa veggie`, `hamburguesa de vegetales`, `hamburguesa veggie`, `not burger`, `salchicha veggie` | Plant-based mixto: iria a LEG, dejar null hasta revision | plant-based |
| N17 | `caldo`, `caldo de hueso`, `consome` | Liquido; proteina/porcion muy baja | |

---

## 5. Cobertura y notas de aplicacion

- **~55 patrones positivos** (P: 32 · LAC: 14 · SP: 6) + **17 patrones null**. Cubren la gran mayoria de
  los ~1.760 nombres de la familia en el dataset (top tokens: queso 160, leche 123, atun 48, pechuga 45,
  yogurt 46+41, jamon 35, whey 26, salmon 24, huevo 20).
- **Orden de evaluacion sugerido** (especifico -> generico), replicando el orden del `KEYWORD_GROUPS`
  existente: SP (whey/isolate/scoop) > null-plant (leche de X vegetal, queso vegano, veggie) >
  LAC (leche/queso/yogur/quesillo/kefir) > P (carnes/pescados/mariscos/huevo/jamon) > null-mixto
  (barra, pizza, sopa, helado). Esto evita que `leche de almendras` caiga en LAC y que `whey bar`
  caiga en SP.
- **Cocido vs crudo**: los gramos de P asumen porcion cocida (~30 g). Si el nombre trae `cruda/crudo`
  o es corte al peso, subir ~33% (~40 g). El driver ya deriva gramos desde los macros del food; usar
  estos valores como sanity-check (rango esperado P: 20-50 g; LAC leche 200-250 ml, queso 20-40 g;
  SP 27-35 g).
- **Banderas rojas detectadas en el dry-run actual** (la heuristica las erro y estos patrones las
  corrigen): leche vegetal -> LAC con 300-1800 g; `queso crema` -> LAC (es grasa); whey/isolate con
  gramos 44-800 (scoop real ~30 g); barras "protein" -> ARL/SP/F dispersos (deben ser null);
  `tocino`/`pate` -> ARL con 11-19 g (mejor null).
- **Cecinas grasas (P27-P31)**: confianza baja a proposito. Si el CEO quiere pureza de energia en el
  grupo P, moverlas a null; si prioriza cobertura, quedan en P con la nota de grasa alta.

### Fuentes citadas
- ADA / Diabetic Exchange Lists (carne 1 oz/28 g = 7 g P; leche 240 ml): https://diabetesed.net/wp-content/uploads/2026/03/THE-DIABETIC-EXCHANGE-LIST.pdf
- SMAE — Anexo UNAM (AOA 4 subgrupos por grasa, 7 g P): https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf
- SMAE guia (HeyNutre): https://www.heynutre.com/blog/sistema-mexicano-equivalencias-guia/ · tabla: https://www.heynutre.com/tabla-equivalencias-smae/
- Sistema Digital de Alimentos — lacteos: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/lacteos
- Sistema Digital de Alimentos — AOA origen animal: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/origen_animal
- SMAE quesos: panela https://www.sistemadigitaldealimentos.org/equivalentes/alimentos/Queso_panela/3089/al · oaxaca https://www.sistemadigitaldealimentos.org/equivalentes/alimentos/Queso_oaxaca/3088/al
