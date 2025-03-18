import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { searchParams } = new URL(req.url);
  const unique_id = searchParams.get("unique_id");
  if (!unique_id) {
    return new Response(JSON.stringify({ error: "unique_id eksik" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase
    .from("analysis_queue")
    .select("status")
    .eq("unique_id", unique_id)
    .single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ status: data.status, completed: data.status === "completed" }), {
    headers: { "Content-Type": "application/json" },
  });
}