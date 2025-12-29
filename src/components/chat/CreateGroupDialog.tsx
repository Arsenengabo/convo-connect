import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateGroup } from '@/hooks/useGroupChat';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';

interface CreateGroupDialogProps {
  onCreated?: (chatId: string) => void;
}

export const CreateGroupDialog = ({ onCreated }: CreateGroupDialogProps) => {
  const { user } = useAuth();
  const createGroup = useCreateGroup();
  const [isOpen, setIsOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Fetch all users except current user
  const { data: users = [] } = useQuery({
    queryKey: ['all-users', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, is_online')
        .neq('id', user?.id);

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!user
  });

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;

    const result = await createGroup.mutateAsync({
      name: groupName.trim(),
      memberIds: selectedMembers
    });

    if (result) {
      setIsOpen(false);
      setGroupName('');
      setSelectedMembers([]);
      onCreated?.(result.id);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="mr-2 h-4 w-4" />
          New Group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="groupName">Group Name</Label>
            <Input
              id="groupName"
              placeholder="Enter group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Add Members ({selectedMembers.length} selected)</Label>
            <ScrollArea className="h-[200px] rounded-md border p-2">
              {users.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No users found</p>
              ) : (
                <div className="space-y-2">
                  {users.map((profile) => (
                    <label
                      key={profile.id}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(profile.id)}
                        onCheckedChange={() => toggleMember(profile.id)}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                          {profile.username?.slice(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">
                          {profile.username || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${profile.is_online ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                          <span className="text-xs text-muted-foreground">
                            {profile.is_online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!groupName.trim() || createGroup.isPending}
            >
              Create Group
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
