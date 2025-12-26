import { Message } from '@/hooks/useChats';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  onDelete?: (messageId: string, forEveryone: boolean) => void;
}

export const MessageBubble = ({ message, showAvatar = true, onDelete }: MessageBubbleProps) => {
  const { user } = useAuth();
  const isOwn = message.sender_id === user?.id;
  const isDeleted = message.is_deleted && message.deleted_for_everyone;

  const getStatusIcon = () => {
    if (!isOwn) return null;
    
    switch (message.status) {
      case 'read':
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      default:
        return <Check className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const renderContent = () => {
    if (isDeleted) {
      return (
        <p className="italic text-muted-foreground">This message was deleted</p>
      );
    }

    switch (message.message_type) {
      case 'image':
        return (
          <div className="space-y-2">
            <img 
              src={message.file_url || ''} 
              alt={message.file_name || 'Image'} 
              className="max-w-[250px] rounded-lg"
            />
            {message.content && <p>{message.content}</p>}
          </div>
        );
      case 'file':
        return (
          <div className="space-y-2">
            <a 
              href={message.file_url || ''} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-accent/50 p-2 hover:bg-accent"
            >
              <div className="text-sm">
                <p className="font-medium">{message.file_name}</p>
                {message.file_size && (
                  <p className="text-xs text-muted-foreground">
                    {(message.file_size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            </a>
            {message.content && <p>{message.content}</p>}
          </div>
        );
      default:
        return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
    }
  };

  const bubble = (
    <div
      className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2',
        isOwn
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : 'bg-card text-card-foreground rounded-bl-md shadow-sm'
      )}
    >
      {!isOwn && showAvatar && (
        <p className="mb-1 text-xs font-medium text-primary">
          {message.profiles?.username || 'Unknown'}
        </p>
      )}
      {renderContent()}
      <div className={cn(
        'mt-1 flex items-center gap-1 text-xs',
        isOwn ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground'
      )}>
        <span>{format(new Date(message.created_at), 'HH:mm')}</span>
        {getStatusIcon()}
      </div>
    </div>
  );

  if (isOwn && !isDeleted) {
    return (
      <div className={cn('flex gap-2', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        {!isOwn && showAvatar && (
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={message.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
              {message.profiles?.username?.slice(0, 2).toUpperCase() || '??'}
            </AvatarFallback>
          </Avatar>
        )}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {bubble}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onDelete?.(message.id, false)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete for me
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => onDelete?.(message.id, true)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete for everyone
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      {!isOwn && showAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={message.profiles?.avatar_url || undefined} />
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
            {message.profiles?.username?.slice(0, 2).toUpperCase() || '??'}
          </AvatarFallback>
        </Avatar>
      )}
      {bubble}
    </div>
  );
};
