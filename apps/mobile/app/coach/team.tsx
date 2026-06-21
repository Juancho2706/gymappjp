import { useCallback, useState } from 'react'
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import Svg, { Circle } from 'react-native-svg'
import * as Clipboard from 'expo-clipboard'
import {
  ArrowLeftRight, ChevronLeft, Copy, Crown, ExternalLink, Package, Pencil, ShieldCheck,
  ShieldOff, Sparkles, Ticket, Trash2, UserCheck, UserPlus, Users,
} from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Badge, Button, EmptyState, NativeDialog, ScreenHeader } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { getApiBaseUrl } from '../../lib/api'
import {
  addExistingCoach, getMyTeamOverview, removeMember, setMemberManage, transferOwnership,
  updateMemberRole, updateTeamBrand, type TeamMemberRow, type TeamOverview,
} from '../../lib/team'

function initialsOf(name: string): string {
  return name.split(' ').map((s) => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}

export default function CoachTeamScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<TeamOverview | null>(null)
  const [coachId, setCoachId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('')
  const [actionsFor, setActionsFor] = useState<TeamMemberRow | null>(null)
  const [editFor, setEditFor] = useState<TeamMemberRow | null>(null)
  const [editValue, setEditValue] = useState('')
  const [brandOpen, setBrandOpen] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandColor, setBrandColor] = useState('')
  const [brandLoader, setBrandLoader] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser()
      setCoachId(data.user?.id ?? '')
      setTeam(await getMyTeamOverview())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function refresh() {
    setTeam(await getMyTeamOverview())
  }

  async function copy(value: string, msg: string) {
    await Clipboard.setStringAsync(value).catch(() => {})
    Alert.alert('Copiado', msg)
  }

  async function doAdd() {
    if (!team) return
    setBusy(true)
    const r = await addExistingCoach(team.id, team.seat_limit, addEmail, addRole)
    setBusy(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo agregar.'); return }
    setAddOpen(false); setAddEmail(''); setAddRole('')
    Alert.alert('Coach agregado', 'El coach quedó sumado al pool.')
    refresh()
  }

  async function doSetManage(m: TeamMemberRow) {
    if (!team) return
    setBusy(true)
    const r = await setMemberManage(team.id, m.id, !m.can_manage)
    setBusy(false)
    setActionsFor(null)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo actualizar.'); return }
    refresh()
  }

  function confirmRemove(m: TeamMemberRow) {
    if (!team) return
    setActionsFor(null)
    Alert.alert('Sacar del equipo', `${m.name} pierde acceso al pool. Los alumnos siguen en el equipo. Es reversible: lo podés volver a agregar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sacar', style: 'destructive', onPress: async () => {
        const r = await removeMember(team.id, m.id, team.owner_coach_id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo sacar.'); return }
        refresh()
      } },
    ])
  }

  function confirmTransfer(m: TeamMemberRow) {
    if (!team) return
    setActionsFor(null)
    Alert.alert('Transferir propiedad', `${m.name} pasa a ser owner del equipo (controla cupos, co-gestores y propiedad). Vos quedás como co-gestor. No se puede deshacer salvo que el nuevo owner te la devuelva.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Transferir', style: 'destructive', onPress: async () => {
        const r = await transferOwnership(team.id, m.coach_id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo transferir.'); return }
        refresh()
      } },
    ])
  }

  function openEdit(m: TeamMemberRow) {
    setActionsFor(null)
    setEditValue(m.display_role ?? '')
    setEditFor(m)
  }
  async function doEdit() {
    if (!team || !editFor) return
    setBusy(true)
    const r = await updateMemberRole(team.id, editFor.id, editValue)
    setBusy(false)
    setEditFor(null)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar.'); return }
    refresh()
  }

  function openBrand() {
    if (!team) return
    setBrandName(team.name)
    setBrandColor(team.primary_color ?? '')
    setBrandLoader(team.loader_text ?? '')
    setBrandOpen(true)
  }
  async function doBrand() {
    if (!team) return
    setBusy(true)
    const r = await updateTeamBrand(team.id, { name: brandName, primary_color: brandColor, loader_text: brandLoader })
    setBusy(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar.'); return }
    setBrandOpen(false)
    Alert.alert('Marca actualizada', 'Los cambios ya están vivos para el pool y tus alumnos.')
    refresh()
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando equipo…" />
      </SafeAreaView>
    )
  }

  const accent = team?.primary_color || '#10B981'
  const seatPct = team && team.seat_limit > 0 ? Math.min(1, team.activeMemberCount / team.seat_limit) : 0
  const activeModules = team ? Object.values(team.enabled_modules).filter(Boolean).length : 0
  const seatsFull = !!team && team.activeMemberCount >= team.seat_limit

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Mi equipo" subtitle="Pool compartido de coaches" />

      {!team ? (
        <EmptyState
          icon={Users}
          title="No perteneces a ningún equipo"
          subtitle="Cuando te sumen a un pool de coaches, aparecerá acá."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ── Hero ── */}
          <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.heroTop}>
              <View style={[styles.logoBox, { borderColor: accent + '40', backgroundColor: accent + '14' }]}>
                {team.logo_url ? (
                  <Image source={{ uri: team.logo_url }} style={styles.logoImg} resizeMode="contain" />
                ) : (
                  <Users size={26} color={accent} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.teamName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={1}>{team.name}</Text>
                <View style={styles.roleRow}>
                  {team.isOwner ? (
                    <Badge label="Owner" toneColor={accent} />
                  ) : team.isManager ? (
                    <Badge label="Co-gestor" tone="muted" />
                  ) : (
                    <Badge label="Miembro" tone="muted" />
                  )}
                </View>
              </View>
            </View>
            <Text style={[styles.heroSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Todo el equipo ve a todos los alumnos del pool.
            </Text>

            {/* Share link + invite code */}
            <View style={styles.shareRow}>
              <TouchableOpacity
                onPress={() => copy(`${getApiBaseUrl()}/t/${team.slug}/login`, 'Link de login de alumnos copiado.')}
                activeOpacity={0.8}
                style={[styles.sharePill, { borderColor: theme.border, backgroundColor: theme.secondary }]}
              >
                <Text style={[styles.shareMono, { color: theme.mutedForeground }]} numberOfLines={1}>/t/{team.slug}</Text>
                <Copy size={13} color={theme.mutedForeground} />
              </TouchableOpacity>
              {team.invite_code ? (
                <TouchableOpacity
                  onPress={() => copy(`${getApiBaseUrl()}/join/${team.invite_code}`, 'Link de invitación al pool copiado.')}
                  activeOpacity={0.8}
                  style={[styles.sharePill, { borderColor: theme.border, backgroundColor: theme.secondary }]}
                >
                  <Ticket size={13} color={theme.mutedForeground} />
                  <Text style={[styles.shareCode, { color: theme.foreground }]}>{team.invite_code}</Text>
                  <Copy size={13} color={theme.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <View style={styles.ringWrap}>
                  <Svg width={46} height={46}>
                    <Circle cx={23} cy={23} r={19} stroke={theme.muted} strokeWidth={5} fill="none" />
                    <Circle
                      cx={23} cy={23} r={19} stroke={accent} strokeWidth={5} fill="none" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 19}
                      strokeDashoffset={2 * Math.PI * 19 * (1 - seatPct)}
                      transform="rotate(-90 23 23)"
                    />
                  </Svg>
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                    {team.activeMemberCount}<Text style={{ color: theme.mutedForeground, fontSize: 13 }}>/{team.seat_limit}</Text>
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>Cupos</Text>
                </View>
              </View>

              <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <View style={[styles.statIcon, { backgroundColor: accent + '14' }]}>
                  <UserCheck size={18} color={accent} />
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{team.poolClientCount}</Text>
                  <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>Alumnos</Text>
                </View>
              </View>

              <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <View style={[styles.statIcon, { backgroundColor: accent + '14' }]}>
                  <Package size={18} color={accent} />
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{activeModules}</Text>
                  <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>Módulos</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Brand Studio ── */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIcon, { backgroundColor: accent + '14' }]}>
                <Sparkles size={16} color={accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Marca del equipo</Text>
                <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>La identidad que ven tus alumnos y todo el pool.</Text>
              </View>
            </View>
            {team.isManager ? (
              <>
                <View style={styles.brandPreview}>
                  <View style={[styles.swatch, { backgroundColor: accent, borderColor: theme.border }]} />
                  <Text style={[styles.hint, { color: theme.foreground, fontFamily: theme.fontSans, flex: 1 }]} numberOfLines={1}>
                    {team.primary_color ?? 'Color por defecto'}{team.loader_text ? ` · "${team.loader_text}"` : ''}
                  </Text>
                </View>
                <Button label="Editar marca" leftIcon={Pencil} variant="secondary" size="sm" onPress={openBrand} />
                <TouchableOpacity onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/team`).catch(() => {})} activeOpacity={0.7} style={styles.webLink}>
                  <ExternalLink size={12} color={theme.mutedForeground} />
                  <Text style={[styles.webLinkText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Logos y loader avanzado en la web</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Solo el owner o un co-gestor pueden editar la marca.</Text>
            )}
          </View>

          {/* ── Miembros ── */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.membersHead}>
              <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Miembros ({team.activeMemberCount})</Text>
              {team.isManager ? (
                <TouchableOpacity
                  disabled={seatsFull}
                  onPress={() => { setAddEmail(''); setAddRole(''); setAddOpen(true) }}
                  activeOpacity={0.8}
                  style={[styles.addBtn, { borderColor: theme.primary, opacity: seatsFull ? 0.4 : 1 }]}
                >
                  <UserPlus size={14} color={theme.primary} />
                  <Text style={[styles.addBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Agregar</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {seatsFull && team.isManager ? (
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Llegaste al límite de {team.seat_limit} cupos. Pedí al administrador ampliar el equipo para sumar más coaches.
              </Text>
            ) : null}

            {team.members.map((m) => {
              const isMemberOwner = m.coach_id === team.owner_coach_id
              const isSelf = m.coach_id === coachId
              const showActions = team.isManager && !isMemberOwner
              return (
                <View key={m.id} style={[styles.memberRow, { borderTopColor: theme.border }]}>
                  <View style={[styles.avatar, { backgroundColor: accent + '1A' }]}>
                    <Text style={[styles.avatarText, { color: accent, fontFamily: 'Montserrat_700Bold' }]}>{initialsOf(m.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.memberName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                      {m.name}{isSelf ? <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans }}> (vos)</Text> : ''}
                    </Text>
                    <Text style={[styles.memberRole, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{m.display_role || 'Coach'}</Text>
                  </View>
                  {isMemberOwner ? (
                    <View style={[styles.ownerTag, { backgroundColor: accent + '22' }]}>
                      <Crown size={12} color={accent} />
                      <Text style={[styles.ownerTagText, { color: accent, fontFamily: 'Montserrat_700Bold' }]}>Owner</Text>
                    </View>
                  ) : m.can_manage ? (
                    <Badge label="Gestor" tone="muted" />
                  ) : null}
                  {showActions ? (
                    <TouchableOpacity onPress={() => setActionsFor(m)} hitSlop={8} style={styles.dots} activeOpacity={0.7}>
                      <Text style={{ color: theme.mutedForeground, fontSize: 20, lineHeight: 20 }}>⋯</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}

      {/* Agregar coach existente */}
      <NativeDialog open={addOpen} title="Agregar coach al equipo" onClose={() => setAddOpen(false)}>
        <View style={{ gap: 12 }}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Sumá un coach que ya tiene cuenta en EVA (por email). Para crear una cuenta nueva, usá la web.
          </Text>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>EMAIL DEL COACH</Text>
            <TextInput
              value={addEmail} onChangeText={setAddEmail} keyboardType="email-address" autoCapitalize="none"
              placeholder="coach@email.com" placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>ESPECIALIDAD (OPCIONAL)</Text>
            <TextInput
              value={addRole} onChangeText={setAddRole} maxLength={60}
              placeholder="Nutrición, Kinesiología..." placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <Button label={busy ? 'Agregando...' : 'Agregar'} onPress={doAdd} disabled={busy || !addEmail.trim()} full />
          <TouchableOpacity onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/team`).catch(() => {})} activeOpacity={0.7} style={styles.webLink}>
            <ExternalLink size={12} color={theme.mutedForeground} />
            <Text style={[styles.webLinkText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Crear cuenta nueva de coach en la web</Text>
          </TouchableOpacity>
        </View>
      </NativeDialog>

      {/* Acciones de miembro */}
      <NativeDialog open={!!actionsFor} title={actionsFor?.name ?? ''} onClose={() => setActionsFor(null)}>
        <View style={{ gap: 8 }}>
          <ActionRow theme={theme} icon={Pencil} color={theme.foreground} label="Editar especialidad" onPress={() => actionsFor && openEdit(actionsFor)} />
          {team?.isOwner && actionsFor ? (
            <ActionRow
              theme={theme}
              icon={actionsFor.can_manage ? ShieldOff : ShieldCheck}
              color={theme.foreground}
              label={actionsFor.can_manage ? 'Quitar co-gestor' : 'Hacer co-gestor'}
              disabled={busy}
              onPress={() => doSetManage(actionsFor)}
            />
          ) : null}
          {team?.isOwner && actionsFor ? (
            <ActionRow theme={theme} icon={ArrowLeftRight} color={theme.foreground} label="Transferir propiedad" onPress={() => confirmTransfer(actionsFor)} />
          ) : null}
          <ActionRow theme={theme} icon={Trash2} color={theme.destructive} label="Sacar del equipo" onPress={() => actionsFor && confirmRemove(actionsFor)} />
        </View>
      </NativeDialog>

      {/* Editar especialidad */}
      <NativeDialog open={!!editFor} title={`Especialidad de ${editFor?.name ?? ''}`} onClose={() => setEditFor(null)}>
        <View style={{ gap: 12 }}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Etiqueta visible para el equipo. No cambia los permisos.</Text>
          <TextInput
            value={editValue} onChangeText={setEditValue} maxLength={60} autoFocus
            placeholder="Nutrición, Kinesiología..." placeholderTextColor={theme.mutedForeground}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
          />
          <Button label={busy ? 'Guardando...' : 'Guardar'} onPress={doEdit} disabled={busy} full />
        </View>
      </NativeDialog>

      {/* Editar marca */}
      <NativeDialog open={brandOpen} title="Marca del equipo" onClose={() => setBrandOpen(false)}>
        <View style={{ gap: 12 }}>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>NOMBRE DEL EQUIPO</Text>
            <TextInput
              value={brandName} onChangeText={setBrandName} maxLength={80}
              placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>COLOR PRIMARIO (#RRGGBB)</Text>
            <View style={styles.colorRow}>
              <View style={[styles.swatch, { backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandColor.trim()) ? brandColor.trim() : '#10B981', borderColor: theme.border }]} />
              <TextInput
                value={brandColor} onChangeText={setBrandColor} maxLength={7} autoCapitalize="none"
                placeholder="#10B981" placeholderTextColor={theme.mutedForeground}
                style={[styles.input, { flex: 1, borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
              />
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>TEXTO DEL LOADER (OPCIONAL)</Text>
            <TextInput
              value={brandLoader} onChangeText={setBrandLoader} maxLength={24}
              placeholder="Cargando..." placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <Button label={busy ? 'Guardando...' : 'Guardar marca'} onPress={doBrand} disabled={busy} full />
        </View>
      </NativeDialog>
    </SafeAreaView>
  )
}

function ActionRow({ theme, icon: Icon, color, label, onPress, disabled }: { theme: any; icon: any; color: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
      style={[styles.actionRow, { borderColor: theme.border, backgroundColor: theme.secondary, opacity: disabled ? 0.5 : 1 }]}>
      <Icon size={16} color={color} />
      <Text style={[styles.actionText, { color, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },

  hero: { padding: 16, borderWidth: 1, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoBox: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  teamName: { fontSize: 22, letterSpacing: -0.5 },
  roleRow: { flexDirection: 'row', marginTop: 6 },
  heroSub: { fontSize: 12.5, lineHeight: 17 },

  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sharePill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  shareMono: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  shareCode: { fontSize: 12.5, fontFamily: 'Montserrat_700Bold', letterSpacing: 2 },

  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  ringWrap: { width: 46, height: 46 },
  statIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 19, letterSpacing: -0.4 },
  statLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },

  section: { padding: 16, borderWidth: 1, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, letterSpacing: -0.2 },
  hint: { fontSize: 12, lineHeight: 17 },

  brandPreview: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  webLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  webLinkText: { fontSize: 11.5 },

  membersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { fontSize: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13 },
  memberName: { fontSize: 14 },
  memberRole: { fontSize: 12, marginTop: 1 },
  ownerTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  ownerTagText: { fontSize: 11, letterSpacing: 0.3 },
  dots: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  actionText: { fontSize: 14 },
})
