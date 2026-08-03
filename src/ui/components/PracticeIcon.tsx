import type { PracticeKind } from '@/core/types/card'

type Props = {
  kind: PracticeKind
  size?: number
}

/**
 * 練習内容を表すアイコン。
 * 文字だけのカードだと一瞬で見分けられないため、形で識別できるようにする。
 */
export function PracticeIcon({ kind, size = 30 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
    >
      {shapeOf(kind)}
    </svg>
  )
}

function shapeOf(kind: PracticeKind) {
  switch (kind) {
    // バットとボール
    case 'batting':
      return (
        <>
          <path d="M7 25 L21 11" />
          <path d="M20 10 a4 4 0 1 1 5 5 z" fill="#fff" />
          <circle cx="9" cy="9" r="3.2" fill="#fff" stroke="none" />
        </>
      )
    // 走るシューズ
    case 'running':
      return (
        <>
          <path d="M5 21 h9 l6 4 h7 a2 2 0 0 1 0 4 H5 z" fill="#fff" stroke="none" />
          <path d="M8 16 l4-5" />
          <path d="M14 14 l5-6" />
        </>
      )
    // グラブ
    case 'fielding':
      return (
        <>
          <path d="M8 12 v-3 a2.5 2.5 0 0 1 5 0 v2" />
          <path d="M13 11 v-4 a2.5 2.5 0 0 1 5 0 v4" />
          <path d="M18 12 v-3 a2.5 2.5 0 0 1 5 0 v6" />
          <path d="M8 12 v7 a7 7 0 0 0 15 0 v-2" />
        </>
      )
    // 遠投（弧を描くボール）
    case 'shoulder':
      return (
        <>
          <path d="M4 24 Q16 2 28 20" strokeDasharray="3 3" />
          <circle cx="27" cy="21" r="3.5" fill="#fff" stroke="none" />
          <circle cx="5" cy="25" r="2.5" fill="#fff" stroke="none" />
        </>
      )
    // 直球
    case 'pitching':
      return (
        <>
          <circle cx="21" cy="16" r="5" fill="#fff" stroke="none" />
          <path d="M4 11 h9" />
          <path d="M2 16 h11" />
          <path d="M4 21 h9" />
        </>
      )
    // 変化球（曲がる軌道）
    case 'breaking':
      return (
        <>
          <path d="M4 8 Q22 8 14 26" strokeDasharray="3 3" />
          <circle cx="14" cy="26" r="3.5" fill="#fff" stroke="none" />
          <path d="M11 23 l3 3 3-3" fill="none" />
        </>
      )
    // 走り込み（ストップウォッチ）
    case 'stamina':
      return (
        <>
          <circle cx="16" cy="18" r="10" />
          <path d="M16 12 v6 l4 3" />
          <path d="M12 5 h8" />
          <path d="M16 5 v3" />
        </>
      )
    // メンタル（気合いの炎）
    case 'mental':
      return (
        <>
          <path d="M16 3 c6 8 9 10 9 15 a9 9 0 0 1 -18 0 c0 -4 3 -6 6 -10 c1 3 2 4 3 5 c0 -3 0 -6 0 -10 z" />
        </>
      )
    // 休養（ベッド）
    case 'rest':
      return (
        <>
          <path d="M4 24 v-10" />
          <path d="M4 18 h24 v6" />
          <path d="M4 24 h24" />
          <circle cx="10" cy="13" r="3" />
          <path d="M20 6 h6 l-6 6 h6" />
        </>
      )
    // バント（構えたバット）
    case 'bunt':
      return (
        <>
          <path d="M6 20 h20" />
          <circle cx="8" cy="10" r="3" />
        </>
      )
    // 打ち込み（フルスイング）
    case 'longToss':
      return (
        <>
          <path d="M5 26 L24 7" />
          <path d="M22 5 l5 5" />
          <circle cx="9" cy="9" r="3" />
        </>
      )
    // ダッシュ（矢印）
    case 'sprint':
      return (
        <>
          <path d="M4 16 h20" />
          <path d="M18 10 l6 6 l-6 6" />
        </>
      )
    // 制球（的）
    case 'control':
      return (
        <>
          <circle cx="16" cy="16" r="10" />
          <circle cx="16" cy="16" r="4" />
        </>
      )
    // ミーティング（吹き出し）
    case 'meeting':
      return (
        <>
          <path d="M5 7 h22 v14 h-13 l-6 5 v-5 h-3 z" />
        </>
      )
    // グラウンド整備（トンボ）
    case 'groundskeeping':
      return (
        <>
          <path d="M16 4 v14" />
          <path d="M6 22 h20" />
          <path d="M6 22 v4" />
          <path d="M26 22 v4" />
        </>
      )
    // 治療（十字）
    case 'medical':
      return (
        <>
          <path d="M16 6 v20" />
          <path d="M6 16 h20" />
        </>
      )
    // 自主学習（本）
    case 'study':
      return (
        <>
          <path d="M6 7 h9 v18 h-9 z" />
          <path d="M17 7 h9 v18 h-9 z" />
        </>
      )
    // ティー打撃（ティースタンドの上のボール）
    case 'teeBatting':
      return (
        <>
          <circle cx="16" cy="8" r="4" />
          <path d="M16 12 v12" />
          <path d="M10 26 h12" />
        </>
      )
    // ウエイト（バーベル）
    case 'weight':
      return (
        <>
          <path d="M4 16 h24" />
          <path d="M7 10 v12" />
          <path d="M25 10 v12" />
          <path d="M3 13 v6" />
          <path d="M29 13 v6" />
        </>
      )
    // アジリティ（ジグザグ）
    case 'agility':
      return (
        <>
          <path d="M4 24 l7 -8 l6 8 l7 -14" />
          <path d="M24 6 l4 0 l0 4" />
        </>
      )
    // マシン打撃（射出するマシン）
    case 'machineBatting':
      return (
        <>
          <circle cx="10" cy="18" r="6" />
          <path d="M16 15 h10" />
          <circle cx="27" cy="9" r="3" />
        </>
      )
    // ブルペン（プレートとボール）
    case 'bullpen':
      return (
        <>
          <path d="M4 22 h16" />
          <path d="M8 26 h16" />
          <circle cx="24" cy="10" r="4" />
        </>
      )
    // ビデオ分析（カメラ）
    case 'videoStudy':
      return (
        <>
          <path d="M4 11 h16 v12 h-16 z" />
          <path d="M20 15 l8 -4 v12 l-8 -4 z" />
        </>
      )
    // 息抜き（マグカップ）
    case 'outing':
      return (
        <>
          <path d="M7 10 h14 v10 a4 4 0 0 1 -4 4 h-6 a4 4 0 0 1 -4 -4 z" />
          <path d="M21 13 h4 a3 3 0 0 1 0 6 h-4" />
          <path d="M11 4 v3" />
          <path d="M16 4 v3" />
        </>
      )
  }
}
