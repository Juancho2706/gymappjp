# White-label ronda 2 — Lista consolidada de mejoras (2026-07-02)

> Síntesis del re-research post-implementación (fuentes: `rereseach-mejoras-2.md` + `rereseach-mejoras-coach.md`, investigación web jul-2026). Priorizada por impacto en percepción de marca ÷ esfuerzo. Cero AI. Todo compatible con el patrón RN "una app + branding in-app".

## Tier 1 — Máximo impacto / esfuerzo razonable (recomiendo próximo ciclo)

1. **Momento de instalación PWA brandeado** (S-M · web · ALTO) — prompt A2HS con la marca del coach + hoja de instrucciones iOS brandeada + screenshots del manifest. Es EL momento donde el alumno decide si "instala la app de su coach".
2. **Tarjetas compartibles auto-generadas** (M · ambas · ALTO) — PR/racha/resumen mensual como imagen con tema+logo del coach + link de invitación. Cada share = marketing orgánico del coach. Sinergia directa con el "Compartí tu logro" ya existente.
3. **Landing pública brandeada en /c/[slug]** (M · web · ALTO para retener al COACH) — hoy el link del coach cae directo al login; una landing con su marca, bio, testimonios editables y CTA "aplicar para entrenar" (lead → dashboard del coach) convierte el link del coach en su página de venta. Lo que FitBudd/Kajabi cobran aparte.
4. **QR de invitación brandeado** (S · ambas · MEDIO) — logo+color, imprimible, deep-link a su /c/[slug]. Barato y tangible (el coach lo pega en el gym).
5. **Panel "Mi Marca en números"** (S-M · web · ALTO retención coach) — cuántos alumnos instalaron su app, opens de sus push, shares con su marca. Gap de mercado confirmado: nadie del nicho lo da; hace VISIBLE el valor del white-label (y del tier Pro).

## Tier 2 — Alto impacto / más esfuerzo (agendar)

6. **Subdominio por coach** (`coach.eva-app.cl`) (L · web · ALTO) — la URL es marca; BYO-domain como fase 2. Cuidado: cookies/proxy (hay arquitectura previa de subdominios enterprise pa' reusar).
7. **Carnet de socio en Apple/Google Wallet** (M-L · nativo-first · ALTO) — pass brandeado del coach en la billetera del alumno; push del pass con ~90% open. Candidato estrella pa'l track RN.
8. **Kit de marketing descargable** (M · web · MEDIO-ALTO) — avatar/cover/stories auto-generados con su tema, QR card imprimible, link-in-bio brandeado tipo Linktree. El coach "siente" su marca fuera de la app.
9. **Certificados/diplomas de hitos** (S-M · ambas · MEDIO-ALTO) — PDF+imagen brandeados por hitos (primer mes, 50 sesiones, meta de peso). Combina con P7 badges del research del alumno.
10. **Programa de referidos brandeado** (M · web · MEDIO) — link único por coach, banner en la app del alumno, recompensa configurable por el coach.

## Tier 3 — Complementos (cuando sobre ciclo)

11. **Presets de tono/voz por coach** (M · ambas · MEDIO) — motivador/técnico/cercano: cambia el microcopy de la app del alumno (saludos, celebraciones, recordatorios) desde plantillas curadas. Sin AI: son strings.
12. **Watermark de marca en fotos de progreso compartidas** (S · ambas · MEDIO).
13. **Sonido + haptic de marca** (M · ambas · MEDIO-BAJO) — biblioteca curada opt-in (celebración de PR con "su" sonido).
14. **Emails desde el dominio del coach** (L · web · MEDIO) — DKIM/SPF por tenant; caro de operar, solo si BYO-domain despega.
15. **Splash Android = color de marca** (S) — cerrar el residuo G6 del manifest.

## Zona pagos (SOLO investigado, decisión aparte)
- Cobro in-app coach→alumno con split + checkout brandeado del coach — los líderes lo tienen; es OTRO negocio (comisiones, SERNAC, MP marketplace). Requiere su propio plan si algún día se abre.

## Nota RN
Todo lo anterior respeta el patrón decidido (app única + brand layer server-driven). Wallet pass (7), haptics (13) y widgets son los argumentos de venta del track RN cuando se retome.
