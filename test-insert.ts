import { supabase } from './supabaseClient';
supabase.auth.signInAnonymously().then(async ({data}) => {
  const res = await supabase.from('user_cards').insert({user_id: data.user?.id, card_id: 'some-id'});
  console.log(res);
}).catch(console.error);
