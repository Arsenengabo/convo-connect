import { Chat, ChatMember } from '@/hooks/useChats';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatListProps {
  chats: Chat[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

export const ChatList = ({ chats, selectedChatId, onSelectChat }: ChatListProps) => {
  const { user } = useAuth();

  const getChatDisplayInfo = (chat: Chat) => {
    if (chat.is_group) {
      return {
        name: chat.name || 'Group Chat',
        avatar: chat.avatar_url,
        isOnline: false
      };
    }

    // For one-to-one chats, find the other user
    const otherMember = chat.chat_members?.find(
      (m: ChatMember) => m.user_id !== user?.id
    );

    return {
      name: otherMember?.profiles?.username || 'Unknown User',
      avatar: otherMember?.profiles?.avatar_url,
      isOnline: otherMember?.profiles?.is_online || false
    };
  };

  const getLastMessage = (chat: Chat) => {
    const lastMessage = chat.messages?.[0];
    if (!lastMessage) return 'No messages yet';
    if (lastMessage.is_deleted) return 'Message deleted';
    return lastMessage.content || `Sent ${lastMessage.message_type}`;
  };

  const getLastMessageTime = (chat: Chat) => {
    const lastMessage = chat.messages?.[0];
    if (!lastMessage) return '';
    return formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true });
  };

  if (chats.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium">No chats yet</p>
        <p className="text-sm">Start a new conversation to get started!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {chats.map((chat) => {
        const displayInfo = getChatDisplayInfo(chat);
        const isSelected = chat.id === selectedChatId;

        return (
          <div
            key={chat.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-accent/50',
              isSelected && 'bg-accent'
            )}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={displayInfo.avatar || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {displayInfo.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {displayInfo.isOnline && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="font-medium truncate">{displayInfo.name}</h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {getLastMessageTime(chat)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground truncate">
                  {getLastMessage(chat)}
                </p>
                {(chat.unread_count || 0) > 0 && (
                  <Badge variant="default" className="ml-2 h-5 min-w-5 rounded-full px-1.5">
                    {chat.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
