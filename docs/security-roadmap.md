# Hum セキュリティ硬化 roadmap
更新: 2026-06-05 / 方針: MVP は現水準で十分。以下は trigger 駆動の plan。今は build しない。

## 現状 (MVP・十分)
- Firestore/Storage member-only rules 本番稼働、非 member 403。
- access モデル = slug 保持で claim-on-load により member 化 (capability-based)。
- 公開/demo 面からの実家族 data 露出なし (2026-06-05 実測監査で確認)。

## Tier 1 (安・随時、infra ~$0・開発数日)
- resolve に rate-limit (slug 総当たり対策)。
- 全 slug 8文字 random 強制、legacy 6文字を upstream 一括 migration。

## join 制御 (leak link 対策・login 不要)
- member 数が「想定数」に達したら自動 join を締める。想定数は固定2でなく可変: child+両親=3、兄弟利用等。owner が明示的に新 member 追加を開閉する方式。
- leak link を第三者が開いても確定済 pair には join 不可 (403)。既存 member 無傷。

## Tier 2 (trigger = 本気の介護施設/B2B 案件、COO flag)
- 非対称 auth: owner のみ one-tap login (Google/Apple/email magic link)、親は account 不要のまま閲覧。売り「親は account 不要」維持。
- 招待/承認制 membership (みてね式: owner 明示招待、招待者のみ閲覧)。leak link 単体では入れない。
- trigger: B2B buyer は契約前に実 identity 保証を要求 → 施設案件発生で deal-gate 化。設計を先行 ready にし即着手。

## Tier 3/4 (長期・規模次第、実費大)
- Tier 3: E2EE (server も録音/写真を読めない)。鍵管理、server側AI insight とのトレードオフ。
- Tier 4: SOC 2 / ISO 27001、定期 pentest、人員。年 $50-150K+ (推測)。enterprise/規制義務時のみ。

## trigger まとめ
- consumer scale 拡大 → Tier 1 / join 制御
- 本気の施設/B2B 案件 → Tier 2 (deal-gate)
- enterprise/規制 → Tier 3/4
