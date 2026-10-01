# NORA: Buyer Tour Intelligence

NORA is a voice note-taking app for home buyers visiting open houses. Right after leaving a home, the buyer records a **40–60 second spoken reaction**: what stood out, what they liked, what worried them. NORA turns it into an organized note with three lists: **Liked**, **Concerns**, and **Questions for my agent**. Every visit is saved against the property, so the notes work as a memory aid weeks later, and a note can be sent to the buyer's agent in a couple of taps.

This document covers:

1. [What the app does](#1-what-the-app-does) (the full product vision)
2. [MVP scope](#2-mvp-scope): what's in, what's left out, and why
3. [System design](#3-system-design): platform, architecture, data storage, front end, back end
4. [Third-party services and cost](#4-third-party-services-and-cost)
5. [Build plan](#5-build-plan)
6. [Risks and open questions](#6-risks-and-open-questions)

To run or deploy the code, see [SETUP.md](SETUP.md).

> **Design assumption:** NORA records one short reaction after each visit, not the whole tour. The buyer records alone, typically in the car or on the sidewalk, while the home is still fresh in their mind. This matches the original mockup ("Talk naturally for 40–60 seconds") and keeps the app quick to use, cheap to run, and free of the consent problems that come with recording other people.

---

## 1. What the app does

The full product vision draws on the front-end mockup (nexx-tour-intelligence.franksun0707.chatgpt.site) and the design review that followed it.

### The buyer's flow

| Step | What happens |
|---|---|
| **Locate** | The buyer taps "Record a home." GPS suggests the property they just left ("812 Pastoria Ave, is this it?"). They confirm with one tap or type the address. |
| **Record** | The buyer talks for 40–60 seconds. On-screen prompts help them cover the main things ("What stood out?", "Anything that worried you?", "Would you come back?"). Recording stops on its own at 2 minutes, and they can re-record if they fumble. |
| **Process** | The clip is transcribed and summarized, usually in under 30 seconds. If the phone has no signal, the clip is saved and processed once it reconnects. |
| **Review** | The note shows a short overall impression, then **Liked**, **Concerns**, and **Questions for my agent**. Each point shows the words it came from, and the full transcript and original recording are a tap away. |
| **Remember** | Each property has a page with every visit to it. The buyer can browse past homes and search by address. |
| **Share** | The buyer sends a note to their agent as a private link and chooses whether the transcript is included. |

### Features beyond the MVP

These come from the mockup and the review, and are planned for later phases:

- **A clarifying question** after recording, about something the buyer raised but left unclear (for example, "How much do the power lines concern you?").
- **A reminder to record**, sent when the buyer leaves an open house without recording (geofence), so no visit is forgotten.
- **Agent workspace:** an agent account with ongoing access to the buyer's tours, where the agent can add professional notes alongside the buyer's.
- **Listing photos and more property detail** from a licensed listing data provider, plus the buyer's own photos attached to a visit.
- **Buyer priorities** (budget, commute, schools, must-haves) used to check notes and explain scores.
- **Co-buyers** recording reactions to the same home and comparing them.

---

## 2. MVP scope

**The MVP has one job:** right after a visit, a buyer can record a one-minute reaction, get back a trustworthy note, find it again later, and send it to their agent.

Something belongs in the MVP only if leaving it out would break that job. Everything else waits until real users have recorded real visits.

### In the MVP

| # | Feature | Notes |
|---|---|---|
| 1 | **Sign in** with Apple, Google, or email code | No passwords. Apple sign-in is required by the App Store whenever Google sign-in is offered. |
| 2 | **Pick the property** | GPS suggests the nearest address, which the buyer confirms or edits (one line, plus a unit number for condos). The buyer's own properties nearby are offered first. If the address matches an existing property, the visit is added to it. |
| 3 | **Record a short reaction** | Prompts on screen and a timer that turns green at 40 seconds. Stops on its own at 2 minutes. Re-record before saving. The clip is saved on the phone first. |
| 4 | **Reliable upload and processing** | Uploads queue and retry until they succeed, so a clip recorded with no signal is processed later. The note usually appears within 30 seconds, and a push notification arrives if the buyer has left the screen. |
| 5 | **Structured note** | An overall impression plus **Liked**, **Concerns**, and **Questions for my agent**. |
| 6 | **Check against the source** | Each point shows the quote it came from. The full transcript and the original recording are one tap away. |
| 7 | **Edit the note** | Change, add, or delete points, and add free-text personal notes. Edits are marked as the buyer's own and are never overwritten by regenerating the note. |
| 8 | **Property list and property page** | Homes listed by most recent visit, with search by address. Each property page shows all its visits, newest first. |
| 9 | **Share a note with the agent** | Creates a private, read-only web link and opens the phone's share sheet (text, email, WhatsApp). The buyer chooses whether to include the transcript and can revoke the link at any time. The agent doesn't need an account. |
| 10 | **Delete data** | Delete a visit, a property, or the whole account, including the audio. This is required by the App Store and expected by users. |
| 11 | **Home facts and thumbnail** | Each home shows beds, baths, square feet and the listing (or last sale) price, looked up once from RentCast's public-record and listing data. A small street-level thumbnail is made on the phone with Apple Look Around (a map snapshot where there's no coverage), so homes in lists are easy to tell apart. |
| 12 | **Ranking conversation** | A Ranking tab where NORA ranks all the buyer's homes from their notes and the home facts, explains why the top homes lead, and asks one question at a time to learn what matters (yard vs. size, commute, budget). Each answer updates the ranking and a visible list of learned priorities. The buyer can start over at any time. |

### Left out of the MVP

| Feature | Why it's left out | When |
|---|---|---|
| Numeric fit score | A number with a decimal point suggests precision a few one-minute reactions can't support. The ranking uses plain strong / good / weak fit with written reasons instead (feature 12). | Not planned |
| Clarifying question after recording | Adds a step and a second AI call. The note already includes "Questions for my agent." | Phase 2 |
| Reminder to record when leaving a home | Needs background location permission, which many buyers decline and app review scrutinizes. | Phase 2 |
| Agent accounts, invitations, agent notes | A second user type, permissions, and onboarding. A share link covers the core need with none of that. | Phase 3 |
| Listing photos | Copyrighted and only available through licensed MLS feeds. The MVP shows a street-level thumbnail made on the phone instead (see feature 11). | Phase 3 |
| Photos in notes | Valuable, but it adds storage, upload, and interface work. Buyers already have photos in their camera roll. | Phase 2 |
| Co-buyers and shared searches | Sharing between two buyers is a larger permissions problem. | Phase 3 |
| Android app | The code is shared, so Android follows the iOS launch with mostly testing and store work. | Phase 1.5 |
| Languages other than English | Keeps prompts and quality testing focused. The transcription service supports more languages later. | Phase 3 |
| Comparing homes, searching by feature ("homes with a big kitchen") | Needs enough data per user to be useful. | Phase 2 |
| Editing notes offline | Recording and reading work offline. Edits need a connection, which keeps sync simple. | Phase 2 |

---

## 3. System design

### 3.1 Platform recommendation

**Build a cross-platform native app with React Native (Expo). Launch on iOS first and ship Android from the same codebase soon after. Agents see shared notes on a small web page.**

| Option | Verdict | Reason |
|---|---|---|
| **Web app / PWA** | ⚠️ Viable alternative | A one-minute recording made with the screen on works in a mobile browser, so a web app is now possible: it needs no app store, costs nothing to distribute, and updates instantly. It loses out on three things the MVP relies on. iOS only delivers push notifications to web apps added to the home screen. Browser storage for clips recorded offline can be cleared by the system. And "add to home screen" is real friction for buyers. |
| **Native iOS (Swift) + native Android (Kotlin)** | ❌ | Two codebases and twice the work for an app whose native needs (microphone, GPS, notifications, local storage) are standard. |
| **React Native + Expo** | ✅ | One codebase for iOS and Android. Reliable microphone, location, push notifications, and on-device storage. App Store presence, which also builds trust when a buyer's agent recommends the app. Expo's cloud build service removes the need for a Mac build server, and over-the-air updates allow quick fixes. The language (TypeScript) is the same as the back end and the share page. |
| **Flutter** | ⚠️ | Technically equivalent. Choose it only if the team already knows Dart. |

**iOS first** because US home buyers skew toward iPhone and there are fewer device variations to test. **Android follows in Phase 1.5**: the code is shared, and the remaining work is device testing and the Play Store listing.

### 3.2 Architecture overview

```mermaid
flowchart LR
  subgraph Phone["Buyer's phone (Expo app)"]
    UI[Screens]
    REC[Recorder]
    LDB[(Local SQLite<br/>+ audio files)]
    Q[Upload queue]
  end

  subgraph Supabase["Supabase (back end)"]
    AUTH[Auth]
    DB[(Postgres<br/>with row-level security)]
    ST[(Storage<br/>audio bucket)]
    FN[Edge Functions<br/>processing]
    CRON[Scheduled job<br/>retry sweeper]
  end

  STT[Speech-to-text<br/>Deepgram]
  LLM[Claude API<br/>summarization]
  PUSH[Expo Push]
  WEB[Share page<br/>Cloudflare Pages]
  AGENT((Agent's<br/>browser))

  UI --> REC --> LDB --> Q
  Q -- upload clip --> ST
  Q -- "process visit" --> FN
  UI <--> AUTH
  UI <--> DB
  FN -- signed audio URL --> STT
  FN -- transcript --> LLM
  FN --> DB
  FN --> PUSH --> UI
  CRON --> FN
  AGENT --> WEB -- share token --> DB
```

**Why Supabase:** a single managed service provides authentication, a relational database with per-user access rules, file storage, and serverless functions. That means no servers to run for the MVP. The data is relational (users → properties → visits → notes), so Postgres fits better than a document store such as Firebase. And because it's standard Postgres, it can move to any other Postgres host later.

### 3.3 Data storage

#### What lives where

| Data | Where it's stored | Why |
|---|---|---|
| Account and profile | Supabase Auth + Postgres | Managed sign-in and session tokens |
| Properties, visits, notes, share links | Postgres | Relational, queryable, protected by per-user access rules |
| Transcript (with phrase timings) | Postgres, on its own table keyed by visit | Small (1–2 KB), read alongside its visit |
| Audio recordings | Supabase Storage, in a private bucket at `<user>/<visit>.m4a` | Binary files. Served only through short-lived signed URLs. |
| Recordings not yet uploaded, the upload queue, offline cache | On the phone: local SQLite plus the app's private file folder | Recording must work with no signal, and nothing is deleted until the server confirms it has the file. |
| Login tokens | Phone's secure storage (iOS Keychain or Android Keystore) | Standard practice for credentials |

#### Data model (conceptual)

```
User 1 ──── * Property 1 ──── * Visit 1 ──── 1 Transcript
                                 └──── 1 Note 1 ──── * Note item (liked / concern / question)
                                              └──── * Share link
```

| Entity | Key contents |
|---|---|
| **User** | Name, email, sign-in method, created date, notification token |
| **Property** | Owner (user), normalized address and unit, latitude/longitude, created date, last-visited date. Facts from RentCast: beds, baths, square feet, price (active listing, past listing, or last sale) with its date, and the lookup status. Unique per user and address, so repeat visits group together. |
| **API usage** | Calls made to metered APIs (RentCast) per calendar month, used to enforce a hard monthly cap. Server only. |
| **Visit** | Property, recorded time, audio file path, duration, status (*uploading → processing → ready*, or *failed*), error message, retry count |
| **Transcript** | Visit, full text, phrases with start and end times, provider and model used |
| **Note** | Visit, overall impression, buyer's free-text personal note, AI model and prompt version |
| **Note item** | Note, type (liked, concern, or question), text, source quote, origin (AI or buyer), edited flag, deleted flag (so regenerating never brings back items the buyer removed), sort order |
| **Share link** | Note, random unguessable token, include-transcript flag, created, expires (default 90 days), revoked date, view count |

**Access rules:** Postgres row-level security limits every row to its owner. Phones can't write transcripts or AI-written note items, and can't move a visit's status past "uploading"; only the server can. The share page never queries tables directly. It calls one database function that looks up the token and returns only the fields that particular link allows.

**Storage sizing:** voice audio is recorded as mono AAC at about 48 kbps, so a one-minute clip is about **0.35 MB**. A buyer recording 30 visits uses about 10 MB. The database footprint per visit is under 10 KB.

**Retention:** audio and transcripts are kept until the buyer deletes them. Deleting a visit removes its audio from storage immediately.

### 3.4 Front end (mobile app)

**Stack:** React Native with Expo and TypeScript, file-based navigation (Expo Router), Expo's audio, location, notification, secure-storage, SQLite, and file-system libraries, and the Supabase client library.

**Screens**

| Screen | Purpose |
|---|---|
| Sign in | Apple, Google, or a code sent by email |
| Home | "Record a home" button, notes still processing, recent visits |
| Confirm property | GPS-suggested address, editable, with the buyer's nearby properties as shortcuts |
| Record | Rotating prompts, a timer that turns green at 40 seconds, stop, re-record, save |
| Note | Status while processing, then overall impression, liked, concerns, questions with quotes. Edit mode, play recording, transcript, regenerate, share. |
| Properties | List and search by address, opening to a property page with all its visits |
| Share | Include-transcript toggle, then the phone's share sheet. Existing links with a revoke option. |
| Settings | Account, delete account, sign out |

**How recording works**

- The recording is made in the foreground with the screen on. Its length is guided toward 40–60 seconds and capped at 2 minutes.
- Audio is written directly to a file. On save, the file is moved into the app's private documents folder and logged in the local database before anything touches the network.
- If the clip is shorter than 5 seconds, the app asks the buyer to try again instead of saving it.

**How upload works**

- Each saved visit goes into a persistent upload queue in SQLite with its property details, file path, and duration.
- The queue runs when a visit is saved, when the app comes to the foreground, and when the network comes back. Each item retries with increasing delays.
- Steps per visit: find or create the property, create the visit, upload the clip, ask the server to process it. Each step is safe to repeat, so a retry after a failure never creates duplicates.
- The local audio file is deleted once the server has the file and the note is ready.

**Offline behaviour:** recording and saving work offline. Notes and properties the buyer has already seen are cached for reading. Editing needs a connection.

### 3.5 Back end

All server logic runs as Supabase Edge Functions (serverless TypeScript). There is no always-on server.

**Processing pipeline**

```mermaid
sequenceDiagram
  participant App
  participant Fn as process-visit
  participant DB as Postgres
  participant STT as Deepgram
  participant AI as Claude API
  App->>Fn: Process visit (visit ID)
  Fn->>DB: Status = processing
  Fn-->>App: 202 Accepted
  Fn->>STT: Transcribe (signed audio URL)
  STT-->>Fn: Transcript with phrase timings
  Fn->>DB: Save transcript
  Fn->>AI: Transcript + structured-output schema
  AI-->>Fn: Note as JSON (overall, items with quotes)
  Fn->>Fn: Check each quote appears in the transcript
  Fn->>DB: Save note and items, status = ready
  Fn->>App: Push notification "Your note for 812 Pastoria Ave is ready"
```

A one-minute clip transcribes in a few seconds and the note takes 10–30 seconds to write, so one function handles both steps, working in the background after it has replied to the app. The app shows progress by reading the visit's status.

**Back-end functions**

| Function | Triggered by | What it does |
|---|---|---|
| `process-visit` | App (after upload), sweeper, or the buyer tapping **Try again** | Transcribes the clip, writes the note, sends the push notification, then looks up the home's facts with RentCast if it doesn't have them yet. With `regenerate`, it skips transcription and rewrites the note while keeping the buyer's edits. |
| `sweep` | Scheduled every 5 minutes | Finds visits stuck in processing for more than 5 minutes, or failed with fewer than 3 attempts, and runs them again. Also looks up facts for up to 3 homes still waiting (created before the RentCast key was set, held back by the monthly cap, or retried a day after an error). |
| `delete-account` | App | Deletes the user's audio files, database rows, and sign-in record |
| `get_shared_note` (database function) | Share page | Looks up the token, checks expiry and revocation, returns only the allowed fields, counts the view |

Share links are created and revoked by the app directly in the database, under the same per-user access rules.

**Summarization design**

- **Model:** Claude Opus 5 (`claude-opus-5`), set through a server setting (`SUMMARY_MODEL`). Claude Sonnet 5 (`claude-sonnet-5`) is a cheaper option once there is a quality test set (see §4).
- **Input:** the transcript and the property address, after a fixed set of instructions. The instructions come first so prompt caching applies.
- **Output:** structured JSON enforced by the API's structured-output feature. It contains an overall impression of one or two sentences, plus a list of items, each with a type (liked, concern, question), short text, and a verbatim quote.
- **Faithfulness checks:** after the response arrives, the server checks that each item's quote actually appears in the transcript. Items whose quote can't be found are dropped. This is the safeguard against invented points.
- **Refusals:** requests use the API's server-side fallback, so a rare safety-classifier refusal is retried on another model automatically. A remaining refusal marks the visit as failed with a message the buyer can act on.
- **Regenerating:** AI items the buyer hasn't touched are replaced. Items the buyer added, edited, or deleted are kept, and a new AI item that repeats one of them is skipped.

**Share page:** a small static web page on Cloudflare Pages. It reads the token from the URL, calls the `get_shared_note` database function, and shows the note, plus the transcript if the buyer included it. It is marked not to be indexed by search engines, and it never exposes audio in the MVP.

**Security and privacy**

- Data is encrypted in transit (HTTPS) and at rest (Supabase default).
- Row-level security on every table. Service keys exist only inside Edge Functions.
- Audio is served only through signed URLs that expire after 15 minutes.
- Share tokens are 128-bit random values that can be revoked and expire after 90 days.
- Data sent to Deepgram and Anthropic through their APIs is not used to train their models by default. This should be confirmed in each vendor's terms and stated in the privacy policy.
- Error monitoring (Sentry) and product analytics (PostHog) never receive transcript or note text.

---

## 4. Third-party services and cost

> Prices are list prices as of 2026 where known (Claude API rates are current). Other vendors' prices are estimates from their public pricing pages, so **check each one before committing**. Every figure is in USD.

### Assumptions

- An average reaction lasts **1 minute** (about 150 words).
- An active buyer records **8 visits a month** while searching.
- Claude reads about **1,000 input tokens** per visit (instructions plus transcript) and writes about **1,000 output tokens** (the note plus reasoning).
- Almost every visit is to a **new home** (second visits are rare), and each new home costs **1–2 RentCast calls, once**. It's 1 call when an active listing has beds, baths, size and price; otherwise a second call fetches the public record. The first real home took 1 call.

### Cost per visit

| Item | Calculation | Cost per visit |
|---|---|---|
| Transcription (Deepgram Nova-3, pre-recorded audio) | 1 min × ~$0.0045/min | ~$0.005 |
| Summarization, Claude Opus 5 ($5 per million input tokens, $25 per million output) | 1k × $5/M + 1k × $25/M | ~$0.03 |
| Storage and data transfer | ~0.35 MB stored, played back a few times | <$0.001 |
| **Total with Claude Opus 5** | | **≈ $0.035** |
| *Alternative: summarize with Claude Sonnet 5 ($2 / $10 per million)* | 1k × $2/M + 1k × $10/M | *~$0.012, for a total of ≈ $0.017 per visit* |

The model choice should be made with a small quality test: 30–50 real or realistic reactions, scored for missed points and invented points. If Sonnet 5 holds up on that test, switching halves the AI cost. At these amounts either choice is cheap.

### Cost per ranking turn

Each message in the Ranking conversation is one Claude call. Claude reads the instructions, a summary of every home (about 300 tokens each), what it has learned, and the recent conversation, then writes a reply, the full ranking with reasons, and the updated priorities.

| Item | Calculation (10 homes, Claude Opus 5, medium effort) | Cost per turn |
|---|---|---|
| Input | ~7,000 tokens; instructions and home summaries are cached after the first turn (cache reads cost a tenth) | ~$0.01–0.035 |
| Output | ~1,500 tokens (reply, ranking, priorities, reasoning) × $25/M | ~$0.04 |
| **Total** | | **≈ $0.05–0.075** |

A buyer who has 10 ranking exchanges a month costs about **$0.50–0.75 a month**. The function allows 60 turns per buyer per day to stop runaway cost. Setting `RANKING_MODEL=claude-sonnet-5` would cut this by more than half.

### Cost per new home (facts)

Home facts (beds, baths, size, price) come from RentCast, billed per API call. Thumbnails are made on the phone with Apple Look Around and cost nothing.

| RentCast plan | Monthly price | Calls included | Each extra call | Effective cost per new home (1–2 calls) |
|---|---|---|---|---|
| Developer | $0 | 50 | $0.20 | Free for the first ~25–50 homes a month |
| Foundation | $74 | 1,000 | $0.06 | ~$0.07–0.15 |
| Growth | $199 | 5,000 | $0.03 | ~$0.04–0.08 |
| Scale | $449 | 25,000 | $0.015 | ~$0.02–0.04 |

NORA enforces its own monthly call cap (`RENTCAST_MONTHLY_LIMIT`, default 45), so a plan's allowance is never exceeded by accident. When the cap is reached, new homes wait for the next month and still show their thumbnail. **Raise the cap when you change plans** (see SETUP.md).

Facts are looked up per buyer, so two buyers who visit the same open house cost two lookups. Sharing lookups across buyers by address would cut this, and is the first optimization to make if RentCast becomes the largest cost.

### Services

| Service | Used for | Pricing model | MVP cost |
|---|---|---|---|
| **Supabase** (Pro plan) | Sign-in, Postgres, storage, Edge Functions, scheduled jobs | $25/month, including 8 GB database, 100 GB storage, 250 GB transfer, 100k monthly active users, plus usage beyond that. The free plan works for development. | $25/month |
| **Deepgram** | Speech-to-text | Pay per audio minute (~$0.0043–0.0045/min). Includes a starting credit of ~$200. | Usage-based |
| **Anthropic Claude API** | Summarizing reactions into notes | Per token. Claude Opus 5: $5 / $25 per million input/output tokens. | Usage-based |
| **Expo EAS** | Cloud builds, app store submission, over-the-air updates | Free tier to start. ~$19/month Starter plan once builds are frequent. | $0–19/month |
| **Expo Push** | Push notifications | Free | $0 |
| **Cloudflare Pages** | Share page hosting | Free tier | $0 |
| **Sentry** | Crash and error reporting | Free developer tier | $0 |
| **PostHog** | Product analytics | Free up to 1M events/month | $0 |
| **Resend** (or Supabase's built-in email for testing) | Sign-in code emails | Free up to 3k emails/month, then $20/month | $0 |
| **Device geocoding** (Apple and Google built-in) | Turning GPS coordinates into an address | Free on the device | $0 |
| **RentCast** | Beds, baths, square feet, price per home (1–2 calls per new home, once) | Per call, by plan: Developer $0 (50 calls), Foundation $74 (1,000), Growth $199 (5,000), Scale $449 (25,000), plus a per-call fee beyond the allowance. The app enforces its own monthly cap. | $0 in development; $74/month for a pilot |
| **Apple Look Around / Maps snapshots** | Home thumbnails, generated on the phone | Free, no key | $0 |
| **Apple Developer Program** | App Store distribution | $99/year | $99/year |
| **Google Play Console** | Play Store distribution (Phase 1.5) | $25 one-time | $25 one-time |
| **Domain** | Share links (for example, `share.<domain>`) | ~$12–20/year | ~$15/year |

### Monthly running cost by scale

| Scale | Visits (≈ new homes) per month | Notes (Claude Opus 5 + Deepgram) | Ranking chat (~10 turns per buyer) | Home facts (RentCast) | Fixed services | **Total per month** |
|---|---|---|---|---|---|---|
| Development: you and a few testers | < 30 | < $1 | < $5 | $0 (Developer plan) | ~$0–25 | **≈ $0–30** |
| Pilot: 50 buyers | 400 | ~$14 | ~$25–40 | ~$74 (Foundation; 400–800 calls) | ~$25–45 | **≈ $140–175** |
| Launch: 500 buyers | 4,000 | ~$140 | ~$250–375 | ~$199–290 (Growth; 4,000–8,000 calls) | ~$45–65 | **≈ $635–870** |
| Growth: 5,000 buyers | 40,000 | ~$1,400 | ~$2,500–3,750 | ~$675–1,275 (Scale; 40,000–80,000 calls) | ~$150–300 (Supabase usage, Resend, Sentry and PostHog paid tiers) | **≈ $4,725–6,725** |

Per buyer who tours 8 homes and has about 10 ranking exchanges a month: notes about $0.28, ranking chat $0.50–0.75, facts $0.32–0.64 (Growth plan), so about **$1.10–1.70 a month**. The ranking chat is the largest variable cost; switching it to Claude Sonnet 5 (`RANKING_MODEL`) is the first lever. Sharing RentCast lookups across buyers is the second.

### One-time costs

| Item | Estimate |
|---|---|
| Apple Developer account (first year) and Google Play registration | $124 |
| Legal review: privacy policy and terms | $1,000–3,000 |
| App icon, store screenshots, basic brand assets (if outsourced) | $500–2,000 |
| Engineering effort | See §5. About 7 weeks for 1–2 engineers plus part-time design. This is the largest cost, and it depends on whether the team is in-house or contracted. |

---

## 5. Build plan

Two full-stack engineers (React Native and TypeScript) plus a part-time product designer. The phases below assume that team.

| Week | Milestone | Done when |
|---|---|---|
| 1 | **Foundations** | Expo project, Supabase project, sign-in with Apple, Google, and email code, database schema with access rules, CI and cloud builds to TestFlight |
| 2 | **Record and queue** | Property confirmation with GPS, recording screen with prompts, local save, upload queue that survives no signal and app restarts |
| 3 | **Processing** | `process-visit` function, Deepgram, Claude with quote checks, status tracking, retry sweeper, push notifications |
| 3–4 | **Note quality** | Quality test set of 30–50 reactions, prompt tuning, Opus 5 vs Sonnet 5 comparison |
| 4–5 | **Note, history, editing** | Note screen with quotes, transcript and playback, editing that survives regeneration, property list and pages, offline cache |
| 5–6 | **Sharing and data controls** | Share links, share page, revocation and expiry, account and data deletion, privacy policy, App Store privacy labels |
| 6–7 | **Beta and launch** | TestFlight beta with 20–50 buyers and a few agents during real open-house weekends, fixes, App Store submission |
| +2–3 weeks | **Phase 1.5: Android** | Device testing, Play Store listing |

**What to measure in the beta:**
- At least 99% of saved clips produce a note.
- Median time from saving a clip to the note being ready is under 30 seconds.
- Buyers edit fewer than 15% of items, and invented points are almost never reported.
- The share rate per note.
- Repeat use: buyers who record a second and a fifth home.

---

## 6. Risks and open questions

| Risk | Mitigation |
|---|---|
| **Buyers forget to record after leaving** | A large "Record a home" button on the home screen and a quick flow (two taps to start). A reminder when leaving an open house is planned for Phase 2. |
| **Short reactions miss things the buyer would want to remember** | Rotating prompts during recording. Buyers can add points and personal notes by typing. A clarifying question after recording is planned for Phase 2. |
| **Note quality: missed or invented points** | A quote with every item, server-side quote checking, the transcript and recording one tap away, and a quality test set run on every prompt change. |
| **Poor connection outside the home** | The clip is saved on the phone first, and the upload queue retries until it succeeds. |
| **Address matching** (condo units, new builds, GPS drift) | Suggest an address but always let the buyer confirm or edit. Record a unit number. Offer the buyer's own nearby properties first. |
| **Vendor dependence** | Transcription and summarization each sit behind one back-end module, so Deepgram can be swapped (for example, for AssemblyAI) and Claude models can change without touching the app. |

**Open questions for the team**

1. **Business model:** will buyers pay, or agents and brokerages? This decides whether agent features move up from Phase 3.
2. **Agent pilot:** is there an agent or brokerage partner who can recruit beta buyers and give feedback on the share page?
3. **Branding and domain** for share links.
