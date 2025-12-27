-- Fix RLS policies to use PERMISSIVE instead of RESTRICTIVE
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Chat creators can add members" ON public.chat_members;

-- Recreate as permissive policies
CREATE POLICY "Authenticated users can create chats" 
ON public.chats 
FOR INSERT 
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Chat creators can add members" 
ON public.chat_members 
FOR INSERT 
TO authenticated
WITH CHECK (
  (EXISTS (SELECT 1 FROM chats WHERE chats.id = chat_members.chat_id AND chats.created_by = auth.uid()))
  OR (user_id = auth.uid())
);