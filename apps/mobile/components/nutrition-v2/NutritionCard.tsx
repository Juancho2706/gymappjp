import type { ComponentProps, ReactNode } from 'react'
import { View } from 'react-native'
import type { NutritionTone } from '@eva/nutrition-v2'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const toneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card',
  brand: 'border-sport-300 bg-sport-100',
  nutrition: 'border-primary/30 bg-primary/10',
  success: 'border-success-500/30 bg-success-500/10',
  warning: 'border-warning-500/30 bg-warning-500/10',
  danger: 'border-danger-500/30 bg-danger-500/10',
  info: 'border-info-500/30 bg-info-500/10',
}

export type NutritionCardProps = Omit<ComponentProps<typeof View>, 'children'> & {
  children: ReactNode
  tone?: NutritionTone
}

export function NutritionCard({
  children,
  tone = 'neutral',
  className,
  ...props
}: NutritionCardProps) {
  return (
    <View
      className={cx('rounded-card border p-4', toneClasses[tone], className)}
      {...props}
    >
      {children}
    </View>
  )
}
