/**
 * CPU buyer dialogue bank. Lazy-loaded by the Shop Floor; never in the eager
 * bundle. The server sends persona_id + seed + event codes only, and
 * `pickLine` turns those into the same line on every reload.
 *
 * Each moment is one string with alternatives split on " | ".
 * Placeholders: {item} (what they want), {offer} (credits), {colour}.
 */

export const MOMENTS = [
  'greet',
  'return',
  'browse',
  'offer',
  'bundle',
  'trade',
  'accept_counter',
  'meet_middle',
  'insulted',
  'threat',
  'final_offer',
  'thanks',
  'walkout',
  'declined',
  'foil',
  'variant',
  'slab',
  'pristine',
  'rarity',
] as const;
export type Moment = (typeof MOMENTS)[number];

type Bank = Record<Moment, string>;

const ARCHETYPES: Record<string, Bank> = {
  tightfist: {
    greet:
      "Afternoon. I'm only looking. Probably. | Don't mind me, I've got a budget and a magnifying glass.",
    return:
      "Back again. Your prices were almost reasonable last time. | I remembered your shop. That's a compliment, from me.",
    browse:
      "Mm. Corners. Let's talk about these corners. | I've seen this cheaper. Twice. In dreams, but still.",
    offer: "{offer}. And I'm being generous. | I'll go {offer}, and I'm wincing as I say it.",
    bundle:
      "Two for {offer}. Bulk is a love language. | I'll take both if you round down like a friend.",
    trade:
      'A swap. No credits leave my wallet — the best kind of deal. | My card for yours. My wallet stays asleep.',
    accept_counter:
      'Fine. FINE. Wrap it before I change my mind. | You drive a hard bargain. Deal.',
    meet_middle:
      "Let's split the difference. {offer}, and I'm suffering. | {offer}. That's me meeting you halfway, uphill.",
    insulted: "Ha! Do I look like I'm made of credits? | That number made my wallet flinch.",
    threat: "Keep going like that and I'm walking. | My coat is on. One more push and so am I.",
    final_offer:
      '{offer}. Final. My accountant is my cat and she says no more. | {offer}, last word. Take it or I take my coins.',
    thanks: "A fair trade. Don't tell anyone I said fair. | Pleasure. Mostly mine.",
    walkout:
      "Good day. I'll find it cheaper elsewhere. | Nope. My wallet and I are leaving together.",
    declined: 'Your loss. My budget lives to fight another day. | Suit yourself.',
    foil: "Foil, eh? Shiny doesn't mean pricey. | Foil's nice. Doesn't change my number much.",
    variant:
      "A variant. I suppose that's worth a little extra. A LITTLE. | Fancy edition. Still counting my coins.",
    slab: "A slab. You're charging for the plastic too, aren't you? | Graded. Fine, I'll respect the case.",
    pristine:
      "Pristine. Even I can't argue with that. | Not a scratch. Annoying. I can't haggle on condition.",
    rarity: "That rarity's been dropping, you know. | Rare-ish. I'll pay rare-ish money.",
  },
  kid: {
    greet:
      'WHOA. Is this a real card shop?! | Hi! I have allowance money! LOTS of it! (Some of it.)',
    return:
      "I'm back!! Did you get new stuff?! | You're my favourite shop! Don't tell the other one.",
    browse: 'Ooooh. Ohhh. OHHH. | This one has a dragon! Wait, no. Still cool!',
    offer: "Is {offer} enough? That's my whole birthday money! | {offer}! Please please please?",
    bundle:
      "Can I get BOTH for {offer}? That's like a mega-deal! | Two cards! {offer}! My friends will freak!",
    trade: "Wanna swap? My card is super cool, I promise! | Trade? I've got doubles of this one!",
    accept_counter: "YES! Deal! Best day EVER! | Okay okay okay, deal! Hold it, I'm shaking!",
    meet_middle:
      'Umm... {offer}? I can skip snacks this week. | {offer}? Mom says haggling is grown-up.',
    insulted: "That's like... a hundred allowances! | Whoa, no way! That's too much!",
    threat: "Maybe I'll just spend it on candy instead... | My friend's shop might have it...",
    final_offer:
      '{offer} is ALL I have! I checked my pockets twice! | {offer}! Final! Pinky promise final!',
    thanks: "THANK YOU! I'm gonna put it in a sleeve forever! | Wait till everyone sees this!",
    walkout: "Aww... okay. Bye, shop. | I'll come back when I'm older. And richer.",
    declined: 'Aww. Next time! | Okay... bye!',
    foil: 'IT SPARKLES! | Shiny! Shiny shiny shiny!',
    variant: 'Whoa, it looks different! Is it a secret version?! | Cracked-looking! So cool!',
    slab: "It's in a little box! Like a museum! | Fancy box card! Can I touch it? (Through the case.)",
    pristine: "It's PERFECT! Even the edges! | It looks brand new! Newer than new!",
    rarity: "Is that the rarest one? It's gotta be! | My friend said these are super rare!",
  },
  slabsnob: {
    greet:
      'Good day. I only collect the graded. Raw cards make me nervous. | Show me your slabs. The rest may remain in the bin.',
    return:
      "Ah, the shop with the respectable cases. Hello again. | I've returned. Your slabs left an impression.",
    browse: 'Let me see the label first. Always the label. | Hmm. Centering. Surface. Yes.',
    offer: '{offer}, for a card of standing. | My valuation: {offer}. Considered and fair.',
    bundle: 'A pair? {offer}, for the set. | Both, for {offer}. Their labels match nicely.',
    trade: "I propose an exchange, gentleman's terms. | A trade. My piece is quite respectable.",
    accept_counter: 'Agreed. A transaction worthy of the label. | Very well. Let it be written.',
    meet_middle: "Let us be civilised. {offer}. | I'll come up to {offer}. Graciously.",
    insulted: "Preposterous. That's a premium for the mere plastic. | I beg your pardon?",
    threat: "I have other houses to visit, you know. | My patience is graded, and it's slipping.",
    final_offer: '{offer}. My final appraisal. | {offer}, sealed and final.',
    thanks: 'Splendid. It will be displayed properly. | A fine acquisition. Good day.',
    walkout:
      'I shall take my business to a more serious establishment. | Good day. I said GOOD DAY.',
    declined: 'Very well. Good day. | As you wish.',
    foil: 'Foil in a slab. Acceptable. | A foil. Grading the surface must have been tense.',
    variant:
      'A variant under glass. Now that is a curiosity. | Smash Cut and graded. My pulse quickens. Slightly.',
    slab: 'Ah. A proper slab. Now we can talk. | This is the only way to own a card.',
    pristine: 'Pristine. Exquisite. Truly exquisite. | Perfect marks. I may need to sit down.',
    rarity:
      'The rarity is secondary. The grade is everything. | Fine rarity, but what does the label say?',
  },
  foilhunter: {
    greet: 'Got any shinies? I can smell foil from the door. | Hey! Point me at the sparkly stuff.',
    return: "Back for more glitter! Your shelves shine. | Your shop's my favourite disco ball.",
    browse: 'Tilting... tilting... ooh. | Look at the light on that.',
    offer: "{offer} for the shine. | I'll go {offer}. I'd go more if it sparkled harder.",
    bundle: 'Both for {offer}? Double the shimmer! | Two shiny friends, {offer}.',
    trade: "Trade you one of my glimmers? | Swap? Mine's got a lovely sheen too.",
    accept_counter: "Deal! It's catching the light already. | Sold! Shine on.",
    meet_middle: "Halfway? {offer}. Shiny compromise. | {offer}. Let's both sparkle a bit.",
    insulted: 'Whoa, that price is shinier than the card! | Too bright. Way too bright.',
    threat: 'I know a shop with a whole foil wall... | Careful, my sparkle budget is dimming.',
    final_offer: "{offer}. My glitter fund is tapped. | {offer}, final. Glitter isn't free.",
    thanks: "Gorgeous. Straight to the light box! | Thanks! My binder's about to glow.",
    walkout: 'Lost its shine. See you. | Too dull a deal for me.',
    declined: 'No sparkle today. Okay! | Fair enough. Bye!',
    foil: "THERE it is. That's the stuff. | Foil! You had me at hello.",
    variant:
      "An elemental variant? It's practically glowing! | Smash Cut! The light goes everywhere!",
    slab: "Shiny in a case. Can't tilt it as much, sadly. | A slab, but is it shiny inside?",
    pristine: 'Pristine AND shiny? Dream card. | Not a single scratch on the shine.',
    rarity: "The rarity's nice, but does it SPARKLE? | Rare and shiny is my sweet spot.",
  },
  completer: {
    greet:
      "Hi! I'm three cards from finishing the set. Help? | Hello! Checklist in hand, as always.",
    return:
      'Back with my checklist! Two boxes left! | Your shop fills gaps. I love gaps. Filled ones.',
    browse: 'Checking my list... checking... | Do I have this? Let me see... no! Yes! I mean no!',
    offer: '{offer}. It completes a row! | It finishes a page. {offer}?',
    bundle: "Both? That's two checkboxes. {offer}! | {offer} for the pair. My binder thanks you.",
    trade: 'I have a double. Swap? | Trade? My spare for your gap-filler.',
    accept_counter: 'Deal! *ticks box* | Sold! The page is whole!',
    meet_middle: "Let's meet at {offer}? | {offer}. For completion's sake.",
    insulted: "Even completion has limits! | That's... not on my budget page.",
    threat: 'I could wait for a reprint, you know. | My checklist can stay unchecked a while.',
    final_offer:
      '{offer}. My last offer, before I cry. | {offer}, final. The set can wait if it must.',
    thanks: 'Thank you! The binder is whole! | Another box ticked. Perfect.',
    walkout: "I'll leave the gap. For now. | Another day, another missing card.",
    declined: 'Okay. The hunt continues! | Oh well. Onward!',
    foil: "Foil? Even better, it's for my master set! | A foil version! There's a separate page for that!",
    variant:
      "A variant! There's a whole other checklist for those! | Oh no, now I need the variant too.",
    slab: "Slabbed. Hmm, won't fit in the binder. | A slab. I'll need a bigger shelf.",
    pristine: "Pristine! The binder's showpiece! | Pristine. It goes on the front page.",
    rarity: "That rarity's my last missing one! | This rarity is the hard part of the set!",
  },
  flipper: {
    greet: "Yo. What's moving? | Hey boss. Looking for margins.",
    return: 'Your shop again. You price soft. I like soft. | Back for another flip!',
    browse: "Can I sell this for more tomorrow? Hmm. | Market's hot on this one. Or warm.",
    offer: '{offer}. I gotta make a profit, you understand. | {offer}, cash today.',
    bundle: "Two for {offer}, fast. | Bulk at {offer}. I'll move them by Tuesday.",
    trade: "Swap? Mine's liquid. Very liquid. | Trade you something that'll flip easy.",
    accept_counter: 'Done. Pleasure doing business. | Deal. Easy money, for both of us.',
    meet_middle: '{offer}. Margins, boss. Margins. | Middle ground: {offer}.',
    insulted: "At that price I'd be the one getting flipped. | Nah. Nah nah nah.",
    threat: "There's a guy two stalls down... | I can walk. Walking's free.",
    final_offer: "{offer}. Can't go higher and still eat. | {offer}, final. Margins are margins.",
    thanks: "Good flip. You'll see me again. | Pleasure. Profit for both.",
    walkout: "No margin, no deal. Later. | Pass. I'll catch the next one.",
    declined: 'Cool. No hard feelings. | Next time, boss.',
    foil: "Foils move quick. I like it. | Foil sells. That's all I need to know.",
    variant: 'Variants are hype right now. | Smash Cuts flip like pancakes.',
    slab: "Slabs hold value. Good resale. | Graded's easier to sell. I'll take a look.",
    pristine: "Pristine is premium resale. | Pristine? That's tomorrow's headline price.",
    rarity: "That rarity's trending. | Rare moves. Commons don't. Simple.",
  },
  veteran: {
    greet:
      'Back in my day, we played with the cards. Hello, young one. | Ah, a proper shop. Smells like old sleeves.',
    return:
      'Hello again, dear. Same chair? | I came back. The tea was imaginary but the cards were real.',
    browse: 'I had this one in my first deck, you know. | Oh, the memories. Let me look a while.',
    offer: "{offer}. For old times' sake. | I'll give you {offer}, and a story for free.",
    bundle:
      'Both for {offer}. They belong together, like me and my old deck. | {offer} for the pair. Brings back memories.',
    trade: "I'll trade you one from my old box. | A swap, like we did at the schoolyard.",
    accept_counter: "Deal. You remind me of my old shopkeeper. | Agreed. That's a fair shake.",
    meet_middle:
      "Let's say {offer}, like sensible folk. | {offer}. My knees can't take more haggling.",
    insulted: "In my day that'd buy a whole booster box! | Goodness. Inflation, I suppose.",
    threat:
      "I may just go home and look at my old binder instead. | My back's not up for this much bargaining.",
    final_offer: "{offer}. That's my pension talking. | {offer}, last offer. I'm too old to argue.",
    thanks: "Thank you, dear. It's coming home. | Lovely. It'll sit next to my old favourites.",
    walkout: 'Ah well. Things were cheaper once. | Goodbye, young one.',
    declined: 'No matter. Good to visit. | Maybe next time.',
    foil: "Foils! We never had these. Shiny little things. | Foil. Fancy. Didn't exist when I started.",
    variant:
      'A variant? Kids today have it so good. | A broken-looking one? On purpose? Well I never.',
    slab: 'In a case! We kept ours in shoeboxes. | A slab. Very proper. Very modern.',
    pristine:
      'Pristine. Mine were all dog-eared, bless them. | Perfect. Not like my old rubber-banded stack.',
    rarity:
      "That rarity was legendary in my time. | A classic rarity. They don't make them like that.",
  },
  pristine: {
    greet:
      "I only buy perfect. I hope you have perfect. | Hello. I'll be inspecting with gloves on.",
    return:
      "Your stock was immaculate last time. I'm back. | I've returned. Please show me the flawless ones.",
    browse:
      "I see a whitening speck. Or it's dust. Or it's my soul. | Let me check the edges. All four. Twice.",
    offer: '{offer}, for condition this good. | {offer}. Perfection costs, I accept that.',
    bundle: 'A matched perfect pair, {offer}. | {offer} for both, if both are flawless.',
    trade: "A trade, card for card, perfect for perfect. | I'll swap one of my immaculate spares.",
    accept_counter: 'Accepted. Handle with care, please. | Deal. Use tweezers, please.',
    meet_middle:
      "I'll rise to {offer}. Perfection deserves it. | {offer}. Precisely in the middle.",
    insulted: 'That price has a crease in it. | Absolutely not.',
    threat: "I can wait for a flawless copy elsewhere. | I'm not here for flawed deals.",
    final_offer: '{offer}. Flawless and final. | {offer}, not a credit more.',
    thanks: 'Immaculate. Thank you. | Perfect. Into the vault.',
    walkout: "Not up to my standard. Goodbye. | A flawed deal. I'll pass.",
    declined: 'Understood. Good day. | Very well.',
    foil: 'Foil scratches so easily. Let me look. | Foil, flawless? Rare indeed.',
    variant:
      'A variant in this condition? Remarkable. | Smash Cut, but the card is unbroken. Lovely.',
    slab: "Graded. Now I can trust the condition. | A slab. Let's see the numbers.",
    pristine: 'PRISTINE. My heart. My whole heart. | The perfect grade. This is why I collect.',
    rarity: 'Rarity matters less than condition. | Rare, yes, but is it MINT?',
  },
  bargain: {
    greet: "Got a bargain bin? I live in bargain bins. | Hiya! Where's the cheap stuff?",
    return: "Back for more deals! | Your bin's got treasures. I'm back.",
    browse: "Digging... digging... ooh, a find! | One shop's common is my treasure.",
    offer: "{offer}. That's bin price, right? | {offer}. A steal, for me.",
    bundle: 'Two for {offer}? Bulk discount, yes? | {offer} for both. Deals on deals.',
    trade: "I'll swap you something from my bin! | Trade? I've got loads of these.",
    accept_counter: 'Deal! Bargain secured. | Done! My bin grows.',
    meet_middle: "{offer}, that's still a bargain, right? | Okay, {offer}. Let's be friends.",
    insulted: "That's not a bargain, that's a mortgage! | Ha! Nope.",
    threat: "I'll wait for the clearance sale. | Bins are full of patience, and so am I.",
    final_offer: "{offer}. Bargain hunters have limits. | {offer} final. That's my whole coin jar.",
    thanks: 'Score! Bargain of the day! | Thanks! Another gem from the bin.',
    walkout: "Too rich for me. Bye! | I'll dig elsewhere.",
    declined: 'No worries! | Bye-bye!',
    foil: 'Foil at bin price? Dream on, me. | Shiny! Is it on sale?',
    variant: 'A variant? Probably not bin-priced, huh. | Fancy one. Out of my bin league.',
    slab: "A slab? That's not a bargain shape. | Cases cost extra. Hmm.",
    pristine: 'Pristine is not bargain. Sadly. | Too perfect for my wallet.',
    rarity: 'Rare in a bin? Never happens! | That rarity is cheaper than it looks. Right?',
  },
  whale: {
    greet: 'Show me the best thing you have. | Good afternoon. Money is no object. Mostly.',
    return: "Your finest again, if you please. | I'm back. My card is warm.",
    browse: "Hm. Hm. Yes. I'll consider it. | I'll take a look at the top shelf. Only the top.",
    offer: "{offer}. Let's not waste time. | {offer}. It's pocket change, really.",
    bundle: "Both. {offer}. Done. | I'll take the pair for {offer}. Wrap them nicely.",
    trade: 'I have a spare that might interest you. | A trade, and keep the change.',
    accept_counter: 'Fine. Done. | Agreed. Next!',
    meet_middle: "{offer}. I don't haggle long. | Call it {offer}.",
    insulted: 'Even I have limits. Barely. | Excuse me?',
    threat: "My time is valuable. | I'll buy the shop next door instead.",
    final_offer: "{offer}. I've already lost interest in haggling. | {offer}, final.",
    thanks: 'Excellent. Have it sent to the vault. | Splendid purchase.',
    walkout: "Too much fuss. Goodbye. | I don't do this much talking.",
    declined: 'Your loss. | As you like.',
    foil: 'Foil. Naturally. | Shiny. Good.',
    variant: "Variants are the only cards worth having. | A Smash Cut piece. Now we're talking.",
    slab: "A slab. I'll add it to the wall. | Graded. Good. I own a whole wall of them.",
    pristine: "Pristine. I'll pay for pristine. | The best grade. Only the best.",
    rarity: 'That rarity, I collect by the dozen. | Top rarity. As it should be.',
  },
  gambler: {
    greet: "My horoscope said I'd find something today. | Is today lucky? It feels lucky.",
    return: "Your shop is lucky for me! Back I come! | Same shop, same luck. Let's roll.",
    browse: 'Seven cards from the left... that one. | My dice say this one.',
    offer: "{offer}. The number felt right. | {offer}. It's a lucky number, trust me.",
    bundle: 'Two for {offer}! Double luck! | A pair, {offer}. Pairs are lucky.',
    trade: "Let's swap. Fate says so. | Trade? My card has good energy.",
    accept_counter: 'The dice approve! Deal! | Lucky day! Deal!',
    meet_middle: "Let's roll... {offer}! | {offer}. The cards agree.",
    insulted: 'That number is cursed. Cursed! | Unlucky number! No no no!',
    threat: "I feel bad luck coming... | The omens aren't great for this deal.",
    final_offer: '{offer}. The dice have spoken. | {offer}. Last roll.',
    thanks: 'Lucky me! Lucky you! | The stars aligned!',
    walkout: 'Bad omen. Gotta go. | Not today. The dice said no.',
    declined: 'Fate is fickle! | Another day, another roll.',
    foil: 'Foil is good luck, everyone knows that. | Shiny! Lucky shiny!',
    variant: "A Smash Cut — lucky or cursed? I'll risk it! | Elemental! Very strong energy!",
    slab: 'Sealed luck in a box! | A slab. Locked-in luck.',
    pristine: 'A perfect grade is the luckiest number. | Pristine! The universe smiles.',
    rarity: 'That rarity is my lucky one! | Rare! My lucky streak!',
  },
  rival: {
    greet: 'Just browsing. Totally not checking your prices. | Nice shop. Smaller than mine.',
    return: "Me again. Just... researching. | Back to see what you're up to.",
    browse: 'Hm, I stock this. Cheaper. | Interesting pricing. Very interesting.',
    offer: "{offer}. I'll resell it at my place. | {offer}. Professional courtesy.",
    bundle: 'Both for {offer}. Shopkeeper rate. | Trade rate: {offer}.',
    trade: "Shopkeeper swap? I've got overstock. | Trade stock with me.",
    accept_counter:
      "Fine. You're better at this than I thought. | Deal. Don't let it go to your head.",
    meet_middle: 'Between pros: {offer}. | {offer}. Industry standard.',
    insulted: 'I know what this cost you. Nice try. | Please. I wrote that pricing guide.',
    threat: "My shop's open, you know. Just saying. | I can stock this myself.",
    final_offer: "{offer}. Shopkeeper's final. | {offer}. That's the wholesale ceiling.",
    thanks: 'Good doing business with a fellow pro. | Thanks. Nice shop. Still smaller than mine.',
    walkout: "See you at the market. | I'll just order it in.",
    declined: 'Fair. Professional respect. | Okay. Rivals, then.',
    foil: 'Foil. My customers like those. | Shiny stock moves.',
    variant: "Variants. I never get those. Hm. | Where'd you get a Smash Cut?",
    slab: 'Slabs. Good margin. | Slab stock. Respectable.',
    pristine: "A Pristine? Okay, I'm jealous. | Pristine. Ugh, show-off.",
    rarity: 'Decent rarity on the shelf. | That rarity sells well at mine too.',
  },
  tourist: {
    greet: "Hi! I'm visiting! Is this a famous shop? | Hello! I saw your sign from the street!",
    return: "I'm back on my trip! | Remember me? Holiday's still going!",
    browse:
      "Can I take a picture? For the scrapbook! | So many cards! Which one's the local favourite?",
    offer: '{offer}? Is that the exchange rate? | Souvenir price: {offer}?',
    bundle: 'Two souvenirs for {offer}? | One for me, one for my cousin, {offer}?',
    trade: "Wanna trade? I got this one at another shop! | Swap? Mine's from far away!",
    accept_counter: 'Yay! Souvenir secured! | Deal! Photo time!',
    meet_middle: "{offer}? I've got a train soon! | Let's say {offer}, I'm in a hurry!",
    insulted: "Wow, the tourist price! | That's more than my hotel!",
    threat: 'My tour bus is leaving soon... | I might just buy a keychain instead.',
    final_offer: '{offer}! Final! The bus is honking! | {offer}, last one, I have to go!',
    thanks: "Thank you! Best souvenir ever! | I'll tell everyone about your shop!",
    walkout: 'Gotta catch my bus! Bye! | Maybe next holiday!',
    declined: 'Okay! Lovely shop anyway! | Bye! Nice to meet you!',
    foil: 'Ooh, shiny! Like a postcard! | Sparkly souvenir!',
    variant: 'That looks special! Is it local? | Wow, a cracked-glass one!',
    slab: 'In a case! Easy to pack! | A slab! Travel-safe!',
    pristine: 'So perfect! Like a museum piece! | It looks brand new!',
    rarity: 'Is that rare here? It looks rare! | Rare? Perfect souvenir!',
  },
};

