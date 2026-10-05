# Production authentication checklist

These hosted Supabase settings cannot be enabled by an application migration. Configure them before launch.

## Supabase Authentication

1. In **Authentication → Sign In / Providers → Email**, enable **Confirm email**.
2. Set **Email OTP expiration** to `3600` seconds (1 hour).
3. Keep the resend/email frequency limit at no less than `60` seconds.
4. In **Authentication → URL Configuration**:
   - Set the production site URL.
   - Add `https://YOUR_DOMAIN/auth?verified=1` to the allowed redirect URLs.
   - Keep localhost redirects only for local development.
5. Configure a production custom SMTP provider and verify the sender domain (SPF, DKIM, and DMARC).
6. Disable click tracking/link rewriting for authentication emails.
7. Customize the **Confirm signup** template with The Klinique branding and state that the link expires in one hour.
8. Enable CAPTCHA for signup, sign-in, and password-reset forms before public launch.
9. Review Supabase Auth rate limits after connecting custom SMTP.

## Required environment checks

- `NEXT_PUBLIC_SUPABASE_URL` points to the production project.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the production anon key.
- `SUPABASE_SERVICE_ROLE_KEY` exists only in server-side deployment secrets.
- The production domain uses HTTPS.

## Acceptance test

1. Register a new patient address.
2. Confirm no patient session is created before email verification.
3. Verify that sign-in is rejected and the resend option is shown.
4. Confirm the resend button has a 60-second cooldown.
5. Open the latest verification link and sign in successfully.
6. Confirm an expired or previously used link is rejected.
7. Confirm an unverified account cannot open `/dashboard/patient`.
