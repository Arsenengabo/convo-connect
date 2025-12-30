import { useState, useEffect } from 'react';
import { useChats, Chat } from '@/hooks/useChats';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { CreateGroupDialog } from './CreateGroupDialog';
import { ProfileSheet } from './ProfileSheet';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

export const ChatLayout = () => {
  const { data: chats = [], isLoading } = useChats();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);

  // Check for mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const selectedChat = chats.find((chat: Chat) => chat.id === selectedChatId);

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const handleBack = () => {
    setSelectedChatId(null);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar / Chat List */}
      <div
        className={cn(
          'flex h-full flex-col border-r bg-card',
          isMobileView 
            ? selectedChatId ? 'hidden' : 'w-full' 
            : 'w-80 lg:w-96'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <MessageCircle className="h-4 w-4 text-primary-foreground" />
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
        className={cn(
          'flex-1',
          isMobileView 
            ? selectedChatId ? 'block' : 'hidden' 
            : 'block'
        )}
      >
        {selectedChat ? (
          <ChatWindow 
            chat={selectedChat} 
            onBack={isMobileView ? handleBack : undefined}
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
