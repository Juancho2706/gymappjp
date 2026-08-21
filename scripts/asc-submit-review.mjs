#!/usr/bin/env node
/**
 * Envía una versión iOS a revisión en App Store Connect usando la API oficial (JSON:API v1).
 *
 * Por qué existe (2026-08-20): «Añadir a revisión» en la web de ASC exige la sesión del titular y
 * a veces hay que mandarla cuando él no está en la PC. La API Key de ASC ya vive en GitHub Secrets
 * (la usa `eas submit`), así que el mismo workflow puede crear la versión, cargar «Novedades»,
 * adjuntar la build ya procesada en TestFlight y enviar la review submission.
 *
 * Qué hace, en orden (idempotente: cada paso revisa antes de escribir):
 *   1. Lista las versiones iOS de la app y aborta si alguna sigue en revisión (Apple no acepta dos).
 *   2. Busca la versión `VERSION`; si no existe la crea (releaseType AFTER_APPROVAL = se publica
 *      sola al aprobarse, como venía pasando con 1.1.0).
 *   3. Escribe «Novedades» (whatsNew) en cada locale pedido. ASC exige el campo en TODAS las
 *      localizaciones habilitadas (gotcha del 19-08: el primer envío de 1.1.1 falló por EN vacío).
 *   4. Adjunta la build `BUILD_NUMBER` (debe estar VALID = «Lista para enviar» en TestFlight).
 *   5. Si la versión nueva no tiene App Review Information, copia la de la versión anterior
 *      (cuenta demo, contacto, notas) — misma info que Apple ya tiene, sin tipear nada nuevo.
 *   6. Crea la review submission, agrega la versión y la envía.
 *
 * DRY_RUN=1 hace solo lecturas e imprime el plan. Nunca imprime contraseñas ni el P8.
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_P8 (contenido del .p8), APP_ID, VERSION, BUILD_NUMBER,
 *      WHATS_NEW_JSON ('{"es-MX":"…","en-US":"…"}'), DRY_RUN.
 */
import { createPrivateKey, sign } from 'node:crypto'

const BASE = 'https://api.appstoreconnect.apple.com/v1'
const env = (k, fallback) => {
    const v = process.env[k]
    if (v == null || v === '') {
        if (fallback !== undefined) return fallback
        console.error(`Falta la variable ${k}`)
        process.exit(2)
    }
    return v
}

const KEY_ID = env('ASC_KEY_ID')
const ISSUER_ID = env('ASC_ISSUER_ID')
const P8 = env('ASC_P8').replace(/\\n/g, '\n')
const APP_ID = env('APP_ID')
const VERSION = env('VERSION')
const BUILD_NUMBER = env('BUILD_NUMBER')
const WHATS_NEW = JSON.parse(env('WHATS_NEW_JSON', '{}'))
const DRY_RUN = env('DRY_RUN', '1') !== '0'

function b64url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** JWT ES256 de 15 min. `ieee-p1363` devuelve r||s crudo, que es el formato JOSE (sin DER). */
function makeToken() {
    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))
    const payload = b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }))
    const data = `${header}.${payload}`
    const key = createPrivateKey({ key: P8, format: 'pem' })
    const sig = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' })
    return `${data}.${b64url(sig)}`
}

let token = makeToken()
let tokenAt = Date.now()

async function api(method, path, body) {
    if (Date.now() - tokenAt > 10 * 60 * 1000) { token = makeToken(); tokenAt = Date.now() }
    const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* cuerpo no-JSON */ }
    if (!res.ok) {
        const detail = json?.errors?.map(e => `${e.status} ${e.code}: ${e.title} — ${e.detail ?? ''}`).join(' | ') ?? text.slice(0, 500)
        throw new Error(`${method} ${path} → ${res.status}: ${detail}`)
    }
    return json
}

function log(...a) { console.log(...a) }
function plan(...a) { console.log(DRY_RUN ? '[DRY-RUN] haría:' : '→', ...a) }

