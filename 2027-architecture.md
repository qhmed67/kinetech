# KineTech 2027 Architecture: Agent Instructions

You are an AI coding agent working on the KineTech project. Read this whole file before changing anything. It replaces any previous plan for a React Native UI.

## 0. Decision (final, do not revisit)

**Cancel the React Native UI rewrite.** Do not port, rebuild or maintain any screens in React Native.

The new architecture is a **Hybrid Shell**:

- **UI = the existing web app** (React 19 + TypeScript + Vite + Tailwind v4 + shadcn), rendered inside a `WebView`.
- **Execution = native.** The native shell (React Native with Expo, no UI screens of its own except the video player and a splash/blocked screen) handles everything sensitive.
- **The web app never sees a video URL, a video token, or a DRM licence.** It only says "play lesson X". Native does the rest.

Reason: the course videos must be protected, and a plain web app cannot stop downloading or screen recording. The web UI is kept to avoid losing components, design and i18n during a rewrite.

## 1. Current state (analysis of `qhmed67/kinetech`)

- Vite + React 19 + TypeScript project. Multi-page (`/`, `/signin.html`, `/signup.html`). Deployed on Vercel.
- Arabic-first bilingual (EN/AR) site with a custom `src/i18n.ts` dictionary, RTL flip, language saved in `localStorage` (`kt-lang`).
- Design system is in `DESIGN.md` (purple `#6E4E9C`, teal `#3BBCD9`, Alexandria and Valley Sans fonts, light theme only). Treat it as the source of truth.
- Components: shadcn (new-york) and some Aceternity components, Motion animations, canvas hero.
- **No backend.** Auth and forms are front-end previews. WhatsApp is the only real contact channel.
- Some unused components and the `dotted-map` dependency (~400KB) are still in the repo.
- No video or course player exists yet. The academy section is only a marketing rail of 3 course cards.

Do not rewrite the marketing pages. Extend them.

## 2. Target architecture

```
kinetech/
├─ apps/
│  ├─ web/        ← the existing Vite app (move it here, keep history)
│  └─ mobile/     ← new Expo (dev build) shell: WebView + native player
├─ packages/
│  └─ bridge/     ← shared TypeScript types for web ↔ native messages
└─ backend/       ← API (auth, entitlements, playback tokens)
```

Use npm or pnpm workspaces. Keep `apps/web` deployable to Vercel on its own.

### 2.1 Web app (UI)
- Add a `src/native/` module that detects the shell and wraps the bridge.
  - Detect the shell with an injected flag (`window.__KT_NATIVE__`) plus a custom User-Agent suffix such as `KineTechApp/1.0`. Do not rely on the User-Agent alone.
  - `isNativeApp()`, `bridge.send(msg)`, `bridge.on(type, handler)`.
- Add pages: `/courses`, `/course/:id`, `/lesson/:id`, and a profile page.
- On the lesson page, the "Play" button calls `bridge.send({ type: "playVideo", lessonId })`. It must **never** render a `<video>` tag for protected content.
- In a normal browser (not in the app), protected lessons show a "Watch in the KineTech app" card with store links. Free preview content may play in the browser.
- Keep all i18n and RTL behaviour. Every new string goes through `src/i18n.ts` in both EN and AR.
- Do not store tokens, video URLs or keys in `localStorage`, `sessionStorage`, the DOM, or logs.

### 2.2 Native shell (`apps/mobile`)
- Expo with a **development build** (not Expo Go, because DRM and native modules need it).
- One main screen: `react-native-webview` loading the production web URL, with `originWhitelist` limited to the KineTech domain. Block all other navigation (open external links in the system browser).
- Native screens: **Player**, **Blocked** (shown when the device or environment is unsafe), and **Offline Downloads** (phase 4).
- Handle the Android back button, safe areas, keyboard, RTL, and pull-to-refresh correctly inside the WebView.
- Disable WebView debugging in release builds (`setWebContentsDebuggingEnabled(false)`, and `isInspectable` false on iOS).

### 2.3 Bridge protocol (`packages/bridge`)
Typed, versioned messages. Example:

```ts
type WebToNative =
  | { v: 1; type: "playVideo"; lessonId: string }
  | { v: 1; type: "authCode"; code: string }      // one-time code after web login
  | { v: 1; type: "logout" }
  | { v: 1; type: "downloadLesson"; lessonId: string };

type NativeToWeb =
  | { v: 1; type: "playerClosed"; lessonId: string; progressSec: number }
  | { v: 1; type: "deviceStatus"; ok: boolean; reason?: string }
  | { v: 1; type: "downloadState"; lessonId: string; state: "queued" | "done" | "failed" };
```

Rules:
1. Native validates every incoming message: the sender origin must match the whitelist, the schema must match, and unknown types are dropped.
2. Messages carry ids only, never URLs, tokens or keys.
3. Native never executes anything the web sends as code or a path.

