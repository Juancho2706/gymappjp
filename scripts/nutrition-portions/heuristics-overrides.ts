/**
 * Tabla UNICA consolidada de overrides curados nombre -> clasificacion para el
 * pipeline de porciones (SPEC nutrition-portions R8). Integra las 4 investigaciones
 * de listas de intercambio hechas sobre los NOMBRES REALES del catalogo
 * `public.foods` (dry-run `tmp/nutrition-portions/classified-latest.json`):
 *
 *   - tmp/nutrition-portions/research/cereales-leguminosas.md   (C / LEG)
 *   - tmp/nutrition-portions/research/proteinas-lacteos.md       (P / LAC / SP)
 *   - tmp/nutrition-portions/research/frutas-verduras.md         (F / V)
 *   - tmp/nutrition-portions/research/grasas-misc.md             (G / ARL / null)
 *
 * Fecha de consolidacion: 2026-07-18.
 *
 * PORQUE existe: el clasificador por 3 senales (`heuristics.ts`) rutea mal ~decenas
 * de familias y deriva gramos absurdos por macro (avena cocida 312 g, peanut butter
 * 107 g, aceites -> ARL, palta vs aceite de palta, leche vegetal -> LAC 1800 g,
 * pescado en agua/aceite -> agua/grasa). Estos overrides curados ANCLAN grupo y
 * gramos canonicos (escala SMAE, 1 equivalente) y DES-clasifican los ultra-procesados
 * mixtos (bebidas, alcohol, barras, postres) que la heuristica forzaria a un grupo.
 *
 * SEMANTICA (aplicada por `classifyFoodWithOverrides`, ver abajo):
 *   - confianza 'alta' + grupo  -> tier 'alto', grupo y gramos del override. Corta.
 *   - confianza 'media' + grupo -> tier 'medio', grupo y gramos del override. Corta.
 *     (media SIEMPRE se queda media: ninguna otra senal la sube.)
 *   - grupo null (cualquier confianza) -> SIEMPRE manda: queda sin clasificar
 *     (group=null, tier bajo) y NO sigue al clasificador. Bebidas light/mermeladas/
 *     barras nunca se clasifican por macros.
 *   - sin override que matchee -> cae al clasificador puro de 3 senales.
 *
 * MATCHING: `pattern` se evalua sobre el nombre NORMALIZADO (minuscula, sin tildes
 * via NFD, trim). String -> `includes()`. RegExp -> `test()`. GANA EL PRIMERO que
 * matchea: la tabla esta ordenada de MAS ESPECIFICO a mas generico, y las familias
 * estan en un orden global que resuelve los conflictos entre familias (abajo).
 *
 * -------------------------------------------------------------------------------
 * CONFLICTOS ENTRE FAMILIAS RESUELTOS (un patron no puede mapear a 2 grupos):
 * -------------------------------------------------------------------------------
 *   1. `leche de almendras/coco/arroz/avena/soya` (bebida vegetal, null) GANA a
 *      `leche`->LAC y a `avena`/`arroz`->C: BLOQUE A (null vegetal) va PRIMERO.
 *   2. `queso crema`/`philadelphia` (grasa, null) GANA a `queso`->LAC: BLOQUE B.
 *   3. `barra de proteina`/`whey bar` (mixto, null) GANA a `whey`->SP y `cereal`->C:
 *      BLOQUE C (barras) va antes que SP y que C.
 *   4. `atun/sardina/jurel ... en aceite (de oliva)` (P) GANA a `aceite`->G: el
 *      BLOQUE P (pescados) va ANTES que el BLOQUE de aceites -> G.
 *   5. `pasta/mantequilla/crema de mani|almendra|sesamo` (ARL) GANA a `pasta`->C y a
 *      `mantequilla`->G: BLOQUE de untables de fruto seco (ARL) va antes que C y G.
 *   6. `aceite de palta/maiz/coco` (G) GANA a `palta`->ARL / `maiz`->C / `coco`->G:
 *      BLOQUE de aceites -> G va antes que ARL, C y las frutas.
 *   7. `papaya` (F) GANA a `papa`->C: regla papaya->F va ANTES del BLOQUE C.
 *      (`"papaya".includes("papa")` es true — sin esto papaya caeria en C.)
 *   8. `choclo/maiz/elote` -> C (cereal), NO V: van en el BLOQUE C, y V no los lista.
 *   9. `poroto verde/green bean` (V, vaina) GANA a `poroto`->LEG: regla poroto verde
 *      -> V va ANTES que `poroto`->LEG.
 *  10. `piña`/`pina` (F) usa \bpina\b para NO capturar "esPINAca" (que es V).
 *  11. `harina de almendra/coco/mani` (fruto seco, no cereal) -> null (revision):
 *      va ANTES del BLOQUE C para no caer en `harina`->C.
 *  12. Tokens cortos peligrosos usan RegExp con limites de palabra: \bte\b, \boil\b,
 *      \begg\b (evita "eggplant"/"veggie"), \bcoco\b (evita "cocoa"), \bpina\b,
 *      \bmora\b, \bpera\b, \buva\b, \bvino\b, \bron\b, \bcola\b, \bpan\b, \bmani\b.
 *  13. `agua` nunca es null a secas (rompe "atun en agua"=P, "galletas de agua"=C):
 *      solo `agua mineral|con gas|sin gas|saborizada|purificada` -> null.
 */

import {
  classifyFood,
  categorySignal,
  keywordSignal,
  macroSignal,
  type FoodRow,
  type FoodClassification,
  type ExchangeGroupCode,
  type ClassificationTier,
} from './heuristics.ts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type OverrideConfidence = 'alta' | 'media'

export interface OverrideRule {
  /** Substring (minuscula, sin tildes) para `includes()` o RegExp para `test()`. */
  pattern: string | RegExp
  /** Codigo de grupo, o null EXPLICITO (queda sin clasificar y no sigue). */
  group: ExchangeGroupCode | null
  /** Gramos de 1 porcion de intercambio (escala SMAE, entero) o null. */
  portionGrams: number | null
  /** Cita corta de la fuente / regla de origen. */
  source: string
  confidence: OverrideConfidence
}

// ---------------------------------------------------------------------------
// Helpers de construccion (compactan las filas por bloque/fuente)
// ---------------------------------------------------------------------------

function n(pattern: string | RegExp, source: string, confidence: OverrideConfidence = 'alta'): OverrideRule {
  return { pattern, group: null, portionGrams: null, source, confidence }
}

function g(
  pattern: string | RegExp,
  group: ExchangeGroupCode,
  portionGrams: number,
  source: string,
  confidence: OverrideConfidence,
): OverrideRule {
  return { pattern, group, portionGrams, source, confidence }
}

