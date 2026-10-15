import { riskInfo } from '../lib/risk';
import type { RiskKey } from '../types/api';
import styles from './RiskBadge.module.css';
import { RiskGlyph } from './RiskGlyph';

interface RiskBadgeProps {
  level: RiskKey;
  size?: 'regular' | 'small';
}

/** A risk level as colour, road-sign glyph and text, so it never relies on colour alone. */
export function RiskBadge({ level, size = 'regular' }: RiskBadgeProps) {
  const info = riskInfo(level);
  return (
    <span
      className={styles.badge}
      data-size={size}
      style={{ backgroundColor: info.color, color: info.ink === 'dark' ? '#1f2a30' : '#ffffff' }}
    >
      <RiskGlyph glyph={info.glyph} size={size === 'small' ? 12 : 14} />
      {info.label}
    </span>
  );
}
