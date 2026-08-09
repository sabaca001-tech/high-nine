/**
 * セーブデータの永続化（localStorage）。
 *
 * **3つの枠を持つ。** 1つしか無かった頃は、別の学校で試したくなるたびに
 * それまでの記録を消すしかなかった。歴代記録やOB名鑑のように
 * 何年もかけて積み上がるものがあるので、消すのは重い判断になる。
 *
 * 1枠目のキーは**これまでと同じまま**にしてある。
 * 変えると既存のセーブが読めなくなるため（CLAUDE.md 6）。
 */

import type { GameState } from '@/core/types/game'
import { migrate } from './migrate'
import { packRivals, PACKED_RIVALS_KEY, unpackRivals } from './packRivals'

/** 枠の数 */
export const SLOT_COUNT = 3

/** 枠の番号。1〜SLOT_COUNT */
export type SlotId = number

/** 既定の枠。何も指定しなければここを使う */
export const DEFAULT_SLOT: SlotId = 1

/**
 * 枠のキー。
 * **1枠目は `:v1` のまま。** 1スロットだった頃のセーブをそのまま読むため。
 */
function keyOf(slot: SlotId): string {
  return slot === DEFAULT_SLOT ? 'hs-baseball-sim:save:v1' : `hs-baseball-sim:save:v1:${slot}`
}

/** 保存失敗に備えた1世代前のバックアップ */
function backupKeyOf(slot: SlotId): string {
  return `${keyOf(slot)}:backup`
}

/** 枠の見出し。タイトル画面に並べる */
export type SlotSummary = {
  slot: SlotId
  /** 中身が無ければ null */
  state: GameState | null
}

/** すべての枠を読む。タイトル画面の一覧に使う */
export function listSlots(): SlotSummary[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = index + 1
    return { slot, state: load(slot) }
  })
}

/** その枠にセーブデータが存在するか */
export function hasSave(slot: SlotId = DEFAULT_SLOT): boolean {
  try {
    return localStorage.getItem(keyOf(slot)) !== null
  } catch {
    return false
  }
}

/** どれか1つでもセーブがあるか */
export function hasAnySave(): boolean {
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    if (hasSave(slot)) return true
  }
  return false
}

/**
 * 保存する。
 * 保存に失敗しても例外は投げない（プライベートブラウジング等で失敗しうるため）。
 */
export function save(state: GameState, slot: SlotId = DEFAULT_SLOT): boolean {
  try {
    const previous = localStorage.getItem(keyOf(slot))
    if (previous !== null) {
      localStorage.setItem(backupKeyOf(slot), previous)
    }
    localStorage.setItem(keyOf(slot), JSON.stringify(toStored(state)))
    return true
  } catch (error) {
    console.error('セーブに失敗しました', error)
    return false
  }
}

/**
 * 読み込む。データが無い・壊れている場合は null。
 * バックアップが残っていればそちらを試す。
 */
export function load(slot: SlotId = DEFAULT_SLOT): GameState | null {
  const primary = readAndMigrate(keyOf(slot))
  if (primary) return primary

  const backup = readAndMigrate(backupKeyOf(slot))
  if (backup) {
    console.warn('セーブデータが壊れていたため、バックアップから復元しました')
    return backup
  }
  return null
}

/** その枠のセーブデータを削除する */
export function clearSave(slot: SlotId = DEFAULT_SLOT): void {
  try {
    localStorage.removeItem(keyOf(slot))
    localStorage.removeItem(backupKeyOf(slot))
  } catch (error) {
    console.error('セーブデータの削除に失敗しました', error)
  }
}

/**
 * 保存する形にする。
 *
 * **他校だけ配列に詰め替える。** 2800校ぶんのキー名が
 * それだけで200KB近くを占めるため（`packRivals`）。
 * `GameState` の型は変えず、保存の直前だけ形を変える。
 */
function toStored(state: GameState): Record<string, unknown> {
  const { rivals, ...rest } = state
  return { ...rest, [PACKED_RIVALS_KEY]: packRivals(rivals) }
}

/**
 * 読み込んだ生データを `GameState` の形に戻す。
 * 詰められていない古いセーブは、そのまま `rivals` を持っている。
 */
function fromStored(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw

  const record = raw as Record<string, unknown>
  const packed = record[PACKED_RIVALS_KEY]
  if (packed === undefined) return record

  const { [PACKED_RIVALS_KEY]: _packed, ...rest } = record
  return { ...rest, rivals: unpackRivals(packed as unknown[]) }
}

function readAndMigrate(key: string): GameState | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return migrate(fromStored(JSON.parse(raw)))
  } catch (error) {
    console.error(`セーブデータの読み込みに失敗しました: ${key}`, error)
    return null
  }
}