const COLOURS: Record<string, { colour: string; vibe: string; word: string }> = {
  loyal_ember: { colour: 'Ember', vibe: 'hot', word: 'blazing' },
  loyal_gale: { colour: 'Gale', vibe: 'breezy', word: 'whirling' },
  loyal_light: { colour: 'Light', vibe: 'bright', word: 'radiant' },
  loyal_root: { colour: 'Root', vibe: 'earthy', word: 'sturdy' },
  loyal_shadow: { colour: 'Shadow', vibe: 'shady', word: 'sneaky' },
  loyal_tide: { colour: 'Tide', vibe: 'salty', word: 'flowing' },
  loyal_void: { colour: 'Void', vibe: 'empty', word: 'bottomless' },
};

const LOYALIST: Bank = {
  greet:
    "Any {colour} cards? It's {colour} or nothing for me. | Hello! I bleed {colour}. Show me some.",
  return: 'Back for more {colour}! You stock it right. | My {colour} binder sent me back here.',
  browse: 'Is that {colour}? It feels {vibe}. | Looking for that {word} {colour} energy.',
  offer: '{offer} for a {colour} gem. | {offer}. My {colour} heart says yes.',
  bundle: 'Both for {offer}! Double {colour}! | {offer} for the pair. Pure {colour}.',
  trade: "Swap for some {colour}? Mine's {word}. | Trade? I've got a {vibe} one.",
  accept_counter: 'Deal! For {colour}! | Sold! {colour} forever!',
  meet_middle: "{offer}? Let's keep it {vibe}. | Meet me at {offer}, in the name of {colour}.",
  insulted: 'Not even {colour} is worth that! | Whoa, that price is too {vibe}.',
  threat: 'There are other {colour} shops, you know. | My {colour} patience is running thin.',
  final_offer: '{offer}. Final, on my {colour} honour. | {offer}. The {colour} has spoken.',
  thanks: '{colour} forever! Thanks! | Another {word} card for the deck!',
  walkout: "I'll find my {colour} elsewhere. | Not {colour} enough of a deal. Bye.",
  declined: 'Okay. {colour} waits. | Fine! More {colour} for someone else.',
  foil: "A foil {colour}? It's {word}! | Foil makes {colour} even more {vibe}.",
  variant: 'An elemental variant! Is it {colour}?! | A Smash Cut — {word}!',
  slab: 'A slabbed card. Is it {colour}? Please be {colour}. | Graded, and {vibe}. Nice.',
  pristine: 'Pristine! A {word} specimen! | Perfect grade, perfect {colour}.',
  rarity: 'That rarity in {colour}? Yes please. | Rare and {vibe}. My kind of card.',
};

