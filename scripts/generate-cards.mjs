// Regenerate src/game/generated-cards.ts from data/cards_rows.csv:
//   node scripts/generate-cards.mjs
import fs from 'fs';
const raw = fs.readFileSync(new URL('../data/cards_rows.csv', import.meta.url), 'utf8');
function parseCSV(text){const rows=[];let i=0,field='',row=[],inq=false;while(i<text.length){const c=text[i];if(inq){if(c==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}inq=false;i++;continue;}field+=c;i++;continue;}else{if(c==='"'){inq=true;i++;continue;}if(c===','){row.push(field);field='';i++;continue;}if(c==='\r'){i++;continue;}if(c==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue;}field+=c;i++;continue;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
const rows=parseCSV(raw);const header=rows[0];const idx=Object.fromEntries(header.map((h,i)=>[h,i]));
let data=rows.slice(1).filter(r=>r[idx.name] && r[idx.card_type]);

// stable hash
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0);}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}

const RARITY_COST={Common:1,Uncommon:2,Rare:3,'Super-Rare':4,Mythic:5};
const TYPE_MAP={Unit:'Unit',Location:'Location',Artifact:'Item',Event:'Event',Leader:'Leader'};

// Leaders: assign element pairs
const LEADER_ELEMENTS={
  'Avatar of the Abyss':['Dark','Chaos'],
  'Ethereal Sea Witch':['Frost','Light'],
  'Mer-King':['Order','Nature'],
  'Legendary Diver':['Tech','Flame'],
};
const LEADER_ORDER=Object.keys(LEADER_ELEMENTS);

const leaders=data.filter(r=>r[idx.card_type]==='Leader');
const nonLeaders=data.filter(r=>r[idx.card_type]!=='Leader');

// Round-robin assign nonLeaders to 4 leader groups, balancing by type.
// Sort by type then name for determinism, then distribute.
const byType={};
for(const r of nonLeaders){(byType[r[idx.card_type]]=byType[r[idx.card_type]]||[]).push(r);}
const groups=[[],[],[],[]];
let g=0;
for(const t of ['Location','Unit','Artifact','Event']){
  const arr=(byType[t]||[]).sort((a,b)=>a[idx.name].localeCompare(b[idx.name]));
  for(const r of arr){groups[g%4].push(r);g++;}
}

function keywordFor(type,el,seed){
  const uni={Unit:['Blitz','Guard','Pierce','Armor 2'],Item:['Armor 2','Pierce','Burden 1'],Location:['Symmetric'],Event:[],Leader:['Ward 1']};
  const byEl={
    Dark:{Unit:['Siphon','Reap','Wither 1'],Item:['Siphon'],Location:['Siphon'],Event:['Siphon'],Leader:['Siphon']},
    Chaos:{Unit:['Feedback'],Item:['Feedback'],Location:['Feedback'],Event:['Echo'],Leader:['Feedback']},
    Frost:{Unit:['Brittle','Freeze-Dry'],Item:['Brittle'],Location:['Freeze-Dry'],Event:['Freeze-Dry'],Leader:[]},
    Tech:{Unit:['Overdrive','Glitch'],Item:['Glitch'],Location:['Boost 1'],Event:[],Leader:['Boost 1']},
    Nature:{Unit:['Sustain 2'],Item:[],Location:['Boost 1'],Event:[],Leader:['Sustain 2','Boost 1']},
    Flame:{Unit:[],Item:[],Location:[],Event:['Meltdown'],Leader:[]},
    Light:{Unit:[],Item:[],Location:['Fix Light'],Event:['Pure'],Leader:['Fix Light']},
    Order:{Unit:[],Item:[],Location:['Fix Order'],Event:['Pure'],Leader:['Command 2']},
  };
  const pool=[...(uni[type]||[]),...((byEl[el]&&byEl[el][type])||[])];
  if(pool.length===0)return [];
  return [pool[seed%pool.length]];
}

// Event action generation (structured effect)
const EVENT_ACTIONS=[
  {action:'damage',value:3,target:'unit',text:'Deal 3 damage to target enemy Unit.'},
  {action:'damage',value:2,target:'leader',text:'Deal 2 damage to the enemy Leader.'},
  {action:'freeze',target:'unit',text:'Freeze target enemy Unit.'},
  {action:'scorch',value:2,target:'unit',text:'Scorch 2 on target enemy Unit.'},
  {action:'heal',value:4,target:'self',text:'Heal 4 damage from your Leader.'},
  {action:'draw',value:2,text:'Draw 2 cards.'},
  {action:'obliterate',target:'unit',text:'Obliterate target enemy Unit (bypasses Armor).'},
  {action:'manifest',value:2,text:'Manifest a 2/2 Scrap Drone token.'},
  {action:'buff',value:2,target:'friendly',text:'Give a friendly Unit +2/+2 until end of turn.'},
];

