import { useSearchParams } from 'react-router-dom'

/**
 * 日本語 / English 切替（URL クエリ ?lang=ja|en で表現）。
 * URL path は変えず、lang クエリパラメータのみ更新する。
 */
export default function LanguageSwitch({ lang = 'ja' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentLang = searchParams.get('lang') || lang

  const goTo = (targetLang) => {
    if (targetLang === currentLang) return
    const next = new URLSearchParams(searchParams)
    next.set('lang', targetLang)
    setSearchParams(next)
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
        style={currentLang === 'ja' ? leftActive : leftStyle}
      >
        日本語
      </button>
      <button
        type="button"
        onClick={() => goTo('en')}
        style={currentLang === 'en' ? rightActive : rightStyle}
      >
        English
      </button>
    </div>
  )
}
