import { supabase } from './supabaseClient';
supabase.auth.signInAnonymously().then(async ({data}) => {
  const { data: cards } = await supabase.from('cards').select('id').limit(1);
  const res = await supabase.from('user_cards').insert({user_id: data.user?.id, card_id: cards[0].id});
  console.log(res);
}).catch(console.error);
