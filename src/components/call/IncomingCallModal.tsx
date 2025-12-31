import { useEffect, useRef } from 'react';
import { Call, useAcceptCall, useRejectCall } from '@/hooks/useCalls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IncomingCallModalProps {
  call: Call;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal = ({ call, onAccept, onReject }: IncomingCallModalProps) => {
  const acceptCall = useAcceptCall();
  const rejectCall = useRejectCall();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone
  useEffect(() => {
    // Create a simple ringtone using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let intervalId: NodeJS.Timeout | null = null;

    const playTone = () => {
      oscillator = audioContext.createOscillator();
      gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      setTimeout(() => {
        oscillator?.stop();
      }, 500);
    };

    // Play ringtone pattern
    playTone();
    intervalId = setInterval(playTone, 1500);

    return () => {
      if (intervalId) clearInterval(intervalId);
      oscillator?.stop();
      audioContext.close();
    };
  }, []);

  const handleAccept = async () => {
    try {
      await acceptCall.mutateAsync(call.id);
      onAccept();
    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  };

  const handleReject = async () => {
    try {
      await rejectCall.mutateAsync(call.id);
      onReject();
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  };

  const isVideoCall = call.call_type === 'video';
  const callerName = call.initiator?.username || 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-8 shadow-2xl">
        {/* Caller info */}
        <div className="text-center">
          <div className="relative mx-auto mb-4 w-fit">
            <Avatar className="h-24 w-24 ring-4 ring-primary/20">
              <AvatarImage src={call.initiator?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                {callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {/* Animated ring */}
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          </div>

          <h2 className="text-2xl font-semibold">{callerName}</h2>
          <p className="mt-1 text-muted-foreground">
            {isVideoCall ? 'Video Call' : 'Voice Call'}
          </p>
          <p className="mt-2 animate-pulse text-sm text-muted-foreground">
            Incoming call...
          </p>
        </div>

        {/* Action buttons */}
        <div className="mt-8 flex items-center justify-center gap-6">
          {/* Reject */}
          <div className="text-center">
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full shadow-lg"
              onClick={handleReject}
              disabled={rejectCall.isPending}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">Decline</p>
          </div>

          {/* Accept */}
          <div className="text-center">
            <Button
              size="icon"
              className={cn(
                "h-16 w-16 rounded-full shadow-lg",
                "bg-green-600 hover:bg-green-700"
              )}
              onClick={handleAccept}
              disabled={acceptCall.isPending}
            >
              {isVideoCall ? (
                <Video className="h-7 w-7" />
              ) : (
                <Phone className="h-7 w-7" />
              )}
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">Accept</p>
          </div>
        </div>
      </div>
    </div>
  );
};
