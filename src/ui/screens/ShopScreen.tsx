import { useState } from 'react'
import {
  clampGroundLevel,
  GROUND_LEVEL_MAX,
  groundDecayChance,
  groundMultiplier,
  groundName,
  groundUpgradeCostFor,
} from '@/core/shop/facility'
import { managerFundsRate } from '@/core/staff/managers'
import { formatFunds, monthlyFunds } from '@/core/shop/funds'
import { SHOP_ITEMS } from '@/core/shop/itemDefs'
import { EQUIPMENTS } from '@/core/shop/equipmentDefs'
import { monthlyUpkeep } from '@/core/shop/upkeep'
import type { Upkeep } from '@/core/shop/upkeep'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import styles from './ShopScreen.module.css'

/**
 * 部費を使ってアイテムを買う画面。
 * 買った瞬間に効果が出るので、持ち物の管理は無い。
 */
export function ShopScreen() {
  const game = useGameStore((s) => s.game)
  const buyItem = useGameStore((s) => s.buyItem)
  const upgradeGround = useGameStore((s) => s.upgradeGround)
  const buyEquipment = useGameStore((s) => s.buyEquipment)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (!game) return null

  const income = Math.round(monthlyFunds(game.reputation) * managerFundsRate(game.managers))
  const upkeep = monthlyUpkeep(game.players.length, game.groundLevel)

  const handleBuy = (itemId: string) => {
    buyItem(itemId)
    setConfirming(null)
  }

  return (
    <AppLayout title="ショップ" subtitle={`${game.year}年目 ${game.month}月`} scrollable>
      <div className={styles.wallet}>
        <span className={styles.walletLabel}>部費</span>
        <span className={styles.walletValue}>{formatFunds(game.funds)}</span>
      </div>
      <p className={styles.hint}>
        毎月支給され、大会で勝つと増えます。買うとその場で効果が出ます。
      </p>

      <h2 className={styles.sectionTitle}>毎月の収支</h2>
      <BudgetSection
        income={income}
        upkeep={upkeep}
        playerCount={game.players.length}
        level={game.groundLevel}
      />

      <h2 className={styles.sectionTitle}>設備</h2>
      <GroundSection funds={game.funds} level={game.groundLevel} onUpgrade={upgradeGround} />

      <h2 className={styles.sectionTitle}>練習器具（練習の種類が増えます）</h2>
      <p className={styles.hint}>
        買うとその器具を使う練習カードが手札に出るようになります。
        ただし毎月一定の確率で壊れます。壊れたら買い直してください。
      </p>
      {EQUIPMENTS.map((equipment) => {
        const owned = game.equipment.includes(equipment.id)
        const affordable = game.funds >= equipment.price

        return (
          <button
            key={equipment.id}
            type="button"
            className={owned ? `${styles.item} ${styles.current}` : styles.item}
            disabled={owned || !affordable}
            onClick={() => buyEquipment(equipment.id)}
          >
            <span>
              <span className={styles.name}>
                {equipment.name}
                {owned && <span className={styles.currentBadge}>所持中</span>}
              </span>
              <span className={styles.description}>{equipment.description}</span>
              <span className={styles.upkeepNote}>
                毎月 約{Math.round(equipment.breakChance * 100)}% の確率で壊れます
              </span>
            </span>
            <span className={affordable ? styles.price : `${styles.price} ${styles.tooExpensive}`}>
              {owned ? '—' : formatFunds(equipment.price)}
            </span>
          </button>
        )
      })}

      <h2 className={styles.sectionTitle}>アイテム</h2>
      {SHOP_ITEMS.map((item) => {
        const affordable = game.funds >= item.price

        if (confirming === item.id) {
          return (
            <div key={item.id} className={styles.confirm}>
              <span className={styles.confirmText}>
                {item.name}を{formatFunds(item.price)}で購入しますか？
              </span>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirming(null)}
              >
                やめる
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => handleBuy(item.id)}
              >
                購入
              </button>
            </div>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            className={styles.item}
            disabled={!affordable}
            onClick={() => setConfirming(item.id)}
          >
            <span>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.description}>{item.description}</span>
            </span>
            <span className={affordable ? styles.price : `${styles.price} ${styles.tooExpensive}`}>
              {formatFunds(item.price)}
            </span>
          </button>
        )
      })}
    </AppLayout>
  )
}

