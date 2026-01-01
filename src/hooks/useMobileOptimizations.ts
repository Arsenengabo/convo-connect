import { useState, useEffect, useCallback } from 'react';

interface MobileOptimizations {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTouchDevice: boolean;
  orientation: 'portrait' | 'landscape';
  isKeyboardOpen: boolean;
  viewportHeight: number;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  triggerHaptic: (type?: 'light' | 'medium' | 'heavy') => void;
}

export const useMobileOptimizations = (): MobileOptimizations => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [safeAreaInsets, setSafeAreaInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Update device type based on width
  useEffect(() => {
    const updateDeviceType = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      setIsDesktop(width >= 1024);
    };

    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);
    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);

  // Update orientation
  useEffect(() => {
    const updateOrientation = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  // Detect keyboard open (primarily for mobile)
  useEffect(() => {
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = window.innerHeight;
      setViewportHeight(currentHeight);
      
      // If height shrinks significantly, keyboard is likely open
      const heightDiff = initialHeight - currentHeight;
      setIsKeyboardOpen(heightDiff > 150);
    };

    // Use visualViewport API if available for better keyboard detection
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Get safe area insets from CSS environment variables
  useEffect(() => {
    const updateSafeAreaInsets = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      setSafeAreaInsets({
        top: parseInt(computedStyle.getPropertyValue('--sat') || '0', 10),
        bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0', 10),
        left: parseInt(computedStyle.getPropertyValue('--sal') || '0', 10),
        right: parseInt(computedStyle.getPropertyValue('--sar') || '0', 10),
      });
    };

    updateSafeAreaInsets();
    window.addEventListener('resize', updateSafeAreaInsets);
    return () => window.removeEventListener('resize', updateSafeAreaInsets);
  }, []);

  // Haptic feedback function
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30, 10, 30],
      };
      navigator.vibrate(patterns[type]);
    }
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop,
    isIOS,
    isAndroid,
    isTouchDevice,
    orientation,
    isKeyboardOpen,
    viewportHeight,
    safeAreaInsets,
    triggerHaptic,
  };
};

// Hook for touch gestures
interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export const useSwipeGesture = (handlers: SwipeHandlers, threshold = 50) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;

    // Check if horizontal swipe is more significant than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > threshold) {
        handlers.onSwipeRight?.();
      } else if (deltaX < -threshold) {
        handlers.onSwipeLeft?.();
      }
    } else {
      if (deltaY > threshold) {
        handlers.onSwipeDown?.();
      } else if (deltaY < -threshold) {
        handlers.onSwipeUp?.();
      }
    }

    setTouchStart(null);
  }, [touchStart, handlers, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
};

// Hook for long press detection
export const useLongPress = (onLongPress: () => void, delay = 500) => {
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    const id = setTimeout(onLongPress, delay);
    setTimerId(id);
  }, [onLongPress, delay]);

  const stop = useCallback(() => {
    if (timerId) {
      clearTimeout(timerId);
      setTimerId(null);
    }
  }, [timerId]);

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop,
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
  };
};
