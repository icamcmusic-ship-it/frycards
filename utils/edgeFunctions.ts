import { supabase } from '../supabaseClient';
import { SUPABASE_ANON_KEY } from '../constants';

const BASE_URL = 'https://eqhuacksgeqywlvtyely.supabase.co/functions/v1';

export async function callEdge<T = any>(functionName: string, body: object = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  
  if (!jwt) throw new Error('Not authenticated - No JWT found');

  try {
    const response = await fetch(`${BASE_URL}/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = typeof data === 'object' && data.error 
        ? data.error 
        : (typeof data === 'object' && data.message)
        ? data.message
        : (typeof data === 'string' ? data : 'Function call failed');
      
      throw new Error(errorMessage);
    }
    
    return data as T;
  } catch (error: any) {
    console.error(`Edge Function '${functionName}' failed:`, error);
    throw error;
  }
}