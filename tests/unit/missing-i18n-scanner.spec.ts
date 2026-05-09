import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { scanHtml, fixHtml } from '../../missing-i18n-scanner';
import type { Config } from '../../missing-i18n-scanner';

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '../../missing-i18n-scanner.config.json'), 'utf8')) as Config;

function emptyConfig(): Config {
  return { ...CFG, files: { includeGlobs: [], excludeGlobs: [] } };
}

async function callScanHtml(html: string, cfg: Config = emptyConfig()) {
  return scanHtml(html, cfg);
}

describe('scan()', () => {
  it('i18n missing for the inner text', async () => {
    const res = await callScanHtml('<button class="btn">Save</button>');
    const hit = res.issuesFound.find(i => i.tag === 'button');
    expect(hit?.missingText).toBe(true);
    expect(hit?.missingAttributes).toBe(false);
    expect(hit?.text).toBe('Save');
  });

  it('i18n missing for title attribute', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-title'];
    const res = await callScanHtml('<input title="Username" />', cfg);
    const hit = res.issuesFound.find(i => i.tag === 'input');
    expect(hit?.missingText).toBe(false);
    expect(hit?.missingAttributes).toBe(true);
    expect(hit?.foundMissingAttributes.length).toBe(1);
    expect(hit?.foundMissingAttributes[0]).toBe('title');
  });

  it('Skip i18n for the inner text with data-no-i18n', async () => {
    const res = await callScanHtml('<button class="btn" data-no-i18n>Save</button>');
    const hit = res.issuesFound.find(i => i.tag === 'button');
    expect(hit).toBeUndefined();
  });

  it('Skip i18n for title attribute', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-title'];
    const res = await callScanHtml('<input title="Username" data-no-i18n-title />', cfg);
    const hit = res.issuesFound.find(i => i.tag === 'input');
    expect(hit).toBeUndefined();
  });

  it('Exclude text regexp {{ }}', async () => {
    const cfg = emptyConfig();
    cfg.parse = { excludeRegexes: ['^\\s*\\{\\{[^}]+\\}\\}\\s*$'] };
    const res = await callScanHtml('<button class="btn">{{ Save }}</button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });

  it("Exclude attribute's text regexp {{ }}", async () => {
    const cfg = emptyConfig();
    cfg.parse = { excludeRegexes: ['^\\s*\\{\\{[^}]+\\}\\}\\s*$'] };
    cfg.knownAttributes = ['i18n-title'];
    const res = await callScanHtml('<button title="{{ Save }}"></button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });

  it('Closed tag has no text', async () => {
    const res = await callScanHtml('<button />', emptyConfig());
    expect(res.issuesFound.length).toBe(0);
  });

  it('Text cleanup regexes removes interpolations {{ }}', async () => {
    const cfg = emptyConfig();
    cfg.parse = {
      textPreprocess: { cleanupRegexes: ['\\{\\{[\\s\\S]*?\\}\\}'] },
      excludeRegexes: ['^[\\d\\s]+$'],
    };
    const res = await callScanHtml('<button class="btn">123 {{ Save }} 123 {{ ASSD }} 2131 432 {{ AQWE }} 32</button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });

  it('Text cleanup removes backslash \\', async () => {
    const cfg = emptyConfig();
    cfg.parse = { textPreprocess: { cleanupRegexes: ['[\\\\]*'] } };
    const res = await callScanHtml('<button class="btn"> \\ \\ </button>', cfg);
    expect(res.issuesFound.length).toBe(0);
  });

  it('Removes angular code', async () => {
    const cfg = emptyConfig();
    cfg.parse = { textPreprocess: { removeAngularCode: true } };
    const html = `
    <span>@if (test2 != null) {
      .{{ test2 }}
    }</span>`;
    const res = await callScanHtml(html, cfg);
    console.log(`Result: ${JSON.stringify(res)}`);
    expect(res.issuesFound.length).toBe(0);
  });

  it('Existing i18n attribute should work for text', async () => {
    const res = await callScanHtml('<button i18n>Save</button>');
    const hit = res.issuesFound.find(i => i.tag === 'button');
    expect(hit).toBeUndefined();
  });

  it('Existing i18n-title attribute should work for attribute', async () => {
    const res = await callScanHtml('<input title="Username" i18n-title />');
    const hit = res.issuesFound.find(i => i.tag === 'input');
    expect(hit).toBeUndefined();
  });

  it('Included tag should still consider i18n', async () => {
    const res = await callScanHtml('<a #link i18n><pp-icon name="herunterladen" /> Download</a>');
    expect(res.issuesFound.length).toBe(0);
  });

  describe('self-closing custom elements', () => {
    it('flags missing i18n attribute on self-closing custom element', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const res = await callScanHtml('<pp-text-input label="Enter name" />', cfg);
      const hit = res.issuesFound.find(i => i.tag === 'pp-text-input');
      expect(hit?.missingAttributes).toBe(true);
      expect(hit?.foundMissingAttributes).toContain('label');
    });

    it('does not flag self-closing custom element when i18n attribute is present', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const res = await callScanHtml('<pp-text-input label="Enter name" i18n-label />', cfg);
      const hit = res.issuesFound.find(i => i.tag === 'pp-text-input');
      expect(hit).toBeUndefined();
    });

    it('flags each self-closing custom element independently', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const res = await callScanHtml('<pp-text-input label="First" /><pp-text-input label="Second" />', cfg);
      const hits = res.issuesFound.filter(i => i.tag === 'pp-text-input');
      expect(hits.length).toBe(2);
    });

    it('flags missing i18n attribute on multi-line self-closing custom element', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const res = await callScanHtml('<pp-text-input\n  label="Enter name"\n/>', cfg);
      const hit = res.issuesFound.find(i => i.tag === 'pp-text-input');
      expect(hit?.missingAttributes).toBe(true);
      expect(hit?.foundMissingAttributes).toContain('label');
    });

    it('reports correct start line for a self-closing custom element', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const res = await callScanHtml('<div>\n<pp-text-input label="Enter name" />\n</div>', cfg);
      const hit = res.issuesFound.find(i => i.tag === 'pp-text-input');
      expect(hit?.line).toBe('2:1');
    });

    it('reports correct start line when preceding multi-line self-closing tags would shift line offsets', async () => {
      const cfg = emptyConfig();
      cfg.knownAttributes = ['i18n-label'];
      const html = '<pp-text-input\n  label="First"\n/>\n<pp-text-input label="Second" />';
      const res = await callScanHtml(html, cfg);
      const hits = res.issuesFound.filter(i => i.tag === 'pp-text-input');
      expect(hits.length).toBe(2);
      expect(hits[0].line).toBe('1:1');
      expect(hits[1].line).toBe('4:1');
    });
  });
});

describe('fixHtml()', () => {
  async function issuesFor(html: string, cfg: Config = emptyConfig()) {
    return (await scanHtml(html, cfg)).issuesFound;
  }

  it('adds i18n to element with missing text i18n', async () => {
    const html = '<button class="btn">Save</button>';
    const fixed = fixHtml(html, await issuesFor(html));
    expect(fixed).toBe('<button class="btn" i18n>Save</button>');
  });

  it('adds i18n-title to element with missing attribute i18n', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-title'];
    const html = '<input title="Username" />';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<input title="Username" i18n-title />');
  });

  it('adds i18n-label to self-closing custom element', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-label'];
    const html = '<pp-text-input label="Enter name" />';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<pp-text-input label="Enter name" i18n-label />');
  });

  it('adds i18n-label to multi-line self-closing custom element', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-label'];
    const html = '<pp-text-input\n  label="Enter name"\n/>';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<pp-text-input\n  label="Enter name" i18n-label\n/>');
  });

  it('places i18n-attr right after the attribute it annotates, not at end of tag', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-label'];
    const html = '<pp-text-input label="Enter name" [items]="items" />';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<pp-text-input label="Enter name" i18n-label [items]="items" />');
  });

  it('when attr is last in tag (same offset as end-of-tag), i18n-attr precedes i18n', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-title'];
    const html = '<span title="Tooltip">Content</span>';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<span title="Tooltip" i18n-title i18n>Content</span>');
  });

  it('fixes multiple elements without corrupting offsets', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-label'];
    const html = '<pp-text-input label="First" />\n<pp-text-input label="Second" />';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe('<pp-text-input label="First" i18n-label />\n<pp-text-input label="Second" i18n-label />');
  });

  it('does not modify elements that already have the required i18n attributes', async () => {
    const cfg = emptyConfig();
    cfg.knownAttributes = ['i18n-label'];
    const html = '<pp-text-input label="Enter name" i18n-label />';
    const fixed = fixHtml(html, await issuesFor(html, cfg));
    expect(fixed).toBe(html);
  });
});
