# BNBX Foundation Gold X Design

## Goal

Replace both gold shield `F` marks in the BNBX Foundation experience with one reusable, shield-free, three-dimensional metallic gold `X` mark. Keep all copy, layout, shareholder data, links, and behavior unchanged.

## Approved visual direction

- Use a standalone geometric `X`, not an `X` inside a shield.
- Give the mark a metallic gold face with a brighter upper-left highlight and a deeper amber lower-right edge.
- Keep the silhouette bold and open so it remains recognizable in the 42-pixel floating entry.
- Use the same SVG component for the floating entry and the large foundation hero mark.
- Let CSS control only sizing and drop shadows; the SVG owns the shape, gradient, highlight, and accessible presentation.

## Component boundary

Create `apps/web/components/foundation-gold-x.tsx` as a presentational component accepting an optional `className`. It renders a decorative SVG with `aria-hidden="true"` and `focusable="false"`. The existing `FoundationEntry` and foundation page import this component and supply their existing size-specific classes.

## Styling

Remove the shared shield polygon, serif `F`, and shield background styles. Preserve the existing entry position and hero layout. Apply a subtle gold glow and dark drop shadow to the SVG; reduce the shadow on the small entry mark so it stays crisp on mobile.

## Testing and acceptance

- A focused test must fail against the current shield implementation.
- The test must verify both consumers use `FoundationGoldX` and the component exposes a metallic gradient with no shield polygon.
- Existing foundation and full Web tests, lint, typecheck, and production build must pass.
- The Vercel Preview must show the gold `X` in both the fixed entry and `/foundation` hero without changing foundation data or copy.

## Release boundary

Publish only a new feature branch, Draft PR, and Vercel Preview. Do not merge `main` or deploy Production in this change.
