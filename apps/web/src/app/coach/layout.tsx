import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
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
    const primaryColor =
        enterpriseContext?.primaryColor
            ? enterpriseContext.primaryColor
            : teamContext?.primaryColor
            ? teamContext.primaryColor
            : coach.use_brand_colors_coach === false
            ? SYSTEM_PRIMARY_COLOR
            : (coach.primary_color || BRAND_PRIMARY_COLOR)
    const palette = generateBrandPalette(primaryColor)

    const useCustomStyles = coach.use_brand_colors_coach !== false
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
                --theme-primary: ${palette.primary};
                --theme-primary-rgb: ${palette.primaryRgb};
                --theme-primary-dark: ${palette.primaryDark};
                --theme-primary-light: ${palette.primaryLight};
                --theme-primary-surface: ${palette.primarySurface};
                --theme-primary-glow: ${palette.primaryGlow};
                --theme-primary-foreground: ${palette.primaryForeground};
                --primary: ${palette.primary};
                --primary-foreground: ${palette.primaryForeground};
                --coach-loader-text: '${(loaderConfig.customText || '').replace(/'/g, "\\'")}';
                --coach-use-custom-loader: ${loaderConfig.useCustom ? '1' : '0'};
                --coach-loader-color: '${(loaderConfig.textColor || '').replace(/'/g, "\\'")}';
                --coach-loader-icon-mode: '${loaderConfig.iconMode}';
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
                <CoachSuccessAnimationLazy />
                {shouldConfirmPublicCode && <PublicCodeRequiredModal inviteCode={publicCode.inviteCode} />}
            </NewsFeedProvider>
        </div>
        <PwaRegister />
        </>
    )
}

