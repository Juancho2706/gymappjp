import { useState } from 'react'
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { X } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

const { width } = Dimensions.get('window')

// Foto con pinch-zoom + pan (gesto nativo). Avisa cuando está ampliada para
// desactivar el scroll del carrusel.
function ZoomableImage({ uri, onZoom }: { uri: string; onZoom: (z: boolean) => void }) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const sx = useSharedValue(0)
  const sy = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale)) })
    .onEnd(() => {
      savedScale.value = scale.value
      if (scale.value <= 1.05) { runOnJS(onZoom)(false); scale.value = withTiming(1); savedScale.value = 1 }
      else runOnJS(onZoom)(true)
    })
  const pan = Gesture.Pan()
    .onUpdate((e) => { if (scale.value > 1) { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY } })
    .onEnd(() => { sx.value = tx.value; sy.value = ty.value })
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    if (scale.value > 1) {
      scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0); savedScale.value = 1; sx.value = 0; sy.value = 0
      runOnJS(onZoom)(false)
    } else {
      scale.value = withTiming(2); savedScale.value = 2; runOnJS(onZoom)(true)
    }
  })
  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan))
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }))

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.page}>
        <Animated.View style={[styles.imgWrap, style]}>
          <Image source={{ uri }} style={styles.img} contentFit="contain" transition={120} />
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

export function PhotoLightbox({ photos, index = 0, visible, onClose }: { photos: string[]; index?: number; visible: boolean; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)
  if (!visible) return null
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
          <X size={26} color="#fff" />
        </Pressable>
        <ScrollView
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed && photos.length > 1}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * width, y: 0 }}
        >
          {photos.map((p, i) => <ZoomableImage key={i} uri={p} onZoom={setZoomed} />)}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  page: { width, flex: 1, alignItems: 'center', justifyContent: 'center' },
  imgWrap: { width, height: '100%', alignItems: 'center', justifyContent: 'center' },
  img: { width: width, height: '82%' },
})