/**
 * 毎月の収支。
 * 維持費は何もしなくても出ていくので、買い物の前に必ず見えるようにする。
 */
function BudgetSection({
  income,
  upkeep,
  playerCount,
  level,
}: {
  income: number
  upkeep: Upkeep
  playerCount: number
  level: number
}) {
  const net = income - upkeep.total

  return (
    <div className={styles.budget}>
      <div className={styles.budgetRow}>
        <span className={styles.budgetLabel}>支給</span>
        <span className={styles.budgetIn}>+{formatFunds(income)}</span>
      </div>
      <div className={styles.budgetRow}>
        <span className={styles.budgetLabel}>備品費（部員{playerCount}人）</span>
        <span className={styles.budgetOut}>-{formatFunds(upkeep.equipment)}</span>
      </div>
      <div className={styles.budgetRow}>
        <span className={styles.budgetLabel}>設備維持費（Lv{level}）</span>
        {/* Lv1は土のグラウンドなので維持費が無い。「-0円」は紛らわしいので伏せる */}
        <span className={upkeep.ground > 0 ? styles.budgetOut : styles.budgetLabel}>
          {upkeep.ground > 0 ? `-${formatFunds(upkeep.ground)}` : 'なし'}
        </span>
      </div>
      <div className={`${styles.budgetRow} ${styles.budgetTotal}`}>
        <span className={styles.budgetLabel}>差引</span>
        <span className={net >= 0 ? styles.budgetIn : styles.budgetOut}>
          {net >= 0 ? '+' : '-'}
          {formatFunds(Math.abs(net))}
        </span>
      </div>
      <p className={styles.budgetNote}>
        部員が増えるほど、設備を良くするほど維持費も上がります。
        払いきれないと道具が足りず、部員の信頼度が下がります。
      </p>
    </div>
  )
}

/**
 * グラウンドの整備状況。
 *
 * 段階が1〜99あるので、1段階ずつ買うのと10段階まとめて買うのを並べる。
 * **放っておくと荒れて下がる**ので、上げっぱなしにはできない。
 */
function GroundSection({
  funds,
  level,
  onUpgrade,
}: {
  funds: number
  level: number
  onUpgrade: (steps: number) => void
}) {
  const current = clampGroundLevel(level)
  const atMax = current >= GROUND_LEVEL_MAX

  return (
    <>
      <div className={styles.ground}>
        <span>
          <span className={styles.name}>
            Lv{current} {groundName(current)}
          </span>
          <span className={styles.description}>
            練習の成長量 ×{groundMultiplier(current).toFixed(2)} ／ 維持費 毎月{' '}
            {formatFunds(monthlyUpkeep(0, current).ground)}
          </span>
          <span className={styles.upkeepNote}>
            毎月 約{Math.round(groundDecayChance(current) * 100)}% の確率で荒れて下がります
          </span>
        </span>
      </div>

      {atMax ? (
        <p className={styles.hint}>これ以上は整備できません</p>
      ) : (
        [1, 10].map((steps) => {
          const quote = groundUpgradeCostFor(current, steps)
          if (quote.steps === 0) return null
          const affordable = funds >= quote.cost

          return (
            <button
              key={steps}
              type="button"
              className={styles.item}
              disabled={!affordable}
              onClick={() => onUpgrade(steps)}
            >
              <span>
                <span className={styles.name}>
                  {quote.steps}段階 整備する（Lv{current + quote.steps}）
                </span>
                <span className={styles.description}>
                  練習の成長量 ×{groundMultiplier(current + quote.steps).toFixed(2)}
                </span>
                <span className={styles.upkeepNote}>
                  維持費が毎月 +
                  {formatFunds(
                    monthlyUpkeep(0, current + quote.steps).ground -
                      monthlyUpkeep(0, current).ground,
                  )}
                </span>
              </span>
              <span
                className={affordable ? styles.price : `${styles.price} ${styles.tooExpensive}`}
              >
                {formatFunds(quote.cost)}
              </span>
            </button>
          )
        })
      )}
    </>
  )
}
