/**
 * 段階10-b: 全画面で current role を常時表示するバッジ。
 * user perspective で「今どちらの役割か」を常に見せて、誤 upload を防ぐ。
 * onClick を渡すと role 変更の trigger として機能（Switch button を吸収）。
 */
export default function RoleBadge({ role, lang = 'ja', onClick }) {
  const text = lang === 'en'
    ? (role === 'parent' ? 'Now: Parent' : role === 'child' ? 'Now: Child' : 'Now: Unset')
    : (role === 'parent' ? '現在：親' : role === 'child' ? '現在：子' : '現在：未選択')

  const bg = role === 'parent' ? '#FFE0EC' : role === 'child' ? '#E0F5E0' : '#EEEEEE'
  const color = role === 'parent' ? '#C24080' : role === 'child' ? '#408040' : '#666666'
  const border = role === 'parent' ? '#F0B0C8' : role === 'child' ? '#B0D8B0' : '#CCCCCC'

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
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

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style}>{text}</button>
    )
  }
  return <span style={style}>{text}</span>
}
