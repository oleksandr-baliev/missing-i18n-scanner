/* Find HTML elements that contain no child elements (only text/comments).
 * Multi-line safe (uses parse5 with source locations).
 */

import fs from 'node:fs';
import fg from 'fast-glob';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap, Token } from 'parse5';

// ─── parse5 aliases ──────────────────────────────────────────────────────────

type P5Document  = DefaultTreeAdapterMap['document'];
type P5Element   = DefaultTreeAdapterMap['element'];
type P5ChildNode = DefaultTreeAdapterMap['childNode'];
// The union that walk() accepts: document root OR any child node.
type AnyNode = P5Document | P5ChildNode;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface Config {
  knownAttributes: string[];
  files: {
    includeGlobs: string[];
    excludeGlobs: string[];
  };
  parse?: {
    textPreprocess?: {
      removeAngularCode?: boolean;
      cleanupRegexes?: string[];
    };
    excludeRegexes?: string[];
  };
}

export interface Issue {
  tag: string;
  /** Source location as "line:col", or "?" when location data is unavailable. */
  line: string;
  text: string;
  textPreview: string;
  missingText: boolean;
  missingAttributes: boolean;
  foundMissingAttributes: string[];
  allAttributes: string;
}

export interface ScanResult {
  file: string;
  issuesFound: Issue[];
}

export interface FixResult {
  totalFixed: number;
  filesFixed: number;
}

// ─── HTML pre-processing ─────────────────────────────────────────────────────

function expandSelfClosingCustomElements(html: string): string {
  // HTML5 parsers ignore the self-closing slash on custom elements (tags with hyphens).
  // Expand <my-comp attrs /> → <my-comp attrs></my-comp> so parse5 sees them as leaf nodes.
  // The trailing whitespace group is preserved to keep line numbers intact.
  return html.replace(
    /<([a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)+)((?:\s[\s\S]*?)?)(\s*)\/>/g,
    (_, tag: string, attrs: string, trailingWs: string) =>
      `<${tag}${attrs}${trailingWs}></${tag}>`,
  );
}

// ─── Core scanner ─────────────────────────────────────────────────────────────

export async function scanHtml(html: string, cfg: Config): Promise<{ issuesFound: Issue[] }> {
  html = expandSelfClosingCustomElements(html);
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const existingI18nAttributes = cfg.knownAttributes.map(attr => attr.replace(/^i18n-/, ''));

  const issuesFound: Issue[] = [];

  walk(doc, (node) => {
    if (!isElement(node)) return;

    const hasChildElements = (node.childNodes ?? []).some(isElement);
    if (hasChildElements) return;

    const attrs = (node.attrs ?? [])
      .map((a: Token.Attribute) => `${a.name}="${a.value}"`)
      .join(' ');

    let missingText = false;
    let missingAttributes = false;
    const foundMissingAttributes: string[] = [];

    const text = getText(node);
    const processedText = preprocessText(
      text,
      cfg.parse?.textPreprocess?.cleanupRegexes,
      cfg.parse?.textPreprocess?.removeAngularCode,
    );
    if (processedText) {
      if (!hasAttr(node, 'i18n') && !hasAttr(node, 'data-no-i18n')) {
        if (validateText(processedText, cfg.parse?.excludeRegexes)) {
          missingText = true;
        }
      }
    }

    if (node.attrs?.length) {
      for (const attr of node.attrs) {
        if (existingI18nAttributes.includes(attr.name)) {
          if (!hasAttr(node, `data-no-i18n-${attr.name}`) && !hasAttr(node, `i18n-${attr.name}`)) {
            const preprocessedValue = preprocessText(
              attr.value,
              cfg.parse?.textPreprocess?.cleanupRegexes,
              cfg.parse?.textPreprocess?.removeAngularCode,
            );
            if (preprocessedValue && validateText(preprocessedValue, cfg.parse?.excludeRegexes)) {
              missingAttributes = true;
              foundMissingAttributes.push(attr.name);
            }
          }
        }
      }
    }

    if (!missingText && !missingAttributes) return;

    const loc = node.sourceCodeLocation;
    const where = loc ? `${loc.startLine}:${loc.startCol}` : '?';
    const tag = node.tagName ?? '(unknown)';
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);

    issuesFound.push({
      tag,
      line: where,
      text,
      textPreview: preview,
      missingText,
      missingAttributes,
      foundMissingAttributes,
      allAttributes: attrs,
    });
  });

  return { issuesFound };
}

// ─── Attribute auto-detection ────────────────────────────────────────────────

