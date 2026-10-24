# Contributing

Read CLAUDE.md and relevant docs before changing code. The rulebook is the behavior contract; RULE_DECISIONS.md records unresolved items.

## Standards
- Strict TypeScript, no `any` without justification.
- Engine stays independent of React/browser APIs.
- Stable IDs, typed effects/events, data-driven board and cards.
- Integer taka; explicit logged money transfers.
- No hidden mutations; accessible labels and non-color-only status.
- Fictional setting and characters only.

## Tests
For rule changes test success, boundary values, insufficient cash/invalid actions, and invariants: no negative cash, no double rent recipient, no duplicate cooperative property count, and correct victory transitions.

Run:
```bash
npm run typecheck
npm test
npm run build
```
Report any checks that could not run. Use focused branches and descriptive commits. Never force-push shared branches without approval.
