# Hallazgos: listas de intercambio — familia FRUTAS (F) y VERDURAS (V)

Investigador: familia frutas-verduras. Fecha: 2026-07-18.
Objetivo: tabla curada `patron -> {grupo, gramos_1_porcion, fuente, confianza}` aplicable como heuristica
sobre los nombres REALES sin clasificar de `public.foods`.

Perfil de grupos del sistema (dado):
- **F** = 60 kcal / 0 P / 15 C / 0 G  (1 porcion de fruta = 15 g de HCO).
- **V** = 25 kcal / 2 P / 0 G / 4 C   (1 porcion de verdura = ~½ taza cocida o 1 taza cruda).

## 0. Como usar esta tabla (ORDEN IMPORTA)

El dataset esta lleno de **ultra-procesados con nombre de fruta/verdura** (nectar de durazno, mermelada de
frutilla, helado de mango, salsa de tomate, queque de zanahoria, "proteina vegetal"...). Si el clasificador
matchea "frutilla" antes que "mermelada", le pone gramos de fruta fresca a un dulce. Por eso:

**Evaluar SIEMPRE los patrones NEGATIVOS (seccion 4) ANTES que los positivos de fruta/verdura.**
Solo si ningun patron negativo matchea, se aplican los patrones de fruta fresca (§2), jugo/deshidratado (§3)
o verdura (§5).

Fuentes canonicas usadas (gramos por porcion / equivalente):
- **SMAE** — Sistema Mexicano de Alimentos Equivalentes, base digital: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/frutas y .../grupo/verduras (1 equiv fruta = 60 kcal/15 g HCO; 1 equiv verdura = 25 kcal/4 g HCO).
- **ADA / Diabetic Exchange List** — https://diabetesed.net/wp-content/uploads/2026/03/THE-DIABETIC-EXCHANGE-LIST.pdf (frutas secas y jugos: 2 cda pasas / 3 ciruelas pasas / 2½ datiles / ½ taza jugo = 15 g HCO).
- **Guias Alimentarias para Chile (INTA/MINSAL 2022)** — https://www.dinta.cl/wp-content/uploads/2023/01/guias_alimentarias_2022_2ed_c.pdf y Manual de porciones de intercambio UDD-Chile: https://www.institutomedicinanatural.cl/wp-content/uploads/2022/08/MANUAL-DE-PORCIONES-DE-INTERCAMBIO-PARA-CHILE-UDD.pdf (confirman regla 1 fruta ~ unidad chica / 1 taza picada; verdura 1 taza cruda / ½ cocida).

Nota general: los PDFs chilenos (UCN/INTA) no se pudieron parsear (binario); sus valores coinciden con SMAE,
que es la fuente numerica principal aqui. Gramos redondeados a entero.

---

## 1. Frutas frescas / congeladas -> F (gramos canonicos SMAE)

`grams` = gramos de UNA porcion (= 1 equivalente = 15 g HCO). Fuente: SMAE salvo nota.

