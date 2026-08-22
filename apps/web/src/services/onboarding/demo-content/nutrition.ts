/**
 * Contenido del alumno de ejemplo — rama `nutrition` («Ana, 34, recomposición», SPEC §4).
 *
 * Esqueleto provisional (D4: lo revisa la nutricionista de confianza). Datos PUROS.
 *
 * La pauta se escribe en **Nutrición V2** (no V1): la superficie viva del alumno es V2 y el seed
 * de app-review (`scripts/seed-appreview-demo.mjs`) escribe V1 — no es referencia para esto.
 * Estrategia `hybrid`: gramos donde importan (proteína y grasa) y PORCIONES por franja
 * (`nutrition_slot_exchange_targets_v2`) para que el paciente pueda intercambiar. Es lo que el
 * catálogo llama «1800 kcal por porciones».
 *
 * Alimentos referenciados por nombre contra el catálogo global verificado en LIVE el 2026-08-22.
 * Los códigos de grupo de intercambio (`P`, `C`, `F`, `V`, `G`, `LAC`) son los del catálogo del
 * sistema (`exchange_groups.is_system = true`).
 */

import type { BiaBlueprint, IntakeEntryBlueprint, NutritionPlanBlueprint } from './types'

/** Pauta 1800 kcal por porciones, 4 tiempos de comida. Objetivo: P 130 · C 190 · G 55. */
export const PORTIONS_1800: NutritionPlanBlueprint = {
    name: '1800 kcal por porciones',
    strategy: 'hybrid',
    visibleNotes:
        'Pauta de ejemplo. Los gramos son una referencia: dentro de cada tiempo puedes intercambiar por las porciones indicadas. Toma al menos 2 litros de agua al día.',
    dayVariants: [
        {
            key: 'base',
            label: 'Día base',
            isDefault: true,
            targets: { calories: 1800, proteinG: 130, carbsG: 190, fatsG: 55, fiberG: 28, waterMl: 2000 },
            slots: [
                {
                    code: 'desayuno',
                    name: 'Desayuno',
                    startTime: '08:00',
                    endTime: '09:30',
                    required: true,
                    instructions: 'Si entrenas en la mañana, deja la fruta para después del entreno.',
                    targets: { calories: 450, proteinG: 30, carbsG: 55, fatsG: 12 },
                    items: [
                        { food: { names: ['Avena instantánea Quaker', 'Avena integral traficional'] }, quantity: 50, unit: 'g' },
                        { food: { names: ['Yogur griego Yoplait'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Plátano / Banana'] }, quantity: 100, unit: 'g' },
                        { food: { names: ['Almendras'] }, quantity: 10, unit: 'g', notes: 'Un puñado chico.' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'C', portions: 2, notes: 'Avena, pan integral o arroz.' },
                        { groupCode: 'LAC', portions: 1 },
                        { groupCode: 'F', portions: 1 },
                        { groupCode: 'G', portions: 1 },
                    ],
                },
                {
                    code: 'almuerzo',
                    name: 'Almuerzo',
                    startTime: '13:00',
                    endTime: '14:30',
                    required: true,
                    instructions: 'Llena la mitad del plato con verduras; el arroz o la quinoa van medidos en crudo.',
                    targets: { calories: 620, proteinG: 45, carbsG: 65, fatsG: 18 },
                    items: [
                        { food: { names: ['Pechuga de Pollo cocida', 'Pechuga de pollo (cruda)'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Arroz integral (crudo)', 'Arroz blanco (crudo)'] }, quantity: 60, unit: 'g' },
                        { food: { names: ['Brócoli (cocido)', 'Brócoli (crudo)'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Tomate'] }, quantity: 100, unit: 'g' },
                        { food: { names: ['Aceite de Oliva Extra Virgen'] }, quantity: 10, unit: 'ml' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'P', portions: 5, notes: 'Pollo, pescado, huevo o legumbre + cereal.' },
                        { groupCode: 'C', portions: 3 },
                        { groupCode: 'V', portions: 2, notes: 'Libres: come hasta quedar satisfecha.' },
                        { groupCode: 'G', portions: 2 },
                    ],
                },
                {
                    code: 'colacion',
                    name: 'Colación de la tarde',
                    startTime: '17:00',
                    endTime: '18:00',
                    required: false,
                    instructions: 'Si el almuerzo fue tarde, puedes saltarla sin culpa.',
                    targets: { calories: 230, proteinG: 15, carbsG: 25, fatsG: 8 },
                    items: [
                        { food: { names: ['Manzana'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Almendras'] }, quantity: 15, unit: 'g' },
                        { food: { names: ['Yogurt Soprole sin azúcar', 'Yogur vainilla light'] }, quantity: 150, unit: 'g', optional: true },
                    ],
                    exchangeTargets: [
                        { groupCode: 'F', portions: 1 },
                        { groupCode: 'G', portions: 1 },
                    ],
                },
                {
                    code: 'cena',
                    name: 'Cena',
                    startTime: '20:30',
                    endTime: '21:30',
                    required: true,
                    instructions: 'Proteína + verduras siempre; el carbohidrato lo ajustas según cómo entrenaste.',
                    targets: { calories: 500, proteinG: 40, carbsG: 45, fatsG: 17 },
                    items: [
                        { food: { names: ['Salmón', 'Atún al agua (en lata)'] }, quantity: 130, unit: 'g' },
                        { food: { names: ['Quinoa (cocida)'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Palta'] }, quantity: 50, unit: 'g' },
                        { food: { names: ['Brócoli (cocido)', 'Brócoli (crudo)'] }, quantity: 150, unit: 'g' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'P', portions: 4 },
                        { groupCode: 'C', portions: 2 },
                        { groupCode: 'V', portions: 2 },
                        { groupCode: 'G', portions: 1 },
                    ],
                },
            ],
        },
    ],
}

/** Pauta híbrida de 2200 kcal — plantilla `hybrid-2200` del catálogo (no la trae el demo). */
export const HYBRID_2200: NutritionPlanBlueprint = {
    name: '2200 kcal híbrida',
    strategy: 'hybrid',
    visibleNotes:
        'Gramos en la proteína y la grasa; el resto por porciones. Pensada para quien entrena fuerza 4 veces por semana.',
    dayVariants: [
        {
            key: 'base',
            label: 'Día base',
            isDefault: true,
            targets: { calories: 2200, proteinG: 160, carbsG: 240, fatsG: 65, fiberG: 32, waterMl: 2500 },
            slots: [
                {
                    code: 'desayuno',
                    name: 'Desayuno',
                    startTime: '08:00',
                    endTime: '09:30',
                    required: true,
                    targets: { calories: 550, proteinG: 38, carbsG: 65, fatsG: 15 },
                    items: [
                        { food: { names: ['Avena instantánea Quaker', 'Avena integral traficional'] }, quantity: 70, unit: 'g' },
                        { food: { names: ['Huevo'] }, quantity: 100, unit: 'g' },
                        { food: { names: ['Leche semidescremada Colún'] }, quantity: 200, unit: 'ml' },
                        { food: { names: ['Plátano / Banana'] }, quantity: 120, unit: 'g' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'C', portions: 3 },
                        { groupCode: 'P', portions: 2 },
                        { groupCode: 'LAC', portions: 1 },
                        { groupCode: 'F', portions: 1 },
                    ],
                },
                {
                    code: 'almuerzo',
                    name: 'Almuerzo',
                    startTime: '13:00',
                    endTime: '14:30',
                    required: true,
                    targets: { calories: 750, proteinG: 55, carbsG: 85, fatsG: 20 },
                    items: [
                        { food: { names: ['Pechuga de Pollo cocida', 'Pechuga de pollo (cruda)'] }, quantity: 180, unit: 'g' },
                        { food: { names: ['Arroz integral (crudo)', 'Arroz blanco (crudo)'] }, quantity: 80, unit: 'g' },
                        { food: { names: ['Brócoli (cocido)', 'Brócoli (crudo)'] }, quantity: 200, unit: 'g' },
                        { food: { names: ['Aceite de Oliva Extra Virgen'] }, quantity: 10, unit: 'ml' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'P', portions: 6 },
                        { groupCode: 'C', portions: 4 },
                        { groupCode: 'V', portions: 2 },
                        { groupCode: 'G', portions: 2 },
                    ],
                },
                {
                    code: 'post_entreno',
                    name: 'Post entreno',
                    startTime: '18:30',
                    endTime: '19:30',
                    required: false,
                    targets: { calories: 300, proteinG: 27, carbsG: 35, fatsG: 4 },
                    items: [
                        { food: { names: ['Yogur griego Yoplait'] }, quantity: 200, unit: 'g' },
                        { food: { names: ['Manzana'] }, quantity: 150, unit: 'g' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'LAC', portions: 2 },
                        { groupCode: 'F', portions: 1 },
                    ],
                },
                {
                    code: 'cena',
                    name: 'Cena',
                    startTime: '21:00',
                    endTime: '22:00',
                    required: true,
                    targets: { calories: 600, proteinG: 42, carbsG: 55, fatsG: 24 },
                    items: [
                        { food: { names: ['Salmón', 'Atún al agua (en lata)'] }, quantity: 150, unit: 'g' },
                        { food: { names: ['Lentejas cocidas'] }, quantity: 200, unit: 'g' },
                        { food: { names: ['Palta'] }, quantity: 60, unit: 'g' },
                        { food: { names: ['Tomate'] }, quantity: 120, unit: 'g' },
                    ],
                    exchangeTargets: [
                        { groupCode: 'P', portions: 4 },
                        { groupCode: 'C', portions: 2 },
                        { groupCode: 'V', portions: 2 },
                        { groupCode: 'G', portions: 2 },
                    ],
                },
            ],
        },
    ],
}

/**
 * BIA de Ana, hace 10 días. Captura MANUAL del reporte de la máquina (el módulo no calcula nada
 * en BIA): los campos son el superset opcional de `BiaMetrics` de `@eva/bodycomp`.
 */
export const ANA_BIA: BiaBlueprint = {
    daysAgo: 10,
    deviceBrand: 'InBody',
    deviceModel: '270',
    weightKg: 64,
    heightCm: 165,
    notes: 'Medición en ayunas, sin entrenar el día anterior. Es la línea de base del proceso.',
    metrics: {
        skeletalMuscleMassKg: 24.6,
        fatMassKg: 19.8,
        bodyFatPercent: 30.9,
        totalBodyWaterL: 32.4,
        intracellularWaterL: 20.1,
        extracellularWaterL: 12.3,
        ecwTbwRatio: 0.38,
        visceralFatLevel: 7,
        basalMetabolicRateKcal: 1310,
        phaseAngleDeg: 5.2,
    },
}

/**
 * ISAK de Ana, hace 3 días. Aquí sí hay cálculo: `computeIsak` (@eva/bodycomp) deriva
 * fraccionamiento de 5 componentes, somatotipo y % de grasa desde estas medidas crudas. El seed
 * NO escribe métricas a mano: pasa este input por el mismo motor que usa el módulo.
 */
export const ANA_ISAK_RAW = {
    sex: 'female' as const,
    ageYears: 34,
    heightCm: 165,
    weightKg: 63.6,
    sittingHeightCm: 86,
    skinfolds: {
        tricepsMm: 18,
        subscapularMm: 14,
        supraspinaleMm: 12,
        abdominalMm: 20,
        frontThighMm: 24,
        medialCalfMm: 14,
        bicepsMm: 8,
        iliacCrestMm: 18,
    },
    girths: {
        headCm: 55,
        armRelaxedCm: 28,
        armFlexedCm: 29.5,
        forearmCm: 24,
        chestMesosternaleCm: 87,
        waistCm: 76,
        thighCm: 55,
        calfCm: 35,
    },
    breadths: {
        biacromialCm: 36,
        biiliocristalCm: 27,
        humerusCm: 6.1,
        femurCm: 8.9,
        transverseChestCm: 26,
        apChestDepthCm: 17.5,
    },
}

export const ANA_ISAK_DAYS_AGO = 3
export const ANA_ISAK_NOTES =
    'Perfil restringido ISAK tomado en consulta. Sirve de referencia para comparar contra la BIA.'

/**
 * Siete días de registro de comidas del paciente demo (`nutrition_intake_entries`).
 * Tres o cuatro entradas por día — suficiente para que la adherencia del panel tenga forma, sin
 * inflar la tabla. El día 0 (hoy) queda con el desayuno solo: el resto está por registrarse.
 */
export const ANA_INTAKE: readonly IntakeEntryBlueprint[] = [
    // Hoy: solo desayuno.
    { daysAgo: 0, food: { names: ['Avena instantánea Quaker'] }, quantity: 50, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 0, food: { names: ['Yogur griego Yoplait'] }, quantity: 150, unit: 'g', mealSlot: 'breakfast' },
    // Ayer y los cinco días previos: días completos con desviaciones realistas.
    { daysAgo: 1, food: { names: ['Avena instantánea Quaker'] }, quantity: 50, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 1, food: { names: ['Pechuga de Pollo cocida'] }, quantity: 140, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 1, food: { names: ['Arroz integral (crudo)'] }, quantity: 60, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 1, food: { names: ['Salmón'] }, quantity: 120, unit: 'g', mealSlot: 'dinner' },
    { daysAgo: 2, food: { names: ['Yogur griego Yoplait'] }, quantity: 150, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 2, food: { names: ['Pechuga de Pollo cocida'] }, quantity: 150, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 2, food: { names: ['Quinoa (cocida)'] }, quantity: 150, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 2, food: { names: ['Manzana'] }, quantity: 150, unit: 'g', mealSlot: 'afternoon_snack' },
    { daysAgo: 3, food: { names: ['Avena instantánea Quaker'] }, quantity: 45, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 3, food: { names: ['Atún al agua (en lata)'] }, quantity: 120, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 3, food: { names: ['Brócoli (cocido)'] }, quantity: 200, unit: 'g', mealSlot: 'dinner' },
    { daysAgo: 4, food: { names: ['Huevo'] }, quantity: 100, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 4, food: { names: ['Pan integral Bimbo'] }, quantity: 2, unit: 'un', mealSlot: 'breakfast' },
    { daysAgo: 4, food: { names: ['Pechuga de Pollo cocida'] }, quantity: 150, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 4, food: { names: ['Palta'] }, quantity: 50, unit: 'g', mealSlot: 'dinner' },
    { daysAgo: 5, food: { names: ['Avena instantánea Quaker'] }, quantity: 50, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 5, food: { names: ['Lentejas cocidas'] }, quantity: 200, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 5, food: { names: ['Manzana'] }, quantity: 150, unit: 'g', mealSlot: 'afternoon_snack' },
    { daysAgo: 6, food: { names: ['Yogur griego Yoplait'] }, quantity: 150, unit: 'g', mealSlot: 'breakfast' },
    { daysAgo: 6, food: { names: ['Pechuga de Pollo cocida'] }, quantity: 160, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 6, food: { names: ['Arroz integral (crudo)'] }, quantity: 70, unit: 'g', mealSlot: 'lunch' },
    { daysAgo: 6, food: { names: ['Almendras'] }, quantity: 20, unit: 'g', mealSlot: 'afternoon_snack' },
]
