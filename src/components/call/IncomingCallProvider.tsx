import { useState, useEffect } from 'react';
import { useIncomingCalls, Call, useAcceptCall } from '@/hooks/useCalls';
import { IncomingCallModal } from './IncomingCallModal';
import { CallUI } from './CallUI';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const IncomingCallProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: incomingCalls = [] } = useIncomingCalls();
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [chatName, setChatName] = useState('');

  // Get the first incoming call
  const currentIncomingCall = incomingCalls[0];

  // Fetch chat name when we have an incoming call
  useEffect(() => {
    if (!currentIncomingCall) return;

    const fetchChatName = async () => {
      const { data: chat } = await supabase
        .from('chats')
        .select('name, is_group')
        .eq('id', currentIncomingCall.chat_id)
        .single();

      if (chat?.is_group) {
        setChatName(chat.name || 'Group Call');
      } else {
        setChatName(currentIncomingCall.initiator?.username || 'Call');
      }
    };

    fetchChatName();
  }, [currentIncomingCall]);

  // Listen for missed calls to show toast
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`missed-calls-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls'
        },
        async (payload) => {
          const call = payload.new;
          // Check if this is a missed call for the current user
          if (call.status === 'missed' && call.initiator_id !== user.id) {
            // Verify user was a participant
            const { data: participation } = await supabase
              .from('call_participants')
              .select('id')
              .eq('call_id', call.id)
              .eq('user_id', user.id)
              .single();

            if (participation) {
              // Get caller info
              const { data: caller } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', call.initiator_id)
                .single();

              toast.error(`Missed ${call.call_type} call from ${caller?.username || 'Unknown'}`, {
                action: {
                  label: 'View',
                  onClick: () => window.location.href = '/calls'
                }
              });

              // Invalidate missed call count
              queryClient.invalidateQueries({ queryKey: ['missed-call-count', user.id] });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const handleAccept = () => {
    if (currentIncomingCall) {
      setActiveCall(currentIncomingCall);
    }
  };

  const handleReject = () => {
    // Call is automatically updated by the hook
  };

  const handleCallEnd = () => {
    setActiveCall(null);
  };

  return (
    <>
      {children}

      {/* Show incoming call modal */}
      {currentIncomingCall && !activeCall && (
        <IncomingCallModal
          call={currentIncomingCall}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {/* Show active call UI */}
      {activeCall && (
        <CallUI
          call={activeCall}
          chatName={chatName}
          onCallEnd={handleCallEnd}
        />
      )}
    </>
  );
};
