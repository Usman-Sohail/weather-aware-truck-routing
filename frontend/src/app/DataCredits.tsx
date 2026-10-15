import type { ReactNode } from 'react';

import styles from './DataCredits.module.css';

/** Credits for the weather and routing data, as the providers' terms ask. */
export function DataCredits() {
  return (
    <footer className={styles.credits}>
      Weather data by <CreditLink href="https://open-meteo.com/">Open-Meteo.com</CreditLink> (
      <CreditLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</CreditLink>).
      Routes and places by <CreditLink href="https://www.tomtom.com/">TomTom</CreditLink>.
    </footer>
  );
}

/** Opens in a new tab, so following a credit never closes the driver's plan. */
function CreditLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
