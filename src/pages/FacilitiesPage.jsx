import { useState } from 'react'
import { Link } from 'react-router-dom'
import LanguageSwitch from '../components/LanguageSwitch'
import { t } from '../lib/i18n'

const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT

const valueCards = [
  {
    icon: '🎤',
    titleKey: 'facilityPageValue1Title',
    background: 'linear-gradient(145deg, #f0eeff, #e8f0ff)',
    shadow: '0 4px 0 #c8b8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  {
    icon: '🆓',
    titleKey: 'facilityPageValue2Title',
    background: 'linear-gradient(145deg, #fff0f5, #fff5ee)',
    shadow: '0 4px 0 #f0b8cc, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  {
    icon: '🌐',
    titleKey: 'facilityPageValue3Title',
    background: 'linear-gradient(145deg, #f4f0ff, #ede8ff)',
    shadow: '0 4px 0 #c0a8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
]

const memoryPhotos = [
  '/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png',
  '/demo-photos/pakutaso_go33036_TP_V.jpg',
  '/demo-photos/Gemini_Generated_Image_7if52r7if52r7if5.png',
  '/demo-photos/CCIMG_8140_TP_V4.webp',
  '/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp',
  '/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png',
]

const steps = [
  { icon: '🎙️', titleKey: 'facilityPageStep1' },
  { icon: '📤', titleKey: 'facilityPageStep2' },
  { icon: '🔊', titleKey: 'facilityPageStep3' },
]

const fieldStyle = {
  width: '100%',
  background: '#fff',
  border: '1px solid rgba(0,150,199,0.2)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'var(--font-sans)',
  color: '#2A1840',
  outlineColor: '#0096c7',
}

export default function FacilitiesPage({ lang = 'ja' }) {
  const [facilityName, setFacilityName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!FORMSPREE_ENDPOINT) {
      setError(t(lang, 'facilityPageFormError'))
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityName, contactName, email, message }),
      })
      if (response.ok) setSubmitted(true)
      else setError(t(lang, 'facilityPageFormError'))
    } catch (err) {
      setError(t(lang, 'facilityPageFormError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', overflow: 'hidden' }}>
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, rgba(0,180,216,0.28), rgba(0,150,199,0.22), rgba(72,202,228,0.20))', borderBottom: '1px solid rgba(255,255,255,0.35)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hum" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} />
          <span style={{ fontSize: 24, fontWeight: 800, color: '#005f80', textShadow: '0 1px 4px rgba(0,80,120,0.2)' }}>Hum</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LanguageSwitch lang={lang} />
        </div>
      </header>

      <main className="page" style={{ padding: '0 8px 28px', gap: 18, maxWidth: 375 }}>
        <section style={{ padding: '48px 24px 32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#005f80', margin: '0 0 12px', lineHeight: 1.25 }}>
            {t(lang, 'facilityPageHeroTitle')}
          </h1>
          <p style={{ fontSize: 15, color: '#6B5B95', lineHeight: 1.6, margin: '0 auto', maxWidth: 300, overflowWrap: 'anywhere' }}>
            {t(lang, 'facilityPageHeroSub')}
          </p>
        </section>

        <section style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 16px rgba(80,40,120,0.07)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#005f80', margin: '0 0 14px' }}>
            {t(lang, 'facilityPageHowTitle')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {steps.map((step, index) => (
              <div key={step.titleKey} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', color: '#0096c7', border: '1px solid rgba(0,150,199,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{index + 1}</span>
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{step.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#005f80', minWidth: 86, textAlign: 'left' }}>{t(lang, step.titleKey)}</span>
                </div>
                {index < steps.length - 1 && (
                  <div style={{ fontSize: 16, color: '#0096c7', marginTop: 8, lineHeight: 1 }}>↓</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Phase 2-A: Screenshot animation section */}
        <section className="facility-animation-section">
          <div className="facility-iphone-frame">
            <div className="facility-iphone-screen">
              <div className="facility-screen facility-screen-1">
                <div style={{ height: '100%', background: '#FFF8FF', fontFamily: 'Nunito, var(--font-sans)', color: '#005f80' }}>
                  <div style={{ background: 'linear-gradient(135deg, rgba(0,180,216,0.28), rgba(0,150,199,0.22), rgba(72,202,228,0.20))', padding: '7px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img src="/logo.png" alt="Hum" width={22} height={22} style={{ borderRadius: 7, objectFit: 'cover' }} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#005f80' }}>Hum</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ background: '#f0eeff', borderRadius: 999, padding: '2px 7px', fontSize: 8, fontWeight: 800, color: '#6B5B95' }}>55日目</span>
                      <span style={{ background: '#f0eeff', borderRadius: 999, padding: '2px 7px', fontSize: 8, fontWeight: 800, color: '#e879a0' }}>🔥7日連続</span>
                    </div>
                  </div>
                  <div style={{ padding: '9px 10px 0' }}>
                    <div style={{ color: '#8A80A0', fontSize: 9, fontWeight: 700, marginBottom: 8 }}>2026年5月18日(月)</div>
                    <div style={{ background: 'linear-gradient(145deg, #f0eeff, #e8f0ff)', borderRadius: 14, padding: 10, opacity: 0.5, boxShadow: '0 3px 0 #c8b8f0, 0 5px 10px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)', marginBottom: 9 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#6B5B95', marginBottom: 7 }}>相手の録音</div>
                      <div style={{ height: 25, borderRadius: 9, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)' }} />
                    </div>
                    <div style={{ background: 'linear-gradient(145deg, #fff0f5, #fff5ee)', borderRadius: 16, padding: 12, boxShadow: '0 4px 0 #f0b8cc, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#a04060', marginBottom: 10 }}>自分の録音</div>
                      <div style={{ height: 34, borderRadius: 10, background: 'linear-gradient(90deg, #c084fc, #e879a0, #f97316)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>🎙️ 録音</div>
                    </div>
                    <div style={{ marginTop: 10, height: 80, borderRadius: 14, background: 'linear-gradient(145deg, #f4f0ff, #ede8ff)', opacity: 0.45 }} />
                  </div>
                </div>
              </div>

              <div className="facility-screen facility-screen-2">
                <div style={{ height: '100%', background: '#FFF8FF', fontFamily: 'Nunito, var(--font-sans)', color: '#005f80' }}>
                  <div style={{ background: 'linear-gradient(135deg, rgba(0,180,216,0.28), rgba(0,150,199,0.22), rgba(72,202,228,0.20))', padding: '7px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img src="/logo.png" alt="Hum" width={22} height={22} style={{ borderRadius: 7, objectFit: 'cover' }} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#005f80' }}>Hum</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ background: '#f0eeff', borderRadius: 999, padding: '2px 7px', fontSize: 8, fontWeight: 800, color: '#6B5B95' }}>55日目</span>
                      <span style={{ background: '#f0eeff', borderRadius: 999, padding: '2px 7px', fontSize: 8, fontWeight: 800, color: '#e879a0' }}>🔥7日連続</span>
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px 0' }}>
                    <div style={{ color: '#8A80A0', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>2026年5月19日(火)</div>
                    <div style={{ background: 'linear-gradient(90deg, rgba(255,180,200,.35), rgba(255,210,180,.35))', border: '1px solid rgba(255,140,170,.3)', color: '#a04060', borderRadius: 9, padding: '5px 7px', fontSize: 9, fontWeight: 800, marginBottom: 8 }}>🌸 父の日まで あと33日</div>
                    <div style={{ background: 'linear-gradient(145deg, #f0eeff, #e8f0ff)', borderRadius: 16, padding: 12, boxShadow: '0 4px 0 #c8b8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#6B5B95' }}>相手の録音</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#e04040' }}>🔴 届いてます</span>
                      </div>
                      <div style={{ height: 34, borderRadius: 10, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>▶ 再生 (1/3) 🔴</div>
                    </div>
                    <div style={{ background: 'linear-gradient(145deg, #fff0f5, #fff5ee)', borderRadius: 14, padding: 10, opacity: 0.5, boxShadow: '0 3px 0 #f0b8cc, 0 5px 10px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#a04060', marginBottom: 7 }}>自分の録音</div>
                      <div style={{ height: 25, borderRadius: 9, background: 'linear-gradient(90deg, #c084fc, #e879a0, #f97316)' }} />
                    </div>
                    <div style={{ marginTop: 10, height: 72, borderRadius: 14, background: 'linear-gradient(145deg, #f4f0ff, #ede8ff)', opacity: 0.45 }} />
                  </div>
                </div>
              </div>

              <div className="facility-screen facility-screen-3">
                <div style={{ height: '100%', background: '#FFF8FF', fontFamily: 'Nunito, var(--font-sans)', color: '#005f80' }}>
                  <div style={{ background: 'linear-gradient(135deg, rgba(0,180,216,0.28), rgba(0,150,199,0.22), rgba(72,202,228,0.20))', padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img src="/logo.png" alt="Hum" width={22} height={22} style={{ borderRadius: 7, objectFit: 'cover' }} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#005f80' }}>Hum</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#005f80' }}>📷 アルバム</span>
                  </div>
                  <div style={{ padding: '11px 10px' }}>
                    {[
                      ['2026年 5月', ['#ffe4ef', '#e8f0ff', '#fff5ee', '#f4f0ff', '#e8f0ff', '#ffe4ef', '#fff5ee', '#f4f0ff']],
                      ['2026年 4月', ['#f4f0ff', '#fff5ee', '#e8f0ff', '#ffe4ef']],
                      ['2026年 3月', ['#fff5ee', '#f4f0ff', '#ffe4ef', '#e8f0ff']],
                    ].map(([month, colors]) => (
                      <div key={month} style={{ marginBottom: 10 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#005f80', margin: '0 0 6px' }}>{month}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                          {colors.map((color, index) => (
                            <div key={`${month}-${index}`} style={{ aspectRatio: '1 / 1', borderRadius: 8, background: `linear-gradient(145deg, ${color}, #ffffff)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.85), 0 2px 5px rgba(80,40,120,.06)', padding: 2 }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="facility-page-indicator">
            <span className="dot dot-1" />
            <span className="dot dot-2" />
            <span className="dot dot-3" />
          </div>

          <div className="facility-caption-container">
            <div className="facility-caption facility-caption-1">{t(lang, 'facilityPageAnimCaption1')}</div>
            <div className="facility-caption facility-caption-2">{t(lang, 'facilityPageAnimCaption2')}</div>
            <div className="facility-caption facility-caption-3">{t(lang, 'facilityPageAnimCaption3')}</div>
          </div>
        </section>

        <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: '0 2px' }}>
          {valueCards.map((card) => (
            <div key={card.titleKey} style={{ background: card.background, borderRadius: 999, padding: '8px 10px', boxShadow: '0 2px 8px rgba(80,40,120,0.07), inset 0 1px 0 rgba(255,255,255,0.8)', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34 }}>
              <span style={{ fontSize: card.titleKey === 'facilityPageValue2Title' ? 10 : 16, lineHeight: 1, fontWeight: 900, color: card.titleKey === 'facilityPageValue2Title' ? '#e06080' : undefined }}>{card.titleKey === 'facilityPageValue2Title' ? 'FREE' : card.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#005f80', whiteSpace: 'nowrap' }}>{t(lang, card.titleKey)}</span>
            </div>
          ))}
        </section>

        <section style={{ background: '#fff', borderRadius: 16, padding: '22px 16px', boxShadow: '0 2px 16px rgba(80,40,120,0.07)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#005f80', margin: '0 0 6px' }}>
            {t(lang, 'facilityPageMemoryTitle')}
          </h2>
          <p style={{ fontSize: 13, color: '#6B5B95', lineHeight: 1.5, margin: '0 0 16px' }}>
            {t(lang, 'facilityPageMemorySub')}
          </p>
          <div className="facility-memory-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {memoryPhotos.map((src) => (
              <div key={src} className="facility-memory-photo" style={{ aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', boxShadow: '0 5px 14px rgba(80,40,120,0.12)', background: '#f4f0ff' }}>
                <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', boxShadow: '0 2px 16px rgba(80,40,120,0.07)' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#005f80', margin: '0 0 8px' }}>
                {t(lang, 'facilityPageFormDoneTitle')}
              </h2>
              <p style={{ fontSize: 14, color: '#6B5B95', lineHeight: 1.6, margin: 0 }}>
                {t(lang, 'facilityPageFormDoneBody')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#005f80', margin: '0 0 4px', textAlign: 'center' }}>
                {t(lang, 'facilityPageFormTitle')}
              </h2>
              <input required value={facilityName} onChange={(e) => setFacilityName(e.target.value)} placeholder={t(lang, 'facilityPageFormFacilityName')} style={fieldStyle} />
              <input required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t(lang, 'facilityPageFormContactName')} style={fieldStyle} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t(lang, 'facilityPageFormEmail')} style={fieldStyle} />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t(lang, 'facilityPageFormMessage')} style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} />
              {error && <p role="alert" style={{ color: '#E04040', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{error}</p>}
              <button type="submit" disabled={submitting} style={{ width: '100%', padding: '12px 24px', fontSize: 16, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', border: 'none', borderRadius: 12, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.75 : 1 }}>
                {submitting ? t(lang, 'facilityPageFormSubmitting') : t(lang, 'facilityPageFormSubmit')}
              </button>
            </form>
          )}
        </section>

        <footer style={{ textAlign: 'center', padding: '8px 0 12px' }}>
          <Link to="/" style={{ fontSize: 14, color: '#0096c7', fontWeight: 700, textDecoration: 'none' }}>
            {t(lang, 'facilityPageFooterBack')}
          </Link>
        </footer>
      </main>
    </div>
  )
}
