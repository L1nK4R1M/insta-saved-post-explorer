import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      AUTH_DISABLED: process.env.AUTH_DISABLED ?? "false",
      APP_OWNER_ID: process.env.APP_OWNER_ID ?? "e2e-owner",
    },
  },
  // Desktop is the default project and runs everything. The mobile project runs
  // ONLY scenarios tagged `@mobile`, because real device emulation — touch input,
  // device pixel ratio, mobile user agent — is the only thing it adds.
  //
  // Running every scenario twice was measured as the suite's largest cost, and
  // most of it was not even different work: every viewport-sensitive test sets its
  // own viewport with `test.use` or `setViewportSize`, which overrides the
  // project's device, so the second run was byte-identical.
  //
  // Tag a scenario `@mobile` when it needs the mobile device, and `@mobile-only`
  // as well when running it on desktop would prove nothing.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@mobile-only/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
});
