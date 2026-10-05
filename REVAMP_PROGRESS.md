# Frontend Revamp — Progress

Branch: `feature/forntend-revamp`
Scope: `frontend/` only (backend untouched). `components/dental/ToothModel3D.tsx` and the
dashboard charts (`components/dashboard/DashboardAnalytics.tsx`, `TeethReport.tsx`) are
**intentionally left visually as-is** per the brief — they were only touched where the
global token rename mechanically passed through them (see below), not redesigned.

## Direction

A warm "Clinic Daylight" palette replacing the old cyan/blue-and-purple dental theme —
**no blue, no purple anywhere**. Moss green as the brand voice, terracotta and honey as
companions, warm greige neutrals instead of cold gray, on a linen (off-white) canvas
instead of stark white. New type pairing (Plus Jakarta Sans + Fraunces display serif),
a shared motion system (consistent easings/keyframes), and a from-scratch Tabs component
since "make all the tabs user-friendly" was called out explicitly.

## Done

**Design system foundation**
- `app/globals.css` — full rewrite. New `brand/clay/honey/leaf/brick/ink` color scale;
  every stock Tailwind color name (gray, blue, purple, teal, amber, red, etc.) is
  re-pointed at this palette so no class anywhere can render blue/purple, even ones not
  yet hand-migrated. Legacy tokens (`dental-blue`, `auth-blue`, `primary-*`) kept as
  aliases for safety. New shadow scale (warm-tinted, not gray-black), motion tokens
  (`--ease-smooth`/`--ease-spring`, keyframes for fade/slide/scale/shimmer/float/pulse),
  utility classes (`.hover-lift`, `.press`, `.skeleton`, `.stagger`, `.mask-fade-y`).
  3D tooth CSS block and iOS viewport fix copied through verbatim, untouched.
- `app/layout.tsx` — new font pairing (Plus Jakarta Sans / Fraunces via next/font),
  theme-color meta, richer Toaster styling.
