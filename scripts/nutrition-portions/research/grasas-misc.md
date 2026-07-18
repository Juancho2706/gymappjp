# Hallazgos — familia GRASAS-MISC (grupos G, ARL y sin-grupo/null)

Investigador: listas de intercambio para aceites, mantequillas, frutos secos, semillas,
paltas, aceitunas + reglas de exclusion (bebidas, alcohol, salsas, golosinas).

Base de trabajo: `tmp/nutrition-portions/classified-latest.json` (dry-run sobre los 4.873 foods).
Se trabajo sobre los NOMBRES REALES del catalogo, no sobre listas teoricas.

## Modelo de grupos (perfil del sistema)

- **G** = grasas SIN proteina (aceites, mantequilla, margarina, manteca, mayonesa, crema). Perfil 45 kcal / 0P / 0C / 5G. 1 porcion = 1 equivalente de grasa.
- **ARL** = grasas CON proteina (frutos secos, semillas, palta, aceitunas). Mismo perfil de macro (45/0/0/5) pero el alimento arrastra algo de proteina; por eso van a ARL, no a G.
- **null** = sin porcion de intercambio (agua, te/cafe sin azucar, bebidas zero/light, alcohol, condimentos no grasos, ultra-procesados mixtos sin equivalencia limpia).

Regla de oro del reparto G vs ARL: **si es grasa liquida/untable pura -> G; si es fruto seco / semilla / palta / aceituna (alimento entero) -> ARL. El ACEITE de cualquier semilla o palta es G, no ARL** (el aceite ya no arrastra proteina).

## Fuentes canonicas (gramos por 1 equivalente)

- **SMAE — Sistema Digital de Alimentos, grupo Grasas** (grams por equivalente, medida casera): https://www.sistemadigitaldealimentos.org/equivalentes/grupo/grasas
  - Aceites (oliva, canola, soja, ajonjoli, almendra, etc.): 1 cdta = **5 g / 5 ml**
  - Mantequilla: 1 rebanada = **6 g**; mantequilla light 1 cda = 10 g
  - Margarina 80%/70%: 1/2 cda = **7 g**; margarina light 1 cda = 10 g
  - Manteca de cerdo: **5 g**
  - Mayonesa: 1 cdta = **6 g**; crema para cafe 24 g; crema agria ~14 ml
  - Almendra **9-10 g** (10 pzas); Nuez **9 g** (3 pzas); Nueces de la india/caju **11 g** (7.33 pzas); Cacahuate **10 g** (10 pzas), salado 12 g; Pistaches **13 g** (18.57 pzas); Avellana tostada **8 g**; Ajonjoli **10 g** (4 cdta); Pinon **10 g**
  - Mantequilla de almendra 1/2 cda = **8 g**; mantequilla de mani light 2 cdta = 14 g; crema de cacahuate 2 cda = **10 ml**
  - Aguacate: 1/3 pza = **31 g**; Aceitunas: 5.33 pzas = **32 g**
- **ADA / Diabetic Exchange List — Fat list** (1 grasa = 5 g grasa / 45 kcal): https://diabetesed.net/page/_files/THE-DIABETIC-EXCHANGE-LIST.pdf
  - Aceite (canola/oliva/mani) 1 tsp; Aguacate 2 cda (~30 g); Aceitunas negras 8 grandes / verdes rellenas 10 grandes; Almendras/castanas 6 unid; Cacahuates 10 unid; Nuez pecana 4 mitades; Mantequilla de mani 1.5 tsp (~8 g); Mayonesa regular 1 tsp
- SMAE guia general (subdivision grasas con/sin proteina): https://www.heynutre.com/blog/sistema-mexicano-equivalencias-guia/

---

## TABLA A — patrones -> G (grasas sin proteina), 5 g salvo nota