async function main() {
    log(`App ${APP_ID} · versión ${VERSION} · build ${BUILD_NUMBER} · ${DRY_RUN ? 'DRY-RUN (solo lectura)' : 'EJECUCIÓN REAL'}`)

    // 1) Versiones existentes
    const versions = await api('GET', `/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`)
    const rows = versions.data.map(v => ({ id: v.id, version: v.attributes.versionString, state: v.attributes.appStoreState }))
    log('Versiones iOS:', rows.map(r => `${r.version}=${r.state}`).join(' · '))
    const blocking = rows.filter(r => r.version !== VERSION && ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE'].includes(r.state))
    if (blocking.length) {
        console.error(`ABORTO: hay otra versión ocupando la cola de revisión: ${blocking.map(b => `${b.version}=${b.state}`).join(', ')}`)
        process.exit(3)
    }

    // 2) Versión objetivo
    let target = rows.find(r => r.version === VERSION)
    if (!target) {
        plan(`crear la versión ${VERSION} (AFTER_APPROVAL)`)
        if (!DRY_RUN) {
            const created = await api('POST', '/appStoreVersions', {
                data: {
                    type: 'appStoreVersions',
                    attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'AFTER_APPROVAL' },
                    relationships: { app: { data: { type: 'apps', id: APP_ID } } },
                },
            })
            target = { id: created.data.id, version: VERSION, state: created.data.attributes.appStoreState }
        }
    } else {
        log(`Versión ${VERSION} ya existe (${target.state}, id ${target.id})`)
        if (!['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(target.state)) {
            console.error(`ABORTO: la versión ${VERSION} está en estado ${target.state}; no se puede (re)enviar desde acá.`)
            process.exit(3)
        }
    }
    if (DRY_RUN && !target) { log('Sin versión creada en dry-run: el resto del plan se imprime en abstracto.'); }

    // 3) Novedades por locale
    const locales = Object.keys(WHATS_NEW)
    if (locales.length === 0) console.warn('AVISO: WHATS_NEW_JSON vacío — ASC va a rechazar el envío si alguna localización no tiene Novedades.')
    if (target) {
        const locs = await api('GET', `/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)
        const byLocale = new Map(locs.data.map(l => [l.attributes.locale, l]))
        log('Localizaciones de la versión:', [...byLocale.keys()].join(', ') || '(ninguna todavía)')
        for (const locale of locales) {
            const existing = byLocale.get(locale)
            if (existing) {
                plan(`whatsNew ${locale} (${WHATS_NEW[locale].length} chars)`)
                if (!DRY_RUN) await api('PATCH', `/appStoreVersionLocalizations/${existing.id}`, {
                    data: { type: 'appStoreVersionLocalizations', id: existing.id, attributes: { whatsNew: WHATS_NEW[locale] } },
                })
            } else {
                plan(`crear localización ${locale} con whatsNew`)
                if (!DRY_RUN) await api('POST', '/appStoreVersionLocalizations', {
                    data: {
                        type: 'appStoreVersionLocalizations',
                        attributes: { locale, whatsNew: WHATS_NEW[locale] },
                        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: target.id } } },
                    },
                })
            }
        }
        const missing = [...byLocale.keys()].filter(l => !locales.includes(l))
        if (missing.length) console.warn(`AVISO: localizaciones SIN Novedades en este envío: ${missing.join(', ')} — si están habilitadas, ASC rechaza el envío.`)
    }

    // 4) Build
    const builds = await api('GET', `/builds?filter[app]=${APP_ID}&filter[version]=${BUILD_NUMBER}&filter[preReleaseVersion.version]=${VERSION}&limit=5`)
    const build = builds.data.find(b => b.attributes.processingState === 'VALID') ?? builds.data[0]
    if (!build) { console.error(`ABORTO: no existe la build ${BUILD_NUMBER} para ${VERSION} en ASC.`); process.exit(3) }
    log(`Build ${BUILD_NUMBER}: id ${build.id}, processingState ${build.attributes.processingState}, expirada=${build.attributes.expired}`)
    if (build.attributes.processingState !== 'VALID') { console.error('ABORTO: la build no está VALID (procesando o inválida).'); process.exit(3) }
    if (target) {
        plan(`adjuntar build ${BUILD_NUMBER} a la versión ${VERSION}`)
        if (!DRY_RUN) await api('PATCH', `/appStoreVersions/${target.id}/relationships/build`, { data: { type: 'builds', id: build.id } })
    }

    // 5) App Review Information (copiar de la versión anterior si falta)
    if (target) {
        let detail = null
        try { detail = (await api('GET', `/appStoreVersions/${target.id}/appStoreReviewDetail`)).data } catch { detail = null }
        if (detail) {
            log(`App Review Information presente (demo requerida=${detail.attributes.demoAccountRequired}, cuenta=${detail.attributes.demoAccountName ?? '—'})`)
        } else {
            const previous = rows
                .filter(r => r.version !== VERSION)
                .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]
            let prevDetail = null
            if (previous) { try { prevDetail = (await api('GET', `/appStoreVersions/${previous.id}/appStoreReviewDetail`)).data } catch { prevDetail = null } }
            if (!prevDetail) {
                console.error('ABORTO: la versión nueva no tiene App Review Information y no pude copiarla de la anterior. Cargarla a mano en ASC.')
                process.exit(3)
            }
            const a = prevDetail.attributes
            plan(`copiar App Review Information de ${previous.version} (contacto ${a.contactEmail ?? '—'}, demo ${a.demoAccountName ?? '—'})`)
            if (!DRY_RUN) await api('POST', '/appStoreReviewDetails', {
                data: {
                    type: 'appStoreReviewDetails',
                    attributes: {
                        contactFirstName: a.contactFirstName, contactLastName: a.contactLastName,
                        contactPhone: a.contactPhone, contactEmail: a.contactEmail,
                        demoAccountName: a.demoAccountName, demoAccountPassword: a.demoAccountPassword,
                        demoAccountRequired: a.demoAccountRequired, notes: a.notes,
                    },
                    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: target.id } } },
                },
            })
        }
    }

    // 6) Review submission
    if (target) {
        const subs = await api('GET', `/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=10`)
        log('Review submissions abiertas:', subs.data.map(s => `${s.id}=${s.attributes.state}`).join(' · ') || '(ninguna)')
        let sub = subs.data.find(s => s.attributes.state === 'READY_FOR_REVIEW')
        if (subs.data.some(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(s.attributes.state))) {
            console.error('ABORTO: ya hay una submission esperando/en revisión.'); process.exit(3)
        }
        if (!sub) {
            plan('crear review submission iOS')
            if (!DRY_RUN) sub = (await api('POST', '/reviewSubmissions', {
                data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
            })).data
        }
        if (sub) {
            const items = await api('GET', `/reviewSubmissions/${sub.id}/items?limit=10`)
            const hasVersion = items.data.some(i => i.relationships?.appStoreVersion?.data?.id === target.id)
            if (!hasVersion) {
                plan(`agregar la versión ${VERSION} a la submission ${sub.id}`)
                if (!DRY_RUN) await api('POST', '/reviewSubmissionItems', {
                    data: {
                        type: 'reviewSubmissionItems',
                        relationships: {
                            reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
                            appStoreVersion: { data: { type: 'appStoreVersions', id: target.id } },
                        },
                    },
                })
            }
            plan(`ENVIAR la submission ${sub.id}`)
            if (!DRY_RUN) await api('PATCH', `/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } })
        } else {
            plan('crear submission + agregar versión + enviar')
        }
        if (!DRY_RUN) {
            const after = await api('GET', `/appStoreVersions/${target.id}`)
            log(`Estado final de ${VERSION}: ${after.data.attributes.appStoreState}`)
        }
    }
    log(DRY_RUN ? 'DRY-RUN terminado. Nada se escribió.' : 'Listo.')
}

main().catch(err => { console.error(String(err.message ?? err)); process.exit(1) })
