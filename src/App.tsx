import { useGameStore } from '@/state/useGameStore'
import { HomeScreen } from '@/ui/screens/HomeScreen'
import { LineupScreen } from '@/ui/screens/LineupScreen'
import { MatchScreen } from '@/ui/screens/MatchScreen'
import { PreMatchScreen } from '@/ui/screens/PreMatchScreen'
import { MatchOfferScreen } from '@/ui/screens/MatchOfferScreen'
import { PlayerDetailScreen } from '@/ui/screens/PlayerDetailScreen'
import { AlumniScreen } from '@/ui/screens/AlumniScreen'
import { CampScreen } from '@/ui/screens/CampScreen'
import { ForkScreen } from '@/ui/screens/ForkScreen'
import { PlayerEventScreen } from '@/ui/screens/PlayerEventScreen'
import { NewGameScreen } from '@/ui/screens/NewGameScreen'
import { SeasonScreen } from '@/ui/screens/SeasonScreen'
import { DataScreen } from '@/ui/screens/DataScreen'
import { RecordsScreen } from '@/ui/screens/RecordsScreen'
import { GrowthPlanScreen } from '@/ui/screens/GrowthPlanScreen'
import { ScoutScreen } from '@/ui/screens/ScoutScreen'
import { ShopScreen } from '@/ui/screens/ShopScreen'
import { TournamentScreen } from '@/ui/screens/TournamentScreen'
import { PlayerListScreen } from '@/ui/screens/PlayerListScreen'
import { TitleScreen } from '@/ui/screens/TitleScreen'
import { UpdateBanner } from '@/ui/components/UpdateBanner'
import { GrowthReport } from '@/ui/components/GrowthReport'

/**
 * 画面の出し分けだけを行う。ゲームロジックは書かない。
 *
 * 更新の案内だけは**どの画面でも出す**必要があるので、外側に重ねる。
 */
export default function App() {
  return (
    <>
      <UpdateBanner />
      <Screen />
      {/*
        成長の報告は**どの画面より前に出す**。
        マスの効果が画面を奪う前に、その日の結果を必ず見せるための足止め
      */}
      <GrowthReport />
    </>
  )
}

function Screen() {
  const screen = useGameStore((s) => s.screen)
  const game = useGameStore((s) => s.game)

  // ゲーム開始前はタイトルか新規作成
  if (screen === 'newGame') return <NewGameScreen />
  if (!game || screen === 'title') return <TitleScreen />

  // 練習試合は相手を選ぶところから。断ることもできる
  if (game.phase === 'matchOffer' && game.pendingOffers) return <MatchOfferScreen />

  // 試合中は他の画面に移動できないようにする。
  // 観戦を中断したまま別画面へ行くと、結果が未反映のまま取り残されるため
  // 試合前はスタメン確認から。ここを抜けるまで試合はシミュレートされない
  //
  // **選手の詳細だけは通す。** スタメンを決める場面でこそ
  // 「この選手はどうだったか」を見たくなる。
  // 戻ると `screen` が playerDetail から外れるので、ここへ戻ってくる
  if (game.phase === 'lineupCheck' && game.pendingSetup && screen !== 'playerDetail') {
    return <PreMatchScreen />
  }

  // 試合は半回ずつ進む。進行中（matchState）でも決着後（pendingMatch）でも観戦画面
  if (game.phase === 'match' && (game.matchState || game.pendingMatch)) return <MatchScreen />

  // 世代交代の報告も、閉じるまで他の画面へ行かせない
  if (game.phase === 'newSeason' && game.pendingSeason) return <SeasonScreen />

  // 大会中も同様。勝ち抜くか敗退するまで離脱させない
  if (game.phase === 'tournament' && game.tournament) return <TournamentScreen />

  // 合宿は方針を選ぶまで進めない
  if (game.phase === 'camp') return <CampScreen />

  // 個人イベントも選ぶまで進めない
  if (game.phase === 'playerEvent' && game.pendingEvent) return <PlayerEventScreen />

  // ルート分岐も選ぶまで進めない
  if (game.phase === 'fork') return <ForkScreen />

  switch (screen) {
    case 'lineup':
      return <LineupScreen />
    case 'shop':
      return <ShopScreen />
    case 'scout':
      return <ScoutScreen />
    case 'alumni':
      return <AlumniScreen />
    case 'records':
      return <RecordsScreen />
    case 'growthPlan':
      return <GrowthPlanScreen />
    case 'data':
      return <DataScreen />
    case 'players':
      return <PlayerListScreen />
    case 'playerDetail':
      return <PlayerDetailScreen />
    case 'home':
      return <HomeScreen />
  }
}
