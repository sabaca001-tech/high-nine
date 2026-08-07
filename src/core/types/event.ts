/** ゲーム中に発生した出来事の記録 */

import type { AbilityChange } from './player'
import type { CellKind } from './board'

/**
 * エンジンが返す「何が起きたか」。
 * UI はこれを受け取って演出・ログ表示を行う。
 * core 側は文言の組み立てまでは行うが、表示方法には関与しない。
 */
export type GameEvent =
  /** コマを進めた */
  | { type: 'moved'; from: number; to: number; steps: number }
  /** マスに止まった */
  | { type: 'cell'; cellIndex: number; cellKind: CellKind }
  /** 能力が変動した */
  | { type: 'ability'; changes: AbilityChange[] }
  /** 信頼度が変動した */
  | { type: 'trust'; playerId: string; before: number; after: number }
  /** 体力が変動した */
  | { type: 'condition'; playerId: string; before: number; after: number }
  /** 月が進んだ */
  | { type: 'monthAdvanced'; year: number; month: number }
  /** 汎用メッセージ（イベントの説明文など） */
  | { type: 'message'; text: string; tone: EventTone }

/** 出来事の色合い。ログの表示色に使う */
export type EventTone = 'normal' | 'good' | 'bad'

/** 画面に残すログ1行 */
export type LogEntry = {
  id: string
  text: string
  tone: EventTone
}