// Scans all HTML files under rootDir (respecting excludeGlobs) and returns a
// sorted, deduplicated list of every i18n-* attribute name found in the source.
export async function detectI18nAttributes(cfg: Pick<Config, 'files'>, rootDir = '.'): Promise<string[]> {
  const files = await fg('**/*.html', {
    cwd: rootDir,
    ignore: cfg.files?.excludeGlobs ?? [],
    dot: true,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: true,
  });

  const pattern = /i18n-[A-Za-z]+/g;
  const found = new Set<string>();

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(pattern)) {
      found.add(match[0]);
    }
  }

  return [...found].sort();
}

// ─── File-level scan ─────────────────────────────────────────────────────────

export async function scan(cfg: Config, rootDir = '.'): Promise<ScanResult[]> {
  const files = await fg(cfg.files.includeGlobs, {
    cwd: rootDir,
    ignore: cfg.files.excludeGlobs,
    dot: true,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: true,
  });

  if (cfg.knownAttributes?.length) {
    console.log(`Existing knownAttributes defined in the configuration: ${cfg.knownAttributes}`);
  } else {
    const i18nAttributes = await detectI18nAttributes(cfg, rootDir);
    console.log(`No Existing knownAttributes defined in the configuration. Automatically detecting existing i18n attributes: ${i18nAttributes}`);
    cfg.knownAttributes = i18nAttributes;
  }

  const scanResults: ScanResult[] = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const result = await scanHtml(html, cfg);
    scanResults.push({ file, issuesFound: result.issuesFound });
  }

  return scanResults;
}

// ─── Fix engine ──────────────────────────────────────────────────────────────

// Converts 1-based line/col to a 0-based character offset in the string.
function lineColToOffset(html: string, line: number, col: number): number {
  let i = 0;
  let currentLine = 1;
  while (i < html.length && currentLine < line) {
    if (html[i] === '\n') currentLine++;
    i++;
  }
  return i + (col - 1);
}

// Scans the opening tag at tagStart and returns the offset just after the end
// of attribute `attrName`'s value (its closing quote), or -1 if not found.
// Attribute names are matched case-insensitively to match parse5 normalisation.
function findAttributeEnd(html: string, tagStart: number, attrName: string): number {
  let i = tagStart + 1; // skip `<`
  while (i < html.length && !/[\s>\/]/.test(html[i])) i++; // skip tag name

  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length || html[i] === '>' || html[i] === '/') break;

    const nameStart = i;
    while (i < html.length && !/[\s=<>"'\/]/.test(html[i])) i++;
    const name = html.slice(nameStart, i).toLowerCase();

    while (i < html.length && /\s/.test(html[i])) i++;

    if (html[i] === '=') {
      i++;
      while (i < html.length && /\s/.test(html[i])) i++;
      if (html[i] === '"' || html[i] === "'") {
        const quote = html[i++];
        while (i < html.length && html[i] !== quote) i++;
        i++;
      } else {
        while (i < html.length && !/[\s>]/.test(html[i])) i++;
      }
    }

    if (name === attrName) return i;
  }
  return -1;
}

// Scans forward from the opening `<` of a tag and returns the offset where
// new attributes should be inserted (just after the last non-whitespace
// character, before any trailing whitespace + `>` or `/>`).
function findTagInsertionPoint(html: string, tagStart: number): number {
  let i = tagStart + 1; // skip `<`
  let inString: string | null = null;
  let lastNonWs = tagStart;

  while (i < html.length) {
    const c = html[i];
    if (inString) {
      if (c === inString) inString = null;
      lastNonWs = i;
    } else if (c === '"' || c === "'") {
      inString = c;
      lastNonWs = i;
    } else if (c === '/' && html[i + 1] === '>') {
      return lastNonWs + 1;
    } else if (c === '>') {
      return lastNonWs + 1;
    } else if (!/\s/.test(c)) {
      lastNonWs = i;
    }
    i++;
  }
  return -1;
}

// Pure function: inserts missing i18n attributes into the source HTML string.
// Works on the original (pre-expansion) HTML; issues must carry line:col from
// the same source so that offsets are correct.
// Each i18n-attr is placed immediately after the attribute it annotates;
// i18n (text content) goes at the end of the opening tag.
// Multiple insertions at the same offset (e.g. attr is last in the tag) are
// merged so that a single splice keeps all sibling i18n attributes together.
export function fixHtml(html: string, issues: Issue[]): string {
  // Map<insertOffset → accumulated insertion text>
  const repairMap = new Map<number, string>();

  const addRepair = (insertAt: number, text: string): void => {
    if (insertAt < 0) return;
    repairMap.set(insertAt, (repairMap.get(insertAt) ?? '') + ` ${text}`);
  };

  for (const issue of issues) {
    const parts = issue.line.split(':').map(Number);
    // Skip issues where location data was unavailable (line === '?').
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
    const [line, col] = parts;

    const tagStart = lineColToOffset(html, line, col);

    for (const attr of issue.foundMissingAttributes ?? []) {
      const afterAttr = findAttributeEnd(html, tagStart, attr);
      addRepair(afterAttr >= 0 ? afterAttr : findTagInsertionPoint(html, tagStart), `i18n-${attr}`);
    }

    if (issue.missingText) {
      addRepair(findTagInsertionPoint(html, tagStart), 'i18n');
    }
  }

  // Apply end-to-start so earlier insertions don't shift later offsets.
  const repairs = [...repairMap.entries()].sort((a, b) => b[0] - a[0]);
  for (const [insertAt, text] of repairs) {
    html = html.slice(0, insertAt) + text + html.slice(insertAt);
  }

  return html;
}

