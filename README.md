# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ItzSudhan/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ItzSudhan/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks every protocol that records no token by the implied value of the token it may launch, and writes an offline dashboard with a sortable, filterable board, a detail view per protocol and a costed farm plan for each.

One model file, `dashboard/1-model.js`, prices both `board.json` and the page, so the two cannot disagree: the page recomputes every row from the snapshot and checks it against the board.

- **Value if it launches**: the market's own size curve, fitted on the snapshot's traded tokens, then adjusted for sector, 7-day growth against the market and days with no token. Every step is tested on tokens it never saw, each left out and older-to-newer.
- **Launch odds**: a ridge logistic fit on the snapshot's own record (token families against protocols with none). Each row's odds come from a fit that left it out, and they are scored against the base rate.
- **Ranking**: by expected value, the value if it launches times the launch odds. `board.json` carries both figures and the two ranges.
- **Ranges**: the 50% and 80% ranges are conformal bands from blind misses. The page shows how often they hold on held-out tokens.
- **Ledger**: every protocol in the snapshot lands in one group, either ranked or set aside with its reason.
- **Farm plans**: eight steps each, with a dollar cost and minutes apiece, netted against fees and the T-bill yield given up. The slice is weighted by the odds.

No protocol name is special-cased. Implied values are the model's own estimate, not a forecast of a launch and not financial advice.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
# then open out/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=1pww8frk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
