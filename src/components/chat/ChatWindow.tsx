import { useState, useRef, useEffect } from 'react';
import { Chat, ChatMember } from '@/hooks/useChats';
import { useMessages, useSendMessage, useDeleteMessage, useMarkAsRead } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { MessageBubble } from './MessageBubble';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatWindowProps {
  chat: Chat;
  onBack?: () => void;
}

export const ChatWindow = ({ chat, onBack }: ChatWindowProps) => {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useMessages(chat.id);
  const sendMessage = useSendMessage();
  const deleteMessage = useDeleteMessage();
  const markAsRead = useMarkAsRead();
  const [messageText, setMessageText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get chat display info
  const getChatDisplayInfo = () => {
    if (chat.is_group) {
      return {
        name: chat.name || 'Group Chat',
        avatar: chat.avatar_url,
        subtitle: `${chat.chat_members?.length || 0} members`
      };
    }

    const otherMember = chat.chat_members?.find(
      (m: ChatMember) => m.user_id !== user?.id
    );

    const isOnline = otherMember?.profiles?.is_online;
    const lastSeen = otherMember?.profiles?.last_seen;

    return {
      name: otherMember?.profiles?.username || 'Unknown User',
      avatar: otherMember?.profiles?.avatar_url,
      subtitle: isOnline 
        ? 'Online' 
        : lastSeen 
          ? `Last seen ${format(new Date(lastSeen), 'MMM d, HH:mm')}`
          : 'Offline'
    };
  };

  const displayInfo = getChatDisplayInfo();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    markAsRead(chat.id);
  }, [chat.id, markAsRead]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const text = messageText.trim();
    setMessageText('');

    try {
      await sendMessage.mutateAsync({
        chatId: chat.id,
        content: text,
        messageType: 'text'
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(text); // Restore message on error
    }
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean) => {
    try {
      await deleteMessage.mutateAsync({ messageId, forEveryone });
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = format(new Date(message.created_at), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, typeof messages>);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Avatar className="h-10 w-10">
          <AvatarImage src={displayInfo.avatar || undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            {displayInfo.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="font-semibold">{displayInfo.name}</h2>
          <p className="text-xs text-muted-foreground">{displayInfo.subtitle}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Mute notifications</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Send a message to start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                <div className="mb-4 flex justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {format(new Date(date), 'MMMM d, yyyy')}
                  </span>
                </div>
                <div className="space-y-3">
                  {msgs.map((message, index) => {
                    // Show avatar only for first message in a sequence from same sender
                    const prevMessage = msgs[index - 1];
                    const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
                    
                    return (
                      <MessageBubble 
                        key={message.id} 
                        message={message}
                        showAvatar={showAvatar}
                        onDelete={handleDeleteMessage}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="border-t p-4">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!messageText.trim() || sendMessage.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
