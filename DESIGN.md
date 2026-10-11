# imd/acc website design

## Overview

This is the Sepolia test run 2 app for traders and project integrators.
The interface uses compact monospace text, square frames and black/white
surfaces, following the assignment's imd.fun visual direction. The first
screen identifies the product and offers wallet connection. Connected
balances belong inside the stack section, with figures capped at 18px.

The source of truth is `site/src/style.css`, with shared components in
`site/src/ui.tsx`, the app in `site/src/App.tsx`, listing forms in
`site/src/forms.tsx`, and documentation in `site/src/Docs.tsx`.

## Colors

Use the semantic CSS properties; do not introduce separate component palettes.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#fff` | `#000` | Page, controls and framed sections |
| `--ink` | `#000` | `#fff` | Main text, outlines, focus and primary fill |
| `--dim` | `#555` | `#9a9a9a` | Readable secondary text and hints |
| `--faint` | `#999` | `#666` | Disabled controls only; not readable content |
| `--line` | `#e6e6e6` | `#262626` | Row separators |
| `--hover` | `#f4f4f4` | `#141414` | Hovered rows/controls and code backgrounds |
| `--ok` | `#17804a` | `#3ecf7a` | Text saying a transaction succeeded or vault/listing is open |
| `--alarm` | `#b3261e` | `#ff6b62` | Error text and invalid-input outlines |

Measured from the rendered CSS and actual plain surface colors:

| Foreground/background | Light contrast | Dark contrast |
|---|---:|---:|
| ink / paper | 21.00:1 | 21.00:1 |
| dim / paper | 7.46:1 | 7.46:1 |
| ok / paper | 4.97:1 | 10.41:1 |
| alarm / paper | 6.54:1 | 7.53:1 |
| dim / hover | 6.78:1 | 6.55:1 |
| ok / hover | 4.52:1 | 9.13:1 |
| alarm / hover | 5.94:1 | 6.61:1 |

Readable text pairs meet 4.5:1. Disabled text is deliberately faint and is
not used for balances, descriptions, placeholders or instructions.
Success/error words remain present; color never carries status by itself.

`site/index.html` sets `data-theme` before CSS paints, using a remembered
`imd-acc-theme` choice or the system preference. `Header` toggles and stores
it. System changes are followed until there is an explicit saved choice.
Storage failures do not stop the app.

## Typography

Only IBM Plex Mono is used, self-hosted as Latin WOFF2 files at weights 400,
500 and 600 in `site/public/fonts/`. All three faces were observed loaded in
Chromium. `font-display: swap` keeps content available while fonts load;
the fallback is the system monospace family. Synthetic styles are disabled.

| Token / role | Size | Weight |
|---|---:|---:|
| `--title`, h1 | 22px; 18px below 480px | 600 |
| `--figure`, stack amounts | 18px | 500 |
| `--section`, h2 | 15px | 600 |
| `--body`, body, table cells, inputs | 14px | 400 |
| h3 within a section | 14px | 600 |
| `--secondary`, descriptions and hints | 13px | 400 |
| `--label`, table heads | 11px | 500 |

Body line height is 1.55. Headings and buttons use 1.4. Table heads alone
are uppercase with `.06em` tracking. Text paragraphs, docs content and code
have a maximum measure of 75ch. Code wraps, including long addresses.
Headings balance their lines. There are no text labels above headings.

Open-question project headings and recent-outcome project links use
`overflow-wrap: anywhere`. Outcome links and their `.address` wrappers
allow normal whitespace, so an unbroken 48-character name stays visible
and the row grows naturally. Hexadecimal address displays retain their
compact nonwrapping format elsewhere.

Numbers use tabular figures. Amounts display four decimal places using
integer token arithmetic, with truncation for display. Numeric table
columns align right. Addresses display `0x1234...abcd`; links expose their
full value through the accessible name/title and copy controls copy it whole.

## Layout

The outer `.container` and `.topbar-inner` are at most 1168px including
68px of desktop gutters, leaving at most 1100px of content. Inline gutters
are `clamp(16px, 4vw, 34px)`. Sections have 16px padding, reduced to 12px
below 480px. Main gaps are 20px, reduced to 16px at that breakpoint.
Form label/control gaps are 6px; fields have 16px group spacing. Subheadings
have 24px above and 8px below.

