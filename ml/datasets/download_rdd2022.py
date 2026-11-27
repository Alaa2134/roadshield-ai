"""Download RDD2022 from its OFFICIAL source (Figshare article 21431547) with licence and
integrity verification. Nothing is downloaded from mirrors.

  python ml/datasets/download_rdd2022.py --out datasets/raw/rdd2022 [--countries Japan,India]

Steps
 1. Reads the article metadata from the Figshare API (title, licence, citation, file list
    with sizes and MD5 checksums published by Figshare).
 2. Refuses to continue unless the licence is in ALLOWED_LICENSES (records it either way).
 3. Downloads each selected file, streams an MD5, and compares it with Figshare's value.
 4. Writes datasets/raw/rdd2022/LICENSE_RECORD.json — the evidence used by the registry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ARTICLE_ID = 21431547
API = f"https://api.figshare.com/v2/articles/{ARTICLE_ID}"
ALLOWED_LICENSES = {"CC BY 4.0", "CC BY-SA 4.0", "CC0"}
UA = {"User-Agent": "RoadShield-dataset-fetch/1.0"}


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def download(url: str, dest: Path, expected_md5: str | None, size: int | None) -> str:
    md5 = hashlib.md5()  # noqa: S324 - integrity check against Figshare's published MD5
    sha = hashlib.sha256()
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(tmp, "wb") as f:
        done = 0
        while chunk := r.read(1 << 20):
            f.write(chunk); md5.update(chunk); sha.update(chunk); done += len(chunk)
            if size:
                print(f"\r  {dest.name}: {done / size:6.1%}", end="", flush=True)
    print()
    if expected_md5 and md5.hexdigest() != expected_md5:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f"MD5 mismatch for {dest.name}: got {md5.hexdigest()}, Figshare says {expected_md5}")
    tmp.rename(dest)
    return sha.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="datasets/raw/rdd2022")
    ap.add_argument("--match", default="", help="only download files whose name contains this text")
    ap.add_argument("--dry-run", action="store_true", help="verify metadata and licence only")
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)

    meta = fetch_json(API)
    licence = (meta.get("license") or {}).get("name", "UNKNOWN")
    record = {
        "dataset": "RDD2022", "source": f"https://figshare.com/articles/dataset/{ARTICLE_ID}", "api": API,
        "title": meta.get("title"), "doi": meta.get("doi"), "licence": licence, "licence_url": (meta.get("license") or {}).get("url"),
        "citation": meta.get("citation"), "checked_at": datetime.now(timezone.utc).isoformat(), "files": [],
        "allowed": licence in ALLOWED_LICENSES,
    }
    print(f"{record['title']}\n  DOI {record['doi']}\n  licence: {licence}")
    if not record["allowed"]:
        (out / "LICENSE_RECORD.json").write_text(json.dumps(record, indent=2))
        sys.exit(f"Licence '{licence}' is not in the approved list; review before use.")

    for f in meta.get("files", []):
        if args.match and args.match not in f["name"]:
            continue
        entry = {"name": f["name"], "size": f.get("size"), "figshare_md5": f.get("computed_md5") or f.get("supplied_md5")}
        if not args.dry_run:
            entry["sha256"] = download(f["download_url"], out / f["name"], entry["figshare_md5"], f.get("size"))
            entry["md5_verified"] = True
        record["files"].append(entry)
    (out / "LICENSE_RECORD.json").write_text(json.dumps(record, indent=2))
    print(f"Wrote {out / 'LICENSE_RECORD.json'} ({len(record['files'])} files)")


if __name__ == "__main__":
    main()