| # | patron (substring es-CL / en, case-insens) | grupo | grams | fuente | confianza | nota |
|---|--------------------------------------------|-------|-------|--------|-----------|------|
| 1 | `manzana` (no "vinagre", no "mermelada/jugo/nectar/compota/pure/jalea/chips") | F | 106 | SMAE 1 pza 106 g | alta | fruta fresca; ver §4 para derivados |
| 2 | `platano` / `plátano` / `banana` / `banano` / `cambur` (no "chips/frito/manjar/helado/barra") | F | 60 | SMAE ½ pza 60 g | alta | plátano es denso: 1 porcion = ½ unidad |
| 3 | `naranja` (fresca; no "jugo/nectar/sabor/te/powerade/zuko") | F | 150 | SMAE 2 pzas chicas ~152 g | media | usar 150 g por unidad mediana |
| 4 | `mandarina` / `clementina` | F | 128 | SMAE 2 pzas 128 g | alta | |
| 5 | `\bpera\b` / `peras` (no "compota/nectar/jugo/agua de pera") | F | 97 | SMAE ½ pza 97 g | alta | |
| 6 | `durazno` / `dur[aá]zno` / `melocoton` (fresco/congelado; no "nectar/jugo/mermelada/en mitades/almibar/helado") | F | 150 | SMAE ~156 g | media | "duraznos en trozos/mitades" suele ser en conserva -> ver §4 |
| 7 | `damasco` / `albaricoque` / `apricot` (fresco) | F | 120 | ADA 4 pzas frescas; SMAE s/d | media | fruta chica, 3-4 unidades |
| 8 | `ciruela` (fresca; no "pasa/deshidratada/seca/d'agen/mermelada") | F | 130 | SMAE / ADA 2 pzas | media | seca va en §3 |
| 9 | `\buva\b` / `uvas` (no "pasa/pasas/jugo") | F | 84 | SMAE 14 pzas 84 g | alta | densa en azucar |
| 10 | `frutilla` / `fresa` / `strawberr` (fresca/congelada; no "mermelada/helado/sabor/yogur/batido/bañad") | F | 200 | SMAE 17 pzas ~204 g | alta | baja densidad -> porcion grande |
| 11 | `ar[aá]ndano` / `blueberr` (fresco/congelado; no "sabor/mermelada/jalea/maqui bebida") | F | 100 | SMAE ⅔ taza 100 g | alta | |
| 12 | `frambuesa` / `raspberr` (fresca/congelada; no "mermelada/helado/tarta/sabor/alfajor") | F | 123 | SMAE 1 taza 123 g | alta | |
| 13 | `\bmora\b` / `moras` / `blackberr` (fresca/congelada; no "mermelada/kuchen") | F | 150 | SMAE 1 taza 155 g | media | |
| 14 | `kiwi` (no "sabor/juice cocktail") | F | 114 | SMAE 1.5 pza 114 g | alta | |
| 15 | `mango` (fresco/congelado/trozos; no "sabor/maracuya barra/tuti/colado/helado") | F | 100 | SMAE ½ ataulfo 90 g | media | mango grande; 100 g practico |
| 16 | `papaya` (no "sabor") | F | 150 | SMAE 1 taza 150 g | alta | |
| 17 | `pi[nñ]a` / `ananas` (fresca/congelada/trocitos; no "jugo/nectar/almibar/helado/colada/sabor/gomitas") | F | 114 | SMAE ¾ taza 114 g | media | "piña en trocitos" a veces conserva |
| 18 | `mel[oó]n` / `honeydew` / `cantaloupe` (no "sabor/tuna bebida") | F | 180 | SMAE 1 taza 180 g | alta | |
| 19 | `sand[ií]a` / `watermelon` | F | 180 | SMAE 1 taza 180 g | alta | |
| 20 | `cereza` / `cherr` (fresca; no "marrasquino/sabor/gelatina/en almibar") | F | 88 | SMAE 20 pzas 88 g | media | marrasquino = confitada -> §4 |
| 21 | `pomelo` / `toronja` / `grapefruit` (fresco; no "jugo") | F | 120 | SMAE ~½ pza | media | |
| 22 | `higo` / `\bfig\b` (FRESCO; no "seco/deshidratado") | F | 72 | SMAE 2 pzas 72 g | media | higo SECO va en §3 |
| 23 | `guayaba` / `guava` | F | 90 | SMAE ~3 pzas chicas | baja | poca presencia en dataset |
| 24 | `maracuy[aá]` / `passion fruit` (fruta fresca; no "sabor/barra/limonada/nectar/mermelada") | F | 120 | SMAE s/d; regla F | baja | casi siempre aparece como SABOR -> §4 |
| 25 | `nectarin` / `nectarina` (fruta; NO confundir con "nectar") | F | 140 | regla F (~durazno) | media | cuidado: `nectar` (bebida) es distinto, ver §4 |
| 26 | `caqui` / `kaki` / `persimmon` | F | 85 | SMAE ~½ pza | baja | |
| 27 | `granada` / `pomegranate` (grano fresco) | F | 90 | SMAE ~½ taza | baja | |
| 28 | `chirimoya` / `cherimoya` | F | 60 | regla F (fruta muy dulce) | baja | densa; porcion chica |

