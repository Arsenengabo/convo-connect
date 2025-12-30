import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useActiveSession, 
  useSessionParticipants,
  useStartSession,
  useJoinSession,
  useLeaveSession,
  useEndSession,
  useUpdateParticipant,
  useWebRTCSignaling,
  LiveSession
} from '@/hooks/useLiveSession';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff,
  Users,
  Radio,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveSessionButtonProps {
  chatId: string;
  chatName: string;
}

export const LiveSessionButton = ({ chatId, chatName }: LiveSessionButtonProps) => {
  const { user } = useAuth();
  const { data: activeSession, isLoading } = useActiveSession(chatId);
  const startSession = useStartSession();
  const joinSession = useJoinSession();

  const handleStartVideo = () => {
    startSession.mutate({ chatId, sessionType: 'video' });
  };

  const handleStartAudio = () => {
    startSession.mutate({ chatId, sessionType: 'audio' });
  };

  const handleJoin = () => {
    if (activeSession) {
      joinSession.mutate(activeSession.id);
    }
  };

  // Show join button if there's an active session
  if (activeSession) {
    return (
      <Button
        variant="default"
        size="sm"
        onClick={handleJoin}
        className="bg-green-600 hover:bg-green-700 gap-2"
      >
        <Radio className="h-4 w-4 animate-pulse" />
        Join Live ({activeSession.participant_count || 0})
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Video className="h-4 w-4" />
          Go Live
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleStartVideo}>
          <Video className="mr-2 h-4 w-4" />
          Start Video Call
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleStartAudio}>
          <Phone className="mr-2 h-4 w-4" />
          Start Audio Call
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface LiveSessionDialogProps {
  session: LiveSession;
  chatName: string;
  onClose: () => void;
}

export const LiveSessionDialog = ({ session, chatName, onClose }: LiveSessionDialogProps) => {
  const { user } = useAuth();
  const { data: participants = [] } = useSessionParticipants(session.id);
  const leaveSession = useLeaveSession();
  const endSession = useEndSession();
  const updateParticipant = useUpdateParticipant();
  const { signals, sendSignal } = useWebRTCSignaling(session.id);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(session.session_type === 'audio');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const isHost = session.host_id === user?.id;
  const currentParticipant = participants.find(p => p.user_id === user?.id);

  // Initialize media stream
  useEffect(() => {
    let mounted = true;
    
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: session.session_type === 'video',
          audio: true
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        setLocalStream(stream);
      } catch (error) {
        console.error('Failed to access media devices:', error);
      }
    };

    initMedia();

    return () => {
      mounted = false;
    };
  }, [session.session_type]);

  // Update video element when stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
      updateParticipant.mutate({ sessionId: session.id, isMuted: !isMuted });
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
      updateParticipant.mutate({ sessionId: session.id, isVideoOff: !isVideoOff });
    }
  };

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    
    try {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      await leaveSession.mutateAsync(session.id);
      onClose();
    } catch (error) {
      console.error('Failed to leave session:', error);
      setIsLeaving(false);
    }
  };

  const handleEnd = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    
    try {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      await endSession.mutateAsync(session.id);
      onClose();
    } catch (error) {
      console.error('Failed to end session:', error);
      setIsLeaving(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    if (!open && !isLeaving) {
      handleLeave();
    }
  };

  return (
    <Dialog open onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500 animate-pulse" />
            {chatName} - Live {session.session_type === 'video' ? 'Video' : 'Audio'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 overflow-auto">
          {/* Local video */}
          <div className="relative rounded-lg bg-muted overflow-hidden">
            {session.session_type === 'video' && !isVideoOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="text-2xl">
                    {user?.email?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-2">
              <Badge variant="secondary">You</Badge>
              {isMuted && <MicOff className="h-4 w-4 text-destructive" />}
            </div>
          </div>

          {/* Remote participants */}
          {participants
            .filter(p => p.user_id !== user?.id)
            .map(participant => (
              <div 
                key={participant.id}
                className="relative rounded-lg bg-muted overflow-hidden"
              >
                <div className="w-full h-full flex items-center justify-center">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={participant.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="text-2xl">
                      {participant.profiles?.username?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="absolute bottom-2 left-2 flex items-center gap-2">
                  <Badge variant="secondary">
                    {participant.profiles?.username || 'Unknown'}
                  </Badge>
                  {participant.is_muted && <MicOff className="h-4 w-4 text-destructive" />}
                </div>
              </div>
            ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={toggleMute}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>

          {session.session_type === 'video' && (
            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={toggleVideo}
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </Button>
          )}

          <Button
            variant="destructive"
            size="icon"
            className="h-14 w-14 rounded-full"
            onClick={isHost ? handleEnd : handleLeave}
          >
            <PhoneOff className="h-6 w-6" />
          </Button>

          <div className="flex items-center gap-2 ml-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Live indicator badge for chat list
export const LiveIndicator = ({ chatId }: { chatId: string }) => {
  const { data: session } = useActiveSession(chatId);

  if (!session) return null;

  return (
    <Badge 
      variant="destructive" 
      className="animate-pulse text-xs gap-1"
    >
      <Radio className="h-3 w-3" />
      Live
    </Badge>
  );
};
