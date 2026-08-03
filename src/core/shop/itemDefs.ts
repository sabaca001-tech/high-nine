/**
 * ショップのアイテム。
 *
 * 在庫や持ち物の管理は行わず、**買った瞬間に効果が出る**。
 * 「買う → 使う」の2手間はスマホでは煩雑なだけで、
 * 判断の質は変わらないため。
 */

import type { Rng } from '@/core/rng/random'
import { clamp } from '@/core/player/growth'
import { attemptTraining } from '@/core/skill/grantSkill'
import { findSkill } from '@/core/skill/skillDefs'
import type { PracticeBoost } from '@/core/types/game'
import type { Motivation, Player } from '@/core/types/player'

export type ItemId =
  | 'drink'
  | 'meal'
  | 'gear'
  | 'machine'
  | 'treat'
  | 'mental-coach'
  | 'skill-book'

export type ShopItem = {
  id: ItemId
  name: string
  description: string
  price: number
  /** 買った直後に出る短い説明 */
  resultText: string
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'drink',
    name: 'スポーツドリンク',
    description: '部員全員の体力が25回復する',
    price: 12_000,
    resultText: 'スポーツドリンクを配った。体力が回復した',
  },
  {
    id: 'meal',
    name: '高たんぱく弁当',
    description: '部員全員の体力が45回復する',
    price: 25_000,
    resultText: '栄養満点の弁当を用意した。体力が大きく回復した',
  },
  {
    id: 'gear',
    name: '練習器具一式',
    description: '次の練習5回が1.5倍になる',
    price: 40_000,
    resultText: '新しい練習器具が届いた。練習がはかどる',
  },
  {
    id: 'machine',
    name: '最新トレーニング機器',
    description: '次の練習4回が2倍になる',
    price: 80_000,
    resultText: '最新のトレーニング機器を導入した！',
  },
  {
    id: 'treat',
    name: '打ち上げの差し入れ',
    description: '部員全員のやる気が1段階上がる',
    price: 30_000,
    resultText: '差し入れでチームが盛り上がった',
  },
  {
    id: 'mental-coach',
    name: 'メンタルコーチ招へい',
    description: '部員全員の信頼度が12上がる',
    price: 35_000,
    resultText: 'メンタルコーチの指導でチームがまとまった',
  },
  {
    id: 'skill-book',
    name: '名将の指南書',
    description: '信頼度が最も高い選手が特殊能力の習得に挑戦する',
    price: 60_000,
    resultText: '指南書を読み込んだ',
  },
]

const ITEM_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]))

export function findItem(id: string): ShopItem | undefined {
  return ITEM_BY_ID.get(id as ItemId)
}

export type ItemOutcome = {
  players: Player[]
  /** 新たに得た練習効率バフ */
  boost?: PracticeBoost
  /** 表示するメッセージ */
  text: string
}

/** アイテムの効果を適用する */
export function applyItem(rng: Rng, players: Player[], item: ShopItem): ItemOutcome {
  switch (item.id) {
    case 'drink':
      return { players: healAll(players, 25), text: item.resultText }

    case 'meal':
      return { players: healAll(players, 45), text: item.resultText }

    case 'gear':
      return { players, boost: { multiplier: 1.5, remaining: 5 }, text: item.resultText }

    case 'machine':
      return { players, boost: { multiplier: 2, remaining: 4 }, text: item.resultText }

    case 'treat':
      return {
        players: players.map((player) => ({
          ...player,
          motivation: clamp(player.motivation + 1, -2, 2) as Motivation,
        })),
        text: item.resultText,
      }

    case 'mental-coach':
      return {
        players: players.map((player) => ({
          ...player,
          trust: clamp(player.trust + 12, 0, 100),
        })),
        text: item.resultText,
      }

    case 'skill-book': {
      // 信頼度が最も高い選手が挑戦する。誰が伸びるか予測できるようにする
      const target = players.reduce((best, player) =>
        player.trust > best.trust ? player : best,
      )
      const result = attemptTraining(rng, target)
      const skill = result.skillId ? findSkill(result.skillId) : undefined

      if (!result.granted || !skill) {
        return {
          players,
          text: `${target.name}が指南書を読み込んだが、身につかなかった`,
        }
      }
      return {
        players: players.map((p) => (p.id === target.id ? result.player : p)),
        text: `${target.name}が特殊能力「${skill.name}」を習得した！`,
      }
    }
  }
}

function healAll(players: Player[], amount: number): Player[] {
  return players.map((player) => ({
    ...player,
    condition: clamp(player.condition + amount, 0, 100),
  }))
}
