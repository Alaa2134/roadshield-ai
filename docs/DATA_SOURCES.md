# Data sources and licences

Rule: every imported record carries its source and licence. Nothing in production data is
invented. Where verified data does not exist the product shows an empty state or "unknown".

## Road geometry — OpenStreetMap

| | |
|---|---|
| Source | OpenStreetMap via the Overpass API (`scripts/osm/fetch-osm-roads.mjs`) |
| Licence | Open Database License (ODbL 1.0) — attribution "© OpenStreetMap contributors"; share-alike applies to derived *databases* |
| Stored per segment | `source` (incl. OSM base timestamp), `source_license`, `source_retrieved_at`, `osm_way_id` |
| Pilot area | New Damietta, Damietta, Egypt — bbox `31.405,31.615,31.475,31.745` (south, west, north, east) |
| Classes | motorway…tertiary (+ links), unclassified, residential, living_street |
| Attributes kept only when tagged | `surface`, `lanes`, `oneway`, `ref`, `name:ar` |
| Never inferred | width, pavement structure, traffic volume, construction history |

**Status (27 Nov 2026):** the importer is implemented and tested with a labelled fixture. The real
New Damietta extract could **not** be fetched from this build environment: `overpass-api.de` was
refused by the session's network proxy even after it was allow-listed. Run
`node scripts/osm/fetch-osm-roads.mjs` from any machine with internet access, then
`scripts/osm/import-osm-roads.mjs` (or upload the GeoJSON at *Road Network → Import roads*).

## Basemap tiles

OpenFreeMap (`tiles.openfreemap.org`) vector tiles built from OpenStreetMap / OpenMapTiles.
Attribution is displayed in the map. No API key is required. Configure another MapLibre style with
`NEXT_PUBLIC_MAP_STYLE_URL`.

## Road-damage images — RDD2022

| | |
|---|---|
| Official source | Figshare article 21431547 — "RDD2022 – The multi-national Road Damage Dataset released through CRDDC 2022" |
| Citation | Arya D., Maeda H., Ghosh S. K., Toshniwal D., Sekimoto Y. (2022). *RDD2022: A multi-national image dataset for automatic Road Damage Detection.* arXiv:2209.08538 |
| Licence | CC BY-SA 4.0 as stated on the official record. `ml/datasets/download_rdd2022.py` re-reads it from the Figshare API on every download and refuses unlisted licences |
| Content | 47,420 images from Japan, India, Czech Republic, Norway, United States and China; classes D00, D10, D20, D40 (some countries add others, which are counted and dropped) |
| Integrity | Figshare MD5 verified per file; SHA-256 recorded; `MANIFEST.json` versions the prepared split |

Mirrors (Kaggle, Hugging Face, GitHub copies) are **not** used, because their terms can differ from
the original.

**Status:** not downloaded in this environment (`figshare.com` is not reachable from the build
sandbox). The download and preparation scripts and the Colab notebook
(`ml/detector/RoadShield_RDD2022_training.ipynb`) are ready.

### Additional datasets reviewed (not used yet)

| Dataset | Why not yet |
|---|---|
| RDD2020 (IEEE BigData Cup 2020) | Superseded by RDD2022, which includes it |
| Crack500 / GAPs / CFD | Pixel-level crack segmentation, close-up pavement; different task and domain. Licences vary; verify per source before use |
| Pothole datasets on Kaggle / Roboflow | Licences frequently unclear or non-commercial; use only after checking the original author's licence |
| Local Egyptian dash-camera imagery | Needed for a valid local evaluation. To be collected with consent and privacy redaction during the pilot |

## Detection model weights in production today

YOLOv8s weights trained on RDD2022 (Japan + India) by
[oracl4/RoadDamageDetection](https://github.com/oracl4/RoadDamageDetection). The weights are
AGPL-3.0 (Ultralytics), so the AI service is AGPL-3.0 (`services/ai/LICENSE`). These are
**third-party pretrained** weights: RoadShield did not train them and has not measured their mAP.
See `MODEL_CARD.md`.

## Cost data

No cost data is bundled. Organisations enter their own budgets, contracts, invoices and verified
costs. Each unit rate records its source title/URL, kind (historical benchmark / current market /
contract rate) and effective date, and needs a second person to verify it.

Public sources to investigate per country (to be entered as cited unit rates, not as project costs):
* Egypt's public procurement portal (etenders.gov.eg) — tender values are **not** actual costs;
* the Open Contracting Data Standard registry (data.open-contracting.org) for publishers that
  release OCDS data, including implementation and transaction stages;
* World Bank ROCKS (Road Costs Knowledge System) historical unit costs — historical benchmarks,
  to be labelled as such with their year and currency.

## Website photography

Real photographs from Wikimedia Commons, fetched with `scripts/assets/fetch-commons-photos.py`.
The script keeps only CC0, public-domain, CC BY and CC BY-SA files and records author, licence and
source. Photos are cropped, colour-graded and re-encoded. Adapted CC BY-SA photos are shared under
the same licence. All credits are listed on the website's **/credits** page and in
`apps/web/src/lib/vision-samples.json`.

The boxes and scores drawn on these photos are the **real output** of the production detector
(`roadshield-rdd-yolov8s`, ONNX SHA-256 `9eb29882…`), produced by `scripts/assets/run-vision-samples.py`
and stored in `docs/test-results/website-vision-samples.json`. This includes a misclassification:
a crack close-up labelled pothole at 0.71, which the website shows as a known limitation.

Product screenshots on the website come from the real application, using a local demo workspace.

## Citizen reports

Photos and reports come from RoadShield app users under the app's privacy notice. EXIF/GPS
metadata is stripped and faces and plates are blurred where detectable. Photos are visible to
others only after staff approval.