| # | Patron (es-CL / en, substring o regex simple) | Grupo | g/porcion | Fuente | Confianza |
|---|---|---|---|---|
| 1 | `aceite` (oliva, extra virgen, maravilla, girasol, canola, maiz, soya, vegetal, pepita de uva, linaza, sesamo, palta/aguacate, coco, ajonjoli) — SIN "atun/sardina/anchoa/jurel ... en aceite" | G | 5 | SMAE aceites 1 cdta=5g; ADA 1 tsp | alta |
| 2 | `\boil\b` / `olive oil` / `extra virgin` (aceite en ingles) | G | 5 | idem | alta |
| 3 | `mantequilla` / `butter` (pura, con/sin sal, untable, artesanal, batida) — SIN "de mani/almendra/pistacho/avellana/cacahuate" ni "peanut/almond ... butter" | G | 6 | SMAE mantequilla 1 reb=6g | alta |
| 4 | `margarina` | G | 5 | SMAE margarina 1/2 cda=7g (redondeo exchange 5) | alta |
| 5 | `\bghee\b` | G | 5 | mantequilla clarificada = grasa pura | alta |
| 6 | `manteca de cerdo` / `manteca de cerdito` / `\blard\b` | G | 5 | SMAE manteca cerdo=5g | alta |
| 7 | `mayonesa` / `mayo` / `\bmayonnaise\b` (regular) | G | 10 | SMAE 1 cdta=6g; ADA 1 tsp=5g; 10g = porcion practica ~2 eq | media |
| 8 | `crema` para cocinar / `crema agria` / `crema de leche` / `sour cream` / `heavy cream` — SIN "crema de mani/almendra/avellana/caju" y SIN "crema de <verdura>" (sopas) | G | 15 | SMAE crema 1 cda~14-15g | media |
| 9 | `coco rallado` / `coco fresco` / `coconut` (pulpa/rallado, NO agua ni leche ni aceite) | G | 8 | coco seco ~65% grasa; 1 grasa~8g | media |

Notas tabla A:
- **GOTCHA aceite**: hay ~10 filas "Atun/Sardina/Anchoa ... en aceite" que son PROTEINA (P), no grasa. El patron 1 debe excluir pescado en conserva.
- El heuristico actual manda a **ARL** varias grasas puras que son **G**: "Olive Oil", "Aceite Maravilla", "Aceite de aguacate/palta", "Aceite de girasol", "Aceite de linaza", "Aceite de sesamo", "Aceite 100% Maravilla". CORRECCION: todo `aceite`/`oil` -> **G 5g**.
- "Aceite de palta/aguacate" = **G** (es aceite), distinto de "Palta" fruta = ARL.

---

## TABLA B — patrones -> ARL (grasas con proteina: frutos secos, semillas, palta, aceitunas)

| # | Patron | Grupo | g/porcion | Fuente | Confianza |
|---|---|---|---|---|
| 10 | `palta` / `aguacate` / `avocado` (fruta entera; NO "aceite de", NO sandwich/ensalada/gohan mixtos) | ARL | 30 | SMAE 1/3 pza=31g; ADA 2 cda | alta |
| 11 | `almendra(s)` / `almond(s)` (fruto entero, tostada, salada, pelada, natural) — NO "leche/bebida de almendras" (LAC/veg), NO "harina de almendra" (C) | ARL | 10 | SMAE 10 pzas=10g | alta |
| 12 | `nuez` / `nueces` / `walnut` (comun) — NO "nuez moscada" (especia), NO "nuez de la india/caju" (fila 14) | ARL | 9 | SMAE 3 pzas=9g | alta |
| 13 | `nuez pecana` / `pecana(s)` / `pecan` | ARL | 9 | SMAE nuez 9g; ADA 4 mitades | alta |
| 14 | `caju` / `caju` / `caju` / `anacardo` / `cashew` / `nuez de la india` | ARL | 11 | SMAE 7.33 pzas=11g | alta |
| 15 | `mani` / `cacahuat(e)` / `peanut` (fruto entero: tostado, salado, crudo, japones, confitado) — NO "mantequilla/pasta/crema de mani" (fila 20), NO "barra/protein bar" mixta | ARL | 10 | SMAE 10 pzas=10g; ADA 10 unid | alta |
| 16 | `pistacho(s)` / `pistache` / `pistachio` | ARL | 13 | SMAE 18.57 pzas=13g | alta |
| 17 | `avellana(s)` / `hazelnut` (fruto; NO "crema/mantequilla de avellana" fila 20, NO chocolate con avellana mixto) | ARL | 8 | SMAE 8 pzas=8g | alta |
| 18 | `macadamia` | ARL | 8 | ADA nueces alto-grasa; ~7-8g | media |
| 19 | `nueces de brasil` / `castana` (de arbol) / `pinon` / `frutos secos` / `nut mix` / `trail mix` / `mix (de) frutos secos` (mezcla generica) | ARL | 12 | SMAE mezcla nueces 10g; pinon 10g | media |
| 20 | `mantequilla de (mani/cacahuate/almendra(s)/pistacho/avellana(s)/maravilla)` / `pasta de (mani/almendra)` / `crema de (mani/cacahuate/avellana)` / `peanut butter` / `almond butter` (untables de fruto seco puros; NO "protein bar / barra / helado ... peanut butter" mixtos) | ARL | 10 | SMAE crema cacahuate 2 cda=10ml; mant. almendra 8g; ADA 1.5 tsp=8g | media-alta |
| 21 | `tahini` / `tahin(e)` / `pasta de sesamo` | ARL | 10 | 100% sesamo; ~58% grasa; 1 grasa~10g | media |
| 22 | `aceituna(s)` / `olive` (fruta: verde, negra, rellena, descarozada, salmuera; NO "olive oil/aceite de oliva" fila 2) | ARL | 30 | SMAE 5.33 pzas=32g; ADA 8-10 unid | alta |
| 23 | `semillas de chia` / `\bchia\b` (semilla suelta; NO "pan/galleta/barra/agua ... chia" mixtos) | ARL | 12 | lino/chia ~42% grasa; 1 cda~12g | media |
| 24 | `linaza` / `\blino\b` / `flax seed` (semilla/molida; NO pan/galleta) | ARL | 12 | SMAE-analogo; 1 cda~12g | media |
| 25 | `semillas de sesamo` / `sesamo` / `ajonjoli` (semilla suelta; NO pan/bagel/cracker con sesamo) | ARL | 10 | SMAE ajonjoli 4 cdta=10g | media |
| 26 | `semillas de (maravilla/girasol)` / `pipas` (semilla; NO "aceite de maravilla/girasol" fila 1, NO galletas) | ARL | 10 | analogo ajonjoli 10g | media |
| 27 | `semillas de (calabaza/zapallo)` / `pepitas de zapallo` (SOLO la semilla; NO la verdura, ver GOTCHA) | ARL | 12 | pipas calabaza ~50% grasa; 1 cda~12g | media |
| 28 | `mix (de) semillas` / `multisemillas` sueltas / `frutos secos y semillas` | ARL | 12 | mezcla oleaginosas | media |

