import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

export type CallType = 'voice' | 'video' | 'live';
export type CallStatus = 'initiated' | 'ringing' | 'accepted' | 'rejected' | 'in_progress' | 'ended' | 'cancelled' | 'missed';
export type CallParticipantRole = 'host' | 'participant';

export interface Call {
  id: string;
  chat_id: string;
  call_type: CallType;
  status: CallStatus;
  initiator_id: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  initiator?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  role: CallParticipantRole;
  joined_at: string | null;
  left_at: string | null;
  is_muted: boolean;
  is_video_off: boolean;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export interface CallSignal {
  id: string;
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: 'offer' | 'answer' | 'ice-candidate';
  payload: any;
  created_at: string;
}

// Hook to get active call for a chat
export const useActiveCall = (chatId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['active-call', chatId],
    queryFn: async (): Promise<Call | null> => {
      if (!chatId) return null;

      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('chat_id', chatId)
        .in('status', ['initiated', 'ringing', 'accepted', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Fetch initiator profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', data.initiator_id)
          .single();

        return {
          ...data,
          call_type: data.call_type as CallType,
          status: data.status as CallStatus,
          initiator: profile || undefined
        };
      }

      return null;
    },
    enabled: !!chatId,
    refetchInterval: 3000
  });

  // Real-time subscription
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`calls-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `chat_id=eq.${chatId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['active-call', chatId] });
          queryClient.invalidateQueries({ queryKey: ['incoming-calls'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  return query;
};

// Hook to get incoming calls for current user
export const useIncomingCalls = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['incoming-calls', user?.id],
    queryFn: async (): Promise<Call[]> => {
      if (!user) return [];

      // Get calls where user is a participant and status is ringing
      const { data: participations, error: partError } = await supabase
        .from('call_participants')
        .select('call_id')
        .eq('user_id', user.id)
        .is('joined_at', null);

      if (partError) throw partError;

      if (!participations?.length) return [];

      const callIds = participations.map(p => p.call_id);

      const { data: calls, error } = await supabase
        .from('calls')
        .select('*')
        .in('id', callIds)
        .eq('status', 'ringing')
        .neq('initiator_id', user.id);

      if (error) throw error;

      // Fetch initiator profiles
      const initiatorIds = [...new Set(calls?.map(c => c.initiator_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', initiatorIds);

      return (calls || []).map(call => ({
        ...call,
        call_type: call.call_type as CallType,
        status: call.status as CallStatus,
        initiator: profiles?.find(p => p.id === call.initiator_id)
      }));
    },
    enabled: !!user,
    refetchInterval: 2000
  });

  // Real-time subscription for incoming calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`incoming-calls-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_participants',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incoming-calls', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incoming-calls', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
};

// Hook to get call participants
export const useCallParticipants = (callId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['call-participants', callId],
    queryFn: async (): Promise<CallParticipant[]> => {
      if (!callId) return [];

      const { data, error } = await supabase
        .from('call_participants')
        .select('*')
        .eq('call_id', callId)
        .is('left_at', null);

      if (error) throw error;

      // Fetch profiles
      const userIds = data?.map(p => p.user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      return (data || []).map(participant => ({
        ...participant,
        role: participant.role as CallParticipantRole,
        profile: profiles?.find(p => p.id === participant.user_id)
      }));
    },
    enabled: !!callId
  });

  // Real-time subscription
  useEffect(() => {
    if (!callId) return;

    const channel = supabase
      .channel(`call-participants-${callId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_participants',
          filter: `call_id=eq.${callId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['call-participants', callId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, queryClient]);

  return query;
};

// Hook to initiate a call
export const useInitiateCall = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      callType,
      recipientIds
    }: {
      chatId: string;
      callType: CallType;
      recipientIds: string[];
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Check for existing active call
      const { data: existingCall } = await supabase
        .from('calls')
        .select('id')
        .eq('chat_id', chatId)
        .in('status', ['initiated', 'ringing', 'accepted', 'in_progress'])
        .maybeSingle();

      if (existingCall) {
        throw new Error('A call is already in progress');
      }

      // Create call
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          chat_id: chatId,
          call_type: callType,
          status: 'ringing',
          initiator_id: user.id
        })
        .select()
        .single();

      if (callError) throw callError;

      // Add initiator as host participant
      const { error: hostError } = await supabase
        .from('call_participants')
        .insert({
          call_id: call.id,
          user_id: user.id,
          role: 'host',
          joined_at: new Date().toISOString()
        });

      if (hostError) throw hostError;

      // Add recipients as participants (not yet joined)
      const participantInserts = recipientIds.map(userId => ({
        call_id: call.id,
        user_id: userId,
        role: 'participant' as const
      }));

      if (participantInserts.length > 0) {
        const { error: partError } = await supabase
          .from('call_participants')
          .insert(participantInserts);

        if (partError) throw partError;
      }

      return call;
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['active-call', chatId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate call');
    }
  });
};

// Hook to accept a call
export const useAcceptCall = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Update participant joined_at
      const { error: partError } = await supabase
        .from('call_participants')
        .update({ joined_at: new Date().toISOString() })
        .eq('call_id', callId)
        .eq('user_id', user.id);

      if (partError) throw partError;

      // Update call status to in_progress
      const { data: call, error: callError } = await supabase
        .from('calls')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', callId)
        .select()
        .single();

      if (callError) throw callError;

      return call;
    },
    onSuccess: (call) => {
      queryClient.invalidateQueries({ queryKey: ['active-call', call.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['incoming-calls'] });
      queryClient.invalidateQueries({ queryKey: ['call-participants', call.id] });
    }
  });
};

