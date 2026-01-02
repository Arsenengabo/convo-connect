import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ServiceWorkerContextType {
  isOnline: boolean;
  isUpdateAvailable: boolean;
  updateServiceWorker: () => void;
}

const ServiceWorkerContext = createContext<ServiceWorkerContextType>({
  isOnline: true,
  isUpdateAvailable: false,
  updateServiceWorker: () => {},
});

export const useServiceWorker = () => useContext(ServiceWorkerContext);

interface ServiceWorkerProviderProps {
  children: ReactNode;
}

export const ServiceWorkerProvider = ({ children }: ServiceWorkerProviderProps) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back online",
        description: "Your connection has been restored.",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "You're offline",
        description: "Some features may be unavailable.",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleControllerChange = () => {
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setIsUpdateAvailable(true);
                setWaitingWorker(newWorker);
                toast({
                  title: "Update available",
                  description: "A new version is ready. Tap to refresh.",
                  action: (
                    <button 
                      onClick={() => updateServiceWorker()}
                      className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm"
                    >
                      Refresh
                    </button>
                  ),
                });
              }
            });
          }
        });
      });

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
  }, [toast]);

  const updateServiceWorker = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return (
    <ServiceWorkerContext.Provider value={{ isOnline, isUpdateAvailable, updateServiceWorker }}>
      {children}
    </ServiceWorkerContext.Provider>
  );
};
