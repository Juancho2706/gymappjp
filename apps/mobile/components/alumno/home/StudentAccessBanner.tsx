import { StyleSheet, Text, View } from 'react-native'
import type { StudentAccess } from '../../../lib/entitlements-core'
import { STUDENT_ACCESS_COPY } from '../../../lib/student-access-copy'

interface Props {
  access: StudentAccess
}

/**
 * Banner de acceso del alumno por suscripcion del coach (politica CEO 2026-07-18) — espejo del
 * banner del layout `/c` web + pantalla /suspended?reason=coach.
 *  - 'grace': banner discreto info (alumno 100% funcional, SIN countdown — la presion vive en el
 *    dashboard del coach, no aca).
 *  - 'blocked': aviso honesto de solo-lectura (ve plan/historial/rachas; el registro rebota en DB
 *    con COACH_ACCOUNT_PAUSED y las superficies de escritura muestran el copy humano).
 *  - 'active': no monta nada.
 * Tokens info-/warning- = rampas DS FIJAS (nunca white-label), light/dark via dark: variants.
 */
export function StudentAccessBanner({ access }: Props) {
  if (access.state === 'grace') {
    return (
      <View
        testID="student-access-banner-grace"
        className="rounded-card border border-info-500/30 bg-info-100 dark:bg-info-100/[0.18]"
        style={styles.card}
      >
        <Text className="font-sans text-sm text-info-600" style={styles.body}>
          {STUDENT_ACCESS_COPY.graceBanner}
        </Text>
      </View>
    )
  }

  if (access.state === 'blocked') {
    return (
      <View
        testID="student-access-banner-blocked"
        className="rounded-card border border-warning-500/30 bg-warning-100 dark:bg-warning-100/[0.18]"
        style={styles.card}
      >
        <Text className="font-sans-bold text-sm text-warning-600">
          {STUDENT_ACCESS_COPY.pausedTitle}
        </Text>
        <Text className="font-sans text-sm text-warning-600" style={styles.body}>
          {STUDENT_ACCESS_COPY.pausedBody} {STUDENT_ACCESS_COPY.pausedHint}
        </Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 12 },
  body: { marginTop: 2, lineHeight: 18 },
})
