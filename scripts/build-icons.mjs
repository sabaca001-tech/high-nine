/**
 * アプリアイコンの PNG を生成する。
 *
 * **画像ファイルを持たない方針の例外。** ゲームの絵はすべて SVG/CSS で描くが、
 * ホーム画面のアイコンだけは OS 側の要件で PNG が要る。
 * とくに **iOS の apple-touch-icon は SVG を無視する**ので、
 * PNG が無いとホーム画面に追加してもアイコンが出ない。
 *
 * 元データは `public/icon.svg` と同じ形を**このファイルの中で再現**している。
 * SVG をラスタライズするライブラリを入れたくないため
 * （依存を増やさない）、図形を直接描いて zlib で PNG にする。
 *
 * **SVG を直したらここも直す。** 見た目がずれたら意味が無い。
 *
 *   node scripts/build-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

/** 元の SVG と同じ座標系（viewBox 0 0 512 512） */
const VIEW = 512

/** 1画素あたりの標本数（縦横）。輪郭のギザつきを消す */
const SAMPLES = 4

const COLORS = {
  bg: [0x10, 0x20, 0x1a],
  ball: [0xf4, 0xf7, 0xf5],
  seam: [0xd9, 0x40, 0x3f],
}

/** 二次ベジェ上の点 */
function quadPoint(p0, c, p1, t) {
  const u = 1 - t
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]
}

/** 二次ベジェを線分の並びに開く */
function quadPolyline(p0, c, p1, steps = 64) {
  return Array.from({ length: steps + 1 }, (_, i) => quadPoint(p0, c, p1, i / steps))
}

/** 点から線分までの距離 */
function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSq))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

/**
 * 折れ線をなぞる「線」。
 *
 * 当たり判定を毎回すべての線分に対して行うと、512px×16標本で
 * 5億回の距離計算になって終わらない（実際に終わらなかった）。
 * **外接する箱で先に弾く。**
 */
function stroke(points, width) {
  const half = width / 2
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const box = {
    minX: Math.min(...xs) - half,
    maxX: Math.max(...xs) + half,
    minY: Math.min(...ys) - half,
    maxY: Math.max(...ys) + half,
  }

  return (x, y) => {
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) return false
    for (let i = 1; i < points.length; i++) {
      if (distanceToSegment(x, y, points[i - 1], points[i]) <= half) return true
    }
    return false
  }
}

/** 角丸の四角の内側か */
function inRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

/**
 * 赤い部分（縫い目と縫い糸）。**ループの外で一度だけ組み立てる。**
 * 画素ごとにベジェを開き直すと終わらない。
 */
const ICON_SEAMS = [
  stroke(quadPolyline([150, 150], [190, 256], [150, 362]), 14),
  stroke(quadPolyline([362, 150], [322, 256], [362, 362]), 14),
  ...[
    [[168, 186], [190, 176]],
    [[162, 222], [186, 216]],
    [[162, 290], [186, 296]],
    [[168, 326], [190, 336]],
    [[344, 186], [322, 176]],
    [[350, 222], [326, 216]],
    [[350, 290], [326, 296]],
    [[344, 326], [322, 336]],
  ].map((segment) => stroke(segment, 9)),
]

const MASKABLE_SEAMS = [
  stroke(quadPolyline([173, 173], [205, 256], [173, 339]), 11),
  stroke(quadPolyline([339, 173], [307, 256], [339, 339]), 11),
]

/**
 * 通常のアイコン。角丸の背景＋ボール＋縫い目。
 * 返すのは「その座標の色」または null（透明）。
 */
function drawIcon(x, y) {
  if (!inRoundedRect(x, y, VIEW, 96)) return null
  for (const hit of ICON_SEAMS) {
    if (hit(x, y)) return COLORS.seam
  }
  if (Math.hypot(x - 256, y - 256) <= 150) return COLORS.ball
  return COLORS.bg
}

/**
 * マスカブル用。**四隅まで背景で埋め、絵を内側に寄せる。**
 * Android は好きな形に切り抜くので、角に何か描くと欠ける。
 */
function drawMaskable(x, y) {
  for (const hit of MASKABLE_SEAMS) {
    if (hit(x, y)) return COLORS.seam
  }
  if (Math.hypot(x - 256, y - 256) <= 118) return COLORS.ball
  return COLORS.bg
}

/** 図形を size×size の RGBA バッファに焼く */
function render(draw, size) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = VIEW / size
  const step = 1 / SAMPLES

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) * step) * scale
          const y = (py + (sy + 0.5) * step) * scale
          const color = draw(x, y)
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          a += 255
        }
      }

      const total = SAMPLES * SAMPLES
      const covered = a / 255
      const index = (py * size + px) * 4
      // 透明な部分の色は混ぜない（縁が黒ずむのを防ぐ）
      pixels[index] = covered > 0 ? Math.round(r / covered) : 0
      pixels[index + 1] = covered > 0 ? Math.round(g / covered) : 0
      pixels[index + 2] = covered > 0 ? Math.round(b / covered) : 0
      pixels[index + 3] = Math.round(a / total)
    }
  }
  return pixels
}

// ── PNG の組み立て ────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function toPng(pixels, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // ビット深度
  header[9] = 6 // カラータイプ RGBA
  // 圧縮・フィルタ・インターレースはすべて既定値（0）

  // 各行の先頭にフィルタ種別（0＝フィルタなし）を置く
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const TARGETS = [
  // iOS のホーム画面用。SVG は無視されるので PNG が必須
  { file: 'apple-touch-icon.png', size: 180, draw: drawIcon },
  { file: 'icon-192.png', size: 192, draw: drawIcon },
  { file: 'icon-512.png', size: 512, draw: drawIcon },
  { file: 'icon-maskable-512.png', size: 512, draw: drawMaskable },
]

for (const { file, size, draw } of TARGETS) {
  const png = toPng(render(draw, size), size)
  writeFileSync(new URL(`../public/${file}`, import.meta.url), png)
  console.log(`${file} (${size}x${size}) ${(png.length / 1024).toFixed(1)}KB`)
}
