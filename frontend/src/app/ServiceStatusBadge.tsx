import styles from './ServiceStatusBadge.module.css';
import type { ServiceStatus } from './useServiceStatus';

const LABELS: Record<ServiceStatus, string> = {
  checking: 'Connecting to service…',
  online: 'Service online',
  offline: 'Service unavailable',
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <p className={styles.badge} data-status={status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[status]}
    </p>
  );
}
