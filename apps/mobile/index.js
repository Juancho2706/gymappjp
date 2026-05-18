import { registerRootComponent } from 'expo'
import { ExpoRoot } from 'expo-router'
import React from 'react'

const ctx = require.context('./app')

function App() {
  return <ExpoRoot context={ctx} />
}

registerRootComponent(App)
