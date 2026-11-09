import { defineConfig, devices } from '@playwright/test';

// The app is static ES modules, so Playwright serves the folder over HTTP itself.
// PORT lets parallel checkouts (e.g. software-factory worktrees) each test their own server.
const PORT = Number(process.env.PORT || 8765);

export default defineConfig({
  testDir: './tests',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `node scripts/serve.js ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
