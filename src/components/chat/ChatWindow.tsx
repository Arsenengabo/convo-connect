import { useState, useRef, useEffect } from 'react';
import { Chat, ChatMember } from '@/hooks/useChats';
import { useMessages, useSendMessage, useDeleteMessage, useMarkAsRead } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileOptimizations } from '@/hooks/useMobileOptimizations';
import { MessageBubble } from './MessageBubble';
import { FileUploadButton } from './FileUploadButton';
import { GroupInfoSheet } from './GroupInfoSheet';
import { LiveSessionButton } from './LiveSession';
import { CallButtons } from '@/components/call/CallButtons';
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
  const { isMobile, triggerHaptic, isKeyboardOpen } = useMobileOptimizations();
  const [messageText, setMessageText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    markAsRead(chat.id);
  }, [chat.id, markAsRead]);

  // Focus input on mount (but not on mobile to prevent keyboard popup)
  useEffect(() => {
    if (!isMobile) {
      inputRef.current?.focus();
    }
  }, [chat.id, isMobile]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    triggerHaptic('light');
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
      {/* Header - with safe area padding on mobile */}
      <div className="flex items-center gap-2 border-b p-3 md:p-4 pt-safe shrink-0">
        {onBack && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack} 
            className="h-10 w-10 touch-feedback shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={displayInfo.avatar || undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            {displayInfo.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{displayInfo.name}</h2>
          <p className="text-xs text-muted-foreground truncate">{displayInfo.subtitle}</p>
        </div>
        
        {/* Action buttons - responsive layout */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Hide call buttons on very small screens, show in dropdown */}
          <div className="hidden sm:flex items-center gap-1">
            <CallButtons chat={chat} chatName={displayInfo.name} />
            <LiveSessionButton chatId={chat.id} chatName={displayInfo.name} />
          </div>
          
          {chat.is_group && <GroupInfoSheet chat={chat} onLeave={onBack} />}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 touch-feedback">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Show call options in dropdown on mobile */}
              <div className="sm:hidden">
                <DropdownMenuItem className="gap-2">
                  <CallButtons chat={chat} chatName={displayInfo.name} />
                </DropdownMenuItem>
              </div>
              <DropdownMenuItem>View profile</DropdownMenuItem>
              <DropdownMenuItem>Mute notifications</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 md:p-4" ref={scrollRef}>
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
                <div className="mb-4 flex justify-center sticky top-0 z-10">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input - with safe area padding on mobile */}
      <form 
        onSubmit={handleSendMessage} 
        className="border-t p-3 md:p-4 pb-safe shrink-0 bg-background"
      >
        <div className="flex items-center gap-2">
          <FileUploadButton chatId={chat.id} />
          <Input
            ref={inputRef}
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 h-11 text-base"
          />
          <Button 
            type="submit" 
            size="icon" 
            className="h-11 w-11 touch-feedback shrink-0"
            disabled={!messageText.trim() || sendMessage.isPending}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  );
};
