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
  ChevronDown,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LiveSessionButtonProps {
  chatId: string;
  chatName: string;
}

export const LiveSessionButton = ({ chatId, chatName }: LiveSessionButtonProps) => {
  const { user } = useAuth();
  const { data: activeSession, isLoading } = useActiveSession(chatId);
  const startSession = useStartSession();
  const joinSession = useJoinSession();
  const [showDialog, setShowDialog] = useState(false);
  const [sessionToShow, setSessionToShow] = useState<LiveSession | null>(null);

  const handleStartVideo = async () => {
    try {
      const session = await startSession.mutateAsync({ chatId, sessionType: 'video' });
      setSessionToShow({
        ...session,
        session_type: session.session_type as 'video' | 'audio',
        status: session.status as 'active' | 'ended',
        participant_count: 1
      });
      setShowDialog(true);
    } catch (error) {
      console.error('Failed to start video session:', error);
    }
  };

  const handleStartAudio = async () => {
    try {
      const session = await startSession.mutateAsync({ chatId, sessionType: 'audio' });
      setSessionToShow({
        ...session,
        session_type: session.session_type as 'video' | 'audio',
        status: session.status as 'active' | 'ended',
        participant_count: 1
      });
      setShowDialog(true);
    } catch (error) {
      console.error('Failed to start audio session:', error);
    }
  };

  const handleJoin = async () => {
    if (activeSession) {
      try {
        await joinSession.mutateAsync(activeSession.id);
        setSessionToShow(activeSession);
        setShowDialog(true);
      } catch (error) {
        console.error('Failed to join session:', error);
      }
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSessionToShow(null);
  };

  return (
    <>
      {/* Show join button if there's an active session */}
      {activeSession ? (
        <Button
          variant="default"
          size="sm"
          onClick={handleJoin}
          className="bg-green-600 hover:bg-green-700 gap-2"
        >
          <Radio className="h-4 w-4 animate-pulse" />
          Join Live ({activeSession.participant_count || 0})
        </Button>
      ) : (
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
      )}

      {/* Live Session Dialog */}
      {showDialog && sessionToShow && (
        <LiveSessionDialog
          session={sessionToShow}
          chatName={chatName}
          onClose={handleCloseDialog}
        />
      )}
    </>
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
  const [callDuration, setCallDuration] = useState(0);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const isHost = session.host_id === user?.id;
  const currentParticipant = participants.find(p => p.user_id === user?.id);

  // Call duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        toast.success('Camera and microphone connected');
      } catch (error) {
        console.error('Failed to access media devices:', error);
        toast.error('Failed to access camera/microphone. Please check permissions.');
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
      toast.info(isMuted ? 'Microphone unmuted' : 'Microphone muted');
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
      updateParticipant.mutate({ sessionId: session.id, isVideoOff: !isVideoOff });
      toast.info(isVideoOff ? 'Camera on' : 'Camera off');
    }
  };

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    
    try {
      // Stop all media tracks first
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
        });
        setLocalStream(null);
      }
      
      await leaveSession.mutateAsync(session.id);
      toast.info('Left the call');
      onClose();
    } catch (error) {
      console.error('Failed to leave session:', error);
      toast.error('Failed to leave session');
      setIsLeaving(false);
    }
  };

  const handleEnd = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    
    try {
      // Stop all media tracks first
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
        });
        setLocalStream(null);
      }
      
      await endSession.mutateAsync(session.id);
      onClose();
    } catch (error) {
      console.error('Failed to end session:', error);
      toast.error('Failed to end session');
      setIsLeaving(false);
    }
  };

  // Prevent closing dialog by clicking outside - must use buttons
  const handleDialogChange = (open: boolean) => {
    // Only allow closing via the leave/end buttons
    if (!open && !isLeaving) {
      // Don't auto-close, user must click leave button
      return;
    }
  };

  return (
    <Dialog open onOpenChange={handleDialogChange}>
      <DialogContent 
        className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* WhatsApp-style header */}
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
                <Radio className="h-3 w-3 animate-pulse" />
                <span>{formatDuration(callDuration)}</span>
                <span>•</span>
                <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Video grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-muted/50 overflow-auto">
          {/* Local video */}
          <div className="relative rounded-lg bg-background overflow-hidden min-h-[200px] md:min-h-[300px]">
            {session.session_type === 'video' && !isVideoOff && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
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
                {isVideoOff && session.session_type === 'video' && (
                  <Badge variant="destructive" className="px-2">
                    <VideoOff className="h-3 w-3" />
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Remote participants */}
          {participants
            .filter(p => p.user_id !== user?.id)
            .map(participant => (
              <div 
                key={participant.id}
                className="relative rounded-lg bg-background overflow-hidden min-h-[200px] md:min-h-[300px]"
              >
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Avatar className="h-20 w-20 md:h-24 md:w-24">
                    <AvatarImage src={participant.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                      {participant.profiles?.username?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur">
                    {participant.profiles?.username || 'Unknown'}
                  </Badge>
                  <div className="flex gap-1">
                    {participant.is_muted && (
                      <Badge variant="destructive" className="px-2">
                        <MicOff className="h-3 w-3" />
                      </Badge>
                    )}
                    {participant.is_video_off && session.session_type === 'video' && (
                      <Badge variant="destructive" className="px-2">
                        <VideoOff className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {/* Empty slots placeholder */}
          {participants.filter(p => p.user_id !== user?.id).length === 0 && (
            <div className="relative rounded-lg bg-muted overflow-hidden min-h-[200px] md:min-h-[300px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for others to join...</p>
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp-style control bar */}
        <div className="p-4 bg-background border-t">
          <div className="flex items-center justify-center gap-3">
            {/* Video toggle - only for video calls */}
            {session.session_type === 'video' && (
              <Button
                variant={isVideoOff ? 'destructive' : 'secondary'}
                size="icon"
                className="h-14 w-14 rounded-full shadow-lg"
                onClick={toggleVideo}
                disabled={isLeaving}
              >
                {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            )}

            {/* Mute toggle */}
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              className="h-14 w-14 rounded-full shadow-lg"
              onClick={toggleMute}
              disabled={isLeaving}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            {/* End/Leave call button - RED and prominent */}
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full shadow-lg bg-red-600 hover:bg-red-700"
              onClick={isHost ? handleEnd : handleLeave}
              disabled={isLeaving}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>

            {/* Participant count */}
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{participants.length}</span>
            </div>
          </div>
          
          {/* Helper text */}
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