// Hook to reject a call
export const useRejectCall = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Update participant left_at
      const { error: partError } = await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', callId)
        .eq('user_id', user.id);

      if (partError) throw partError;

      // Check remaining participants
      const { count } = await supabase
        .from('call_participants')
        .select('*', { count: 'exact', head: true })
        .eq('call_id', callId)
        .is('left_at', null)
        .not('joined_at', 'is', null);

      // If no active participants, end the call
      if (count === 0) {
        const { data: call, error: callError } = await supabase
          .from('calls')
          .update({ 
            status: 'rejected',
            ended_at: new Date().toISOString()
          })
          .eq('id', callId)
          .select()
          .single();

        if (callError) throw callError;
        return call;
      }

      const { data: call } = await supabase
        .from('calls')
        .select()
        .eq('id', callId)
        .single();

      return call;
    },
    onSuccess: (call) => {
      queryClient.invalidateQueries({ queryKey: ['active-call', call?.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['incoming-calls'] });
      toast.info('Call rejected');
    }
  });
};

// Hook to cancel a call (before answered)
export const useCancelCall = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: call, error } = await supabase
        .from('calls')
        .update({ 
          status: 'cancelled',
          ended_at: new Date().toISOString()
        })
        .eq('id', callId)
        .eq('initiator_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return call;
    },
    onSuccess: (call) => {
      queryClient.invalidateQueries({ queryKey: ['active-call', call.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['incoming-calls'] });
      toast.info('Call cancelled');
    }
  });
};

// Hook to end a call
export const useEndCall = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Update participant left_at
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', callId)
        .eq('user_id', user.id);

      // Check remaining participants
      const { count } = await supabase
        .from('call_participants')
        .select('*', { count: 'exact', head: true })
        .eq('call_id', callId)
        .is('left_at', null);

      // If no active participants, end the call
      if (count === 0) {
        const { data: call, error } = await supabase
          .from('calls')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', callId)
          .select()
          .single();

        if (error) throw error;

        // Clean up signals
        await supabase
          .from('call_signals')
          .delete()
          .eq('call_id', callId);

        return call;
      }

      const { data: call } = await supabase
        .from('calls')
        .select()
        .eq('id', callId)
        .single();

      return call;
    },
    onSuccess: (call) => {
      queryClient.invalidateQueries({ queryKey: ['active-call', call?.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['call-participants', call?.id] });
    }
  });
};

// Hook to update participant status (mute/video)
export const useUpdateCallParticipant = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      callId,
      isMuted,
      isVideoOff
    }: {
      callId: string;
      isMuted?: boolean;
      isVideoOff?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const updates: Record<string, boolean> = {};
      if (isMuted !== undefined) updates.is_muted = isMuted;
      if (isVideoOff !== undefined) updates.is_video_off = isVideoOff;

      const { error } = await supabase
        .from('call_participants')
        .update(updates)
        .eq('call_id', callId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: (_, { callId }) => {
      queryClient.invalidateQueries({ queryKey: ['call-participants', callId] });
    }
  });
};

// WebRTC Signaling Hook for calls
export const useCallSignaling = (callId: string | null) => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<CallSignal[]>([]);

  useEffect(() => {
    if (!callId || !user) return;

    // Fetch existing signals
    const fetchSignals = async () => {
      const { data } = await supabase
        .from('call_signals')
        .select('*')
        .eq('call_id', callId)
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: true });

      if (data) {
        setSignals(data as CallSignal[]);
      }
    };

    fetchSignals();

    // Listen for new signals
    const channel = supabase
      .channel(`call-signals-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `receiver_id=eq.${user.id}`
        },
        (payload) => {
          const signal = payload.new as CallSignal;
          if (signal.call_id === callId) {
            setSignals(prev => [...prev, signal]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, user]);

  const sendSignal = useCallback(async (
    receiverId: string,
    signalType: 'offer' | 'answer' | 'ice-candidate',
    payload: any
  ) => {
    if (!callId || !user) return;

    await supabase.from('call_signals').insert({
      call_id: callId,
      sender_id: user.id,
      receiver_id: receiverId,
      signal_type: signalType,
      payload
    });
  }, [callId, user]);

  const clearSignals = useCallback(() => {
    setSignals([]);
  }, []);

  const consumeSignal = useCallback((signalId: string) => {
    setSignals(prev => prev.filter(s => s.id !== signalId));
  }, []);

  return { signals, sendSignal, clearSignals, consumeSignal };
};

// Timeout hook for unanswered calls
export const useCallTimeout = (callId: string | null, timeoutMs: number = 30000) => {
  const cancelCall = useCancelCall();
  const { user } = useAuth();

  useEffect(() => {
    if (!callId) return;

    const timeout = setTimeout(async () => {
      // Check if call is still ringing
      const { data: call } = await supabase
        .from('calls')
        .select('status, initiator_id')
        .eq('id', callId)
        .single();

      if (call?.status === 'ringing' && call?.initiator_id === user?.id) {
        // Update to missed
        await supabase
          .from('calls')
          .update({ 
            status: 'missed',
            ended_at: new Date().toISOString()
          })
          .eq('id', callId);

        toast.info('Call unanswered');
      }
    }, timeoutMs);

    return () => clearTimeout(timeout);
  }, [callId, timeoutMs, user?.id]);
};
