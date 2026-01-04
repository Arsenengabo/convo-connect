import { useRef, useCallback, useEffect, useState } from 'react';
import { useCallSignaling, CallSignal } from './useCalls';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

interface ConnectionStats {
  quality: ConnectionQuality;
  roundTripTime: number | null;
  packetsLost: number;
  jitter: number | null;
}

interface UseWebRTCOptions {
  callId: string | null;
  localStream: MediaStream | null;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerDisconnected: (peerId: string) => void;
}

export const useWebRTC = ({
  callId,
  localStream,
  onRemoteStream,
  onPeerDisconnected
}: UseWebRTCOptions) => {
  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const { signals, sendSignal, consumeSignal } = useCallSignaling(callId);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats>({
    quality: 'good',
    roundTripTime: null,
    packetsLost: 0,
    jitter: null
  });

  // Monitor connection quality
  useEffect(() => {
    const interval = setInterval(async () => {
      const connections = Array.from(peerConnections.current.values());
      if (connections.length === 0) return;

      let totalRtt = 0;
      let totalPacketsLost = 0;
      let totalJitter = 0;
      let statCount = 0;

      for (const { connection } of connections) {
        try {
          const stats = await connection.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime) {
                totalRtt += report.currentRoundTripTime * 1000;
                statCount++;
              }
            }
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              totalPacketsLost += report.packetsLost || 0;
              if (report.jitter) {
                totalJitter += report.jitter * 1000;
              }
            }
          });
        } catch (e) {
          // Stats unavailable
        }
      }

      const avgRtt = statCount > 0 ? totalRtt / statCount : null;
      const avgJitter = statCount > 0 ? totalJitter / statCount : null;

      // Determine quality based on RTT and packet loss
      let quality: ConnectionQuality = 'excellent';
      if (avgRtt === null) {
        quality = connections.length > 0 ? 'good' : 'disconnected';
      } else if (avgRtt > 400 || totalPacketsLost > 50) {
        quality = 'poor';
      } else if (avgRtt > 200 || totalPacketsLost > 20) {
        quality = 'fair';
      } else if (avgRtt > 100 || totalPacketsLost > 5) {
        quality = 'good';
      }

      setConnectionStats({
        quality,
        roundTripTime: avgRtt,
        packetsLost: totalPacketsLost,
        jitter: avgJitter
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const existingPeer = peerConnections.current.get(peerId);
    if (existingPeer) {
      return existingPeer.connection;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, 'ice-candidate', event.candidate.toJSON());
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        const peer = peerConnections.current.get(peerId);
        if (peer) {
          peer.stream = remoteStream;
        }
        onRemoteStream(peerId, remoteStream);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onPeerDisconnected(peerId);
        peerConnections.current.delete(peerId);
      }
    };

    peerConnections.current.set(peerId, { peerId, connection: pc });
    return pc;
  }, [localStream, sendSignal, onRemoteStream, onPeerDisconnected]);

  // Create offer for a peer
  const createOffer = useCallback(async (peerId: string) => {
    setIsConnecting(true);
    try {
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, 'offer', offer);
    } catch (error) {
      console.error('Error creating offer:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [createPeerConnection, sendSignal]);

  // Handle incoming signals
  useEffect(() => {
    const processSignals = async () => {
      for (const signal of signals) {
        await handleSignal(signal);
        consumeSignal(signal.id);
      }
    };

    const handleSignal = async (signal: CallSignal) => {
      const pc = createPeerConnection(signal.sender_id);

      try {
        switch (signal.signal_type) {
          case 'offer':
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(signal.sender_id, 'answer', answer);
            break;

          case 'answer':
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            break;

          case 'ice-candidate':
            if (signal.payload) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
            }
            break;
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    };

    if (signals.length > 0) {
      processSignals();
    }
  }, [signals, createPeerConnection, sendSignal, consumeSignal]);

  // Update tracks when local stream changes
  useEffect(() => {
    if (!localStream) return;

    peerConnections.current.forEach(({ connection }) => {
      const senders = connection.getSenders();
      localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track);
        } else {
          connection.addTrack(track, localStream);
        }
      });
    });
  }, [localStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      peerConnections.current.forEach(({ connection }) => {
        connection.close();
      });
      peerConnections.current.clear();
    };
  }, []);

  const closePeerConnection = useCallback((peerId: string) => {
    const peer = peerConnections.current.get(peerId);
    if (peer) {
      peer.connection.close();
      peerConnections.current.delete(peerId);
    }
  }, []);

  const closeAllConnections = useCallback(() => {
    peerConnections.current.forEach(({ connection }) => {
      connection.close();
    });
    peerConnections.current.clear();
  }, []);

  const getPeerStream = useCallback((peerId: string): MediaStream | undefined => {
    return peerConnections.current.get(peerId)?.stream;
  }, []);

  return {
    createOffer,
    closePeerConnection,
    closeAllConnections,
    getPeerStream,
    isConnecting,
    peerCount: peerConnections.current.size,
    connectionStats
  };
};

// Hook for managing local media stream
export const useLocalMedia = (options: {
  video: boolean;
  audio: boolean;
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const initMedia = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: options.video,
        audio: options.audio
      });
      setStream(mediaStream);
      return mediaStream;
    } catch (err: any) {
      const errorMessage = err.name === 'NotAllowedError'
        ? 'Camera/microphone access denied'
        : 'Failed to access media devices';
      setError(errorMessage);
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, [options.video, options.audio]);

  const stopMedia = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [stream]);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [stream]);

  const switchCamera = useCallback(async () => {
    if (!stream || !options.video) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    if (videoDevices.length < 2) return;

    const currentDeviceId = videoTrack.getSettings().deviceId;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextDevice.deviceId } },
      audio: false
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    stream.removeTrack(videoTrack);
    stream.addTrack(newVideoTrack);
    videoTrack.stop();

    setStream(stream);
  }, [stream, options.video]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return {
    stream,
    error,
    isInitializing,
    initMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    switchCamera
  };
};
