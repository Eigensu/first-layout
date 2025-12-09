Here’s a tech spec you can hand to an AI coding agent (or drop into an “agentic” workflow) to migrate your app’s colours to the new purple fantasy theme.

⸻

AI Coding Agent – Colour System Migration Spec

0. Goal

Migrate the entire frontend from the legacy black & gold theme to the new purple fantasy theme, using CSS variables as the single source of truth and Tailwind utilities wired to those variables.

Constraints:
• Do not change component logic or layout.
• Do not introduce new dependencies.
• All hard-coded colour literals (hex / rgb / rgba) must be removed from .tsx / .ts / .css files, except in the central theme definitions.

⸻

1. Source of Truth – New Colour Tokens

1.1 Update /apps/frontend/src/app/globals.css

The agent must ensure there is a :root block with exactly these variables (create or replace the existing theme block):

:root {
/_ Base purples _/
--bg-body: #1a073e; /_ main page background _/
--bg-elevated: #26104e; /_ header / nav _/
--bg-card: #3c1f62; /_ cards & widgets _/
--bg-card-soft: #4a325f; /_ hover / slightly elevated _/
--bg-chip: #70537f; /_ pills, chips _/

/_ Accents - light lavenders ("pink") _/
--accent-pink: #c8badf; /_ primary highlight _/
--accent-pink-soft: #d9cbe8; /_ hover / soft backgrounds _/
--accent-pink-deep: #9887b0; /_ mid lavender _/
--accent-pink-faint: #eee7f8; /_ very light tint _/

/_ Accents - deeper purples ("orange") _/
--accent-orange: #8f82a0; /_ mid gradient colour _/
--accent-orange-soft: #83709a; /_ slightly deeper mid _/
--accent-orange-deep: #4b405a; /_ dark edge / strong accents _/
--accent-orange-faint: #b6a7d3; /_ secondary light tint _/

/_ Text & neutrals _/
--text-main: #f7f3ff;
--text-muted: #c0b6e1;
--text-subtle: #9887b0;
--border-subtle: #4a4061;
--border-strong: #6f6490;

/_ Status colours _/
--success: #23d18b;
--warning: #facc15;
--danger: #ff4b6e;

/_ Gradients _/
--gradient-hero: linear-gradient(
120deg,
#1a073e 0%,
#29114e 40%,
#3c1f62 75%,
#4a325f 100%
);

--gradient-brand: linear-gradient(
90deg,
#c8badf 0%,
#8f82a0 45%,
#4b405a 100%
);

--gradient-card: linear-gradient(
145deg,
#3c1f62 0%,
#2b144c 40%,
#4a325f 100%
);

--gradient-button-primary: linear-gradient(
135deg,
#c8badf 0%,
#8f82a0 45%,
#4b405a 100%
);

--gradient-button-secondary: linear-gradient(
135deg,
#2b144c 0%,
#3c1f62 50%,
#9887b0 100%
);

/_ Shadows _/
--shadow-soft-pink: 0 0 18px rgba(200, 186, 223, 0.35);
--shadow-strong-pink: 0 0 30px rgba(152, 135, 176, 0.55);
}

body {
background: var(--bg-body);
color: var(--text-main);
}

The agent must remove any obsolete colour variables that conflict with these (old black/gold palette).

⸻

2. Tailwind Configuration

2.1 Update /apps/frontend/tailwind.config.js

The agent must ensure Tailwind colour utilities reference the CSS variables, not hard-coded hex values.

Under theme.extend.colors, ensure:

colors: {
bg: {
body: 'var(--bg-body)',
elevated: 'var(--bg-elevated)',
card: 'var(--bg-card)',
'card-soft': 'var(--bg-card-soft)',
chip: 'var(--bg-chip)',
},
accent: {
pink: {
50: 'var(--accent-pink-faint)',
soft: 'var(--accent-pink-soft)',
500: 'var(--accent-pink)',
deep: 'var(--accent-pink-deep)',
},
orange: {
50: 'var(--accent-orange-faint)',
soft: 'var(--accent-orange-soft)',
500: 'var(--accent-orange)',
deep: 'var(--accent-orange-deep)',
},
},
text: {
main: 'var(--text-main)',
muted: 'var(--text-muted)',
subtle: 'var(--text-subtle)',
},
border: {
subtle: 'var(--border-subtle)',
strong: 'var(--border-strong)',
},
success: 'var(--success)',
warning: 'var(--warning)',
danger: 'var(--danger)',
},
backgroundImage: {
'gradient-hero': 'var(--gradient-hero)',
'gradient-brand': 'var(--gradient-brand)',
'gradient-card': 'var(--gradient-card)',
'gradient-button-primary': 'var(--gradient-button-primary)',
'gradient-button-secondary': 'var(--gradient-button-secondary)',
},
boxShadow: {
'pink-soft': 'var(--shadow-soft-pink)',
'pink-strong': 'var(--shadow-strong-pink)',
},

Do not introduce new names; reuse these so that classes like bg-bg-card, bg-gradient-brand, shadow-pink-soft, etc., work globally.

⸻

3. Colour Replacement Rules

