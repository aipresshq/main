# Mobile primary nav row — design

## Problem

On phone and small-tablet widths (≤780px), the primary nav renders as two
stacked, awkward rows: "Latest / Trending / Tutorials" stretched into a
3-column grid with large uneven gaps, then "Categories" alone on a second
full-width row below a divider line. It reads as unfinished and doesn't
match the tightly-spaced, single-row nav the desktop layout already uses.

## Root cause

`src/styles/responsive.css` already has a deliberate, working system that
keeps the nav links inline and progressively compacts them as the viewport
narrows — smaller padding, font-size, and letter-spacing at the 780px,
520px, and 360px breakpoints (see `.section-links a` and `.category-menu >
summary` rules at each of those breakpoints).

That system is broken by a later `@media (max-width: 620px)` block that:

- forces `.section-links` into `display: grid; grid-template-columns:
  repeat(3, minmax(0, 1fr))`, stretching the three links across the full
  row width instead of letting them size to their content, and
- gives `.category-menu` `flex: 1 1 100%` plus a `border-top`, pushing it
  onto its own row beneath a divider.

This is the one place that disagrees with the rest of the breakpoint
system, and it's the direct cause of the layout in the screenshot.

## Design

Remove the grid-stretch and full-row-below rules from the 620px block so
`.section-links` and `.category-menu` fall back to the same inline `flex`
layout the 780px/520px/360px rules already assume. Concretely, in
`src/styles/responsive.css`:

- Delete the `.section-links { display: grid; grid-template-columns:
  repeat(3, minmax(0, 1fr)); flex: 1 1 100%; }` rule inside `@media
  (max-width: 620px)`.
- Delete the `.category-menu { flex: 1 1 100%; padding-left: 0; border-left:
  none; border-top: 1px solid var(--band-ink-muted); }` rule in the same
  block, so Categories stays inline with its existing `border-left`
  divider (the same visual treatment desktop already uses), just with
  tighter padding at narrow widths.
- `.category-menu > summary { height: 40px; justify-content: center; width:
  100%; }` in that block also assumed the full-row layout and should go —
  the 780px/520px rules for `summary` padding/font-size already apply and
  are sufficient once the row isn't force-stretched.
- Trim `.category-menu`'s left padding (currently a fixed 18px + 1px
  border from the base rule, unchanged by any narrow breakpoint) down a
  little further at 520px/360px so it doesn't eat space that's already
  tight once four items share one row.
- `.primary-bar-nav`'s existing `flex-wrap: wrap` (set at the 360px
  breakpoint) remains the fallback if a device is narrower than four
  comfortably-spaced items can fit — no new wrap behavior needs to be
  invented.

Net effect: one clean row — Latest, Trending, Tutorials, Categories▾ —
at every width from 780px down to the smallest supported phone, matching
the desktop nav's visual language instead of introducing a second,
divided row.

## Verification

Check the primary nav at 1440px (desktop, unaffected — confirm no
regression), 768px, 390px, and 360px widths. Confirm all four items sit on
one row without visual crowding or overlap at 390px and 360px, and that
`flex-wrap` produces a reasonable fallback if content still doesn't fit at
an even narrower test width (e.g. 320px).

## Out of scope

- No change to the Categories dropdown panel itself (its content/layout
  when open is unaffected).
- No change to nav behavior above 780px.
- Not a component rework or new interaction pattern (hamburger drawer,
  scroll tabs) — this is a targeted fix to a CSS regression, per the
  chosen "clean single row" direction.
