# NORA MVP: setup and deployment

The design is in [README.md](README.md). This file covers running and deploying the code.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | iOS and Android app (Expo SDK 57, React Native, TypeScript, Expo Router). Screens are in `app/src/app/`, shared code in `app/src/lib/` and `app/src/components/`. |
| `supabase/migrations/` | Database schema, row-level security, storage bucket, and the `get_shared_note` function |
| `supabase/functions/` | Edge Functions: `process-visit` (transcribe and summarize), `sweep` (retries), `delete-account`. Shared code is in `_shared/`. |
| `supabase/setup/cron.sql` | Schedules `sweep` every 5 minutes |
| `share-web/` | Static page agents open from a share link |

## Checks

```bash
npm install                    # at the repository root (Vitest)
npm test                       # unit tests for note checking, addresses, formatting, retries
npm run check:functions        # type-checks the Edge Functions with Deno

cd app
npm install --legacy-peer-deps
npx tsc --noEmit               # typecheck
npx expo lint                  # lint
npx expo-doctor                # dependency and config checks
```

`--legacy-peer-deps` works around a peer-dependency conflict between `react-dom` and React Native 0.86 in npm; it doesn't affect the iOS or Android build.

## 1. Accounts you need

| Service | Used for | Notes |
|---|---|---|
| Supabase | Database, sign-in, storage, functions | Free plan is enough for development |
| Deepgram | Speech-to-text | Starts with free credit |
| Anthropic | Writing the note (Claude) | API key from console.anthropic.com |
| Expo (EAS) | Cloud builds of the app | Free plan is enough to start |
| Apple Developer Program | Installing on iPhones, TestFlight, App Store | $99/year. Also needed for Sign in with Apple. |
| Static hosting for `share-web/` | Share links | Cloudflare Pages, Netlify, Vercel or any static host |

## 2. Back end (Supabase)

Install the CLI (`brew install supabase/tap/supabase`), then from the repository root:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push                               # applies supabase/migrations

supabase secrets set DEEPGRAM_API_KEY=... ANTHROPIC_API_KEY=...
# Optional: supabase secrets set SUMMARY_MODEL=claude-sonnet-5   (default is claude-opus-5)

supabase functions deploy process-visit
supabase functions deploy sweep
supabase functions deploy delete-account
```

Then, in the Supabase dashboard:

1. **SQL editor:** open `supabase/setup/cron.sql`, replace the project URL and service-role key placeholders, and run it.
2. **Authentication → Email templates → Magic link:** include the code so the app's six-digit sign-in works, for example `Your NORA code is {{ .Token }}`.
3. **Authentication → URL configuration:** add `nora://auth-callback` to the redirect URLs (needed for Google sign-in).
4. **Authentication → Providers:** turn on Google (OAuth client from Google Cloud) and Apple (bundle id `com.nexx.tour.intelligence` as the client id) when you're ready. Email works without either.
5. **Authentication → SMTP:** for real users, connect an email provider such as Resend. Supabase's built-in email is rate-limited and meant only for testing.

## 3. App

```bash
cd app
cp .env.example .env.local      # fill in the Supabase URL, anon key, and share page URL
npx eas-cli@latest login
npx eas-cli@latest init         # creates the EAS project and adds its id to app.json (enables push)
npx eas-cli@latest build --profile development --platform ios
npx expo start                  # then open the installed development build on the phone
```

For the cloud build, also add the three `EXPO_PUBLIC_*` values as EAS environment variables (`npx eas-cli@latest env:create`), because `.env.local` is not uploaded.

The app uses native modules (microphone, Apple sign-in, secure storage, SQLite), so it does not run in Expo Go; it needs the development build above. Building locally instead (`npx expo run:ios`) requires Xcode.

The bundle identifier (iOS) and package name (Android) are `com.nexx.tour.intelligence`, set in `app/app.json`.

## 4. Share page

```bash
cp share-web/config.example.js share-web/config.js   # fill in the Supabase URL and anon key
```

Deploy the `share-web/` folder to a static host and set `EXPO_PUBLIC_SHARE_BASE_URL` in the app to its address. The anon key is safe in this page: the only thing it can do is call `get_shared_note`.

## How a recording becomes a note

1. The buyer records on the phone. The clip is saved locally and added to the upload queue (`app/src/lib/sync.ts`).
2. The queue creates the property and visit rows, uploads the clip to `audio/<user>/<visit>.m4a`, then calls `process-visit`.
3. `process-visit` replies right away, then transcribes with Deepgram, writes the note with Claude, drops any point whose quote isn't in the transcript, saves the note, and sends a push notification.
4. The app follows the visit's status (`uploading → processing → ready` or `failed`) and shows the note.
5. `sweep` retries anything stuck or failed, up to 3 automatic attempts. **Try again** in the app always starts a fresh attempt.
