import { describe, it, expect } from 'vitest'
import {
    EQUIPMENT_OPTIONS,
    MUSCLE_GROUPS,
    MUSCLE_GROUP_REGIONS,
    equipmentLabel,
    equipmentOption,
    catalogMuscleGroup,
    isCatalogMuscleGroup,
    muscleGroupRegion,
    muscleGroupToRegion,
} from './muscle-map'

/**
 * Guarda del catálogo compartido del formulario de ejercicios (web + RN). Antes de esto
 * había dos listas divergentes y ningún test que las atara.
 */
describe('MUSCLE_GROUP_REGIONS / MUSCLE_GROUPS', () => {
    it('particiona exactamente la lista plana (mismos valores, sin sobras ni faltantes)', () => {
        const fromRegions = MUSCLE_GROUP_REGIONS.flatMap((r) => [...r.groups])
        // El ORDEN no se compara a propósito: la lista plana conserva el orden histórico del
        // catálogo del coach y las regiones ordenan para el selector (ver docblock).
        expect([...fromRegions].sort()).toEqual([...MUSCLE_GROUPS].sort())
    })

    it('conserva el orden histórico del catálogo del coach (Hombros primero)', () => {
        // Este orden es el de los encabezados de «Ejercicios» y el de los filtros: cambiarlo
        // le mueve la primera pantalla a todos los coaches. Movilidad/Rehabilitación al final.
        expect(MUSCLE_GROUPS[0]).toBe('Hombros')
        expect(MUSCLE_GROUPS.slice(-2)).toEqual(['Movilidad', 'Rehabilitación'])
        expect(MUSCLE_GROUPS.indexOf('Bíceps')).toBe(1)
        expect(MUSCLE_GROUPS.indexOf('Pectorales')).toBeGreaterThan(MUSCLE_GROUPS.indexOf('Dorsales'))
    })

    it('no tiene grupos duplicados', () => {
        expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length)
    })

    it('incluye los valores que vivían en LIVE fuera de catálogo', () => {
        // Los dos bugs que motivaron la consolidación: «Movilidad» faltaba en RN y
        // «Rehabilitación» no estaba en NINGUNA de las dos listas.
        expect(MUSCLE_GROUPS).toContain('Movilidad')
        expect(MUSCLE_GROUPS).toContain('Rehabilitación')
    })

    it('ninguna región pasa de 6 grupos (tope de pills sin scroll)', () => {
        for (const region of MUSCLE_GROUP_REGIONS) {
            expect(region.groups.length).toBeGreaterThan(0)
            expect(region.groups.length).toBeLessThanOrEqual(6)
        }
    })

    it('las regiones tienen id y rótulo únicos', () => {
        expect(new Set(MUSCLE_GROUP_REGIONS.map((r) => r.id)).size).toBe(MUSCLE_GROUP_REGIONS.length)
        expect(new Set(MUSCLE_GROUP_REGIONS.map((r) => r.label)).size).toBe(MUSCLE_GROUP_REGIONS.length)
    })
})

