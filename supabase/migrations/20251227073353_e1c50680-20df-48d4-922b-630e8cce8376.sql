-- Completely remove and recreate ALL RLS policies for chats table
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Chat creators can update chats" ON public.chats;
DROP POLICY IF EXISTS "Users can view chats they are members of" ON public.chats;

-- Disable and re-enable RLS to clear any cached policies
ALTER TABLE public.chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Create fresh policies with explicit TRUE checks
CREATE POLICY "Anyone authenticated can create chats" 
ON public.chats 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Members can view their chats" 
ON public.chats 
FOR SELECT 
TO authenticated
USING (is_chat_member(auth.uid(), id) OR created_by = auth.uid());

CREATE POLICY "Creators can update their chats" 
ON public.chats 
FOR UPDATE 
TO authenticated
USING (created_by = auth.uid() OR is_chat_member(auth.uid(), id))
WITH CHECK (created_by = auth.uid() OR is_chat_member(auth.uid(), id));

-- Also fix chat_members policies
DROP POLICY IF EXISTS "Chat creators can add members" ON public.chat_members;
DROP POLICY IF EXISTS "Users can view members of their chats" ON public.chat_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON public.chat_members;
DROP POLICY IF EXISTS "Users can leave chats" ON public.chat_members;

ALTER TABLE public.chat_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can add members" 
ON public.chat_members 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Members can view chat members" 
ON public.chat_members 
FOR SELECT 
TO authenticated
USING (is_chat_member(auth.uid(), chat_id) OR user_id = auth.uid());

CREATE POLICY "Users can update own membership" 
ON public.chat_members 
FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave chats" 
ON public.chat_members 
FOR DELETE 
TO authenticated
USING (user_id = auth.uid());