Notas tabla B:
- **GOTCHA zapallo/calabaza**: "Zapallo cocido/crudo/italiano", "Crema/sopa de zapallo", "Ravioli/pan de zapallo/calabaza" son VERDURA (V) o C, NO semillas. Solo "semillas/pepitas de zapallo/calabaza" van a ARL. El patron 27 debe exigir "semilla|pepita".
- **GOTCHA linaza/chia/sesamo en panaderia**: la gran mayoria de matches ("Pan linaza chia", "Bagels Sesamo", "Galletas multigrano chia", "Avena multisemillas") son PANIFICADOS/CEREALES -> C, NO ARL. Los patrones 23-27 solo aplican a la SEMILLA SUELTA. El heuristico hoy los manda erroneamente a ARL con gramos de pan (83-167g).
- **GOTCHA leche/bebida vegetal**: "Leche de almendras", "Bebida de almendra/coco", "yogurt vegetal almendras" NO son ARL (son bebida/LAC vegetal). Excluir "leche|bebida|yogur(t)".
- **GOTCHA chocolate/barra/granola/helado con fruto seco**: "Chocolate con almendras", "Granola almendras y miel", "Helado de pistacho", "Barra ... almendra", "Alfajor nuez", "Protein bar peanut butter" son ULTRA-PROCESADOS mixtos -> se resuelven por macro (LEG/C/LAC/P), NO son ARL de fruto seco. El nombre debe ser el fruto seco a secas o con calificadores simples (tostado/salado/natural/crudo/pelado).

---

## TABLA C — patrones -> null (sin porcion de intercambio) + razon

| # | Patron | Resultado | Razon | Confianza |
|---|---|---|---|---|
| 29 | `^agua` / `agua mineral` / `agua (con )?gas` / `agua saborizada` / `agua sin gas` (agua sola) | null | agua = 0 kcal, sin equivalente | alta |
| 30 | `\bte\b` / `te (negro/verde/rojo)` / `infusi(on)` / `hierba(s)` (preparada) / `manzanilla` / `boldo` / `yerba mate` / `\bmate\b` (bebida sin azucar) | null | infusion sin aporte energetico | alta |
| 31 | `cafe` (negro / instantaneo / granulado / liofilizado / molido / en grano / descafeinado / `nescafe`) SOLO, sin leche ni azucar | null | cafe negro ~0 kcal; en polvo no es porcion de comida | alta |
| 32 | `zero` / `light` / `diet` **en bebida** (`coca cola zero/light`, `pepsi zero`, `sprite zero`, `powerade zero`, `gaseosa/bebida ... zero/light`) | null | refresco acalorico, sin equivalente | alta |
| 33 | `gaseosa` / `refresco` / `\bcola\b` / `coca[- ]?cola` / `pepsi` / `sprite` / `fanta` / `bebida (gaseosa)` azucarada | null | bebida azucarada: sin equivalencia limpia de intercambio (CEO: null salvo equivalencia clara) | media |
| 34 | `nectar` / `jugo`/`zumo` azucarado / `bebida isotonica` / `gatorade` / `powerade` (regular) / `energetica` / `red bull` / `monster` / `zuko` / `electrolit` | null | azucares libres sin equivalente de comida solida | media |
| 35 | `cerveza` / `vino` / `pisco` / `\bron\b` / `vodka` / `whisky` / `tequila` / `licor` / `espumante` / `champagne`/`champana` (bebida) / `fernet` / `coctel`/`cocktail` / `mojito` / `aperol` / `\bgin\b` / `\bbeer\b` / `\bwine\b` | null | alcohol: no se modela como intercambio nutricional | alta |
| 36 | `salsa de tomate` / `pomarola` / `ketchup`/`kepchu` / `mostaza` / `salsa de soya`/`soja` / `vinagre` / `salsa inglesa` / `aderezo` (no graso) / `sofrito` | null | condimento de aporte despreciable; no es grasa ni macro asignable | media |
| 37 | `golosina` / `caramelo` / `gomita(s)` / `chicle` sueltos sin macro claro | null | ultra-procesado sin equivalencia limpia | baja |

