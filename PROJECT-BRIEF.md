# KineTech Website — Project Brief
*Prepared for leadership review — nature of the project and work completed.*

## 1. What this project is
The official website of **KineTech** (Egyptian engineering & technology education brand: programming, data, CAD/SolidWorks courses + marketing, software, and design services). It is a bilingual (Arabic-first, English) marketing site with sign-in / sign-up pages. There is **no backend yet** — forms, auth, and loaders are front-end previews; WhatsApp (`wa.me/201042031062`) is the real contact channel.

## 2. Tech stack
| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript (~6.0), Vite 8 |
| Styling | Tailwind CSS v4 (+ hand-written brand CSS in `src/index.css`) |
| UI kit | shadcn (new-york) + Aceternity registry components |
| Animation | Motion (`motion/react`), canvas effects |
| i18n | Custom EN/AR dictionary (`src/i18n.ts`), RTL flip, persisted in `localStorage` (`kt-lang`) |
| Quality gates | `npm run build` = `tsc -b && vite build` (strict), `oxlint` |
| Version control | **No git repo yet** — strongly recommended before handover |

Run: `npm run dev` (develop) · `npm run build` + `npm run preview` (production check). Deploy target discussed: Vercel (`kinetech-app` as root directory).

## 3. Pages & sections (all bilingual, RTL-aware)
- **Landing (`/`)** — sticky header (brand, gooey search pill with section-jump, language toggle, Sign in); animated hero (wavy canvas, staggered headline, WhatsApp + pillars CTAs); "How it works" flow (5 numbered flat pastel cards); services showcase (info + iPhone mockup with status bar, auto-rotates every 5s, arrows, bottom tab bar, hover-pause); academy course rail (3 photo cards, drag/scroll, focus-blur, click-to-expand modal); reviews marquee; dark contact CTA (WhatsApp/Facebook); footer.
- **Sign in (`/signin.html`)** — split screen: black brand panel + form (email/password, Google button, multi-step loading overlay, page-fade transition to sign-up).
- **Sign up (`/signup.html`)** — same shell; fields: first/last name, email, phone/WhatsApp, custom Service-Category dropdown, password.

## 4. Design system
`DESIGN.md` (repo root of app) is the source of truth: purple `#6E4E9C` + teal `#3BBCD9`, single-hue purple gradients only, Alexandria (AR) + Valley Sans (EN) type, Lucide/Tabler vector icons (no emoji), light-theme-only UI.

## 5. Aceternity components — used vs installed
- **Live:** wavy-background (hero), animated-testimonials (replaced by focus-cards rail — file kept), focus-cards pattern (academy rail), expandable-card modal logic (academy), multi-step-loader port (auth, vanilla JS), gooey-input (header search).
- **Installed, not rendered:** aurora-background, vortex (+ vanilla port retired), world-map (removed per request — but `dotted-map` ~400KB left `package.json`; remove if unused), hero-section-demo-1, input/label primitives.
- **Recommendation:** delete unused registry files + `dotted-map` to cut ~400KB before launch.

## 6. Performance work done
Hero canvas pauses offscreen (IntersectionObserver); auth particle retry-polling removed; below-fold images lazy + async decode; slide arrays memoized; world-map was code-split (removed with the map); strict TS build green.

## 7. Open items / risks for leadership
1. No backend: auth/social buttons are decorative previews; loader ends in demo state.
2. No git repository — create before any team handover.
3. Course photos: filenames were mismatched (a "Programming" file held a SolidWorks flyer); mapping fixed to Robotics / Python+Data / SolidWorks, but a real Programming flyer still doesn't exist.
4. Testimonial quotes are sample data — replace with verified feedback before launch.
5. Unused dependencies/components should be pruned (see §5).
