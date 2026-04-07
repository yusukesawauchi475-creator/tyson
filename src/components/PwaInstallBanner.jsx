import { useState, useEffect, useRef } from 'react'

const DISMISS_KEY = 'hum_pwa_dismiss'
const DISMISS_HOURS = 24

function isDismissed() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (!ts) return false
    return Date.now() - Number(ts) < DISMISS_HOURS * 3600 * 1000
  } catch { return false }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function PwaInstallBanner({ lang = 'ja' }) {
  const [show, setShow] = useState(false)
  const [iosMode, setIosMode] = useState(false)
  const deferredPrompt = useRef(null)

  useEffect(() => {
    if (isStandalone() || isDismissed()) return

    if (isIOS()) {
      setIosMode(true)
      setShow(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      deferredPrompt.current = e
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setShow(false)
  }

  const install = async () => {
    const prompt = deferredPrompt.current
    if (!prompt) return
    prompt.prompt()
    await prompt.userChoice
    deferredPrompt.current = null
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #F8F0FF, #FFF0F8)',
      borderTop: '2px solid #E8D8FF',
      padding: '16px 18px max(16px, env(safe-area-inset-bottom))',
      boxShadow: '0 -4px 24px rgba(160,96,255,0.15)',
      animation: 'pwaSlideUp 0.3s ease-out',
    }}>
      <style>{`@keyframes pwaSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480, margin: '0 auto' }}>
        <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#5040A0', margin: 0 }}>
            {lang === 'en' ? 'Add Hum to Home Screen' : 'Humをホーム画面に追加'}
          </p>
          {iosMode ? (
            <p style={{ fontSize: 12, color: '#8070A0', margin: '4px 0 0', lineHeight: 1.4 }}>
              {lang === 'en'
                ? 'Tap the share button ⬆ then "Add to Home Screen"'
                : '共有ボタン ⬆ →「ホーム画面に追加」をタップ'}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: '#8070A0', margin: '4px 0 0' }}>
              {lang === 'en' ? 'Quick access from your home screen' : 'ホーム画面からすぐアクセス'}
            </p>
          )}
        </div>
        {!iosMode && (
          <button type="button" onClick={install} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #B080FF, #8050D0)', border: 'none',
            borderRadius: 10, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            {lang === 'en' ? 'Install' : '追加'}
          </button>
        )}
        <button type="button" onClick={dismiss} style={{
          padding: 4, fontSize: 18, color: '#B0A0C0', background: 'none',
          border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1,
        }} aria-label="Close">✕</button>
      </div>
    </div>
  )
}
