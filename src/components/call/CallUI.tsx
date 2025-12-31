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
  Radio
} from 'lucide-react';
import { toast } from 'sonner';

interface CallUIProps {
  call: Call;
  chatName: string;
  onCallEnd: () => void;
}

export const CallUI = ({ call, chatName, onCallEnd }: CallUIProps) => {
  const { user } = useAuth();
  const { data: participants = [] } = useCallParticipants(call.id);
  const endCall = useEndCall();
  const cancelCall = useCancelCall();
  const updateParticipant = useUpdateCallParticipant();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.call_type === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isEnding, setIsEnding] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const isHost = call.initiator_id === user?.id;
  const isRinging = call.status === 'ringing';
  const isVideoCall = call.call_type === 'video';

  // Use call timeout for ringing state
  useCallTimeout(isRinging && isHost ? call.id : null, 30000);

  // Initialize local media
  const {
    stream: localStream,
    initMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    switchCamera
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

  const { createOffer, closeAllConnections } = useWebRTC({
    callId: call.id,
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnected: handlePeerDisconnected
  });

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
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    toggleAudio(!newMuted);
    updateParticipant.mutate({ callId: call.id, isMuted: newMuted });
    toast.info(newMuted ? 'Microphone muted' : 'Microphone unmuted');
  };

  const handleToggleVideo = () => {
    const newVideoOff = !isVideoOff;
    setIsVideoOff(newVideoOff);
    toggleVideo(!newVideoOff);
    updateParticipant.mutate({ callId: call.id, isVideoOff: newVideoOff });
    toast.info(newVideoOff ? 'Camera off' : 'Camera on');
  };

  const handleSwitchCamera = async () => {
    await switchCamera();
    toast.info('Camera switched');
  };

  const handleEndCall = async () => {
    if (isEnding) return;
    setIsEnding(true);

    try {
      stopMedia();
      closeAllConnections();

      if (isRinging && isHost) {
        await cancelCall.mutateAsync(call.id);
      } else {
        await endCall.mutateAsync(call.id);
      }

      onCallEnd();
    } catch (error) {
      console.error('Failed to end call:', error);
      toast.error('Failed to end call');
      setIsEnding(false);
    }
  };

  const activeParticipants = participants.filter(p => p.joined_at && !p.left_at);

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-primary text-primary-foreground">
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
          <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
            {call.call_type === 'video' ? 'Video Call' : 'Voice Call'}
          </Badge>
        </div>

        {/* Video grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-muted/50 overflow-auto">
          {/* Local video */}
          <div className="relative rounded-lg bg-background overflow-hidden min-h-[200px] md:min-h-[300px]">
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
                <Avatar className="h-20 w-20 md:h-24 md:w-24">
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {user?.email?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <Badge variant="secondary" className="bg-background/80 backdrop-blur">
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
                  className="relative rounded-lg bg-background overflow-hidden min-h-[200px] md:min-h-[300px]"
                >
                  {isVideoCall && stream && !participant.is_video_off ? (
                    <RemoteVideo stream={stream} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Avatar className="h-20 w-20 md:h-24 md:w-24">
                        <AvatarImage src={participant.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                          {participant.profile?.username?.slice(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur">
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
            <div className="relative rounded-lg bg-muted overflow-hidden min-h-[200px] md:min-h-[300px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {isRinging ? 'Waiting for answer...' : 'Waiting for others to join...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Control bar */}
        <div className="p-4 bg-background border-t">
          <div className="flex items-center justify-center gap-3">
            {/* Video toggle */}
            {isVideoCall && (
              <>
                <Button
                  variant={isVideoOff ? 'destructive' : 'secondary'}
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg"
                  onClick={handleToggleVideo}
                  disabled={isEnding}
                >
                  {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </Button>

                <Button
                  variant="secondary"
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg"
                  onClick={handleSwitchCamera}
                  disabled={isEnding || isVideoOff}
                >
                  <SwitchCamera className="h-6 w-6" />
                </Button>
              </>
            )}

            {/* Mute toggle */}
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              className="h-14 w-14 rounded-full shadow-lg"
              onClick={handleToggleMute}
              disabled={isEnding}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            {/* End call */}
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full shadow-lg bg-red-600 hover:bg-red-700"
              onClick={handleEndCall}
              disabled={isEnding}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>

            {/* Participant count */}
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{activeParticipants.length}</span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-3">
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
