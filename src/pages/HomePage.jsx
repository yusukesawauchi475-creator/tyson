import { useState, useRef } from 'react'
import { uploadAudio } from '../lib/pairDaily'

export default function HomePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sentAt, setSentAt] = useState(null)
  const [errorLine, setErrorLine] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordStartRef = useRef(null)

  const startRecording = async () => {
    setErrorLine(null)
    setSentAt(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/aac')) mimeType = 'audio/aac'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recordStartRef.current = Date.now()

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        const duration = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : 0

        if (duration < 1 || blob.size < 4 * 1024) {
          setErrorLine('もう一度お試しください')
          return
        }

        setIsUploading(true)
        const result = await uploadAudio(blob)

        if (result.success) {
          setSentAt(new Date())
          setErrorLine(null)
        } else {
          const reqId = result.requestId || 'REQ-XXXX'
          setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
          if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
        }
        setIsUploading(false)

        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      mr.start()
      setIsRecording(true)
    } catch (e) {
      setErrorLine('マイクへのアクセスが許可されていません')
      if (import.meta.env.DEV) console.error('startRecording:', e)
    }
  }

  const stopRecording = () => {
    if (!isRecording || isUploading) return
    const mr = mediaRecorderRef.current
    if (mr?.state === 'recording') mr.stop()
    setIsRecording(false)
  }

  const handleClick = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const sentAtStr = sentAt
    ? sentAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: '#fff',
      color: '#333',
    }}>
      <header style={{ flexShrink: 0, marginBottom: 24 }}>
        <time style={{ fontSize: 14, color: '#666' }}>
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </time>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isUploading}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '18px 24px',
            fontSize: 18,
            fontWeight: 500,
            color: '#fff',
            background: isUploading ? '#999' : isRecording ? '#c00' : '#4a90d9',
            border: 'none',
            borderRadius: 12,
            cursor: isUploading ? 'wait' : 'pointer',
          }}
        >
          {isUploading ? '送信中...' : isRecording ? '停止' : '録音'}
        </button>

        {sentAt && (
          <p style={{ fontSize: 16, color: '#2e7d32', fontWeight: 500, margin: 0 }}>
            送信完了（{sentAtStr}）
          </p>
        )}

        {errorLine && (
          <p style={{ fontSize: 14, color: '#c00', textAlign: 'center', margin: 0 }}>
            {errorLine}
          </p>
        )}
      </main>
    </div>
  )
}
