import type { PlayerRole } from "./types";
export type CardEffect =
 | {kind:"cash";amount:number;recipient:"bank"|"public"|"cooperative"|"public-if-available"|"public-payment-if-available"|"each-citizen"}
 | {kind:"move";steps:number;resolveDestination:boolean}
 | {kind:"skip-turn"} | {kind:"jail"}
 | {kind:"contribute";amount:number;destination:"cooperative"|"public";optional:boolean}
 | {kind:"collect-if-citizen-contributes";amount:number;contribution:number}
 | {kind:"extra-roll"};
export interface GameCard {id:string;title:string;deck:"community"|"chance";effects:Record<PlayerRole,CardEffect[]>}
const cash=(amount:number,recipient:Extract<CardEffect,{kind:"cash"}>["recipient"]="bank"):CardEffect=>({kind:"cash",amount,recipient});
const move=(steps:number):CardEffect=>({kind:"move",steps,resolveDestination:true});
const skip:CardEffect={kind:"skip-turn"}, jail:CardEffect={kind:"jail"};
const contribution=(amount:number,destination:"cooperative"|"public"="cooperative",optional=false):CardEffect=>({kind:"contribute",amount,destination,optional});
const card=(id:string,title:string,deck:"community"|"chance",citizen:CardEffect[],politician:CardEffect[]):GameCard=>({id,title,deck,effects:{citizen,politician}});
export const CARD_DECKS:Record<"community"|"chance",GameCard[]> = {
community:[
card("CC-01","Government Allowance","community",[cash(100),cash(-20)],[cash(250)]),
card("CC-02","Public Service Bill","community",[cash(120,"public")],[cash(-20)]),
card("CC-03","Public Benefit","community",[cash(100)],[cash(200)]),
card("CC-04","Road Repair Levy","community",[cash(100,"public")],[cash(100)]),
card("CC-05","Unexpected Medical Expense","community",[cash(-150)],[cash(100)]),
card("CC-06","Community Donation","community",[contribution(50,"cooperative",true)],[cash(100,"each-citizen")]),
card("CC-07","Paperwork Correction","community",[cash(-60)],[cash(-10)]),
card("CC-08","Delayed Salary","community",[cash(-100)],[cash(150)]),
card("CC-09","Transport Subsidy","community",[cash(80)],[cash(200)]),
card("CC-10","Maintenance Notice","community",[cash(-90)],[cash(-20)]),
card("CC-11","School Fundraiser","community",[contribution(50,"cooperative",true)],[cash(100)]),
card("CC-12","Electricity Adjustment","community",[cash(-100)],[cash(100)]),
card("CC-13","Audit","community",[cash(-100)],[cash(-25)]),
card("CC-14","Public Contract","community",[cash(-80)],[cash(250)]),
card("CC-15","Neighbour Helps Neighbour","community",[{kind:"collect-if-citizen-contributes",amount:50,contribution:50}],[cash(100,"public-if-available")]),
card("CC-16","People's Meeting","community",[contribution(50,"cooperative",true)],[cash(-20)])
],
chance:[
card("CH-01","Price Hike","chance",[cash(150,"public")],[cash(200,"public-if-available")]),
card("CH-02","Investigation Notice","chance",[cash(-100),skip],[cash(25)]),
card("CH-03","Tax Rebate","chance",[cash(70)],[cash(250)]),
card("CH-04","Road Diversion","chance",[move(-3)],[move(3)]),
card("CH-05","Development Project","chance",[cash(100,"public")],[cash(200)]),
card("CH-06","Public Holiday","chance",[skip],[{kind:"extra-roll"}]),
card("CH-07","Broken Water Line","chance",[cash(100,"public")],[cash(100,"public-if-available")]),
card("CH-08","Permit Required","chance",[cash(-80)],[cash(-10)]),
card("CH-09","Transport Strike","chance",[cash(-100)],[cash(100)]),
card("CH-10","Favourable Headline","chance",[cash(-50)],[cash(150,"public-if-available")]),
card("CH-11","Community Service","chance",[contribution(100,"public",true),skip],[cash(100)]),
card("CH-12","Court Date","chance",[jail],[cash(25)]),
card("CH-13","Contract Award","chance",[cash(-100)],[cash(300)]),
card("CH-14","Inflation Adjustment","chance",[cash(-120)],[cash(120)]),
card("CH-15","Public Apology","chance",[cash(-50)],[cash(-10)]),
card("CH-16","Collective Action","chance",[contribution(50,"cooperative",true)],[cash(100,"public-payment-if-available")])
]};
export function drawCard(deck:"community"|"chance",index:number):GameCard {
 const cards=CARD_DECKS[deck]; return cards[((index%cards.length)+cards.length)%cards.length];
}
