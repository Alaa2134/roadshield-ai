"""Pipeline tests with a SYNTHETIC fixture (clearly not real cost data): verifies refusal on
insufficient data, single-currency rule, chronological split without leakage, and that the
learner recovers a known synthetic relationship better than the median baseline."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from train_cost_model import InsufficientData, load, train  # noqa: E402


def synthetic(n=80, seed=0, currency="EGP"):
    rng = np.random.default_rng(seed)
    method = rng.choice(["mill_and_overlay", "patching", "crack_sealing"], n)
    unit = {"mill_and_overlay": 250.0, "patching": 420.0, "crack_sealing": 60.0}
    area = rng.uniform(20, 2000, n)
    cost = np.array([unit[m] for m in method]) * area * rng.lognormal(0, 0.1, n)
    return pd.DataFrame({"project_id": [f"p{i}" for i in range(n)], "completed_on": pd.date_range("2021-01-01", periods=n, freq="10D"),
                         "country": "EG", "region": "TestRegion", "repair_method": method, "highway_class": rng.choice(["primary", "residential"], n),
                         "verified_damaged_area_m2": area, "verified_actual_cost": cost, "currency": currency})


def test_refuses_with_too_few_records(tmp_path):
    p = tmp_path / "d.csv"; synthetic(10).to_csv(p, index=False)
    with pytest.raises(InsufficientData):
        load(p, 30)


def test_rejects_mixed_currencies(tmp_path):
    p = tmp_path / "d.csv"; pd.concat([synthetic(40), synthetic(5, currency="USD")]).to_csv(p, index=False)
    with pytest.raises(ValueError, match="currenc"):
        load(p, 30)


def test_chronological_holdout_and_beats_baseline(tmp_path):
    p = tmp_path / "d.csv"; synthetic(120).to_csv(p, index=False)
    df = load(p, 30)
    _, rep = train(df)
    assert rep["train_period"][1] <= rep["test_period"][0]          # no future data in training
    assert rep["test_records"] == 24 and rep["train_records"] == 96
    assert rep["beats_baseline"] and rep["test"]["MAPE_pct"] < 20  # method effect is learnable
