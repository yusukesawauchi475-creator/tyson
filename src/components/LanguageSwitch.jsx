import { useSearchParams } from 'react-router-dom'

/**
 * 日本語 / English / Español 切替（URL クエリ ?lang=ja|en|es + localStorage 'hum_lang' 永続化）。
 * URL path は変えず、lang クエリパラメータのみ更新する。
 */
const LANG_COUNTRY = { ja: 'jp', en: 'us', es: 'other' }

export default function LanguageSwitch({ lang = 'ja' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentLang = searchParams.get('lang') || lang

  const goTo = (targetLang) => {
    if (targetLang === currentLang) return
    try { localStorage.setItem('hum_lang', targetLang) } catch (_) {}
    try { localStorage.setItem('hum_country', LANG_COUNTRY[targetLang] ?? 'jp') } catch (_) {}
    const next = new URLSearchParams(searchParams)
    next.set('lang', targetLang)
    setSearchParams(next)
  }

  const baseStyle = {
    padding: '2px 8px',
    fontSize: 18,
    fontWeight: 500,
    border: '1px solid #dcdcdc',
    cursor: 'pointer',
    background: '#fff',
    color: '#333',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.15s, border-color 0.15s',
  }
  const activeStyle = {
    ...baseStyle,
    background: '#DDD0FF',
    color: '#333',
    borderColor: '#B8A0E8',
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
    <div style={{ display: 'inline-flex', height: 28, flexShrink: 0 }} role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => goTo('ja')}
        aria-label="日本語"
        style={currentLang === 'ja' ? leftActive : leftStyle}
      >
        🇯🇵
      </button>
      <button
        type="button"
        onClick={() => goTo('en')}
        aria-label="English"
        style={currentLang === 'en' ? middleActive : middleStyle}
      >
        🇺🇸
      </button>
      <button
        type="button"
        onClick={() => goTo('es')}
        aria-label="Español"
        style={currentLang === 'es' ? rightActive : rightStyle}
      >
        🇪🇸
      </button>
    </div>
  )
}
