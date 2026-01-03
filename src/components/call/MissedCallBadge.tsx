import { useMissedCallCount } from '@/hooks/useCallHistory';
import { cn } from '@/lib/utils';

interface MissedCallBadgeProps {
  className?: string;
}

export const MissedCallBadge = ({ className }: MissedCallBadgeProps) => {
  const { data: count = 0 } = useMissedCallCount();

  if (count === 0) return null;

  return (
    <span 
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground",
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
