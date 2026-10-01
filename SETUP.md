# NORA MVP: setup and deployment

The design is in [README.md](README.md). This file covers running and deploying the code.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | iOS and Android app (Expo SDK 57, React Native, TypeScript, Expo Router). Screens are in `app/src/app/`, shared code in `app/src/lib/` and `app/src/components/`. |
| `supabase/migrations/` | Database schema, row-level security, storage bucket, the `get_shared_note` function, and the 5-minute schedule for `sweep` |
| `supabase/functions/` | Edge Functions: `process-visit` (transcribe and summarize), `sweep` (retries), `delete-account`. Shared code is in `_shared/`. |
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

supabase functions deploy process-visit sweep delete-account --use-api   # --use-api bundles on Supabase's side, so Docker isn't needed
```

**Scheduled retries.** A migration schedules `sweep` every 5 minutes with `pg_cron`. The job authenticates with its own key, so the project's service-role key never leaves Supabase. Create that key once per project; it is generated in a shell variable and never printed:

```bash
S=$(openssl rand -hex 32)
supabase secrets set SWEEP_SECRET="$S"
supabase db query --linked "select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'nora_project_url'); select vault.create_secret('$S', 'nora_sweep_secret');"
unset S
```

Until both Vault entries exist, the job runs and does nothing. To check it, run `supabase db query --linked "select public.run_sweep()"`, then `supabase db query --linked "select status_code, content from net._http_response order by created desc limit 1"`, which should show status `200`.

Then, in the Supabase dashboard:

1. **Authentication → Emails → SMTP Settings:** connect an email provider such as Resend. Supabase only lets you edit email templates once custom SMTP is set up, and its built-in email is rate-limited and meant only for testing.
2. **Authentication → Emails → Magic link or OTP:** add the code to the template so the app's six-digit sign-in works, for example `Your NORA code is {{ .Token }}`. The default template contains only a link.
3. **Authentication → URL Configuration:** add `nora://auth-callback` to the redirect URLs (needed for Google sign-in).
4. **Authentication → Providers:** turn on Google (OAuth client from Google Cloud) and Apple (bundle id `com.nexx.tour.intelligence` as the client id) when you're ready. Email works without either.

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

