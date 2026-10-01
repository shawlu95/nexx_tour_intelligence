# Status

Last updated: 2026-10-01. Update this file at the end of each work session: move finished items to "Done", and keep "Next steps" ordered.

## History so far

1. **Reviewed the mockup** (nexx-tour-intelligence.franksun0707.chatgpt.site, a front-end-only prototype called NORA) in Chrome and wrote a design critique with a clickable sketch, published as an artifact: https://claude.ai/artifact/DsXy1b9JTmbYjHKLTRQH8Q (version 2).
2. **Wrote README.md**: product description, MVP scope (in and out), system design, costs, build plan, risks.
3. **Design change (important):** the first design recorded the whole 10–15 minute tour. The user changed it to a **40–60 second reaction recorded after the visit**. README, the artifact page and all code follow the short-reaction design. Background recording, audio segments, speaker diarization and consent features were removed.
4. **Built the MVP**: app, Supabase back end and share page. First pushed as commit `357cae7`.
5. **Changed the app identifier** to `com.nexx.tour.intelligence`.
6. **Installed tools:** Supabase CLI 2.119.0 (Homebrew). The user installed Xcode and accepted its license; whether the iOS Simulator runtime is installed hasn't been checked.
7. **Set up Supabase** (org Nexx, project `amhonfefejwrgttxfkrl`): pushed both migrations, deployed all three functions, the user set the Deepgram and Anthropic keys, and the retry schedule was set up with its own key.
8. **Dashboard:** added redirect URL `nora://auth-callback`. Custom SMTP connected through Resend (Resend account `shawlu95@126.com`; the user created the API key and pasted it in). Sender `onboarding@resend.dev` / "NORA", host `smtp.resend.com:465`, username `resend`. The "Magic link or OTP" and "Confirm sign up" templates now send the `{{ .Token }}` code (this project issues 8-digit codes; the app accepts 6–10 digits) (subject "Your NORA sign-in code"). Email rate limit is 30 per hour.
9. **Docs:** SETUP.md (setup, deployment, Xcode dev guide), this file, CLAUDE.md.
10. **Bottom tab bar** (Tour, History, Profile) as in the mockup, with SF Symbol icons (`expo-symbols`).
11. **Home facts and thumbnails** (plan: `~/.claude/plans/sharded-frolicking-eclipse.md`). Migration `20261002000000_property_facts.sql` adds facts columns on `properties`, an `api_usage` table and `claim_api_call()` (hard monthly cap, tested: true, true, false at limit 2). `process-visit` calls `_shared/rentcast.ts` after a note is ready; this is skipped until `RENTCAST_API_KEY` is set. Thumbnails come from the local native module `app/modules/look-around` (Swift: `MKLookAroundSnapshotter`, falling back to `MKMapSnapshotter` with a pin), cached in `Paths.cache/thumbs`, never uploaded. They're shown in Tour rows, the History list, the home page and "Your homes nearby".

12. **Ranking tab** (Tour · Ranking · History · Profile). Migration `20261002010000_ranking.sql` adds `ranking_messages` (conversation; assistant turns carry `ranking`, `question`, `based_on`) and `buyer_priorities` (learned needs). Function `rank-homes` (`action`: start | send | refresh) builds a summary of every home with notes plus RentCast facts (`_shared/ranking.ts`), calls Claude (`rankHomes` in `_shared/claude.ts`, `RANKING_MODEL`, medium effort, structured output, cached system blocks), normalizes the ranking (every home exactly once), saves both turns, and limits each buyer to 60 turns a day. App: `app/src/app/(tabs)/ranking.tsx` (ranked cards with reasons for the top 3, priority chips, chat, composer, "Update ranking" when new homes exist, "Start over"). **Not yet exercised against the real model**: the account had only one home with a note (the minimum is two).

13. **iOS 27 launch crash fixed (2026-10-01).** After the phone updated to iOS 27.0.1, NORA crashed at launch because iOS 27 requires the UIScene life cycle. Fixed with the `withSceneLifecycle` config plugin in `app/app.config.ts` (scene manifest with `EXExpoAppSceneDelegate`; AppDelegate conforms to `ExpoReactNativeFactoryProvider` and no longer creates the window). Verified on the iPhone: still running 15 seconds after launch, no new crash reports.

14. **Ranking redesign + Discuss (2026-10-01).** Ranking tab follows the mockup: headline, compact numbered list with 2–4 word labels and fit, tap to expand pro/con tags and Open home; Discuss and Record the next home buttons; Update ranking banner when new homes or discussion since the last ranking. Discuss screen (`app/src/app/ranking/discuss.tsx`): priorities chips, chat with starters and one-tap replies, Update ranking (re-ranks once, then returns), Start over. `rank-homes` now has two modes: `rank` (RANK_SCHEMA: headline, ranking with label/pros/cons, priorities) and `chat` (CHAT_SCHEMA: reply, priorities, question, suggestions); the old action names still work. The tab re-ranks once automatically when the saved ranking predates labels.

