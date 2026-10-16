import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite build --logLevel warn && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
    // the tests cover the local mode (Fase 6): "off" keeps the cloud of .env.local out of this build
    // (an empty value would not override the file)
    env: { VITE_SUPABASE_URL: 'off' },
  },
})
