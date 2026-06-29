import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachTopBar } from '@/components/coach/CoachTopBar'
import { CoachMainWrapper } from '@/components/coach/CoachMainWrapper'
import { CoachSuccessAnimationLazy } from '@/components/coach/CoachSuccessAnimationLazy'
import { NewsFeedProvider } from '@/components/coach/NewsFeedProvider'
import { getCoach } from '@/lib/coach/get-coach'
import { isValidInviteCode } from '@/lib/coach/invite-code'
import { PwaRegister } from '@/components/PwaRegister'
import { PublicCodeRequiredModal } from './_components/PublicCodeRequiredModal'
import { ensureCoachPublicCode } from './_data/public-code.queries'
import { getUnreadNewsCount, getPublishedNewsItems } from '@/lib/news/queries'
import type { Metadata } from 'next'
import { BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { generateBrandPalette } from '@/lib/color-utils'
import { resolveBrandTheme, deriveSportTokens } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { resolveBrandFontStack } from '@/lib/brand-fonts'
import { getCoachEnterpriseContext, getCoachTeamContext } from './_data/layout.queries'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender, listUserWorkspacesForRender } from '@/services/auth/workspace-render-cache'
import {
    applyOperatorKillSwitch,
    getCoachEnabledModules,
    getTeamEnabledModules,
    type EnabledModules,
} from '@/services/entitlements.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | EVA',
    },
}

