const { defineConfig } = require('@playwright/test');
require('@next/env').loadEnvConfig(process.cwd());

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.platform === 'win32' ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {},
  },
});
