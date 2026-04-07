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
  const [showGuide, setShowGuide] = useState(false)
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
    setShowGuide(false)
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
    <>
      {/* iOS install guide modal */}
      {showGuide && (
        <div onClick={() => setShowGuide(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: '20px 20px 0 0',
            padding: '28px 24px max(28px, env(safe-area-inset-bottom))',
            animation: 'pwaSlideUp 0.3s ease-out',
          }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#5040A0', margin: '0 0 20px', textAlign: 'center' }}>
              {lang === 'en' ? 'Add to Home Screen' : 'ホーム画面に追加'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: '#F0E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#7050C0', flexShrink: 0 }}>1</span>
                <p style={{ fontSize: 14, color: '#5040A0', margin: 0, lineHeight: 1.5 }}>
                  {lang === 'en'
                    ? <>Tap the <strong>Share</strong> button <span style={{ fontSize: 18, verticalAlign: 'middle' }}>⬆</span> at the bottom of Safari</>
                    : <>Safariの下にある<strong>共有ボタン</strong> <span style={{ fontSize: 18, verticalAlign: 'middle' }}>⬆</span> をタップ</>}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: '#F0E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#7050C0', flexShrink: 0 }}>2</span>
                <p style={{ fontSize: 14, color: '#5040A0', margin: 0, lineHeight: 1.5 }}>
                  {lang === 'en'
                    ? <>Scroll down and tap <strong>"Add to Home Screen"</strong></>
                    : <>下にスクロールして<strong>「ホーム画面に追加」</strong>をタップ</>}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: '#F0E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#7050C0', flexShrink: 0 }}>3</span>
                <p style={{ fontSize: 14, color: '#5040A0', margin: 0, lineHeight: 1.5 }}>
                  {lang === 'en'
                    ? <>Tap <strong>"Add"</strong> in the top right</>
                    : <>右上の<strong>「追加」</strong>をタップ</>}
                </p>
              </div>
            </div>

            <button type="button" onClick={() => setShowGuide(false)} style={{
              width: '100%', marginTop: 24, padding: '14px 0', fontSize: 15, fontWeight: 700,
              color: '#7050C0', background: '#F0E8FF', border: 'none', borderRadius: 12, cursor: 'pointer',
            }}>
              {lang === 'en' ? 'Got it' : 'わかった'}
            </button>
          </div>
        </div>
      )}

      {/* Banner */}
      <div
        onClick={iosMode ? () => setShowGuide(true) : undefined}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
          background: 'linear-gradient(135deg, #F8F0FF, #FFF0F8)',
          borderTop: '2px solid #E8D8FF',
          padding: '16px 18px max(16px, env(safe-area-inset-bottom))',
          boxShadow: '0 -4px 24px rgba(160,96,255,0.15)',
          animation: 'pwaSlideUp 0.3s ease-out',
          cursor: iosMode ? 'pointer' : 'default',
        }}
      >
        <style>{`@keyframes pwaSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480, margin: '0 auto' }}>
          <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#5040A0', margin: 0 }}>
              {lang === 'en' ? 'Add Hum to Home Screen' : 'Humをホーム画面に追加'}
            </p>
            <p style={{ fontSize: 12, color: '#8070A0', margin: '4px 0 0' }}>
              {lang === 'en'
                ? (iosMode ? 'Tap here for instructions' : 'Quick access from your home screen')
                : (iosMode ? 'タップして追加方法を見る' : 'ホーム画面からすぐアクセス')}
            </p>
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
          <button type="button" onClick={(e) => { e.stopPropagation(); dismiss() }} style={{
            padding: 4, fontSize: 18, color: '#B0A0C0', background: 'none',
            border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1,
          }} aria-label="Close">✕</button>
        </div>
      </div>
    </>
  )
}
