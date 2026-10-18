import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { convertHistory } from './history.ts';
const [input, corrections, outputPrefix] = process.argv.slice(2);
const privatePath = outputPrefix && ['.local', 'exports'].some(root => {
  const path = relative(resolve(root), resolve(outputPrefix));
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
});
if (!input || !corrections || !privatePath)
  throw new Error('Usage: node scripts/migrate-history.ts private-extraction.json private-corrections.json .local/output-prefix');
// Failed reruns must not leave a stale successful import beside the new error report.
rmSync(`${outputPrefix}-import.json`, { force: true });
const result = convertHistory(JSON.parse(readFileSync(input, 'utf8')), JSON.parse(readFileSync(corrections, 'utf8')));
writeFileSync(`${outputPrefix}-report.json`, JSON.stringify(result.report, null, 2));
if (result.report.rejected || result.report.rows.some(r => r.cachedComparison && (r.cachedComparison as { matches?: boolean }).matches === false))
  throw new Error('Review private report: rejected rows or cached-formula discrepancies. Import file was not written.');
writeFileSync(`${outputPrefix}-import.json`, JSON.stringify(result.backup, null, 2));
console.log('Private dry-run report and import file written. No application or cloud records changed.');
