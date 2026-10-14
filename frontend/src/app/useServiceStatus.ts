import { useEffect, useState } from 'react';

import { getHealth, isAbortError } from '../lib/api';

export type ServiceStatus = 'checking' | 'online' | 'offline';

/**
 * Checks the backend once on page load. The request also warms up the
 * serverless backend while the user fills in the form.
 */
export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(
      () => setStatus('online'),
      (error: unknown) => {
        if (!isAbortError(error)) {
          setStatus('offline');
        }
      },
    );
    return () => controller.abort();
  }, []);

  return status;
}
