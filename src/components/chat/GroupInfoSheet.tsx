import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupMembers, useAddGroupMember, useRemoveGroupMember, useUpdateMemberRole, useLeaveGroup } from '@/hooks/useGroupChat';
import { Chat } from '@/hooks/useChats';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, MoreVertical, Crown, UserMinus, Shield, LogOut, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GroupInfoSheetProps {
  chat: Chat;
  onLeave?: () => void;
}

export const GroupInfoSheet = ({ chat, onLeave }: GroupInfoSheetProps) => {
  const { user } = useAuth();
  const { data: members = [], isLoading } = useGroupMembers(chat.id);
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const updateRole = useUpdateMemberRole();
  const leaveGroup = useLeaveGroup();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const currentUserMember = members.find(m => m.user_id === user?.id);
  const isAdmin = currentUserMember?.role === 'admin';

  const handleAddMember = async () => {
    if (!searchEmail.trim()) return;

    try {
      // Find user by email
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', searchEmail.trim())
        .maybeSingle();

      if (error) throw error;
      if (!profile) {
        toast.error('User not found');
        return;
      }

      // Check if already a member
      if (members.some(m => m.user_id === profile.id)) {
        toast.error('User is already a member');
        return;
      }

      await addMember.mutateAsync({ chatId: chat.id, userId: profile.id });
      setSearchEmail('');
      setShowAddMember(false);
    } catch (error) {
      toast.error('Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    await removeMember.mutateAsync({ chatId: chat.id, userId });
  };

  const handleToggleAdmin = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await updateRole.mutateAsync({ chatId: chat.id, userId, role: newRole as 'admin' | 'user' });
  };

  const handleLeaveGroup = async () => {
    await leaveGroup.mutateAsync(chat.id);
    setConfirmLeave(false);
    setIsOpen(false);
    onLeave?.();
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Users className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Group Info</SheetTitle>
          </SheetHeader>

          {/* Group Avatar and Name */}
          <div className="flex flex-col items-center gap-3 py-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={chat.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {chat.name?.slice(0, 2).toUpperCase() || 'GR'}
              </AvatarFallback>
            </Avatar>
            <h3 className="text-lg font-semibold">{chat.name || 'Group Chat'}</h3>
            <p className="text-sm text-muted-foreground">{members.length} members</p>
          </div>

          {/* Add Member */}
          {isAdmin && (
            <div className="mb-4">
              {showAddMember ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter email address"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                  />
                  <Button onClick={handleAddMember} disabled={addMember.isPending}>
                    Add
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAddMember(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowAddMember(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              )}
            </div>
          )}

          {/* Members List */}
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-4">Loading...</div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {member.profiles?.username?.slice(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {member.profiles?.username || 'Unknown'}
                        </p>
                        {member.role === 'admin' && (
                          <Badge variant="secondary" className="text-xs">
                            <Crown className="mr-1 h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${member.profiles?.is_online ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                        <span className="text-xs text-muted-foreground">
                          {member.profiles?.is_online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Admin actions */}
                    {isAdmin && member.user_id !== user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleToggleAdmin(member.user_id, member.role)}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            {member.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleRemoveMember(member.user_id)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove from Group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Leave Group */}
          <div className="pt-4 border-t">
            <Button 
              variant="destructive" 
              className="w-full"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Leave Group
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this group? You won't be able to see messages anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveGroup}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
