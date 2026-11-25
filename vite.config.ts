import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' damit die App auch unter github.io/<repo>/ läuft
export default defineConfig({ base: './', plugins: [react()] })
