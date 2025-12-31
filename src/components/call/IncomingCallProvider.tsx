import { useState, useEffect } from 'react';
import { useIncomingCalls, Call, useAcceptCall } from '@/hooks/useCalls';
import { IncomingCallModal } from './IncomingCallModal';
import { CallUI } from './CallUI';
import { supabase } from '@/integrations/supabase/client';

export const IncomingCallProvider = ({ children }: { children: React.ReactNode }) => {
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
