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
