import { describe, expect, it } from 'vitest'
import {
  EVA_LOADER_IDENTITY,
  fitLoaderWordmark,
  isOwnBrandColor,
  resolveLoaderIdentity,
} from '../../apps/mobile/lib/loader-identity'

/**
 * La decision "¿el loader es EVA o es la marca del coach?" — el bug que reportaba el owner
 * ("tengo Mi marca activada y el splash/los loaders siguen mostrando EVA") vivia justo aca.
 */
describe('resolveLoaderIdentity', () => {
  it('sin branding es identidad EVA', () => {
    expect(resolveLoaderIdentity(null)).toEqual(EVA_LOADER_IDENTITY)
    expect(resolveLoaderIdentity(undefined).kind).toBe('eva')
  })

  it('coach sin nada propio (azul EVA, sin logo, sin loader) sigue siendo EVA', () => {
    const identity = resolveLoaderIdentity({
      primaryColor: '#1462DC',
      displayName: 'Coach Nuevo',
      loaderIconMode: 'eva',
      loaderVariant: 'eva',
    })
    expect(identity.kind).toBe('eva')
    expect(identity.word).toBe('EVA')
    expect(identity.tintFigure).toBe(false)
  })

  it('color propio sin logo ⇒ figura teñida + wordmark con el nombre de la marca', () => {
    const identity = resolveLoaderIdentity({
      primaryColor: '#E0218A',
      displayName: 'Rosa Fit',
      loaderIconMode: 'eva',
      loaderVariant: 'eva',
    })
    expect(identity).toEqual({
      kind: 'brand',
      word: 'ROSA FIT',
      logoUri: null,
      tintFigure: true,
      showIcon: true,
    })
  })

  it('con logo manda el logo aunque el icono nunca se haya tocado', () => {
    const identity = resolveLoaderIdentity(
      { primaryColor: '#E0218A', displayName: 'Rosa Fit', logoUrl: 'https://cdn/logo.png' },
      'light',
    )
    expect(identity.logoUri).toBe('https://cdn/logo.png')
    expect(identity.tintFigure).toBe(false)
  })

  it('en oscuro gana el logo oscuro y cae al claro si no existe', () => {
    const source = {
      primaryColor: '#E0218A',
      displayName: 'Rosa Fit',
      logoUrl: 'https://cdn/claro.png',
      logoUrlDark: 'https://cdn/oscuro.png',
    }
    expect(resolveLoaderIdentity(source, 'dark').logoUri).toBe('https://cdn/oscuro.png')
    expect(resolveLoaderIdentity(source, 'light').logoUri).toBe('https://cdn/claro.png')
    expect(resolveLoaderIdentity({ ...source, logoUrlDark: null }, 'dark').logoUri).toBe('https://cdn/claro.png')
  })

  it('"Sin icono" se respeta siempre; deja solo el wordmark', () => {
    const identity = resolveLoaderIdentity({
      primaryColor: '#E0218A',
      displayName: 'Rosa Fit',
      logoUrl: 'https://cdn/logo.png',
      loaderIconMode: 'none',
    })
    expect(identity.showIcon).toBe(false)
    expect(identity.logoUri).toBeNull()
    expect(identity.tintFigure).toBe(false)
  })

  it('"EVA" solo gana como eleccion cuando el coach configuro su loader', () => {
    const base = { primaryColor: '#E0218A', displayName: 'Rosa Fit', logoUrl: 'https://cdn/logo.png' }
    // Nunca configuro loader ⇒ ese 'eva' es el default del editor, no una decision: va el logo.
    expect(resolveLoaderIdentity({ ...base, loaderIconMode: 'eva' }).logoUri).toBe('https://cdn/logo.png')
    // Con animacion elegida, "EVA" ES una decision: figura teñida en vez del logo.
    const decided = resolveLoaderIdentity({ ...base, loaderIconMode: 'eva', loaderVariant: 'radar' })
    expect(decided.logoUri).toBeNull()
    expect(decided.tintFigure).toBe(true)
  })

  it('el texto del loader gana sobre el nombre de la marca', () => {
    const identity = resolveLoaderIdentity({
      primaryColor: '#E0218A',
      displayName: 'Rosa Fit',
      useCustomLoader: true,
      loaderText: 'rosa',
    })
    expect(identity.word).toBe('ROSA')
  })

  it('el toggle sin texto no cuenta como loader personalizado', () => {
    const identity = resolveLoaderIdentity({
      primaryColor: '#1462DC',
      displayName: 'Coach Nuevo',
      useCustomLoader: true,
      loaderText: '   ',
    })
    expect(identity.kind).toBe('eva')
  })

  it('un compositor valido alcanza para ser marca; uno roto no', () => {
    const base = { primaryColor: '#1462DC', displayName: 'Coach Nuevo' }
    expect(resolveLoaderIdentity({ ...base, loaderConfig: '{"symbol":"flame","animation":"pulso"}' }).kind).toBe('brand')
    expect(resolveLoaderIdentity({ ...base, loaderConfig: '{"symbol":"nope"}' }).kind).toBe('eva')
    expect(resolveLoaderIdentity({ ...base, loaderVariant: 'no-existe' }).kind).toBe('eva')
  })
})

describe('isOwnBrandColor', () => {
  it('los azules de sistema no son marca', () => {
    for (const blue of ['#1462DC', '#1462dc', '#2563EB', '#007AFF']) {
      expect(isOwnBrandColor(blue)).toBe(false)
    }
  })

  it('un hex propio si, y un valor invalido no', () => {
    expect(isOwnBrandColor('#E0218A')).toBe(true)
    expect(isOwnBrandColor('rosa')).toBe(false)
    expect(isOwnBrandColor(null)).toBe(false)
  })
})

describe('fitLoaderWordmark', () => {
  it('deja pasar un nombre corto y colapsa espacios', () => {
    expect(fitLoaderWordmark('  Rosa   Fit ')).toBe('Rosa Fit')
  })

  it('un nombre largo se queda con la primera palabra, no con un corte a la mitad', () => {
    expect(fitLoaderWordmark('Josefit Entrenamiento Personal')).toBe('Josefit')
  })

  it('si ni la primera palabra entra, corta al tope', () => {
    expect(fitLoaderWordmark('Superentrenamientoglobal')).toBe('Superentrenami')
  })
})
