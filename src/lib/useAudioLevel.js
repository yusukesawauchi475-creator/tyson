import { useState, useEffect, useRef } from 'react'

const SPEAKING_THRESHOLD = 0.02

/**
 * 音声ストリームの音量レベルを監視するhook
 * @param {MediaStream} stream - 監視する音声ストリーム
 * @returns {{ level: number, isSpeaking: boolean, start: (stream: MediaStream) => void, stop: () => void }}
 */
export function useAudioLevel() {
  const [level, setLevel] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const rafRef = useRef(null)
  const dataArrayRef = useRef(null)

  // stop を function 宣言にして hoist させる
  function stop() {
    // rafをキャンセル
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    // ノードを切断
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
      } catch (e) {
        // 既に切断済みの場合は無視
      }
      sourceRef.current = null
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect()
      } catch (e) {
        // 既に切断済みの場合は無視
      }
      analyserRef.current = null
    }

    // AudioContextを閉じる
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // 既に閉じられている場合は無視
      })
      audioContextRef.current = null
    }

    // stateをリセット
    setLevel(0)
    setIsSpeaking(false)
  }

  const start = async (stream) => {
    // 既存のAudioContextがあれば停止
    stop()

    try {
      // AudioContextを作成（ユーザー操作後なのでresume不要）
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      // AnalyserNodeを await 前に同期で作成し ref に格納
      // (Visualizer が isRecording の re-render 時に analyserRef.current を確実に取得できるよう、
      //  resume() の await より先に setup する)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source
      source.connect(analyser)

      // iOS/Androidでsuspended状態の場合があるのでresume (node 接続後でも data flow は再開後から開始)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // データ配列を確保
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      dataArrayRef.current = dataArray

      // requestAnimationFrameで更新
      const updateLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) return

        analyserRef.current.getByteTimeDomainData(dataArrayRef.current)

        // RMSを計算
        let sum = 0
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const normalized = (dataArrayRef.current[i] - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / dataArrayRef.current.length)

        setLevel(rms)
        setIsSpeaking(rms > SPEAKING_THRESHOLD)

        rafRef.current = requestAnimationFrame(updateLevel)
      }

      rafRef.current = requestAnimationFrame(updateLevel)
    } catch (e) {
      console.warn('[useAudioLevel] start error:', e)
      stop()
    }
  }

  // unmount時にクリーンアップ
  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { level, isSpeaking, start, stop, analyserRef }
}
