import { z } from 'zod'

export const MobileProgramAssignmentWorkspaceSchema = z.object({
  kind: z.enum(['standalone', 'team_owner', 'team_member', 'enterprise']),
  teamId: z.string().uuid().nullable(),
  orgId: z.string().uuid().nullable(),
}).strict()

export const MobileProgramAssignmentNotificationRequestSchema = z.object({
  workspace: MobileProgramAssignmentWorkspaceSchema,
  programIds: z.array(z.string().uuid()).min(1).max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.programIds).size !== value.programIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['programIds'],
      message: 'Los programas no pueden repetirse.',
    })
  }
})

export type MobileProgramAssignmentNotificationRequest = z.infer<
  typeof MobileProgramAssignmentNotificationRequestSchema
>
