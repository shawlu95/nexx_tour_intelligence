# App Store review checklist

NORA is built with App Review in mind from the start. This page tracks each review requirement that applies to NORA: where it's handled, and what's still open before submission. Check it whenever a feature touches permissions, personal data, AI, accounts or sharing.

Last updated: 2026-10-03.

## Handled in the app

| Requirement | Guideline | Where |
|---|---|---|
| Ask before sending personal data to third-party AI, name the providers, allow withdrawal | 5.1.2(i) | "Let NORA organize it?" before recording or typing while consent is off (`components/AiConsentSheet.tsx`). The switch in Profile → Privacy & data. The server enforces it: `process-visit` and `rank-homes` check `profiles.ai_consent_at`, and a note saved without consent waits as `needs_consent`. |
| In-app account deletion that deletes the data, not only deactivation | 5.1.1(v) | Profile → Privacy & data → Delete account and data. `delete-account` removes any remaining audio, then the auth user, which cascades to every table. Deactivation is described as keeping data. |
| Permission requests in context, with specific purpose strings | 5.1.1(i), (iv) | Location: a one-time explanation screen with **Continue only** (no "Not now", which App Review rejects on pre-permission screens), then the system prompt. Microphone: asked when the first recording starts. Purpose strings in `app/app.json` say when each is used and that typing is the alternative. |
| The app still works when a permission is denied | 5.1.1(iv) | No location: type the address. No microphone: "Type instead" on the record screen, and on the confirm screen. |
| Data minimization and retention | 5.1.1(iii) | Raw GPS isn't saved (only the confirmed address and the house's map position, which can fall back to the phone's position when geocoding fails). Original audio is deleted from Storage once transcribed, and AssemblyAI's transcript is deleted right after. |
| Download my data | (expected by reviewers and privacy laws) | Profile → Privacy & data → Download my data (JSON through the share sheet). |
| Privacy policy and terms reachable in the app | 5.1.1(i) | Sign-in screen links, Privacy & data links, and the consent sheet's "Read Privacy Policy". |
| Privacy manifest | (required since May 2024) | `ios.privacyManifests` in `app/app.json`: no tracking; collected data types; required-reason APIs aggregated from the dependencies' own manifests. Rebuild the native app after changing it. |
| No tracking, no ads | 5.1.2 | No ad or analytics SDKs. If Sentry or PostHog are added, update the manifest, the privacy labels and the policy. |

## Open before submission

1. **UI-only features (guideline 2.1, incomplete features).** The Sharing tab (invite an agent) and Deactivate account only change in-memory state. Before the review build, either build their back end or hide them.
2. **Google sign-in is shown but not configured.** The button opens Supabase's Google flow, which fails until the Google provider is enabled. Enable it or hide the button in the review build.
3. **Sign in with Apple (guideline 4.8)** is required whenever Google sign-in is offered. It needs the paid Apple Developer Program (README §6.3). On account deletion, Apple also requires revoking the user's Sign in with Apple token through Apple's REST API (`/auth/revoke`). Supabase's user deletion doesn't do that, so `delete-account` needs to call it for Apple users.
4. **Public privacy policy and support URLs.** App Store Connect needs both. Publish a reviewed version of the in-app text (`app/src/components/Legal.tsx`, currently marked "Draft for review") naming the operating company, a privacy contact and retention periods. Remove the "Draft" label from the in-app copy at the same time.
5. **App privacy labels in App Store Connect** must match the manifest. Declare, all linked to the user, none used for tracking, purpose App Functionality:
   - Contact info: Name, Email Address
   - Identifiers: User ID
   - User content: Audio Data, Other User Content (notes, typed reactions, transcripts, rankings)
   - Location: Precise Location
   Declare nothing for diagnostics or analytics unless an SDK for them is added.
6. **Reviewer sign-in.** Email codes only reach the Resend account owner until a sending domain is verified (README §6.9). Provide a demo account and sign-in steps in the review notes.
7. **Notification permission timing.** `registerForPush` asks at launch once an EAS project id exists. Ask after the buyer's first note instead ("We'll let you know when your note is ready").
8. **Verify AssemblyAI's data terms** (training and retention) and state them in the policy. Anthropic doesn't train on API data by default.
9. **Rebuild and test on a device** after every manifest or purpose-string change. Run the whole flow once with every permission denied.
