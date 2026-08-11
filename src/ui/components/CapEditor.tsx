import { CAP_COLORS, CAP_LOGOS } from '@/core/team/cap'
import type { CapColorId, CapDesign, CapLogoId } from '@/core/team/cap'
import { capColorOf } from '@/ui/theme/capColors'
import { PlayerPortrait } from './PlayerPortrait'
import styles from './CapEditor.module.css'

/**
 * 帽子のエディット。
 *
 * **変えられるのは配色とマークだけ。** 形まで選ばせると、
 * 小さく描かれる帽子では見分けが付かないのに選択肢だけ増える。
 *
 * 選んだ結果は**その場で顔に載せて見せる**。
 * 色見本だけ並べても、かぶった姿が想像できない。
 */
export function CapEditor({
  design,
  schoolName,
  onChange,
}: {
  design: CapDesign
  schoolName: string
  onChange: (design: CapDesign) => void
}) {
  return (
    <div className={styles.editor}>
      <div className={styles.preview}>
        {/* 3人ぶん並べる。顔が違っても同じ帽子だと分かる */}
        {['cap-a', 'cap-b', 'cap-c'].map((seed) => (
          <PlayerPortrait
            key={seed}
            playerId={seed}
            size={54}
            cap
            capDesign={design}
            schoolName={schoolName}
          />
        ))}
      </div>

      <ColorRow
        label="本体"
        value={design.crown}
        onPick={(crown) => onChange({ ...design, crown })}
      />
      <ColorRow label="つば" value={design.brim} onPick={(brim) => onChange({ ...design, brim })} />
      <ColorRow
        label="マークの色"
        value={design.logoColor}
        onPick={(logoColor) => onChange({ ...design, logoColor })}
      />

      <div className={styles.row}>
        <span className={styles.label}>マーク</span>
        <div className={styles.logos}>
          {CAP_LOGOS.map((logo) => (
            <button
              key={logo.id}
              type="button"
              className={logo.id === design.logo ? `${styles.logo} ${styles.active}` : styles.logo}
              onClick={() => onChange({ ...design, logo: logo.id as CapLogoId })}
            >
              {logo.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ColorRow({
  label,
  value,
  onPick,
}: {
  label: string
  value: CapColorId
  onPick: (id: CapColorId) => void
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.swatches}>
        {CAP_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={color.name}
            className={color.id === value ? `${styles.swatch} ${styles.active}` : styles.swatch}
            style={{ background: capColorOf(color.id) }}
            onClick={() => onPick(color.id)}
          />
        ))}
      </div>
    </div>
  )
}
