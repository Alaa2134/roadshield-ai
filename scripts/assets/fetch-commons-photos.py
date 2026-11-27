"""Fetch candidate photos from Wikimedia Commons with licence metadata.

Only files under licences that allow commercial reuse are kept (CC0, Public domain, CC BY,
CC BY-SA). Writes JPEG thumbnails and a credits JSON (author, licence, source URL) so each photo
can be attributed on the website.
  python3 scripts/assets/fetch-commons-photos.py --query "road ahead asphalt" --limit 30 --out /tmp/cands
"""
import argparse, json, re, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "RoadShield-asset-fetch/1.0 (website imagery; credits recorded)"}
OK = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)

def api(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    return json.loads(get(url))

def get(url):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(5 * 2 ** attempt)  # polite backoff
    raise SystemExit("rate limited: try again later")


def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True); ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--out", required=True); ap.add_argument("--width", type=int, default=1280, help="use Wikimedia standard widths: 960, 1280, 1920")
    ap.add_argument("--titles", default="", help="pipe-separated exact File: titles instead of a search")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    if a.titles:
        titles = a.titles.split("|")
    else:
        titles = [x["title"] for x in api({"action": "query", "list": "search", "srsearch": a.query, "srnamespace": 6, "srlimit": a.limit})["query"]["search"]]
    titles = [t for t in titles if t.lower().endswith((".jpg", ".jpeg"))]
    credits = []
    for i in range(0, len(titles), 20):
        time.sleep(3)
        d = api({"action": "query", "prop": "imageinfo", "titles": "|".join(titles[i:i + 20]), "iiprop": "url|size|extmetadata", "iiurlwidth": a.width})
        for page in d["query"]["pages"].values():
            ii = (page.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
            lic = strip(md.get("LicenseShortName", {}).get("value"))
            if not OK.match(lic) or ii.get("width", 0) < 1200:
                continue
            name = re.sub(r"[^a-z0-9]+", "-", page["title"][5:].rsplit(".", 1)[0].lower())[:60].strip("-") + ".jpg"
            # thumb.wikimedia.org serves the same paths as upload.wikimedia.org
            thumb = ii["thumburl"].split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/")
            (out / name).write_bytes(get(thumb))
            time.sleep(1.5)
            credits.append({"file": name, "title": page["title"], "author": strip(md.get("Artist", {}).get("value")), "licence": lic,
                            "licence_url": md.get("LicenseUrl", {}).get("value"), "source": ii.get("descriptionurl"), "width": ii.get("width"), "height": ii.get("height")})
    (out / "credits.json").write_text(json.dumps(credits, indent=2, ensure_ascii=False))
    print(f"{len(credits)} licensed photos -> {out}")

main()
