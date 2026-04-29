import { useEffect, useRef } from 'react'

const elementChainCache = new WeakMap()

function isAnalyser(s) {
  return typeof AnalyserNode !== 'undefined' && s instanceof AnalyserNode
}

function isStream(s) {
  return typeof MediaStream !== 'undefined' && s instanceof MediaStream
}

function isAudioEl(s) {
  return typeof HTMLAudioElement !== 'undefined' && s instanceof HTMLAudioElement
}

function getOrCreateElementChain(audioEl) {
  let chain = elementChainCache.get(audioEl)
  if (chain) return chain
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const audioCtx = new Ctx()
  const sourceNode = audioCtx.createMediaElementSource(audioEl)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.75
  sourceNode.connect(analyser)
  analyser.connect(audioCtx.destination)
  chain = { audioCtx, sourceNode, analyser }
  elementChainCache.set(audioEl, chain)
  return chain
}

function drawWaveform(ctx, dataArray, width, height, color) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const len = dataArray.length
  if (len < 2) return
  const step = width / (len - 1)
  const cy = height / 2
  for (let i = 0; i < len; i++) {
    const v = (dataArray[i] - 128) / 128
    const y = cy + v * cy * 0.85
    const x = i * step
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawIdle(ctx, width, height, color) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()
}

export default function Visualizer({ source, active = true, color = 'rgba(255,255,255,0.4)' }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const ownedCtxRef = useRef(null)
  const ownedSourceRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const measure = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const w = parent.clientWidth || 0
      const h = parent.clientHeight || 0
      if (w === 0 || h === 0) return false
      if (sizeRef.current.w === w && sizeRef.current.h === h && sizeRef.current.dpr === dpr) return true
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h, dpr }
      return true
    }

    const ensureSize = () => {
      if (measure()) return true
      // 親 layout 未確定の場合 next frame で retry
      requestAnimationFrame(() => measure())
      return false
    }

    let resizeObs = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => measure())
      resizeObs.observe(parent)
    }

    ensureSize()

    const ctx2d = canvas.getContext('2d')
    const drawIdleNow = () => {
      const { w, h } = sizeRef.current
      if (w > 0 && h > 0) drawIdle(ctx2d, w, h, color)
    }

    drawIdleNow()

    const cleanupNoSource = () => {
      if (resizeObs) { try { resizeObs.disconnect() } catch (_) {} }
    }

    if (!source || !active) {
      return cleanupNoSource
    }

    let analyser = null
    let cleanupOwned = false

    if (isAnalyser(source)) {
      analyser = source
    } else if (isStream(source)) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return cleanupNoSource
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
      } catch (_) {
        return cleanupNoSource
      }
    } else if (isAudioEl(source)) {
      try {
        const chain = getOrCreateElementChain(source)
        if (chain) {
          if (chain.audioCtx.state === 'suspended') {
            chain.audioCtx.resume().catch(() => {})
          }
          analyser = chain.analyser
        }
      } catch (_) {
        return cleanupNoSource
      }
    }

    if (!analyser) return cleanupNoSource

    const dataArray = new Uint8Array(analyser.fftSize)

    const tick = () => {
      const { w, h } = sizeRef.current
      if (w > 0 && h > 0) {
        analyser.getByteTimeDomainData(dataArray)
        drawWaveform(ctx2d, dataArray, w, h, color)
      } else {
        measure()
      }
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
      if (resizeObs) { try { resizeObs.disconnect() } catch (_) {} }
      drawIdleNow()
    }
  }, [source, active, color])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  )
}
