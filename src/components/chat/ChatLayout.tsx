import { useState, useEffect } from 'react';
import { useChats, Chat } from '@/hooks/useChats';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { CreateGroupDialog } from './CreateGroupDialog';
import { ProfileSheet } from './ProfileSheet';
import { useMobileOptimizations, useSwipeGesture } from '@/hooks/useMobileOptimizations';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

export const ChatLayout = () => {
  const { data: chats = [], isLoading } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const { isMobile, triggerHaptic } = useMobileOptimizations();
  const [isAnimating, setIsAnimating] = useState(false);

  const selectedChat = chats.find((chat: Chat) => chat.id === selectedChatId);

  const handleSelectChat = (chatId: string) => {
    triggerHaptic('light');
    if (isMobile) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
    setSelectedChatId(chatId);
  };

  const handleBack = () => {
    triggerHaptic('light');
    if (isMobile) {
      setIsAnimating(true);
      setTimeout(() => {
        setSelectedChatId(null);
        setIsAnimating(false);
      }, 50);
    } else {
      setSelectedChatId(null);
    }
  };

  // Swipe gesture for going back on mobile
  const swipeHandlers = useSwipeGesture({
    onSwipeRight: () => {
      if (isMobile && selectedChatId) {
        handleBack();
      }
    },
  }, 80);

  return (
    <div className="flex h-screen-dynamic bg-background overflow-hidden">
      {/* Sidebar / Chat List */}
      <div
        className={cn(
          'flex h-full flex-col border-r bg-card transition-transform duration-300 ease-out gpu-accelerated',
          isMobile 
            ? selectedChatId 
              ? 'fixed inset-0 -translate-x-full' 
              : 'w-full translate-x-0' 
            : 'w-80 lg:w-96 shrink-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 pt-safe">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary touch-feedback">
              <MessageCircle className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">ChatFlow</h1>
          </div>
          <div className="flex items-center gap-1">
            <NewChatDialog onChatCreated={handleSelectChat} />
            <CreateGroupDialog onCreated={handleSelectChat} />
            <ProfileSheet />
          </div>
        </div>

        {/* Chat List */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chats...</div>
          </div>
        ) : (
          <ChatList
            chats={chats}
            selectedChatId={selectedChatId}
            onSelectChat={handleSelectChat}
          />
        )}
      </div>

      {/* Chat Window */}
      <div
        {...(isMobile ? swipeHandlers : {})}
        className={cn(
          'flex-1 transition-transform duration-300 ease-out gpu-accelerated',
          isMobile 
            ? selectedChatId 
              ? 'fixed inset-0 translate-x-0' 
              : 'fixed inset-0 translate-x-full'
            : 'block'
        )}
      >
        {selectedChat ? (
          <ChatWindow 
            chat={selectedChat} 
            onBack={isMobile ? handleBack : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Welcome to ChatFlow</h2>
              <p className="mt-2 text-muted-foreground">
                Select a conversation or start a new one to begin messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
