# FUSE Durable Archive

Branch `fuse-data` (orphan — no code history). Written to by every FUSE digest run; **append-only, never overwrite/delete**.

- `fuse/digests/YYYY-MM-DD_HHMM_PT.md` — full daily digest, one file per run (audit trail)
- `fuse/digests/cot/YYYY-MM-DD.md` — weekly COT tier
- `fuse/history/fuse_timeseries.csv` — one row per daily run (column order frozen; extend by appending columns only)
- `fuse/history/flag_events.csv` — one row per hard-flag firing

Durable because it lives on the git remote (GitHub), not the ephemeral container disk. Each run does: fetch fuse-data -> append -> commit -> push (fail-loud on write/push failure).
