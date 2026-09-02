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
    const { user, exercises, initialProgram, areas, cardio } = await getTemplateBuilderData(programId)
    if (!user) redirect('/login')

    return (
        <WeeklyPlanBuilder
            exercises={exercises}
            initialProgram={initialProgram}
            areas={areas}
            cardio={cardio}
            /* Sin alumno no hay tarea guiada; el coachId solo namespacea la memoria de la guía. */
            firstRoutine={{ coachId: user.id }}
            /* El catálogo de PLANTILLAS trae solo sistema (`coach_id` NULL) + los del coach
               (`coach_id = user.id`, ver template-builder.queries), así que `coachId` alcanza
               para decidir cuál es editable: no hay filas de team ni de org en esta lista. */
            ownerScope={{ coachId: user.id }}
        />
    )
}
