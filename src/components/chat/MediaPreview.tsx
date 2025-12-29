import { Message } from '@/hooks/useChats';
import { getFileCategory } from '@/hooks/useFileUpload';
import { Button } from '@/components/ui/button';
import { Download, Play, Pause, FileText, File } from 'lucide-react';
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MediaPreviewProps {
  message: Message;
  isOwn: boolean;
}

export const MediaPreview = ({ message, isOwn }: MediaPreviewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fileUrl = message.file_url || '';
  const fileName = message.file_name || 'File';
  const fileSize = message.file_size || 0;
  
  // Determine file category from message type and filename
  const getCategory = () => {
    if (message.message_type === 'image') return 'image';
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'document';
    if (['mp4', 'webm', 'mov'].includes(ext || '')) return 'video';
    if (['mp3', 'wav', 'webm', 'ogg'].includes(ext || '')) return 'audio';
    return 'other';
  };

  const category = getCategory();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Image preview
  if (category === 'image') {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-lg">
          {!isLoaded && (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
          <img
            src={fileUrl}
            alt={fileName}
            className={cn(
              "max-w-[280px] max-h-[300px] rounded-lg object-cover cursor-pointer transition-opacity",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setIsLoaded(true)}
            onClick={() => window.open(fileUrl, '_blank')}
          />
        </div>
        {message.content && (
          <p className="text-sm">{message.content}</p>
        )}
      </div>
    );
  }

  // Video preview
  if (category === 'video') {
    return (
      <div className="space-y-2">
        <video
          ref={videoRef}
          src={fileUrl}
          controls
          className="max-w-[280px] max-h-[200px] rounded-lg"
          preload="metadata"
        />
        {message.content && (
          <p className="text-sm">{message.content}</p>
        )}
      </div>
    );
  }

  // Audio preview
  if (category === 'audio') {
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-3 rounded-lg p-3",
          isOwn ? "bg-primary-foreground/10" : "bg-accent"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={toggleAudio}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(fileSize)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
        <audio
          ref={audioRef}
          src={fileUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        {message.content && (
          <p className="text-sm">{message.content}</p>
        )}
      </div>
    );
  }

  // PDF preview
  if (category === 'document') {
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-3 rounded-lg p-3",
          isOwn ? "bg-primary-foreground/10" : "bg-accent"
        )}>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
            <FileText className="h-6 w-6 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              PDF • {formatFileSize(fileSize)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.open(fileUrl, '_blank')}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {message.content && (
          <p className="text-sm">{message.content}</p>
        )}
      </div>
    );
  }

  // Generic file
  return (
    <div className="space-y-2">
      <div className={cn(
        "flex items-center gap-3 rounded-lg p-3",
        isOwn ? "bg-primary-foreground/10" : "bg-accent"
      )}>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <File className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(fileSize)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
      {message.content && (
        <p className="text-sm">{message.content}</p>
      )}
    </div>
  );
};