// ---------------------------------------------------------------------------
// BLOQUE A — bebidas/quesos/yogures VEGETALES -> null (gana a leche/queso/avena/arroz)
// ---------------------------------------------------------------------------
const BLOCK_A_PLANT_NULL: OverrideRule[] = [
  n('leche de almendras', 'proteinas-lacteos.md N1 — bebida vegetal, no lacteo'),
  n('leche de almendra', 'proteinas-lacteos.md N1'),
  n('leche de coco', 'proteinas-lacteos.md N1'),
  n('leche de arroz', 'cereales-leguminosas.md E4 — bebida vegetal'),
  n('leche de avena', 'proteinas-lacteos.md N4 — bebida de avena, no LAC'),
  n('leche de soya', 'proteinas-lacteos.md N3 — bebida de soya'),
  n('leche de soja', 'proteinas-lacteos.md N3'),
  n('leche vegetal', 'proteinas-lacteos.md N2'),
  n('bebida de almendra', 'grasas-misc.md GOTCHA leche/bebida vegetal'),
  n('bebida de coco', 'grasas-misc.md GOTCHA'),
  n('bebida de arroz', 'cereales-leguminosas.md E4'),
  n('bebida de avena', 'proteinas-lacteos.md N4'),
  n('bebida de soya', 'proteinas-lacteos.md N3'),
  n('bebida vegetal', 'frutas-verduras.md 73'),
  n(/almond milk/, 'proteinas-lacteos.md N1'),
  n(/coconut milk/, 'proteinas-lacteos.md N1'),
  n(/rice milk/, 'proteinas-lacteos.md N1'),
  n(/oat milk/, 'proteinas-lacteos.md N4'),
  n(/soy milk/, 'proteinas-lacteos.md N3'),
  n(/not ?milk/, 'proteinas-lacteos.md N2 — NotCo plant-based'),
  n('milk excellence', 'proteinas-lacteos.md N2'),
  n('queso vegano', 'proteinas-lacteos.md N8'),
  n(/vegan cheese/, 'proteinas-lacteos.md N8'),
  n('queso de castana', 'proteinas-lacteos.md N8'),
  n('yogurt vegetal', 'grasas-misc.md GOTCHA — yogurt vegetal no LAC'),
  n('yogur vegetal', 'grasas-misc.md GOTCHA'),
  n('agua de coco', 'frutas-verduras.md 6 — bebida, ni F ni V'),
]

// ---------------------------------------------------------------------------
// BLOQUE B — postres lacteos / lacteos azucarados -> null (gana a leche/queso)
// ---------------------------------------------------------------------------
const BLOCK_B_DAIRY_DESSERT_NULL: OverrideRule[] = [
  n('leche condensada', 'proteinas-lacteos.md N5 — postre azucarado'),
  n(/condensed milk/, 'proteinas-lacteos.md N5'),
  n('leche asada', 'proteinas-lacteos.md N6 — postre lacteo mixto'),
  n('arroz con leche', 'proteinas-lacteos.md N6'),
  n('dulce de leche', 'proteinas-lacteos.md N6'),
  n('manjar', 'proteinas-lacteos.md N6'),
  n('queso crema', 'proteinas-lacteos.md N7 — predomina grasa, no 9 g P'),
  n(/cream cheese/, 'proteinas-lacteos.md N7'),
  n('philadelphia', 'proteinas-lacteos.md N7'),
]

// ---------------------------------------------------------------------------
// BLOQUE C — barras / dulces "protein" / batidos comerciales -> null
// (gana a whey->SP, cereal->C, granola->C, fruta)
// ---------------------------------------------------------------------------
const BLOCK_C_BARS_NULL: OverrideRule[] = [
  n('barra de proteina', 'proteinas-lacteos.md N12 — mixto proteina+CHO+grasa'),
  n('barra proteica', 'proteinas-lacteos.md N12'),
  n(/protein bar/, 'proteinas-lacteos.md N12'),
  n(/whey bar/, 'proteinas-lacteos.md N12'),
  n('alfajor de proteina', 'proteinas-lacteos.md N12'),
  n('galleta protein', 'proteinas-lacteos.md N12'),
  n(/protein cookie/, 'proteinas-lacteos.md N12'),
  n('barra de cereal', 'cereales-leguminosas.md A5 — barra ultra-procesada'),
  n('barra cereal', 'cereales-leguminosas.md A5'),
  n(/cereal bar/, 'cereales-leguminosas.md A5'),
  n('barra de granola', 'cereales-leguminosas.md A5'),
  n('barrita', 'cereales-leguminosas.md A5 / proteinas-lacteos.md N12'),
  n(/snack bar/, 'proteinas-lacteos.md N12 — snack bar mixto (gana a peanut butter->ARL)'),
  n('milkshake', 'proteinas-lacteos.md N13 — bebida/postre mixto'),
]

// ---------------------------------------------------------------------------
// BLOQUE Nbev — bebidas, alcohol, agua, te/cafe, nectar, jugo "sabor" -> null
// ---------------------------------------------------------------------------
const BLOCK_NBEV_NULL: OverrideRule[] = [
  // agua SOLO en formas inequivocas (nunca bare `agua`: rompe pescado en agua / galleta de agua)
  n('agua mineral', 'grasas-misc.md C29'),
  n('agua con gas', 'grasas-misc.md C29'),
  n('agua sin gas', 'grasas-misc.md C29'),
  n('agua saborizada', 'grasas-misc.md C29'),
  n('agua purificada', 'grasas-misc.md C29'),
  // te / cafe (lista blanca de infusiones; \bte\b nunca a secas)
  n(/\bte (negro|verde|rojo|blanco|helado)\b/, 'grasas-misc.md C30'),
  n('manzanilla', 'grasas-misc.md C30'),
  n(/\bboldo\b/, 'grasas-misc.md C30'),
  n('yerba mate', 'grasas-misc.md C30'),
  n('cafe negro', 'grasas-misc.md C31'),
  n('cafe instantaneo', 'grasas-misc.md C31'),
  n('nescafe', 'grasas-misc.md C31'),
  // gaseosas / isotonicas / energeticas / nectar azucarado
  n(/coca[- ]?cola/, 'grasas-misc.md C33'),
  n(/\bpepsi\b/, 'grasas-misc.md C33'),
  n(/\bsprite\b/, 'grasas-misc.md C33'),
  n(/\bfanta\b/, 'grasas-misc.md C33'),
  n('gaseosa', 'grasas-misc.md C33'),
  n('bebida gaseosa', 'grasas-misc.md C33'),
  n('powerade', 'grasas-misc.md C34'),
  n('gatorade', 'grasas-misc.md C34'),
  n('red bull', 'grasas-misc.md C34'),
  n('monster', 'grasas-misc.md C34'),
  n(/\bzuko\b/, 'frutas-verduras.md 61'),
  n('electrolit', 'grasas-misc.md C34'),
  n('suerox', 'frutas-verduras.md 67'),
  n('nectar', 'frutas-verduras.md 61 — nectar envasado, azucar anadida'),
  n(/\bsabor a\b/, 'frutas-verduras.md 67 — saborizante, sin fruta real'),
  // alcohol
  n('cerveza', 'grasas-misc.md C35'),
  n(/\bvino\b/, 'grasas-misc.md C35'),
  n('pisco', 'grasas-misc.md C35'),
  n(/\bron\b/, 'grasas-misc.md C35'),
  n('vodka', 'grasas-misc.md C35'),
  n('whisky', 'grasas-misc.md C35'),
  n('tequila', 'grasas-misc.md C35'),
  n(/\blicor\b/, 'grasas-misc.md C35'),
  n('espumante', 'grasas-misc.md C35'),
]

