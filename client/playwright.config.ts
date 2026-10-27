import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real API (in-memory store) and a production build of the web app.
 * Set PW_CHROMIUM to use a pre-installed Chromium instead of Playwright's download.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npm --prefix ../server run build && STORE=memory AUTH_RATE_LIMIT=1000 PORT=4000 CLIENT_ORIGIN=http://localhost:4173 node ../server/dist/index.js",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
