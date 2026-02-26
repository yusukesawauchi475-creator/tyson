/**
 * 日本語 / English 切替（既存ルートへの遷移のみ。データ/API は変更しない）
 * variant: 'home' -> / と /eng, 'pair' -> /tyson と /tyson/eng
 */
export default function LanguageSwitch({ lang = 'ja', variant = 'home' }) {
  const goTo = (targetLang) => {
    if (targetLang === lang) return
    const path = variant === 'home'
      ? (targetLang === 'en' ? '/eng' : '/')
      : (targetLang === 'en' ? '/tyson/eng' : '/tyson')
    const hash = window.location.hash || '#/'
    const search = hash.includes('?') ? hash.slice(hash.indexOf('?')) : (window.location.search || '')
    window.location.hash = path + search
  }

  const baseStyle = {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid #dcdcdc',
    cursor: 'pointer',
    background: '#fff',
    color: '#333',
    transition: 'background 0.15s, color 0.15s',
  }
  const activeStyle = {
    ...baseStyle,
    background: '#4a90d9',
    color: '#fff',
    borderColor: '#4a90d9',
  }
  const leftStyle = {
    ...baseStyle,
    borderRight: 'none',
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  }
  const rightStyle = {
    ...baseStyle,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  }
  const leftActive = { ...leftStyle, ...activeStyle }
  const rightActive = { ...rightStyle, ...activeStyle }

  return (
    <div style={{ display: 'inline-flex', height: 32, flexShrink: 0 }} role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => goTo('ja')}
        style={lang === 'ja' ? leftActive : leftStyle}
      >
        日本語
      </button>
      <button
        type="button"
        onClick={() => goTo('en')}
        style={lang === 'en' ? rightActive : rightStyle}
      >
        English
      </button>
    </div>
  )
}
