import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { cssInterop } from 'nativewind'
import { MotiView } from 'moti'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Link2,
  Lock,
  Palette,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Ticket,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { ApiError, getApiBaseUrl } from '../../../lib/api'
import { useWorkspace } from '../../../lib/workspace'
import {
  addTeamMember,
  getTeamOverview,
  removeTeamMember,
  setTeamMemberManage,
  updateTeamBrand,
  type TeamMemberView,
  type TeamOverview,
} from '../../../lib/team'
import { haptics } from '../../../lib/haptics'
import { AppBackground } from '../../../components/AppBackground'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { Input } from '../../../components/Input'
import { ProgressRing } from '../../../components/ProgressRing'
import { Sheet } from '../../../components/Sheet'
import { Switch } from '../../../components/Switch'
import { toast } from '../../../components/Toast'

/**
 * E7-06 · Mi Equipo (coach) — espejo mobile del web `apps/web/.../coach/team/page.tsx` (variante
 * MÓVIL). Solo accesible en contexto team (`useWorkspace().kind` = team_owner|team_member); fuera
 * de él, empty-state. Read-only si `!canManageTeam` (co-gestor lock idéntico al web: badge "Solo
 * lectura", sin acciones de gestión). Hero inverse (logo/rol/pool/share/stats), Brand Studio del
 * team (subset editable: nombre + color; logos/loader = web-only), Miembros (agregar/remover/
 * promover). Mutaciones via /api/mobile/team/* (triggers de gobernanza = guard duro). Sin dinero.
 */

