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
import { getCoachEnterpriseContext } from './_data/layout.queries'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | EVA',
    },
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

    const [unreadCount, newsItems] = await Promise.all([
        getUnreadNewsCount(coach.id),
        getPublishedNewsItems(),
    ])

    const supabase = await createClient()
    const activeWorkspace = await resolvePreferredWorkspace(supabase, coach.id)
    const activeEnterpriseCoach = activeWorkspace?.type === 'enterprise_coach' ? activeWorkspace : null
    const enterpriseContext = await getCoachEnterpriseContext(coach, activeEnterpriseCoach?.orgId ?? null)

    const primaryColor =
        enterpriseContext?.primaryColor
            ? enterpriseContext.primaryColor
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
                    coachBrand={enterpriseContext?.orgName ?? coach.brand_name}
                    primaryColor={primaryColor}
                    subscriptionStatus={activeEnterpriseCoach ? 'org_managed' : coach.subscription_status}
                    enterpriseContext={enterpriseContext}
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

