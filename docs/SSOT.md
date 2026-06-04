# Hum SSOT (canonical state) — 更新: 2026-06-01

## pair inventory (訂正)
- active family pair = yv00qaj6 (users 移行済み、現行)
- TYSON-ZH90 = legacy/廃止 (page-not-found、active user なし、data は purge 候補。active 重要 pair として扱わない)
- PAIR-DEMOTEST = demo (静的 data、API fetch skip、安全)
- 旧 'demo' pair = legacy junk (27日 data・member 0、purge 候補)
- PAIR-TESTXX / TYSON-1*** / TYSON-F*** = test/junk
- PAIR-8/B/F/H/P/S*** = 未分類 (本物か test か要確認)

## security 状態 (Phase 1 exposure 修正)
- main 82d7471: fix#1-A/A2 (API membership + claim) 本番 live
- feature/phase1-rules (7bbab48, b86df55): fix#1-B rules member-only + fix#1-C voice-history/month member check。emulator test 7/7 pass。本番未 deploy
- 残: junk pair purge → #1-B rules 本番 deploy → exposure 完全 done
- gate: user 獲得は exposure 完全 done まで凍結。monetize は post-GC

## thread / tool
- Boss=product/security、COO=cross-project/escalation、CMO=marketing。全て別 Claude window、CEO が paste で relay。Codex=repo実行、Hermes=Telegram SSOT。
- 新 thread onboarding = この docs/SSOT.md + CLAUDE.md を読む。

## hard rules
- set()のみ merge禁止 / 明示 bucket名 / pairId fallback to default 禁止 / main直pushはCEO承認のみ / 新Vercel function禁止 / 重要決定は Codex が docs/SSOT.md に追記して canonical 維持
