# Real iPhone offline verification

Status: not yet run on a physical iPhone. Desktop browser tests are supporting evidence only. Use synthetic test sessions and record iPhone model, iOS version, deployed build, timezone and date with results.

1. Serve a production build over HTTPS. Open it in Safari online, wait for **Ready for offline use**, and use Share → Add to Home Screen. Launch the installed app once online and confirm offline readiness there too.
2. Enable Airplane Mode and explicitly turn Wi-Fi off. Launch from the Home Screen. Confirm the UI opens and says Offline.
3. Tap Start Charging once. Confirm the saved-on-device message and start timestamp. Try rapid repeated taps; only one session may exist.
4. Switch apps, lock the phone and leave it suspended. Return and confirm elapsed time derives from the original timestamp.
5. Force-close PlugTime while offline. Relaunch from the Home Screen. The active session must still be present. Tap Stop Charging and confirm a completed history record.
6. Force-close and relaunch again offline. Confirm start/end timestamps, elapsed time, estimated energy and CAD cost remain correct. Record any missing shell assets or data.
7. Edit the end to a later date, including a session crossing midnight. Confirm corrections persist after relaunch. Try an end before the start and verify it is rejected without changing history.
8. Add a past session with no end time. Confirm it says Incomplete and does not become the live charging timer. Complete it after the fact. Delete a synthetic session and verify the confirmation and persistent removal.
9. Change charging/rate defaults and verify existing sessions keep their assumptions while new sessions use new values. Inspect monthly/yearly totals and rounding. Test a DST-crossing interval and reject a nonexistent/repeated input time.
10. Export JSON and CSV offline using the installed app. Save to Files and inspect the actual file contents on a second device. Include unsynchronized sessions, defaults and deletion tombstones in JSON. Confirm CSV omits incomplete estimates rather than inventing zero consumption.
11. Request persistent storage. Record whether it is granted. Test accessible labels, touch targets, keyboard entry, light/dark mode, rotation and safe areas. Do not clear real site data to test eviction; use a separate test installation.
12. Test an application update while a charge is active and while the editor is open. The update must wait. After stopping and closing the editor, install it and confirm data survives.

Phase 2 additions: expired Access authentication must leave offline recording available, show sign-in separately from offline status, and resume synchronization after user sign-in. Test interrupted uploads, retries of the same mutation, two-device conflicts, deletion convergence, edits during upload and initial full-history download on a fresh installation.

Phase 3 release gate: validate JSON restoration/import round trips, duplicate historical imports, Toronto DST conversion, malformed rows and each explicitly reviewed reconciliation before using migrated data as the authoritative log.
