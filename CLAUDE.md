# NORA (nexx-tour-intelligence)

Voice note-taking app for home buyers. After leaving an open house, the buyer records a **40–60 second spoken reaction**. NORA transcribes it (AssemblyAI; English, Chinese, or a mix, detected automatically), turns it into a note with Claude (overall impression, plus **Liked**, **Concerns**, **Questions for my agent**, each with a verbatim source quote), files it under the property, and lets the buyer share it with their agent as a private link.

- Design doc and MVP scope: @README.md
- Setup, deployment, Xcode guide: [SETUP.md](SETUP.md)
- Current status, what's done and what's left: @docs/STATUS.md (**update it at the end of each work session**)
- App-specific Expo rules: [app/AGENTS.md](app/AGENTS.md) (loaded via `app/CLAUDE.md` when working in `app/`)

## Layout

| Path | Contents |
|---|---|
| `app/` | Expo SDK 57 / React Native 0.86 / TypeScript / Expo Router. Routes in `app/src/app/` (tabs: `tour/` with its own stack for locate → record, `ranking`, `homes` = History, `sharing/`, `profile`), logic in `app/src/lib/`, UI in `app/src/components/`. Screens follow the mockup at nexx-tour-intelligence.franksun0707.chatgpt.site. |
| `supabase/migrations/` | Schema, row-level security, storage bucket, `get_shared_note` RPC, `run_sweep` + pg_cron schedule |
| `supabase/functions/` | Deno Edge Functions: `process-visit`, `sweep`, `delete-account`, `rank-homes`; shared code in `_shared/` |
| `share-web/` | Static page agents open from a share link (`index.html`, `config.js` is git-ignored) |
| `app/modules/look-around/` | Local Expo native module (iOS, Swift) that makes home thumbnails with Apple Look Around or a map snapshot. Native changes need a rebuild. |

## Commands

```bash
# repository root
npm test                    # Vitest: supabase/functions/_shared/*.test.ts and app/src/lib/*.test.ts
npm run check:functions     # deno check of the Edge Functions (via npx deno@2.9.6)

# app/
npx tsc --noEmit && npx expo lint && npx expo-doctor
npx expo install <pkg> -- --legacy-peer-deps
npx expo run:ios            # Simulator build (needs Xcode)

# Supabase (project is already linked)
supabase db push --yes
supabase functions deploy process-visit sweep delete-account --use-api
supabase db query --linked "<sql>"
```

Run tests, typecheck, lint and expo-doctor before calling app work done.

## Supabase project

- Org **Nexx**, project **nexx-tour-intelligence**, ref `amhonfefejwrgttxfkrl`, region us-west-1, Free plan. URL `https://amhonfefejwrgttxfkrl.supabase.co`.
- CLI is logged in and linked from the repository root. `supabase db push` works without the database password.
- Function secrets set: `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY` (set by the user), `SWEEP_SECRET` (generated). Optional: `SUMMARY_MODEL` (default `claude-opus-5`), `RENTCAST_API_KEY` (not set yet), `RENTCAST_MONTHLY_LIMIT` (default 45; the RentCast free plan charges $0.20 per call over 50 a month, so keep the cap).
- Vault: `nora_project_url`, `nora_sweep_secret`.
- App identifier (iOS bundle id and Android package): `com.nexx.tour.intelligence`. URL scheme: `nora`.

## Rules and pitfalls learned so far

**Secrets**
- Never print, echo or commit secrets. The user sets API keys themselves (`supabase secrets set`). Generate internal keys inside a shell variable and pipe them straight to their destination, as was done for `SWEEP_SECRET`.
- `supabase projects api-keys` returns the service-role key too. Extract only the `publishable` key.
- `app/.env.local` and `share-web/config.js` hold only the public (publishable) key and are git-ignored.

