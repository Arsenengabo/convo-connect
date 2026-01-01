import { useEffect, useRef } from 'react';
import { Call, useAcceptCall, useRejectCall } from '@/hooks/useCalls';
import { useMobileOptimizations, useSwipeGesture } from '@/hooks/useMobileOptimizations';
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
  const { triggerHaptic, isMobile } = useMobileOptimizations();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone and trigger haptic feedback
  useEffect(() => {
    // Trigger haptic pattern for incoming call
    if ('vibrate' in navigator) {
      // Vibrate pattern: vibrate, pause, vibrate, pause...
      const vibratePattern = () => {
        navigator.vibrate([300, 200, 300, 200]);
      };
      vibratePattern();
      const intervalId = setInterval(vibratePattern, 2000);
      
      return () => {
        clearInterval(intervalId);
        navigator.vibrate(0); // Stop vibration
      };
    }
  }, []);

  // Play ringtone using Web Audio API
  useEffect(() => {
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
    triggerHaptic('medium');
    try {
      await acceptCall.mutateAsync(call.id);
      onAccept();
    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  };

  const handleReject = async () => {
    triggerHaptic('heavy');
    try {
      await rejectCall.mutateAsync(call.id);
      onReject();
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  };

  // Swipe gestures for mobile
  const swipeHandlers = useSwipeGesture({
    onSwipeUp: handleAccept,
    onSwipeDown: handleReject,
  }, 60);

  const isVideoCall = call.call_type === 'video';
  const callerName = call.initiator?.username || 'Unknown';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-safe"
      {...(isMobile ? swipeHandlers : {})}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 md:p-8 shadow-2xl">
        {/* Caller info */}
        <div className="text-center">
          <div className="relative mx-auto mb-4 w-fit">
            <Avatar className="h-20 w-20 md:h-24 md:w-24 ring-4 ring-primary/20">
              <AvatarImage src={call.initiator?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl md:text-3xl">
                {callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {/* Animated ring */}
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          </div>

          <h2 className="text-xl md:text-2xl font-semibold">{callerName}</h2>
          <p className="mt-1 text-muted-foreground">
            {isVideoCall ? 'Video Call' : 'Voice Call'}
          </p>
          <p className="mt-2 animate-pulse text-sm text-muted-foreground">
            Incoming call...
          </p>
          
          {/* Swipe hint for mobile */}
          {isMobile && (
            <p className="mt-4 text-xs text-muted-foreground">
              Swipe up to accept • Swipe down to decline
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-6 md:mt-8 flex items-center justify-center gap-8 md:gap-6">
          {/* Reject */}
          <div className="text-center">
            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 md:h-16 md:w-16 rounded-full shadow-lg touch-feedback"
              onClick={handleReject}
              disabled={rejectCall.isPending}
            >
              <PhoneOff className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">Decline</p>
          </div>

          {/* Accept */}
          <div className="text-center">
            <Button
              size="icon"
              className={cn(
                "h-14 w-14 md:h-16 md:w-16 rounded-full shadow-lg touch-feedback",
                "bg-green-600 hover:bg-green-700"
              )}
              onClick={handleAccept}
              disabled={acceptCall.isPending}
            >
              {isVideoCall ? (
                <Video className="h-6 w-6 md:h-7 md:w-7" />
              ) : (
                <Phone className="h-6 w-6 md:h-7 md:w-7" />
              )}
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">Accept</p>
          </div>
        </div>
      </div>
    </div>
  );
};
