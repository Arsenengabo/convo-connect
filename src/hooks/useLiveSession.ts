import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface LiveSession {
  id: string;
  chat_id: string;
  host_id: string;
  title: string | null;
  session_type: 'video' | 'audio';
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  participant_count?: number;
}

export interface LiveParticipant {
  id: string;
  session_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_muted: boolean;
  is_video_off: boolean;
  profiles?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export const useActiveSession = (chatId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-session', chatId],
    queryFn: async (): Promise<LiveSession | null> => {
      if (!chatId) return null;

      const { data, error } = await supabase
        .from('live_sessions')
        .select('*')
        .eq('chat_id', chatId)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Get participant count
        const { count } = await supabase
          .from('live_participants')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', data.id)
          .is('left_at', null);

        return {
          ...data,
          session_type: data.session_type as 'video' | 'audio',
          status: data.status as 'active' | 'ended',
          participant_count: count || 0
        };
      }

      return null;
    },
    enabled: !!chatId,
    refetchInterval: 5000 // Refetch every 5 seconds
  });

  // Real-time subscription
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`live-session-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_sessions',
          filter: `chat_id=eq.${chatId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['live-session', chatId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_participants'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['live-session', chatId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  return query;
};

export const useSessionParticipants = (sessionId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['session-participants', sessionId],
    queryFn: async (): Promise<LiveParticipant[]> => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from('live_participants')
        .select('*')
        .eq('session_id', sessionId)
        .is('left_at', null);

      if (error) throw error;

      // Fetch profiles
      const userIds = data.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      return data.map(participant => ({
        ...participant,
        profiles: profiles?.find(p => p.id === participant.user_id)
      }));
    },
    enabled: !!sessionId
  });

  // Real-time subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`participants-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_participants',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['session-participants', sessionId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  return query;
};

export const useStartSession = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      sessionType = 'video',
      title
    }: {
      chatId: string;
      sessionType?: 'video' | 'audio';
      title?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Check if there's already an active session
      const { data: existing } = await supabase
        .from('live_sessions')
        .select('id')
        .eq('chat_id', chatId)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        throw new Error('A live session is already active in this chat');
      }

      // Create session
      const { data: session, error: sessionError } = await supabase
        .from('live_sessions')
        .insert({
          chat_id: chatId,
          host_id: user.id,
          session_type: sessionType,
          title: title || null
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Join as participant
      const { error: participantError } = await supabase
        .from('live_participants')
        .insert({
          session_id: session.id,
          user_id: user.id
        });

      if (participantError) throw participantError;

      return session;
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['live-session', chatId] });
      toast.success('Live session started');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start session');
    }
  });
};

export const useJoinSession = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Check if already joined
      const { data: existing } = await supabase
        .from('live_participants')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .is('left_at', null)
        .maybeSingle();

      if (existing) {
        return existing;
      }

      const { data, error } = await supabase
        .from('live_participants')
        .insert({
          session_id: sessionId,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['session-participants', data.session_id] });
      queryClient.invalidateQueries({ queryKey: ['live-session'] });
    },
    onError: () => {
      toast.error('Failed to join session');
    }
  });
};

export const useLeaveSession = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('live_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Check if any participants left
      const { count } = await supabase
        .from('live_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .is('left_at', null);

      // If no participants, end session
      if (count === 0) {
        await supabase
          .from('live_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', sessionId);
      }

      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-participants', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['live-session'] });
    }
  });
};

export const useEndSession = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('host_id', user.id);

      if (error) throw error;

      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-participants', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['live-session'] });
      toast.success('Session ended');
    },
    onError: () => {
      toast.error('Failed to end session');
    }
  });
};

export const useUpdateParticipant = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      isMuted,
      isVideoOff
    }: {
      sessionId: string;
      isMuted?: boolean;
      isVideoOff?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const updates: Record<string, boolean> = {};
      if (isMuted !== undefined) updates.is_muted = isMuted;
      if (isVideoOff !== undefined) updates.is_video_off = isVideoOff;

      const { error } = await supabase
        .from('live_participants')
        .update(updates)
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session-participants', sessionId] });
    }
  });
};

// WebRTC Signaling Hook
export const useWebRTCSignaling = (sessionId: string | null) => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    if (!sessionId || !user) return;

    // Listen for new signals
    const channel = supabase
      .channel(`webrtc-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'webrtc_signals',
          filter: `to_user_id=eq.${user.id}`
        },
        (payload) => {
          setSignals(prev => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, user]);

  const sendSignal = useCallback(async (
    toUserId: string,
    signalType: 'offer' | 'answer' | 'ice-candidate',
    signalData: any
  ) => {
    if (!sessionId || !user) return;

    await supabase.from('webrtc_signals').insert({
      session_id: sessionId,
      from_user_id: user.id,
      to_user_id: toUserId,
      signal_type: signalType,
      signal_data: signalData
    });
  }, [sessionId, user]);

  const clearSignals = useCallback(() => {
    setSignals([]);
  }, []);

  return { signals, sendSignal, clearSignals };
};
