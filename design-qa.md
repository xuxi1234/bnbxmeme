# Mobile layout design QA

- Source visual truth: `/workspace/scratch/f7eee4e092ac/upload/479f825a-d534-4f3c-9c82-b3a78982274e.png`, `/workspace/scratch/f7eee4e092ac/upload/4e5aba49-e883-4173-8148-8e5b3ced1916.png`, `/workspace/scratch/f7eee4e092ac/upload/914389a6-f80e-42ad-b635-fa5cbdc757fd.jpg`, and `/workspace/scratch/f7eee4e092ac/upload/55528683-1ed8-4ab2-a478-d052d549a102.jpg`
- Browser-rendered implementation: `/workspace/scratch/bnbx-pr98-mobile-home-390.png`, `/workspace/scratch/bnbx-pr98-mobile-menu-390.png`, `/workspace/scratch/bnbx-pr98-mobile-token-390.png`, `/workspace/scratch/bnbx-pr98-mobile-trade-390.png`, and `/workspace/scratch/bnbx-pr98-mobile-discussion-expanded-390.png`
- Combined comparisons: `/workspace/scratch/bnbx-pr98-menu-comparison.jpg`, `/workspace/scratch/bnbx-pr98-home-comparison.jpg`, `/workspace/scratch/bnbx-pr98-token-comparison.jpg`, and `/workspace/scratch/bnbx-pr98-dock-comparison.jpg`
- Preview: `https://bnbx-git-fix-mobile-layout-simpl-207285-xuxis-projects-7df64997.vercel.app`
- Source pixels: 509 × 1089, 921 × 2048, 181 × 2048, and 176 × 2048
- Implementation viewports: 390 × 844 and 430 × 932 CSS pixels at device scale factor 1
- State: dark theme, Chinese locale, public market, advanced-template 9527 token detail, and no wallet connected
- Renderer normalization: the isolated Chromium runtime lacked CJK system fonts, so the QA runner injected Noto Sans SC/KR only for screenshots. Repository code and Preview assets were not changed.

## Full-view comparison evidence

The source and implementation were inspected side by side at phone width. The implementation keeps the BNBX dark visual system while materially reducing vertical density: market cards are 164px high, show three primary metrics, and omit the redundant mobile footer. Both tested viewports have document width equal to viewport width and no horizontal page overflow.

The token detail now follows the requested mobile hierarchy: primary trade action, chart, on-chain activity, safety, then community discussion. The page contains one inline trade panel and zero `.mobile-trade-dock` elements, eliminating the duplicated fixed Buy/Sell controls shown in the source capture.

## Focused-region comparison evidence

- Mobile menu: 300px wide, fully inside both viewports, five 40px navigation rows, four 36px language controls, an explicit close button, and body scroll lock while open.
- Market cards: 10 cards render at 164px each with three visible metrics and no card footer.
- Token metrics and project links: horizontal rails prevent multi-row wrapping without creating document overflow.
- Advanced template: the 9527 token at `0x38867a96255521950bb337cf209e5c78ed1d1111` renders one advanced tax card; it is collapsed by default and changes to `display: grid` after the mobile expansion control is clicked.
- Discussion: the form is hidden by default on mobile and changes to `display: grid` after its expansion control is clicked.

## Findings

No actionable P0, P1, or P2 mobile-layout defects remain in the compared surfaces.

Non-layout Preview observations: the disabled Vercel Web Analytics script returns 404, and the Preview comments endpoint returns 503. Neither response causes a page exception or layout failure, and neither endpoint is modified by this change. The production comments endpoint must be checked after deployment.

## Comparison history

1. Source findings: duplicated fixed Buy/Sell dock, discussion before primary trade content, oversized mobile menu controls, vertically dense project cards, and fully expanded secondary token details.
2. Fixes made: removed the dock, reordered trade/chart/activity/safety/discussion, compacted menu and market cards, changed metrics and links to horizontal rails, and added mobile expansion controls for advanced details and discussion.
3. First post-fix pass: desktop Preview and source assertions passed, but same-viewport mobile evidence was unavailable.
4. Final post-fix pass: real Chromium screenshots and clicks at 390 × 844 and 430 × 932 confirmed layout, overflow, menu bounds, control counts, section order, and expansion behavior.

## Primary interactions tested

- Opened and closed the mobile menu.
- Confirmed body scrolling is locked while the menu is open.
- Loaded all 10 market cards at both phone widths.
- Loaded standard and advanced-template token details.
- Expanded the advanced template detail card.
- Expanded the community discussion form.
- Confirmed one inline trade panel and zero fixed trade docks.
- Confirmed no document-level horizontal overflow.

final result: passed

# BNBX V3 design QA

- Preview: `https://bnbx-git-agent-token-template-v3-e12dc2-xuxis-projects-7df64997.vercel.app`
- Reviewed commit: `a844eb4e63e0c690bd195bf68ad48d13c7634b83`
- Browser viewport: 1363 × 936; the template comparison used a centered
  1110 × 775 crop to match the supplied 1110 × 775 reference.
- Supplied references:
  - `upload/0b660cfc-ce4c-4d5a-a25e-a6547bd30b04.png`
  - `upload/e82741c4-4bb9-45c2-9853-9cce54bb532c.png`
  - the supplied mobile market and token-page screenshots.
- Local comparison artifacts:
  - `artifacts/create-reference-vs-preview.jpg`
  - `artifacts/tax-reference-vs-preview.jpg`

## Browser checks

- The creation page exposes exactly Standard 0-tax, Holder rewards, and LP
  rewards. The standalone Auto Liquidity template is absent.
- A locked V3 template can be selected for inspection, while the creation
  action stays disabled until a distinct V3 Factory address is configured.
- Holder and LP templates each render eight numeric tax inputs: burn,
  automatic liquidity, marketing, and rewards for both buys and sells.
- The tax section contains no range input. Its only remaining range input is
  the separate graduation-target control.
- Numeric tax inputs preserve `0`, `0.5`, `1`, and `2.25` exactly.
- A 10.01% side total renders the explicit over-limit error. An exact 10.00%
  total is accepted and shown as `10.00% / 10%`.
- Switching Holder → LP → Standard preserves the correct selected state and
  hides advanced tax fields for Standard.
- The inspected graduated token renders the price unit as `cz / USDT`.
- Its two PancakeSwap trade actions are ordinary in-flow links; the page has
  no fixed-position element and no mobile/floating trade dock.
- Automated mobile-layout regression checks confirm the compact navigation,
  inline trade flow, and absence of the removed floating trade bar.

## Visual comparison

- The template reference requested removal of Auto Liquidity. The Preview has
  three equal cards in one row and retains the existing BNBX visual system.
- The tax reference used sliders. The Preview replaces all eight sliders with
  direct-entry percentage controls, keeps the live side totals, and adds the
  reward-token, marketing-wallet, and minimum-share fields immediately below.
- No cropped field labels, overlapping cards, or horizontal page overflow were
  observed in the inspected states.

final result: passed
