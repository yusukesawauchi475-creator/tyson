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

      <main className="page" style={{ padding: '0 8px 28px', gap: 18 }}>
        <section style={{ padding: '48px 24px 32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#005f80', margin: '0 0 12px', lineHeight: 1.25 }}>
            {t(lang, 'facilityPageHeroTitle')}
          </h1>
          <p style={{ fontSize: 15, color: '#6B5B95', lineHeight: 1.6, margin: 0 }}>
            {t(lang, 'facilityPageHeroSub')}
          </p>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {valueCards.map((card) => (
            <div key={card.titleKey} style={{ background: card.background, borderRadius: 16, padding: '24px 20px', boxShadow: card.shadow, textAlign: 'center' }}>
              <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#005f80' }}>{t(lang, card.titleKey)}</div>
            </div>
          ))}
        </section>

        <section style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', boxShadow: '0 2px 16px rgba(80,40,120,0.07)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#005f80', margin: '0 0 18px' }}>
            {t(lang, 'facilityPageHowTitle')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            {steps.map((step, index) => (
              <div key={step.titleKey} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', color: '#0096c7', border: '1px solid rgba(0,150,199,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{index + 1}</span>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{step.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#005f80', minWidth: 96, textAlign: 'left' }}>{t(lang, step.titleKey)}</span>
                </div>
                {index < steps.length - 1 && (
                  <div style={{ fontSize: 18, color: '#0096c7', marginTop: 10, lineHeight: 1 }}>↓</div>
                )}
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
