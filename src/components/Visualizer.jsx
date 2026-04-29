import { useEffect, useRef } from 'react'

const BAR_COUNT = 24
const BAR_GAP = 3
const MIN_BAR = 3

function isAnalyser(s) {
  return typeof AnalyserNode !== 'undefined' && s instanceof AnalyserNode
}

function isStream(s) {
  return typeof MediaStream !== 'undefined' && s instanceof MediaStream
}

function drawBars(canvas, dataArray, color, cssW, cssH, alpha) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.globalAlpha = alpha

  const barW = (cssW - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
  const cy = cssH / 2
  const samplesPerBin = Math.floor(dataArray.length / BAR_COUNT) || 1
  const useRound = typeof ctx.roundRect === 'function'
  const radius = Math.min(barW / 2, 3)

  for (let i = 0; i < BAR_COUNT; i++) {
    let sum = 0
    for (let j = 0; j < samplesPerBin; j++) {
      const v = (dataArray[i * samplesPerBin + j] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / samplesPerBin)
    const h = Math.max(MIN_BAR, Math.min(cssH, rms * cssH * 1.8))
    const x = i * (barW + BAR_GAP)
    const y = cy - h / 2

    if (useRound) {
      ctx.beginPath()
      ctx.roundRect(x, y, barW, h, radius)
      ctx.fill()
    } else {
      ctx.fillRect(x, y, barW, h)
    }
  }

  ctx.globalAlpha = 1
}

function drawIdle(canvas, color, cssW, cssH) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.35

  const barW = (cssW - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
  const cy = cssH / 2
  const useRound = typeof ctx.roundRect === 'function'
  const radius = Math.min(barW / 2, 3)
  const y = cy - MIN_BAR / 2

  for (let i = 0; i < BAR_COUNT; i++) {
    const x = i * (barW + BAR_GAP)
    if (useRound) {
      ctx.beginPath()
      ctx.roundRect(x, y, barW, MIN_BAR, radius)
      ctx.fill()
    } else {
      ctx.fillRect(x, y, barW, MIN_BAR)
    }
  }

  ctx.globalAlpha = 1
}

export default function Visualizer({ source, active = true, height = 60, color = '#c0536e' }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const rafRef = useRef(null)
  const ownedCtxRef = useRef(null)
  const ownedSourceRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cssW = wrapper.clientWidth || 320
    const cssH = height
    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    canvas.style.width = '100%'
    canvas.style.height = cssH + 'px'

    drawIdle(canvas, color, cssW, cssH)

    if (!source || !active) {
      return () => {}
    }

    let analyser = null
    let cleanupOwned = false

    if (isAnalyser(source)) {
      analyser = source
    } else if (isStream(source)) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return () => {}
      try {
        const audioCtx = new Ctx()
        ownedCtxRef.current = audioCtx
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {})
        }
        const sourceNode = audioCtx.createMediaStreamSource(source)
        ownedSourceRef.current = sourceNode
        const a = audioCtx.createAnalyser()
        a.fftSize = 1024
        a.smoothingTimeConstant = 0.75
        sourceNode.connect(a)
        analyser = a
        cleanupOwned = true
      } catch (e) {
        return () => {}
      }
    }

    if (!analyser) return () => {}

    const dataArray = new Uint8Array(analyser.fftSize)

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray)
      drawBars(canvas, dataArray, color, cssW, cssH, 1)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (cleanupOwned) {
        try { ownedSourceRef.current?.disconnect() } catch (_) {}
        ownedSourceRef.current = null
        try { ownedCtxRef.current?.close() } catch (_) {}
        ownedCtxRef.current = null
      }
      drawIdle(canvas, color, cssW, cssH)
    }
  }, [source, active, height, color])

  const fixed = {
    height: height + 'px',
    minHeight: height + 'px',
    maxHeight: height + 'px',
    width: '100%',
    overflow: 'hidden',
    display: 'block',
  }

  return (
    <div ref={wrapperRef} style={fixed} aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: height + 'px' }} />
    </div>
  )
}
