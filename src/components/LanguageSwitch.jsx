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

  const flagStyle = (active) => ({
    padding: '2px 6px',
    fontSize: 18,
    fontWeight: 500,
    border: `1px solid ${active ? 'rgba(0,120,180,0.5)' : 'transparent'}`,
    cursor: 'pointer',
    background: active ? 'rgba(0,150,210,0.12)' : 'transparent',
    opacity: active ? 1 : 0.4,
    color: '#333',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 999,
    transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
  })

  return (
    <div style={{ display: 'inline-flex', height: 28, gap: 4, flexShrink: 0 }} role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => goTo('ja')}
        aria-label="日本語"
        style={flagStyle(currentLang === 'ja')}
      >
        🇯🇵
      </button>
      <button
        type="button"
        onClick={() => goTo('en')}
        aria-label="English"
        style={flagStyle(currentLang === 'en')}
      >
        🇺🇸
      </button>
      <button
        type="button"
        onClick={() => goTo('es')}
        aria-label="Español"
        style={flagStyle(currentLang === 'es')}
      >
        🇪🇸
      </button>
    </div>
  )
}
