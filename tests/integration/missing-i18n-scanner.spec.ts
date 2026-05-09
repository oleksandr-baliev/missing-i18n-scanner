import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scan, fix, detectI18nAttributes } from '../../missing-i18n-scanner';
import type { Config } from '../../missing-i18n-scanner';

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '../../missing-i18n-scanner.config.json'), 'utf8')) as Config;

function cfgFor(glob: string): Config {
  return { ...CFG, files: { includeGlobs: [glob], excludeGlobs: [] } };
}

describe('detectI18nAttributes()', () => {
  const FIX = path.join(__dirname, 'fixtures');

  it('finds i18n-* attributes already present in HTML files', async () => {
    const cfg: Pick<Config, 'files'> = { files: { includeGlobs: [], excludeGlobs: [] } };
    const attrs = await detectI18nAttributes(cfg, FIX);
    expect(attrs).toContain('i18n-label');
  });

  it('returns a sorted, deduplicated list', async () => {
    const cfg: Pick<Config, 'files'> = { files: { includeGlobs: [], excludeGlobs: [] } };
    const attrs = await detectI18nAttributes(cfg, FIX);
    expect(attrs).toEqual([...attrs].sort());
    expect(new Set(attrs).size).toBe(attrs.length);
  });

  it('respects excludeGlobs and skips excluded files', async () => {
    const cfg: Pick<Config, 'files'> = { files: { includeGlobs: [], excludeGlobs: ['**/fix-target.component.html'] } };
    const attrs = await detectI18nAttributes(cfg, FIX);
    expect(attrs).not.toContain('i18n-label');
  });
});

describe('scan()', () => {
  const FIX = path.join(__dirname, 'fixtures');

  it('excludes files matched by excludeGlobs', async () => {
    const cfg = cfgFor('**/exclude-file.component.html');
    cfg.files.excludeGlobs.push('**/exclude-file.component.html');
    const res = await scan(cfg, FIX);
    expect(res.length).toBe(0);
  });

  it('text preprocessing cleans up special characters', async () => {
    const cfg = cfgFor('**/text-preprocessing-cleanup.component.html');
    cfg.parse = {
      textPreprocess: {
        cleanupRegexes: ['[\\s➔/\\d\\:()?\\.=-\\[\\]\\-€♥°β%\\|*α±~,+−\\\\]*'],
      },
    };
    const res = await scan(cfg, FIX);
    expect(res[0].issuesFound.length).toBe(0);
  });
});

describe('fix()', () => {
  const FIXTURE_SRC = path.join(__dirname, 'fixtures/fix-target.component.html');
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-fix-test-'));
    tmpFile = path.join(tmpDir, 'fix-target.component.html');
    fs.copyFileSync(FIXTURE_SRC, tmpFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function cfgForFix(): Config {
    return {
      ...CFG,
      knownAttributes: ['i18n-label', 'i18n-placeholder'],
      files: { includeGlobs: ['**/*.html'], excludeGlobs: [] },
    };
  }

  it('dry-run reports issues without modifying the file', async () => {
    const original = fs.readFileSync(tmpFile, 'utf8');
    const { totalFixed, filesFixed } = await fix(cfgForFix(), tmpDir, true);
    expect(totalFixed).toBeGreaterThan(0);
    expect(filesFixed).toBe(1);
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(original);
  });

  it('inserts missing i18n attributes and leaves already-correct attributes untouched', async () => {
    await fix(cfgForFix(), tmpDir, false);
    const result = fs.readFileSync(tmpFile, 'utf8');

    expect(result).toContain('<label i18n>');
    expect(result).toContain('<button class="btn" i18n>');
    expect(result).toContain('i18n-label');
    expect(result).toContain('i18n-placeholder');
    expect(result).toContain('<pp-text-input label="Already fixed" i18n-label />');
  });

  it('produces a file with no remaining issues after fixing', async () => {
    await fix(cfgForFix(), tmpDir, false);
    const rescan = await scan(cfgForFix(), tmpDir);
    const remaining = rescan.flatMap(r => r.issuesFound);
    expect(remaining).toHaveLength(0);
  });
});
