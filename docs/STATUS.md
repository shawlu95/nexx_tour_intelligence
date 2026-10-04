# Status

Last updated: 2026-10-03. Update this file at the end of each work session: move finished items to "Done", and keep "Next steps" ordered.

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

16. **Drag to reorder (2026-10-01).** Ranking rows reorder with `react-native-reorderable-list` (`NestedReorderableList` inside `ScrollViewContainer`), on Reanimated 4 + react-native-worklets + Gesture Handler (`GestureHandlerRootView` wraps the app in `_layout.tsx`). Drag starts immediately from the ≡ grip or with a long press on the row. A first hand-rolled PanResponder version looked wrong and was replaced. The order is saved in `ranking_overrides` (migration `20261002040000`, owner-only RLS), applied over NORA's ranking (`applyOverride`), shown as "Your order" with a "Revert to NORA's ranking" link, and given to NORA as a strong preference; a successful re-rank or Start over clears it. Native rebuild done; clean app load verified on the iPhone.

17. **Sharing tab and Profile recreated from the mockup (2026-10-01).** Tabs are now Tour · Ranking · History · Sharing · Profile. Sharing (`app/src/app/(tabs)/sharing/`: index, invite, sent, with its own stack so the tab bar stays visible) and Profile follow the mockup's layout and copy. **Sharing is UI only**: invitations live in memory (`app/src/lib/sharingPreview.ts`) and are never sent or saved; "Preview accepted status" just flips the pill. On Profile, Deactivate/Reactivate is UI only; Sign out and Delete account work. Delete account is a quiet link (the App Store requires it) that opens a warning sheet before anything is deleted. The confirmation names the agent, fixing the mockup's "Francis will receive…" bug. Also fixed: the "VirtualizedLists should never be nested…" warning on Ranking (`scrollEnabled={false}` on `NestedReorderableList`).

18. **Speech-to-text moved from Deepgram to AssemblyAI (2026-10-03)** so buyers can speak English, Chinese, or a mix without choosing a language. Deepgram's automatic mode doesn't include Chinese. `_shared/assemblyai.ts` sends the signed audio URL with `speech_models: ['universal-3-5-pro', 'universal-2']` and `language_detection: true`, polls until done, then fetches sentence timings. `_shared/deepgram.ts` was removed. The quote check counts each Chinese character as a word, and the note prompt writes the note in the language the buyer mostly spoke (prompt version `2026-10-03`). Secret `ASSEMBLYAI_API_KEY` set by the user; `process-visit` redeployed. The old `DEEPGRAM_API_KEY` secret is still set but nothing reads it. **Not yet tested with a real recording.**

19. **Original audio deleted after transcription (2026-10-03).** Matches the updated mockup and privacy copy. `process-visit` deletes the clip from Storage and clears `audio_path` as soon as the transcript is saved (`deleteVisitAudio` in `_shared/runtime.ts`), and asks AssemblyAI to delete its transcript. Retries reuse the saved transcript, so they no longer need the audio. `sweep` deletes any audio left behind; its first run deleted the 4 existing clips. The app never played audio back; the unused `signedAudioUrl` was removed.

20. **Privacy & data, Privacy Policy and Terms (2026-10-03),** from the updated mockup, with App Store review in mind. Profile now has its own stack (`app/src/app/(tabs)/profile/`): `index` (account, Manage agent access, Privacy & data, Sign out, Deactivate), `privacy` (device permissions with their current state and a Settings button, Manage agent access, **Delete account and data**), `privacy-policy` and `terms`. The policy and terms (`components/Legal.tsx`) are marked "Draft for review" and name the real providers (Supabase, AssemblyAI, Anthropic, RentCast, Apple Maps). The sign-in screen links to both ("By continuing, you agree to the Terms…"). `WarningSheet` and `BackLink` are now shared components.

21. **AI processing consent (2026-10-03).** Migration `20261003000000_ai_consent.sql`: `profiles.ai_consent_at` and a new visit status `needs_consent`. `process-visit` and `rank-homes` refuse to call AssemblyAI or Anthropic without consent (`hasAiConsent` in `_shared/runtime.ts`); a visit saved meanwhile waits as `needs_consent`. App: `lib/consent.ts`, the mockup's "Let NORA organize it?" sheet (`components/AiConsentSheet.tsx`) shown on the record screen when consent is off ("Not now" still records), an "AI note processing" switch in Privacy & data, and an "Allow AI processing" card on a waiting note. Turning consent on starts every waiting note. The existing account has no consent yet, so the first recording asks, and Ranking shows "AI note processing is off" until it's allowed.

