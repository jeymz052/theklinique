# Keeping Supabase egress within the free allowance

The October 2026 audit found 12 published PNGs totaling 23,977,762 bytes (about 24 MB), served directly from the `landing-media` bucket. Approximately 200 complete downloads of that set can consume the 5 GB cached egress allowance. This is an asset-size estimate, not a measurement of visitor traffic.

The generated WebP copies total **821,126 bytes**, a **96.6% size reduction**. Once deployed, the site requests these 12 images from its own hosting instead of Supabase Storage. The size reduction is measured; future monthly bandwidth still depends on traffic and new uploads.

## Changes

- Published static images have compressed WebP copies in `public/website-media`. `lib/public-media-manifest.json` maps each original public URL to its deployed copy. Website and CMS previews use `PublicImage` so the current image set needs no Supabase Storage downloads after deployment.
- New images without deployed copies go through the Next.js image optimizer, with a 30-day cache. This avoids downloading an original separately for every visitor. Different sizes and cold caches can still request the original.
- Both media upload APIs resize still images to fit within 1920 × 1920 and compress to WebP when it reduces file size. Each upload uses a unique URL with a one-year cache lifetime. Animated images and videos retain their original formats.
- Images load lazily, except the active hero. Videos no longer autoplay or preload. Repeated gallery video copies have no remote source.
- Public copies use content-based filenames and a one-year immutable cache. Supabase originals and database records are preserved. Private patient files are not included.

These changes take effect when the code, manifest, and public image copies are deployed together. They use the website hosting provider's bandwidth and image processing allowances; they do not make bandwidth unlimited. Existing direct links to Supabase objects can still consume Supabase egress.

## After publishing new media

Run locally using the project's existing server credentials, then deploy the changed manifest and generated files with the app:

```powershell
npm run media:sync
```

The script reads only public website content and published articles. It downloads each new still image once, skips images already copied, and never changes Supabase objects or database rows. It is deliberately separate from the build so builds do not repeatedly fetch storage or require a service key. Videos and animated images are not copied. Prefer externally hosted video embeds for heavily viewed clips.

To inspect current object sizes without downloading the media bodies:

```powershell
npm run media:audit
```

## Check usage

In Supabase, open the organization's **Usage** page and select this project. Monitor daily **Cached Egress** and **Uncached Egress** after deployment. The two free quotas are separate. Confirm the billing-cycle reset date shown in that dashboard and check any restriction or grace-period notification.

The existing 6.29 GB cannot be reduced by deleting files or clearing caches. Supabase says accumulated egress resets with the billing cycle; an egress restriction clears at that reset. These changes reduce future usage but cannot guarantee the free allowance at every traffic level.

Sources: [Supabase egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Storage bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth).

## Verification

```powershell
node --test tests/media-egress.test.mjs
npx tsc --noEmit
npm run build
npx playwright test tests/e2e/media-egress.spec.cjs
```