The agent must perform a systematic pass over the codebase and replace all legacy hardcoded colours with the appropriate Tailwind classes or CSS variables.

3.1 Legacy → New mapping

Interpret legacy colours as follows:

#bfab79, #a89363, #8c7853, rgba(191,171,121,x)
→ purple accent / glow - solid fills: use accent orange or pink:
bg-accent-orange-500 or bg-accent-pink-500 - glows/shadows: use var(--shadow-soft-pink) / var(--shadow-strong-pink)

#f9f7f3 → bg-bg-card or bg-bg-elevated (depending on context)

#000000 / #111111 / #1e1e1e (old dark body) → bg-bg-body

#2f2f2f / dark text on light backgrounds → text-text-main

Any inline gold gradients (e.g. gold → brown)
→ bg-gradient-brand or bg-gradient-button-primary

Implementation detail:
• Prefer Tailwind classes in JSX:
• Example: className="bg-[##f9f7f3]" → className="bg-bg-card"
• Example: className="shadow-[0_0_24px_rgba(191,171,121,0.5)]" → className="shadow-pink-soft"
• For inline style objects in React:
• Example: style={{ background: "#a89363" }} → style={{ background: "var(--accent-orange)" }}

3.2 Files to target

The agent must at minimum inspect and update:
• /apps/frontend/src/app/globals.css
• /apps/frontend/tailwind.config.js
• /components/navigation/PillNavbar.tsx
• /components/navigation/NavigationTabs.tsx
• /components/navigation/UserMenu.tsx
• /components/navigation/MobileUserMenu.tsx
• /components/auth/LoginForm.tsx
• /components/auth/RegisterForm.tsx
• /app/auth/forgot-password/page.tsx
• /app/auth/forgot-password/verify/page.tsx
• /app/auth/forgot-password/reset/page.tsx
• /app/loading.tsx
• /components/ui/AlertDialog.tsx
• /components/ui/ConfirmDialog.tsx
• /app/home/page.tsx
• /components/home/ContestCard.tsx
• /app/contests/page.tsx
• /app/contests/[contestId]/page.tsx
• /app/contests/[contestId]/team/page.tsx
• /components/SponsorCard.tsx (if present)

Then:
• Run a global search for:
• Regex hex: #[0-9a-fA-F]{6}
• rgb( and rgba(
• For each occurrence not in globals.css or tailwind.config.js, replace using the mapping in 3.1.

⸻

4. Component-Level Rules

The agent must apply these per-component design rules:

4.1 Navigation (all nav components)
• Top navigation background: bg-bg-elevated.
• Active pill/tab:
• Background: bg-bg-card-soft or bg-gradient-brand.
• Text: text-text-main.
• Inactive pill/tab:
• Text: text-text-muted.
• Hover: add hover:bg-bg-card-soft and hover:text-text-main.
• Borders: use border border-border-subtle where borders existed.

4.2 Auth forms
• Card background: bg-bg-card.
• Page background: bg-bg-body.
• Card shadow: shadow-pink-soft.
• Titles: text-text-main.
• Subtext / descriptions: text-text-muted.
• Primary button:
• bg-gradient-button-primary text-text-main shadow-pink-soft.

4.3 Loading screen
• Any inline gold text colour → color: "var(--accent-orange)" or className="text-accent-orange-500".
• Any gold background → "var(--accent-orange-soft)" or bg-accent-orange-soft.
• Any gold glow → filter: "drop-shadow(0 0 18px rgba(200,186,223,0.35))" or shadow-pink-soft.

4.4 Dialogs & buttons
• For buttons that previously used gold gradients:
• Use bg-gradient-button-primary (primary actions).
• Use bg-gradient-button-secondary (secondary actions).
• Update any hardcoded shadow to shadow-pink-soft or shadow-pink-strong.

4.5 Home hero / contest cards
• Page hero background: bg-gradient-hero or bg-bg-body with overlay.
• CTA buttons: bg-gradient-button-primary text-text-main shadow-pink-soft.
• Contest cards:
• Background: bg-bg-card or bg-gradient-card.
• Highlights (e.g., status ribbons): bg-accent-pink-500 or bg-accent-orange-500.
• Text: text-text-main for primary, text-text-muted for secondary.

⸻

5. Acceptance Criteria & Validation

The AI coding agent must ensure: 1. Single source of truth
• All colour literals (hex, rgb, rgba) exist only in:
• /apps/frontend/src/app/globals.css
• /apps/frontend/tailwind.config.js
• Any other occurrence is converted to CSS variable or Tailwind colour class. 2. Class usage
• Backgrounds use bg-\* classes referencing:
• bg-bg-body, bg-bg-card, bg-bg-elevated, bg-gradient-hero, bg-gradient-brand, etc.
• Text colours use text-text-main, text-text-muted, text-text-subtle.
• Borders use border-border-subtle or border-border-strong.
• Shadows use shadow-pink-soft or shadow-pink-strong. 3. Visual checks (automatable via screenshot diff or manual QA)
• Body background is deep purple, not black or gold.
• Navigation and hero sections show purple gradients.
• No gold (#bfab79 / #a89363 / #8c7853) is rendered anywhere.
• Text remains readable (light on dark purple backgrounds).
