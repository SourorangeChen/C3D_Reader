# Contributing

Bug reports, small patches and synthetic regression fixtures are welcome. Include the C3D processor type, point / analog sampling rates, storage format and the behavior you expected. Do not attach identifiable participant recordings to public issues.

Install `requirements-dev.txt`, run `python -m pytest -q`, then `npm ci`, `npm run build`, `npx playwright install chromium` and `npm test`. Python formatting uses `ruff format`; TypeScript / CSS formatting uses Prettier. CI uses an isolated, generated walking trial.

Keep new reader behavior independent of UI display sampling. Validate physical units, analog scaling, original frame numbers and missingness before changing the visualization. If you add a recording format or force-plate decoder, include a synthetic fixture and explain its supported conventions in the README.