Notas tabla C (ANTI-PATRONES criticos — el substring enganosos):
- **`agua` NO es null si**: "Atun/Salmon/Jurel/Choritos ... en agua" (=P), "Galletas de agua" / "Agua Line" (=C, es una galleta), "Agua de coco" (=bebida F). Patron 29 debe anclar a inicio o exigir "mineral|saborizada|con gas|sin gas" y EXCLUIR pescado/galleta/coco.
- **`light` NO es null si**: "Mayonesa light" (G), "Yogur/Yoghurt light" (LAC), "Hamburguesa/Vacuno light" (P), "Galletas light" (C). El null por `light`/`zero` SOLO aplica cuando el alimento es una BEBIDA. Nunca null-ear por `light` suelto.
- **`cafe` NO es null si**: "Barra/bombon/protein sabor cafe/mocca" (macro), "Cappuccino/Cafe con leche/Moka/Cola Cao" listos (LAC/C con leche/azucar). Solo cafe negro puro/polvo.
- **`champ`/`cerveza` NO es alcohol si**: "Champinon/champignon" (hongo=V/P), "Galleta champana/champanita/champanita" (C), "Salchichon/Salchicha cerveza" (embutido=P). Usar tokens completos con limites de palabra.
- **`te` como palabra suelta es peligrosisimo**: matchea "toMATE", "paTE", "aceiTE", "leche", etc. El patron 30 debe usar limites de palabra reales y lista blanca de infusiones (te negro/verde, manzanilla, boldo, mate, hierba).
- Golosinas/chocolates/helados/postres/snacks mixtos NO son de esta familia: se dejan resolver por macro (caen en LEG/C/P/LAC en el heuristico). NO inventar porcion; si no hay macro claro -> null.

---

## Correcciones prioritarias al heuristico actual (evidencia del dry-run)

1. **Aceites mal ruteados a ARL**: "Olive Oil", "Aceite Maravilla", "Aceite de aguacate", "Aceite de girasol/linaza/sesamo", "Aceite 100% Maravilla" -> deben ser **G 5g**. (regla: aceite/oil = G siempre).
2. **Nut butters mal ruteados a LEG con gramos gigantes**: "Peanut Butter" (LEG 107g), "Waitrose Smooth Peanut Butter" (150g), "PEANUT BUTTER CRUNCHY" (75g) -> **ARL ~10g**.
3. **Semillas en panaderia mal ruteadas a ARL con gramos de pan**: "Pan linaza chia" (125g), "Bagels Sesamo" (125g), "Avena multisemillas" -> son **C** (panificado/cereal), no ARL de semilla.
4. **Palta fruta vs aceite de palta**: "Palta" -> ARL 30g; "Aceite de Palta" -> G 5g. Hoy ambos caen en ARL con gramos distintos.
5. **Coco disperso**: "Aceite de coco" -> G 5g (ok); "Coco rallado" -> G ~8g; "Agua/Leche/Bebida de coco" -> NO es grasa (bebida). Revisar que "Coco (pulpa cruda)" no quede como P 233g.

## Cobertura estimada

Los ~28 patrones positivos (tablas A+B) cubren de forma limpia los foods de grasa REAL del catalogo
(aceites ~40 reales, mantequillas/margarinas ~25, frutos secos enteros ~90, semillas sueltas ~30,
paltas ~5, aceitunas ~28). Las 9 reglas null + anti-patrones (tabla C) evitan falsos positivos en
las ~753 bebidas, ~49 alcoholes y ~137 salsas del substring, que hoy el heuristico dispersa por macro.
Confianza alta solo donde hay fuente canonica (SMAE/ADA) + patron inequivoco; media/baja donde el
alimento es mezcla o la porcion es aproximada.
