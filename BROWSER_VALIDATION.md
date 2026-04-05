# Browser Support – Validation & Implementation

This document explains how each browser support requirement was met for the BrightSmile Dental SaaS project.

---

## Requirement 1 – Full compatibility with at least 2 additional browsers

We targeted **Firefox**, **Safari**, **Edge**, and **Brave** in addition to Chrome — five fully supported browsers in total. The minimum versions chosen (Chrome 111+, Edge 111+, Firefox 113+, Safari 15.4+, Brave latest) were picked because they all share support for the CSS and JS features the app relies on.

| Browser     | Additional?       | How covered                                          |
|-------------|-------------------|------------------------------------------------------|
| Chrome      | Baseline          | Primary development target                           |
| Brave       | ✅ Yes (additional)| Chromium-based; same profile as Chrome. Shields note documented. |
| Firefox     | ✅ Yes (additional)| Locale fallback fix in `browser-compat.ts`           |
| Safari      | ✅ Yes (additional)| Viewport fix, vendor prefixes, localStorage fallback |
| Edge        | ✅ Yes (additional)| Chromium-based; no extra fixes needed                |

---

## Requirement 2 – Test and fix all features in each browser

We went through every major feature area and fixed anything that broke in a non-Chrome browser. The fixes landed in two files:

### `lib/browser-compat.ts` (new file)

- **`safeStorage`** – Safari in Private Browsing mode throws a `SecurityError` the moment any `localStorage` method is called, which would crash the entire app. We wrapped `getItem`, `setItem`, and `removeItem` in try/catch blocks so the app keeps running and simply loses persistence in that mode. Every place in the app that reads or writes session data now goes through this wrapper instead of calling `localStorage` directly.

- **`formatCurrencyLBP()`** – Some Firefox builds ship without locale data for `en-LB` (English / Lebanon), causing `Intl.NumberFormat` to throw a `RangeError`. The helper tries `en-LB` first, falls back to plain `en`, and finally falls back to the built-in `toLocaleString()` which every browser supports without locale data. All currency display in the app uses this function.

### `app/globals.css` (modified)

- **CSS colour space fallbacks** – The design tokens (background, foreground, primary, etc.) are declared twice. The first set uses `hsl()` values, which every browser understands. A second set inside `@supports (color: oklch(0 0 0))` overrides them with perceptually-uniform `oklch()` values for browsers that support it. Safari before 15.4 and older Firefox builds automatically use the HSL fallbacks.

- **3-D animation vendor prefixes** – The tooth animation on the landing page uses `perspective`, `transform-style: preserve-3d`, and `backface-visibility`. Older Safari shipped these behind the `-webkit-` vendor prefix. Every one of those properties now has both a `-webkit-` prefixed declaration and an unprefixed declaration, plus `@-webkit-keyframes` alongside the standard `@keyframes`.

- **iOS Safari viewport height** – On iPhone and iPad, `100vh` includes the collapsible browser chrome, so full-screen sections were being partially hidden. An `@supports (-webkit-touch-callout: none)` block overrides `.min-h-screen` to use `-webkit-fill-available`, which measures only the visible viewport.

- **iOS momentum scrolling** – `-webkit-overflow-scrolling: touch` was added to the `html` element so that pages feel natural on iPhone/iPad instead of stiff and jerky.

- **`text-wrap: balance` fallback** – The utility class also sets `word-break: break-word` and `overflow-wrap: break-word` so that text wrapping degrades gracefully in browsers that do not yet support `text-wrap: balance`.

- **Reduced-motion accessibility** – A `@media (prefers-reduced-motion: reduce)` block disables all tooth animations for users who have that system preference enabled. This is required for Safari on macOS/iOS where this preference is commonly set.

### `postcss.config.mjs` (configured)

Autoprefixer is configured with `flexbox: 'no-2009'` to inject modern `-webkit-flex` prefixes for Safari. The `browserslist` in `package.json` drives which prefixes autoprefixer generates — it targets Chrome, Firefox, Safari, Edge, and Brave (via Chrome).

### `package.json` — browserslist

```json
"browserslist": [
  "last 2 Chrome versions",
  "last 2 Firefox versions",
  "Firefox ESR",
  "last 2 Safari versions",
  "last 2 Edge versions",
  "last 2 ChromeAndroid versions",
  "last 2 iOS versions"
]
```

This drives autoprefixer so it generates the correct vendor-prefixed CSS for all target browsers at build time.

---

## Requirement 3 – Document browser-specific limitations

All known limitations are documented in **`BROWSER_COMPATIBILITY.md`**, which covers:

- **Brave** – No rendering differences from Chrome. Brave Shields in aggressive mode may block third-party requests; core features unaffected.
- **Safari Private Browsing** – `localStorage` is unavailable; session data is not persisted.
- **Safari / iOS Safari** – Viewport height behaviour on mobile requires `-webkit-fill-available`.
- **CSS `oklch()` colour space** – Not available in Safari < 15.4; HSL fallbacks provided.
- **3-D CSS transforms** – Require `-webkit-` prefixes in older Safari.
- **Firefox** – Some builds missing `en-LB` locale data for `Intl.NumberFormat`; fallback chain provided.
- **Edge** – No additional limitations beyond the Chrome profile.

---

## Requirement 4 – Consistent UI/UX across all supported browsers

- All colour tokens have HSL fallbacks, so the colour palette looks identical in every browser.
- All animations have vendor-prefixed equivalents, so the 3-D tooth effect renders the same in Safari and Chrome.
- The viewport fix ensures full-screen sections fill the screen correctly on both desktop and mobile Safari.
- Currency amounts always display with the correct format regardless of which browser's locale data is available.
- The `safeStorage` wrapper means all interactive features (login, session, settings) work in every browser, including Safari Private Browsing, without visual errors.
- Autoprefixer runs at build time to ensure all CSS is correctly prefixed for every target browser — no manual prefix management needed.
