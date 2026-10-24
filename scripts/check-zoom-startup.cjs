// Real CDN SDK + app iframe bridge. The join method is intercepted so this
// checks startup without credentials, a real meeting, camera, or microphone.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const base = process.env.ZOOM_SMOKE_BASE_URL || 'http://localhost:3011';
  const server = process.env.ZOOM_SMOKE_BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3011'], { stdio: 'ignore', windowsHide: true });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch(`${base}/api/zoom/room`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('The local test server did not start. Build the app first.');
    browser = await chromium.launch({ ...(process.platform === 'win32' ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}), headless: true });
    let sdkSource;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      page.on('requestfailed', request => {
        if (request.url().startsWith('https://source.zoom.us/')) console.error(`Zoom CDN download failed: ${new URL(request.url()).pathname}`);
      });
      await page.route('https://source.zoom.us/zoom-meeting-*.min.js', async route => {
        if (!sdkSource) sdkSource = await (await route.fetch({ timeout: 60000, maxRetries: 2 })).text();
        const intercept = `
          const original = window.ZoomMtg;
          window.ZoomMtg = new Proxy(original, {get(target, key) {
            if (key === 'init') return options => target.init({...options,success: (...args) => {window.__startup.push('initialized');options.success(...args);}});
            if (key === 'inMeetingServiceListener') return (...args) => {target.inMeetingServiceListener(...args);window.__startup.push('subscribed');};
            if (key === 'join') return options => {window.__startup.push('join-requested');options.success();};
            const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
          }});`;
        await route.fulfill({ contentType: 'application/javascript', body: `${sdkSource}\n;(() => {window.__startup=[];${intercept}})();` });
      });
      await page.goto(`${base}/api/zoom/room`);
      await page.evaluate(({ nonce }) => {
        window.__startupResult = null;
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
        window.addEventListener('message', event => {
          if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.nonce !== nonce) return;
          if (event.data.type === 'ready') frame.contentWindow.postMessage({ channel: 'klinique-zoom', nonce, type: 'join', credentials: { signature: 'nonfunctional-diagnostic-signature', meetingNumber: '00000000000', password: '', userName: 'SDK startup diagnostic' } }, location.origin);
          if (event.data.type === 'connected' || event.data.type === 'error') window.__startupResult = { type: event.data.type, phase: event.data.phase, code: event.data.code };
        });
        frame.src = `/api/zoom/room?nonce=${nonce}`;
        document.body.replaceChildren(frame);
      }, { nonce: randomUUID() });
      await page.waitForFunction(() => window.__startupResult, undefined, { timeout: 90000 });
      const result = await page.evaluate(() => window.__startupResult);
      assert.equal(result.type, 'connected', JSON.stringify(result));
      const frame = page.frames().find(frame => frame.url().includes('nonce='));
      const stages = await frame.evaluate(() => window.__startup);
      assert.deepEqual(stages, ['initialized', 'subscribed', 'join-requested']);
      console.log(`${viewport.width}px: full-page Zoom SDK initialized, listener subscribed, join reached; no real meeting joined`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
