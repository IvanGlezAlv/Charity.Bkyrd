# Timing and ranking policy

Timing is manual. Staff record each lap on the timing screen; there is no chip or GPS tracking. Recorded events are the source of truth, and results are recalculated from them by the database (`recalculate_results`) after every change.

## Recording

- **Time source.** The timing screen measures its offset from the server clock (`/api/time`) and stamps each tap with server time, so a slow connection does not delay the time. If the clock can't be synced, the database stamps the record when it arrives.
- **Duplicates.** Every tap carries a unique id. Retrying after a network failure can never record it twice.
- **Double taps.** A lap can't be recorded for a yard that hasn't started. A second tap in the same hour shows "Ya hay un registro" instead of recording.
- **Overwrites** need a reason and a confirmation. The old record is kept, marked as replaced.
- **Corrections and voids** need a reason. Nothing is deleted; every change is in the audit log with who made it and why.
- **Official results freeze timing.** An admin must reopen them, with a reason, before anything changes.

## Backyard ranking

- Yard *n* starts at the first start + (*n* − 1) × 60 minutes.
- A lap counts when its finish is recorded at or after its yard's start and before the next yard starts. Times are compared in whole seconds, truncated.
- **Laps completed** = consecutive valid laps from yard 1.
- Ranked: everyone not DNS or DSQ with at least one completed lap. Order: laps completed, most first; the runner marked "Finalizó" (last one standing) ahead of others with the same laps.
- Equal laps share a position (1, 2, 2, 4).
- Distance shown = laps × 6.7 km.

## Fixed-distance ranking (not used in Vol. II)

- Gun time = finish − distance start. Net time = finish − the runner's own start (falls back to gun).
- Ranked: runners marked finished with a valid finish, by gun or net time per race settings. Ties share a position.

## Missing data

Missing or suspicious data (a late lap, a missing lap, a checkpoint out of order) is shown as a flag for staff to review in Resultados. It never changes a runner's status on its own: DNF, DNS and DSQ are always a staff decision, with a reason.
