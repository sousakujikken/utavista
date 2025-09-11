# Repository Guidelines

## Project Structure & Module Organization
- `src/main`: Electron main process.
- `src/renderer`: React/Vite UI (components, hooks, stores, templates, engine, styles, assets).
- `src/shared` and `src/types`: cross‑process models and TypeScript types.
- `scripts/`: maintenance and validation utilities.
- `docs/`: architecture and feature docs. `public/`: static assets. `dist/`: build output.

## Build, Test, and Development Commands
- `npm run dev`: start renderer (Vite) + rebuild main (watch).
- `npm run electron`: launch Electron app (run alongside `dev`).
- `npm run build`: production build (renderer + main).
- `npm run lint`: run ESLint checks.
- `npm run validate-parameters`: validate template/parameter registry.
- `npm run template:validate` | `template:analyze`: template integrity and analysis.
- `npm run package` | `package:all`: app packaging via electron-builder.

## Coding Style & Naming Conventions
- Language: TypeScript (React 18). Indent: 2 spaces.
- React components: PascalCase (`FontPickerModal.tsx`). Hooks: `useX` names.
- Variables/functions: camelCase; types/interfaces: PascalCase; enums: PascalCase singular.
- File suffixes: `.tsx` for components, `.ts` for logic/utils. Keep modules focused and small.
- Linting: fix issues to satisfy `npm run lint`; prefer explicit types at module boundaries.

## Testing Guidelines
- No unit test harness is enforced yet. Use validators as CI‑like checks:
  - `npm run lint`, `npm run validate-parameters`, `npm run template:validate` must pass.
- If/when adding tests, prefer `*.spec.ts(x)` colocated next to code or under `__tests__/`.
- Include minimal fixtures in `src/renderer/data/` where appropriate.

## Commit & Pull Request Guidelines
- Prefer Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`; scope optional.
- Messages may be English or Japanese; keep them imperative and concise.
- PRs: clear description, linked issues, steps to verify, and UI screenshots for visible changes.

## Security & Configuration Tips
- Node 18+ required. Do not commit secrets or large media; place runtime assets in `public/` or user dirs.
- Keep `electron-builder.json` and `tsconfig.*.json` changes minimal and documented in PRs.

## Agent-Specific Notes
- Keep patches surgical; avoid unrelated refactors. Follow paths and naming above.
- Do not introduce new dependencies without discussion. Update docs when behavior changes.
