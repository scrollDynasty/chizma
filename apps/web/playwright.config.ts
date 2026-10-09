import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the whole flow against a real API in test mode (fake AI provider, test
 * sign-in, throwaway SQLite). Run with `pnpm e2e`.
 */
const API_PORT = 8010;
const WEB_PORT = 5183;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}/chizma/`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    locale: "ru-RU",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: `uv run alembic upgrade head && uv run uvicorn chizma_api.main:app --port ${API_PORT}`,
      cwd: "../api",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        CHIZMA_ENV: "test",
        CHIZMA_AI_PROVIDER: "fake",
        CHIZMA_DATABASE_URL: "sqlite:///./data/e2e.db",
        CHIZMA_CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        CHIZMA_MIN_SECONDS_BETWEEN_GENERATIONS: "0",
        CHIZMA_DAILY_USER_LIMIT: "1000",
        CHIZMA_DAILY_BUDGET_USD: "100",
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/chizma/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
