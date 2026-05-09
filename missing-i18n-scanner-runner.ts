#!/usr/bin/env node
/* Runs the scanner with predefined configuration
 *
 * Usage:
 *   node missing-i18n-scanner-runner.js [options]
 *
 * Options:
 *   --config <path>   Path to config JSON file (default: missing-i18n-scanner.config.json)
 *   --fix             Insert missing i18n attributes in place
 *   --dry-run         Preview what --fix would change without writing files
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import { scan, fix, loadConfig } from './missing-i18n-scanner';

const { values: args } = parseArgs({
  options: {
    config:    { type: 'string',  default: 'missing-i18n-scanner.config.json' },
    fix:       { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: false,
});

const doFix  = args['fix'] || args['dry-run'];
const dryRun = args['dry-run'] as boolean;

(async () => {
  const cfg = loadConfig(args['config'] as string);

  if (doFix) {
    const { totalFixed, filesFixed } = await fix(cfg, '.', dryRun);
    console.log('\n --- Results: ---\n');
    if (!totalFixed) {
      console.log('No issues found.');
    } else if (dryRun) {
      console.log(`[dry-run] Would fix ${totalFixed} issue(s) in ${filesFixed} file(s).`);
    } else {
      console.log(`Fixed ${totalFixed} issue(s) in ${filesFixed} file(s).`);
    }
    return;
  }

  const result = await scan(cfg);

  let issuesCount = 0;
  result.forEach(r => { issuesCount += r.issuesFound.length; });

  console.log('\n --- Results: --- \n');

  if (!issuesCount) {
    console.log('No issues found.');
    return;
  }

  for (const resultElement of result) {
    for (const { tag, line, text, missingText, missingAttributes, foundMissingAttributes, allAttributes } of resultElement.issuesFound) {
      console.log(`${path.relative(process.cwd(), resultElement.file)}:${line}`);
      if (missingText) {
        console.log(`[Content] <${tag}> ${text}`);
      }
      if (missingAttributes) {
        console.log(`[Attributes=${foundMissingAttributes}] Attributes: ${allAttributes}`);
      }
    }
  }

  console.log(`Found ${issuesCount} issues.`);

})().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
