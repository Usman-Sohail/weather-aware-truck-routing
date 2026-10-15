import styles from './RouteShield.module.css';

interface RouteShieldProps {
  id: string;
  size?: number;
  /** Hide from assistive technology when the route is already named in nearby text. */
  decorative?: boolean;
}

/** The route's letter in a highway-shield outline, the label routes carry everywhere. */
export function RouteShield({ id, size = 28, decorative = false }: RouteShieldProps) {
  return (
    <svg
      className={styles.shield}
      width={size}
      height={(size * 30) / 28}
      viewBox="0 0 28 30"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `Route ${id}`}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      <path d="M2.5 2.5h23v10c0 8.5-6 13.3-11.5 15.5C8.5 25.8 2.5 21 2.5 12.5Z" />
      <text x="14" y="15.5" textAnchor="middle" dominantBaseline="middle">
        {id}
      </text>
    </svg>
  );
}