22. **Permissions and privacy manifest (2026-10-03).** After sign-in, while location hasn't been asked yet, the mockup's one-time "Find each home automatically." screen explains it; Continue shows the iPhone prompt (no "Not now", which App Review rejects on pre-permission screens). Denied location still falls back to typing the address. Microphone and location purpose strings now say exactly when each is used and that typing is the alternative. `app.json` declares `ios.privacyManifests`: no tracking; collected Name, Email, User ID, Audio, Other User Content and Precise Location (house coordinates can fall back to the phone's position), all linked to the user and for app functionality; and the required-reason APIs our dependencies declare (UserDefaults CA92.1, FileTimestamp 0A2A.1/3B52.1/C617.1, SystemBootTime 35F9.1, DiskSpace 85F4.1/E174.1). **Needs a native rebuild.**

23. **Type instead of recording (2026-10-03).** Migration `20261003010000_typed_notes.sql` adds `visits.typed_note` (≤ 5000 characters). The confirm screen offers "Start with voice" / "Type instead", and the record screen offers "Type instead" when the microphone is off (the alternative App Review expects). `tour/type.tsx` saves the text in the local queue (`pending_visits.typed_text`, added with `ALTER TABLE` for existing phones), the visit row carries it, and there's no audio upload. `process-visit` saves the typed text as the transcript (provider `typed`) and skips AssemblyAI. The note screen labels it "Typed note".

24. **Download my data (2026-10-03).** Privacy & data → Download my data (`lib/exportData.ts`) reads every table the buyer owns (under RLS), writes one JSON file to the cache, opens the share sheet (Save to Files, AirDrop, Mail), then deletes the cached file. Audio isn't included because it's deleted after transcription.

25. **One quick question (2026-10-03).** The note writer's structured output now includes `clarify` (question, reason, three answers), from the same Claude call, so there's no extra cost beyond a few output tokens. `normalizeClarify` keeps it only with a question and 2–3 distinct answers. Migration `20261003020000_note_clarify.sql` adds `notes.clarify`, `clarify_answer` (label or `skipped`), `clarify_answered_at`; regeneration keeps an answered question. The note screen shows the mockup's "ONE QUICK QUESTION" card (`components/ClarifyCard.tsx`) until answered or skipped, then the answer under the note. Answers go into the ranking dossier as "Follow-up: question → answer (detail)". Prompt version `2026-10-03.3`.

26. **Mockup copy and the silence check-in (2026-10-03).** Recording no longer throws the clip away after 8 seconds of silence: after 10 seconds without speech (at any point) the mockup's "Still recording?" sheet asks Keep recording / End recording while the recorder keeps running. Finish with no speech heard at all still discards the clip ("I'm not hearing anything."). Copy updates from the mockup: Tour card ("Record your reaction"), "Recent / View all", the Invite screen's description of what agents can see, and Ranking's drag hint and "Restore NORA ranking".

27. **Second mockup redesign (2026-10-04).** Tabs are now Tour · Ranking · **Ask NORA** (raised centre button) · Sharing · Profile; the History tab and the Discuss screen are gone. Palette and type follow the mockup's `:root` (primary buttons are the light blue fill), and DM Sans is embedded with the expo-font plugin (needs a native rebuild). Tour shows the "Record your reaction" card and Tour history with search. The confirm card has price, type, the facts row and collapsible Property details (RentCast now also saves type, year built, lot size, parking, HOA: migration `20261004000000`), a Voice / Type switch, Start note, and "Revisiting this home?" for a home already visited. A new note (`/tour/note/[id]`) goes progress → One quick question (full page) → Note ready ("Save and update ranking" / "Review this note"). A home's page (`/tour/home/[id]`) and Edit reaction (`/reaction/[visitId]`, new `edit-reaction` function with a debounced preview) follow the mockup. Ranking rows have a grip, the first home opens with its summary, and NORA re-ranks by itself; rankings now carry a one-line `note` per home for the Overall fit card. Not shown any more: Questions for my agent (the mockup shows only Liked and Concerns), per-item editing and personal notes.

28. **iOS-native pass (2026-10-04).** Font sizes snap to Apple's text styles with a 12 pt floor (tab labels 10 pt), 16 pt margins, minHeight for Dynamic Type. Pushed screens use the system navigation bar and swipe back; recording and typing are full-screen modals with a ✕ close; Edit Reaction is a modal sheet with Cancel/Save. Confirmations are system alerts (sign out, deactivate, delete account, delete home, revisit, discard / still recording / not hearing). Haptics via `lib/haptics.ts` (`expo-haptics`, needs a native rebuild). Ask NORA has a large title and no back button (it's a tab root); Tour history rows have disclosure chevrons. Rules are in CLAUDE.md under "iOS look and feel".

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
- `process-visit` against real AssemblyAI (create, poll, then `/sentences` for timings, in `_shared/assemblyai.ts`) and real Claude (the `fallbacks: 'default'` + `output_config.format` combination on `client.beta.messages.create`).
- Push notifications. `getExpoPushTokenAsync` needs an EAS project id, which doesn't exist yet, so registration is skipped with a warning.
- Google OAuth (PKCE via `WebBrowser.openAuthSessionAsync`) and Sign in with Apple. Neither provider is enabled in Supabase yet.
- The share page with a real token; `delete-account`.

