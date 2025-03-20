import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = "https://tfdlwdylqficchvdqaqc.supabase.co";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const processAnalyzeUrl = `${supabaseUrl}/functions/v1/process-analyze`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "OPTIONS, POST", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }

  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401 });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const body = await req.json();
    const { unique_id, user_id, beyanname_ids, json_data } = body;
    if (user.id !== user_id) throw new Error("Yetkisiz kullanıcı");

    const { error } = await supabase.from("analysis_queue").insert({
      unique_id,
      user_id,
      beyanname_ids,
      json_data,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Kuyruk ekleme hatası: ${error.message}`);

    fetch(processAnalyzeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(body),
    }).catch((err) => console.error("process-analyze error:", err));

    return new Response(JSON.stringify({ success: true, message: "Kuyruğa eklendi" }), { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
});