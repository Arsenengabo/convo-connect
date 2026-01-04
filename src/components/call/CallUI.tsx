import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Call,
  CallParticipant,
  useCallParticipants,
  useEndCall,
  useCancelCall,
  useUpdateCallParticipant,
  useCallTimeout
} from '@/hooks/useCalls';
import { useWebRTC, useLocalMedia } from '@/hooks/useWebRTC';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import { useMobileOptimizations } from '@/hooks/useMobileOptimizations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  SwitchCamera,
  Radio,
  Volume2,
  VolumeX,
  Loader2,
  ScreenShare,
  ScreenShareOff
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface CallUIProps {
  call: Call;
  chatName: string;
  onCallEnd: () => void;
}

export const CallUI = ({ call, chatName, onCallEnd }: CallUIProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: participants = [] } = useCallParticipants(call.id);
  const endCall = useEndCall();
  const cancelCall = useCancelCall();
  const updateParticipant = useUpdateCallParticipant();
  const { isMobile, triggerHaptic, orientation } = useMobileOptimizations();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.call_type === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isEnding, setIsEnding] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callStatus, setCallStatus] = useState(call.status);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const endingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHost = call.initiator_id === user?.id;
  const isRinging = callStatus === 'ringing';
  const isVideoCall = call.call_type === 'video';

  // Use call timeout for ringing state
  useCallTimeout(isRinging && isHost ? call.id : null, 30000);

  // Initialize local media
  const {
    stream: localStream,
    screenStream,
    isScreenSharing,
    initMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    switchCamera,
    startScreenShare,
    stopScreenShare
  } = useLocalMedia({
    video: isVideoCall,
    audio: true
  });

  // WebRTC hooks
  const handleRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams(prev => new Map(prev).set(peerId, stream));
  }, []);

  const handlePeerDisconnected = useCallback((peerId: string) => {
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const { createOffer, closeAllConnections, connectionStats } = useWebRTC({
    callId: call.id,
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnected: handlePeerDisconnected
  });

  // Play ringing tone for caller while waiting
  useEffect(() => {
    if (isRinging && isHost) {
      // Create oscillator-based ringing tone
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      
      let isPlaying = true;
      
      // Ring pattern: on-off-on-off
      const playRingPattern = () => {
        if (!isPlaying) return;
        
        oscillator.start();
        setTimeout(() => {
          if (isPlaying) {
            oscillator.stop();
          }
        }, 1000);
      };
      
      // Use interval for ring pattern
      const ringInterval = setInterval(() => {
        if (isPlaying && audioContext.state === 'running') {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.value = 440;
          osc.type = 'sine';
          gain.gain.value = 0.1;
          osc.start();
          setTimeout(() => osc.stop(), 400);
        }
      }, 2000);

      return () => {
        isPlaying = false;
        clearInterval(ringInterval);
        audioContext.close();
      };
    }
  }, [isRinging, isHost]);

  // Subscribe to call status changes for real-time sync
  useEffect(() => {
    const channel = supabase
      .channel(`call-status-${call.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${call.id}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          setCallStatus(newStatus);
          
          // Auto-close CallUI when call ends
          if (['ended', 'rejected', 'cancelled', 'missed'].includes(newStatus)) {
            stopMedia();
            closeAllConnections();
            
            if (newStatus === 'rejected') {
              toast.info('Call was declined');
            } else if (newStatus === 'cancelled') {
              toast.info('Call was cancelled');
            } else if (newStatus === 'missed') {
              toast.info('Call was not answered');
            }
            
            onCallEnd();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [call.id, onCallEnd, stopMedia, closeAllConnections]);

  // Initialize media on mount
  useEffect(() => {
    initMedia().catch(() => {
      toast.error('Failed to access camera/microphone');
    });

    return () => {
      stopMedia();
      closeAllConnections();
    };
  }, []);

  // Update local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Connect to other participants
  useEffect(() => {
    if (!localStream || isRinging) return;

    // Create offers to all other joined participants
    participants
      .filter(p => p.user_id !== user?.id && p.joined_at)
      .forEach(participant => {
        if (!remoteStreams.has(participant.user_id)) {
          createOffer(participant.user_id);
        }
      });
  }, [participants, localStream, user?.id, createOffer, remoteStreams, isRinging]);

  // Call duration timer
  useEffect(() => {
    if (isRinging) return;

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRinging]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    triggerHaptic('light');
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    toggleAudio(!newMuted);
    updateParticipant.mutate({ callId: call.id, isMuted: newMuted });
    toast.info(newMuted ? 'Microphone muted' : 'Microphone unmuted');
  };

  const handleToggleVideo = () => {
    triggerHaptic('light');
    const newVideoOff = !isVideoOff;
    setIsVideoOff(newVideoOff);
    toggleVideo(!newVideoOff);
    updateParticipant.mutate({ callId: call.id, isVideoOff: newVideoOff });
    toast.info(newVideoOff ? 'Camera off' : 'Camera on');
  };

  const handleSwitchCamera = async () => {
    triggerHaptic('light');
    await switchCamera();
    toast.info('Camera switched');
  };

  const handleToggleSpeaker = () => {
    triggerHaptic('light');
    setIsSpeakerOn(!isSpeakerOn);
    // Apply speaker setting to all audio elements
    document.querySelectorAll('video, audio').forEach((el) => {
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        // Use sinkId if available (Chrome)
        if ('setSinkId' in el) {
          const sinkId = isSpeakerOn ? '' : 'default';
          (el as any).setSinkId(sinkId).catch(() => {});
        }
      }
    });
    toast.info(isSpeakerOn ? 'Speaker off' : 'Speaker on');
  };

  const handleToggleScreenShare = async () => {
    triggerHaptic('light');
    if (isScreenSharing) {
      stopScreenShare();
      toast.info('Screen sharing stopped');
    } else {
      const stream = await startScreenShare();
      if (stream) {
        toast.success('Screen sharing started');
      }
    }
  };

  // Reset isEnding after timeout to prevent stuck state
  useEffect(() => {
    if (isEnding) {
      endingTimeoutRef.current = setTimeout(() => {
        setIsEnding(false);
      }, 5000);
    }
    return () => {
      if (endingTimeoutRef.current) {
        clearTimeout(endingTimeoutRef.current);
      }
    };
  }, [isEnding]);

  const handleEndCall = async () => {
    // If already ending for too long, force close
    if (isEnding) {
      onCallEnd();
      return;
    }
    
    triggerHaptic('heavy');
    setIsEnding(true);

    try {
      stopMedia();
      closeAllConnections();

      if (isRinging && isHost) {
        await cancelCall.mutateAsync(call.id);
      } else {
        await endCall.mutateAsync(call.id);
      }
    } catch (error) {
      console.error('Failed to end call:', error);
      toast.error('Failed to end call properly');
    } finally {
      // Always close the UI
      onCallEnd();
    }
  };

  const activeParticipants = participants.filter(p => p.joined_at && !p.left_at);

  // Calculate grid columns based on participant count and orientation
  const getGridCols = () => {
    const count = activeParticipants.length;
    if (isMobile && orientation === 'portrait') {
      return count <= 2 ? 'grid-cols-1' : 'grid-cols-2';
    }
    return count <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2';
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className={cn(
          "flex flex-col p-0 gap-0",
          isMobile 
            ? "w-full h-full max-w-full max-h-full rounded-none" 
            : "max-w-4xl h-[85vh]"
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 pt-safe bg-primary text-primary-foreground shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary-foreground/20">
              <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
                {chatName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{chatName}</h3>
              <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
                {isRinging ? (
                  <>
                    <Radio className="h-3 w-3 animate-pulse" />
                    <span>Calling...</span>
                  </>
                ) : (
                  <>
                    <span>{formatDuration(callDuration)}</span>
                    <span>•</span>
                    <span>{activeParticipants.length} participant{activeParticipants.length !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isRinging && (
              <ConnectionQualityIndicator
                quality={connectionStats.quality}
                roundTripTime={connectionStats.roundTripTime}
                className="text-primary-foreground"
              />
            )}
            <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
              {call.call_type === 'video' ? 'Video Call' : 'Voice Call'}
            </Badge>
          </div>
        </div>

        {/* Video grid */}
        <div className={cn(
          "flex-1 grid gap-2 p-2 bg-muted/50 overflow-auto",
          getGridCols()
        )}>
          {/* Screen share video (if sharing) */}
          {isScreenSharing && screenStream && (
            <div className="relative rounded-lg bg-background overflow-hidden min-h-[150px] md:min-h-[300px] col-span-full">
              <ScreenShareVideo stream={screenStream} />
              <div className="absolute bottom-2 left-2">
                <Badge variant="default" className="bg-primary text-primary-foreground text-xs">
                  <ScreenShare className="h-3 w-3 mr-1" />
                  Your Screen
                </Badge>
              </div>
            </div>
          )}

          {/* Local video */}
          <div className="relative rounded-lg bg-background overflow-hidden min-h-[150px] md:min-h-[300px]">
            {isVideoCall && !isVideoOff && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover mirror"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Avatar className="h-16 w-16 md:h-24 md:w-24">
                  <AvatarFallback className="text-xl md:text-2xl bg-primary text-primary-foreground">
                    {user?.email?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <Badge variant="secondary" className="bg-background/80 backdrop-blur text-xs">
                You {isHost && '(Host)'}
              </Badge>
              <div className="flex gap-1">
                {isMuted && (
                  <Badge variant="destructive" className="px-2">
                    <MicOff className="h-3 w-3" />
                  </Badge>
                )}
                {isVideoOff && isVideoCall && (
                  <Badge variant="destructive" className="px-2">
                    <VideoOff className="h-3 w-3" />
                  </Badge>
                )}
                {isScreenSharing && (
                  <Badge className="px-2 bg-primary">
                    <ScreenShare className="h-3 w-3" />
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Remote participants */}
          {activeParticipants
            .filter(p => p.user_id !== user?.id)
            .map(participant => {
              const stream = remoteStreams.get(participant.user_id);
              return (
                <div
                  key={participant.id}
                  className="relative rounded-lg bg-background overflow-hidden min-h-[150px] md:min-h-[300px]"
                >
                  {isVideoCall && stream && !participant.is_video_off ? (
                    <RemoteVideo stream={stream} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Avatar className="h-16 w-16 md:h-24 md:w-24">
                        <AvatarImage src={participant.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xl md:text-2xl bg-primary text-primary-foreground">
                          {participant.profile?.username?.slice(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur text-xs">
                      {participant.profile?.username || 'Unknown'}
                    </Badge>
                    <div className="flex gap-1">
                      {participant.is_muted && (
                        <Badge variant="destructive" className="px-2">
                          <MicOff className="h-3 w-3" />
                        </Badge>
                      )}
                      {participant.is_video_off && isVideoCall && (
                        <Badge variant="destructive" className="px-2">
                          <VideoOff className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

          {/* Waiting placeholder */}
          {activeParticipants.filter(p => p.user_id !== user?.id).length === 0 && (
            <div className="relative rounded-lg bg-muted overflow-hidden min-h-[150px] md:min-h-[300px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Users className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {isRinging ? 'Waiting for answer...' : 'Waiting for others to join...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Control bar */}
        <div className="p-3 md:p-4 pb-safe bg-background border-t shrink-0">
          <div className="flex items-center justify-center gap-2 md:gap-3">
            {/* Video toggle */}
            {isVideoCall && (
              <>
                <Button
                  variant={isVideoOff ? 'destructive' : 'secondary'}
                  size="icon"
                  className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg touch-feedback"
                  onClick={handleToggleVideo}
                  disabled={isEnding}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5 md:h-6 md:w-6" /> : <Video className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>

                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg touch-feedback"
                  onClick={handleSwitchCamera}
                  disabled={isEnding || isVideoOff}
                >
                  <SwitchCamera className="h-5 w-5 md:h-6 md:w-6" />
                </Button>
              </>
            )}

            {/* Mute toggle */}
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg touch-feedback"
              onClick={handleToggleMute}
              disabled={isEnding}
            >
              {isMuted ? <MicOff className="h-5 w-5 md:h-6 md:w-6" /> : <Mic className="h-5 w-5 md:h-6 md:w-6" />}
            </Button>

            {/* Speaker toggle */}
            <Button
              variant={isSpeakerOn ? 'secondary' : 'outline'}
              size="icon"
              className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg touch-feedback"
              onClick={handleToggleSpeaker}
              disabled={isEnding}
            >
              {isSpeakerOn ? <Volume2 className="h-5 w-5 md:h-6 md:w-6" /> : <VolumeX className="h-5 w-5 md:h-6 md:w-6" />}
            </Button>

            {/* Screen share toggle */}
            {isVideoCall && (
              <Button
                variant={isScreenSharing ? 'default' : 'secondary'}
                size="icon"
                className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg touch-feedback"
                onClick={handleToggleScreenShare}
                disabled={isEnding}
                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              >
                {isScreenSharing ? (
                  <ScreenShareOff className="h-5 w-5 md:h-6 md:w-6" />
                ) : (
                  <ScreenShare className="h-5 w-5 md:h-6 md:w-6" />
                )}
              </Button>
            )}

            {/* End call */}
            <Button
              variant="destructive"
              size="icon"
              className={cn(
                "h-14 w-14 md:h-16 md:w-16 rounded-full shadow-lg touch-feedback",
                isEnding 
                  ? "bg-destructive/70 cursor-wait" 
                  : "bg-destructive hover:bg-destructive/90"
              )}
              onClick={handleEndCall}
              aria-busy={isEnding}
            >
              {isEnding ? (
                <Loader2 className="h-6 w-6 md:h-7 md:w-7 animate-spin" />
              ) : (
                <PhoneOff className="h-6 w-6 md:h-7 md:w-7" />
              )}
            </Button>

            {/* Participant count */}
            <div className="flex items-center gap-2 px-3 py-2 md:px-4 bg-muted rounded-full">
              <Users className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              <span className="font-medium text-sm md:text-base">{activeParticipants.length}</span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-2 md:mt-3">
            {isHost
              ? 'Tap the red button to end the call for everyone'
              : 'Tap the red button to leave the call'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Remote video component
const RemoteVideo = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
};

// Screen share video component
const ScreenShareVideo = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-contain bg-black"
    />
  );
};
