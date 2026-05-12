import { useState, useEffect, useRef } from 'react'

export const BANNER_HEIGHT = 56

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

export default function PwaInstallBanner({ lang = 'ja', onVisibilityChange }) {
  const [show, setShow] = useState(false)
  const deferredPrompt = useRef(null)

  useEffect(() => {
    // Android only — skip iOS and standalone
    if (isStandalone() || isDismissed() || isIOS()) return

    const handler = (e) => {
      e.preventDefault()
      deferredPrompt.current = e
      setShow(true)
      onVisibilityChange?.(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setShow(false)
    onVisibilityChange?.(false)
  }

  const install = async () => {
    const prompt = deferredPrompt.current
    if (!prompt) return
    prompt.prompt()
    await prompt.userChoice
    deferredPrompt.current = null
    setShow(false)
    onVisibilityChange?.(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      height: BANNER_HEIGHT,
      background: 'linear-gradient(135deg, #F8F0FF, #FFF0F8)',
      borderBottom: '1px solid #E8D8FF',
      boxShadow: '0 2px 12px rgba(160,96,255,0.12)',
      animation: 'pwaSlideDown 0.3s ease-out',
    }}>
      <style>{`@keyframes pwaSlideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 480, margin: '0 auto', height: '100%', padding: '0 14px' }}>
        <img src="/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: 8, flexShrink: 0 }} />
        <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#5040A0', margin: 0, minWidth: 0 }}>
          {lang === 'en' ? 'Add Hum to Home Screen' : lang === 'es' ? 'Add Hum to Home Screen' : 'Humをホーム画面に追加'}
        </p>
        <button type="button" onClick={install} style={{
          padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg, #B080FF, #8050D0)', border: 'none',
          borderRadius: 8, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {lang === 'en' ? 'Install' : lang === 'es' ? 'Install' : '追加'}
        </button>
        <button type="button" onClick={dismiss} style={{
          padding: 4, fontSize: 16, color: '#B0A0C0', background: 'none',
          border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1,
        }} aria-label="Close">✕</button>
      </div>
    </div>
  )
}
