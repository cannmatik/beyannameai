import { createClient } from "@supabase/supabase-js";
import { processAnalysisAsync } from "../queue-analyze/route"; // Adjust the path as needed

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
    // Reset the status to pending
    const { error } = await supabase
      .from("analysis_queue")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("unique_id", unique_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the data needed for re-analysis
    const { data: queueData, error: queueError } = await supabase
      .from("analysis_queue")
      .select("user_id, beyanname_ids, json_data")
      .eq("unique_id", unique_id)
      .single();

    if (queueError || !queueData) {
      return new Response(JSON.stringify({ error: queueError?.message || "Kayıt bulunamadı" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Restart the analysis process
    processAnalysisAsync(unique_id, queueData.user_id, queueData.beyanname_ids, queueData.json_data, authHeader).catch(
      (err) => console.error("Asenkron analiz hatası:", err)
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}