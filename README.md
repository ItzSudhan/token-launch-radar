# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ItzSudhan/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ItzSudhan/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks every protocol with no token on record by the implied value of the token it may launch, and writes an offline dashboard with a board, a detail view and filters, plus a farm plan with costs and times for every protocol.

The value model prices each pre-token protocol like the market already prices its category: implied FDV = TVL x the median market-cap/TVL of traded peers in the same category (shrunk toward the all-peer median), adjusted for 7-day TVL momentum, how long it has run with no token, chain breadth, and a discount for protocols DefiLlama links to a parent. No protocol name is special-cased. Implied values are the model's own estimate, not a prediction of a launch and not financial advice.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
# then open out/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hax102zf&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