## Not done yet (next steps, in order)

0. **RentCast key.** The user creates a free RentCast account and runs `supabase secrets set RENTCAST_API_KEY=...`. Until then, homes stay `facts_status = pending` and show only the thumbnail.

1. **Sending domain.** Resend's test sender `onboarding@resend.dev` only delivers to the Resend account owner (`shawlu95@126.com`), so sign-in by email currently works for that address only. To open sign-in to anyone: verify a domain the user owns in Resend (DNS records), then change the sender email in Supabase → Authentication → Emails → SMTP Settings. The Resend "Connect to Supabase" wizard requires an owned domain, which is why SMTP was configured by hand.
2. **First Simulator run.** The app builds and launches on the iPhone 15 Pro simulator (via `xcodebuild`, because a connected iPhone makes `expo run:ios` try to sign). Next: sign in as `shawlu95@126.com`, record a test reaction, and check the whole path: upload, AssemblyAI, Claude, note.
3. **Share page hosting:** deploy `share-web/` (Cloudflare Pages suggested) and replace `EXPO_PUBLIC_SHARE_BASE_URL` in `app/.env.local` (currently the placeholder `https://share.example.com`).
4. **EAS:** `npx eas-cli@latest init` (adds the project id, which enables push), and add the `EXPO_PUBLIC_*` variables as EAS environment variables.
5. **Running on the user's iPhone 15 with a free Apple ID (done 2026-10-01).** Built with `NORA_FREE_SIGNING=1` and the Personal Team "Xiao Lu (Personal Team)", team ID `K7U2974RH8`, via `xcodebuild ... -allowProvisioningUpdates DEVELOPMENT_TEAM=K7U2974RH8`, installed with `xcrun devicectl device install app`. iPhone UDID `00008120-000045A01A63601E`. Metro runs with `NORA_FREE_SIGNING=1`; the phone loads JS from `http://10.0.0.216:8081`. The local `ios/` folder is currently generated in free-signing mode. The install expires after 7 days. The first sign-in attempt found the 8-digit code mismatch, now fixed; the end-to-end recording test is in progress.
6. **Auth providers:** Google (OAuth client from Google Cloud) and Apple (client id `com.nexx.tour.intelligence`; needs the paid Apple Developer Program).
7. **Note quality evaluation:** 30–50 sample reactions, scored for missed and invented points. Compare `claude-opus-5` with `claude-sonnet-5` (README §4).

## Mockup screens (2026-10-01)

- **Tour tab** follows the mockup: "YOUR HOME SEARCH / N homes toured" with the "this week" chip (`TourSearchHeader`, counts from `fetchTourSummary`), the dark "NEW HOME" card, and "Last recorded / See history"; visit rows show NORA's latest 0–10 score.
- **Record a home flow lives in the Tour tab's own stack** (`app/src/app/(tabs)/tour/`): `index` → `locate` (pulsing "USING YOUR LOCATION" rings, then the confirm card with "Location found", "About N feet away", photo, ARE YOU HERE?, beds/baths/sq ft) → `record` (mockup recording screen: starts immediately, voice detection from metering, auto-stops at 1:30, Finish saves and opens the note). "Change location" opens `pick` (nearby list + type the address). Ten seconds without speech opens "Still recording?" (Keep / End). Finish without any speech heard (judged from the recorder's metering, threshold -40 dB, only when the phone reports levels) discards the clip without uploading it and shows the mockup's "I'm not hearing anything." sheet (Try again / Cancel). The root `index` redirects to `/tour`; the old `record/*` routes are gone.

## Built as UI only (not functional yet)

- **Sharing tab** (invite an agent, invitation sent, who has access): no invitations are sent or stored. The real version needs an `agent_invitations` table, an invite email through Resend, an agent sign-in, and read access for agents to the buyer's notes (README §1, "Agent workspace").
- **Deactivate account** on Profile: the mockup's confirmation sheet, then a paused state held in memory (`setWorkspacePaused` in `lib/sharingPreview.ts`). The header pill reads "Paused", and the Sharing tab shows the paused copy, disables inviting ("Reactivate to invite") and marks access as paused. Nothing changes on the server, and it resets when the app restarts.

## Deliberately left out of the MVP

See README §2 "Left out of the MVP" for reasons. In short: reminders when leaving an open house, agent accounts and workspace, listing data and photos, buyer priorities, co-buyers, comparing homes, editing notes offline (reading works offline), languages other than English. Android is planned for Phase 1.5; the code is shared but untested on Android.

Also not set up: Sentry, PostHog, real app icons and splash (Expo defaults), privacy policy, App Store listing, CI.

## Repository state

- Branch `main`. Commits after `357cae7` were made locally. Check `git status -sb` for unpushed work; the user pushes only when asked.
- The "xcode setup" commit `b62f073` was made by the user.
- Untracked local-only files (git-ignored): `app/.env.local`, `share-web/config.js`.
