# KineTech — Design System
*Version 1.0 — extracted from brand assets (logo, social posts, course flyers, Eid greeting)*

> This document is written to be machine-readable and directly consumable by AI coding/design agents (Claude Code, opencode, Cursor, etc.) so that any new asset — poster, landing page, slide, social post, PDF — reproduces the KineTech look with zero guesswork.

---

## 1. Brand Essence

**KineTech** is an engineering & technology education brand (Arabic-market, Egypt-based) offering programming, data, and CAD/SolidWorks courses. The identity fuses **circuitry (AI/tech)** with a **human brain (learning/cognition)** — literally rendered as a split-face logo: left hemisphere = purple circuit nodes, right hemisphere = teal brain. This "half-machine, half-mind" motif is the single most important visual idea in the brand and should be echoed conceptually (not just via the logo mark) wherever possible: technical + human, precise + approachable.

**Tone:** confident, modern, youthful-professional, slightly bold/loud (marketing flyers for course sales), but never cluttered — generous white space around a strong focal graphic.

---

## 2. Logo

- **Mark:** a circle outline containing two halves split by a vertical line:
  - **Left half (purple):** a stylized circuit — a filled circular "chip" node at center with branching lines ending in small hollow circles (like PCB traces / neural connections).
  - **Right half (teal):** a brain silhouette with characteristic gyri/sulci grooves.
  - **Ring:** medium-gray circle stroke framing both halves.
- **Wordmark:** "KINETECH" in a heavy/black, tightly-tracked, all-caps geometric sans. In the primary lockup the wordmark is solid brand purple; in horizontal lockups it is often two-toned — "KINE" in purple, "TECH" in teal — to mirror the split-brain concept.
- **Clearspace:** keep padding around the mark ≥ 0.5× the circle's diameter.
- **Minimum size:** do not shrink the circular mark below ~48px — the circuit nodes become illegible.
- **Do not:** recolor the two halves to matching colors (destroys the concept), stretch/distort the circle into an oval, add drop shadows or bevels, or place on busy photographic backgrounds without a solid/blurred backing shape.
- **Backgrounds:** logo is designed for light/white backgrounds primarily; on the dark purple Eid variant, the same two-tone (purple/teal) mark is kept but the ring is left light so it still pops.

---

## 3. Color Palette

### 3.1 Core brand colors

| Token | Hex | Usage |
|---|---|---|
| `brand-purple` | `#6E4E9C` | Primary brand color — circuit half of logo, wordmark, headings, primary buttons/accents |
| `brand-purple-dark` | `#3A1E6B` | Deep purple for gradient shadows, dark section backgrounds, Eid/night backgrounds |
| `brand-purple-deep2` | `#3D3250` | Secondary dark navy-purple, used in gradient corners / geometric shapes |
| `brand-teal` | `#3BBCD9` | Secondary brand color — brain half of logo, secondary headings, icon accents, "COURSE" type |
| `brand-gray` | `#A8A8A8` | Neutral ring/outline color, dividers, muted supporting text |
| `neutral-white` | `#FFFFFF` | Primary background |
| `neutral-offwhite` | `#ECEAEF` | Secondary/soft background panels (behind photos, cards) |
| `text-black` | `#000000` / `#1A1A1A` | Body copy, bullet lists (high-contrast readability) |

### 3.2 Gradient / accent purples (for shapes, geometric backgrounds, decorative diagonals)
A tonal purple ramp is used for layered diagonal shapes and gradients (light → dark), always staying in the purple family — never mixing in unrelated hues:
```
#927BB3  (lightest tint)
#8468A5
#7F639E   <- workhorse mid-tone, most common in flyers
#764D8F
#6E4E9C   <- brand-purple (core)
#502D93
#472885
#3A1E6B   (deepest shade)
```
Use these as a single-hue gradient (e.g., 135° diagonal) for poster corner shapes, banner ribbons, and name-tag bars. Never introduce a second hue into these gradients.