### 2.4 Video protection (native)
- Player: `expo-video` or `react-native-video` (ExoPlayer on Android, AVPlayer on iOS). Verify the current DRM support of the chosen library before committing. Prefer the one with working Widevine and FairPlay config.
- DRM: Widevine on Android, FairPlay on iOS, through a managed provider (VdoCipher, Bunny Stream, Mux or similar). Do not build DRM yourself.
- Playback flow: native calls `POST /playback/start { lessonId }` with its device-bound credential. The server checks the entitlement and returns a short-lived signed manifest URL plus the DRM licence info. The player uses it. Nothing is passed to the WebView.
- Android: set `FLAG_SECURE` on the player activity (blocks screenshots, screen recording and the recent-apps thumbnail).
- iOS: observe `UIScreen.isCaptured` and the screenshot notification. Pause and hide the video while capturing, and show a warning.
- Dynamic watermark: overlay the user's name or email and id on the video, moving position at intervals. This is the main deterrent against camera recording and leaks.
- Environment checks before playback: root or jailbreak, emulator, and Android **USB debugging / developer options enabled** (read `Settings.Global.ADB_ENABLED`). Use a small custom Expo native module for the ADB check. If a check fails, show the Blocked screen with a clear message. Be honest in the code comments: these checks raise the cost of copying but can be bypassed by a determined attacker.
- Also block playback when a screen-mirroring or external display is detected where the platform allows it.

### 2.5 Backend (`backend/`)
Minimum endpoints:
- `POST /auth/register`, `POST /auth/login`, `POST /auth/google`, `POST /auth/refresh`
- `GET /me`, `GET /courses`, `GET /courses/:id`, `GET /lessons/:id` (metadata only)
- `POST /playback/start`: checks the entitlement and device, and returns a short-lived signed URL or licence.
- `POST /progress` for watch progress.
- Admin/webhook endpoints for enrolment (payment or manual).

Pick a simple stack (for example Node + Postgres, or a BaaS such as Supabase) and justify it briefly in the PR description. Limit concurrent devices per account (for example 2). Log playback sessions per user.

### 2.6 Auth across WebView and native
1. The user logs in on the web UI. The web gets an `httpOnly`, `Secure`, `SameSite` session cookie for normal API calls.
2. After login the server returns a **one-time code**. The web sends it to native with `authCode`.
3. Native exchanges the code for a **device-bound refresh token** and stores it in Keychain (iOS) or Keystore (Android).
4. Only native uses that credential to request playback. The web session cannot request video.
5. Logout clears both.

## 3. Store and policy constraints
- Apple guideline 4.2 rejects apps that are only a website in a wrapper. The shell must offer real native value: the DRM player, offline downloads, push notifications, secure storage. Keep these visible in the review notes.
- If paid courses are sold inside the app, Apple and Google in-app purchase rules apply. Decide the payment model before building checkout. Do not add a purchase button in the WebView without checking this.
- Add privacy policy and account-deletion flows, which both stores require.

## 4. Phases (do them in order, one PR per phase)

**Phase 1: Restructure**
- Move the current app to `apps/web` without changing behaviour. Remove any React Native UI work and dependencies that were added earlier.
- Remove unused components and `dotted-map`. Initialise git hygiene if missing.
- Done when: `npm run build` and `oxlint` pass and the Vercel build still works.

**Phase 2: Shell + bridge**
- Create `apps/mobile` with the secured WebView, the bridge package and the detection code in web.
- A "Play" button sends `playVideo` and native shows a test player with a sample clip.
- Done when: the app runs on a real Android device and an iPhone, and a message from a non-whitelisted origin is rejected.

**Phase 3: Backend, auth and playback**
- Implement auth, entitlements, `/playback/start` and the one-time code exchange.
- Integrate the DRM provider. Add the watermark.
- Done when: a user without enrolment cannot play, and a user with it can, with no URL or token visible through WebView inspection.

**Phase 4: Protection and offline**
- `FLAG_SECURE`, iOS capture detection, root/jailbreak/emulator/ADB checks, device limit.
- Encrypted offline downloads using the provider's official offline-DRM feature.
- Done when: a screen recording on Android is black, and iOS pauses on capture.

**Phase 5: Polish and release**
- Push notifications, store assets, privacy policy, account deletion, review notes for Apple.

## 5. Rules for you, the agent
- Do not delete or redesign existing marketing pages, `DESIGN.md` rules or i18n structure.
- Do not put secrets in the repo. Use environment variables and a `.env.example`.
- Keep TypeScript strict. Run `npm run build` and `oxlint` before every commit.
- Prefer small commits and short PR descriptions listing what changed and what was tested on which device.
- If something in this file is impossible or inaccurate (for example a library lacks DRM support), stop, explain the problem, and propose an alternative instead of silently changing the architecture.
- Never claim the video is "fully protected". The goal is to make copying expensive and traceable.

## 6. First task
Start with **Phase 1** only. Before coding, print a short plan listing the files you will move or delete, and any React Native UI code you found that must be removed.
