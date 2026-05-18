import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useOrg } from '../../../context/OrgContext'
import { router } from 'expo-router'

function Row({
  label,
  value,
  onPress,
  danger,
}: {
  label: string
  value?: string
  onPress?: () => void
  danger?: boolean
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    </TouchableOpacity>
  )
}

export default function ConfiguracionScreen() {
  const { org } = useOrg()

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Salir de EVA Enterprise?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!org) return null

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Configuración</Text>
        </View>

        <Text style={styles.sectionTitle}>Organización</Text>
        <View style={styles.section}>
          <Row label="Nombre" value={org.orgName} />
          <Row label="Slug" value={org.orgSlug} />
          <Row label="Tu rol" value={org.orgRole === 'org_owner' ? 'Dueño' : 'Administrador'} />
        </View>

        <Text style={styles.sectionTitle}>Gestión avanzada</Text>
        <View style={styles.section}>
          <Row
            label="Branding y facturación"
            value="→ Web"
            onPress={() =>
              Alert.alert(
                'Ir a la web',
                `Visita enterprise.eva-app.cl/org/${org.orgSlug}/settings para configurar branding y facturación.`
              )
            }
          />
          <Row
            label="Invitar coaches"
            value="→ Tab Coaches"
            onPress={() => router.push('/org/(tabs)/coaches')}
          />
        </View>

        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.section}>
          <Row label="Cerrar sesión" onPress={handleLogout} danger />
        </View>

        <Text style={styles.version}>EVA Enterprise v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: { fontSize: 15, color: '#111827' },
  rowLabelDanger: { color: '#EF4444' },
  rowValue: { fontSize: 14, color: '#9CA3AF' },
  version: {
    textAlign: 'center',
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 40,
    marginBottom: 24,
  },
})
