import { describe, it, expect } from 'vitest'
import {
  FOOD_SEARCH_MIN_QUERY,
  foodFilterModeFromParam,
  foodFilterModeToParam,
  isOffsetListMode,
  nextFoodFilterMode,
  resolveFoodCatalogMode,
  usesLocalTextFilter,
  type FoodCatalogMode,
  type FoodFilterMode,
} from './food-catalog-mode'

describe('foodFilterModeFromParam / foodFilterModeToParam', () => {
  it('lee los dos chips desde la URL', () => {
    expect(foodFilterModeFromParam('editados')).toBe('edited')
    expect(foodFilterModeFromParam('mios')).toBe('mine')
  })

  it('cae al catalogo con el param ausente, vacio o desconocido', () => {
    // Un deep-link viejo o roto tiene que mostrar el catalogo, nunca una pantalla en blanco.
    expect(foodFilterModeFromParam(null)).toBe('all')
    expect(foodFilterModeFromParam(undefined)).toBe('all')
    expect(foodFilterModeFromParam('')).toBe('all')
    expect(foodFilterModeFromParam('editados-2')).toBe('all')
    expect(foodFilterModeFromParam('EDITADOS')).toBe('all')
  })

  it('omite el param en el default y lo escribe en los otros dos', () => {
    expect(foodFilterModeToParam('all')).toBeNull()
    expect(foodFilterModeToParam('edited')).toBe('editados')
    expect(foodFilterModeToParam('mine')).toBe('mios')
  })

  it('ida y vuelta: lo que se escribe es lo que se lee', () => {
    for (const mode of ['all', 'edited', 'mine'] as FoodFilterMode[]) {
      expect(foodFilterModeFromParam(foodFilterModeToParam(mode))).toBe(mode)
    }
  })
})

describe('nextFoodFilterMode', () => {
  it('tocar un chip inactivo cambia directo a el', () => {
    expect(nextFoodFilterMode('all', 'mine')).toBe('mine')
    expect(nextFoodFilterMode('all', 'edited')).toBe('edited')
  })

  it('los chips son EXCLUYENTES: activar uno apaga el otro', () => {
    expect(nextFoodFilterMode('edited', 'mine')).toBe('mine')
    expect(nextFoodFilterMode('mine', 'edited')).toBe('edited')
  })

  it('tocar el chip activo lo apaga y vuelve al catalogo', () => {
    expect(nextFoodFilterMode('mine', 'mine')).toBe('all')
    expect(nextFoodFilterMode('edited', 'edited')).toBe('all')
  })
})

describe('resolveFoodCatalogMode', () => {
  it('sin filtro y sin texto muestra el catalogo (F4.5: navegar sin buscar)', () => {
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: '' })).toBe('browse')
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: '   ' })).toBe('browse')
  })

  it('sin filtro y con texto corto invita a seguir escribiendo, no vuelve al catalogo', () => {
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: 'p' })).toBe('invite')
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: ' p ' })).toBe('invite')
  })

  it('sin filtro y con el minimo de la RPC busca', () => {
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: 'po' })).toBe('search')
    expect(resolveFoodCatalogMode({ filterMode: 'all', query: 'pollo' })).toBe('search')
    expect('po'.length).toBe(FOOD_SEARCH_MIN_QUERY)
  })

  it('el filtro MANDA sobre el texto: dentro de un chip nunca se busca en el servidor', () => {
    // Es lo que evita mezclar el cursor keyset de la RPC con el offset del listado.
    for (const query of ['', 'p', 'pollo']) {
      expect(resolveFoodCatalogMode({ filterMode: 'mine', query })).toBe('mine')
      expect(resolveFoodCatalogMode({ filterMode: 'edited', query })).toBe('edited')
    }
  })
})

describe('usesLocalTextFilter / isOffsetListMode', () => {
  const ALL_MODES: FoodCatalogMode[] = ['browse', 'invite', 'search', 'mine', 'edited']

  it('solo los modos con universo propio filtran el texto en cliente', () => {
    expect(ALL_MODES.filter(usesLocalTextFilter)).toEqual(['mine', 'edited'])
  })

  it('los tres modos por offset son los que cargan primera pagina al entrar', () => {
    // `search` lo atiende el efecto de busqueda (keyset) e `invite` no consulta nada.
    expect(ALL_MODES.filter(isOffsetListMode)).toEqual(['browse', 'mine', 'edited'])
  })

  it('ningun modo por keyset se cuela en el camino de offset', () => {
    expect(isOffsetListMode('search')).toBe(false)
    expect(isOffsetListMode('invite')).toBe(false)
    expect(usesLocalTextFilter('browse')).toBe(false)
    expect(usesLocalTextFilter('search')).toBe(false)
  })
})