The app uses native modules (microphone, Apple sign-in, secure storage, SQLite), so it does not run in Expo Go; it needs the development build above. To build on your Mac instead, without the paid Apple account, see the [Xcode dev guide](#5-xcode-dev-guide).

The bundle identifier (iOS) and package name (Android) are `com.nexx.tour.intelligence`, set in `app/app.json`.

## 4. Share page

```bash
cp share-web/config.example.js share-web/config.js   # fill in the Supabase URL and anon key
```

Deploy the `share-web/` folder to a static host and set `EXPO_PUBLIC_SHARE_BASE_URL` in the app to its address. The anon key is safe in this page: the only thing it can do is call `get_shared_note`.

## 5. Xcode dev guide

Without Xcode, the only way to run the app is an EAS cloud build, which needs the $99/year Apple Developer Program before anything can be installed. With Xcode you can build and test on your Mac for free.

### What Xcode gives you

1. **The iOS Simulator.** `npx expo run:ios` builds the app and opens it on a simulated iPhone. No Apple account and no fee. Most of the MVP can be tested there:
   - Email-code sign-in.
   - The "Which home?" screen. The Simulator can fake a GPS location, so you can pretend to be outside a house.
   - Recording, which uses the Mac's microphone.
   - Upload, the note, editing, playback, the transcript, and the share sheet.
   - The offline queue: turn off the Mac's Wi-Fi, record, then turn it back on and watch the upload catch up.
2. **Your own iPhone over a cable, also free.** With a free Apple ID, Xcode can install the app on your phone. It stops working after 7 days and has to be installed again. This is the real test for recording quality outdoors and GPS at actual open houses (see the signing limits below).
3. **Faster changes.** Local builds take minutes instead of waiting in the EAS queue, and JavaScript edits appear instantly without rebuilding.
4. **Screenshots for review.** Claude can boot the Simulator, open a screen directly by link, and take screenshots to check layouts. It can't tap through the app, so hands-on testing is still yours.

### What still needs the paid Apple Developer Program

| Feature | Why |
|---|---|
| Push notifications | The app skips push registration in the Simulator (`app/src/lib/push.ts`), and Apple only allows push on paid accounts. Without it, the note still appears; the buyer just isn't notified while away from the screen. |
| Sign in with Apple | Needs the paid account's signing setup. Use email sign-in until then. |
| TestFlight and the App Store | Giving the app to other people. |

Apple doesn't let free accounts sign apps that use push notifications or Sign in with Apple, and this app declares both. So installing on a physical iPhone with a free account needs a build with those two turned off. Ask Claude to add a switch for this when you get there. The Simulator is not affected.

### One-time setup

1. Install Xcode from the Mac App Store (about 10 GB, more with simulators).
2. Point the command-line tools at it and accept the license:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app
   sudo xcodebuild -license accept
   ```
3. Open Xcode once. When asked, install the iOS platform (the Simulator runtime). You can also do this later in **Xcode → Settings → Components**.
4. Check it worked:
   ```bash
   xcodebuild -version
   xcrun simctl list devices available | grep iPhone
   ```

The app also needs the Supabase back end running (step 2) before you can sign in.

### Run in the Simulator

```bash
cd app
cp .env.example .env.local      # if you haven't already; fill in the Supabase URL and anon key
npx expo run:ios                # first build takes several minutes; later ones are faster
```

This generates the native `ios/` project, builds it, installs it on a simulator, and starts the development server. After that, `npx expo start` and pressing `i` is enough, unless you change native settings in `app.json` or add a native package.

Useful Simulator controls:

| To test | Do this |
|---|---|
| A specific iPhone model | `npx expo run:ios --device "iPhone 17"` (pick from `xcrun simctl list devices available`) |
| Being outside a house | **Features → Location → Custom Location…** and enter its latitude and longitude, then open "Which home?" |
| Recording | Allow microphone access when asked; the Simulator uses the Mac's microphone |
| No signal | Turn off the Mac's Wi-Fi, record and save, turn it back on, and watch the note appear |
| Opening a screen directly | `xcrun simctl openurl booted "nora://visit/<visit-id>"` |
| A screenshot | `xcrun simctl io booted screenshot ~/Desktop/nora.png` |
| Starting fresh | **Device → Erase All Content and Settings** |

### Run on your iPhone with a free Apple ID

1. In Xcode, open **Settings → Accounts** and add your Apple ID. This creates a free "Personal Team".
2. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode** and restart when asked.
3. Connect the iPhone by cable and trust the Mac when prompted.
4. Build and install:
   ```bash
   cd app
   npx expo run:ios --device
   ```
   Pick your iPhone from the list. If asked for a signing team, choose your Personal Team.
5. The first time, the iPhone blocks the app until you trust it: **Settings → General → VPN & Device Management**, select your Apple ID, and tap **Trust**.
6. The install expires after 7 days. Run step 4 again to reinstall; your data on the phone is kept.

Remember the signing limit above: with a free account, push notifications and Sign in with Apple must be turned off for this build.

## How a recording becomes a note

1. The buyer records on the phone. The clip is saved locally and added to the upload queue (`app/src/lib/sync.ts`).
2. The queue creates the property and visit rows, uploads the clip to `audio/<user>/<visit>.m4a`, then calls `process-visit`.
3. `process-visit` replies right away, then transcribes with Deepgram, writes the note with Claude, drops any point whose quote isn't in the transcript, saves the note, and sends a push notification.
4. The app follows the visit's status (`uploading → processing → ready` or `failed`) and shows the note.
5. `sweep` retries anything stuck or failed, up to 3 automatic attempts. **Try again** in the app always starts a fresh attempt.