const cards=[];
const decks={};

// Leaders
for(const r of leaders){
  const name=r[idx.name];const el=LEADER_ELEMENTS[name]||['Order','Nature'];
  const seed=hash(name);
  const health=30+(seed%3)*5; // 30/35/40
  const attack=2+(seed%3); // 2-4
  cards.push({
    id:'L_'+slug(name),name,type:'Leader',elements:el,
    health,attack,keywords:keywordFor('Leader',el[seed%2],seed),
    text:r[idx.flavor_text]||'',image:r[idx.image_url]||'',
  });
}

// Non-leaders per group
groups.forEach((grp,gi)=>{
  const leaderName=LEADER_ORDER[gi];const els=LEADER_ELEMENTS[leaderName];
  grp.forEach((r,ci)=>{
    const name=r[idx.name];const seed=hash(name);
    const type=TYPE_MAP[r[idx.card_type]];
    const el=els[ci%2];
    const cost=RARITY_COST[r[idx.rarity]]||2;
    const costObj={};costObj[el]=1;if(cost>1)costObj.Generic=cost-1;
    const card={id:slug(name),name,type,elements:[el],cost:costObj,
      keywords:keywordFor(type,el,seed),text:r[idx.flavor_text]||'',image:r[idx.image_url]||''};
    if(type==='Item'){
      card.attach={attack:Math.max(0,cost-1),health:cost};
    }
    if(type==='Location'){
      const LOC=['ATK_ALL','HP_ALL','SCORCH_ALL'];
      card.locEffect=LOC[seed%LOC.length];
    }
    if(type==='Unit'){
      const def=parseInt(r[idx.defense])||4;
      card.health=Math.max(1,Math.round(def/2));
      card.attack=Math.max(1,Math.round(def/3)+(cost>=3?1:0));
    }
    if(type==='Event'){
      const act=EVENT_ACTIONS[seed%EVENT_ACTIONS.length];
      card.effect=act; card.text=(card.text?card.text+' ':'')+act.text;
    }
    cards.push(card);
  });
});

// Build a 30-card deck per leader from its group
groups.forEach((grp,gi)=>{
  const leaderName=LEADER_ORDER[gi];
  const leaderId='L_'+slug(leaderName);
  const groupIds=grp.map(r=>slug(r[idx.name]));
  const locs=grp.filter(r=>r[idx.card_type]==='Location').map(r=>slug(r[idx.name]));
  // deck: 2 copies of each until 30, ensure at least 2 locations present
  const deck=[];
  // prioritize including locations first
  const ordered=[...locs, ...groupIds.filter(id=>!locs.includes(id))];
  let copiesLeft={};ordered.forEach(id=>copiesLeft[id]=2);
  let i=0;
  while(deck.length<30){
    const id=ordered[i%ordered.length];
    if(copiesLeft[id]>0){deck.push(id);copiesLeft[id]--;}
    i++;
    if(i>1000)break;
  }
  decks[leaderId]={leader:leaderId,cards:deck.slice(0,30),locations:locs.slice(0,4)};
});

// Emit TS
let out=`// AUTO-GENERATED from cards_rows.csv. Do not edit by hand.\n`;
out+=`// Only name, image (url), and flavor text are taken from the source data; all\n`;
out+=`// gameplay values (elements, cost, stats, keywords, effects) are generated to\n`;
out+=`// make the Shifting Multiverse rules playable.\n`;
out+=`import { CardTemplate } from '../types';\n\n`;
out+=`export const GENERATED_CARDS: CardTemplate[] = ${JSON.stringify(cards,null,2)};\n\n`;
out+=`export const GENERATED_DECKS: Record<string, { leader: string; cards: string[]; locations: string[] }> = ${JSON.stringify(decks,null,2)};\n\n`;
out+=`export const LEADER_IDS: string[] = ${JSON.stringify(cards.filter(c=>c.type==='Leader').map(c=>c.id))};\n`;
fs.writeFileSync(new URL('../src/game/generated-cards.ts', import.meta.url), out);
console.log('Wrote',cards.length,'cards.');
for(const [lid,d] of Object.entries(decks)){
  const locsInDeck=d.cards.filter(id=>d.locations.includes(id)).length;
  console.log(lid,'deck size',d.cards.length,'locations available',d.locations.length,'locs in deck',locsInDeck);
}