// Dashboard autenticado: el layout lee cookies (sesion) para TODO /coach ⇒ render dinamico.
export const dynamic = 'force-dynamic'

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

    const [unreadCount, newsItems] = await Promise.all([
        getUnreadNewsCount(coach.id),
        getPublishedNewsItems(),
    ])

    const supabase = await createClient()
    const [activeWorkspace, workspaces] = await Promise.all([
        getPreferredWorkspaceForRender(coach.id),
        listUserWorkspacesForRender(coach.id),
    ])
    const activeEnterpriseCoach = activeWorkspace?.type === 'enterprise_coach' ? activeWorkspace : null
    const activeTeamWorkspace = activeWorkspace?.type === 'coach_team' ? activeWorkspace : null
    // Módulos toggleables del CONTEXTO activo (team ⇒ del pool; standalone ⇒ propios;
    // enterprise ⇒ ninguno en v1). El nav los espeja; el gate real es assertModule.
    const resolveEnabledModules = async (): Promise<EnabledModules> => {
        if (activeEnterpriseCoach) return {}
        const raw = activeTeamWorkspace
            ? await getTeamEnabledModules(supabase, activeTeamWorkspace.teamId)
            : await getCoachEnabledModules(supabase, coach.id)
        return applyOperatorKillSwitch(raw)
    }

    // Master switch de dominios (feature-prefs `_enabled`): si el coach apagó un dominio
    // (ej. Nutrición), su entrada del nav se oculta. Fail-OPEN: cualquier error o flag OFF ⇒
    // NINGÚN dominio apagado (mostrar todo = comportamiento de HOY). Para la vista PROPIA del
    // coach se resuelve con su coachId de sesión (sin clientId/team-base override).
    const resolveDisabledDomains = async (): Promise<string[]> => {
        try {
            const nutritionEnabled = await resolveNutritionDomainEnabled({ coachId: coach.id })
            return nutritionEnabled ? [] : ['nutrition']
        } catch {
            return []
        }
    }

    const [enterpriseContext, teamContext, enabledModules, disabledDomains] = await Promise.all([
        getCoachEnterpriseContext(coach, activeEnterpriseCoach?.orgId ?? null),
        getCoachTeamContext(activeTeamWorkspace?.teamId ?? null),
        resolveEnabledModules(),
        resolveDisabledDomains(),
    ])
    const currentWorkspaceLabel =
        activeWorkspace?.label ??
        enterpriseContext?.orgName ??
        coach.brand_name ??
        coach.full_name ??
        'Mi negocio EVA'

    // Marca por contexto: enterprise → org; team → team; standalone → la del coach.
    // white-label v2 (decisión #2): el branding standalone es Pro+ ENTERO. Si el coach no es Pro o
    // apagó el toggle, su panel cae a EVA. enterprise/team traen su marca propia (ya Pro).
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
            ? (coach.primary_color || BRAND_PRIMARY_COLOR)
            : SYSTEM_PRIMARY_COLOR

    // Campos v2 (color2/accent/fuente) solo para el coach standalone Pro+ con el toggle en "mi marca".
    const accentLight = standaloneBrandOn ? (coach.accent_light || null) : null
    const accentDark = standaloneBrandOn ? (coach.accent_dark || null) : null
    const neutralTint = standaloneBrandOn && coach.neutral_tint === true
    const secondaryColor = standaloneBrandOn ? (coach.brand_secondary_color || null) : null
    const brandFontStack = resolveBrandFontStack(standaloneBrandOn ? (coach.brand_font_key ?? '') : '')
    const brandTheme = resolveBrandTheme({ brandColor: primaryColor, accentLight, accentDark, neutralTint, secondaryLight: secondaryColor, secondaryDark: secondaryColor })
    const palette = generateBrandPalette(brandTheme.light.accent, brandTheme.light.accent2)
    // D2 white-label: rampa SPORT derivada (--sport-100..700 + cta-fill + focus-ring) del color de marca.
    // El diseño recolorea TODO sobreescribiendo --sport-*; ember/aqua/ink/status quedan fijos.
    const sportTokens = deriveSportTokens(primaryColor)

    // Loader del panel: custom solo si la marca está activa (standalone Pro+) o si es managed con toggle on.
    const useCustomStyles = isManaged ? (coach.use_brand_colors_coach !== false) : standaloneBrandOn
    const loaderConfig = useCustomStyles ? {
        customText: coach.loader_text ?? undefined,
        useCustom: coach.use_custom_loader ?? false,
        textColor: coach.loader_text_color ?? undefined,
        iconMode: (coach.loader_icon_mode ?? 'eva') as 'eva' | 'coach' | 'none',
        coachLogoUrl: coach.logo_url ?? undefined,
    } : {
        customText: undefined,
        useCustom: false,
        textColor: undefined,
        iconMode: 'eva' as const,
        coachLogoUrl: undefined,
    }

    const onboardingGuide =
        coach.onboarding_guide != null &&
        typeof coach.onboarding_guide === 'object' &&
        !Array.isArray(coach.onboarding_guide)
            ? (coach.onboarding_guide as Record<string, unknown>)
            : {}
    const publicCode = await ensureCoachPublicCode(coach.id, coach.invite_code, onboardingGuide)
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
            }
            /* Dark-mode brandeado (antes el panel NO tenía bloque .dark → dark genérico). */
            .dark {
                --theme-primary: ${brandTheme.dark.accent};
                --theme-primary-foreground: ${brandTheme.dark.accentText};
                --primary: ${brandTheme.dark.accent};
                --primary-foreground: ${brandTheme.dark.accentText};
                --theme-secondary: ${brandTheme.dark.accent2};
                --theme-secondary-foreground: ${brandTheme.dark.accent2Text};
                --sport-600: ${sportTokens.dark['600']};
                --sport-700: ${sportTokens.dark['700']};
                --cta-fill: ${sportTokens.ctaFill};
            }
        ` }} />
        <div
            className="coach-layout-container flex min-h-[100dvh] min-w-0 flex-col bg-white transition-colors selection:bg-primary/30 selection:text-primary dark:bg-black md:min-h-screen md:flex-row has-[.coach-builder-shell]:h-dvh has-[.coach-builder-shell]:max-h-dvh has-[.coach-builder-shell]:min-h-0 has-[.coach-builder-shell]:overflow-hidden"
            style={{ '--theme-primary': palette.primary, '--theme-primary-rgb': palette.primaryRgb } as React.CSSProperties}
        >
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
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <CoachTopBar
                        coachName={coach.full_name}
                        coachBrand={enterpriseContext?.orgName ?? teamContext?.teamName ?? coach.brand_name ?? ''}
                        primaryColor={primaryColor}
                    />
                    <CoachMainWrapper>
                        {/* Background ambient glow */}
                        <div
                            className="fixed top-0 right-0 w-[500px] h-[500px] blur-[120px] rounded-full -z-10 pointer-events-none opacity-20 dark:opacity-10"
                            style={{ backgroundColor: 'var(--theme-primary)' }}
                        />
                        <div
                            className="fixed bottom-0 left-0 w-[300px] h-[300px] blur-[100px] rounded-full -z-10 pointer-events-none opacity-10 dark:opacity-5"
                            style={{ backgroundColor: 'var(--theme-primary)' }}
                        />
                        {children}
                    </CoachMainWrapper>
                </div>
                <CoachSuccessAnimationLazy />
                {shouldConfirmPublicCode && <PublicCodeRequiredModal inviteCode={publicCode.inviteCode} />}
            </NewsFeedProvider>
        </div>
        <PwaRegister />
        </>
    )
}

