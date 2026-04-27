import { useState, useEffect } from 'react'
import { getIdTokenForApi } from '../lib/firebase'
import { copyInviteLink } from '../lib/invite'

/**
 * WelcomePage — DEMO CTA 経由で来訪した user に新 pair を自動発行する page
 *
 * Phase X-2.5-fix: acquisition flow 完成のための新規 page
 * 広告 → DEMO link → 録音体験 → CTA モーダル → /welcome → 新 pair 発行 → 家族 LINE 送信
 *
 * mount 時に anonymous auth (getIdTokenForApi 内包) + create-welcome endpoint 呼び出し、
 * 発行された URL を表示してコピー / LINE share / 即起動を支援する。
 *
 * TODO(Phase Y): email 入力 + magic link auth による retention 強化
 */
export default function WelcomePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pairUrl, setPairUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const createPair = async () => {
      try {
        // anonymous sign-in 自動 (getIdTokenForApi が内包)
        const idToken = await getIdTokenForApi()
        if (!idToken) throw new Error('auth_failed')

        const res = await fetch('/api/invite?action=create-welcome', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({}),
        })

        if (!res.ok) {
          throw new Error(`create_failed_${res.status}`)
        }

        const data = await res.json()
        if (!data.success || !data.url) {
          throw new Error('invalid_response')
        }

        if (!cancelled) {
          setPairUrl(data.url)
          setLoading(false)
        }
      } catch (err) {
        console.error('[WelcomePage] create pair failed:', err)
        if (!cancelled) {
          setError(err.message || 'unknown_error')
          setLoading(false)
        }
      }
    }
    createPair()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCopy = async () => {
    if (!pairUrl) return
    const result = await copyInviteLink(pairUrl)
    if (result?.success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLineShare = () => {
    if (!pairUrl) return
    const text = `家族専用の音声メッセージリンクができました\n\n${pairUrl}`
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
    window.open(lineUrl, '_blank')
  }

  const handleStart = () => {
    if (!pairUrl) return
    window.location.href = pairUrl
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: 18, textAlign: 'center', color: '#666', margin: 0 }}>
            あなたの家族専用リンクを発行しています...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: 16, textAlign: 'center', color: '#c33', marginTop: 0, marginBottom: 16 }}>
            リンク発行に失敗しました
          </p>
          <p style={{ fontSize: 14, textAlign: 'center', color: '#666', margin: 0 }}>
            少し時間をおいてから、もう一度お試しください
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ ...buttonStyle, background: '#666', marginTop: 20 }}
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 0, marginBottom: 8, color: '#333' }}>
          Hum へようこそ
        </h1>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
          あなたの家族専用リンクができました。
          <br />
          ご家族にこのリンクを LINE 等で送ってください。
        </p>

        <div style={urlBoxStyle}>
          <p
            style={{
              fontSize: 16,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              color: '#333',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {pairUrl}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{ ...buttonStyle, background: copied ? '#4caf50' : '#666' }}
          >
            {copied ? '✓ コピーしました' : '📋 リンクをコピー'}
          </button>
          <button
            type="button"
            onClick={handleLineShare}
            style={{ ...buttonStyle, background: '#06C755' }}
          >
            LINE で送る
          </button>
          <button
            type="button"
            onClick={handleStart}
            style={{
              ...buttonStyle,
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            Hum を始める
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#999', marginTop: 20, marginBottom: 0, textAlign: 'center', lineHeight: 1.5 }}>
          このリンクは家族専用です。
          <br />
          外部の方には共有しないでください。
        </p>
      </div>
    </div>
  )
}

const containerStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #fce7f3 0%, #ede9fe 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: 'Nunito, sans-serif',
}

const cardStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  maxWidth: 500,
  width: '100%',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
}

const urlBoxStyle = {
  background: '#f5f5f5',
  borderRadius: 8,
  padding: 16,
  border: '1px solid #ddd',
}

const buttonStyle = {
  padding: '14px 24px',
  borderRadius: 8,
  border: 'none',
  background: '#666',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  width: '100%',
  fontFamily: 'Nunito, sans-serif',
}
