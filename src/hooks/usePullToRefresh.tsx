import { useCallback, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  resistance?: number;
  maxPullDistance?: number;
}

interface UsePullToRefreshReturn {
  isRefreshing: boolean;
  pullProgress: number;
  containerProps: React.HTMLAttributes<HTMLDivElement>;
  spinnerProps: React.HTMLAttributes<HTMLDivElement>;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
  maxPullDistance = 150,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);
  const isAtTop = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable pull-to-refresh when at the top of the page
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
      isAtTop.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || !isAtTop.current) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only allow pulling down (positive diff)
    if (diff > 0) {
      // Apply resistance to make it feel natural
      const pulledDistance = diff / resistance;
      const progress = Math.min(pulledDistance / threshold, 1);
      setPullProgress(progress);
      
      // Prevent default only when pulling down at the top
      if (pulledDistance < maxPullDistance) {
        // Don't prevent default - allow natural scroll
      }
    }
  }, [threshold, resistance, maxPullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || !isAtTop.current) return;

    const diff = currentY.current - startY.current;
    const pulledDistance = diff / resistance;

    if (pulledDistance >= threshold) {
      setIsRefreshing(true);
      setPullProgress(1);
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullProgress(0);
      }
    } else {
      setPullProgress(0);
    }

    isPulling.current = false;
    isAtTop.current = false;
    startY.current = 0;
    currentY.current = 0;
  }, [onRefresh, threshold, resistance]);

  const containerProps: React.HTMLAttributes<HTMLDivElement> = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  const spinnerProps: React.HTMLAttributes<HTMLDivElement> = {
    style: {
      opacity: pullProgress,
      transform: `translateY(${pullProgress * 20}px) rotate(${pullProgress * 360}deg)`,
    },
  };

  return {
    isRefreshing,
    pullProgress,
    containerProps,
    spinnerProps,
  };
}