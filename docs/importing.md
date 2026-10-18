# Historical migration and JSON recovery

## Restore a JSON backup

Open Statistics / Settings → Import JSON backup and choose a PlugTime schema-version-2 export. This works offline. Review the counts and expand **Review records**, then choose **Add missing records**. A pre-import JSON download is prepared automatically; save it independently. Sessions, pending changes, conflicts and eligible defaults commit in one IndexedDB transaction. Storage failure rolls back the whole import.

This is an additive recovery operation:

- Missing IDs are added. Identical existing records are skipped. Differing existing records, edits and deletion tombstones are kept and reported as blocked.
- Matching start times under another ID are blocked for manual review, including deleted records and earlier rows in the same file. A second active charge is also blocked.
- Pending mutations and uncertain upload envelopes retain their original IDs for receipt replay. Saved conflicts remain blocked until explicitly resolved in Cloud backup.
- Missing records without pending mutations are queued for a cloud revision check using their backed-up server revision. Newer cloud edits/deletions create conflicts. Recovery onto an empty replacement backend may require **Keep this device’s version** for each record. Restoring a clean copy can advance its cloud revision even when its contents match.
- Imported tombstones remain deletions and are queued too. Local/cloud data, receipts and conflicts are never cleared.
- Defaults are restored only when there are no local sessions/pending changes and no explicitly saved defaults. Every session keeps its own assumptions.

The old device's sync lease is never restored. Changes after review or an active sync lease prevent writes and request a new review. Unsupported schemas, malformed records, duplicate IDs and inconsistent pending snapshots/envelopes reject the complete file. The UI accepts files up to 10 MB.

After import, inspect Cloud backup and choose **Sync now** when authenticated. Resolve conflicts deliberately. Keep blocked copies in the original backup for comparison. Repeat imports add no duplicate IDs. Export JSON again after recovery. CSV cannot restore pending changes, conflicts or deletions.

## Convert a historical workbook locally

The public scripts contain no personal records. Use Node 24+ and Python 3 (bundled Python works without additional packages). Keep sources in ignored `reference/` and generated files in ignored `.local/` or `exports/`. Never place them in `public/`, `dist/` or fixtures.

```sh
python scripts/extract-workbook.py reference/source.xlsx .local/workbook-extracted.json
node scripts/migrate-history.ts .local/workbook-extracted.json .local/corrections.json .local/history
```

The extractor reads ZIP/XML, preserving raw cells, cached values and shared-formula metadata without recalculating/modifying the workbook. The converter expects `Charging` with Date/Start/End in A/B/C, cached hours/kWh/CAD in D/E/F, rate in J2 and power in J3. Formula-only template rows are excluded. Partial/malformed rows are rejected. The 1904 date system is explicitly unsupported.

The private corrections file is an array (or `[]`). Entries have `date` (`YYYY-MM-DD`), `start`/`end` (`HH:mm:ss`, nullable end), and `evidence`. A correction must match the source date/start exactly and supplies only the reviewed end. `add: true` supplies an approved missing record. Unmatched corrections are rejections. Keep actual corrections/provenance private.

The private `*-report.json` contains source SHA-256, original cells, correction evidence, per-row cached-formula comparisons, rejections and totals. End before start means the following date. Missing ends remain historical `incomplete` records. America/Toronto conversion enumerates winter/summer offsets and rejects nonexistent/repeated DST times. Elapsed time uses UTC instants; DST-related spreadsheet differences require review.

IDs derive from a namespaced SHA-256 of the UTC start, shaped to the existing UUID protocol. They remain stable when a missing end is supplied or the workbook is exported again. Duplicate historical starts are rejected. Sessions store workbook assumptions in integer units. Notes remain in the private report and are excluded from the import payload.

The CLI writes schema-version-2 `*-import.json` only when there are no rejections or cached-formula discrepancies (absolute tolerance 1e-7 per measure). Failed reruns remove the previous import file to avoid a stale result. Compare cached totals only across originally completed rows, with approved additions/completions reported separately. Review the report before importing.

## One-time production migration

Production D1 was exported privately before writes. The actual private migration was exercised through IndexedDB, foreground sync and real local D1 seeded with production data. Repeat import added no records or receipts. All visible source screenshot entries were compared privately.

The reviewed production operation inserted only absent historical records through the existing mutation-receipt trigger, guarded against existing IDs or matching starts (including tombstones). Subsequent snapshots verified imported values and byte-for-byte preservation of pre-existing session bodies. Repeating the production operation made no changes. SQL, backups, personal counts/totals and verification evidence remain in ignored `.local/`.

Installed devices receive history through normal authenticated foreground sync and do not need to import the historical JSON manually. Keep independent backups. The original workbook and screenshot remain unchanged.
