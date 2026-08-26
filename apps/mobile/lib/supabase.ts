import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE, no implícito: con el flujo implícito el `/auth/v1/verify` del reset de clave vuelve
      // como `eva://reset-password#access_token=…` y el FRAGMENTO se pierde en el salto Custom
      // Tab → intent de Android, así que la app abría sin nada. Con PKCE el retorno es `?code=…`
      // en la QUERY, que sí sobrevive, y `reset-password` lo canjea con `exchangeCodeForSession`.
      // No afecta a Google: usa `signInWithIdToken` nativo, no un redirect OAuth.
      flowType: 'pkce',
    },
  }
)
