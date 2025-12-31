-- Create call type enum
CREATE TYPE public.call_type AS ENUM ('voice', 'video', 'live');

-- Create call status enum  
CREATE TYPE public.call_status AS ENUM ('initiated', 'ringing', 'accepted', 'rejected', 'in_progress', 'ended', 'cancelled', 'missed');

-- Create call participant role enum
CREATE TYPE public.call_participant_role AS ENUM ('host', 'participant');

-- Create calls table
CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  call_type public.call_type NOT NULL DEFAULT 'voice',
  status public.call_status NOT NULL DEFAULT 'initiated',
  initiator_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call_participants table
CREATE TABLE public.call_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.call_participant_role NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call_signals table for WebRTC signaling
CREATE TABLE public.call_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_calls_chat_id ON public.calls(chat_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_initiator_id ON public.calls(initiator_id);
CREATE INDEX idx_call_participants_call_id ON public.call_participants(call_id);
CREATE INDEX idx_call_participants_user_id ON public.call_participants(user_id);
CREATE INDEX idx_call_signals_call_id ON public.call_signals(call_id);
CREATE INDEX idx_call_signals_receiver_id ON public.call_signals(receiver_id);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

-- RLS policies for calls table
CREATE POLICY "Chat members can view calls" 
ON public.calls 
FOR SELECT 
USING (is_chat_member(auth.uid(), chat_id));

CREATE POLICY "Chat members can initiate calls" 
ON public.calls 
FOR INSERT 
WITH CHECK ((initiator_id = auth.uid()) AND is_chat_member(auth.uid(), chat_id));

CREATE POLICY "Call participants can update call status" 
ON public.calls 
FOR UPDATE 
USING (
  initiator_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.call_participants 
    WHERE call_id = calls.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Call initiator can delete call" 
ON public.calls 
FOR DELETE 
USING (initiator_id = auth.uid());

-- RLS policies for call_participants table
CREATE POLICY "Chat members can view call participants" 
ON public.call_participants 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.calls c 
    WHERE c.id = call_participants.call_id AND is_chat_member(auth.uid(), c.chat_id)
  )
);

CREATE POLICY "Users can join calls in their chats" 
ON public.call_participants 
FOR INSERT 
WITH CHECK (
  (user_id = auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.calls c 
    WHERE c.id = call_participants.call_id AND is_chat_member(auth.uid(), c.chat_id)
  )
);

CREATE POLICY "Users can update own participation" 
ON public.call_participants 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can leave calls" 
ON public.call_participants 
FOR DELETE 
USING (user_id = auth.uid());

-- RLS policies for call_signals table
CREATE POLICY "Users can view signals sent to them" 
ON public.call_signals 
FOR SELECT 
USING (receiver_id = auth.uid());

CREATE POLICY "Call participants can send signals" 
ON public.call_signals 
FOR INSERT 
WITH CHECK (
  (sender_id = auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.call_participants 
    WHERE call_id = call_signals.call_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their signals" 
ON public.call_signals 
FOR DELETE 
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_calls_updated_at
BEFORE UPDATE ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for calls and participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;