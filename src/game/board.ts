export type SpaceType = "go" | "property" | "community" | "chance" | "railroad" | "utility" | "tax" | "jail" | "free-parking" | "go-to-jail";
export interface BoardSpace {
  id: string;
  name: string;
  subtitle: string;
  type: SpaceType;
  price?: number;
  color?: string;
}
export const BOARD: BoardSpace[] = [
  { id:"go", name:"Shurur Line", subtitle:"Start / বেতন", type:"go" },
  { id:"old-dhaka", name:"Purono Dhaka", subtitle:"Old Town", type:"property", price:60, color:"brown" },
  { id:"cc-1", name:"Public Notice", subtitle:"Community Chest", type:"community" },
  { id:"lalbagh", name:"Lalbagh", subtitle:"Heritage Quarter", type:"property", price:60, color:"brown" },
  { id:"income-tax", name:"Income Tax", subtitle:"Public Treasury", type:"tax" },
  { id:"rail-1", name:"Metro Rail", subtitle:"Railway", type:"railroad", price:200 },
  { id:"sadarghat", name:"Sadarghat", subtitle:"River Port", type:"property", price:100, color:"light-blue" },
  { id:"chance-1", name:"Headline", subtitle:"Chance", type:"chance" },
  { id:"buriganga", name:"Buriganga Ghat", subtitle:"Riverfront", type:"property", price:100, color:"light-blue" },
  { id:"shakhari", name:"Shakhari Bazar", subtitle:"Craft Quarter", type:"property", price:120, color:"light-blue" },
  { id:"jail", name:"Administrative Hold", subtitle:"Just Visiting", type:"jail" },
  { id:"gazipur", name:"Gazipur", subtitle:"Industrial Belt", type:"property", price:140, color:"pink" },
  { id:"electric", name:"Power Board", subtitle:"Electric Utility", type:"utility", price:150 },
  { id:"munshiganj", name:"Munshiganj", subtitle:"Trade District", type:"property", price:140, color:"pink" },
  { id:"tongi", name:"Tongi", subtitle:"Factory Row", type:"property", price:160, color:"pink" },
  { id:"rail-2", name:"National Express", subtitle:"Railway", type:"railroad", price:200 },
  { id:"rajshahi", name:"Rajshahi", subtitle:"Silk City", type:"property", price:180, color:"orange" },
  { id:"cc-2", name:"Public Notice", subtitle:"Community Chest", type:"community" },
  { id:"bogura", name:"Bogura", subtitle:"North Market", type:"property", price:180, color:"orange" },
  { id:"pabna", name:"Pabna", subtitle:"River County", type:"property", price:200, color:"orange" },
  { id:"free-parking", name:"Public Plaza", subtitle:"Free Parking", type:"free-parking" },
  { id:"khulna", name:"Khulna", subtitle:"Port City", type:"property", price:220, color:"red" },
  { id:"chance-2", name:"Breaking News", subtitle:"Chance", type:"chance" },
  { id:"jashore", name:"Jashore", subtitle:"Market Road", type:"property", price:220, color:"red" },
  { id:"kushtia", name:"Kushtia", subtitle:"Cultural Quarter", type:"property", price:240, color:"red" },
  { id:"rail-3", name:"Padma Connector", subtitle:"Railway", type:"railroad", price:200 },
  { id:"sylhet", name:"Sylhet", subtitle:"Tea District", type:"property", price:260, color:"yellow" },
  { id:"moulvibazar", name:"Moulvibazar", subtitle:"Tea Gardens", type:"property", price:260, color:"yellow" },
  { id:"water", name:"Water Authority", subtitle:"Water Utility", type:"utility", price:150 },
  { id:"habiganj", name:"Habiganj", subtitle:"Green Belt", type:"property", price:280, color:"yellow" },
  { id:"go-to-jail", name:"Investigation Notice", subtitle:"Go to Hold", type:"go-to-jail" },
  { id:"chattogram", name:"Chattogram", subtitle:"Commercial Port", type:"property", price:300, color:"green" },
  { id:"cumilla", name:"Cumilla", subtitle:"Eastern Gateway", type:"property", price:300, color:"green" },
  { id:"cc-3", name:"Public Notice", subtitle:"Community Chest", type:"community" },
  { id:"cox-bazar", name:"Cox's Bazar", subtitle:"Coastal Strip", type:"property", price:320, color:"green" },
  { id:"rail-4", name:"Coastal Line", subtitle:"Railway", type:"railroad", price:200 },
  { id:"chance-3", name:"Special Bulletin", subtitle:"Chance", type:"chance" },
  { id:"gaibandha", name:"Gaibandha", subtitle:"Northern Fields", type:"property", price:350, color:"dark-blue" },
  { id:"luxury-tax", name:"Development Levy", subtitle:"Luxury Tax", type:"tax" },
  { id:"dhaka-heights", name:"Dhaka Heights", subtitle:"Premium District", type:"property", price:400, color:"dark-blue" },
];
export const BOARD_SPACE_COUNT = BOARD.length;
if (BOARD_SPACE_COUNT !== 40) throw new Error("Board must contain exactly 40 spaces.");
