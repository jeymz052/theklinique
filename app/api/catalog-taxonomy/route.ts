import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

function adminClient() { if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured."); return createClient(url, serviceKey, { auth: { persistSession: false } }); }
async function requestUser(request: Request) { const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,""); if(!token||!url||!anonKey)return null; const client=createClient(url,anonKey,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}}); const {data,error}=await client.auth.getUser(); return error?null:data.user; }
async function canManage(user: User) { const email=(user.email||"").toLowerCase(); if(["thekliniqueph@gmail.com","estebanjames67@gmail.com"].includes(email))return true; if(["doctor","superadmin"].includes(String(user.app_metadata?.role||"")))return true; const {data}=await adminClient().from("profiles").select("role").eq("id",user.id).maybeSingle(); return data?.role==="doctor"||data?.role==="superadmin"; }
async function authorize(request: Request) { const user=await requestUser(request); return user&&await canManage(user)?user:null; }
function slugify(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

function tableFor(scope:string,level:string){
  if(scope==="service"&&level==="category")return "service_categories";
  if(scope==="service"&&level==="subcategory")return "service_subcategories";
  if(scope==="package"&&level==="category")return "package_categories";
  if(scope==="package"&&level==="subcategory")return "package_subcategories";
  return null;
}

export async function POST(request:Request){
  if(!await authorize(request))return NextResponse.json({error:"Doctor or superadmin access is required."},{status:403});
  try{
    const body=await request.json(); const scope=String(body.scope||""); const level=String(body.level||""); const table=tableFor(scope,level); const name=String(body.name||"").trim(); const slug=slugify(name); const parentId=String(body.parentId||"");
    if(!table||!name||!slug||(level==="subcategory"&&!UUID.test(parentId)))return NextResponse.json({error:"Enter a valid name and choose its parent category."},{status:400});
    const db=adminClient(); const {data:last}=await db.from(table).select("sort_order").order("sort_order",{ascending:false}).limit(1).maybeSingle();
    const values:Record<string,unknown>={name,slug,sort_order:Number(last?.sort_order||0)+1}; if(level==="subcategory")values.category_id=parentId;
    const select=level==="subcategory"?"id, category_id, name, slug, sort_order":"id, name, slug, sort_order";
    const {data,error}=await db.from(table).insert(values).select(select).single();
    if(error?.code==="23505")return NextResponse.json({error:"That category or subcategory already exists."},{status:409}); if(error)throw error;
    return NextResponse.json({item:data},{status:201});
  }catch(error){console.error("Unable to add catalog taxonomy:",error);return NextResponse.json({error:"Unable to add the category or subcategory."},{status:500});}
}

export async function PATCH(request:Request){
  if(!await authorize(request))return NextResponse.json({error:"Doctor or superadmin access is required."},{status:403});
  try{
    const body=await request.json(); const scope=String(body.scope||""); const level=String(body.level||""); const table=tableFor(scope,level); const id=String(body.id||""); const name=String(body.name||"").trim(); const slug=slugify(name); const color=String(body.calendarColor||"");
    if(!table||!UUID.test(id)||!name||!slug)return NextResponse.json({error:"Enter a valid category or subcategory name."},{status:400});
    if(color && (scope!=="service" || level!=="category" || !COLOR.test(color)))return NextResponse.json({error:"Choose a valid calendar color."},{status:400});
    const db=adminClient(); const select=level==="subcategory"?"id, category_id, name, slug, sort_order":scope==="service"?"id, name, slug, sort_order, calendar_color":"id, name, slug, sort_order"; const {data:currentData,error:readError}=await db.from(table).select(select).eq("id",id).single(); if(readError)throw readError; const current=currentData as unknown as {name:string;category_id?:string};
    const changes:Record<string,string>={name,slug}; if(color)changes.calendar_color=color;
    const {data,error}=await db.from(table).update(changes).eq("id",id).select(select).single(); if(error?.code==="23505")return NextResponse.json({error:"That name is already in use."},{status:409}); if(error)throw error;
    if(scope==="package"&&level==="category")await db.from("products").update({category:name}).eq("category",current.name);
    if(scope==="service"&&level==="subcategory")await db.from("services").update({subcategory:name}).eq("category_id",current.category_id).eq("subcategory",current.name);
    if(scope==="package"&&level==="subcategory"){const {data:parent}=await db.from("package_categories").select("name").eq("id",current.category_id).single(); if(parent)await db.from("products").update({subcategory:name}).eq("category",parent.name).eq("subcategory",current.name);}
    return NextResponse.json({item:data});
  }catch(error){console.error("Unable to update catalog taxonomy:",error);return NextResponse.json({error:"Unable to update the category or subcategory."},{status:500});}
}

export async function DELETE(request:Request){
  if(!await authorize(request))return NextResponse.json({error:"Doctor or superadmin access is required."},{status:403});
  try{
    const body=await request.json(); const scope=String(body.scope||""); const level=String(body.level||""); const table=tableFor(scope,level); const id=String(body.id||""); if(!table||!UUID.test(id))return NextResponse.json({error:"Choose a valid category or subcategory."},{status:400});
    const db=adminClient(); const select=level==="subcategory"?"id, category_id, name":"id, name"; const {data:itemData,error:readError}=await db.from(table).select(select).eq("id",id).single(); if(readError)throw readError; const item=itemData as unknown as {name:string;category_id?:string};
    let used=0;
    if(scope==="service"&&level==="category"){const {count}=await db.from("services").select("id",{count:"exact",head:true}).eq("category_id",id);used=count||0;}
    if(scope==="service"&&level==="subcategory"){const {count}=await db.from("services").select("id",{count:"exact",head:true}).eq("category_id",item.category_id).eq("subcategory",item.name);used=count||0;}
    if(scope==="package"&&level==="category"){const {count}=await db.from("products").select("id",{count:"exact",head:true}).eq("category",item.name);used=count||0;}
    if(scope==="package"&&level==="subcategory"){const {data:parent}=await db.from("package_categories").select("name").eq("id",item.category_id).single(); if(parent){const {count}=await db.from("products").select("id",{count:"exact",head:true}).eq("category",parent.name).eq("subcategory",item.name);used=count||0;}}
    if(used)return NextResponse.json({error:`This ${level} is used by ${used} catalog item${used===1?"":"s"}. Reassign or remove those items first.`},{status:409});
    const {error}=await db.from(table).delete().eq("id",id); if(error)throw error; return NextResponse.json({removed:true});
  }catch(error){console.error("Unable to delete catalog taxonomy:",error);return NextResponse.json({error:"Unable to delete the category or subcategory."},{status:500});}
}
