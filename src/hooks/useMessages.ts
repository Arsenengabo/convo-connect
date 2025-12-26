import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useCallback } from 'react';
import { Message } from './useChats';

export const useMessages = (chatId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', chatId],
    queryFn: async (): Promise<Message[]> => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Fetch profiles for senders
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds);

      return (data || []).map(msg => ({
        ...msg,
        profiles: profiles?.find(p => p.id === msg.sender_id)
      })) as Message[];
    },
    enabled: !!chatId && !!user
  });

  // Subscribe to real-time messages
  useEffect(() => {
    if (!chatId || !user) return;

    const channel = supabase
      .channel(`messages-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        async (payload) => {
          // Fetch the complete message with profile
          const { data: msgData } = await supabase
            .from('messages')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (msgData) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .eq('id', msgData.sender_id)
              .single();
            
            const newMessage = { ...msgData, profiles: profileData } as Message;
            queryClient.setQueryData(['messages', chatId], (old: Message[] | undefined) => {
              if (!old) return [newMessage];
              // Avoid duplicates
              if (old.some(m => m.id === newMessage.id)) return old;
              return [...old, newMessage];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, user, queryClient]);

  return query;
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      chatId,
      content,
      messageType = 'text',
      fileUrl,
      fileName,
      fileSize
    }: {
      chatId: string;
      content?: string;
      messageType?: 'text' | 'image' | 'file';
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content,
          message_type: messageType,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize
        })
        .select(`
          *,
          profiles:sender_id (
            id,
            username,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Update chat's updated_at
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    }
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      messageId,
      forEveryone = false
    }: {
      messageId: string;
      forEveryone?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_for_everyone: forEveryone,
          content: forEveryone ? 'This message was deleted' : null
        })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    }
  });
};

export const useMarkAsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(async (chatId: string) => {
    if (!user) return;

    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', user.id);

    queryClient.invalidateQueries({ queryKey: ['chats'] });
  }, [user, queryClient]);
};
