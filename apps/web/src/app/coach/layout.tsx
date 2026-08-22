import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachTopBar } from '@/components/coach/CoachTopBar'
import { GuidePill } from '@/components/coach/GuidePill'
import { CoachMainWrapper } from '@/components/coach/CoachMainWrapper'
import { RosterViewProvider } from '@/components/coach/RosterViewContext'
import { CoachSuccessAnimationLazy } from '@/components/coach/CoachSuccessAnimationLazy'
import { NewsFeedProvider } from '@/components/coach/NewsFeedProvider'
import { getCoach, getActiveStandaloneClientCount } from '@/lib/coach/get-coach'
import { isValidInviteCode } from '@/lib/coach/invite-code'
import { PwaRegister } from '@/components/PwaRegister'
import { IdentifyOnMount } from '@/components/analytics/IdentifyOnMount'
import { OverLimitBanner } from './_components/OverLimitBanner'
import { PublicCodeRequiredModal } from './_components/PublicCodeRequiredModal'
import { ensureCoachPublicCode } from './_data/public-code.queries'
import { getUnreadNewsCount, getPublishedNewsItems } from '@/lib/news/queries'
import type { Metadata } from 'next'
import { BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { generateBrandPalette } from '@/lib/color-utils'
import { resolveBrandTheme, deriveSportTokens, resolvePresetBranding, consolidateStandaloneBranding } from '@eva/brand-kit'
import { isBrandingAllowed, tierMaxClientsFor, TIER_LABELS, type SubscriptionTier } from '@eva/tiers'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { resolveLoaderVariant } from '@/lib/brand-loaders'
import { buildSealCssVars } from '@/lib/seal-vars'
import { getCoachEnterpriseContext, getCoachTeamContext } from './_data/layout.queries'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender, listUserWorkspacesForRender } from '@/services/auth/workspace-render-cache'
import {
    applyOperatorKillSwitch,
    getCoachEnabledModules,
    getTeamEnabledModules,
    type EnabledModules,
} from '@/services/entitlements.service'
import { disabledDomainsFromPrefs, readCoachDomainPrefs } from '@/services/coach/persona.service'
import { getPersonaScreenContext } from './onboarding/persona/_data/persona.queries'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | EVA',
    },
}

// Dashboard autenticado: el layout lee cookies (sesion) para TODO /coach ⇒ render dinamico.
export const dynamic = 'force-dynamic'

/** Parse del tier crudo de DB a uno de los 6 valores del CHECK (incluye legacy). NO es venta. */
function normalizeCoachTier(raw: string | null | undefined): SubscriptionTier {
    const v = String(raw ?? 'free').toLowerCase()
    if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
    return 'free'
}

/**
 * Consola: "cleaning up async info that was not on the parent Suspense boundary" con stack
 * `chrome-extension://…/installHook.js` → hook de **React Developer Tools** (no es tu bundle).
 * Desactiva la extensión o prueba incógnito sin extensiones; el aviso suele desaparecer.
 * @see https://github.com/vercel/next.js/discussions/84973
 */
