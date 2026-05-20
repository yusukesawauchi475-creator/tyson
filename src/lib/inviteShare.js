const normalizeLang = (lang) => (lang === 'en' || lang === 'es' ? lang : 'ja')

const mailSubject = {
  ja: 'Hum の招待',
  en: 'Hum invitation',
  es: 'Invitación a Hum',
}

export const MESSENGER_CONFIG = {
  ja: [
    { id: 'line', labelKey: 'messengerLine', icon: '🟩', color: '#06C755', textColor: '#fff', url: (msg) => `https://line.me/R/msg/text/?${encodeURIComponent(msg)}` },
    { id: 'sms', labelKey: 'messengerSms', icon: '💬', color: '#36A3FF', textColor: '#fff', url: (msg) => `sms:?body=${encodeURIComponent(msg)}` },
    { id: 'mail', labelKey: 'messengerMail', icon: '✉️', color: '#FF9F43', textColor: '#fff', url: (msg, lang) => `mailto:?subject=${encodeURIComponent(mailSubject[normalizeLang(lang)])}&body=${encodeURIComponent(msg)}` },
    { id: 'copy', labelKey: 'messengerCopy', icon: '📋', color: '#FFFFFF', textColor: '#136B7A' },
  ],
  en: [
    { id: 'imessage', labelKey: 'messengerIMessage', icon: '🔵', color: '#36A3FF', textColor: '#fff', url: (msg) => `sms:?body=${encodeURIComponent(msg)}` },
    { id: 'whatsapp', labelKey: 'messengerWhatsApp', icon: '🟢', color: '#25D366', textColor: '#fff', url: (msg) => `https://wa.me/?text=${encodeURIComponent(msg)}` },
    { id: 'sms', labelKey: 'messengerSms', icon: '💬', color: '#4B9DFF', textColor: '#fff', url: (msg) => `sms:?body=${encodeURIComponent(msg)}` },
    { id: 'mail', labelKey: 'messengerMail', icon: '✉️', color: '#FF9F43', textColor: '#fff', url: (msg, lang) => `mailto:?subject=${encodeURIComponent(mailSubject[normalizeLang(lang)])}&body=${encodeURIComponent(msg)}` },
    { id: 'copy', labelKey: 'messengerCopy', icon: '📋', color: '#FFFFFF', textColor: '#136B7A' },
  ],
  es: [
    { id: 'whatsapp', labelKey: 'messengerWhatsApp', icon: '🟢', color: '#25D366', textColor: '#fff', url: (msg) => `https://wa.me/?text=${encodeURIComponent(msg)}` },
    { id: 'sms', labelKey: 'messengerSms', icon: '💬', color: '#36A3FF', textColor: '#fff', url: (msg) => `sms:?body=${encodeURIComponent(msg)}` },
    { id: 'mail', labelKey: 'messengerMail', icon: '✉️', color: '#FF9F43', textColor: '#fff', url: (msg, lang) => `mailto:?subject=${encodeURIComponent(mailSubject[normalizeLang(lang)])}&body=${encodeURIComponent(msg)}` },
    { id: 'copy', labelKey: 'messengerCopy', icon: '📋', color: '#FFFFFF', textColor: '#136B7A' },
  ],
}

export function getMessengerTargets(lang) {
  return MESSENGER_CONFIG[normalizeLang(lang)]
}

export function getInviteChildNameFallback(lang) {
  const locale = normalizeLang(lang)
  if (locale === 'en') return 'Your child'
  if (locale === 'es') return 'Tu hijo'
  return 'お子さん'
}

export function buildInviteMessage(lang, childName, slugUrl) {
  const locale = normalizeLang(lang)
  const name = childName || getInviteChildNameFallback(locale)
  const templates = {
    ja: `${name}から Hum の招待です。家族で毎日の声を交換しませんか?\n${slugUrl}`,
    en: `${name} invited you to Hum. Let's exchange daily voice messages.\n${slugUrl}`,
    es: `${name} te invitó a Hum. Intercambiemos mensajes de voz diarios.\n${slugUrl}`,
  }
  return templates[locale]
}