function split(s: string): string[] {
  return s.split(' | ').map((x) => x.trim());
}

/** Fully-expanded bank: persona id -> moment -> lines. */
export const DIALOGUE: Record<string, Record<Moment, string[]>> = (() => {
  const out: Record<string, Record<Moment, string[]>> = {};
  for (const [id, bank] of Object.entries(ARCHETYPES)) {
    out[id] = Object.fromEntries(MOMENTS.map((m) => [m, split(bank[m])])) as Record<
      Moment,
      string[]
    >;
  }
  for (const [id, c] of Object.entries(COLOURS)) {
    out[id] = Object.fromEntries(
      MOMENTS.map((m) => [
        m,
        split(LOYALIST[m]).map((l) =>
          l
            .replace(/\{colour\}/g, c.colour)
            .replace(/\{vibe\}/g, c.vibe)
            .replace(/\{word\}/g, c.word),
        ),
      ]),
    ) as Record<Moment, string[]>;
  }
  return out;
})();

/** FNV-1a, so the same seed + moment always picks the same line. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function pickLine(
  personaId: string | null | undefined,
  moment: Moment,
  seed: number,
  salt: number | string = 0,
  vars: { item?: string; offer?: string } = {},
): string {
  const bank = DIALOGUE[personaId ?? ''] ?? DIALOGUE.tightfist;
  const lines = bank[moment];
  const line = lines[hash(`${seed}:${moment}:${salt}`) % lines.length];
  return line
    .replace(/\{item\}/g, vars.item ?? 'that one')
    .replace(/\{offer\}/g, vars.offer ?? 'that');
}

/** Server event code -> dialogue moment. */
export function momentForEvent(e: string): Moment | null {
  switch (e) {
    case 'arrive':
      return 'greet';
    case 'return':
    case 'bundle':
    case 'accept_counter':
    case 'meet_middle':
    case 'insulted':
    case 'threat':
    case 'final_offer':
    case 'thanks':
    case 'walkout':
    case 'declined':
      return e;
    default:
      return null;
  }
}

