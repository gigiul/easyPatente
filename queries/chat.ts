import { supabase } from '@/lib/supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function loadChatMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getRemainingRequests(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('request_count, last_request_at')
    .eq('id', userId)
    .single();

  if (!data) return 5;

  const now = new Date();
  const lastRequest = data.last_request_at ? new Date(data.last_request_at) : null;

  let count = data.request_count || 0;
  if (lastRequest && lastRequest.toDateString() !== now.toDateString()) {
    count = 0;
  }

  return 5 - count;
}