export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const coach = await getCoach()

    if (!coach) {
        redirect('/login')
    }

    // Onboarding v2 — dónde vive el gate de «¿A qué te dedicas?» (decisión D8): en `proxy.ts`,
    // NO acá. Un layout de Next no recibe el pathname, así que este archivo no puede distinguir
    // «/coach/dashboard» de «/coach/onboarding/persona» y el redirect se dispararía también sobre
    // la propia pantalla de persona (loop infinito). El proxy sí conoce la ruta, ya trae la fila
    // de `coaches` que necesita y corre antes del render. Resolver puro y testeado:
    // `shouldRedirectToPersona` en services/coach/persona.service.ts.

    const onboardingGuide =
        coach.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}

    // ensureCoachPublicCode depende SOLO de coach y su resultado recien se usa al final del
    // layout: se lanza aca (en paralelo con news+workspace) y se espera abajo. El waterfall
    // historico era 6 saltos seriales antes del shell; queda getCoach → ola unica → contextos.
    const publicCodePromise = ensureCoachPublicCode(coach.id, coach.invite_code, onboardingGuide)
    // Si un await intermedio lanza antes del await real de abajo, esto evita el
    // unhandled-rejection; el await de abajo conserva el error original.
    publicCodePromise.catch(() => {})

    const supabase = await createClient()
    const [[unreadCount, newsItems], activeWorkspace, workspaces] = await Promise.all([
        Promise.all([getUnreadNewsCount(coach.id), getPublishedNewsItems()]),
        getPreferredWorkspaceForRender(coach.id),
        listUserWorkspacesForRender(coach.id),
    ])
    const activeEnterpriseCoach = activeWorkspace?.type === 'enterprise_coach' ? activeWorkspace : null
    const activeTeamWorkspace = activeWorkspace?.type === 'coach_team' ? activeWorkspace : null
    // El cupo del plan solo aplica al contexto STANDALONE (enterprise/team pagan centralizado).
    const isStandalone = !activeEnterpriseCoach && !activeTeamWorkspace
    // Módulos toggleables del CONTEXTO activo (team ⇒ del pool; standalone ⇒ propios;
    // enterprise ⇒ ninguno en v1). El nav los espeja; el gate real es assertModule.
    const resolveEnabledModules = async (): Promise<EnabledModules> => {
        if (activeEnterpriseCoach) return {}
        const raw = activeTeamWorkspace
            ? await getTeamEnabledModules(supabase, activeTeamWorkspace.teamId)
            : await getCoachEnabledModules(supabase, coach.id)
        return applyOperatorKillSwitch(raw)
    }

    // Master switch de dominios (feature-prefs `_enabled`): si el coach apagó un dominio, su
    // entrada del nav se oculta. Onboarding v2 (SPEC coach-onboarding-v2 §2): la persona del coach
    // siembra ese `_enabled` para los CINCO dominios (nutrition · training · cardio · movement ·
    // bodycomp), así que acá se leen TODOS en una sola query en vez de resolver solo nutrición.
    //
    // Fail-OPEN, igual que antes: error de lectura, dominio sin fila o fila sin la key ⇒ dominio
    // VISIBLE. Un coach sin preferencias ve exactamente el menú de hoy.
    //
    // Nota deliberada: esta lectura NO pasa por el flag transicional `FEATURE_PREFS_ENABLED` que
    // usa `resolveFeaturePrefs`. Ese flag existe para no quitarle superficies a quien todavía no
    // tiene filas; acá la fila es una elección EXPLÍCITA del coach (la pantalla de persona o
    // Opciones › Mi panel) y honrarla es justamente el producto.
    const resolveDisabledDomains = async (): Promise<string[]> => {
        try {
            return disabledDomainsFromPrefs(await readCoachDomainPrefs(supabase, coach.id))
        } catch {
            return []
        }
    }

    const [enterpriseContext, teamContext, enabledModules, disabledDomains, activeStandaloneCount, personaContext] =
        await Promise.all([
            getCoachEnterpriseContext(coach, activeEnterpriseCoach?.orgId ?? null),
            getCoachTeamContext(activeTeamWorkspace?.teamId ?? null),
            resolveEnabledModules(),
            resolveDisabledDomains(),
            isStandalone ? getActiveStandaloneClientCount(coach.id) : Promise.resolve<number | null>(null),
            // Píldora de la guía (decisión del owner 22-08): necesita la persona, que `getCoach()`
            // no trae. `getPersonaScreenContext` es `React.cache`: la MISMA lectura la reusan
            // `/coach/dashboard` (para su redirect de primera entrada) y la pantalla de persona
            // dentro del mismo request — una sola query por request, no una por consumidor.
            getPersonaScreenContext(),
        ])
    // Sobre-límite: alumnos activos > cupo efectivo (override manual `max_clients` o, si falta, el
    // del tier PARA ESTE COACH — grandfather de pricing v2, no el catálogo de venta).
    const overLimitTier = normalizeCoachTier(coach.subscription_tier)
    const overLimitMax = coach.max_clients ?? tierMaxClientsFor(overLimitTier, coach.created_at)
    const overLimit =
        activeStandaloneCount != null && activeStandaloneCount > overLimitMax
            // `currentTier` va crudo además del label: el banner necesita saber a qué plan
            // corresponde `maxClients` (la columna) para no recomendar el plan que ya tiene.
            ? { activeCount: activeStandaloneCount, maxClients: overLimitMax, tierLabel: TIER_LABELS[overLimitTier], currentTier: overLimitTier }
            : null
    const currentWorkspaceLabel =
        activeWorkspace?.label ??
        enterpriseContext?.orgName ??
        coach.brand_name ??
        coach.full_name ??
        'Mi negocio EVA'

    // Marca por contexto: enterprise → org; team → team; standalone → la del coach.
    // Pricing v3 (owner 2026-08-21): el branding standalone es de TODOS los planes (free incluido);
    // `isBrandingAllowed` queda como red fail-closed (tier inválido/stale o starter legacy ⇒ panel
    // EVA). Si el coach apagó el toggle, su panel también cae a EVA. enterprise/team traen su marca.
    // W1a — tema preset curado: si el coach eligió un preset, sus valores overridean color/color2/
    // accent/tinte/fuente ANTES de derivar tokens. NULL/desconocida → passthrough (grandfather).
    // Solo se consume en la rama standalone (managed usa la marca de su org/team, no la personal).
    const presetBrand = resolvePresetBranding(coach)
    const isManaged = !!(enterpriseContext?.primaryColor || teamContext?.primaryColor)
    const standaloneBrandOn =
        !isManaged &&
        coach.use_brand_colors_coach !== false &&
        isBrandingAllowed((coach.subscription_tier ?? 'free') as SubscriptionTier)
    const primaryColor =
        enterpriseContext?.primaryColor
            ? enterpriseContext.primaryColor
            : teamContext?.primaryColor
            ? teamContext.primaryColor
            : standaloneBrandOn
            ? (presetBrand.primary_color || BRAND_PRIMARY_COLOR)
            : SYSTEM_PRIMARY_COLOR

    // Campos v2 (color2/accent/fuente) solo para el coach standalone Pro+ con el toggle en "mi marca".
    // W-brand B2 (dueño 2026-08-17): para el standalone SIN preset (legacy custom) el secundario
    // resuelto se deriva SIEMPRE del primario (sealPair) y los brand_secondary_color/accent_*
    // ALMACENADOS dejan de leerse (quedan en DB, inertes). Con preset, passthrough (el catálogo
    // ya pisaba). Managed (org/team) no pasa por acá (standaloneBrandOn = false).
    const consolidatedBrand = standaloneBrandOn
        ? consolidateStandaloneBranding(presetBrand, primaryColor)
        : presetBrand
    const accentLight = standaloneBrandOn ? (consolidatedBrand.accent_light || null) : null
    const accentDark = standaloneBrandOn ? (consolidatedBrand.accent_dark || null) : null
    const neutralTint = standaloneBrandOn && consolidatedBrand.neutral_tint === true
    const secondaryColor = standaloneBrandOn ? (consolidatedBrand.brand_secondary_color || null) : null
    const brandFontStack = resolveBrandFontStack(standaloneBrandOn ? (consolidatedBrand.brand_font_key ?? '') : '')
    const brandTheme = resolveBrandTheme({ brandColor: primaryColor, accentLight, accentDark, neutralTint, secondaryLight: secondaryColor, secondaryDark: secondaryColor })
    const palette = generateBrandPalette(brandTheme.light.accent, brandTheme.light.accent2)
    // D2 white-label: rampa SPORT derivada (--sport-100..700 + cta-fill + focus-ring) del color de marca.
    // El diseño recolorea TODO sobreescribiendo --sport-*; ember/aqua/ink/status quedan fijos.
    const sportTokens = deriveSportTokens(primaryColor)
    // Sello EVA v2 (SPEC eva-seal-background D3): par del sello por modo desde el tema
    // RESUELTO, publicado como --seal-p-rgb/--seal-s-rgb junto a --theme-*. Modo estricto
    // de sealPair: la key del preset personal solo cuenta en standalone con marca activa;
    // managed (org/team) y EVA-default derivan del primario (regla B2 — el secundario
    // suelto de un legacy no pinta el sello).
    const sealVars = buildSealCssVars({
        lightBrandColor: brandTheme.light.accent,
        darkBrandColor: brandTheme.dark.accent,
        themePresetKey: standaloneBrandOn ? (coach.theme_preset_key ?? null) : null,
    })

    // Loader del panel: custom solo si la marca está activa (standalone Pro+) o si es managed con toggle on.
    const useCustomStyles = isManaged ? (coach.use_brand_colors_coach !== false) : standaloneBrandOn
    // Variante + loader compuesto (espejo del layout /c): EvaRouteLoader los lee de las CSS vars
    // --coach-loader-variant/--coach-loader-config — sin emitirlas acá, el panel del coach caía
    // SIEMPRE al loader legacy aunque el coach eligiera Ritmo/Órbitas/compuesto en Mi Marca.
    const loaderVariant = useCustomStyles ? resolveLoaderVariant(presetBrand.loader_variant) : 'eva'
    const safeLoaderConfigJson = (() => {
        if (!useCustomStyles || !coach.loader_config) return ''
        try {
            const parsed = coach.loader_config as { symbol?: unknown; animation?: unknown }
            if (!parsed || typeof parsed !== 'object' || typeof parsed.symbol !== 'string' || typeof parsed.animation !== 'string') return ''
            return JSON.stringify(parsed).replace(/[<>]/g, '').replace(/'/g, "\\'")
        } catch { return '' }
    })()
    const loaderConfig = useCustomStyles ? {
        customText: coach.loader_text ?? undefined,
        useCustom: coach.use_custom_loader ?? false,
        // W-brand B4: loader_text_color almacenado deja de leerse — el texto del loader se pinta
        // con el gradiente derivado del primario (contraste curado por el motor de paleta).
        textColor: undefined,
        iconMode: (coach.loader_icon_mode ?? 'eva') as 'eva' | 'coach' | 'none',
        coachLogoUrl: coach.logo_url ?? undefined,
    } : {
        customText: undefined,
        useCustom: false,
        textColor: undefined,
        iconMode: 'eva' as const,
        coachLogoUrl: undefined,
    }
    // Free/Starter conservan el logo en DB, pero el panel autenticado también muestra EVA
    // mientras no exista entitlement white-label. Team/Enterprise siguen usando su contexto.
    const coachPanelLogoUrl = isManaged || standaloneBrandOn ? coach.logo_url : null
    const coachPanelLogoDarkUrl = isManaged || standaloneBrandOn ? coach.logo_url_dark : null

    const publicCode = await publicCodePromise
    const shouldConfirmPublicCode =
        isValidInviteCode(publicCode.inviteCode) &&
        (publicCode.generated || onboardingGuide.invite_code_confirmed !== true)

    return (
        <>
        <style dangerouslySetInnerHTML={{ __html: `
            :root {
                --theme-primary: ${brandTheme.light.accent};
                --theme-primary-rgb: ${palette.primaryRgb};
                --theme-primary-dark: ${palette.primaryDark};
                --theme-primary-light: ${palette.primaryLight};
                --theme-primary-surface: ${palette.primarySurface};
                --theme-primary-glow: ${palette.primaryGlow};
                --theme-primary-foreground: ${brandTheme.light.accentText};
                --primary: ${brandTheme.light.accent};
                --primary-foreground: ${brandTheme.light.accentText};
                --theme-secondary: ${brandTheme.light.accent2};
                --theme-secondary-rgb: ${palette.secondaryRgb ?? palette.primaryRgb};
                --theme-secondary-foreground: ${brandTheme.light.accent2Text};
                --seal-p-rgb: ${sealVars.light.primaryRgb};
                --seal-s-rgb: ${sealVars.light.secondaryRgb};
                --sport-100: ${sportTokens.ramp['100']};
                --sport-200: ${sportTokens.ramp['200']};
                --sport-300: ${sportTokens.ramp['300']};
                --sport-400: ${sportTokens.ramp['400']};
                --sport-500: ${sportTokens.ramp['500']};
                --sport-600: ${sportTokens.ramp['600']};
                --sport-700: ${sportTokens.ramp['700']};
                --cta-fill: ${sportTokens.ctaFill};
                --focus-ring: ${sportTokens.focusRing};
                --text-on-sport: ${sportTokens.textOnSport};
                --brand-font: ${brandFontStack};
                --coach-loader-text: '${(loaderConfig.customText || '').replace(/'/g, "\\'")}';
                --coach-use-custom-loader: ${loaderConfig.useCustom ? '1' : '0'};
                --coach-loader-color: '${(loaderConfig.textColor || '').replace(/'/g, "\\'")}';
                --coach-loader-icon-mode: '${loaderConfig.iconMode}';
                --coach-loader-variant: '${loaderVariant}';
                --coach-loader-config: '${safeLoaderConfigJson}';
            }
            /* Dark-mode brandeado (antes el panel NO tenía bloque .dark → dark genérico). */
            .dark {
                --theme-primary: ${brandTheme.dark.accent};
                --theme-primary-foreground: ${brandTheme.dark.accentText};
                --primary: ${brandTheme.dark.accent};
                --primary-foreground: ${brandTheme.dark.accentText};
                --theme-secondary: ${brandTheme.dark.accent2};
                --theme-secondary-foreground: ${brandTheme.dark.accent2Text};
                --seal-p-rgb: ${sealVars.dark.primaryRgb};
                --seal-s-rgb: ${sealVars.dark.secondaryRgb};
                /* Pasos soft 100-500 FLIPEAN a tintes traslúcidos de marca en dark
                   (espejo del diseño: globals .dark --sport-100 = rgba(...,0.20)).
                   Sin esto la rampa LIGHT del :root se filtra al dark y los fills
                   selected/active (bg-[var(--sport-100..500)]) salen azul claro
                   sobre superficie oscura = invisibles. */
                --sport-100: ${sportTokens.dark['100']};
                --sport-200: rgba(${palette.primaryRgb}, 0.28);
                --sport-300: rgba(${palette.primaryRgb}, 0.40);
                --sport-400: rgba(${palette.primaryRgb}, 0.55);
                --sport-500: rgba(${palette.primaryRgb}, 0.70);
                --sport-600: ${sportTokens.dark['600']};
                --sport-700: ${sportTokens.dark['700']};
                --cta-fill: ${sportTokens.ctaFill};
            }
        ` }} />
        <div
            className="coach-layout-container flex min-h-[100dvh] min-w-0 flex-col bg-[var(--surface-app)] transition-colors selection:bg-primary/30 selection:text-primary md:h-dvh md:max-h-dvh md:flex-row md:overflow-hidden has-[.coach-builder-shell]:h-dvh has-[.coach-builder-shell]:max-h-dvh has-[.coach-builder-shell]:min-h-0 has-[.coach-builder-shell]:overflow-hidden"
            style={{ '--theme-primary': palette.primary, '--theme-primary-rgb': palette.primaryRgb } as React.CSSProperties}
        >
            {/* .dt-skip — visible solo con foco de teclado (desktop, como el kit) */}
            <a
                href="#coach-main"
                className="fixed left-3 top-[-48px] z-[200] hidden rounded-[var(--radius-md)] bg-[var(--sport-600)] px-4 py-[9px] font-ui text-[13px] font-bold text-white no-underline transition-[top] duration-150 focus:top-3 focus:outline-2 focus:outline-offset-2 focus:outline-white md:block"
            >
                Saltar al contenido
            </a>
            <NewsFeedProvider initialUnreadCount={unreadCount} initialItems={newsItems}>
                <CoachSidebar
                    coachName={coach.full_name}
                    coachBrand={enterpriseContext?.orgName ?? teamContext?.teamName ?? coach.brand_name}
                    primaryColor={primaryColor}
                    subscriptionStatus={
                        activeEnterpriseCoach
                            ? 'org_managed'
                            : activeTeamWorkspace
                            ? 'team_managed'
                            : coach.subscription_status
                    }
                    enterpriseContext={enterpriseContext}
                    workspaces={workspaces}
                    currentWorkspaceLabel={currentWorkspaceLabel}
                    activeWorkspaceType={activeWorkspace?.type ?? null}
                    enabledModules={enabledModules}
                    disabledDomains={disabledDomains}
                    logoUrl={coachPanelLogoUrl}
                    logoUrlDark={coachPanelLogoDarkUrl}
                />
                <div className="flex min-w-0 flex-1 flex-col has-[.coach-builder-shell]:min-h-0">
                    {/* RosterViewProvider: puente topbar ↔ pantalla /coach/clients para el
                        toggle Tabla/Ficha (vive en el topbar, estado en la pantalla). */}
                    <RosterViewProvider>
                        <CoachTopBar
                            coachName={coach.full_name}
                            coachBrand={enterpriseContext?.orgName ?? teamContext?.teamName ?? coach.brand_name ?? ''}
                            primaryColor={primaryColor}
                            logoUrl={coachPanelLogoUrl}
                            logoUrlDark={coachPanelLogoDarkUrl}
                            workspaces={workspaces}
                            currentWorkspaceLabel={currentWorkspaceLabel}
                        />
                        {overLimit && (
                            <OverLimitBanner
                                activeCount={overLimit.activeCount}
                                maxClients={overLimit.maxClients}
                                tierLabel={overLimit.tierLabel}
                                currentTier={overLimit.currentTier}
                                coachCreatedAt={coach.created_at ?? null}
                            />
                        )}
                        <CoachMainWrapper>
                            {/* Sello EVA v2 (SPEC eva-seal-background D6): el dueño revierte el
                                «fondo limpio sin glow ambient» de la pasada CD (2026-08-17) — el
                                lienzo de contenido lleva el fondo B (blobs del par de marca +
                                grano), montado por CoachMainWrapper DETRÁS del contenido. El
                                chrome (topbar/sidebar) sigue opaco surface-app encima (D2). */}
                            {children}
                        </CoachMainWrapper>
                    </RosterViewProvider>
                </div>
                <CoachSuccessAnimationLazy />
                {/* Guía de inicio v2, casa nueva (decisión del owner 22-08): la guía completa vive
                    en `/coach/guia` y en el panel queda esta píldora flotante, que se minimiza al
                    monito de EVA. Se monta en el layout —y no en el dashboard— para que acompañe al
                    coach por todo el panel; ella misma decide dónde NO pintarse (la guía, el primer
                    ingreso, los builders) y se apaga sola cuando la guía está completa o descartada. */}
                <GuidePill
                    coachId={coach.id}
                    persona={personaContext.persona}
                    onboardingGuide={coach.onboarding_guide ?? {}}
                    managed={!isStandalone || personaContext.managed}
                />
                {shouldConfirmPublicCode && <PublicCodeRequiredModal inviteCode={publicCode.inviteCode} />}
            </NewsFeedProvider>
        </div>
        <PwaRegister />
        {/* Identidad de analítica (PostHog identify + user/tags de Sentry). `overLimitTier` ya es
            `normalizeCoachTier(coach.subscription_tier)`; solo viaja el UUID del coach, sin PII. */}
        <IdentifyOnMount coachId={coach.id} tier={overLimitTier} />
        </>
    )
}
