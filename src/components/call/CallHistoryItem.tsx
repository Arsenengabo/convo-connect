import { CallHistoryItem } from '@/hooks/useCallHistory';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Phone, 
  Video, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

interface CallHistoryItemComponentProps {
  call: CallHistoryItem;
  currentUserId: string;
  onCallBack: () => void;
}

export const CallHistoryItemComponent = ({
  call,
  currentUserId,
  onCallBack
}: CallHistoryItemComponentProps) => {
  // Get the other participant(s) for display
  const otherParticipants = call.participants.filter(p => p.user_id !== currentUserId);
  const displayParticipant = otherParticipants[0];
  
  // Display name logic
  const displayName = call.chat.is_group 
    ? call.chat.name || 'Group Call'
    : displayParticipant?.username || 'Unknown';

  const displayAvatar = call.chat.is_group
    ? call.chat.avatar_url
    : displayParticipant?.avatar_url;

  // Format time
  const formatCallTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    }
    if (isYesterday(date)) {
      return 'Yesterday';
    }
    return format(date, 'MMM d');
  };

  // Format duration
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Get call icon and color
  const getCallIcon = () => {
    if (call.is_missed) {
      return <PhoneMissed className="h-4 w-4 text-destructive" />;
    }
    if (call.is_outgoing) {
      return <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />;
    }
    return <PhoneIncoming className="h-4 w-4 text-muted-foreground" />;
  };

  // Get call type icon
  const getCallTypeIcon = () => {
    if (call.call_type === 'video') {
      return <Video className="h-4 w-4" />;
    }
    return <Phone className="h-4 w-4" />;
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors",
        !call.is_read && call.is_missed && "bg-destructive/5"
      )}
    >
      {/* Avatar */}
      <Avatar className="h-12 w-12">
        <AvatarImage src={displayAvatar || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Call info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium truncate",
            call.is_missed && "text-destructive"
          )}>
            {displayName}
          </span>
          {call.chat.is_group && otherParticipants.length > 1 && (
            <span className="text-xs text-muted-foreground">
              +{otherParticipants.length - 1}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {getCallIcon()}
          <span className={cn(call.is_missed && "text-destructive")}>
            {call.is_missed ? 'Missed' : call.is_outgoing ? 'Outgoing' : 'Incoming'}
          </span>
          <span>•</span>
          <span>{call.call_type === 'video' ? 'Video' : 'Voice'}</span>
          {call.duration && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(call.duration)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Time and callback */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {formatCallTime(call.created_at)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCallBack}
          className="text-primary hover:bg-primary/10"
        >
          {getCallTypeIcon()}
        </Button>
      </div>
    </div>
  );
};
