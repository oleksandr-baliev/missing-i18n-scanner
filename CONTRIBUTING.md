# Contributing

Contributions are welcome — bug reports, feature requests, and pull requests alike.

## Getting started

```sh
git clone <repo-url>
cd missing-i18n-scanner
npm install
npm run build
```

## Development workflow

```sh
npm run typecheck   # type-check without emitting
npm test            # run tests once
npm run test:watch  # run tests in watch mode
npm run build       # compile TypeScript → dist/
```

The source is TypeScript (`missing-i18n-scanner.ts`, `missing-i18n-scanner-runner.ts`). The compiled output in `dist/` is what actually runs — remember to rebuild after changes before testing the CLI manually.

## Running the scanner manually

The scanner must be invoked from the **project root** so that glob patterns in the config resolve correctly:

```sh
node dist/missing-i18n-scanner-runner.js --config missing-i18n-scanner.config.json
node dist/missing-i18n-scanner-runner.js --config missing-i18n-scanner.config.json --fix
node dist/missing-i18n-scanner-runner.js --config missing-i18n-scanner.config.json --dry-run
```

When embedded in a host project, the host's root `package.json` should call the runner from there (see README).

## Test suite

```
tests/
  unit/                   # pure function tests, no file I/O
  integration/            # tests that read/write real fixture files
    fixtures/             # HTML files used by integration tests
```

- **Unit tests** cover `scanHtml`, `fixHtml`, and preprocessing helpers in isolation. Run them frequently.
- **Integration tests** cover `scan`, `fix`, and `detectI18nAttributes` end-to-end against fixture files. They write to a temp directory so the fixtures themselves are never modified.

## Guidelines

**Tests are required.** Every bug fix should come with a regression test; every new feature should cover the happy path and relevant edge cases. If you change a regex pattern, add a matching test.

**Keep the fix safe.** The `--fix` mode writes to source files. Any change to `fixHtml` or the insertion-point logic must be accompanied by tests that verify the exact output string, not just that something changed.

**One concern per PR.** Separate scanner logic changes from CLI changes from config changes. Smaller PRs are easier to review and less likely to introduce regressions.

**No new runtime dependencies** without discussion first. The only runtime dependencies are `fast-glob` and `parse5` — keep it that way unless there is a compelling reason.

## Project structure

```
missing-i18n-scanner.ts          # core library (scan, fix, detect, helpers)
missing-i18n-scanner-runner.ts   # CLI entry point
missing-i18n-scanner.config.json # example configuration
tsconfig.json                    # full tsconfig (includes tests)
tsconfig.build.json              # build-only tsconfig (excludes tests)
dist/                            # compiled output (git-ignored)
tests/
  unit/
  integration/
    fixtures/
```

## Reporting issues

Please include:
- Node.js version (`node --version`)
- A minimal HTML snippet that reproduces the problem
- The config you are using
- Expected vs. actual output
