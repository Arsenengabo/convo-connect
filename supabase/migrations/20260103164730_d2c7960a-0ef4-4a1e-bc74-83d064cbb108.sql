-- Add read_at column to call_participants for tracking missed call views
ALTER TABLE public.call_participants 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient call history queries
CREATE INDEX IF NOT EXISTS idx_calls_user_history ON calls(initiator_id, created_at DESC);

-- Add index for call participants by user
CREATE INDEX IF NOT EXISTS idx_call_participants_user ON call_participants(user_id, created_at DESC);