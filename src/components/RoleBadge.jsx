/**
 * 段階10-b: 全画面で current role を常時表示するバッジ。
 * user perspective で「今どちらの役割か」を常に見せて、誤 upload を防ぐ。
 * onClick を渡すと role 変更の trigger として機能（Switch button を吸収）。
 * 段階11-fix-2: emoji の地肌色（白 vs gold）と背景色を一致させて瞬間識別。
 */
export default function RoleBadge({ role, lang = 'ja', onClick }) {
  const text = lang === 'en'
    ? (role === 'parent' ? 'Now: Parent' : role === 'child' ? 'Now: Child' : 'Now: Unset')
    : (role === 'parent' ? '現在：親' : role === 'child' ? '現在：子' : '現在：未選択')

  const emoji = role === 'parent' ? '👴🏻👵🏻' : role === 'child' ? '👦👧' : ''

  const bg = role === 'parent' ? 'rgba(245, 245, 245, 0.95)' : role === 'child' ? 'rgba(250, 199, 117, 0.95)' : '#EEEEEE'
  const color = role === 'parent' ? '#444' : role === 'child' ? '#633806' : '#666666'
  const border = role === 'parent' ? '#D5D5D5' : role === 'child' ? '#BA7517' : '#CCCCCC'

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: 500,
    color,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 12,
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    lineHeight: 1.3,
  }

  const content = (
    <>
      <span>{text}</span>
      {emoji && <span style={{ fontSize: 14 }}>{emoji}</span>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style}>{content}</button>
    )
  }
  return <span style={style}>{content}</span>
}