describe('muscleGroupRegion', () => {
    it('devuelve la región de cada grupo del catálogo', () => {
        for (const region of MUSCLE_GROUP_REGIONS) {
            for (const group of region.groups) {
                expect(muscleGroupRegion(group)).toBe(region.id)
            }
        }
    })

    it('tolera tildes, mayúsculas y espacios de borde', () => {
        expect(muscleGroupRegion('espalda alta')).toBe('torso')
        expect(muscleGroupRegion('  ISQUIOTIBIALES  ')).toBe('inferior')
        expect(muscleGroupRegion('Cuadriceps')).toBe('inferior')
    })

    it('devuelve null para valores fuera de catálogo y para vacío', () => {
        expect(muscleGroupRegion('Cuello')).toBeNull()
        expect(muscleGroupRegion('')).toBeNull()
        expect(muscleGroupRegion(null)).toBeNull()
        expect(muscleGroupRegion(undefined)).toBeNull()
    })

    it('catalogMuscleGroup devuelve el valor canónico (normalizando tildes y mayúsculas)', () => {
        // Sin esto, un `muscle_group` guardado como «Espalda alta» caía en la región Torso pero
        // no marcaba ninguna opción: RN pintaba una pill duplicada y la web dejaba el Select vacío.
        expect(catalogMuscleGroup('espalda alta')).toBe('Espalda Alta')
        expect(catalogMuscleGroup('  CUADRICEPS ')).toBe('Cuádriceps')
        expect(catalogMuscleGroup('Rehabilitacion')).toBe('Rehabilitación')
        expect(catalogMuscleGroup('Cuello')).toBeNull()
        expect(catalogMuscleGroup(null)).toBeNull()
        expect(catalogMuscleGroup('')).toBeNull()
    })

    it('catalogMuscleGroup es idempotente sobre el catálogo', () => {
        for (const group of MUSCLE_GROUPS) expect(catalogMuscleGroup(group)).toBe(group)
    })

    it('isCatalogMuscleGroup separa catálogo de legado', () => {
        expect(isCatalogMuscleGroup('Rehabilitación')).toBe(true)
        expect(isCatalogMuscleGroup('Cuello')).toBe(false)
        expect(isCatalogMuscleGroup(null)).toBe(false)
    })
})

describe('regresión contra el mapa de silueta', () => {
    it('todo grupo de fuerza sigue mapeando a una región dibujable', () => {
        // Cardio / Movilidad / Rehabilitación son ejes propios, no músculos: no pintan silueta.
        const noRegion = new Set(['Cardio', 'Movilidad', 'Rehabilitación'])
        for (const group of MUSCLE_GROUPS) {
            if (noRegion.has(group)) {
                expect(muscleGroupToRegion(group)).toBeNull()
            } else {
                expect(muscleGroupToRegion(group)).not.toBeNull()
            }
        }
    })
})

describe('equipmentOption / equipmentLabel', () => {
    it('mapea los valores en inglés de LIVE a las opciones en español', () => {
        expect(equipmentOption('dumbbell')).toBe('Peso libre')
        expect(equipmentOption('barbell')).toBe('Peso libre')
        expect(equipmentOption('ez barbell')).toBe('Peso libre')
        expect(equipmentOption('weighted')).toBe('Peso libre')
        expect(equipmentOption('body weight')).toBe('Corporal')
        expect(equipmentOption('cable')).toBe('Poleas')
        expect(equipmentOption('leverage machine')).toBe('Máquina')
        expect(equipmentOption('smith machine')).toBe('Máquina')
        expect(equipmentOption('sled machine')).toBe('Máquina')
        expect(equipmentOption('band')).toBe('Banda')
        expect(equipmentOption('kettlebell')).toBe('Kettlebell')
        expect(equipmentOption('none')).toBe('Otro')
    })

    it('las 7 opciones ofrecidas se mapean a sí mismas (idempotencia)', () => {
        for (const opt of EQUIPMENT_OPTIONS) {
            expect(equipmentOption(opt)).toBe(opt)
        }
    })

    it('normaliza tildes y mayúsculas de los valores en español', () => {
        expect(equipmentOption('MÁQUINA')).toBe('Máquina')
        expect(equipmentOption('maquina')).toBe('Máquina')
        expect(equipmentOption('Banda elástica')).toBe('Banda')
        expect(equipmentOption('Ninguno')).toBe('Otro')
    })

    it('devuelve null (y conserva la etiqueta cruda) para lo que no reconoce', () => {
        expect(equipmentOption('Bastón de madera')).toBeNull()
        expect(equipmentOption(null)).toBeNull()
        expect(equipmentOption('')).toBeNull()
        expect(equipmentLabel('Bastón de madera')).toBe('Bastón de madera')
        expect(equipmentLabel('dumbbell')).toBe('Peso libre')
    })
})
