import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/webm'],
  document: ['application/pdf'],
  other: ['application/octet-stream']
};

export const getFileCategory = (mimeType: string): string => {
  for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return category;
  }
  return 'other';
};

export const useFileUpload = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadMutation = useMutation({
    mutationFn: async ({
      chatId,
      file,
      content
    }: {
      chatId: string;
      file: File;
      content?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 50MB limit');
      }

      setUploadProgress(0);

      // Create unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `${chatId}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('chat-files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      setUploadProgress(50);

      // Determine message type
      const category = getFileCategory(file.type);
      const messageType = category === 'image' ? 'image' : 'file';

      // Create signed URL for the file
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('chat-files')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

      if (signedUrlError) throw signedUrlError;

      // Create message with file
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content: content || null,
          message_type: messageType,
          file_url: signedUrlData.signedUrl,
          file_name: file.name,
          file_size: file.size
        })
        .select()
        .single();

      if (messageError) throw messageError;

      setUploadProgress(75);

      // Store file metadata
      await supabase
        .from('file_metadata')
        .insert({
          chat_id: chatId,
          message_id: message.id,
          uploader_id: user.id,
          file_name: file.name,
          file_type: category,
          file_size: file.size,
          mime_type: file.type,
          storage_path: storagePath
        });

      // Update chat's updated_at
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      setUploadProgress(100);

      return message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setUploadProgress(0);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload file');
      setUploadProgress(0);
    }
  });

  return {
    uploadFile: uploadMutation.mutate,
    uploadFileAsync: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    uploadProgress
  };
};

export const useGetSignedUrl = () => {
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const { data, error } = await supabase.storage
        .from('chat-files')
        .createSignedUrl(storagePath, 60 * 60); // 1 hour

      if (error) throw error;
      return data.signedUrl;
    }
  });
};
