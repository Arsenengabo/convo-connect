import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface GroupMember {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  joined_at: string;
  profiles?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
  };
}

export const useCreateGroup = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      memberIds,
      avatarUrl
    }: {
      name: string;
      memberIds: string[];
      avatarUrl?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Create group chat
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({
          is_group: true,
          name,
          avatar_url: avatarUrl || null,
          created_by: user.id
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add creator as admin
      const { error: creatorError } = await supabase
        .from('chat_members')
        .insert({
          chat_id: chat.id,
          user_id: user.id,
          role: 'admin'
        });

      if (creatorError) throw creatorError;

      // Add other members
      if (memberIds.length > 0) {
        const memberInserts = memberIds.map(userId => ({
          chat_id: chat.id,
          user_id: userId,
          role: 'user' as const
        }));

        const { error: membersError } = await supabase
          .from('chat_members')
          .insert(memberInserts);

        if (membersError) throw membersError;
      }

      return chat;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Group created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
    }
  });
};

export const useGroupMembers = (chatId: string | null) => {
  return useQuery({
    queryKey: ['group-members', chatId],
    queryFn: async (): Promise<GroupMember[]> => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('chat_members')
        .select('id, user_id, role, joined_at')
        .eq('chat_id', chatId);

      if (error) throw error;

      // Fetch profiles
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, is_online')
        .in('id', userIds);

      return data.map(member => ({
        ...member,
        role: member.role as 'admin' | 'user',
        profiles: profiles?.find(p => p.id === member.user_id)
      }));
    },
    enabled: !!chatId
  });
};

export const useAddGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      userId
    }: {
      chatId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from('chat_members')
        .insert({
          chat_id: chatId,
          user_id: userId,
          role: 'user'
        });

      if (error) throw error;
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Member added');
    },
    onError: () => {
      toast.error('Failed to add member');
    }
  });
};

export const useRemoveGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      userId
    }: {
      chatId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from('chat_members')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Member removed');
    },
    onError: () => {
      toast.error('Failed to remove member');
    }
  });
};

export const useUpdateMemberRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      userId,
      role
    }: {
      chatId: string;
      userId: string;
      role: 'admin' | 'user';
    }) => {
      const { error } = await supabase
        .from('chat_members')
        .update({ role })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', chatId] });
      toast.success('Role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    }
  });
};

export const useUpdateGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      name,
      avatarUrl
    }: {
      chatId: string;
      name?: string;
      avatarUrl?: string;
    }) => {
      const updates: Record<string, string> = {};
      if (name) updates.name = name;
      if (avatarUrl) updates.avatar_url = avatarUrl;

      const { error } = await supabase
        .from('chats')
        .update(updates)
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Group updated');
    },
    onError: () => {
      toast.error('Failed to update group');
    }
  });
};

export const useLeaveGroup = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('chat_members')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Left group');
    },
    onError: () => {
      toast.error('Failed to leave group');
    }
  });
};