// ---------------------------------------------------------------------------
// BLOQUE Ndess — mermeladas, jaleas, helados, gelatinas, golosinas, reposteria -> null
// ---------------------------------------------------------------------------
const BLOCK_NDESS_NULL: OverrideRule[] = [
  n('mermelada', 'frutas-verduras.md 60 — 100% azucar anadida'),
  n('jalea', 'frutas-verduras.md 60'),
  n('helado', 'frutas-verduras.md 62 — postre'),
  n('sorbete', 'frutas-verduras.md 62'),
  n('gelatina', 'frutas-verduras.md 64'),
  n('gomitas', 'frutas-verduras.md 64'),
  n('compota', 'frutas-verduras.md 65 — colado/compota azucarada'),
  // reposteria: harina+azucar+grasa+huevo (no cereal simple)
  n('pan de pascua', 'cereales-leguminosas.md N4'),
  n('panettone', 'cereales-leguminosas.md N4'),
  n('queque', 'cereales-leguminosas.md N4'),
  n('kuchen', 'cereales-leguminosas.md N4'),
  n(/\btorta\b/, 'cereales-leguminosas.md N4'),
  n('brownie', 'cereales-leguminosas.md N4'),
  n('donut', 'cereales-leguminosas.md N4'),
  n(/\bdona\b/, 'cereales-leguminosas.md N4'),
  n('churro', 'cereales-leguminosas.md N4'),
  n('panqueque', 'cereales-leguminosas.md N4'),
  n('pancake', 'cereales-leguminosas.md N4'),
  n('waffle', 'cereales-leguminosas.md N4'),
  n(/\bwafle\b/, 'cereales-leguminosas.md N4'),
  n('croissant', 'cereales-leguminosas.md N4'),
  n('medialuna', 'cereales-leguminosas.md N4'),
  n('cupcake', 'cereales-leguminosas.md N4'),
  n(/\bpie\b/, 'cereales-leguminosas.md N4'),
  n('budin', 'cereales-leguminosas.md N4'),
  // galletas DULCES / rellenas (las simples de agua/soda van a C mas abajo)
  n(/galleta.*(oreo|triton|wafer|relleno|chocochip|choco chip|frac|champana|frambuesa|limon|crema)/, 'cereales-leguminosas.md N5'),
  n(/\bwafer\b/, 'cereales-leguminosas.md N5'),
  n(/\boreo\b/, 'cereales-leguminosas.md N5'),
  n('alfajor', 'cereales-leguminosas.md N5'),
  n('cuchufli', 'cereales-leguminosas.md N5'),
]

// ---------------------------------------------------------------------------
// BLOQUE Ndish — platillos / ultra-procesados mixtos -> null
// ---------------------------------------------------------------------------
const BLOCK_NDISH_NULL: OverrideRule[] = [
  n('pastel de choclo', 'cereales-leguminosas.md N1'),
  n('pastelera', 'cereales-leguminosas.md N1'),
  n('humita', 'cereales-leguminosas.md N1'),
  n(/\bpizza\b/, 'proteinas-lacteos.md N14'),
  n('empanada', 'proteinas-lacteos.md N14'),
  n(/\bsopa\b/, 'proteinas-lacteos.md N14'),
  n(/\bcaldo\b/, 'proteinas-lacteos.md N17'),
  n('consome', 'proteinas-lacteos.md N17'),
  n(/\bguiso\b/, 'cereales-leguminosas.md N2'),
  n('cazuela', 'cereales-leguminosas.md N2'),
  n('porotos con riendas', 'cereales-leguminosas.md N2'),
  n('porotos granados', 'cereales-leguminosas.md N2 — guiso mixto'),
  n(/lasa(g|gn|n)a/, 'cereales-leguminosas.md N6'),
  n('ravioli', 'cereales-leguminosas.md N6 — pasta rellena'),
  n('tortellini', 'cereales-leguminosas.md N6'),
  n('canelon', 'cereales-leguminosas.md N6'),
  n('sandwich', 'proteinas-lacteos.md N14'),
  n('completo', 'proteinas-lacteos.md N14'),
  n('hamburguesa de lenteja', 'cereales-leguminosas.md N3'),
  n('hamburguesa de soja', 'cereales-leguminosas.md N3'),
  n('hamburguesa de vegetal', 'proteinas-lacteos.md N16'),
  n('hamburguesa veggie', 'proteinas-lacteos.md N16'),
  n(/\bveggie\b/, 'proteinas-lacteos.md N16 — plant-based mixto'),
  n(/not ?burger/, 'proteinas-lacteos.md N16'),
  n('vienesa veggie', 'proteinas-lacteos.md N16'),
  n('nugget', 'proteinas-lacteos.md N14 / P31 — apanado mixto'),
  n('medallones de legumbres', 'cereales-leguminosas.md N3'),
  n('prieta', 'proteinas-lacteos.md N11'),
  n('morcilla', 'proteinas-lacteos.md N11'),
  n(/\bpate\b/, 'proteinas-lacteos.md N10 — predomina grasa'),
  n('foie', 'proteinas-lacteos.md N10'),
  n('ensalada cesar', 'frutas-verduras.md 106 — ensalada con aderezo/crutones'),
]

// ---------------------------------------------------------------------------
// BLOQUE Nsauce — salsas / condimentos -> null
// ---------------------------------------------------------------------------
const BLOCK_NSAUCE_NULL: OverrideRule[] = [
  n('salsa de tomate', 'frutas-verduras.md 69'),
  n('pomarola', 'frutas-verduras.md 69'),
  n(/\btuco\b/, 'frutas-verduras.md 69'),
  n('ketchup', 'grasas-misc.md C36'),
  n('mostaza', 'grasas-misc.md C36'),
  n('salsa de soya', 'grasas-misc.md C36'),
  n('salsa de soja', 'grasas-misc.md C36'),
  n('salsa inglesa', 'grasas-misc.md C36'),
  n('vinagre', 'grasas-misc.md C36 / frutas-verduras.md 74 — condimento'),
  n('mermelada de cebolla', 'frutas-verduras.md 66'),
  n('aderezo', 'grasas-misc.md C36 — aderezo/salsa; gana a palta/fruta "sabor X"'),
]

