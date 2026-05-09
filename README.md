# missing-i18n-scanner

Scans Angular HTML templates for elements that are missing `i18n` or `i18n-*` attributes, and can automatically insert them.

## Installation

```sh
npm install --save-dev missing-i18n-scanner
```

## Usage

The scanner must be invoked from the **project root** so that glob patterns in the config are resolved relative to the root.

Add these scripts to your project's root `package.json`:

```json
"scan:i18n":     "missing-i18n-scanner --config missing-i18n-scanner.config.json",
"scan:i18n:fix": "missing-i18n-scanner --config missing-i18n-scanner.config.json --fix",
"scan:i18n:dry": "missing-i18n-scanner --config missing-i18n-scanner.config.json --dry-run"
```

Then from the project root:

```sh
npm run scan:i18n        # report all missing i18n attributes
npm run scan:i18n:fix    # insert missing attributes in place
npm run scan:i18n:dry    # preview what --fix would change without writing files
```

## How it works

The scanner parses each HTML file with a full HTML5 parser (parse5), walks the element tree, and flags:

- **Leaf elements** whose text content is not covered by an `i18n` attribute.
- **Any element** whose attribute value (e.g. `label`, `placeholder`) is not covered by the corresponding `i18n-*` attribute.

Text is pre-processed before evaluation — Angular interpolations and control-flow blocks (`@if`, `@for`, …) are stripped, and configurable cleanup regexes remove noise. Elements or attributes suppressed with `data-no-i18n` / `data-no-i18n-<attr>` are ignored.

When `knownAttributes` is empty, the scanner auto-detects which `i18n-*` attributes are already used in the codebase.

## Configuration

Create a `missing-i18n-scanner.config.json` file:

```json
{
  "knownAttributes": [],
  "files": {
    "includeGlobs": ["**/*.html"],
    "excludeGlobs": [
      "**/node_modules/**",
      "**/dist/**",
      "**/.angular/**"
    ]
  },
  "parse": {
    "textPreprocess": {
      "removeAngularCode": true,
      "cleanupRegexes": [
        "\\{\\{[\\s\\S]*?\\}\\}"
      ]
    },
    "excludeRegexes": [
      "^\\s*\\{\\{[^}]+\\}\\}\\s*$",
      "^\\s*[\\p{P}\\p{S}\\p{N}]+\\s*$",
      "^.$"
    ]
  }
}
```

| Option | Description |
|---|---|
| `knownAttributes` | List of `i18n-*` attribute names to check (e.g. `["i18n-label"]`). Leave empty to auto-detect from the codebase. |
| `files.includeGlobs` | Glob patterns for files to scan. |
| `files.excludeGlobs` | Glob patterns for files to skip. |
| `parse.textPreprocess.removeAngularCode` | Strip Angular control-flow blocks before evaluating text. |
| `parse.textPreprocess.cleanupRegexes` | Regexes applied to text before evaluation. Used to remove noise such as interpolations. |
| `parse.excludeRegexes` | If the processed text matches any of these patterns the element is not flagged. Useful for filtering out punctuation-only or number-only strings. |

## Suppressing false positives

Add `data-no-i18n` to skip the text-content check, or `data-no-i18n-<attr>` to skip a specific attribute:

```html
<span data-no-i18n>v1.0.0</span>
<pp-input label="..." data-no-i18n-label />
```

## Contributing

```sh
# Install dependencies
npm install

# Type-check
npm run typecheck

# Run tests
npm test

# Compile to dist/
npm run build
```

When adding or changing regex patterns, add a matching unit or integration test so future changes don't introduce regressions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

## License

MIT
