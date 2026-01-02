import { useServiceWorker } from './ServiceWorkerProvider';
import { WifiOff } from 'lucide-react';

export const NetworkStatus = () => {
  const { isOnline } = useServiceWorker();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 safe-area-top">
      <WifiOff className="w-4 h-4" />
      <span>You're offline. Some features may be unavailable.</span>
    </div>
  );
};
