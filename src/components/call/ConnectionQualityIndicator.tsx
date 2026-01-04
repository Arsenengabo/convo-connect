import { ConnectionQuality } from '@/hooks/useWebRTC';
import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
  roundTripTime: number | null;
  className?: string;
}

export const ConnectionQualityIndicator = ({
  quality,
  roundTripTime,
  className
}: ConnectionQualityIndicatorProps) => {
  const getQualityColor = () => {
    switch (quality) {
      case 'excellent':
        return 'text-green-500';
      case 'good':
        return 'text-green-400';
      case 'fair':
        return 'text-yellow-500';
      case 'poor':
        return 'text-red-500';
      case 'disconnected':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  const getQualityLabel = () => {
    switch (quality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'fair':
        return 'Fair';
      case 'poor':
        return 'Poor';
      case 'disconnected':
        return 'Connecting...';
      default:
        return 'Unknown';
    }
  };

  const getBars = () => {
    switch (quality) {
      case 'excellent':
        return 4;
      case 'good':
        return 3;
      case 'fair':
        return 2;
      case 'poor':
        return 1;
      default:
        return 0;
    }
  };

  const bars = getBars();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1', className)}>
            {quality === 'disconnected' ? (
              <WifiOff className="h-4 w-4 text-muted-foreground animate-pulse" />
            ) : (
              <div className="flex items-end gap-0.5 h-4">
                {[1, 2, 3, 4].map((bar) => (
                  <div
                    key={bar}
                    className={cn(
                      'w-1 rounded-sm transition-colors',
                      bar <= bars ? getQualityColor() : 'bg-muted-foreground/30',
                      bar <= bars && quality === 'excellent' && 'bg-green-500',
                      bar <= bars && quality === 'good' && 'bg-green-400',
                      bar <= bars && quality === 'fair' && 'bg-yellow-500',
                      bar <= bars && quality === 'poor' && 'bg-red-500'
                    )}
                    style={{ height: `${bar * 25}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{getQualityLabel()} connection</span>
            {roundTripTime !== null && (
              <span className="text-muted-foreground">
                Latency: {Math.round(roundTripTime)}ms
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
