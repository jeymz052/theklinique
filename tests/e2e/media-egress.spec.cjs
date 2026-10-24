/* eslint-disable @typescript-eslint/no-require-imports */
const { test, expect } = require('@playwright/test');
const manifest = require('../../lib/public-media-manifest.json');

const urls = Object.keys(manifest);
const image = url => ({ url, type: 'image', alt: 'Clinic public media' });
async function publicContent(page, content, posts = []) {
  await page.route('**/api/landing-content', route => route.fulfill({ json: { content } }));
  await page.route('**/api/booking-catalog', route => route.fulfill({ json: { services: [], categories: [], products: [] } }));
  await page.route('**/api/blog-posts*', route => route.fulfill({ json: { posts } }));
  await page.route('**/storage/v1/**', route => route.abort());
}

test('published landing images render from deployed copies without storage requests', async ({ page }) => {
  expect(urls.length).toBe(12);
  const storageRequests = [];
  page.on('request', request => {
    const url = decodeURIComponent(request.url());
    if (url.includes('/storage/v1/')) storageRequests.push(url);
  });
  await publicContent(page, {
    heroMedia: urls.slice(0, 5).map(image), galleryMedia: urls.slice(5).map(image),
    doctorPhoto: urls[0], aboutImage: urls[1], socialPosts: [],
  });
  await page.goto('/');
  await expect(page.locator('.hero-bg img')).toHaveAttribute('src', /website-media/);
  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: `Go to slide ${index}`, exact: true }).click();
    await expect(page.locator('.hero-bg img')).toHaveAttribute('src', new RegExp(manifest[urls[index - 1]].src.split('/').pop()));
  }
  await page.locator('.landing-doctor-photo').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.landing-doctor-photo img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('.landing-results-viewport').scrollIntoViewIfNeeded();
  const gallery = page.locator('.landing-result-media img');
  await expect(gallery).toHaveCount(14);
  expect(await gallery.evaluateAll(images => images.every(img => img.src.includes('website-media') && img.loading === 'lazy'))).toBe(true);
  expect(storageRequests).toEqual([]);
  const response = await page.request.get(manifest[urls[0]].src);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('immutable');
});

test('video galleries wait for playback and repeated copies have no remote source', async ({ page }) => {
  const videoUrl = 'https://example.test/clinic-video.mp4';
  const videoRequests = [];
  await page.route('https://example.test/**', route => { videoRequests.push(route.request().url()); return route.abort(); });
  await publicContent(page, {
    heroMedia: [], galleryMedia: [{ url: videoUrl, type: 'video', alt: 'Clinic video' }], socialPosts: [],
  });
  await page.goto('/');
  const originals = page.locator('.landing-result-card:not([aria-hidden]) video');
  const copies = page.locator('.landing-result-card[aria-hidden] video');
  await expect(originals).toHaveAttribute('preload', 'none');
  await expect(originals).not.toHaveAttribute('autoplay');
  await expect(copies).not.toHaveAttribute('src');
  expect(videoRequests).toEqual([]);
});

test('blog covers and article images use deployed copies', async ({ page }) => {
  const post = { id: 'test-post', title: 'Clinic guide', slug: 'clinic-guide', excerpt: 'Guide', category: 'Clinic', hero_url: urls[0], hero_type: 'image', blocks: [{ id: 'image', type: 'image', url: urls[1], alt: 'Treatment guide' }] };
  await publicContent(page, {}, [post]);
  await page.goto('/blog');
  await expect(page.locator('.public-blog-grid img')).toHaveAttribute('src', /website-media/);
  await page.goto('/blog/clinic-guide');
  await expect(page.locator('.public-article > header img')).toHaveAttribute('src', /website-media/);
  await expect(page.locator('.public-blog-blocks img')).toHaveAttribute('src', /website-media/);
});
