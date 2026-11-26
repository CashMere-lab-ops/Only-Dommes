# AgeGO S2S integration setup

This integration is intentionally server-side. Never expose the AgeGO site secret in a `NEXT_PUBLIC_` variable or browser code.

## Required Vercel environment variables

Set these for the preview environment before testing:

- `AGEGO_ASI=52dd0d84-ebe4-430c-8f86-da5bd05d28af`
- `AGEGO_SITE_SECRET=<copy privately from AgeGO My Sites → S2S site secret>`
- `AGEGO_RETURN_URL=https://www.worldofdommes.com/api/agego/callback`
- `AGEGO_START_URL=https://myapi.agego.com/s2s/start/`
- `NEXT_PUBLIC_SUPABASE_URL=<existing project URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<existing server-only Supabase service role key>`

Do not paste the site secret into GitHub, chat, source files, or a `NEXT_PUBLIC_` variable.

## Database

Apply the two migrations in order to a dedicated test Supabase project first:

1. `20261126120000_agego_s2s_verification.sql`
2. `20261126121500_require_agego_for_age_verification.sql`

The second migration changes `complete_profile_setup` so the legacy age checkbox is not treated as verified age. The server-side AgeGO callback alone sets `profiles.age_verified_at`.

## Flow

- Authenticated signup/profile setup calls `POST /api/agego/start`.
- The server creates a random 256-bit nonce and stores only its SHA-256 hash with the pending user and a 15-minute expiry.
- The server redirects the browser to AgeGO S2S with the configured ASI, fixed return URL and nonce.
- `GET /api/agego/callback` validates the signed return, expiry, ASI and nonce.
- The callback validates `ag_user_token` with AgeGO's token API using the same nonce and site ID.
- Only then is the attempt consumed and `profiles.age_verified_at` set.

The callback never trusts browser state or a client-provided age checkbox.

## Before production

- Confirm with AgeGO that the literal `callbacktoken={callbacktoken}` query parameter on the S2S start URL is required. Their callback guide describes this placeholder for the separate Modal callback URL; it is not used as proof in this S2S flow.
- Confirm AgeGO's exact representation of `ag_error` on successful responses and test signature calculation against a real sandbox response.
- Test success, underage/failure, cancellation, expired response, wrong ASI, nonce mismatch, invalid JWT, AgeGO API timeout, replayed callback and concurrent callback requests.
- Run the migrations and full flow in an isolated test Supabase project. Do not run financial E2E tests against the production database.
- Review all protected routes and API handlers to ensure they check `age_verified_at`, not only the home page/AuthGuard.
- Do not merge or deploy until tests pass and production processor/compliance launch blockers are resolved.
