import { defineConfig, devices } from '@playwright/test';

// The app is static ES modules, so Playwright serves the folder over HTTP itself.
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:8765' },
  webServer: {
    command: 'node scripts/serve.js 8765',
    url: 'http://localhost:8765',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