// ---------------------------------------------------------------------------
// BLOQUE SP — suplemento proteico en polvo -> SP (~30 g = 1 scoop)
// (las barras "protein" ya se nullearon en BLOQUE C)
// ---------------------------------------------------------------------------
const BLOCK_SP: OverrideRule[] = [
  g('whey protein', 'SP', 30, 'proteinas-lacteos.md S1', 'alta'),
  g(/\bwhey\b/, 'SP', 30, 'proteinas-lacteos.md S1 — 1 scoop', 'alta'),
  g('proteina de suero', 'SP', 30, 'proteinas-lacteos.md S1', 'alta'),
  g('aislado de suero', 'SP', 30, 'proteinas-lacteos.md S2', 'alta'),
  g('concentrado de suero', 'SP', 30, 'proteinas-lacteos.md S1', 'alta'),
  g('isolate', 'SP', 30, 'proteinas-lacteos.md S2', 'alta'),
  g('caseina', 'SP', 33, 'proteinas-lacteos.md S3', 'alta'),
  g('proteina en polvo', 'SP', 33, 'proteinas-lacteos.md S4', 'alta'),
  g(/protein powder/, 'SP', 33, 'proteinas-lacteos.md S4', 'alta'),
  g('proteina vegetal en polvo', 'SP', 33, 'proteinas-lacteos.md S4', 'alta'),
  g('mass gainer', 'SP', 30, 'proteinas-lacteos.md S5', 'media'),
  g('ganador de masa', 'SP', 30, 'proteinas-lacteos.md S5', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE P — carnes, aves, pescados, mariscos, huevo, cecinas -> P (~30 g cocido)
// VA ANTES QUE ACEITES: "atun en aceite de oliva" -> P, no G.
// ---------------------------------------------------------------------------
const BLOCK_P: OverrideRule[] = [
  // pescados/mariscos (incluye en agua / en aceite -> P, drenado)
  g('merluza', 'P', 35, 'proteinas-lacteos.md P13', 'alta'),
  g('reineta', 'P', 35, 'proteinas-lacteos.md P13', 'alta'),
  g('congrio', 'P', 35, 'proteinas-lacteos.md P13', 'alta'),
  g('corvina', 'P', 35, 'proteinas-lacteos.md P13', 'alta'),
  g('tilapia', 'P', 35, 'proteinas-lacteos.md P13', 'alta'),
  g('salmon', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g(/\batun\b/, 'P', 30, 'proteinas-lacteos.md P15 — 1/3 lata', 'alta'),
  g('jurel', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g('sardina', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g('caballa', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g('trucha', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g('albacora', 'P', 30, 'proteinas-lacteos.md P14', 'alta'),
  g('camaron', 'P', 40, 'proteinas-lacteos.md P17', 'alta'),
  g('langostino', 'P', 40, 'proteinas-lacteos.md P17', 'alta'),
  g('choritos', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('mejillon', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('almeja', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('ostion', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('calamar', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('pulpo', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('machas', 'P', 40, 'proteinas-lacteos.md P18', 'alta'),
  g('kanikama', 'P', 45, 'proteinas-lacteos.md P19 — lleva CHO', 'media'),
  g('surimi', 'P', 45, 'proteinas-lacteos.md P19', 'media'),
  // huevo
  g('clara de huevo', 'P', 60, 'proteinas-lacteos.md P21', 'alta'),
  g('claras de huevo', 'P', 60, 'proteinas-lacteos.md P21', 'alta'),
  g('huevo', 'P', 50, 'proteinas-lacteos.md P20 — 1 unidad', 'alta'),
  g(/\begg white\b/, 'P', 60, 'proteinas-lacteos.md P21', 'alta'),
  g(/\begg\b/, 'P', 50, 'proteinas-lacteos.md P20', 'alta'),
  // aves
  g('pechuga', 'P', 30, 'proteinas-lacteos.md P9 — cocida', 'alta'),
  g('pollo', 'P', 30, 'proteinas-lacteos.md P10', 'alta'),
  g('pavo', 'P', 30, 'proteinas-lacteos.md P11', 'alta'),
  // carnes rojas magras
  g('posta', 'P', 30, 'proteinas-lacteos.md P1', 'alta'),
  g('lomo liso', 'P', 30, 'proteinas-lacteos.md P2', 'alta'),
  g('lomo vetado', 'P', 30, 'proteinas-lacteos.md P2', 'alta'),
  g('filete', 'P', 30, 'proteinas-lacteos.md P2', 'alta'),
  g('bistec', 'P', 30, 'proteinas-lacteos.md P3', 'alta'),
  g('churrasco', 'P', 30, 'proteinas-lacteos.md P3', 'alta'),
  g('sobrecostilla', 'P', 30, 'proteinas-lacteos.md P3', 'alta'),
  g('plateada', 'P', 30, 'proteinas-lacteos.md P3', 'alta'),
  g('carne molida', 'P', 30, 'proteinas-lacteos.md P4', 'alta'),
  g('cerdo', 'P', 30, 'proteinas-lacteos.md P5', 'alta'),
  g('chuleta', 'P', 30, 'proteinas-lacteos.md P5', 'alta'),
  g('pernil', 'P', 30, 'proteinas-lacteos.md P5', 'alta'),
  g('cordero', 'P', 30, 'proteinas-lacteos.md P6', 'media'),
  g('higado', 'P', 30, 'proteinas-lacteos.md P7', 'alta'),
  // cecinas magras
  g('jamon de pavo', 'P', 40, 'proteinas-lacteos.md P23', 'alta'),
  g('jamon pierna', 'P', 40, 'proteinas-lacteos.md P23', 'alta'),
  g('jamon cocido', 'P', 40, 'proteinas-lacteos.md P23', 'alta'),
  g('pechuga de pavo', 'P', 40, 'proteinas-lacteos.md P26', 'media'),
  // cecinas grasas (P, pero grasa alta -> confianza baja segun research; se dejan media)
  g('salchicha', 'P', 30, 'proteinas-lacteos.md P27 — grasa alta', 'media'),
  g('vienesa', 'P', 30, 'proteinas-lacteos.md P27', 'media'),
  g('salame', 'P', 25, 'proteinas-lacteos.md P28', 'media'),
  g('chorizo', 'P', 30, 'proteinas-lacteos.md P29', 'media'),
  g('longaniza', 'P', 30, 'proteinas-lacteos.md P29', 'media'),
  g('mortadela', 'P', 30, 'proteinas-lacteos.md P30', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE Dbutter — untables de fruto seco / semilla -> ARL (~10 g)
// VA ANTES de aceites (mantequilla) y de C (pasta): "pasta de mani"->ARL, no C.
// ---------------------------------------------------------------------------
const BLOCK_DBUTTER_ARL: OverrideRule[] = [
  g(/(mantequilla|crema|pasta) de mani/, 'ARL', 10, 'grasas-misc.md 20', 'alta'),
  g(/(mantequilla|crema|pasta) de cacahuate/, 'ARL', 10, 'grasas-misc.md 20', 'alta'),
  g(/(mantequilla|crema|pasta) de almendra/, 'ARL', 10, 'grasas-misc.md 20', 'alta'),
  g(/(mantequilla|crema|pasta) de avellana/, 'ARL', 10, 'grasas-misc.md 20', 'media'),
  g('mantequilla de pistacho', 'ARL', 10, 'grasas-misc.md 20', 'media'),
  g('mantequilla de maravilla', 'ARL', 10, 'grasas-misc.md 20', 'media'),
  g(/peanut butter/, 'ARL', 10, 'grasas-misc.md 20 — corrige LEG 107 g', 'alta'),
  g(/almond butter/, 'ARL', 10, 'grasas-misc.md 20', 'alta'),
  g('pasta de sesamo', 'ARL', 10, 'grasas-misc.md 21', 'media'),
  g('tahini', 'ARL', 10, 'grasas-misc.md 21', 'media'),
  g(/\btahin\b/, 'ARL', 10, 'grasas-misc.md 21', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE Goil — aceites y grasas de cocina PURAS -> G (5-15 g)
// VA ANTES de ARL (palta) y C (maiz): "aceite de palta"->G, "aceite de maiz"->G.
// ---------------------------------------------------------------------------
const BLOCK_GOIL: OverrideRule[] = [
  g('aceite', 'G', 5, 'grasas-misc.md A1 — todo aceite = G 5 g (1 cdta)', 'alta'),
  g(/\boil\b/, 'G', 5, 'grasas-misc.md A2', 'alta'),
  g(/olive oil/, 'G', 5, 'grasas-misc.md A2', 'alta'),
  g('margarina', 'G', 5, 'grasas-misc.md A4', 'alta'),
  g(/\bghee\b/, 'G', 5, 'grasas-misc.md A5', 'alta'),
  g('manteca de cerdo', 'G', 5, 'grasas-misc.md A6', 'alta'),
  g('mayonesa', 'G', 10, 'grasas-misc.md A7', 'media'),
  g('crema de leche', 'G', 15, 'grasas-misc.md A8', 'media'),
  g('crema acida', 'G', 15, 'grasas-misc.md A8', 'media'),
  g('crema para batir', 'G', 15, 'grasas-misc.md A8', 'media'),
  // mantequilla PURA (los untables de fruto seco ya se capturaron en BLOQUE Dbutter)
  g('mantequilla', 'G', 6, 'grasas-misc.md A3', 'alta'),
  g(/\bbutter\b/, 'G', 6, 'grasas-misc.md A3', 'alta'),
  g('coco rallado', 'G', 8, 'grasas-misc.md A9', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE ARL — frutos secos / semillas / palta / aceitunas enteros -> ARL
// (los untables ya son ARL arriba; los aceites ya son G arriba)
// ---------------------------------------------------------------------------
const BLOCK_ARL: OverrideRule[] = [
  g('palta', 'ARL', 30, 'grasas-misc.md 10 — 1/3 pza', 'alta'),
  g('aguacate', 'ARL', 30, 'grasas-misc.md 10', 'alta'),
  g('aceituna', 'ARL', 30, 'grasas-misc.md 22 — 5-6 pzas', 'alta'),
  g('nuez de la india', 'ARL', 11, 'grasas-misc.md 14', 'alta'),
  g('anacardo', 'ARL', 11, 'grasas-misc.md 14', 'alta'),
  g(/cashew/, 'ARL', 11, 'grasas-misc.md 14', 'alta'),
  g('caju', 'ARL', 11, 'grasas-misc.md 14', 'alta'),
  g('nuez pecana', 'ARL', 9, 'grasas-misc.md 13', 'alta'),
  g('pecana', 'ARL', 9, 'grasas-misc.md 13', 'alta'),
  g('almendra', 'ARL', 10, 'grasas-misc.md 11 — 10 pzas', 'alta'),
  g('nueces', 'ARL', 9, 'grasas-misc.md 12 — 3 pzas', 'alta'),
  g(/\bnuez\b/, 'ARL', 9, 'grasas-misc.md 12', 'alta'),
  g('pistacho', 'ARL', 13, 'grasas-misc.md 16', 'alta'),
  g('avellana', 'ARL', 8, 'grasas-misc.md 17', 'alta'),
  g('macadamia', 'ARL', 8, 'grasas-misc.md 18', 'media'),
  g(/\bmani\b/, 'ARL', 10, 'grasas-misc.md 15 — 10 pzas', 'alta'),
  g(/peanut/, 'ARL', 10, 'grasas-misc.md 15', 'alta'),
  g('pinon', 'ARL', 10, 'grasas-misc.md 19', 'media'),
  g('semillas de chia', 'ARL', 12, 'grasas-misc.md 23', 'media'),
  g('semillas de linaza', 'ARL', 12, 'grasas-misc.md 24', 'media'),
  g('semillas de sesamo', 'ARL', 10, 'grasas-misc.md 25', 'media'),
  g('semillas de maravilla', 'ARL', 10, 'grasas-misc.md 26', 'media'),
  g('semillas de girasol', 'ARL', 10, 'grasas-misc.md 26', 'media'),
  g('semillas de zapallo', 'ARL', 12, 'grasas-misc.md 27', 'media'),
  g('semillas de calabaza', 'ARL', 12, 'grasas-misc.md 27', 'media'),
  g('pepitas de zapallo', 'ARL', 12, 'grasas-misc.md 27', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE LAC — leches, yogures, quesos REALES -> LAC
// (las bebidas vegetales y el queso crema ya se nullearon en BLOQUES A/B)
// ---------------------------------------------------------------------------
const BLOCK_LAC: OverrideRule[] = [
  g('leche en polvo', 'LAC', 30, 'proteinas-lacteos.md L3', 'media'),
  g('leche evaporada', 'LAC', 120, 'proteinas-lacteos.md L4', 'media'),
  g('leche descremada', 'LAC', 240, 'proteinas-lacteos.md L1 — 1 taza', 'alta'),
  g('leche semidescremada', 'LAC', 240, 'proteinas-lacteos.md L1', 'alta'),
  g('leche entera', 'LAC', 240, 'proteinas-lacteos.md L1', 'alta'),
  g('leche sin lactosa', 'LAC', 240, 'proteinas-lacteos.md L1', 'alta'),
  g('leche cultivada', 'LAC', 240, 'proteinas-lacteos.md L2', 'alta'),
  g('kefir', 'LAC', 240, 'proteinas-lacteos.md L2', 'alta'),
  g('yogur griego', 'LAC', 150, 'proteinas-lacteos.md L7', 'alta'),
  g('yoghurt griego', 'LAC', 150, 'proteinas-lacteos.md L7', 'alta'),
  g('yogurt griego', 'LAC', 150, 'proteinas-lacteos.md L7', 'alta'),
  g('skyr', 'LAC', 150, 'proteinas-lacteos.md L7', 'alta'),
  g('yogur', 'LAC', 200, 'proteinas-lacteos.md L6 — ~1 taza', 'alta'),
  g('yoghurt', 'LAC', 200, 'proteinas-lacteos.md L6', 'alta'),
  g('yogurt', 'LAC', 200, 'proteinas-lacteos.md L6', 'alta'),
  g('quesillo', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('queso fresco', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('queso panela', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('ricotta', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('requeson', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('queso cottage', 'LAC', 40, 'proteinas-lacteos.md L9', 'alta'),
  g('parmesano', 'LAC', 20, 'proteinas-lacteos.md L12 — muy concentrado', 'alta'),
  g('queso rallado', 'LAC', 20, 'proteinas-lacteos.md L12', 'alta'),
  g('queso mantecoso', 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g('gouda', 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g(/\bgauda\b/, 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g('mozzarella', 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g('queso de cabra', 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g(/\bfeta\b/, 'LAC', 30, 'proteinas-lacteos.md L10', 'alta'),
  g('cheddar', 'LAC', 30, 'proteinas-lacteos.md L14', 'media'),
  g('manchego', 'LAC', 25, 'proteinas-lacteos.md L13', 'alta'),
  g('emmental', 'LAC', 25, 'proteinas-lacteos.md L13', 'alta'),
  g('gruyere', 'LAC', 25, 'proteinas-lacteos.md L13', 'alta'),
  g('provolone', 'LAC', 25, 'proteinas-lacteos.md L13', 'alta'),
  // `queso` generico al final del bloque (chip de queso / laminado / otros)
  g('queso', 'LAC', 30, 'proteinas-lacteos.md L10 — queso generico', 'media'),
]

// ---------------------------------------------------------------------------
// Exclusiones de C: harina de fruto seco -> null (no cereal). ANTES del BLOQUE C.
// ---------------------------------------------------------------------------
const BLOCK_C_EXCLUSIONS: OverrideRule[] = [
  n('harina de almendra', 'cereales-leguminosas.md E2 — harina de fruto seco, no C'),
  n('harina de coco', 'cereales-leguminosas.md E2'),
  n('harina de mani', 'cereales-leguminosas.md E2'),
  // frutas que colisionan con tokens de C
  g('papaya', 'F', 150, 'frutas-verduras.md 16 — papaya es F (gana a papa->C)', 'alta'),
]

// ---------------------------------------------------------------------------
// BLOQUE LEG — legumbres -> LEG (~90 g cocido / 30 g seco)
// (poroto verde -> V se resuelve en el BLOQUE V; aca es legumbre seca/cocida)
// ---------------------------------------------------------------------------
const BLOCK_LEG: OverrideRule[] = [
  // poroto verde = vaina = VERDURA; gana a `poroto`->LEG (va antes).
  g('poroto verde', 'V', 100, 'frutas-verduras.md 104 — vaina = V, no LEG', 'media'),
  n('poroto granado', 'cereales-leguminosas.md N2 — guiso'),
  g('espirales de lentejas', 'LEG', 25, 'cereales-leguminosas.md PA6', 'media'),
  g('pasta de lenteja', 'LEG', 25, 'cereales-leguminosas.md PA6', 'media'),
  g(/(lenteja|garbanzo|poroto|frijol|alubia|haba).*(crud|seco|seca)/, 'LEG', 30, 'cereales-leguminosas.md L2 — seca', 'alta'),
  g('hummus', 'LEG', 50, 'cereales-leguminosas.md L5 — garbanzo + tahini', 'media'),
  g('edamame', 'LEG', 90, 'cereales-leguminosas.md L4', 'media'),
  g('lenteja', 'LEG', 90, 'cereales-leguminosas.md L3 — cocida 1/2 taza', 'media'),
  g('garbanzo', 'LEG', 90, 'cereales-leguminosas.md L3', 'media'),
  g('poroto', 'LEG', 90, 'cereales-leguminosas.md L3', 'media'),
  g('frijol', 'LEG', 90, 'cereales-leguminosas.md L1', 'media'),
  g('alubia', 'LEG', 90, 'cereales-leguminosas.md L3', 'media'),
  g('arveja partida', 'LEG', 90, 'cereales-leguminosas.md L1', 'media'),
  g('soja texturizada', 'LEG', 30, 'cereales-leguminosas.md L7', 'media'),
  g('soya texturizada', 'LEG', 30, 'cereales-leguminosas.md L7', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE C — cereales, pan, arroz, pasta, papa, avena, choclo, tortilla -> C
// ---------------------------------------------------------------------------
const BLOCK_C: OverrideRule[] = [
  // pan
  g(/pan.*integral/, 'C', 35, 'cereales-leguminosas.md P1', 'alta'),
  g('marraqueta', 'C', 30, 'cereales-leguminosas.md P2', 'alta'),
  g('hallulla', 'C', 30, 'cereales-leguminosas.md P2', 'alta'),
  g('pan de molde', 'C', 30, 'cereales-leguminosas.md P2', 'alta'),
  g('pan pita', 'C', 30, 'cereales-leguminosas.md P2', 'alta'),
  g('pan amasado', 'C', 30, 'cereales-leguminosas.md P2', 'alta'),
  g('tostada', 'C', 20, 'cereales-leguminosas.md P3 — pan tostado', 'alta'),
  g('pan tostado', 'C', 20, 'cereales-leguminosas.md P3', 'alta'),
  g(/galleta.*(soda|de agua|salada|criollita|saltin|agua)/, 'C', 20, 'cereales-leguminosas.md P4', 'alta'),
  g(/crackers?/, 'C', 20, 'cereales-leguminosas.md P4', 'media'),
  g('pan rallado', 'C', 20, 'cereales-leguminosas.md P5', 'media'),
  g(/\bpan\b/, 'C', 30, 'cereales-leguminosas.md P2 — pan blanco 1 reb', 'media'),
  // harinas / almidones
  g('harina de trigo', 'C', 20, 'cereales-leguminosas.md P6', 'alta'),
  g('harina integral', 'C', 20, 'cereales-leguminosas.md P6', 'alta'),
  g('harina de maiz', 'C', 20, 'cereales-leguminosas.md M4', 'alta'),
  g('maicena', 'C', 20, 'cereales-leguminosas.md P6', 'alta'),
  g('semola', 'C', 20, 'cereales-leguminosas.md P6', 'media'),
  g('polenta', 'C', 20, 'cereales-leguminosas.md M4', 'media'),
  g('harina', 'C', 20, 'cereales-leguminosas.md P6 — harina generica', 'media'),
  // arroz
  g(/arroz.*cocid/, 'C', 50, 'cereales-leguminosas.md A1 — cocido', 'alta'),
  g(/arroz.*(preparado|risotto|chaufan|sushi|graneado)/, 'C', 50, 'cereales-leguminosas.md A1', 'media'),
  g(/galleta.*arroz/, 'C', 15, 'cereales-leguminosas.md A4', 'media'),
  g('arroz inflado', 'C', 20, 'cereales-leguminosas.md A3', 'media'),
  g('arroz', 'C', 20, 'cereales-leguminosas.md A2 — crudo de gondola', 'alta'),
  // pasta / fideos
  g(/(pasta|fideos?|spaghetti|spagueti|tallarin|penne|fusilli|farfalle|linguine|macarrones|mostacholi).*cocid/, 'C', 55, 'cereales-leguminosas.md PA1 — cocida', 'alta'),
  g('spaghetti', 'C', 20, 'cereales-leguminosas.md PA2 — seco', 'alta'),
  g('spagueti', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('tallarin', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('fideos', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g(/\bfideo\b/, 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('penne', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('fusilli', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('macarrones', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('mostacholi', 'C', 20, 'cereales-leguminosas.md PA2', 'alta'),
  g('noqui', 'C', 55, 'cereales-leguminosas.md PA3 — fresco', 'media'),
  // avena / cereal caja / granola
  g(/avena.*cocid/, 'C', 120, 'cereales-leguminosas.md AV1 — corrige 312 g', 'media'),
  g('avena', 'C', 20, 'cereales-leguminosas.md AV2 — hojuela cruda', 'alta'),
  g('corn flakes', 'C', 20, 'cereales-leguminosas.md AV3', 'media'),
  g('cornflakes', 'C', 20, 'cereales-leguminosas.md AV3', 'media'),
  g('zucaritas', 'C', 20, 'cereales-leguminosas.md AV3 — corrige F', 'media'),
  g('chocapic', 'C', 20, 'cereales-leguminosas.md AV3', 'media'),
  g('nestum', 'C', 20, 'cereales-leguminosas.md AV3', 'media'),
  g('granola', 'C', 30, 'cereales-leguminosas.md AV4', 'media'),
  g('muesli', 'C', 30, 'cereales-leguminosas.md AV4', 'media'),
  // papa / tuberculos
  g(/papa.*cocid/, 'C', 85, 'cereales-leguminosas.md T1 — cocida', 'alta'),
  g('papa al horno', 'C', 85, 'cereales-leguminosas.md T1', 'alta'),
  g('pure de papa', 'C', 100, 'cereales-leguminosas.md T2', 'media'),
  g('papas fritas', 'C', 30, 'cereales-leguminosas.md T4 — frito', 'media'),
  g('papas chips', 'C', 20, 'cereales-leguminosas.md T5', 'media'),
  g(/camote.*cocid/, 'C', 60, 'cereales-leguminosas.md T6', 'alta'),
  g('camote', 'C', 60, 'cereales-leguminosas.md T7', 'media'),
  g('batata', 'C', 60, 'cereales-leguminosas.md T7', 'media'),
  g('yuca', 'C', 70, 'cereales-leguminosas.md T8', 'media'),
  g('mandioca', 'C', 70, 'cereales-leguminosas.md T8', 'media'),
  g(/\bpapa\b/, 'C', 85, 'cereales-leguminosas.md T3 — papa entera', 'alta'),
  g('papas', 'C', 85, 'cereales-leguminosas.md T3', 'media'),
  // quinoa y otros granos
  g(/(quinoa|quinua|cuscus|couscous|bulgur|cebada|mijo|farro|amaranto|mote).*cocid/, 'C', 70, 'cereales-leguminosas.md Q1', 'media'),
  g('quinoa', 'C', 20, 'cereales-leguminosas.md Q2 — seco', 'media'),
  g('quinua', 'C', 20, 'cereales-leguminosas.md Q2', 'media'),
  g('couscous', 'C', 20, 'cereales-leguminosas.md Q2', 'media'),
  g('cuscus', 'C', 20, 'cereales-leguminosas.md Q2', 'media'),
  g('bulgur', 'C', 20, 'cereales-leguminosas.md Q2', 'media'),
  // choclo / maiz
  g(/choclo.*(cocid|grano|desgranado)/, 'C', 80, 'cereales-leguminosas.md M1', 'alta'),
  g('choclo', 'C', 80, 'cereales-leguminosas.md M1', 'alta'),
  g('elote', 'C', 80, 'cereales-leguminosas.md M1', 'alta'),
  g(/popcorn/, 'C', 20, 'cereales-leguminosas.md M2', 'media'),
  g('palomitas', 'C', 20, 'cereales-leguminosas.md M2', 'media'),
  g('cabritas', 'C', 20, 'cereales-leguminosas.md M2', 'media'),
  g('nachos', 'C', 20, 'cereales-leguminosas.md M3', 'media'),
  g('doritos', 'C', 20, 'cereales-leguminosas.md M3', 'media'),
  // tortilla / wrap
  g('tortilla de maiz', 'C', 30, 'cereales-leguminosas.md W1', 'alta'),
  g(/\bwrap\b/, 'C', 30, 'cereales-leguminosas.md W2', 'media'),
  g('rapiditas', 'C', 30, 'cereales-leguminosas.md W2', 'media'),
  g('arepa', 'C', 30, 'cereales-leguminosas.md W4', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE F — frutas frescas, jugos naturales, deshidratadas -> F
// ---------------------------------------------------------------------------
const BLOCK_F: OverrideRule[] = [
  // deshidratadas / jugos (porcion chica; van ANTES que la fruta fresca homonima)
  g(/pasas/, 'F', 20, 'frutas-verduras.md 41 — deshidratada', 'alta'),
  g(/uvas? pasas/, 'F', 20, 'frutas-verduras.md 41', 'alta'),
  g(/ciruela.*(pasa|deshidratada|seca)/, 'F', 25, 'frutas-verduras.md 42', 'media'),
  g('datil', 'F', 18, 'frutas-verduras.md 43 — muy denso', 'alta'),
  g(/higo.*(seco|deshidratado)/, 'F', 30, 'frutas-verduras.md 44', 'media'),
  g('orejones', 'F', 30, 'frutas-verduras.md 45', 'media'),
  g(/jugo.*natural/, 'F', 125, 'frutas-verduras.md 40 — 1/2 taza', 'media'),
  g('jugo exprimido', 'F', 125, 'frutas-verduras.md 40', 'media'),
  // frescas
  g('manzana', 'F', 106, 'frutas-verduras.md 1', 'alta'),
  g('platano', 'F', 60, 'frutas-verduras.md 2 — 1/2 pza', 'alta'),
  g(/\bbanana\b/, 'F', 60, 'frutas-verduras.md 2', 'alta'),
  g('naranja', 'F', 150, 'frutas-verduras.md 3', 'media'),
  g('mandarina', 'F', 128, 'frutas-verduras.md 4', 'alta'),
  g(/\bpera\b/, 'F', 97, 'frutas-verduras.md 5', 'alta'),
  g(/\bperas\b/, 'F', 97, 'frutas-verduras.md 5', 'alta'),
  g('durazno', 'F', 150, 'frutas-verduras.md 6', 'media'),
  g('damasco', 'F', 120, 'frutas-verduras.md 7', 'media'),
  g('ciruela', 'F', 130, 'frutas-verduras.md 8', 'media'),
  g(/\buva\b/, 'F', 84, 'frutas-verduras.md 9', 'alta'),
  g(/\buvas\b/, 'F', 84, 'frutas-verduras.md 9', 'alta'),
  g('frutilla', 'F', 200, 'frutas-verduras.md 10', 'alta'),
  g(/fresa/, 'F', 200, 'frutas-verduras.md 10', 'alta'),
  g('arandano', 'F', 100, 'frutas-verduras.md 11', 'alta'),
  g('frambuesa', 'F', 123, 'frutas-verduras.md 12', 'alta'),
  g(/\bmora\b/, 'F', 150, 'frutas-verduras.md 13', 'media'),
  g(/\bmoras\b/, 'F', 150, 'frutas-verduras.md 13', 'media'),
  g('kiwi', 'F', 114, 'frutas-verduras.md 14', 'alta'),
  g('mango', 'F', 100, 'frutas-verduras.md 15', 'media'),
  g(/\bpina\b/, 'F', 114, 'frutas-verduras.md 17 — \\bpina\\b evita espinaca', 'media'),
  g('ananas', 'F', 114, 'frutas-verduras.md 17', 'media'),
  g('melon', 'F', 180, 'frutas-verduras.md 18', 'alta'),
  g('sandia', 'F', 180, 'frutas-verduras.md 19', 'alta'),
  g('cereza', 'F', 88, 'frutas-verduras.md 20', 'media'),
  g('pomelo', 'F', 120, 'frutas-verduras.md 21', 'media'),
  g('nectarina', 'F', 140, 'frutas-verduras.md 25 — NO confundir con nectar', 'media'),
  g('chirimoya', 'F', 60, 'frutas-verduras.md 28', 'media'),
  g('frutos rojos', 'F', 120, 'frutas-verduras.md 31', 'media'),
]

// ---------------------------------------------------------------------------
// BLOQUE V — verduras -> V (default 100 g; hoja 80 g; densa 70 g)
// ---------------------------------------------------------------------------
const BLOCK_V: OverrideRule[] = [
  g(/\btomate\b/, 'V', 100, 'frutas-verduras.md 80', 'alta'),
  g('lechuga', 'V', 80, 'frutas-verduras.md 81 — hoja', 'media'),
  g('espinaca', 'V', 80, 'frutas-verduras.md 82', 'alta'),
  g('acelga', 'V', 80, 'frutas-verduras.md 83', 'media'),
  g('brocoli', 'V', 90, 'frutas-verduras.md 84', 'alta'),
  g('coliflor', 'V', 100, 'frutas-verduras.md 85', 'alta'),
  g('zanahoria', 'V', 70, 'frutas-verduras.md 86 — densa', 'media'),
  g('betarraga', 'V', 70, 'frutas-verduras.md 87', 'media'),
  g('remolacha', 'V', 70, 'frutas-verduras.md 87', 'media'),
  g('pepino', 'V', 100, 'frutas-verduras.md 88', 'alta'),
  g(/\bapio\b/, 'V', 100, 'frutas-verduras.md 89', 'alta'),
  g('zapallo italiano', 'V', 100, 'frutas-verduras.md 90', 'alta'),
  g('zapallito', 'V', 100, 'frutas-verduras.md 90', 'alta'),
  g('zucchini', 'V', 100, 'frutas-verduras.md 90', 'alta'),
  g('berenjena', 'V', 100, 'frutas-verduras.md 92', 'media'),
  g(/\beggplant\b/, 'V', 100, 'frutas-verduras.md 92', 'media'),
  g('pimenton', 'V', 90, 'frutas-verduras.md 93', 'alta'),
  g('morron', 'V', 90, 'frutas-verduras.md 93', 'media'),
  g('cebolla', 'V', 70, 'frutas-verduras.md 94 — densa', 'media'),
  g('champinon', 'V', 90, 'frutas-verduras.md 95', 'alta'),
  g('champignon', 'V', 90, 'frutas-verduras.md 95', 'alta'),
  g('portobello', 'V', 90, 'frutas-verduras.md 95', 'alta'),
  g('esparrago', 'V', 90, 'frutas-verduras.md 96', 'alta'),
  g('rabano', 'V', 100, 'frutas-verduras.md 97', 'alta'),
  g('alcachofa', 'V', 100, 'frutas-verduras.md 99', 'media'),
  g('kale', 'V', 80, 'frutas-verduras.md 100 — hoja', 'media'),
  g('rucula', 'V', 60, 'frutas-verduras.md 101', 'media'),
  g('repollo', 'V', 90, 'frutas-verduras.md 102', 'media'),
  g('palmito', 'V', 100, 'frutas-verduras.md 103', 'media'),
  // (poroto verde -> V ya se resuelve al inicio del BLOQUE LEG, antes de poroto->LEG)
  g('germinado', 'V', 50, 'frutas-verduras.md 105', 'media'),
]

// ---------------------------------------------------------------------------
// Tabla UNICA consolidada (orden global = resolucion de conflictos; ver cabecera).
// ---------------------------------------------------------------------------
export const OVERRIDES: readonly OverrideRule[] = [
  ...BLOCK_A_PLANT_NULL,
  ...BLOCK_B_DAIRY_DESSERT_NULL,
  ...BLOCK_C_BARS_NULL,
  ...BLOCK_NBEV_NULL,
  ...BLOCK_NDESS_NULL,
  ...BLOCK_NDISH_NULL,
  ...BLOCK_NSAUCE_NULL,
  // Exclusiones que deben ganar a ARL/C (harina de fruto seco -> null; papaya -> F).
  ...BLOCK_C_EXCLUSIONS,
  ...BLOCK_SP,
  ...BLOCK_P,
  ...BLOCK_DBUTTER_ARL,
  ...BLOCK_GOIL,
  ...BLOCK_ARL,
  ...BLOCK_LAC,
  ...BLOCK_LEG,
  ...BLOCK_C,
  ...BLOCK_F,
  ...BLOCK_V,
]

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Normaliza igual que `heuristics.normalizeName` (minuscula, sin tildes, trim). */
export function normalizeForOverride(name: string | null | undefined): string {
  if (!name) return ''
  return stripAccents(name).toLowerCase().trim()
}

/** Primer override cuyo `pattern` matchea el nombre normalizado, o null. */
export function matchOverride(name: string | null | undefined): OverrideRule | null {
  const normalized = normalizeForOverride(name)
  if (normalized === '') return null
  for (const rule of OVERRIDES) {
    const hit = typeof rule.pattern === 'string' ? normalized.includes(rule.pattern) : rule.pattern.test(normalized)
    if (hit) return rule
  }
  return null
}

// ---------------------------------------------------------------------------
// Clasificacion con paso PREVIO de overrides
// ---------------------------------------------------------------------------

function overrideReason(rule: OverrideRule, signals: FoodClassification['signals']): string {
  const pat = rule.pattern instanceof RegExp ? `/${rule.pattern.source}/` : `'${rule.pattern}'`
  const grp = rule.group ?? 'sin grupo (null override)'
  const gr = rule.portionGrams != null ? ` ${rule.portionGrams} g` : ''
  return (
    `override[${rule.confidence}] ${pat} ⇒ ${grp}${gr} · ${rule.source} · ` +
    `[base cat=${signals.category ?? '—'} kw=${signals.keyword ?? '—'} macro=${signals.macro ?? '—'}]`
  )
}

/**
 * Clasifica un food con el PASO PREVIO de overrides curados y, si ninguno matchea,
 * cae al clasificador puro de 3 senales (`classifyFood`). Puro y determinista; nunca
 * lanza. Es lo que consume el driver (`classifyDataset`). `classifyFood` queda intacto
 * (los tests del clasificador base siguen ejercitando solo las 3 senales).
 */
export function classifyFoodWithOverrides(food: FoodRow): FoodClassification {
  const rule = matchOverride(food.name)
  if (!rule) return classifyFood(food)

  // Senales base (para el reporte / juicio CEO: que decia la heuristica vs el override).
  const signals = {
    category: categorySignal(food),
    keyword: keywordSignal(food),
    macro: macroSignal(food),
  }

  // null EXPLICITO: siempre manda. Queda sin clasificar y no sigue.
  if (rule.group === null) {
    return {
      group: null,
      tier: 'bajo',
      exchangePortionGrams: null,
      exchangePortionLabel: null,
      signals,
      reason: overrideReason(rule, signals),
    }
  }

  // alta -> alto; media -> medio (media SIEMPRE se queda media).
  const tier: ClassificationTier = rule.confidence === 'alta' ? 'alto' : 'medio'
  const grams = rule.portionGrams
  const label = grams != null ? `${grams} g` : null

  return {
    group: rule.group,
    tier,
    exchangePortionGrams: grams,
    exchangePortionLabel: label,
    signals,
    reason: overrideReason(rule, signals),
  }
}
