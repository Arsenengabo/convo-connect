import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Paperclip, X, Image, FileText, Film, Music, File } from 'lucide-react';
import { useFileUpload, getFileCategory } from '@/hooks/useFileUpload';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FileUploadButtonProps {
  chatId: string;
  onUploadComplete?: () => void;
}

export const FileUploadButton = ({ chatId, onUploadComplete }: FileUploadButtonProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, uploadProgress } = useFileUpload();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    setIsOpen(true);
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    uploadFile(
      { chatId, file: selectedFile },
      {
        onSuccess: () => {
          resetState();
          onUploadComplete?.();
        }
      }
    );
  };

  const resetState = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setIsOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return <File className="h-8 w-8" />;

    const category = getFileCategory(selectedFile.type);
    switch (category) {
      case 'image':
        return <Image className="h-8 w-8 text-primary" />;
      case 'video':
        return <Film className="h-8 w-8 text-primary" />;
      case 'audio':
        return <Music className="h-8 w-8 text-primary" />;
      case 'document':
        return <FileText className="h-8 w-8 text-primary" />;
      default:
        return <File className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*,.pdf,application/pdf"
      />

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          {selectedFile && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h4 className="font-medium">Upload File</h4>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetState}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                    {getFileIcon()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>

              {/* Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-center text-xs text-muted-foreground">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={resetState}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  Send
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
};
