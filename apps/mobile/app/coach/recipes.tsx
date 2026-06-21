import { useEffect, useState } from 'react'
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import {
  Check,
  ChefHat,
  ChevronLeft,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EmptyState, NativeDialog } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import {
  assignRecipeToClients,
  createRecipe,
  deleteRecipe,
  listAssignClients,
  listCoachRecipes,
  updateRecipe,
  uploadRecipePhoto,
  type RecipeAssignClient,
  type RecipeRow,
} from '../../lib/recipes'

export default function CoachRecipesScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [clients, setClients] = useState<RecipeAssignClient[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RecipeRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [assignTarget, setAssignTarget] = useState<RecipeRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [r, c] = await Promise.all([listCoachRecipes(), listAssignClients()])
      setRecipes(r)
      setClients(c)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  function confirmDelete(recipe: RecipeRow) {
    Alert.alert('Eliminar receta', `¿Eliminar "${recipe.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteRecipe(recipe.id)
          if (!res.ok) {
            Alert.alert('Error', res.error ?? 'No se pudo eliminar.')
            return
          }
          load()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando recetas…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Recetas</Text>
        <TouchableOpacity onPress={() => setCreating(true)} activeOpacity={0.85} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Plus size={20} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.introWrap}>
        <Text style={[styles.intro, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Ideas de recetas — inspiración para tus alumnos. No afectan macros ni adherencia.
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <FlashList
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState
                icon={ChefHat}
                title="Todavía no tienes recetas"
                subtitle="Toca + para crear ideas de recetas que inspiren a tus alumnos."
              />
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.primary + '14' }]}>
                  <ChefHat size={28} color={theme.primary + '88'} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.ingredients_text ? (
                  <Text style={[styles.cardIngredients, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={3}>
                    {item.ingredients_text}
                  </Text>
                ) : null}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => setAssignTarget(item)}
                    activeOpacity={0.85}
                    style={[styles.shareBtn, { backgroundColor: theme.primary }]}
                  >
                    <Users size={14} color={theme.primaryForeground} />
                    <Text style={[styles.shareBtnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Compartir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(item)} hitSlop={6} style={[styles.iconBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
                    <Pencil size={15} color={theme.mutedForeground} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={6} style={[styles.iconBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
                    <Trash2 size={15} color={theme.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      </View>

      <NativeDialog open={creating || !!editing} title={editing ? 'Editar receta' : 'Nueva receta'} onClose={() => { setCreating(false); setEditing(null) }}>
        <RecipeForm
          theme={theme}
          recipe={editing}
          onDone={() => { setCreating(false); setEditing(null); load() }}
          onCancel={() => { setCreating(false); setEditing(null) }}
        />
      </NativeDialog>

      <NativeDialog open={!!assignTarget} title="Compartir receta" onClose={() => setAssignTarget(null)}>
        {assignTarget ? (
          <AssignForm
            theme={theme}
            recipe={assignTarget}
            clients={clients}
            onDone={() => setAssignTarget(null)}
            onCancel={() => setAssignTarget(null)}
          />
        ) : null}
      </NativeDialog>
    </SafeAreaView>
  )
}

// ── Crear / editar ────────────────────────────────────────────────────────────
function RecipeForm({ theme, recipe, onDone, onCancel }: { theme: any; recipe: RecipeRow | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState(recipe?.ingredients_text ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [imageUrl, setImageUrl] = useState(recipe?.image_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir una imagen.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [16, 9] })
      if (result.canceled || !result.assets[0]) return
      setUploading(true)
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
        )
        const url = await uploadRecipePhoto(compressed.uri)
        if (!url) {
          Alert.alert('Error', 'No se pudo subir la imagen. Podés guardar la receta sin imagen.')
          return
        }
        setImageUrl(url)
      } finally {
        setUploading(false)
      }
    } catch {
      setUploading(false)
      Alert.alert('Error', 'No se pudo procesar la imagen.')
    }
  }

  async function submit() {
    if (!name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        ingredients_text: ingredients.trim() || null,
        instructions: instructions.trim() || null,
        image_url: imageUrl.trim() || null,
      }
      const res = recipe ? await updateRecipe(recipe.id, input) : await createRecipe(input)
      if (!res.ok) {
        setError(res.error ?? 'No se pudo guardar.')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}

      <View style={{ gap: 5 }}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Bowl de pollo y quinoa"
          placeholderTextColor={theme.mutedForeground}
          maxLength={160}
          style={[styles.fInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
      </View>

      <View style={{ gap: 5 }}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Ingredientes</Text>
        <TextInput
          value={ingredients}
          onChangeText={setIngredients}
          placeholder={'Ej:\n- 150 g pechuga de pollo\n- 1 taza de quinoa cocida\n- 1/2 palta'}
          placeholderTextColor={theme.mutedForeground}
          maxLength={8000}
          multiline
          style={[styles.fTextarea, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
      </View>

      <View style={{ gap: 5 }}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Instrucciones</Text>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Pasos para preparar la receta…"
          placeholderTextColor={theme.mutedForeground}
          maxLength={8000}
          multiline
          style={[styles.fTextarea, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Imagen (opcional)</Text>
        {imageUrl ? (
          <View style={styles.imgPreviewWrap}>
            <Image source={{ uri: imageUrl }} style={styles.imgPreview} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImageUrl('')} disabled={uploading} style={styles.imgRemove} activeOpacity={0.8}>
              <X size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickImage}
            disabled={uploading}
            activeOpacity={0.8}
            style={[styles.imgPicker, { borderColor: theme.border, backgroundColor: theme.secondary, opacity: uploading ? 0.6 : 1 }]}
          >
            <ImagePlus size={20} color={theme.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: theme.mutedForeground }}>
              {uploading ? 'Subiendo…' : 'Subir imagen'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={[styles.cancelBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
          <Text style={{ color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={saving || uploading} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving || uploading ? 0.6 : 1 }]} activeOpacity={0.85}>
          <Text style={{ color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold', fontSize: 14 }}>{saving ? 'Guardando…' : recipe ? 'Guardar' : 'Crear'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// ── Compartir (multi-select alumnos) ────────────────────────────────────────────
function AssignForm({ theme, recipe, clients, onDone, onCancel }: { theme: any; recipe: RecipeRow; clients: RecipeAssignClient[]; onDone: () => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = clients.filter((c) => c.full_name.toLowerCase().includes(search.trim().toLowerCase()))
  const allSelected = clients.length > 0 && selected.length === clients.length

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  async function assign() {
    if (selected.length === 0) return
    setSaving(true)
    try {
      const res = await assignRecipeToClients(recipe.id, selected)
      if (!res.ok) {
        Alert.alert('Error', res.error ?? 'No se pudo compartir la receta.')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.assignBanner, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '0D' }]}>
        <Text style={[styles.assignBannerLabel, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Receta seleccionada</Text>
        <Text style={[styles.assignBannerName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={1}>{recipe.name}</Text>
      </View>

      <View style={styles.assignHeadRow}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Alumnos ({selected.length})</Text>
        {clients.length > 0 ? (
          <TouchableOpacity onPress={() => setSelected(allSelected ? [] : clients.map((c) => c.id))} hitSlop={6}>
            <Text style={{ fontSize: 11, fontFamily: 'Montserrat_700Bold', color: theme.primary }}>
              {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
        <Search size={16} color={theme.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nombre…"
          placeholderTextColor={theme.mutedForeground}
          autoCapitalize="none"
          style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
        />
      </View>

      <View style={{ maxHeight: 280 }}>
        {filtered.length === 0 ? (
          <View style={[styles.assignEmpty, { borderColor: theme.border }]}>
            <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 13, textAlign: 'center' }}>
              {clients.length === 0 ? 'No tienes alumnos activos.' : 'No hay alumnos que coincidan.'}
            </Text>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
            {filtered.map((client) => {
              const on = selected.includes(client.id)
              return (
                <TouchableOpacity
                  key={client.id}
                  onPress={() => toggle(client.id)}
                  activeOpacity={0.8}
                  style={[styles.clientRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '0D' : 'transparent' }]}
                >
                  <View style={[styles.checkbox, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                    {on ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.clientName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{client.full_name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={[styles.cancelBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
          <Text style={{ color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={assign} disabled={saving || selected.length === 0} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving || selected.length === 0 ? 0.5 : 1 }]} activeOpacity={0.85}>
          <Text style={{ color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold', fontSize: 14 }}>
            {saving ? 'Procesando…' : `Compartir${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  backText: { fontSize: 13 },
  title: { fontSize: 16 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  introWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  intro: { fontSize: 12, lineHeight: 17 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  card: { borderWidth: 1, overflow: 'hidden' },
  cardImage: { width: '100%', aspectRatio: 16 / 9 },
  cardImagePlaceholder: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14, gap: 8 },
  cardName: { fontSize: 16, lineHeight: 20 },
  cardIngredients: { fontSize: 12, lineHeight: 17 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12 },
  shareBtnText: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  iconBtn: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // form
  fLabel: { fontSize: 12 },
  fInput: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  fTextarea: { minHeight: 92, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, textAlignVertical: 'top' },
  imgPreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  imgPreview: { width: '100%', aspectRatio: 16 / 9 },
  imgRemove: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imgPicker: { height: 96, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // assign
  assignBanner: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  assignBannerLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  assignBannerName: { fontSize: 16 },
  assignHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  assignEmpty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 24 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 14, flex: 1 },
})