### 3.3 Color rules
1. **60/30/10 split:** ~60% white/off-white background, ~30% brand purple (shapes, ribbons, wordmark), ~10% teal (accent icons, secondary headline word, checkmarks).
2. Purple and teal **never touch as a smooth gradient into each other** — they appear as separate, flat, adjacent blocks (this preserves the "two halves" concept). Any gradient stays within one hue family.
3. Gray (`#A8A8A8`) is reserved for the logo ring and quiet dividers — never used for primary text or CTAs.
4. On dark-purple backgrounds (Eid post), body/heading text switches to white; icons/moon/lantern line art stay white or light-gray at reduced weight.

---

## 4. Typography

**Primary typeface (mandatory): [Alexandria](https://fonts.google.com/specimen/Alexandria) — Google Fonts.**
Alexandria is a modern, geometric Arabic/Latin variable typeface and is the single font family to use across all KineTech assets (Arabic and English alike), replacing any other sans-serif suggestion below. Use only these two weights, consistently:

| Weight | Usage |
|---|---|
| **Alexandria Medium (500)** | All body copy, paragraphs, bullet-list items, contact info, captions, descriptions |
| **Alexandria Bold (700)** | All headlines, wordmark, section labels, instructor name-plates, anything meant to grab attention |

Do not introduce a third weight or a different family for body/heading text. The only exception is the **script accent word** (e.g. "Course"), which may keep a dedicated cursive/brush font for contrast — everything else must be Alexandria Medium or Bold.

| Role | Style | Notes |
|---|---|---|
| **Wordmark / Hero headline** ("PROGRAMMING", "KINETECH") | **Alexandria Bold**, ALL CAPS, tight letter-spacing | Reserved for 1–3 word max-impact statements |
| **Script accent word** ("Course") | Bold casual script/brush font (e.g., "Pacifico", "Lobster", or "Alex Brush") in brand purple — the one allowed exception to Alexandria | Used sparingly, exactly once per composition, to add warmth against the heavy geometric type |
| **Sub-headline / Section label** ("OUR COURSE", "our course") | **Alexandria Bold**, sentence case or caps, smaller scale, sometimes in a pill/rounded-badge with teal fill and white text | Used to label a features list |
| **Body / bullet list** | **Alexandria Medium**, black, left-aligned, bullet points | Course feature lists — short 2–5 word phrases per bullet |
| **Instructor / name plate** | **Alexandria Bold** (italic style if available in the variable font), white text on a purple gradient ribbon | e.g. "ENG/ Abdullah Ahmed" |
| **Contact footer** | **Alexandria Medium**, small size, black or dark gray, paired with a filled circular icon (phone/Facebook) to the left | Always bottom-left of the composition |

**Font pairing guidance for agents:** Alexandria Bold (headline) + Alexandria Medium (body/UI) +, optionally, one script/brush accent font used once = maximum 2–3 font families per asset, with Alexandria doing all the structural heavy-lifting in both weights. This applies equally to Arabic and English text — Alexandria supports both scripts natively, so do not swap in a separate Arabic-only typeface.

---

## 5. Iconography & Illustration Style

- **Style:** flat, two-tone (or single-tone) line/fill icons — no gradients, no photorealism, no 3D within icons.
- **⚠️ Never use native emoji glyphs** (the default OS/Windows-style emoji set — 📞 📘 ✅ 📱 💻 etc.). These render inconsistently, look dated/cartoonish, and clash with the flat geometric brand style. This applies everywhere: contact footers, feature bullets, section labels, social captions.
- **Always use a proper icon set instead**, drawn as clean vector/SVG glyphs in brand colors (purple/teal/white — never multicolor emoji rendering):
  - Preferred: **Material Symbols / Material Icons** (Google Fonts), **Phosphor Icons**, **Lucide**, or **Feather Icons** — all flat, single-weight, modern, and easy for agents to pull from CDN/Google Fonts.
  - Icon should be a **line or filled-line glyph inside a solid circle badge** (matching the existing check-mark badge pattern), sized and colored to match the surrounding palette — e.g. a `phone` glyph in white inside a `--kt-purple` filled circle, a `facebook`/`f-logo` glyph the same way.
  - Pick **one icon family and one weight** per asset and stay consistent — don't mix Material glyphs with Phosphor glyphs with emoji in the same composition.
- **Recurring icon motifs:** circuit nodes/traces, brain, code brackets `</>`, Python-logo colors as an accent, chip/IC, laptop mockups, gear/mechanical parts (for CAD courses), checkmarks inside filled circles — always rendered as clean vector icons, never as emoji characters.
- **Checkmarks:** white checkmark inside a solid white/teal circle badge, left of each feature bullet — this is a recurring "our course" list pattern, reuse it exactly.
- **Decorative background line-art:** faint (~10–15% opacity), thin-stroke circuit/gear line patterns scattered in a corner or behind the main graphic — adds texture without competing with foreground content.
- **Photography:** when a real person is used (instructor headshot), keep it candid/portrait, arms-crossed or confident pose, placed bottom-right or right-third of the frame, bleeding off the bottom edge; overlay a purple diagonal shape behind/around it to integrate it into the brand palette.

---

## 6. Layout & Composition Patterns

KineTech material follows a small set of repeatable, agent-reproducible layouts:

### A. "Split diagonal poster" (course flyers)
- Canvas split by one or more **diagonal purple geometric shapes** cutting in from a corner (usually top-right or right edge), creating an angular, dynamic (non-rectangular) content zone.
- Logo + wordmark top-left.
- Big heavy headline (course subject) top-left/center, in the flat white zone.
- Script accent word directly beneath/beside headline.
- Bulleted "Our Course" feature list in the white zone, left-aligned, each item with a circular check icon.
- Instructor name in an italic/bold name-plate ribbon (purple gradient bar), lower-left.
- Photo of instructor OR a relevant product render (laptop, gears) anchored right side or bottom-right, often inside a large soft-cornered purple panel.
- Footer: phone icon + number, Facebook icon + URL, bottom-left, small type.
- Small dotted-grid decorative pattern top-left corner (brand texture detail).

### B. "Square social/announcement post" (e.g., Eid Mubarak)
- Solid or gradient **dark purple background** (single hue ramp from mid to deep purple, radial or diagonal).
- Logo mark centered, top-third.
- Centered, white, bold headline directly beneath logo.
- Symmetric decorative ornaments (lanterns, moons, drums for Eid; swap for on-theme ornaments for other occasions) framing top corners and bottom corners, muted/desaturated so they don't outcompete the logo.
- Strong bilateral symmetry — this template is symmetric top-to-bottom and left-to-right, unlike the asymmetric flyer template.

### General rules
- Maintain generous negative space; never fill more than ~70% of the canvas with text/graphics.
- Always exactly **one** dominant focal element (logo, headline, or hero photo) per composition — don't compete with two hero elements.
- Corner treatments favor large soft-rounded or angular-diagonal shapes, not simple rectangles.
- Contact info block is a fixed, small, bottom-left utility element across all formats: 📞 filled circle icon + phone number, then 📘 Facebook icon + URL beneath it.

---

## 7. Voice & Messaging Patterns

- Headlines are short, benefit/subject-first: `[SUBJECT] + COURSE` (e.g., "PROGRAMMING COURSE", "PROGRAMMING & DATA COURSE").
- Feature lists use **3–4 punchy noun phrases**, title case, no full sentences (e.g., "The Power of Python", "Full-Stack Web Dev", "Logical Thinking", "App Development").
- Instructor credited as `ENG/ [First Name] [Last Name]` — always with the "ENG/" engineering title prefix, a strong local-market trust signal.
- Supporting descriptive line (optional, smaller): one sentence, encouraging/aspirational — "Boost your skills with our foundational course designed to help you build and innovate."
- Scarcity/urgency language used occasionally in CTAs: "limited seats!", "From ZERO level to [certification]".
- Footer always: WhatsApp/phone number + Facebook page link — no other socials.

---

## 8. Design Tokens (for code / CSS variables)

```css
:root {
  /* Brand */
  --kt-purple: #6E4E9C;
  --kt-purple-mid: #7F639E;
  --kt-purple-dark: #3A1E6B;
  --kt-purple-deep2: #3D3250;
  --kt-teal: #3BBCD9;
  --kt-gray: #A8A8A8;

  /* Neutrals */
  --kt-white: #FFFFFF;
  --kt-offwhite: #ECEAEF;
  --kt-black: #1A1A1A;

  /* Gradient ramp (purple only) */
  --kt-gradient: linear-gradient(135deg, #927BB3 0%, #7F639E 35%, #6E4E9C 60%, #472885 85%, #3A1E6B 100%);

  /* Typography */
  --font-display: "Alexandria", sans-serif;   /* weight 700 (Bold) — headlines, wordmark, labels */
  --font-body: "Alexandria", sans-serif;      /* weight 500 (Medium) — body, bullets, footer */
  --font-accent: "Pacifico", "Lobster", cursive; /* script accent, use once, only exception to Alexandria */
  --font-weight-body: 500;
  --font-weight-display: 700;

  /* Radius / shape */
  --radius-badge: 999px;   /* pill badges, check-circle icons */
  --radius-panel: 32px;    /* large soft-corner photo/content panels */

  /* Spacing scale (px) */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 40px;
  --space-5: 64px;
}
```

---

## 9. Component Recipes

**Feature bullet (checklist item):**
```
[● white check on filled circle: var(--kt-teal) or var(--kt-white) on purple panel]  Bold black/white label text
```

**Instructor name-plate ribbon:**
```
Background: var(--kt-gradient) (purple, diagonal)
Text: white, bold italic, centered or left-aligned
Shape: rectangle with one or two corners cut/angled to match poster diagonal
```

**Contact footer block:**
```
Row 1: [phone/whatsapp glyph — Material Symbols or Phosphor "phone" icon, white, inside filled circle var(--kt-purple)] + phone number, medium weight
Row 2: [Facebook "f" glyph icon — Phosphor/Lucide "facebook" icon, white, inside filled circle var(--kt-purple)] + facebook.com/... URL, regular weight, smaller
Always bottom-left, ~16px gap between rows
NEVER substitute the icon glyphs with emoji characters (📞 📘) — always a real vector icon from the chosen icon set.
```

**Section label pill:**
```
Background: var(--kt-teal), fully rounded (--radius-badge)
Text: white or black, bold, lowercase or Title Case, small size
e.g. "our course"
```

---

## 10. Usage Checklist for Agents

Before generating any new KineTech asset, confirm:
- [ ] Logo mark uses correct two-tone split (purple circuit / teal brain), never recolored.
- [ ] Background is white/off-white OR the dark-purple gradient template — no other hues introduced.
- [ ] Exactly one hero focal element (logo / headline / photo).
- [ ] Headline uses heavy geometric sans; at most one script-accent word.
- [ ] Feature list uses circular check-icon bullets, 3–4 short noun-phrase items.
- [ ] Diagonal/angular purple shape(s) present for flyer-style layouts (not for symmetric social posts).
- [ ] Contact footer (phone + Facebook) present, bottom-left, consistent icon style.
- [ ] Generous white space maintained — content never exceeds ~70% canvas fill.
- [ ] Any gradient stays single-hue (purple ramp) — teal is used flat, never gradiented with purple.
- [ ] No native/OS emoji glyphs anywhere (📞📘✅💻📱 etc.) — all icons are vector glyphs from Material Symbols / Phosphor / Lucide / Feather, single family + weight per asset.
- [ ] Typography is **Alexandria** (Google Fonts) only, in exactly two weights: Bold for headlines/labels, Medium for body/bullets/footer — no substitute sans-serif families.
