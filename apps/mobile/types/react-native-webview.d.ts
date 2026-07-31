declare module 'react-native-webview' {
  import type { ComponentType } from 'react'
  import type { ViewProps } from 'react-native'

  /** Mensaje de `window.ReactNativeWebView.postMessage(<string>)` desde el HTML. */
  export interface WebViewMessageEvent {
    nativeEvent: { data: string }
  }
  /** Fallo de carga del documento (red caída, dominio inalcanzable) o status HTTP de error. */
  export interface WebViewErrorEvent {
    nativeEvent: { description?: string; code?: number; url?: string; statusCode?: number }
  }

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string; html?: string; baseUrl?: string }
    allowsFullscreenVideo?: boolean
    allowsInlineMediaPlayback?: boolean
    javaScriptEnabled?: boolean
    mediaPlaybackRequiresUserAction?: boolean
    domStorageEnabled?: boolean
    androidLayerType?: 'none' | 'software' | 'hardware'
    setSupportMultipleWindows?: boolean
    /**
     * Resiliencia de carga (QA5 · `VideoPlayer`): sin estos handlers un embed muerto dejaba una caja
     * vacía con los controles encima. `onMessage` recibe además el aviso "cargué / fallé" que emite el
     * propio HTML (el documento del WebView es local, así que `onLoadEnd` llega al instante y no sirve
     * como señal de que el `<iframe>`/`<video>` resolvió).
     */
    onMessage?: (event: WebViewMessageEvent) => void
    onError?: (event: WebViewErrorEvent) => void
    onHttpError?: (event: WebViewErrorEvent) => void
    onLoadEnd?: () => void
  }

  export const WebView: ComponentType<WebViewProps>
}