export function lineCount(): number {
  return Object.values(DIALOGUE).reduce(
    (n, b) => n + Object.values(b).reduce((m, l) => m + l.length, 0),
    0,
  );
}

export interface ConvoLine {
  who: 'them' | 'you';
  text: string;
}

export interface ConvoInput {
  persona_id?: string | null;
  seed: number;
  kind: 'buy' | 'trade';
  regular?: boolean;
  bundle?: boolean;
  /** Current offer; the opening is read from the log's leading 'offer' entry when present. */
  opening: number;
  event_log?: { e: string; v?: number }[];
  remark?: Moment | null;
  item?: string;
  fmt?: (n: number) => string;
}

/** Rebuild the whole exchange from the server's compact event log. */
export function buildConversation(c: ConvoInput): ConvoLine[] {
  const fmt = c.fmt ?? ((n: number) => `${n}`);
  const p = c.persona_id;
  const out: ConvoLine[] = [];
  const say = (m: Moment, salt: number | string, offer?: number) =>
    out.push({
      who: 'them',
      text: pickLine(p, m, c.seed, salt, {
        item: c.item,
        offer: offer != null ? fmt(offer) : undefined,
      }),
    });
  say(c.regular ? 'return' : 'greet', 'open');
  if (c.remark) say(c.remark, 'remark');
  const first = c.event_log?.[0];
  say(
    c.kind === 'trade' ? 'trade' : c.bundle ? 'bundle' : 'offer',
    'offer',
    first?.e === 'offer' && first.v != null ? first.v : c.opening,
  );
  (c.event_log ?? []).forEach((ev, i) => {
    if (ev.e === 'offer') return; // the opening, already said above
    if (ev.e === 'counter') out.push({ who: 'you', text: `How about ${fmt(ev.v ?? 0)}?` });
    else if (ev.e === 'final')
      out.push({ who: 'you', text: `${fmt(ev.v ?? 0)}. Final offer — take it or leave it.` });
    else if (ev.e === 'declined') out.push({ who: 'you', text: 'Sorry, not today.' });
    else {
      const m = momentForEvent(ev.e);
      if (m) say(m, i, ev.v);
    }
  });
  return out;
}
