/**
 * SHARE_TARGETS - 招待 share の宛先一覧
 *
 * Phase II-share: LINE のみ (今回 implement)
 * 将来拡張時 (WhatsApp / Telegram 等) はこの array に追加するだけで InviteModal が自動 render。
 *
 * URL scheme は全 platform fallback 対応 (iOS / Android / desktop):
 * - LINE: https://line.me/R/msg/text/?<encoded>
 *   - iOS LINE app installed → LINE app 起動 + prefilled
 *   - LINE app なし → LINE web 誘導
 *   - desktop → LINE web 誘導
 * - line://msg/text/... は iOS LINE app のみ動作のため使用禁止
 */

export const SHARE_TARGETS = [
  {
    id: 'line',
    label: 'LINE で送る',
    color: '#06C755',
    textColor: '#FFFFFF',
    url: (text) => `https://line.me/R/msg/text/?${encodeURIComponent(text)}`,
  },
  // 将来追加用 (今回 implement しない、コメントのみ):
  // {
  //   id: 'whatsapp',
  //   label: 'WhatsApp で送る',
  //   color: '#25D366',
  //   textColor: '#FFFFFF',
  //   url: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  // },
  // {
  //   id: 'telegram',
  //   label: 'Telegram で送る',
  //   color: '#0088cc',
  //   textColor: '#FFFFFF',
  //   url: (text) => `https://t.me/share/url?url=${encodeURIComponent(text)}`,
  // },
]
