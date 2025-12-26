import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface ChatMember {
  id: string;
  chat_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_read_at: string | null;
  profiles?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
    last_seen: string | null;
  };
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  message_type: 'text' | 'image' | 'file';
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  status: 'sent' | 'delivered' | 'read';
  is_deleted: boolean;
  deleted_for_everyone: boolean;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export interface Chat {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  chat_members?: ChatMember[];
  messages?: Message[];
  unread_count?: number;
}

export const useChats = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['chats', user?.id],
    queryFn: async (): Promise<Chat[]> => {
      if (!user) return [];

      // Get all chats the user is a member of
      const { data: memberChats, error: memberError } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;
      if (!memberChats?.length) return [];

      const chatIds = memberChats.map(m => m.chat_id);

      // Get chat details with members and last message
      const { data: chats, error: chatsError } = await supabase
        .from('chats')
        .select(`
          *,
          chat_members (
            id,
            chat_id,
            user_id,
            role,
            joined_at,
            last_read_at
          ),
          messages (
            id,
            content,
            message_type,
            created_at,
            sender_id,
            is_deleted
          )
        `)
        .in('id', chatIds)
        .order('updated_at', { ascending: false });

      if (chatsError) throw chatsError;

      // Fetch profiles for chat members
      const processedChats = await Promise.all((chats || []).map(async (chat) => {
        // Get profiles for members
        const memberUserIds = chat.chat_members?.map((m: any) => m.user_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_online, last_seen')
          .in('id', memberUserIds);

        const membersWithProfiles = chat.chat_members?.map((m: any) => ({
          ...m,
          profiles: profiles?.find((p: any) => p.id === m.user_id)
        })) || [];

        const messages = chat.messages || [];
        const sortedMessages = [...messages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastMessage = sortedMessages[0];
        
        const userMembership = membersWithProfiles.find((m: any) => m.user_id === user.id);
        const lastReadAt = userMembership?.last_read_at;
        
        const unreadCount = messages.filter(
          (m: any) => m.sender_id !== user.id && 
               (!lastReadAt || new Date(m.created_at) > new Date(lastReadAt))
        ).length;

        return {
          ...chat,
          chat_members: membersWithProfiles,
          messages: lastMessage ? [lastMessage] : [],
          unread_count: unreadCount
        } as Chat;
      }));

      return processedChats;
    },
    enabled: !!user
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chats-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_members'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      targetUserId, 
      isGroup = false, 
      name 
    }: { 
      targetUserId?: string; 
      isGroup?: boolean; 
      name?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // For one-to-one chats, check if chat already exists
      if (!isGroup && targetUserId) {
        const { data: existingChats } = await supabase
          .from('chat_members')
          .select('chat_id')
          .eq('user_id', user.id);

        if (existingChats) {
          for (const ec of existingChats) {
            const { data: otherMember } = await supabase
              .from('chat_members')
              .select('user_id')
              .eq('chat_id', ec.chat_id)
              .eq('user_id', targetUserId)
              .maybeSingle();

            if (otherMember) {
              // Check if it's a one-to-one chat (only 2 members)
              const { count } = await supabase
                .from('chat_members')
                .select('*', { count: 'exact', head: true })
                .eq('chat_id', ec.chat_id);

              if (count === 2) {
                return { id: ec.chat_id, existing: true };
              }
            }
          }
        }
      }

      // Create new chat
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({
          is_group: isGroup,
          name: name || null,
          created_by: user.id
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add creator as member
      const { error: memberError } = await supabase
        .from('chat_members')
        .insert({
          chat_id: chat.id,
          user_id: user.id,
          role: isGroup ? 'admin' : 'user'
        });

      if (memberError) throw memberError;

      // Add target user for one-to-one chat
      if (targetUserId) {
        const { error: targetError } = await supabase
          .from('chat_members')
          .insert({
            chat_id: chat.id,
            user_id: targetUserId,
            role: 'user'
          });

        if (targetError) throw targetError;
      }

      return { id: chat.id, existing: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    }
  });
};
