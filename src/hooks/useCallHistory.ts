import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { Call, CallType, CallStatus } from './useCalls';

export interface CallHistoryItem extends Call {
  participants: {
    user_id: string;
    username: string | null;
    avatar_url: string | null;
    role: 'host' | 'participant';
  }[];
  chat: {
    id: string;
    name: string | null;
    is_group: boolean;
    avatar_url: string | null;
  };
  duration: number | null;
  is_missed: boolean;
  is_outgoing: boolean;
  is_read: boolean;
}

export type CallHistoryFilter = 'all' | 'missed' | 'incoming' | 'outgoing';

export const useCallHistory = (filter: CallHistoryFilter = 'all') => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['call-history', user?.id, filter],
    queryFn: async (): Promise<CallHistoryItem[]> => {
      if (!user) return [];

      // First get all calls where user is initiator or participant
      const { data: participations, error: partError } = await supabase
        .from('call_participants')
        .select('call_id, role, read_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (partError) throw partError;

      const callIds = participations?.map(p => p.call_id) || [];
      if (callIds.length === 0) return [];

      // Get calls
      const { data: calls, error: callsError } = await supabase
        .from('calls')
        .select('*')
        .in('id', callIds)
        .in('status', ['ended', 'rejected', 'cancelled', 'missed'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (callsError) throw callsError;
      if (!calls?.length) return [];

      // Get chat info
      const chatIds = [...new Set(calls.map(c => c.chat_id))];
      const { data: chats } = await supabase
        .from('chats')
        .select('id, name, is_group, avatar_url')
        .in('id', chatIds);

      // Get all participants for these calls
      const { data: allParticipants } = await supabase
        .from('call_participants')
        .select('call_id, user_id, role')
        .in('call_id', callIds);

      // Get participant profiles
      const participantIds = [...new Set(allParticipants?.map(p => p.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', participantIds);

      // Map calls to history items
      const historyItems: CallHistoryItem[] = calls.map(call => {
        const participation = participations?.find(p => p.call_id === call.id);
        const chat = chats?.find(c => c.id === call.chat_id);
        const callParticipants = allParticipants
          ?.filter(p => p.call_id === call.id)
          .map(p => {
            const profile = profiles?.find(pr => pr.id === p.user_id);
            return {
              user_id: p.user_id,
              username: profile?.username || null,
              avatar_url: profile?.avatar_url || null,
              role: p.role as 'host' | 'participant'
            };
          }) || [];

        const isOutgoing = call.initiator_id === user.id;
        const isMissed = call.status === 'missed' || 
          (call.status === 'rejected' && !isOutgoing) ||
          (call.status === 'cancelled' && !isOutgoing);

        // Calculate duration
        let duration: number | null = null;
        if (call.started_at && call.ended_at) {
          duration = Math.floor(
            (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000
          );
        }

        return {
          ...call,
          call_type: call.call_type as CallType,
          status: call.status as CallStatus,
          participants: callParticipants,
          chat: chat || { id: call.chat_id, name: null, is_group: false, avatar_url: null },
          duration,
          is_missed: isMissed,
          is_outgoing: isOutgoing,
          is_read: !!participation?.read_at
        };
      });

      // Apply filter
      switch (filter) {
        case 'missed':
          return historyItems.filter(c => c.is_missed);
        case 'incoming':
          return historyItems.filter(c => !c.is_outgoing);
        case 'outgoing':
          return historyItems.filter(c => c.is_outgoing);
        default:
          return historyItems;
      }
    },
    enabled: !!user
  });

  // Real-time subscription for new calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`call-history-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['call-history', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
};

// Hook to get missed call count
export const useMissedCallCount = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['missed-call-count', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;

      // Get unread missed calls
      const { data: participations, error } = await supabase
        .from('call_participants')
        .select('call_id, read_at')
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
      if (!participations?.length) return 0;

      const callIds = participations.map(p => p.call_id);

      // Count missed calls
      const { count, error: countError } = await supabase
        .from('calls')
        .select('*', { count: 'exact', head: true })
        .in('id', callIds)
        .in('status', ['missed', 'rejected', 'cancelled'])
        .neq('initiator_id', user.id);

      if (countError) throw countError;

      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 10000
  });
};

// Hook to mark calls as read
export const useMarkCallsAsRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callIds?: string[]) => {
      if (!user) throw new Error('Not authenticated');

      const query = supabase
        .from('call_participants')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (callIds?.length) {
        query.in('call_id', callIds);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missed-call-count', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['call-history', user?.id] });
    }
  });
};
