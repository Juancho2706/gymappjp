'use server'

import { submitIntakeForm as submitIntakeFormImpl } from './_actions/onboarding.actions'

export type { OnboardingState } from './_actions/onboarding.actions'
import type { OnboardingState } from './_actions/onboarding.actions'

export async function submitIntakeForm(
    coachSlug: string,
    prevState: OnboardingState,
    formData: FormData
) {
    return submitIntakeFormImpl(coachSlug, prevState, formData)
}