---

## 2. Frutas para hornear/verdes usadas como fruta

| # | patron | grupo | grams | fuente | confianza | nota |
|---|--------|-------|-------|--------|-----------|------|
| 29 | `manzana verde` / `granny smith` | F | 106 | = manzana | alta | mismo que manzana |
| 30 | `uva roja sin pepa` / `uva verde` | F | 84 | = uva | alta | |
| 31 | `frutos rojos` / `berries` / `frutas vermelhas` / `mix.*(frutilla|arandano)` (FRESCO/congelado; no "sabor/jugo/nectar/te") | F | 120 | promedio berries SMAE | media | si dice "sabor/jugo" -> §4 |
| 32 | `trozos de fruta` / `mix.*fruta` / `pura fruta` / `compota 100% fruta` (SIN azucar añadida, 100% fruta) | F | 120 | regla F | baja | frontera con compota azucarada §4 |

---

## 3. JUGOS naturales y frutas DESHIDRATADAS -> porcion MUCHO menor

Clave del brief: jugo 100% natural y fruta seca concentran azucar; 1 porcion (15 g HCO) es mucho menos volumen/peso.

| # | patron | grupo | grams | fuente | confianza | nota |
|---|--------|-------|-------|--------|-----------|------|
| 40 | `jugo.*natural` / `jugo.*exprimido` / `100% jugo` / `zumo` / `jugo de (naranja|manzana|pera|durazno|uva)` (NATURAL, sin "sabor/nectar/zuko/watts/andina/kapo/powerade/suerox") | F | 125 | ADA/SMAE ½ taza = 125 ml | media | jugo natural = 1 porcion F en 125 ml, NO en 1 vaso 200 ml |
| 41 | `pasas` / `uvas pasas` / `pasas (corinto|morenas|rubias)` / `raisins` | F | 20 | SMAE 10 pzas 20 g; ADA 2 cda | alta | deshidratada: porcion chica |
| 42 | `ciruela.*(pasa|deshidratada|seca)` / `ciruelas d'agen` / `prune` | F | 25 | ADA 3 pzas medianas | media | SMAE lista 56 g (con carozo); usar ~25 g fruta neta |
| 43 | `d[aá]til` / `datiles` / `medjool` / `date` (fruta; no "syrup/jarabe") | F | 18 | SMAE 2 pzas 18 g; ADA 2½ | alta | muy denso |
| 44 | `higo.*(seco|deshidratado)` / `dried fig` | F | 30 | ADA 1½ pza | media | |
| 45 | `damasco.*(turco|seco|deshidratado)` / `orejones` / `dried apricot` | F | 30 | ADA 7 mitades | media | "Damasco Turco" del dataset = seco |
| 46 | `banana chips` / `platano.*chips` / `platanos chips` / `chips.*(manzana|platano)` | F | 20 | frito/deshidratado azucarado | baja | frontera con snack graso -> revisar; si es frito, mas cercano a G |
| 47 | `chips.*(manzana|arandano|frutilla)` (fruta deshidratada sin freir) | F | 20 | regla fruta seca | baja | |

---

## 4. PATRONES NEGATIVOS -> `null` (ultra-procesados / mixtos / no-fruta-verdura)

Estos matchean nombre de fruta/verdura pero NO son una porcion de fruta/verdura fresca. Evaluar PRIMERO.
`null` = queda sin clasificar (o lo toma otra familia: azucares, lacteos, grasas, cereales). No inventar gramos.

