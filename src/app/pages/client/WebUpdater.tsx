import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp } from '$components/icons/phosphor';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';
import { createLogger } from '$utils/debug';

const log = createLogger('WebUpdater');

export function WebUpdater() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleUpdate = (ev: Event) => {
      const customEv = ev as CustomEvent<{ registration: ServiceWorkerRegistration }>;
      if (customEv.detail?.registration) {
        log.log('Web update available via ServiceWorker');
        setRegistration(customEv.detail.registration);
      }
    };

    window.addEventListener('sable-sw-update-available', handleUpdate);
    return () => window.removeEventListener('sable-sw-update-available', handleUpdate);
  }, []);

  const handleRefresh = useCallback(() => {
    const waiting = registration?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }

    // Reload only once the new worker has taken control. Reloading on the next line races the
    // message: if the reload wins, the *old* worker serves the old precache and the user lands on
    // the build they were just told to leave.
    let reloaded = false;
    let timer: number | undefined;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      if (timer !== undefined) window.clearTimeout(timer);
      navigator.serviceWorker?.removeEventListener('controllerchange', onChange);
      window.location.reload();
    };
    const onChange = () => reload();

    navigator.serviceWorker?.addEventListener('controllerchange', onChange);
    // A worker that never claims must not strand the user on the update banner.
    timer = window.setTimeout(reload, 3000);

    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
  }, [registration]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!registration || dismissed) return null;

    return {
      id: 'web-app-update',
      priority: 200, // Top priority for updates
      icon: ArrowUp,
      title: 'Update Available',
      description: 'A new version of Maretrix is available. Refresh to apply updates.',
      primaryAction: {
        label: 'Refresh',
        variant: 'Primary',
        onClick: handleRefresh,
      },
      secondaryAction: {
        label: 'Later',
        variant: 'Secondary',
        onClick: handleDismiss,
      },
    };
  }, [registration, dismissed, handleRefresh, handleDismiss]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
