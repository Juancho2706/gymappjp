declare module 'react-native-webview' {
  import type { ComponentType } from 'react'
  import type { ViewProps } from 'react-native'

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string; html?: string; baseUrl?: string }
    allowsFullscreenVideo?: boolean
    allowsInlineMediaPlayback?: boolean
    javaScriptEnabled?: boolean
    mediaPlaybackRequiresUserAction?: boolean
    domStorageEnabled?: boolean
    androidLayerType?: 'none' | 'software' | 'hardware'
    setSupportMultipleWindows?: boolean
  }

  export const WebView: ComponentType<WebViewProps>
}
