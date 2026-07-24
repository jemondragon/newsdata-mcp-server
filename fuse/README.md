# FUSE Durable Archive

Orphan branch `fuse-data` (no code history). Written by every FUSE digest run.
**Append-only. Never overwrite or delete.** Durable because it lives on the git
remote (GitHub), not the ephemeral container disk (in this environment `$HOME`,
`/tmp`, `/root` are ALL on the same disposable volume — only `git push` survives).

## Layout
- `fuse/digests/YYYY-MM-DD_HHMM_PT.md` — full daily digest, one file per run (audit trail)
- `fuse/digests/cot/YYYY-MM-DD.md` — weekly COT tier
- `fuse/history/fuse_timeseries.csv` — one row per daily run; column order FROZEN (extend only by appending new columns at the end)
- `fuse/history/flag_events.csv` — one row per hard-flag firing (date,section,flag_name,value,threshold,note)
- `fuse/bin/fuse_persist.py` — the persistence helper (below)

## How each run persists (scheduled runs included)
After producing the digest, the run:
1. Writes the digest markdown to a local file.
2. Builds a `record.json` with the frozen time-series fields + a `flag_events` list.
3. Runs: `python3 fuse/bin/fuse_persist.py <record.json> <digest.md> <daily|cot>`.
   The helper fetches `origin/fuse-data`, stages into a DETACHED worktree, appends,
   commits, and pushes `HEAD:fuse-data` (retries+rebase on remote-moved).
FAILS LOUD (exit 1) on any write/commit/push failure — a run that cannot persist
surfaces an error rather than silently dropping the record.
Env overrides: `FUSE_REPO` (repo path), `FUSE_WT` (staging worktree path).

## record.json fields (daily)
date, run_time_pt, hy_oas, hy_oas_pctile, hy_oas_1w_bps, ig_oas, ig_oas_pctile,
net_liquidity_1w, liquidity_flag, tga, reserves, rrp, dgs2, dgs10, dgs30,
real_yield_10y, term_premium, slope_2s10s, slope_5s30s, gold, gold_1w_pct,
gold_vs_real_label, dxy, spx, spx_1w_pct, brent, wti, wheat, silver,
gold_silver_ratio, vix, move, hyg, lqd, usdjpy, audjpy, audjpy_pct_of_range,
carry_diff_bp, icsa_4wk_ma, sahm, unrate, flags_fired (semicolon-joined),
flag_events: [ {section, flag_name, value, threshold, note}, ... ]