export async function fix(cfg: Config, rootDir = '.', dryRun = false): Promise<FixResult> {
  const scanResults = await scan(cfg, rootDir);
  let totalFixed = 0;
  let filesFixed = 0;

  for (const { file, issuesFound } of scanResults) {
    if (!issuesFound.length) continue;

    const original = fs.readFileSync(file, 'utf8');
    const fixed = fixHtml(original, issuesFound);

    if (fixed === original) continue;

    filesFixed++;
    totalFixed += issuesFound.length;

    if (dryRun) {
      console.log(`[dry-run] Would fix ${issuesFound.length} issue(s) in ${file}`);
    } else {
      fs.writeFileSync(file, fixed, 'utf8');
      console.log(`Fixed ${issuesFound.length} issue(s) in ${file}`);
    }
  }

  return { totalFixed, filesFixed };
}

// ─── Config loader ────────────────────────────────────────────────────────────

export function loadConfig(cfgPath: string): Config {
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(raw) as Config;
  cfg.files ??= { includeGlobs: [], excludeGlobs: [] };
  cfg.knownAttributes ??= [];
  console.log(`Using config: ${JSON.stringify(cfg, null, 2)}`);
  return cfg;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function walk(node: AnyNode, fn: (node: AnyNode) => void): void {
  fn(node);
  if ('childNodes' in node) {
    for (const k of node.childNodes) walk(k, fn);
  }
}

function isElement(node: AnyNode): node is P5Element {
  return 'tagName' in node && typeof (node as P5Element).tagName === 'string';
}

function getText(node: P5Element): string {
  let out = '';
  // Using `any` here to avoid complex parse5 union narrowing for an internal helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack: any[] = [...(node.childNodes ?? [])];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.nodeName === '#text' && typeof n.value === 'string') {
      out += n.value;
    } else if (n.childNodes && !isElement(n)) {
      stack.push(...n.childNodes);
    }
  }
  return out;
}

function hasAttr(node: P5Element, name: string): boolean {
  return (node.attrs ?? []).some((a: Token.Attribute) => a.name === name);
}

function validateText(text: string, excludeRegexes?: string[]): boolean {
  if (!excludeRegexes?.length) return true;
  return !excludeRegexes.some(regex => text.match(regex));
}

type StripMode = 'remove' | 'unwrap';

function stripAngularBlocks(src: string, opts: { mode?: StripMode } = {}): string {
  const directives = ['if', 'else', 'elseif', 'for', 'switch', 'case', 'default', 'defer', 'placeholder', 'loading', 'error'];
  const isWord = (c: string) => /[A-Za-z]/.test(c);
  const mode: StripMode = opts.mode ?? 'remove';

  let out = '';
  let i = 0;

  while (i < src.length) {
    if (src[i] === '@') {
      let j = i + 1;
      let name = '';
      while (j < src.length && isWord(src[j])) { name += src[j++]; }

      if (directives.includes(name)) {
        while (j < src.length && /\s/.test(src[j])) j++;

        if (src[j] === '(') {
          let depthPar = 1; j++;
          while (j < src.length && depthPar > 0) {
            if (src[j] === '(') depthPar++;
            else if (src[j] === ')') depthPar--;
            j++;
          }
          while (j < src.length && /\s/.test(src[j])) j++;
        }

        if (src[j] === '{') {
          const blockStart = j;
          let depthBr = 1; j++;
          while (j < src.length && depthBr > 0) {
            if (src[j] === '{') depthBr++;
            else if (src[j] === '}') depthBr--;
            j++;
          }
          const blockEnd = j;

          if (mode === 'remove') {
            i = blockEnd;
            continue;
          } else {
            out += src.slice(blockStart + 1, blockEnd - 1);
            i = blockEnd;
            continue;
          }
        } else {
          i = j;
          continue;
        }
      }
    }

    out += src[i++];
  }

  return out;
}

function preprocessText(text: string, textCleanupRegexes?: string[], removeAngularCode?: boolean): string {
  let preprocessedText = text;

  if (removeAngularCode) {
    preprocessedText = stripAngularBlocks(preprocessedText);
  }

  for (const regex of textCleanupRegexes ?? []) {
    preprocessedText = preprocessedText.replaceAll(new RegExp(regex, 'g'), '').trim();
  }

  return preprocessedText.trim();
}
