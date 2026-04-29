import { useEffect, useRef } from 'react'

const elementChainCache = new WeakMap()

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

function drawFlat(canvas, color) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.35
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawWaveform(canvas, dataArray, color) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const cy = h / 2
  ctx.clearRect(0, 0, w, h)

  const len = dataArray.length
  const points = new Array(len)
  for (let i = 0; i < len; i++) {
    const v = (dataArray[i] - 128) / 128
    points[i] = cy + v * cy * 0.9
  }

  // Background fill (奥行き感: 上下方向 gradient で 3D 風)
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, color + '00')
  grad.addColorStop(0.5, color + '55')
  grad.addColorStop(1, color + '00')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(0, points[0])
  for (let i = 1; i < len; i++) {
    const x = (i / (len - 1)) * w
    ctx.lineTo(x, points[i])
  }
  ctx.lineTo(w, cy)
  ctx.lineTo(0, cy)
  ctx.closePath()
  ctx.fill()

  // 背面 stroke (太、半透明 — 奥)
  ctx.lineWidth = 4
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, points[0])
  for (let i = 1; i < len; i++) {
    const x = (i / (len - 1)) * w
    ctx.lineTo(x, points[i])
  }
  ctx.stroke()

  // 前面 stroke (細、不透明 — 手前)
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(0, points[0])
  for (let i = 1; i < len; i++) {
    const x = (i / (len - 1)) * w
    ctx.lineTo(x, points[i])
  }
  ctx.stroke()
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

    const drawF = (c) => drawFlat(c, color)
    const drawW = (c, d) => drawWaveform(c, d, color)

    drawF(canvas)

    if (!source || !active) {
      return () => {}
    }

    let analyser = null
    let cleanupOwned = false

    if (source instanceof window.AnalyserNode || (typeof AnalyserNode !== 'undefined' && source instanceof AnalyserNode)) {
      analyser = source
    } else if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) { drawF(canvas); return }
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
        drawF(canvas)
        return () => {}
      }
    } else if (typeof HTMLAudioElement !== 'undefined' && source instanceof HTMLAudioElement) {
      try {
        const chain = getOrCreateElementChain(source)
        if (chain) {
          if (chain.audioCtx.state === 'suspended') {
            chain.audioCtx.resume().catch(() => {})
          }
          analyser = chain.analyser
        }
      } catch (e) {
        drawF(canvas)
        return () => {}
      }
    }

    if (!analyser) {
      drawF(canvas)
      return () => {}
    }

    const bufferLength = analyser.fftSize
    const dataArray = new Uint8Array(bufferLength)

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray)
      drawW(canvas, dataArray)
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
      drawF(canvas)
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