- Global token rename: `dental-blue`→`brand`, `dental-teal`→`brand-400`,
  `dental-purple`→`clay-400`, `dental-lightblue`→`brand-200`, `dental-green`→`leaf-400`,
  `dental-slate`→`ink-500`, `auth-blue*`→`brand-700/900/500`, across 38 files
  (this is why files like `AgentChat.tsx`, `ChangePasswordModal.tsx`, `MonthCalendar.tsx`,
  and the admin pages show as modified even though they weren't redesigned individually).

**Primitives rewritten** (`components/ui/`)
- `button.tsx` — added `accent`/`soft` variants, `xl`/`icon-sm` sizes, consistent focus ring.
- `input.tsx` — shared `fieldClass`, tinted resting state → white-on-focus.
- `StatsCard.tsx` — new `tone` prop (semantic color), accent rail, optional `onClick` + hover-lift, `hint` line. Legacy `iconBgClass`/`iconColorClass` props still work.
- `Badge.tsx` — new `tone` + `dot` props, ring-inset style. Legacy `bgClass`/`textClass` still work.
- `Modal.tsx` — bottom-sheet on mobile / centered dialog on desktop, focus-trap on open, body-scroll lock, optional `description` and pinned `footer`.
- `EmptyState.tsx` — added optional `action` slot (a dead end otherwise).
- `FormField.tsx` — added `required`/`hint`/`error` props.
- `LoadingSpinner.tsx` — accessible (`role=status`), labeled.
- `Avatar.tsx` — initials now tinted per-person (hash of name → one of 5 palette tones) instead of one fixed gradient, so patient lists are scannable; keyboard-operable upload.
- `AdminPageHeader.tsx` — sticky, backdrop-blur, optional `eyebrow`.
- `PatientPageHeader.tsx` — restructured header bar, RTL-aware back arrow.
- `ListToolbar.tsx`, `HeaderSpeedDial.tsx` — recolored to new tone system (the `teal`/`blue` tone *names* are kept as public API since pages already pass them, but now map to clay/honey).
- **New:** `Tabs.tsx` — full ARIA tabs pattern (arrow-key navigation, Home/End, only the active tab in the Tab order), `underline` and `pill` variants, count/dot badges, horizontal-scroll + fade on mobile instead of wrapping. Not yet wired into `medical-records` or `admin/patients` (both still have their own hand-rolled tab markup — see Remaining).
- **New:** `Card.tsx` (`Card`/`CardHeader`/`CardBody`) — the one panel surface, not yet adopted anywhere.
- **New:** `Skeleton.tsx` (`Skeleton`/`SkeletonRows`) — shimmer loading placeholders, not yet wired into any page's loading state.

**`AdminSidebar.tsx` — rebuilt (biggest structural change so far)**
- Desktop rail: collapsible, warm dark `--sidebar` token background, active-item side marker, native `title` tooltips when collapsed (custom tooltip spans were tried first but removed — they'd have clipped against the scrollable nav container).
- **New responsive mobile nav**: a thumb-reachable bottom bar (4 busiest sections + "More") replaces the old behavior of the sidebar just being absent/broken on phones. "More" opens a bottom sheet with the remaining nav items + account actions (change password / logout), since those had nowhere to live on a phone otherwise.
- Footer (user tile, change-password, logout) rebuilt to share the exact grid/padding as the nav items above it — this was the "bottom of the sidebar is a mess" fix (previously it used different spacing/alignment than the nav links, so the column didn't read as one piece).
- `app/globals.css` reserves bottom padding on any page with the mobile nav via `body:has(.admin-mobile-nav)`.
- **Bug found and fixed along the way:** `app/admin/page.tsx` (the dashboard) had its own fully duplicated, hand-copied sidebar inline instead of importing the shared `AdminSidebar` — that's why it had visibly drifted (no avatar block, no change-password, hardcoded "dashboard" active state, no mobile nav). Replaced with the shared component.

## Verified so far
- `npx tsc --noEmit` — clean after every step.
- `npx next build` — full production build passes (all 23 routes), confirms new fonts and CSS compile correctly.

## Not started yet
- Landing page sections: `Services.tsx`, `About.tsx`, `Diplomas.tsx`, `Footer.tsx`, `Navbar.tsx`, `Hero.tsx` — only touched by the mechanical token rename so far, not redesigned/restructured.
- Auth pages: `login`, `admin/login`, `signup`, `set-password`, `complete-profile`, `patient-info`.
- Admin feature pages' own content: `appointments`, `patients` (2929 lines, has its own tab UI to migrate to `Tabs`), `inventory`, `expenses`, `billing`, `payments`.
- `medical-records` page — has its own hand-rolled tab markup to migrate to the new `Tabs` component.
- Patient-facing: `patient-dashboard`, `patient-dashboard/billing`, `book-appointment`.
- `AgentChat.tsx`, `ChangePasswordModal.tsx`, `MonthCalendar.tsx`, `calendar.tsx`, `dropdown-menu.tsx`, `popover.tsx` — currently only token-renamed, not visually revisited.
- Static pages: `privacy-policy`, `terms-of-service`.
- A pass to actually wire the new `Tabs`/`Card`/`Skeleton` components into pages that need them.
- Final full color audit (`grep` for any remaining raw blue/purple/indigo class names that slipped past the rename, and any hardcoded hex in inline styles).
- Visual QA in the running app (`npm run dev`) — everything so far has only been checked via `tsc`/`build`, not looked at in a browser.

## How to resume
Everything is uncommitted on `feature/forntend-revamp` — nothing has been committed yet.
Next natural step is the landing page (`Navbar` → `Hero` → `Services` → `About` →
`Diplomas` → `Footer`), then auth pages, then the admin feature pages one at a time,
wiring in `Tabs`/`Card`/`Skeleton` as each page is touched.
