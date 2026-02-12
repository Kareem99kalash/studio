## 2026-02-12 - [OSRM Batching vs Sanity Checks]
**Learning:** Batching OSRM requests into a single `/route` call significantly improves performance, but it obscures the per-segment distance sanity check (`routeDist > dist * 1.5`). A total perimeter sanity check is a good substitute but might be less granular.
**Action:** When batching previously individual API calls, ensure that any safety heuristics (like distance multipliers) are aggregated or preserved to avoid functional regressions.
