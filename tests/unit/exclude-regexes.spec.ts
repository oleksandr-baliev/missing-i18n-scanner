import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { scanHtml } from '../../missing-i18n-scanner';
import type { Config } from '../../missing-i18n-scanner';

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '../../missing-i18n-scanner.config.json'), 'utf8')) as Config;

function emptyConfig(): Config {
  return { ...CFG, files: { includeGlobs: [], excludeGlobs: [] } };
}

describe('excludeRegexes', () => {
  it('removes cm in the text', async () => {
    const cfg = emptyConfig();
    cfg.parse = { excludeRegexes: ['^\\s*cm\\s*$'] };
    const res = await scanHtml('<button>cm</button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });

  it('removes " cm / qm" with preprocessing cleanup', async () => {
    const cfg = emptyConfig();
    cfg.parse = {
      textPreprocess: {
        cleanupRegexes: ['[\\s➔/\\d\\:()?\\.=-\\[\\]\\-€♥°β%\\|*α±~,+−]'],
      },
      excludeRegexes: ['^\\s*(?:cm|qm)*\\s*$'],
    };
    const res = await scanHtml('<button> cm / qm </button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });
});
