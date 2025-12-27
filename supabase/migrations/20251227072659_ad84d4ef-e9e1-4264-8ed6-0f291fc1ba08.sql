-- First drop ALL insert policies on chats and chat_members to start fresh
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Chat creators can add members" ON public.chat_members;

-- Re-create simple permissive INSERT policies
CREATE POLICY "Authenticated users can create chats" 
ON public.chats 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Chat creators can add members" 
ON public.chat_members 
FOR INSERT 
TO authenticated
WITH CHECK (true);