15. **Ranking scores (2026-10-01).** Each ranked home gets a 0–10 score (one decimal), meant for relative comparison; the server clamps scores and keeps them non-increasing down the list, and derives the old fit value from them. Rows show rank · thumbnail · address with a smaller two-line label · score; tapping a row expands the pro/con tags. The tab re-ranks once automatically if the saved ranking has no scores yet.

## Done and verified

| Area | Verified how |
|---|---|
| Unit tests (23) | `npm test` |
| Edge Functions type-check | `npm run check:functions` |
| App typecheck, lint, expo-doctor (21/21) | `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` |
| App JavaScript bundles for iOS | `npx expo export --platform ios` |
| Migrations applied to the project | `supabase db push` |
| Functions deployed and reject callers without credentials | `curl`: process-visit 401, sweep 403, delete-account 401 |
| Anonymous key can't read tables; `get_shared_note` returns null for unknown tokens | `curl` against the REST API |
| pg_cron → `run_sweep` → `sweep` function with `x-sweep-secret` | Manual `select public.run_sweep()`; `net._http_response` showed 200 `{"retried":0,"failed":0}` |

## Built but never run against real services

These are written and type-checked but have not been exercised end to end. Expect bugs here first.

- **The app itself has never been launched** (no Simulator or device run yet).
- Recording with `expo-audio` (`app/src/app/record/capture.tsx`), and moving the file into `Paths.document/recordings`.
- Upload: `File.upload` POSTing to `/storage/v1/object/audio/<user>/<visit>.m4a` with the session token (`app/src/lib/sync.ts`). Check headers, the response status, and that the storage RLS policy accepts it.
- `process-visit` against real Deepgram (response shape in `_shared/deepgram.ts`) and real Claude (the `fallbacks: 'default'` + `output_config.format` combination on `client.beta.messages.create`).
- Push notifications. `getExpoPushTokenAsync` needs an EAS project id, which doesn't exist yet, so registration is skipped with a warning.
- Google OAuth (PKCE via `WebBrowser.openAuthSessionAsync`) and Sign in with Apple. Neither provider is enabled in Supabase yet.
- The share page with a real token; `delete-account`.

## Not done yet (next steps, in order)

0. **RentCast key.** The user creates a free RentCast account and runs `supabase secrets set RENTCAST_API_KEY=...`. Until then, homes stay `facts_status = pending` and show only the thumbnail.

1. **Sending domain.** Resend's test sender `onboarding@resend.dev` only delivers to the Resend account owner (`shawlu95@126.com`), so sign-in by email currently works for that address only. To open sign-in to anyone: verify a domain the user owns in Resend (DNS records), then change the sender email in Supabase → Authentication → Emails → SMTP Settings. The Resend "Connect to Supabase" wizard requires an owned domain, which is why SMTP was configured by hand.
2. **First Simulator run.** The app builds and launches on the iPhone 15 Pro simulator (via `xcodebuild`, because a connected iPhone makes `expo run:ios` try to sign). Next: sign in as `shawlu95@126.com`, record a test reaction, and check the whole path: upload, Deepgram, Claude, note.
3. **Share page hosting:** deploy `share-web/` (Cloudflare Pages suggested) and replace `EXPO_PUBLIC_SHARE_BASE_URL` in `app/.env.local` (currently the placeholder `https://share.example.com`).
4. **EAS:** `npx eas-cli@latest init` (adds the project id, which enables push), and add the `EXPO_PUBLIC_*` variables as EAS environment variables.
5. **Running on the user's iPhone 15 with a free Apple ID (done 2026-10-01).** Built with `NORA_FREE_SIGNING=1` and the Personal Team "Xiao Lu (Personal Team)", team ID `K7U2974RH8`, via `xcodebuild ... -allowProvisioningUpdates DEVELOPMENT_TEAM=K7U2974RH8`, installed with `xcrun devicectl device install app`. iPhone UDID `00008120-000045A01A63601E`. Metro runs with `NORA_FREE_SIGNING=1`; the phone loads JS from `http://10.0.0.216:8081`. The local `ios/` folder is currently generated in free-signing mode. The install expires after 7 days. The first sign-in attempt found the 8-digit code mismatch, now fixed; the end-to-end recording test is in progress.
6. **Auth providers:** Google (OAuth client from Google Cloud) and Apple (client id `com.nexx.tour.intelligence`; needs the paid Apple Developer Program).
7. **Note quality evaluation:** 30–50 sample reactions, scored for missed and invented points. Compare `claude-opus-5` with `claude-sonnet-5` (README §4).

## Deliberately left out of the MVP

See README §2 "Left out of the MVP" for reasons. In short: ranking and fit score, the clarifying question after recording, reminders when leaving an open house, agent accounts and workspace, listing data and photos, buyer priorities, co-buyers, comparing homes, editing notes offline (reading works offline), languages other than English. Android is planned for Phase 1.5; the code is shared but untested on Android.

Also not set up: Sentry, PostHog, real app icons and splash (Expo defaults), privacy policy, App Store listing, CI.

## Repository state

- Branch `main`. Commits after `357cae7` were made locally. Check `git status -sb` for unpushed work; the user pushes only when asked.
- The "xcode setup" commit `b62f073` was made by the user.
- Untracked local-only files (git-ignored): `app/.env.local`, `share-web/config.js`.
