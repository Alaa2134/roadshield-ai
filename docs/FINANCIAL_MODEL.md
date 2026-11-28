# RoadShield Finance AI — financial model

This document defines every amount RoadShield stores and shows, how it is calculated, and which
controls protect it. The implementation is in
`supabase/migrations/20261127100100_projects_contractors_finance.sql` (tables and integrity
triggers), `…100200_enterprise_rpcs.sql` (write workflows) and `…100300_analytics_prediction_models.sql`
(roll-ups, prediction and the budget optimiser). Tests are in `supabase/tests/enterprise_tests.sql`.

## 1. Six amounts that are never mixed

| Amount | Source table | Counts when | Shown as |
|---|---|---|---|
| **Budget** | `budgets` | `status = 'approved'` | Approved budget |
| **Estimate** | `cost_estimates` + `estimate_lines` | latest approved version | Approved estimate |
| **Commitment** | `contracts` + `change_orders` | contract not terminated; change order approved | Committed (contracts) |
| **Invoiced** | `invoices` | `status = 'approved'` (incl. tax) | Invoiced (approved) |
| **Verified actual cost** | `cost_items` | `status = 'approved'` by finance | Verified actual cost |
| **Paid** | `payments` | recorded against an approved invoice | Paid |

Derived values (computed in Postgres, never in the browser):

* `remaining_available = approved_budget − max(committed, verified_actual)`
* `budget_utilization_pct = max(committed, verified_actual) / approved_budget × 100`
* `variance_vs_estimate = verified_actual − approved_estimate` (and as % of the estimate)
* `maintenance_backlog` = sum of the latest approved estimates of projects in planning/approved/in progress

## 2. Money arithmetic

* Amounts are `numeric(18,2)`; quantities and unit rates are `numeric(18,4)`.
* A line amount is `round(quantity × unit_rate, 2)`, enforced by a `CHECK` constraint on
  `estimate_lines` and `cost_items`. Totals are sums of the rounded lines.
* Clients send decimals as **strings** (web server actions and the mobile outbox), so no binary
  floating point touches money on the way in. Browsers only format numbers for display.
* Every financial row of a project uses the project's currency (`CURRENCY_MISMATCH` otherwise).
  RoadShield never converts currencies. Multi-currency organisations keep one project per currency.

## 3. Workflow and controls

| Control | Where | Error code |
|---|---|---|
| Four-eyes: approver ≠ submitter for budgets, estimates, unit rates, cost items, invoices, change orders, inspections | `app_private.assert_four_eyes` (per-org switch `four_eyes_approval`, default on) | `FOUR_EYES_REQUIRED` |
| Only owners/finance managers approve money | `require_org_role` in every `review_*` RPC | `FORBIDDEN` |
| Project approval needs an approved budget | `transition_project` | `BUDGET_REQUIRED` |
| Approved net invoices ≤ contract + approved change orders | `review_invoice` | `EXCEEDS_COMMITMENT` |
| Payments ≤ invoice total, only for approved invoices | `record_payment` | `OVERPAYMENT`, `INVOICE_NOT_APPROVED` |
| Tender values / benchmarks can't be recorded as actual costs | `submit_cost_item` | `INVALID_SOURCE` |
| Estimates use only verified unit rates, or a manual rate with a cited source | `submit_estimate` | `UNIT_RATE_NOT_VERIFIED`, `RATE_SOURCE_REQUIRED` |
| Contractors submit costs only against their own work orders | `submit_cost_item` | `FORBIDDEN` |
| Every financial action is audited | `app_private.audit_org` → `audit_logs` | — |

## 4. Unit rates

`unit_rates` starts **empty**. RoadShield does not ship or invent prices. Each rate records:
category, description, unit, rate, currency, kind (`historical_benchmark`, `current_market`,
`contract_rate`), effective date, source kind, source title and optional URL. A second person must
verify it before estimates can use it. Historical benchmarks are labelled as such and never
presented as current prices.

## 5. Cost prediction (`rs-cost-comparables-v1`)

`predict_project_cost(project)`:

1. Requires the project's **engineer-verified damaged area**. Otherwise:
   *"Insufficient verified data to generate a reliable prediction."*
2. Comparables are **completed/closed** projects of the **same organisation and currency** (and
   the same repair method when one is set) that have verified actual costs and a verified area.
3. Fewer than **5** comparables → `insufficient_data` (the UI shows the count found and required).
4. Unit cost = verified actual ÷ verified area per comparable. The prediction is
   `area × [P25, P50, P75]` of those unit costs. Uncertainty is labelled low/moderate/high from
   the inter-quartile spread relative to the median.
5. The response lists the comparables, cost drivers (category shares of the comparables'
   verified costs), data age, the model id and four explicit assumptions (linear scaling with area,
   same organisation/currency/method, **no inflation adjustment**, IQR range).

Cross-organisation benchmarking is deliberately **not** done: it would leak one tenant's
financial data to another.

### Machine-learning models

`services/cost-intelligence/train_cost_model.py` trains on an export of verified completed
projects (`export_training_data.sql`). It:

* refuses to train with fewer than 30 records, or with more than one currency;
* holds out the most recent 20 % of projects chronologically (no future leakage) and uses
  expanding-window cross-validation on the rest;
* compares a median-unit-cost baseline, ridge regression (log target), random forest and gradient
  boosting, then reports MAE, MAPE, share within ±20 %, and the empirical 80 % interval coverage;
* writes a *candidate* model. Deployment requires approval in the AI Model Center
  (`approve_model_deployment`), which refuses models without recorded metrics.

**Status:** no organisation has verified completed projects yet, so **no ML cost model has been
trained or deployed**. The pipeline is tested with a clearly labelled synthetic fixture
(`services/cost-intelligence/tests`) that checks mechanics, not accuracy.

## 6. Continuous learning loop

Project completed → engineer records verified quantities → contractor invoices → finance approves
costs (four-eyes) → project closed → row becomes eligible in `export_training_data.sql` → scheduled
`train_cost_model.py` run → candidate registered with metrics → platform admin compares with the
production model → approves → previous production model is retired (lineage kept in `ml_models`).

## 7. Budget Planning Studio (`rs-budget-greedy-v1`)

`optimize_budget(org, funding, strategy)` takes candidate projects (planning/approved) that have an
**approved estimate** (cost = latest approved estimate):

| Strategy | Order |
|---|---|
| Safety First | safety score = Σ severity weights (1/2/4/8) of approved inspection defects on the project's roads + verified citizen hazards within 25 m |
| Critical Damage Priority | only projects with high/critical defects or a critical road; by count |
| Maximum Road Coverage | road km per unit cost |
| Balanced | (0.4·safety + 0.3·coverage + 0.3·priority, each normalised) per unit cost |

Projects are funded in that order while funds remain. Projects without an approved estimate are
listed as *excluded* with the reason. Results are decision support; saving a scenario requires the
owner or finance role, and nothing is committed automatically.
