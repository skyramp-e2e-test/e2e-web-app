// Skyramp Testbot test package: Testbot owns and maintains everything in this folder.
// Run it with ./run.sh; CI calls that same entrypoint.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Not *.spec.ts: the repository's own unit runner would collect those.
  testMatch: "**/*.e2e.ts",
  // The tests compare the shared item list before and after their own changes, so they run one at a time.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["junit", { outputFile: "test-results/junit.xml" }]] : "list",
  use: { baseURL: process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || process.env.BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