The app DOM order is stack, projects, apply/challenge plus questions,
leaderboards, test tools, contracts. At 860px, CSS places Test tools beside
Your stack and the listing form beside Open questions. Frames align at the
top and keep their natural height. Leaderboards use two columns there too.
Below 860px, everything follows the single-column DOM order.

The top bar is sticky, with a 64px control row on desktop and a 54px row
below 600px. Below 600px the Sepolia text disappears, navigation text is
13px and controls are 32px. At 360px the brand, App, Docs, theme icon and
Connect stay on one row. Wallet messages live below the sticky bar so they
do not enlarge it. An extra compact address-button rule handles widths
below 360px while preserving the 16px gutter.

Docs use a 190px contents column and 40px gap from 860px; that contents
column sticks at 88px. Below 860px, contents sits above the text and its
links wrap naturally. Hash links scroll/focus the selected section with
space for the sticky header.

Wide tables scroll inside focusable `.table-scroll` regions. Project and
recent-stack tables have minimum widths of 880px and 640px. The page itself
must not scroll horizontally. The build was inspected at 360, 390, 768 and
1280px; further reflow coverage and limits are in the validation record.

## Elevation and depth

This is a flat interface: no shadows, blur, gradients, glow or decorative
backgrounds. Section frames, controls and the header rule use 1.5px ink
borders. Table rows and subordinate dividers use 1px line borders. Code
blocks use the hover surface without another nested frame.

The top bar uses z-index 20. The skip link uses z-index 100. The wallet
chooser is a native modal dialog with a plain translucent black backdrop;
native dialog behavior contains keyboard focus and restores it on close.

## Shapes

Controls, frames, inputs, code areas and the wallet dialog are square.
There are no pills, badges, side stripes, nested cards or repeated metric
card grids. The small theme icon is a currentColor SVG with 1.5px strokes.

## Components

- `Frame` (`ui.tsx`) supplies a section, associated h2 and optional heading
  action. Its heading is a programmatic focus destination. Keep only one
  frame around a section; use spacing and row rules inside it.
- Native buttons default to a 40px minimum height, 1.5px ink border and
  13px inline padding. `.small` is 32px, `.primary` is ink-filled with paper
  text. Hover, focus, disabled, pending, success and error states remain
  readable. A 2px ink focus outline has a 4px offset.
- `ListingForms` uses keyboard-accessible Apply/Challenge tabs with arrow,
  Home and End keys. Forms have explicit labels, hints, inline errors,
  focus on the first invalid field, live fee quotes and separate actions.
  The numbered Apply list is the only UI step numbering.
- `TxStatus` is a persistent polite live region beside the action. Pending
  labels explain whether the app is checking, awaiting the wallet or
  waiting for confirmation. Success and pending-after-send states link to
  the transaction. Errors explain cancellation or contract constraints.
- `Address` supplies an explorer link with the full accessible address.
  `Copy` copies the full value and changes its visible and accessible label
  on success or failure. `CodeBlock` gives every code sample a copy button.
- `Table` provides a named, focusable scroll region. Use semantic th/td
  elements, sentence-case source text, and `.num` for number columns.
- `DataMessage` gives loading/error/retry states; empty states say what
  belongs in the section and the next useful action. A failed refresh marks
  the previous snapshot stale and disables writes.

Only color and background-color transition, at .15s, and only under
`prefers-reduced-motion: no-preference`. No entrance animation, layout
movement, scale animation, bouncing, blinking or pulsing is used.

## Do and don't

Reuse the six-size scale, semantic colors, `Frame`, `Table`, `Address`,
`CodeBlock` and `TxStatus`. Keep a single h1 followed by h2 sections and h3
subsections. Put wallet requirements and feedback beside the action, and
keep the distinction between the staking token and oracle payment token.

Do not add a hero, oversized figures, extra card layers, ornamental badges,
new font families, gradients or decorative motion. Do not use faint or line
colors for content. Keep the full address available when shortening it.

For a new page, keep the shared Header, add a hash route, place content in
`.container`, reuse the heading hierarchy, and check both themes and the
360px layout before exporting. The source must stay aligned with the
committed `dist/` output.

The review method and retained licenses are described in
`site/THIRD-PARTY-NOTICES.md` and `site/DESIGN-LICENSE`.
