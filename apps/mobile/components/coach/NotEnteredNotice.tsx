import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MessageCircle } from 'lucide-react-native'

/**
 * Aviso «todavía no entra» de la ficha (plan B «Activación», owner 01-10, maqueta `F1yd1V2b`).
 * Paridad con la web (`ClientProfileHero.tsx` → `NotEnteredNotice`): antes, para reenviarle el
 * acceso a un alumno que nunca entró había que abrir «Más» → «Resetear contraseña». El botón abre
 * ese MISMO diálogo de la ficha, que ya deja la clave temporal y el envío por WhatsApp.
 */
export function NotEnteredNotice({
  name,
  createdAt,
  onResend,
}: {
  name: string
  createdAt: string | null
  onResend: () => void
}) {
  // El reloj se lee UNA vez al montar (regla de pureza del render): «hace N días» no necesita más.
  const [now] = useState(() => Date.now())
  const first = name.trim().split(' ')[0] || 'Tu alumno'
  const created = createdAt ? new Date(createdAt).getTime() : NaN
  const days = Number.isFinite(created) ? Math.floor((now - created) / 86_400_000) : null
  const since = days === null ? null : days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`

  return (
    <View
      accessibilityRole="summary"
      className="rounded-card border p-4"
      style={{ backgroundColor: 'rgba(245,165,36,0.14)', borderColor: 'rgba(245,165,36,0.32)', gap: 12 }}
    >
      <View>
        <Text className="font-sans-extra text-[14px] text-strong">{first} todavía no entra a tu app</Text>
        <Text className="font-sans text-[13px] text-body" style={{ marginTop: 2, lineHeight: 18 }}>
          {since ? `Le creaste la cuenta ${since}. ` : ''}Casi siempre el mensaje quedó abajo en el chat.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onResend}
        className="h-11 flex-row items-center justify-center rounded-control"
        style={{ backgroundColor: '#25D366', gap: 8 }}
      >
        <MessageCircle size={18} color="#052e16" />
        <Text className="font-sans-extra text-[14px]" style={{ color: '#052e16' }}>
          Reenviarle el acceso
        </Text>
      </Pressable>
    </View>
  )
}
