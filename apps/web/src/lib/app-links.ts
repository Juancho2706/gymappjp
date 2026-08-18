// URLs de las stores de la app EVA.
//
// El App Store ID venía ERRADO (`eva-fitness/id6739734027`, otro nombre y otro id): la ficha real
// es la que confirma `apps/mobile/eas.json` en `submit.*.ios.ascAppId` = 6770426633, publicada como
// «EVA · Coach & Alumno». Verificado contra el enlace vivo del dueño (2026-08-17).
//
// Sin segmento de país a propósito: Apple redirige a la tienda del visitante. Comprobado 200 en
// `/app/id…`, `/cl/…` y `/es/…`; la forma corta es la única que no asume el storefront de nadie.
export const IOS_STORE_URL = 'https://apps.apple.com/app/id6770426633'

// Play NO está publicada al público todavía: la ficha responde 404 (canal de testing interno).
// No enlazar desde superficies públicas hasta que la ficha resuelva; el flag lo hace explícito para
// que nadie pinte un badge de Play sin comprobarlo.
export const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=cl.evaapp.eva'
export const ANDROID_STORE_IS_PUBLIC = false
