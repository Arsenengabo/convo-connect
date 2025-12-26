import { useState } from 'react';
import { useAllProfiles, Profile } from '@/hooks/useProfile';
import { useCreateChat } from '@/hooks/useChats';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquarePlus, Search, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface NewChatDialogProps {
  onChatCreated: (chatId: string) => void;
}

export const NewChatDialog = ({ onChatCreated }: NewChatDialogProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: profiles = [], isLoading } = useAllProfiles();
  const createChat = useCreateChat();
  const { toast } = useToast();

  const filteredProfiles = profiles.filter((profile) =>
    profile.username?.toLowerCase().includes(search.toLowerCase()) ||
    profile.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectUser = async (profile: Profile) => {
    try {
      const result = await createChat.mutateAsync({
        targetUserId: profile.id,
        isGroup: false
      });

      if (result.existing) {
        toast({
          title: 'Chat already exists',
          description: 'Opening existing conversation...'
        });
      }

      onChatCreated(result.id);
      setOpen(false);
      setSearch('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create chat. Please try again.',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-pulse text-muted-foreground">Loading users...</div>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <User className="mb-2 h-8 w-8" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent"
                    onClick={() => handleSelectUser(profile)}
                    disabled={createChat.isPending}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {profile.username?.slice(0, 2).toUpperCase() || profile.email.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {profile.is_online && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-medium truncate">
                        {profile.username || profile.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {profile.status_message || profile.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
