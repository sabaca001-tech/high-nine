/**
 * 効果音。
 *
 * 音声ファイルを持たず、Web Audio API で**その場で合成**する。
 * 画像を使わない方針と同じ理由で、アセットを増やさずオフラインでも鳴る。
 *
 * ブラウザの自動再生制限があるため、AudioContext は
 * 最初のタップ（ユーザー操作）まで作らない。
 */

export type SoundKind =
  | 'tap' // カードを選ぶ
  | 'hit' // 安打
  | 'homerun' // 本塁打
  | 'out' // アウト
  | 'cheer' // 勝利・優勝
  | 'levelUp' // 特殊能力の習得・整備など

const STORAGE_KEY = 'hs-baseball-sim:sound'

let context: AudioContext | null = null
let enabled = readEnabled()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // 保存できなくても音の再生自体には影響しない
  }
}

/** 必要になった時点で AudioContext を作る */
function ensureContext(): AudioContext | null {
  if (!enabled) return null
  if (context) return context

  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
  } catch {
    return null
  }
  return context
}

/** 単音を鳴らす */
function tone(
  ctx: AudioContext,
  options: {
    frequency: number
    duration: number
    type?: OscillatorType
    volume?: number
    delay?: number
    /** 終了時の周波数。指定すると滑らかに変化する */
    endFrequency?: number
  },
): void {
  const { frequency, duration, type = 'sine', volume = 0.15, delay = 0 } = options
  const start = ctx.currentTime + delay

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  if (options.endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.endFrequency),
      start + duration,
    )
  }

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** ノイズ（歓声・打球音に使う） */
function noise(
  ctx: AudioContext,
  options: { duration: number; volume?: number; delay?: number; filter?: number },
): void {
  const { duration, volume = 0.12, delay = 0, filter = 1200 } = options
  const start = ctx.currentTime + delay

  const frames = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    // 後半ほど小さくして自然に減衰させる
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = filter

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(band).connect(gain).connect(ctx.destination)
  source.start(start)
}

/** 効果音を鳴らす。無効化されていれば何もしない */
export function playSound(kind: SoundKind): void {
  const ctx = ensureContext()
  if (!ctx) return

  // タブが復帰した直後は suspended のことがある
  if (ctx.state === 'suspended') void ctx.resume()

  switch (kind) {
    case 'tap':
      tone(ctx, { frequency: 660, duration: 0.06, type: 'triangle', volume: 0.08 })
      break

    case 'hit':
      // 金属バットの当たる音のイメージ
      noise(ctx, { duration: 0.09, volume: 0.16, filter: 2200 })
      tone(ctx, { frequency: 900, duration: 0.08, type: 'square', volume: 0.06 })
      break

    case 'homerun':
      noise(ctx, { duration: 0.12, volume: 0.2, filter: 2600 })
      tone(ctx, { frequency: 523, duration: 0.12, type: 'triangle', volume: 0.12 })
      tone(ctx, { frequency: 659, duration: 0.12, type: 'triangle', volume: 0.12, delay: 0.1 })
      tone(ctx, { frequency: 784, duration: 0.2, type: 'triangle', volume: 0.14, delay: 0.2 })
      noise(ctx, { duration: 0.7, volume: 0.1, filter: 800, delay: 0.25 })
      break

    case 'out':
      tone(ctx, {
        frequency: 320,
        endFrequency: 180,
        duration: 0.12,
        type: 'sine',
        volume: 0.08,
      })
      break

    case 'cheer':
      noise(ctx, { duration: 1.1, volume: 0.14, filter: 700 })
      tone(ctx, { frequency: 523, duration: 0.15, type: 'triangle', volume: 0.12 })
      tone(ctx, { frequency: 659, duration: 0.15, type: 'triangle', volume: 0.12, delay: 0.12 })
      tone(ctx, { frequency: 784, duration: 0.15, type: 'triangle', volume: 0.12, delay: 0.24 })
      tone(ctx, { frequency: 1046, duration: 0.35, type: 'triangle', volume: 0.14, delay: 0.36 })
      break

    case 'levelUp':
      tone(ctx, { frequency: 784, duration: 0.09, type: 'triangle', volume: 0.1 })
      tone(ctx, { frequency: 1046, duration: 0.16, type: 'triangle', volume: 0.11, delay: 0.09 })
      break
  }
}
