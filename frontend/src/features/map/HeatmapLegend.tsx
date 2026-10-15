import { useId } from 'react';

import { formatMiles } from '../../lib/format';
import { RISK_LEVELS, UNKNOWN_RISK } from '../../lib/risk';
import { washColor } from './heatmap';
import styles from './HeatmapLegend.module.css';

export function HeatmapLegend({ approxCellMi }: { approxCellMi: number }) {
  const titleId = useId();
  return (
    <div className={styles.legend}>
      <p id={titleId} className={styles.title}>
        Weather risk
      </p>
      <ul className={styles.levels} aria-labelledby={titleId}>
        {RISK_LEVELS.map((level) => (
          <li key={level.key} className={styles.level}>
            <span
              className={styles.swatch}
              style={{ backgroundColor: washColor(level.color) }}
              aria-hidden="true"
            />
            {level.label}
          </li>
        ))}
        <li className={styles.level}>
          <span
            className={styles.swatch}
            data-hatched
            style={{ color: UNKNOWN_RISK.color }}
            aria-hidden="true"
          />
          {UNKNOWN_RISK.label}
        </li>
      </ul>
      <p className={styles.grid}>Grid ≈ {formatMiles(Math.round(approxCellMi))}</p>
    </div>
  );
}
