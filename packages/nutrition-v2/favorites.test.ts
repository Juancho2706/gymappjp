import { describe, expect, it } from 'vitest'
import { sortFoodsByFavoriteFirst } from './favorites'

type Row = { id: string; name: string }

const row = (id: string): Row => ({ id, name: id })

describe('sortFoodsByFavoriteFirst', () => {
  it('pone los favoritos primero preservando el orden relativo (estable)', () => {
    const items = [row('a'), row('b'), row('c'), row('d')]
    const favorites = new Set(['c', 'a'])
    const result = sortFoodsByFavoriteFirst(items, favorites)
    // 'a' y 'c' suben, pero conservan su orden original entre sí (a antes que c).
    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('devuelve una copia sin mutar la entrada', () => {
    const items = [row('a'), row('b')]
    const result = sortFoodsByFavoriteFirst(items, new Set(['b']))
    expect(result).not.toBe(items)
    expect(items.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sin favoritos deja el orden intacto', () => {
    const items = [row('a'), row('b'), row('c')]
    expect(sortFoodsByFavoriteFirst(items, new Set()).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('ignora ids favoritos que no están en la lista', () => {
    const items = [row('a'), row('b')]
    expect(sortFoodsByFavoriteFirst(items, new Set(['zzz'])).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('todos favoritos = mismo orden', () => {
    const items = [row('a'), row('b'), row('c')]
    expect(sortFoodsByFavoriteFirst(items, new Set(['a', 'b', 'c'])).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})