| # | patron | veredicto | razon |
|---|--------|-----------|-------|
| 60 | `mermelada` / `mermedada` / `jalea` (jam/jelly) | null (→ azucares) | 100% azucar añadida; no equivale a fruta |
| 61 | `n[eé]ctar` / `nectar ` (bebida) / `zuko` / `watt'?s` / `andina` / `del valle` / `kapo` / `livean nectar` / `vivo nectar` | null (→ bebida azucarada) | nectar envasado ≠ jugo natural; azucar añadida. OJO: NO confundir con `nectarina` (§1 #25) |
| 62 | `helado` / `sherbet` / `sorbete` / `barra helada` / `pop ` / `paleta` | null (→ postre) | postre lacteo/azucarado |
| 63 | `batido` / `smoothie` / `yogu ?yogu` / `yoghito` / `activia` / `griego con` / `light & free` | null (→ lacteo/postre) | bebida lactea/proteica saborizada |
| 64 | `gelatina` / `jelly` / `gomitas` / `tiburoncitos` / `rollos de fruta` / `fruttié` / `froota` / `frutabom` | null (→ azucares) | golosina/gelatina saborizada |
| 65 | `compota` / `colado` / `pure de (manzana|fruta)` (con azucar / infantil) | null | frontera; solo si dice "100% fruta sin azucar" ir a §2 #32, si no null |
| 66 | `mermelada de (cebolla|pimenton|tomate)` | null (→ azucares) | conserva dulce, no verdura |
| 67 | `sabor a? (frutilla|durazno|naranja|manzana|piña|mango|arandano|...)` / `\bsabor\b` en bebidas/proteinas/te | null | saborizante, sin fruta real: suerox, powerade, electrolit, benedictino, clear protein, iso100, next, batido proteina, te, aloe vera |
| 68 | `mermelada|jalea|helado|nectar|compota|jugo.*sabor` combinado con fruta | null | cualquier fruta + derivado azucarado gana el negativo |
| 69 | `salsa de tomate` / `tuco` / `pomarola` / `ketchup` / `tomate (triturado|en conserva)` / `sofrito` | null (→ condimento) | salsa procesada; no cuenta como porcion V |
| 70 | `crema de (verduras|tomate|espinaca)` / `sopa` / `caldo` / `pate de acelga` | null (→ preparacion) | plato mixto / caldo |
| 71 | `ravioli(es)?` / `lasa[gñ]a` / `gyosa|gyoza` / `nuggets de verdura` / `queque|biscuit|galleta(s)? .*zanahoria` / `torta` / `kuchen` / `tarta` / `alfajor` / `queque naranja` | null (→ cereal/mixto) | masa/harina dominante |
| 72 | `proteina vegetal` / `vegetal protein` / `proteins? vegetal` / `spartan|spartan proteina` / `vegetal sabor` | null (→ proteina en polvo) | NO es verdura: proteina vegetal en polvo (macro engaña al clasificador) |
| 73 | `bebida vegetal` / `leche vegetal` / `vegetal (de )?coco` | null (→ bebida/lacteo veg) | bebida, no verdura |
| 74 | `vinagre de manzana` / `sucedaneo de jugo de limon` / `slice limon` / `limon soda` / `limonada` / `full limon` | null | condimento/bebida; limon casi nunca se come como porcion fruta |
| 75 | `aceituna` / `olive` | null (→ G grasa) | es grasa, NO fruta F |
| 76 | `frutos secos` / `nueces|nuez|almendra|mani|pistacho|castaña|avellana` | null (→ G grasa) | "frutos secos" = nueces = grasas, NO fruta |
| 77 | `\bcoco\b` (pulpa/rallado/aceite) | null (→ G grasa) | coco es grasa, no F (salvo "agua de coco" que es aparte) |

---

## 5. Verduras -> V (regla 25 kcal; ~1 taza cruda / ½ cocida)

`grams` de UNA porcion V. Default practico = 100 g (1 taza cruda / ½ cocida). Hojas = menor volumen util;
raices densas (mas HCO) = menor peso. Fuente: SMAE verduras + regla INTA/ADA.

| # | patron (verdura fresca/cocida; excluye negativos §4) | grupo | grams | fuente | confianza | nota |
|---|------------------------------------------------------|-------|-------|--------|-----------|------|
| 80 | `tomate` (fresco: cherry, entero; no "salsa/tuco/ketchup/triturado/sopa/crema/pomarola/mermelada") | V | 100 | SMAE 1 pza 103 g | alta | ver §4 #69 para salsas |
| 81 | `lechuga` / `lettuce` (iceberg, romana, hidroponica) | V | 80 | SMAE 1 taza 45 g (hoja) | media | hoja: usar 80 g practico (~1.5 taza) |
| 82 | `espinaca` / `spinach` (no "ravioli/crema/a la crema/lasaña") | V | 80 | SMAE crudo 60 g / cocido 90 g | alta | |
| 83 | `acelga` / `chard` (no "pate de acelga") | V | 80 | = hoja tipo espinaca | media | |
| 84 | `br[oó]coli` / `broccoli` (no "arbolitos snack/galleta") | V | 90 | SMAE cocido 60 g | alta | |
| 85 | `coliflor` / `cauliflower` | V | 100 | SMAE crudo 80 / cocido 100 g | alta | |
| 86 | `zanahoria` / `carrot` (fresca/cocida; no "queque/galleta/biscuit/pastel") | V | 70 | SMAE ½ taza 40 g | media | densa (mas HCO): porcion menor |
| 87 | `betarraga` / `remolacha` / `beet` (no "jugo/rollos/salsa") | V | 70 | SMAE ¼ pza 39 g / ⅓ taza 55 g | media | densa |
| 88 | `pepino` / `cucumber` | V | 100 | SMAE 1 taza 104 g | alta | |
| 89 | `apio` / `celery` (no "sofrito con") | V | 100 | SMAE 1.5 taza 135 g | alta | |
| 90 | `zapallo italiano` / `zapallito` / `zucchini` / `calabacin` | V | 100 | SMAE 1 pza 110 g | alta | zapallo italiano ES V (calabacita) |
| 91 | `zapallo` / `calabaza` / `pumpkin` (NO "italiano") | V | 100 | regla V (cocido) | media | frontera con C si es camote; zapallo comun = V |
| 92 | `berenjena` / `eggplant` | V | 100 | regla V | media | no en SMAE base; regla general |
| 93 | `piment[oó]n` / `pimiento` / `morron` / `bell pepper` / `papikra` (no "ave pimenton/salsa") | V | 90 | SMAE 1 taza 90 g | alta | "ave pimenton" = plato con pollo -> null/P |
| 94 | `cebolla` / `onion` (cruda/cocida/morada; no "mermelada de cebolla/grisines con") | V | 70 | SMAE ⅔ pza 53 g | media | densa |
| 95 | `champi[nñ]on` / `hongo` / `\bseta\b` / `portobello` / `mushroom` | V | 90 | SMAE 1 taza 90 g | alta | |
| 96 | `esp[aá]rrago` / `asparagus` | V | 90 | SMAE 6 pzas 90 g | alta | |
| 97 | `r[aá]bano` / `radish` | V | 100 | SMAE 1 taza 117 g | alta | |
| 98 | `\bnabo\b` / `turnip` | V | 100 | regla V | media | |
| 99 | `alcachofa` / `artichoke` / `corazones de alcachofa` | V | 100 | SMAE 1 pza 48 g | media | usar 100 g (corazones en conserva) |
| 100 | `kale` / `col rizada` | V | 80 | = hoja | media | |
| 101 | `r[uú]cula` / `arugula` / `berro` / `watercress` | V | 60 | hoja tierna baja densidad | media | |
| 102 | `repollo` / `col\b` / `cabbage` | V | 90 | regla V | media | |
| 103 | `palmito` / `heart of palm` / `corazones de palmito` (no "spaguetti postre/ensalada oriental azucarada") | V | 100 | regla V (conserva) | media | |
| 104 | `poroto verde` / `poroto[s]? verde` / `judia verde` / `green bean` / `haba verde` | V | 100 | regla V | media | vaina = verdura, NO leguminosa seca |
| 105 | `germinado` / `brote` / `sprout` (soya, alfalfa) | V | 50 | regla V (baja densidad) | baja | |
| 106 | `mix.*(verdura|vegetal|ensalada)` / `verduras (salteadas|wok|primavera)` / `hojas de` / `ensalada` (SIN aderezo/cesar/toscana) | V | 100 | regla V | baja | "ensalada cesar/cesar/toscana" con aderezo/crutones -> revisar, tiende a null |

---

## 6. NO pertenecen a F/V aunque el nombre lo sugiera (delegar a otra familia)

Estos matchearon el filtro pero su porcion la define OTRA familia. Marcar `null` aqui para que el investigador
de esa familia los tome; NO asignar F/V.

| patron | familia correcta | razon |
|--------|------------------|-------|
| `choclo` / `ma[ií]z` / `elote` / `corn` | C (cereal) | maiz cuenta como carbohidrato, no verdura |
| `arveja` / `guisante` / `pea` (seca) | LEG | leguminosa (arveja verde fresca podria ser V, pero ambigua -> null) |
| `habas` (seca) / `garbanzo` / `lenteja` / `poroto` (seco) | LEG | leguminosa |
| `papa` / `patata` / `camote` / `batata` / `yuca` / `mandioca` | C | tuberculo = carbohidrato, no V |
| `palta` / `aguacate` / `avocado` | G (grasa) | grasa, no fruta F |
| `aceituna` / `coco` / `frutos secos` / `nueces` | G (grasa) | ya en §4 #75-77 |
| `agua de coco` | (bebida) | ni F ni V; azucares/bebida |

---

## 7. Resumen operativo para el clasificador

1. **Precedencia**: negativos §4 y §6 > deshidratados/jugo §3 > fruta fresca §1-2 > verdura §5.
2. **Defaults por si un nombre es claramente fruta fresca pero sin match especifico**: F = 120 g.
   Verdura clara sin match: V = 100 g (hoja 80 g).
3. **Confianza alta** solo cuando: fuente canonica (SMAE/ADA) + patron inequivoco de alimento fresco
   (sin token de procesamiento). El grueso del dataset "frutas-verduras" es en realidad procesado (nectar,
   mermelada, helado, sabor, salsa, proteina vegetal) -> mayoritariamente `null` por §4.
4. **Cobertura estimada**: ~106 patrones cubren manzana/platano/citricos/berries/uva/durazno + hoja/tomate/
   crucifera/raiz + jugos/deshidratados, y descartan la masa de ultra-procesados. Sobre los ~1.028 nombres
   crudos que matcharon el filtro amplio (759 unicos), la mayoria cae en negativos §4/§6; los positivos F/V
   reales rondan las ~200-250 filas del dataset (frescos + jugos naturales + deshidratados).

### Gramos canonicos de referencia rapida (1 porcion = 1 equivalente)

FRUTA FRESCA (F, 60 kcal/15 g HCO): manzana 106 · plátano 60 · naranja 150 · mandarina 128 · pera 97 ·
durazno 150 · damasco 120 · ciruela 130 · uva 84 · frutilla 200 · arándano 100 · frambuesa 123 · mora 150 ·
kiwi 114 · mango 100 · papaya 150 · piña 114 · melón 180 · sandía 180 · cereza 88 · pomelo 120 · higo 72.
JUGO natural 125 · pasas 20 · ciruela seca 25 · dátil 18 · higo seco 30 · damasco seco 30.
VERDURA (V, 25 kcal): default 100 · hoja (lechuga/espinaca/acelga/kale) 80 · rúcula/berro 60 ·
densa (zanahoria/betarraga/cebolla) 70 · pimentón 90 · brócoli 90 · champiñón/espárrago 90.

### Fuentes
- SMAE base digital frutas: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/frutas
- SMAE base digital verduras: https://www.sistemadigitaldealimentos.org/equivalentes/grupo/verduras
- ADA Diabetic Exchange List (frutas secas/jugos): https://diabetesed.net/wp-content/uploads/2026/03/THE-DIABETIC-EXCHANGE-LIST.pdf
- Guias Alimentarias para Chile INTA/MINSAL 2022: https://www.dinta.cl/wp-content/uploads/2023/01/guias_alimentarias_2022_2ed_c.pdf
- Manual de porciones de intercambio UDD-Chile: https://www.institutomedicinanatural.cl/wp-content/uploads/2022/08/MANUAL-DE-PORCIONES-DE-INTERCAMBIO-PARA-CHILE-UDD.pdf