for (const Icon of [
  Check, ChevronLeft, ChevronRight, Copy, Crown, Link2, Lock, Palette, Pencil,
  Plus, Shield, ShieldCheck, Ticket, Trash2, User, UserPlus, Users,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const DEFAULT_ACCENT = '#10B981'

/** Texto legible sobre el color de marca (claro → tinta, oscuro → blanco). Espejo del web `onAccent`. */
function onAccentColor(hex: string | null): string {
  const h = (hex ?? '').replace('#', '')
  if (h.length !== 6) return '#FFFFFF'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6 ? '#0F1729' : '#FFFFFF'
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
}

function roleMeta(m: { isOwner: boolean; canManage: boolean }): { label: string; Icon: LucideIcon } {
  if (m.isOwner) return { label: 'Owner', Icon: Crown }
  if (m.canManage) return { label: 'Co-gestor', Icon: Shield }
  return { label: 'Miembro', Icon: User }
}

/* ── Back header (1:1 con app/coach/modules.tsx) ─────────────────────────────── */
function BackHeader() {
  const router = useRouter()
  return (
    <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
      <Pressable
        testID="team-back"
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        hitSlop={10}
        className="flex-row items-center"
        style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
      >
        <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
        <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>Opciones</Text>
      </Pressable>
    </View>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <BackHeader />
        {children}
      </SafeAreaView>
    </View>
  )
}

/* ── Fila de acceso del hero (login / invite code) ───────────────────────────── */
function AccessRow({ icon: Icon, label, value, copyValue }: { icon: LucideIcon; label: string; value: string; copyValue: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await Clipboard.setStringAsync(copyValue)
    haptics.tap()
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <View
      className="flex-row items-center rounded-control"
      style={{ gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
    >
      <Icon size={16} strokeWidth={2.2} className="text-sport-300" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-sans-bold text-on-dark-muted" style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
        <Text className="font-mono text-on-dark" style={{ fontSize: 12.5 }} numberOfLines={1}>{value}</Text>
      </View>
      <Pressable
        testID={`team-copy-${label === 'Código de invitación' ? 'invite' : 'login'}`}
        accessibilityRole="button"
        accessibilityLabel={`Copiar ${label}`}
        onPress={copy}
        hitSlop={8}
        className="items-center justify-center rounded-lg"
        style={{ width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.10)' }}
      >
        {copied
          ? <Check size={15} strokeWidth={2.6} className="text-sport-300" />
          : <Copy size={15} strokeWidth={2.2} className="text-on-dark" />}
      </Pressable>
    </View>
  )
}

/* ── Fila de miembro ─────────────────────────────────────────────────────────── */
function MemberRow({ member, canManage, onManage }: { member: TeamMemberView; canManage: boolean; onManage: () => void }) {
  const { label, Icon } = roleMeta(member)
  const actionable = canManage && !member.isOwner && !member.isSelf
  return (
    <View className="flex-row items-center" style={{ gap: 12, paddingVertical: 11 }}>
      <View className="items-center justify-center rounded-xl bg-sport-100" style={{ width: 42, height: 42 }}>
        <Text className="font-display-black text-sport-700" style={{ fontSize: 15 }}>{initialsOf(member.name) || '?'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }} numberOfLines={1}>{member.name}</Text>
          {member.isSelf ? <Text className="font-sans-bold text-subtle" style={{ fontSize: 11 }}>· tú</Text> : null}
        </View>
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 2 }}>
          <Icon size={12} strokeWidth={2.2} className="text-muted" />
          <Text className="font-sans-bold text-muted" style={{ fontSize: 11.5 }}>{label}</Text>
          {member.displayRole ? <Text className="font-sans text-subtle" style={{ fontSize: 11.5 }} numberOfLines={1}>· {member.displayRole}</Text> : null}
        </View>
      </View>
      {actionable ? (
        <Pressable
          testID={`team-member-manage-${member.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Gestionar ${member.name}`}
          onPress={onManage}
          hitSlop={8}
          className="items-center justify-center rounded-lg border border-subtle"
          style={{ width: 34, height: 34 }}
        >
          <ChevronRight size={18} strokeWidth={2.2} className="text-muted" />
        </Pressable>
      ) : null}
    </View>
  )
}

export default function CoachTeamScreen() {
  const router = useRouter()
  const ws = useWorkspace()
  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  const teamId = ws.teamId

  const [team, setTeam] = useState<TeamOverview | null>(null)
  const [loading, setLoading] = useState(true)

  // Sheets
  const [addOpen, setAddOpen] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('')
  const [addPending, setAddPending] = useState(false)

  const [brandOpen, setBrandOpen] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandColor, setBrandColor] = useState('')
  const [brandPending, setBrandPending] = useState(false)

  const [activeMember, setActiveMember] = useState<TeamMemberView | null>(null)
  const [managePending, setManagePending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removePending, setRemovePending] = useState(false)

  const load = useCallback(async () => {
    if (!teamId) { setTeam(null); setLoading(false); return }
    try {
      const t = await getTeamOverview(teamId)
      setTeam(t)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useFocusEffect(
    useCallback(() => {
      if (!ws.ready) return
      if (!isTeam || !teamId) { setLoading(false); return }
      let cancelled = false
      void (async () => {
        setLoading(true)
        try {
          const t = await getTeamOverview(teamId)
          if (!cancelled) setTeam(t)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
      return () => { cancelled = true }
    }, [ws.ready, isTeam, teamId]),
  )

  // ── Gating ──
  if (!ws.ready || (loading && isTeam)) {
    return (
      <Shell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      </Shell>
    )
  }

  if (!isTeam || !teamId) {
    return (
      <Shell>
        <EmptyState
          icon={Users}
          title="No perteneces a ningún equipo"
          subtitle="Cuando te sumen a un pool de coaches, aparecerá acá."
        />
      </Shell>
    )
  }

  if (!team) {
    return (
      <Shell>
        <EmptyState
          icon={Users}
          title="No se pudo cargar tu equipo"
          subtitle="Vuelve a intentarlo en unos segundos."
        />
      </Shell>
    )
  }

  const accent = team.primaryColor || DEFAULT_ACCENT
  const onAccent = onAccentColor(team.primaryColor)
  const canManage = team.isManager
  const heroRole = roleMeta({ isOwner: team.isOwner, canManage: team.isManager })
  const seatPct = team.seatLimit > 0 ? Math.min(100, Math.round((team.activeMemberCount / team.seatLimit) * 100)) : 0

  // ── Handlers ──
  function errMsg(e: unknown): string {
    if (e instanceof ApiError) return e.message
    return 'No se pudo completar la acción. Intenta de nuevo.'
  }

  async function onAdd() {
    if (!teamId) return
    const email = addEmail.trim()
    if (!email) { toast.error('Ingresa el email del coach.'); return }
    setAddPending(true)
    try {
      await addTeamMember(teamId, email, addRole)
      haptics.success()
      toast.success('Coach agregado al equipo.')
      setAddOpen(false); setAddEmail(''); setAddRole('')
      await load()
    } catch (e) {
      haptics.error()
      toast.error(errMsg(e))
    } finally {
      setAddPending(false)
    }
  }

  async function onToggleManage(next: boolean) {
    if (!teamId || !activeMember) return
    setManagePending(true)
    try {
      await setTeamMemberManage(teamId, activeMember.id, next)
      haptics.success()
      toast.success(next ? 'Ahora es co-gestor.' : 'Ya no es co-gestor.')
      setActiveMember({ ...activeMember, canManage: next })
      await load()
    } catch (e) {
      haptics.error()
      toast.error(errMsg(e))
    } finally {
      setManagePending(false)
    }
  }

  async function onRemove() {
    if (!teamId || !activeMember) return
    setRemovePending(true)
    try {
      await removeTeamMember(teamId, activeMember.id)
      haptics.success()
      toast.success('Miembro removido del equipo.')
      setActiveMember(null); setConfirmRemove(false)
      await load()
    } catch (e) {
      haptics.error()
      toast.error(errMsg(e))
    } finally {
      setRemovePending(false)
    }
  }

  async function onSaveBrand() {
    if (!teamId) return
    const name = brandName.trim()
    const color = brandColor.trim()
    if (name.length < 2) { toast.error('El nombre del equipo debe tener al menos 2 caracteres.'); return }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) { toast.error('Color inválido (formato #RRGGBB).'); return }
    setBrandPending(true)
    try {
      await updateTeamBrand(teamId, { name, primary_color: color || null })
      haptics.success()
      toast.success('Marca del equipo actualizada.')
      setBrandOpen(false)
      await load()
    } catch (e) {
      haptics.error()
      toast.error(errMsg(e))
    } finally {
      setBrandPending(false)
    }
  }

  const base = getApiBaseUrl()
  const loginPath = `/t/${team.slug}/login`

  return (
    <Shell>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, paddingBottom: 14 }}>
          <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>Mi equipo</Text>
        </View>

        {/* ── Hero inverse ── */}
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360 }}>
          <Card variant="inverse" padding={18} radius="card">
            <View className="flex-row items-center" style={{ gap: 13 }}>
              <View
                className="items-center justify-center overflow-hidden rounded-xl"
                style={{ width: 54, height: 54, backgroundColor: team.logoUrl ? 'rgba(255,255,255,0.10)' : accent }}
              >
                {team.logoUrl
                  ? <Image source={{ uri: team.logoUrl }} style={{ width: 54, height: 54 }} contentFit="contain" />
                  : <Text className="font-display-black" style={{ fontSize: 21, color: onAccent }}>{initialsOf(team.name) || '·'}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-on-dark" style={{ fontSize: 21, letterSpacing: -0.4 }} numberOfLines={1}>{team.name}</Text>
                <View
                  className="flex-row items-center self-start rounded-pill"
                  style={{ gap: 5, marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.10)' }}
                >
                  <heroRole.Icon size={12} strokeWidth={2.4} className="text-sport-300" />
                  <Text className="font-sans-bold text-on-dark" style={{ fontSize: 11.5 }}>{heroRole.label}</Text>
                </View>
              </View>
            </View>

            <Text className="font-sans text-on-dark-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 12 }}>
              Pool compartido — todo el equipo ve a todos los alumnos.
            </Text>

            {/* Accesos de alumnos */}
            <View style={{ gap: 8, marginTop: 12 }}>
              <AccessRow icon={Link2} label="Login de alumnos" value={loginPath} copyValue={`${base}${loginPath}`} />
              {team.inviteCode
                ? <AccessRow icon={Ticket} label="Código de invitación" value={team.inviteCode} copyValue={`${base}/join/${team.inviteCode}`} />
                : null}
            </View>

            {/* Stats */}
            <View className="flex-row items-center" style={{ gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <ProgressRing
                  value={seatPct}
                  size={52}
                  color={accent}
                  track="rgba(255,255,255,0.14)"
                  label={<Text className="font-mono text-on-dark" style={{ fontSize: 11.5 }}>{team.activeMemberCount}/{team.seatLimit}</Text>}
                />
                <Text className="font-sans-bold text-on-dark-muted" style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 }}>Cupos</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text className="font-display-black text-on-dark" style={{ fontSize: 25 }}>{team.poolClientCount}</Text>
                <Text className="font-sans-bold text-on-dark-muted" style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 }}>Alumnos</Text>
              </View>
              <Pressable
                testID="team-modules-link"
                accessibilityRole="button"
                accessibilityLabel="Ver módulos del equipo"
                onPress={() => router.push('/coach/modules')}
                style={{ flex: 1, alignItems: 'center' }}
                hitSlop={6}
              >
                <Text className="font-display-black text-on-dark" style={{ fontSize: 25 }}>{team.activeModuleCount}</Text>
                <View className="flex-row items-center" style={{ gap: 2, marginTop: 4 }}>
                  <Text className="font-sans-bold text-sport-300" style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}>Módulos</Text>
                  <ChevronRight size={11} strokeWidth={2.4} className="text-sport-300" />
                </View>
              </Pressable>
            </View>
          </Card>
        </MotiView>

        {/* ── Brand Studio ── */}
        <View className="flex-row items-center justify-between" style={{ marginTop: 20, marginBottom: 10, paddingHorizontal: 2 }}>
          <Text className="font-display-bold text-strong" style={{ fontSize: 16, letterSpacing: -0.3 }}>
            {canManage ? 'Brand Studio' : 'Marca del equipo'}
          </Text>
          {!canManage ? (
            <View className="flex-row items-center rounded-pill bg-surface-sunken" style={{ gap: 5, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Lock size={12} strokeWidth={2.2} className="text-muted" />
              <Text className="font-sans-bold text-muted" style={{ fontSize: 11 }}>Solo lectura</Text>
            </View>
          ) : null}
        </View>

        <Card padding={16}>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="items-center justify-center overflow-hidden rounded-xl" style={{ width: 46, height: 46, backgroundColor: team.logoUrl ? undefined : accent }}>
              {team.logoUrl
                ? <Image source={{ uri: team.logoUrl }} style={{ width: 46, height: 46 }} contentFit="contain" />
                : <Text className="font-display-black" style={{ fontSize: 17, color: onAccent }}>{initialsOf(team.name) || '·'}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }} numberOfLines={1}>{team.name}</Text>
              <View className="flex-row items-center" style={{ gap: 7, marginTop: 4 }}>
                <View className="rounded-full" style={{ width: 14, height: 14, backgroundColor: accent, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }} />
                <Text className="font-mono text-muted" style={{ fontSize: 12 }}>{(team.primaryColor || DEFAULT_ACCENT).toUpperCase()}</Text>
              </View>
            </View>
          </View>
          {canManage ? (
            <Button
              label="Editar marca"
              variant="secondary"
              size="sm"
              leftIcon={Pencil}
              full
              onPress={() => { setBrandName(team.name); setBrandColor(team.primaryColor || ''); setBrandOpen(true) }}
              style={{ marginTop: 14 }}
              testID="team-brand-edit"
            />
          ) : null}
          <Text className="font-sans text-subtle" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 12 }}>
            {canManage ? 'Logos, acentos y loader se gestionan desde la web.' : 'La marca del equipo la gestiona el owner o los co-gestores.'}
          </Text>
        </Card>

        {/* ── Miembros ── */}
        <View className="flex-row items-center justify-between" style={{ marginTop: 20, marginBottom: 10, paddingHorizontal: 2 }}>
          <Text className="font-display-bold text-strong" style={{ fontSize: 16, letterSpacing: -0.3 }}>Miembros ({team.activeMemberCount})</Text>
          {canManage ? (
            <Button
              label="Agregar"
              variant="sport"
              size="sm"
              leftIcon={UserPlus}
              disabled={team.seatsFull}
              onPress={() => { setAddEmail(''); setAddRole(''); setAddOpen(true) }}
              testID="team-add-member"
            />
          ) : null}
        </View>

        {canManage && team.seatsFull ? (
          <View className="flex-row items-start rounded-control bg-surface-sunken" style={{ gap: 8, padding: 12, marginBottom: 10 }}>
            <Lock size={15} strokeWidth={2.2} className="text-muted" style={{ marginTop: 1 }} />
            <Text className="font-sans-bold text-muted" style={{ flex: 1, fontSize: 12, lineHeight: 17 }}>
              Cupos llenos ({team.activeMemberCount}/{team.seatLimit}). Pide al administrador ampliar el equipo.
            </Text>
          </View>
        ) : null}

        <Card padding={16}>
          {team.members.map((m, i) => (
            <View key={m.id} className={i > 0 ? 'border-t border-subtle' : ''}>
              <MemberRow member={m} canManage={canManage} onManage={() => { setConfirmRemove(false); setActiveMember(m) }} />
            </View>
          ))}
        </Card>

        {/* ── Footer ── */}
        <View className="items-center" style={{ gap: 6, marginTop: 24, opacity: 0.6 }}>
          <Users size={20} strokeWidth={2} className="text-muted" />
          <Text className="font-sans-bold text-subtle" style={{ fontSize: 12 }}>EVA Teams · {team.name}</Text>
        </View>
      </ScrollView>

      {/* ── Sheet: agregar miembro ── */}
      <Sheet
        open={addOpen}
        onClose={() => !addPending && setAddOpen(false)}
        title="Agregar coach"
        description="Suma a un coach que ya tenga cuenta EVA por su email."
        snapPoints={['58%']}
        footer={
          <Button label="Agregar al equipo" variant="sport" full loading={addPending} onPress={onAdd} testID="team-add-submit" />
        }
      >
        <View style={{ gap: 14, paddingTop: 4 }}>
          <Input
            label="Email del coach"
            placeholder="coach@ejemplo.cl"
            value={addEmail}
            onChangeText={setAddEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="team-add-email"
          />
          <Input
            label="Especialidad (opcional)"
            placeholder="Ej: Nutrición, Fuerza…"
            value={addRole}
            onChangeText={setAddRole}
            hint="Etiqueta visible para el equipo."
            testID="team-add-role"
          />
        </View>
      </Sheet>

      {/* ── Sheet: editar marca ── */}
      <Sheet
        open={brandOpen}
        onClose={() => !brandPending && setBrandOpen(false)}
        title="Marca del equipo"
        snapPoints={['58%']}
        footer={
          <Button label="Guardar" variant="sport" full loading={brandPending} leftIcon={Palette} onPress={onSaveBrand} testID="team-brand-save" />
        }
      >
        <View style={{ gap: 14, paddingTop: 4 }}>
          <Input
            label="Nombre del equipo"
            value={brandName}
            onChangeText={setBrandName}
            testID="team-brand-name"
          />
          <View>
            <Input
              label="Color primario"
              placeholder="#10B981"
              value={brandColor}
              onChangeText={setBrandColor}
              autoCapitalize="none"
              autoCorrect={false}
              hint="Formato #RRGGBB. Vacío = color del sistema."
              testID="team-brand-color"
            />
            <View className="flex-row items-center" style={{ gap: 8, marginTop: 8 }}>
              <View className="rounded-full" style={{ width: 22, height: 22, backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandColor.trim()) ? brandColor.trim() : DEFAULT_ACCENT, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }} />
              <Text className="font-sans text-muted" style={{ fontSize: 12 }}>Vista previa</Text>
            </View>
          </View>
        </View>
      </Sheet>

      {/* ── Sheet: gestionar miembro ── */}
      <Sheet
        open={activeMember != null}
        onClose={() => { if (!managePending && !removePending) { setActiveMember(null); setConfirmRemove(false) } }}
        title={activeMember?.name ?? 'Miembro'}
        description={activeMember ? roleMeta(activeMember).label : undefined}
        snapPoints={['48%']}
      >
        {activeMember ? (
          <View style={{ gap: 8, paddingTop: 4 }}>
            {/* Co-gestor toggle — solo el owner */}
            {team.isOwner ? (
              <View className="flex-row items-center rounded-control border border-subtle" style={{ gap: 12, padding: 14 }}>
                <ShieldCheck size={18} strokeWidth={2.2} className="text-sport-600" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>Co-gestor</Text>
                  <Text className="font-sans text-muted" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>Puede agregar, remover y editar la marca del equipo.</Text>
                </View>
                <Switch value={activeMember.canManage} onValueChange={onToggleManage} disabled={managePending} />
              </View>
            ) : null}

            {/* Remover — 2 pasos */}
            {!confirmRemove ? (
              <Button
                label="Remover del equipo"
                variant="destructive"
                full
                leftIcon={Trash2}
                onPress={() => setConfirmRemove(true)}
                testID="team-member-remove"
              />
            ) : (
              <View className="rounded-control border border-danger-600 bg-danger-100" style={{ padding: 14, gap: 10 }}>
                <Text className="font-sans-bold text-danger-700" style={{ fontSize: 13, lineHeight: 18 }}>
                  ¿Sacar a {activeMember.name} del pool? Perderá acceso a los alumnos del equipo.
                </Text>
                <View className="flex-row" style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancelar" variant="secondary" size="sm" full disabled={removePending} onPress={() => setConfirmRemove(false)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Remover" variant="danger" size="sm" full loading={removePending} onPress={onRemove} testID="team-member-remove-confirm" />
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </Sheet>
    </Shell>
  )
}
