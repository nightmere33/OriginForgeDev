import { defineConfig } from "@playwright/test";

// E2E against the running dev stack (next dev :3000 + Django :8000).
// Uses the installed Chrome, so no browser download is needed.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
