-- Create storage bucket for chat files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files', 
  'chat-files', 
  false,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm', 'application/octet-stream']
);

-- Storage policies for chat-files bucket
CREATE POLICY "Chat members can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-files' AND
  (storage.foldername(name))[1] IN (
    SELECT chat_id::text FROM public.chat_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Chat members can view files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-files' AND
  (storage.foldername(name))[1] IN (
    SELECT chat_id::text FROM public.chat_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Chat members can delete their files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-files' AND
  (storage.foldername(name))[1] IN (
    SELECT chat_id::text FROM public.chat_members WHERE user_id = auth.uid()
  )
);

-- File metadata table for better file management
CREATE TABLE public.file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  uploader_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on file_metadata
ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

-- File metadata RLS policies
CREATE POLICY "Chat members can view file metadata"
ON public.file_metadata FOR SELECT
TO authenticated
USING (is_chat_member(auth.uid(), chat_id));

CREATE POLICY "Chat members can insert file metadata"
ON public.file_metadata FOR INSERT
TO authenticated
WITH CHECK (
  uploader_id = auth.uid() AND
  is_chat_member(auth.uid(), chat_id)
);

CREATE POLICY "Uploaders can delete file metadata"
ON public.file_metadata FOR DELETE
TO authenticated
USING (uploader_id = auth.uid());

-- Live sessions table
CREATE TABLE public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  host_id UUID NOT NULL,
  title TEXT,
  session_type TEXT NOT NULL DEFAULT 'video' CHECK (session_type IN ('video', 'audio')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Live participants table
CREATE TABLE public.live_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,
  UNIQUE(session_id, user_id)
);

-- Enable RLS on live tables
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_participants ENABLE ROW LEVEL SECURITY;

-- Live sessions RLS policies
CREATE POLICY "Chat members can view live sessions"
ON public.live_sessions FOR SELECT
TO authenticated
USING (is_chat_member(auth.uid(), chat_id));

CREATE POLICY "Chat members can start live sessions"
ON public.live_sessions FOR INSERT
TO authenticated
WITH CHECK (
  host_id = auth.uid() AND
  is_chat_member(auth.uid(), chat_id)
);

CREATE POLICY "Host can update live session"
ON public.live_sessions FOR UPDATE
TO authenticated
USING (host_id = auth.uid())
WITH CHECK (host_id = auth.uid());

CREATE POLICY "Host can delete live session"
ON public.live_sessions FOR DELETE
TO authenticated
USING (host_id = auth.uid());

-- Live participants RLS policies
CREATE POLICY "Session members can view participants"
ON public.live_participants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = session_id
    AND is_chat_member(auth.uid(), ls.chat_id)
  )
);

CREATE POLICY "Chat members can join sessions"
ON public.live_participants FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = session_id
    AND ls.status = 'active'
    AND is_chat_member(auth.uid(), ls.chat_id)
  )
);

CREATE POLICY "Users can update own participation"
ON public.live_participants FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave sessions"
ON public.live_participants FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create signaling table for WebRTC
CREATE TABLE public.webrtc_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  signal_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webrtc_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can send signals"
ON public.webrtc_signals FOR INSERT
TO authenticated
WITH CHECK (
  from_user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.live_participants lp
    WHERE lp.session_id = webrtc_signals.session_id
    AND lp.user_id = auth.uid()
    AND lp.left_at IS NULL
  )
);

CREATE POLICY "Users can view signals sent to them"
ON public.webrtc_signals FOR SELECT
TO authenticated
USING (to_user_id = auth.uid());

CREATE POLICY "Users can delete their signals"
ON public.webrtc_signals FOR DELETE
TO authenticated
USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Enable realtime for live features
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signals;

-- Create indexes for performance
CREATE INDEX idx_file_metadata_chat_id ON public.file_metadata(chat_id);
CREATE INDEX idx_file_metadata_message_id ON public.file_metadata(message_id);
CREATE INDEX idx_live_sessions_chat_id ON public.live_sessions(chat_id);
CREATE INDEX idx_live_sessions_status ON public.live_sessions(status);
CREATE INDEX idx_live_participants_session_id ON public.live_participants(session_id);
CREATE INDEX idx_webrtc_signals_session_id ON public.webrtc_signals(session_id);
CREATE INDEX idx_webrtc_signals_to_user ON public.webrtc_signals(to_user_id);