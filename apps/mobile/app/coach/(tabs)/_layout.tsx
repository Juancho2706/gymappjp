import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'
import { CoachTabbarScrollProvider } from '../../../components/coach/CoachTabbarScroll'
import { GuidePill } from '../../../components/coach/GuidePill'

export default function CoachTabsLayout() {
  const { theme } = useTheme()

  // E7-12: el gate de suscripcion YA NO vive aca. Subio a `app/coach/_layout.tsx` porque este
  // layout solo cubre el grupo `(tabs)` (dejaba sin gate la ficha del alumno, program-builder,
  // nutrition-v2, cardio, settings/*, …) y ademas no se desmonta al cambiar de tab, asi que el
  // chequeo corria una sola vez por arranque. El de arriba es estado reactivo sobre TODO /coach.

  return (
    <CoachTabbarScrollProvider>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Sin barra superior global: cada screen renderiza su propio header. El dashboard
            usa <MobileGreetingHeader/>. El set de Tabs.Screen es fijo porque Expo Router
            necesita los archivos; CoachMobileTabBar decide cuáles se PINTAN: Ola de orden W2.5,
            la cápsula muestra [Inicio, Alumnos, los 2 dominios que la especialidad del coach pone
            primero, «Más»] y el resto vive en la hoja «Más» (`more.tsx`), respetando workspace,
            dominios y suscripción como la web. */}
        <Tabs
          tabBar={(props) => <CoachMobileTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          <Tabs.Screen name="home" options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="clientes" options={{ title: 'Alumnos' }} />
          <Tabs.Screen name="builder" options={{ title: 'Programas' }} />
          <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios' }} />
          <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
          <Tabs.Screen name="settings" options={{ title: 'Opciones' }} />
          <Tabs.Screen name="team" options={{ title: 'Equipo' }} />
          <Tabs.Screen name="reactivate" options={{ title: 'Reactivar' }} />
          <Tabs.Screen name="support" options={{ title: 'Soporte' }} />
          <Tabs.Screen name="subscription" options={{ title: 'Mi plan' }} />
          <Tabs.Screen name="more" options={{ title: 'Más' }} />
          <Tabs.Screen name="perfil" options={{ title: 'Mi cuenta' }} />
        </Tabs>

        {/* Guía de inicio — acceso flotante, montado UNA vez para todo el grupo de tabs y por
            encima de la cápsula del nav. Vive acá y no en cada pantalla porque su estado
            (expandida/minimizada) no puede reiniciarse al cambiar de tab. Se pinta sola solo
            cuando corresponde: lee la foto publicada por el dashboard y la guía, y se apaga con la
            guía completa, descartada, oculta o en un workspace administrado. Las pantallas de
            stack (`/coach/guia`, builders, `/coach/onboarding/*`) tapan este layout, así que ahí
            no aparece. */}
        <GuidePill />
      </View>
    </CoachTabbarScrollProvider>
  )
}
