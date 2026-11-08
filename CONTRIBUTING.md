# Contributing to HoldBuddy

Thank you for your interest in contributing to HoldBuddy! We welcome contributions from developers, audio engineers, and open-source enthusiasts.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Getting Started

1. **Prerequisites:**
   - Node.js `>= 22.16.0`
   - npm `>= 10.0.0`
   - Git

2. **Fork and Clone:**
   ```bash
   git clone https://github.com/AkshayAlgoX/HoldBuddy.git
   cd HoldBuddy
   npm install
   ```

3. **Verify Local Environment:**
   Run the full test suite and type check:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
   All 48 tests should pass cleanly without errors.

---

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes following these conventions:
   - Preserve TypeScript strict typing (`npm run typecheck` must pass).
   - Add automated regression tests in `tests/` for any new functionality or bug fix.
   - Do not commit any real API keys, bearer tokens, or personal identifiers.
   - Follow standard semantic commit messages:
     - `feat:` New user-facing feature
     - `fix:` Bug fix
     - `test:` Adding or updating tests
     - `docs:` Documentation improvements
     - `refactor:` Code refactoring without behavior changes
3. Run tests locally before opening a pull request:
   ```bash
   npm test
   npm run build
   ```
4. Push your branch and open a Pull Request against `main`.

---

## Telephony & Audio Contributions

- If adding or updating IVR scenario trees, ensure they are mirrored in `scenarios.json` and covered by `tests/shared-objectives.test.mjs`.
- If modifying audio assets, verify that all WAV files are 16-bit PCM mono at 8kHz or 16kHz and conform to duration constraints via `npm test`.
