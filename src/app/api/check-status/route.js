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

  try {
    const { data: queueData, error: queueError } = await supabase
      .from("analysis_queue")
      .select("status, created_at, updated_at")
      .eq("unique_id", unique_id)
      .single();

    if (queueError || !queueData) {
      return new Response(
        JSON.stringify({ error: queueError?.message || "Kayıt bulunamadı" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let logs = null;
    if (queueData.status === "failed") {
      const { data: logData } = await supabase
        .from("analysis_logs")
        .select("*")
        .eq("unique_id", unique_id)
        .maybeSingle();
      logs = logData || null;
    }

    const processingTime = queueData.status === "processing" 
      ? new Date() - new Date(queueData.updated_at) 
      : 0;
    const isLikelyStuck = processingTime > 300000; // 5 minutes

    return new Response(
      JSON.stringify({
        status: queueData.status,
        completed: queueData.status === "completed",
        processingTime: processingTime > 0 ? Math.floor(processingTime / 1000) : 0,
        isLikelyStuck,
        logs,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}