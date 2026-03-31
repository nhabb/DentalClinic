# Browser Compatibility

BrightSmile Dental SaaS is tested and supported on the following browsers.

## Supported Browsers

| Browser    | Minimum Version | Notes                                                    |
|------------|----------------|----------------------------------------------------------|
| Chrome     | 111+           | Full support                                             |
| Brave      | Latest         | Full support (Chromium-based; same profile as Chrome)    |
| Firefox    | 113+           | Full support; see limitations below                      |
| Firefox ESR| Current ESR    | Full support                                             |
| Edge       | 111+           | Full support (Chromium-based); see notes below           |
| Safari     | 15.4+          | Full support; see limitations below                      |
| iOS Safari | 15.4+          | Full support; see limitations below                      |

---

## Known Limitations

### Brave

Brave is built on Chromium and uses the same Blink rendering engine and V8 JavaScript engine as Chrome. It has no compatibility differences from Chrome for this application.

**Note on Brave Shields:** Brave's built-in ad/tracker blocker (Shields) may block requests to third-party services such as Supabase analytics or OAuth redirect calls if users have Shields set to aggressive mode. The app's core functionality (authentication, patient data, appointments) is unaffected because all API calls go to first-party endpoints.

---

### Safari / iOS Safari

#### Private Browsing — localStorage unavailable
**Impact:** Login state and session data cannot be persisted.
**Behaviour:** The app remains functional but will not remember the signed-in user after a page reload. All `localStorage` access is wrapped in `safeStorage` (`lib/browser-compat.ts`) which silences the `SecurityError` Safari throws in Private Browsing mode rather than crashing.
**Workaround:** Use a normal (non-private) browsing session to retain session data.

#### Viewport height (`100vh`) on mobile
**Impact:** On iPhone/iPad, `100vh` includes the collapsible browser chrome, which can partially hide full-screen sections.
**Fix applied:** `globals.css` uses `-webkit-fill-available` inside `@supports (-webkit-touch-callout: none)` to override `min-h-screen` so content fills only the visible viewport.

#### CSS `oklch()` colour space
**Impact:** Safari < 15.4 does not support `oklch()`.
**Fix applied:** All design tokens in `globals.css` are declared twice — first as HSL values (universally supported), then as `oklch()` values inside `@supports (color: oklch(0 0 0))`. Older Safari automatically uses the HSL fallbacks.

#### 3-D CSS transforms (`perspective`, `transform-style`)
**Impact:** Older Safari releases shipped `perspective` and `transform-style` behind the `-webkit-` vendor prefix.
**Fix applied:** All 3-D animation styles in `globals.css` include both `-webkit-` prefixed and unprefixed declarations.

---

### Firefox

#### `en-LB` locale in `Intl.NumberFormat`
**Impact:** Some Firefox builds ship without locale data for `en-LB` (English/Lebanon) and throw a `RangeError`.
**Fix applied:** `formatCurrencyLBP()` in `lib/browser-compat.ts` tries `en-LB` first, falls back to `en`, then falls back to `Number.prototype.toLocaleString()` which every browser supports. All currency-formatting calls across the app use this helper.

---

### Edge

Edge 111+ is Chromium-based and shares Chrome's compatibility profile. No additional limitations have been identified.

---

## Implementation Reference

| Utility                         | File                    | Purpose                                                           |
|---------------------------------|-------------------------|-------------------------------------------------------------------|
| `safeStorage`                   | `lib/browser-compat.ts` | Safe `localStorage` wrapper (Safari Private Browsing)             |
| `formatCurrencyLBP`             | `lib/browser-compat.ts` | Cross-browser LBP currency formatter                              |
| Vendor-prefixed 3-D CSS         | `app/globals.css`       | `-webkit-perspective`, `-webkit-transform-style`, `-webkit-animation` |
| `oklch()` with HSL fallbacks    | `app/globals.css`       | Design tokens for browsers without oklch support                  |
| iOS viewport fix                | `app/globals.css`       | `-webkit-fill-available` for `min-h-screen`                       |
| iOS momentum scroll             | `app/globals.css`       | `-webkit-overflow-scrolling: touch`                               |
| `text-wrap: balance` fallback   | `app/globals.css`       | `word-break`/`overflow-wrap` fallback for older browsers          |
| Reduced-motion support          | `app/globals.css`       | `@media (prefers-reduced-motion: reduce)` disables animations     |
| Autoprefixer                    | `postcss.config.mjs`    | Auto-injects vendor prefixes for Safari, Firefox, Edge, Chrome    |
| Browserslist                    | `package.json`          | Targets Chrome, Firefox, Safari, Edge, Brave (via Chrome)         |
