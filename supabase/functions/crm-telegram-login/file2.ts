// Accept only fresh, signed Telegram Mini App data. No client-supplied identity is trusted.
export async function validateTelegramData(raw: string, botToken: string, now = Date.now()) {
  if (!raw || raw.length > 12000 || !botToken) throw new Error("invalid Telegram data");
  const params = new URLSearchParams(raw), keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error("duplicate fields");
  const hash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("invalid hash");
  params.delete("hash");
  const enc = new TextEncoder();
  async function hmac(key: BufferSource, value: string) {
    const k = await crypto.subtle.importKey("raw", key, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(value)));
  }
  const secret = await hmac(enc.encode("WebAppData"), botToken);
  const check = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>k+"="+v).join("\n");
  const digest = await hmac(secret, check);
  let mismatch = 0;
  for (let i=0;i<digest.length;i++) mismatch |= digest[i] ^ parseInt(hash.slice(i*2,i*2+2),16);
  if (mismatch) throw new Error("invalid signature");
  const issued = Number(params.get("auth_date")), age = Math.floor(now/1000)-issued;
  if (!Number.isInteger(issued) || issued<=0 || age < -30 || age > 300) throw new Error("expired data");
  const user = JSON.parse(params.get("user") ?? "null");
  if (!user || !Number.isSafeInteger(user.id) || user.id<=0 || user.is_bot===true) throw new Error("invalid user");
  return user;
}

export function createLoginHandler(admin: any, botToken: () => string, origin = "https://platform770uz-dev.github.io") {
  const headers = {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Content-Type":"application/json","Vary":"Origin"};
  const reply = (body: Record<string,unknown>, status=200) => new Response(JSON.stringify(body),{status,headers});
  return async (req: Request) => {
    if (req.headers.get("origin") && req.headers.get("origin")!==origin) return reply({error:"origin_denied"},403);
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers});
    if (req.method!=="POST") return reply({error:"method_not_allowed"},405);
    const token=botToken(); if(!token) return reply({error:"login_not_configured"},503);
    let tg: any;
    try { const raw=await req.text(); if(raw.length>16000) return reply({error:"invalid_request"},400); tg=await validateTelegramData(JSON.parse(raw).initData,token); }
    catch { return reply({error:"telegram_auth_invalid"},401); }
    try {
      const read=()=>admin.from("tg_chatlar").select("auth_user_id,rol,tasdiqlangan,bloklangan").eq("chat_id",tg.id).maybeSingle();
      let row=await read(); if(row.error) return reply({error:"login_not_configured"},503);
      if(!row.data?.tasdiqlangan||row.data.bloklangan||row.data.rol!=="owner") return reply({error:"approval_required"},403);
      let userId=row.data.auth_user_id;
      if(!userId){
        const email="tg"+tg.id+"-"+crypto.randomUUID().replaceAll("-","").slice(0,24)+"@crm.invalid";
        const made=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{crm_telegram_chat_id:String(tg.id)},user_metadata:{full_name:[tg.first_name,tg.last_name].filter(Boolean).join(" ").slice(0,120)}});
        if(made.error||!made.data?.user) return reply({error:"login_unavailable"},503);
        const newId=made.data.user.id;
        const bound=await admin.from("tg_chatlar").update({auth_user_id:newId}).eq("chat_id",tg.id).eq("tasdiqlangan",true).eq("bloklangan",false).eq("rol","owner").is("auth_user_id",null).select("auth_user_id");
        if(bound.error) return reply({error:"login_unavailable"},503);
        if(bound.data?.[0]) userId=bound.data[0].auth_user_id;
        else {
          await admin.auth.admin.deleteUser(newId);
          row=await read(); if(row.error) return reply({error:"login_unavailable"},503);
          if(!row.data?.tasdiqlangan||row.data.bloklangan) return reply({error:"approval_required"},403);
          userId=row.data.auth_user_id;
        }
      }
      if(!userId) return reply({error:"login_unavailable"},503);
      const account=await admin.auth.admin.getUserById(userId), authUser=account.data?.user;
      if(account.error||!authUser?.email||authUser.app_metadata?.crm_telegram_chat_id!==String(tg.id)) return reply({error:"login_unavailable"},503);
      const link=await admin.auth.admin.generateLink({type:"magiclink",email:authUser.email});
      if(link.error||!link.data?.properties?.hashed_token||link.data.user?.id!==userId) return reply({error:"login_unavailable"},503);
      row=await read(); if(row.error) return reply({error:"login_unavailable"},503);
      if(!row.data?.tasdiqlangan||row.data.bloklangan||row.data.rol!=="owner"||row.data.auth_user_id!==userId) return reply({error:"approval_required"},403);
      return reply({token_hash:link.data.properties.hashed_token});
    } catch { return reply({error:"login_unavailable"},503); }
  };
}
