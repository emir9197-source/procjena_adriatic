const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const N=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
function hav(a,b,c,d){const R=6371000,r=x=>x*Math.PI/180,p1=r(a),p2=r(c),dp=r(c-a),dl=r(d-b),q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function comp(cs,t){return cs?.find(c=>c.types?.includes(t))?.long_name||""}

async function geocode(req,env){
  const u=new URL(req.url),address=(u.searchParams.get("address")||"").trim();
  if(!address)return J({error:"Nedostaje adresa."},400);
  const g=new URL("https://maps.googleapis.com/maps/api/geocode/json");
  g.searchParams.set("address",address);g.searchParams.set("language","bs");g.searchParams.set("region","ba");g.searchParams.set("key",env.GOOGLE_SERVER_API_KEY);
  const r=await fetch(g),d=await r.json();
  if(!r.ok||d.status!=="OK"||!d.results?.length)return J({error:"Google Geocoding: "+(d.error_message||d.status||"nema rezultata")},502);
  const x=d.results[0],c=x.address_components||[],l=x.geometry?.location||{};
  return J({formattedAddress:x.formatted_address,placeId:x.place_id,lat:l.lat,lon:l.lng,locationType:x.geometry?.location_type||"",locality:comp(c,"locality")||comp(c,"postal_town"),sublocality:comp(c,"sublocality")||comp(c,"sublocality_level_1"),municipality:comp(c,"administrative_area_level_2")||comp(c,"locality"),region:comp(c,"administrative_area_level_1"),country:comp(c,"country")});
}

async function nearby(req,env){
  let b;try{b=await req.json()}catch{return J({error:"Neispravan JSON."},400)}
  const lat=N(b.lat),lon=N(b.lon);if(lat===null||lon===null)return J({error:"Nedostaju koordinate."},400);
  const allowed=new Set(["fire_station","gas_station","hospital","police"]);
  const type=allowed.has(b.type)?b.type:"fire_station",radius=Math.max(100,Math.min(Number(b.radius)||5000,50000)),max=Math.max(1,Math.min(Number(b.maxResults)||5,10));
  const body={includedTypes:[type],maxResultCount:max,rankPreference:"DISTANCE",locationRestriction:{circle:{center:{latitude:lat,longitude:lon},radius}},languageCode:"bs",regionCode:"BA"};
  const r=await fetch("https://places.googleapis.com/v1/places:searchNearby",{method:"POST",headers:{"content-type":"application/json","X-Goog-Api-Key":env.GOOGLE_SERVER_API_KEY,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.location,places.primaryType"},body:JSON.stringify(body)});
  const d=await r.json();if(!r.ok)return J({error:d?.error?.message||"Google Places greška."},502);
  return J({places:(d.places||[]).map(p=>({id:p.id,name:p.displayName?.text||"",address:p.formattedAddress||"",primaryType:p.primaryType||"",lat:p.location?.latitude,lon:p.location?.longitude,distanceMeters:Number.isFinite(p.location?.latitude)?Math.round(hav(lat,lon,p.location.latitude,p.location.longitude)):null}))});
}

async function route(req,env){
  let b;try{b=await req.json()}catch{return J({error:"Neispravan JSON."},400)}
  const o=b.origin||{},d=b.destination||{},olat=N(o.lat),olon=N(o.lon),dlat=N(d.lat),dlon=N(d.lon);
  if([olat,olon,dlat,dlon].some(x=>x===null))return J({error:"Nedostaju koordinate rute."},400);
  const body={origin:{location:{latLng:{latitude:olat,longitude:olon}}},destination:{location:{latLng:{latitude:dlat,longitude:dlon}}},travelMode:"DRIVE",routingPreference:"TRAFFIC_UNAWARE",computeAlternativeRoutes:false,languageCode:"bs",units:"METRIC"};
  const r=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"content-type":"application/json","X-Goog-Api-Key":env.GOOGLE_SERVER_API_KEY,"X-Goog-FieldMask":"routes.distanceMeters,routes.duration"},body:JSON.stringify(body)});
  const x=await r.json();if(!r.ok||!x.routes?.length)return J({error:x?.error?.message||"Google Routes nije vratio rutu."},502);
  const q=x.routes[0],sec=typeof q.duration==="string"&&q.duration.endsWith("s")?Number(q.duration.slice(0,-1)):null;
  return J({distanceMeters:q.distanceMeters??null,durationSeconds:sec});
}

export default{async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==="/api/health")return J({ok:true,googleSecretConfigured:Boolean(env.GOOGLE_SERVER_API_KEY)});
  if(u.pathname.startsWith("/api/")){
    if(!env.GOOGLE_SERVER_API_KEY)return J({error:"GOOGLE_SERVER_API_KEY secret nije podešen."},500);
    try{
      if(u.pathname==="/api/geocode"&&req.method==="GET")return await geocode(req,env);
      if(u.pathname==="/api/nearby"&&req.method==="POST")return await nearby(req,env);
      if(u.pathname==="/api/route"&&req.method==="POST")return await route(req,env);
      return J({error:"Nepoznata API ruta."},404);
    }catch(e){return J({error:e?.message||"Interna greška."},500)}
  }
  return env.ASSETS.fetch(req);
}};