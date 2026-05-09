import { useSearchParams } from 'react-router-dom'

/**
 * 日本語 / English / Español 切替（URL クエリ ?lang=ja|en|es + localStorage 'hum_lang' 永続化）。
 * URL path は変えず、lang クエリパラメータのみ更新する。
 */
export default function LanguageSwitch({ lang = 'ja' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentLang = searchParams.get('lang') || lang

  const goTo = (targetLang) => {
    if (targetLang === currentLang) return
    try { localStorage.setItem('hum_lang', targetLang) } catch (_) {}
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
  const middleStyle = {
    ...baseStyle,
    borderRight: 'none',
  }
  const rightStyle = {
    ...baseStyle,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  }
  const leftActive = { ...leftStyle, ...activeStyle }
  const middleActive = { ...middleStyle, ...activeStyle }
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
        style={currentLang === 'en' ? middleActive : middleStyle}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => goTo('es')}
        style={currentLang === 'es' ? rightActive : rightStyle}
      >
        Español
      </button>
    </div>
  )
}
