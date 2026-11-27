"""RoadShield Finance AI — repair cost model training with honest evaluation.

Input: a CSV export of VERIFIED, completed projects (one row per project), produced from the
database by `export_training_data.sql`. Required columns:
  project_id, completed_on (YYYY-MM-DD), country, region, repair_method, highway_class,
  verified_damaged_area_m2, verified_actual_cost, currency
Optional numeric columns are used when present: road_km, n_defects_high, duration_days.

Rules (see docs/FINANCIAL_MODEL.md):
  * Only verified actual cost (finance-approved cost items) is a valid target. Estimates,
    budgets, tender values and benchmarks are never targets.
  * A single currency per model; no silent FX conversion.
  * Chronological split: the most recent 20 % of completed projects form the hold-out test set;
    model selection uses expanding-window time-series CV on the remainder (no future leakage).
  * Refuses to train with fewer than --min-records rows (default 30) and reports why.
  * Candidates: median-unit-cost baseline, linear regression (log target), random forest,
    gradient boosting. The best CV model is refit and scored once on the hold-out set.
Output: <out>/model.joblib, <out>/metrics.json (registered as a *candidate*; deployment needs
human approval in the AI Model Center).
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

REQUIRED = ["project_id", "completed_on", "country", "region", "repair_method", "highway_class",
            "verified_damaged_area_m2", "verified_actual_cost", "currency"]
CATEGORICAL = ["country", "region", "repair_method", "highway_class"]
NUMERIC_OPTIONAL = ["road_km", "n_defects_high", "duration_days"]


class InsufficientData(Exception):
    pass


def load(path: Path, min_records: int) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    df = df.dropna(subset=["completed_on", "verified_damaged_area_m2", "verified_actual_cost"])
    df = df[(df.verified_damaged_area_m2 > 0) & (df.verified_actual_cost > 0)].copy()
    if df.currency.nunique() > 1:
        raise ValueError(f"multiple currencies {sorted(df.currency.unique())}: train one model per currency")
    df["completed_on"] = pd.to_datetime(df.completed_on)
    df = df.sort_values("completed_on").drop_duplicates("project_id").reset_index(drop=True)
    if len(df) < min_records:
        raise InsufficientData(f"{len(df)} verified completed projects; at least {min_records} are required")
    return df


def features(df: pd.DataFrame) -> list[str]:
    return ["log_area"] + [c for c in NUMERIC_OPTIONAL if c in df.columns and df[c].notna().any()]


def make_models(num: list[str]) -> dict[str, Pipeline]:
    pre = lambda scale: ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=2), CATEGORICAL),
        ("num", StandardScaler() if scale else "passthrough", num)])
    return {
        "linear_ridge": Pipeline([("pre", pre(True)), ("m", Ridge(alpha=1.0))]),
        "random_forest": Pipeline([("pre", pre(False)), ("m", RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=42))]),
        "gradient_boosting": Pipeline([("pre", pre(False)), ("m", GradientBoostingRegressor(random_state=42, max_depth=3, n_estimators=300, learning_rate=0.05, subsample=0.8))]),
    }


def mape(y, p) -> float:
    return float(np.mean(np.abs((y - p) / y)) * 100)


def evaluate(y_true_cost, pred_cost) -> dict:
    return {"MAE": round(float(mean_absolute_error(y_true_cost, pred_cost)), 2), "MAPE_pct": round(mape(y_true_cost, pred_cost), 2),
            "within_20pct": round(float(np.mean(np.abs(pred_cost - y_true_cost) / y_true_cost <= 0.2)) * 100, 1)}


def train(df: pd.DataFrame, test_frac: float = 0.2) -> tuple[object, dict]:
    df = df.copy()
    df["log_area"] = np.log(df.verified_damaged_area_m2)
    y_log_unit = np.log(df.verified_actual_cost / df.verified_damaged_area_m2)  # model log unit cost
    num = features(df)
    for c in num:
        df[c] = df[c].fillna(df[c].median())
    cut = int(math.floor(len(df) * (1 - test_frac)))
    train_df, test_df = df.iloc[:cut], df.iloc[cut:]
    ytr, yte = y_log_unit.iloc[:cut], y_log_unit.iloc[cut:]
    X = CATEGORICAL + num
    tscv = TimeSeriesSplit(n_splits=min(5, max(2, cut // 8)))
    cv = {}
    # Baseline: median unit cost of the training window (what rs-cost-comparables-v1 does).
    base_scores = []
    for a, b in tscv.split(train_df):
        med = float(np.exp(np.median(ytr.iloc[a])))
        base_scores.append(mape(train_df.verified_actual_cost.iloc[b].to_numpy(), med * train_df.verified_damaged_area_m2.iloc[b].to_numpy()))
    cv["median_unit_cost_baseline"] = round(float(np.mean(base_scores)), 2)
    models = make_models(num)
    for name, m in models.items():
        scores = []
        for a, b in tscv.split(train_df):
            m.fit(train_df[X].iloc[a], ytr.iloc[a])
            pred = np.exp(m.predict(train_df[X].iloc[b])) * train_df.verified_damaged_area_m2.iloc[b].to_numpy()
            scores.append(mape(train_df.verified_actual_cost.iloc[b].to_numpy(), pred))
        cv[name] = round(float(np.mean(scores)), 2)
    best = min(models, key=lambda k: cv[k])
    model = models[best].fit(train_df[X], ytr)
    y_cost = test_df.verified_actual_cost.to_numpy()
    pred = np.exp(model.predict(test_df[X])) * test_df.verified_damaged_area_m2.to_numpy()
    base = float(np.exp(np.median(ytr))) * test_df.verified_damaged_area_m2.to_numpy()
    # Empirical 80 % interval from training residuals (log space).
    resid = ytr - model.predict(train_df[X])
    lo, hi = np.quantile(resid, [0.1, 0.9])
    coverage = float(np.mean((y_cost >= pred * math.exp(lo)) & (y_cost <= pred * math.exp(hi)))) * 100
    report = {
        "target": "verified_actual_cost (modelled as log cost per verified m²)", "currency": str(df.currency.iloc[0]),
        "records": len(df), "train_records": len(train_df), "test_records": len(test_df),
        "train_period": [str(train_df.completed_on.min().date()), str(train_df.completed_on.max().date())],
        "test_period": [str(test_df.completed_on.min().date()), str(test_df.completed_on.max().date())],
        "validation": f"chronological hold-out (latest {int(test_frac * 100)}%) + TimeSeriesSplit({tscv.n_splits}) CV on the training window",
        "cv_MAPE_pct": cv, "selected_model": best, "features": X,
        "test": evaluate(y_cost, pred), "test_baseline": evaluate(y_cost, base),
        "interval_80": {"log_residual_quantiles": [round(float(lo), 4), round(float(hi), 4)], "test_coverage_pct": round(coverage, 1)},
        "beats_baseline": evaluate(y_cost, pred)["MAPE_pct"] < evaluate(y_cost, base)["MAPE_pct"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return model, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-records", type=int, default=30)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    try:
        df = load(Path(a.csv), a.min_records)
    except InsufficientData as e:
        (out / "metrics.json").write_text(json.dumps({"status": "insufficient_data", "reason": str(e)}, indent=2))
        print(f"Insufficient verified data to train a reliable model: {e}")
        raise SystemExit(2)
    model, report = train(df)
    import joblib
    joblib.dump(model, out / "model.joblib")
    (out / "metrics.json").write_text(json.dumps({"status": "candidate", **report}, indent=2))
    print(json.dumps({k: report[k] for k in ("records", "selected_model", "cv_MAPE_pct", "test", "test_baseline", "beats_baseline")}, indent=2))


if __name__ == "__main__":
    main()
