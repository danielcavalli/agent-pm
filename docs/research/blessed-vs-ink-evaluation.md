# Blessed vs Ink Evaluation

Story: `PM-E069-S002`

## Prototype

- Prototype file: `docs/research/blessed-tree-panel-prototype.cjs`
- Run with: `node docs/research/blessed-tree-panel-prototype.cjs`
- Controls: arrow keys or `j`/`k` to move, `enter` or space to expand/collapse epics, mouse wheel to scroll, click to select, `q` to quit

The prototype renders the current `.pm/` project as a two-pane blessed screen: a tree panel on the left and a detail panel on the right. It uses blessed's native list scrolling, scrollbar support, mouse events, and focusable widgets rather than reimplementing those behaviors by hand.

## Assessment

### Mouse support quality

Blessed is materially better than Ink for raw terminal interaction primitives. List widgets support mouse clicks and wheel scrolling natively, and scrollbars are built in. The prototype needed no terminal escape parsing and no custom coordinate mapping for the tree panel. That directly addresses the pain points behind `PM-E064` and the manual scroll work already present in `src/tui/`.

### Rendering performance

Blessed's documented rendering model is efficient for widget-style TUIs: it maintains a damage buffer and redraws only changed regions. In the prototype, scrolling and expansion stay responsive because selection and content updates are localized to the list and detail widgets. Ink is also fast enough for agent-pm's current update rate, but its updates flow through React reconciliation and custom state glue for interactions that blessed exposes as first-class widgets.

### API ergonomics

Blessed is better for low-level terminal primitives and worse for overall application structure. Building the tree itself was straightforward because `list`, `box`, scrollbars, and mouse hooks already exist. But the code becomes imperative quickly: widget references are mutated in place, selection state must stay in sync with rendered items manually, and layout/state concerns are more tightly coupled than in the existing Ink component model.

### Maintenance risk

A full migration would be expensive and would shift the codebase away from the React/TypeScript patterns already used across the TUI. The current TUI spans multiple panels, hooks, and tests in `src/tui/`; porting that to blessed would mean rewriting component boundaries, input handling, rendering tests, and likely large parts of the design spec. The framework switch would also trade one category of work (missing primitives) for another (imperative widget lifecycle and bespoke state orchestration).

### Community health

- `blessed`: ~11.8k GitHub stars, ~5.6M npm downloads in the last month, package metadata updated 2024-10-22
- `neo-blessed`: ~401 GitHub stars, ~240k npm downloads in the last month, package metadata updated 2022-05-10

Sources:

- `https://github.com/chjj/blessed`
- `https://github.com/embarklabs/neo-blessed`
- `https://api.npmjs.org/downloads/point/last-month/blessed`
- `https://api.npmjs.org/downloads/point/last-month/neo-blessed`

`neo-blessed` is the more actively maintenance-positioned fork in narrative terms, but the observable package activity and adoption signals are weaker than `blessed`. Neither option looks like a strong modern ecosystem bet compared with staying on Ink, which remains the better fit for this codebase's existing architecture.

## Recommendation

Do not migrate the main TUI from Ink to blessed/neo-blessed right now.

Blessed clearly wins on mouse, click, and scroll primitives. But the prototype also shows that adopting it would require a structural rewrite away from a React component tree into imperative widget management. For agent-pm, the better tradeoff is to keep Ink as the primary framework and continue addressing gaps incrementally unless future requirements demand dense click-heavy interaction that Ink cannot reasonably support.

## Migration estimate if revisited later

If the project revisits a framework migration, a realistic first pass is roughly 2-3 engineering weeks for a parity rewrite of the current tree, detail panel, status bar, sidebar, focus model, and live reload behavior, plus test and design-spec updates. A lower-risk path would be:

1. Rebuild only the tree + detail shell in blessed behind a separate entry point
2. Validate mouse-heavy workflows with real users and real agent fleets
3. Port the sidebar and dispatch flows only if the interaction gains are clearly worth the rewrite
4. Remove the Ink TUI only after feature parity and regression coverage exist
