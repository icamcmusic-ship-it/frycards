import { supabase } from '../supabaseClient';
import { SUPABASE_ANON_KEY } from '../constants';

const BASE_URL = 'https://eqhuacksgeqywlvtyely.supabase.co/functions/v1';

export async function callEdge<T = any>(functionName: string, body: object = {}): Promise<T> {
  // Step 1: Get current session
  let { data: { session } } = await supabase.auth.getSession();

  // Step 2: If token is missing or expired (or expires within 60s), force a refresh
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = session?.expires_at ?? 0;
  if (!session || expiresAt - now < 60) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      session = refreshData.session;
    }
  }

  const jwt = session?.access_token;
  if (!jwt) throw new Error('Not authenticated – please log in again');

  try {
    const response = await fetch(`${BASE_URL}/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage =
        typeof data === 'object' && data.error
          ? data.error
          : typeof data === 'object' && data.message
          ? data.message
          : typeof data === 'string'
          ? data
          : 'Function call failed';
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error: any) {
    console.error(`Edge Function '${functionName}' failed:`, error);
    throw error;
  }
}