**Expo / npm**
- Expo APIs change every SDK. Check the installed types in `node_modules/<pkg>/build/*.d.ts` before using an API; don't trust memory. For example, v57 uses the new `expo-file-system` `File`/`Directory`/`Paths` API, and `expo-audio` has `useAudioRecorder` and `useAudioRecorderState`.
- npm has a `react-dom` peer conflict with React Native 0.86. Use `--legacy-peer-deps` for installs (`npx expo install x -- --legacy-peer-deps`).
- Expo Router 57 exports its own `Stack`. The app uses a single stack (no tabs). `router.dismissTo('/')` exists.
- The app needs a development build (native modules), not Expo Go.
- After adding a native package, the phone's old build crashes on the new JavaScript (e.g. "Cannot read property 'code' of undefined" at the import) until it's rebuilt and reinstalled. Check a fresh load by restarting Metro with `--clear` and relaunching the app.
- Use Reanimated + Gesture Handler based libraries for gestures (drag to reorder uses `react-native-reorderable-list`); a hand-rolled PanResponder version felt wrong.
- **iOS 27 requires the UIScene life cycle.** Without it the app crashes at launch in `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. Expo SDK 57's template doesn't adopt it yet, so `withSceneLifecycle` in `app/app.config.ts` adds the scene manifest (delegate `EXExpoAppSceneDelegate`) and patches `AppDelegate.swift` on every prebuild. Don't remove it. It throws if the template changes shape; once Expo's template adopts scenes, drop the plugin.
- When the app crashes on the phone, pull reports with `xcrun devicectl device copy from --device <udid> --domain-type systemCrashLogs --source / --destination <dir>` and read the `.ips` JSON (faulting thread frames).

**Deno / Edge Functions**
- Deno refuses npm packages published less than 24 hours ago. Pin versions at least a day old. `@anthropic-ai/sdk` is pinned to `0.129.0` for this reason; it supports `fallbacks: 'default'` and `output_config.format`.
- `supabase/functions/deno.json` sets `nodeModulesDir: none` so `deno check` ignores the root `node_modules`.
- `config.toml` sets `verify_jwt = false`. Every function does its own auth: user JWT via `userIdFrom`, service key via `isServiceCall`, and `sweep` via the `x-sweep-secret` header.
- Docker isn't installed. Deploy with `--use-api`.

**Supabase / Postgres**
- `pgcrypto` lives in the `extensions` schema. Write `extensions.gen_random_bytes`.
- Phones may only set a visit's status to `uploading` (trigger `guard_visit_status`). Only the server writes transcripts and AI note items (RLS).
- Auth email goes through Resend SMTP (test sender `onboarding@resend.dev`, which only delivers to `shawlu95@126.com` until a domain is verified). The sign-in templates send the `{{ .Token }}` code. This project issues 8-digit codes; the app accepts 6–10 digits. Supabase only allows editing templates when custom SMTP is on.
- The dashboard's template body is a Monaco editor that auto-closes tags when typed into. Set it with `monaco.editor.getEditors()[0].executeEdits(...)` instead.

**Claude usage** (`supabase/functions/_shared/claude.ts`)
- Model `claude-opus-5` (overridable with `SUMMARY_MODEL`), beta header `server-side-fallback-2026-07-01` with `fallbacks: 'default'`, structured output via `output_config.format` JSON schema, system prompt cached. Check `stop_reason` for `refusal` and `max_tokens` before parsing.
- Every item's quote is checked against the transcript (`checkItems`, longest common word run ≥ 60%; each Chinese character counts as a word). Unsupported items are dropped.
- The note is written in the language the buyer mostly spoke; quotes are never translated.
- Regeneration keeps buyer-added, edited and deleted items (`planRegeneration`).

**Browser work**
- Don't type passwords, API keys or other credentials into web forms; the user does that. Ask before submitting forms or changing dashboard settings.

## UI-only screens

The Sharing tab and Profile's Deactivate button were built to match the mockup without any back end, at the user's request. `app/src/lib/sharingPreview.ts` holds invitations in memory only. Don't present them as working; see `docs/STATUS.md` → "Built as UI only".

## Working style the user expects

- Plain, direct writing. The user reviews design docs and the published review page.
- The user asks explicitly for commits and pushes. Don't push unless asked; committing finished work has been welcome.
- Design artifact (web page): https://claude.ai/artifact/DsXy1b9JTmbYjHKLTRQH8Q. Source is in the earlier session's scratchpad, so republishing from a new session needs `Artifact` `read` first.
