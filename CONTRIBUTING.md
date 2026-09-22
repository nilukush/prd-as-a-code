# Contributing to PRD-as-Code

Thanks for your interest in contributing.

## Development setup

```bash
git clone <repo>
cd prd-as-a-code
npm install
npm test
```

Requirements: Node.js 18 or newer to run the CLI. Node.js 20.12 or newer to
develop and run the test suite (Vitest 5 requires it).

## How to contribute

1. Open an issue describing the bug or feature before writing code.
2. Fork or branch from `main`.
3. Follow test-driven development: write a failing test first, then the minimal change that makes it pass, then refactor. Pull requests without tests are not merged.
4. Make sure the full suite passes: `npm test`.
5. Send a pull request with a short description that links the issue.

## Engineering rules

- Every requirement in this repo is written as a PRD under `sample/` style structures when it changes product behavior.
- Exit codes are API: errors exit 1, warnings exit 0. Do not change exit-code behavior without an issue.
- Stable requirement IDs (FR-xx, NFR-xx) are never positional and never silently removed.
- All HTML output must escape interpolated values.
- No new runtime dependencies without an issue discussing the tradeoff.

## Commit style

Use Conventional Commits: `fix:`, `feat:`, `test:`, `docs:`, `refactor:`. Keep the subject line under 72 characters.

## License

By contributing you agree your contributions are licensed under the MIT License.
