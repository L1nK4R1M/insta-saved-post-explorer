# Design system D — Mosaïque

The selected direction combines a dense masonry library with progressive filters
and a contextual detail drawer. The light theme preserves the same hierarchy and
does not merely invert the dark palette.

## Theme behavior

- `system`: follows `prefers-color-scheme` and reacts to OS changes.
- `light`: persistent explicit light preference.
- `dark`: persistent explicit dark preference.
- The preference is stored by `next-themes`; the root class is applied before
  hydration to avoid a visible theme flash.

## Tokens

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | `#070b10` | `#f4f5f7` |
| Raised surface | `#111820` | `#ffffff` |
| Muted surface | `#18212b` | `#eceff3` |
| Border | `#2b3643` | `#d8dde5` |
| Primary text | `#f7f4fb` | `#15121a` |
| Muted text | `#a7b0bc` | `#626977` |
| Accent | `#9b6cff` | `#7447e8` |
| Danger | `#fb7185` | `#dc3454` |

The accent is the only chromatic action color per view. Tag colors may encode
categories but cannot replace labels.

## Geometry and density

- Page gutters: 16 px mobile, 24 px tablet, 32 px desktop.
- Radius: 10 px controls, 14 px cards, 24 px detail surfaces.
- Card gap: 12 px mobile, 14–16 px desktop.
- Header: compact two-level layout on mobile, one panoramic row on desktop.
- Detail: full screen on mobile, contextual right drawer on desktop.
- Filters: bottom sheet/drawer on mobile, anchored panel on desktop.

## Typography and interaction

- System sans stack for fast rendering and robust international text.
- Headings use balanced wrapping; captions use pretty wrapping.
- Counts and dates use tabular numerals.
- Dense card text is clamped; full captions are available in detail.
- Focus uses a 2 px accent ring with sufficient offset.
- Interaction feedback is limited to opacity/transform and at most 200 ms.
- Reduced-motion preferences disable non-essential transitions.

## Accessibility contract

- Every icon-only control has an accessible name.
- Dialogs and destructive confirmations use Radix focus management.
- Active state is communicated by text/icon/shape in addition to color.
- Touch targets are at least 44 px on mobile.
- Filter and detail navigation remain fully keyboard accessible.
