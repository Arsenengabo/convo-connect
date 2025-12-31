import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Chat, ChatMember } from '@/hooks/useChats';
import { Call, useActiveCall, useInitiateCall } from '@/hooks/useCalls';
import { CallUI } from './CallUI';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Phone, Video, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface CallButtonsProps {
  chat: Chat;
  chatName: string;
}

export const CallButtons = ({ chat, chatName }: CallButtonsProps) => {
  const { user } = useAuth();
  const { data: activeCall } = useActiveCall(chat.id);
  const initiateCall = useInitiateCall();
  const [currentCall, setCurrentCall] = useState<Call | null>(null);

  // Get recipient IDs (other chat members)
  const getRecipientIds = (): string[] => {
    return (chat.chat_members || [])
      .filter((m: ChatMember) => m.user_id !== user?.id)
      .map((m: ChatMember) => m.user_id);
  };

  const handleStartCall = async (callType: 'voice' | 'video') => {
    const recipientIds = getRecipientIds();
    
    if (recipientIds.length === 0) {
      toast.error('No one to call');
      return;
    }

    try {
      const call = await initiateCall.mutateAsync({
        chatId: chat.id,
        callType,
        recipientIds
      });

      setCurrentCall({
        ...call,
        call_type: call.call_type as 'voice' | 'video' | 'live',
        status: call.status as any
      });

      toast.success(`${callType === 'video' ? 'Video' : 'Voice'} call started`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start call');
    }
  };

  const handleJoinCall = () => {
    if (activeCall) {
      setCurrentCall(activeCall);
    }
  };

  const handleCallEnd = () => {
    setCurrentCall(null);
  };

  // If there's an ongoing call UI
  if (currentCall) {
    return (
      <CallUI
        call={currentCall}
        chatName={chatName}
        onCallEnd={handleCallEnd}
      />
    );
  }

  // If there's an active call to join
  if (activeCall && activeCall.initiator_id !== user?.id) {
    return (
      <Button
        variant="default"
        size="sm"
        onClick={handleJoinCall}
        className="bg-green-600 hover:bg-green-700 gap-2"
      >
        <Phone className="h-4 w-4" />
        Join Call
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* Quick voice call button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('voice')}
        disabled={initiateCall.isPending || !!activeCall}
        title="Voice call"
      >
        <Phone className="h-5 w-5" />
      </Button>

      {/* Quick video call button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleStartCall('video')}
        disabled={initiateCall.isPending || !!activeCall}
        title="Video call"
      >
        <Video className="h-5 w-5" />
      </Button>
    </div>
  );
};
