# Testing

Every part can be tested on its own, without the network or the other parts
running.

| Command | What |
|---|---|
| `ruff check . && ruff format --check .` | lint; `ruff format .` fixes formatting |
| `pytest` | API tests (`tests/`) |
| `cd frontend && npm test` | frontend tests (Vitest, `fetch` mocked) |

Run all three before opening a PR; CI runs the same.

## Rules

- A new function gets a test that runs offline. If it needs data, add a small
  fixture, never a full download.
- Tests that need a real service (STAC, Open-Meteo, Earth Engine) must be opt-in,
  for example with a pytest marker that CI skips.
- Back-tests split by race day. The locked days stay untouched until week 5.
