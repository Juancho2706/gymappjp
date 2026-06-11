import { redirect } from 'next/navigation'
import { WeeklyPlanBuilder } from '../../builder/[clientId]/WeeklyPlanBuilder'
import { getTemplateBuilderData } from './_data/template-builder.queries'

export default async function TemplateBuilderPage(
    props: {
        searchParams: Promise<{ programId?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const { programId } = searchParams
    const { user, exercises, initialProgram, areas } = await getTemplateBuilderData(programId)
    if (!user) redirect('/login')

    return (
        <WeeklyPlanBuilder
            exercises={exercises}
            initialProgram={initialProgram}
            areas={areas}
        />
    )
}
