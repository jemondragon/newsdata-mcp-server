#!/usr/bin/env python3
"""FUSE durable persistence — write one run to the git-backed fuse-data branch.
Usage: fuse_persist.py <record.json> <digest.md> <kind: daily|cot>
Fails LOUD (exit 1) on any write/commit/push failure. Append-only; never overwrites history CSVs.
"""
import sys, os, json, csv, io, subprocess, shutil

def _repo():
    env=os.environ.get("FUSE_REPO")
    if env and os.path.isdir(env): return env
    r=subprocess.run(["git","rev-parse","--show-toplevel"], capture_output=True, text=True)
    if r.returncode==0 and r.stdout.strip(): return r.stdout.strip()
    for c in ("/home/user/newsdata-mcp-server", os.path.expanduser("~/newsdata-mcp-server")):
        if os.path.isdir(os.path.join(c,".git")): return c
    return "/home/user/newsdata-mcp-server"
REPO=_repo()
WT=os.environ.get("FUSE_WT") or os.path.join(os.path.expanduser("~"),".fuse-wt")
BRANCH="fuse-data"
GIT_NAME="FUSE Digest"; GIT_EMAIL="jmo@candemb.com"
COLS=["date","run_time_pt","hy_oas","hy_oas_pctile","hy_oas_1w_bps","ig_oas","ig_oas_pctile",
"net_liquidity_1w","liquidity_flag","tga","reserves","rrp","dgs2","dgs10","dgs30","real_yield_10y",
"term_premium","slope_2s10s","slope_5s30s","gold","gold_1w_pct","gold_vs_real_label","dxy","spx",
"spx_1w_pct","brent","wti","wheat","silver","gold_silver_ratio","vix","move","hyg","lqd","usdjpy",
"audjpy","audjpy_pct_of_range","carry_diff_bp","icsa_4wk_ma","sahm","unrate","flags_fired"]

def die(msg):
    print(f"PERSIST FAIL — {msg}", file=sys.stderr); sys.exit(1)

def git(args, cwd=REPO, check=True):
    r=subprocess.run(["git"]+args, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode!=0:
        die(f"git {' '.join(args)}: {r.stderr.strip() or r.stdout.strip()}")
    return r

def main():
    if len(sys.argv)!=4: die("usage: fuse_persist.py <record.json> <digest.md> <daily|cot>")
    rec_path, md_path, kind = sys.argv[1], sys.argv[2], sys.argv[3]
    if kind not in ("daily","cot"): die("kind must be daily|cot")
    for p in (rec_path, md_path):
        if not os.path.exists(p): die(f"input missing: {p}")
    rec=json.load(open(rec_path))
    date=rec.get("date") or die("record.date required")
    rt=rec.get("run_time_pt","")

    # fresh DETACHED worktree pinned to latest remote fuse-data
    # (detached avoids "branch used by another worktree" conflicts; we push HEAD:fuse-data)
    git(["fetch","-q","origin",BRANCH])
    git(["worktree","remove","--force",WT], check=False)
    if os.path.exists(WT): shutil.rmtree(WT)
    git(["worktree","prune"])
    git(["worktree","add","-q","-f","--detach",WT,f"origin/{BRANCH}"])

    # 1) digest md — dated, never overwrite
    if kind=="daily":
        dst=os.path.join(WT,"fuse","digests",f"{date}_{rt.replace(':','')}_PT.md")
    else:
        dst=os.path.join(WT,"fuse","digests","cot",f"{date}.md")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst): die(f"refuse to overwrite existing archive file: {dst}")
    shutil.copyfile(md_path, dst)

    # 2) time-series row (daily only) — append, verify header unchanged
    if kind=="daily":
        ts=os.path.join(WT,"fuse","history","fuse_timeseries.csv")
        with open(ts) as f: hdr=f.readline().strip()
        if hdr.split(",")!=COLS: die("timeseries header drift — column order must not change")
        row=[str(rec.get(c,"")) for c in COLS]
        buf=io.StringIO(); csv.writer(buf).writerow(row)
        with open(ts,"a",newline="") as f: f.write(buf.getvalue())

    # 3) flag events — append one row per firing
    events=rec.get("flag_events",[])
    if events:
        fe=os.path.join(WT,"fuse","history","flag_events.csv")
        with open(fe,"a",newline="") as f:
            w=csv.writer(f)
            for e in events:
                w.writerow([e.get("date",date),e.get("section",""),e.get("flag_name",""),
                            e.get("value",""),e.get("threshold",""),e.get("note","")])

    # commit + push with retry (rebase on remote-moved)
    git(["add","fuse"], cwd=WT)
    st=git(["status","--porcelain"], cwd=WT).stdout.strip()
    if not st: die("nothing staged — record produced no changes (unexpected)")
    msg=f"FUSE {kind} {date} {rt} PT"
    git(["-c",f"user.name={GIT_NAME}","-c",f"user.email={GIT_EMAIL}","commit","-q","-m",msg], cwd=WT)
    pushed=False
    for i in range(4):
        r=git(["push","origin",f"HEAD:{BRANCH}"], cwd=WT, check=False)
        if r.returncode==0: pushed=True; break
        git(["fetch","-q","origin",BRANCH], cwd=WT, check=False)
        git(["rebase",f"origin/{BRANCH}"], cwd=WT, check=False)
    if not pushed: die("push failed after retries — record NOT durably stored")
    head=git(["rev-parse","HEAD"], cwd=WT).stdout.strip()[:10]
    rel=os.path.relpath(dst,WT)
    # hygiene: drop the staging worktree (ephemeral anyway)
    git(["worktree","remove","--force",WT], check=False)
    print(f"PERSIST OK — {kind} {date} {rt} -> fuse-data @ {head}  ({rel})")

if __name__=="__main__":
    main()
