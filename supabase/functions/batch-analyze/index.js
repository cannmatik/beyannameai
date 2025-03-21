// supabase/functions/batch-analyze/index.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.1";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  const anthropicApiKey = Deno.env.get("CLAUDE_API_KEY");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { unique_id, json_data, user_id, beyanname_ids } = await req.json();

  async function checkBatchStatus(unique_id, batchIds, totalParts, supabase) {
    try {
      let endedCount = 0;
      const results = [];

      for (const batchId of batchIds) {
        const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
          headers: {
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        const batchStatus = await res.json();

        if (batchStatus.processing_status === "ended") {
          endedCount++;
          const resultsRes = await fetch(batchStatus.results_url, {
            headers: {
              "x-api-key": anthropicApiKey,
              "anthropic-version": "2023-06-01",
            },
          });
          const resultsText = await resultsRes.text();
          const batchResults = resultsText
            .split("\n")
            .filter((line) => line)
            .map((line) => JSON.parse(line));
          results.push(...batchResults);
        } else if (batchStatus.processing_status === "in_progress") {
          // Hala işleniyor
        } else {
          throw new Error(`Batch ${batchId} başarısız: ${batchStatus.processing_status}`);
        }
      }

      await supabase
        .from("analysis_queue")
        .update({ batch_progress: `${endedCount}/${totalParts} processed` })
        .eq("unique_id", unique_id);

      if (endedCount === totalParts) {
        // Her parça için ayrı kayıt ekle
        const analysisRecords = results
          .filter((r) => r.result.type === "succeeded")
          .map((r) => ({
            unique_id: r.custom_id, // Her parça için custom_id
            parent_id: unique_id, // Orijinal beyannameye bağlayan ID
            user_id,
            beyanname_ids: [beyanname_ids[0]], // Tek bir beyannameyi parçalıyoruz
            analysis_response: r.result.message.content[0].text,
            pdf_url: null,
            created_at: new Date().toISOString(),
          }));

        await supabase.from("beyanname_analysis").insert(analysisRecords);

        await supabase
          .from("analysis_queue")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
            batch_progress: `${totalParts}/${totalParts} processed`,
          })
          .eq("unique_id", unique_id);
      } else {
        setTimeout(() => checkBatchStatus(unique_id, batchIds, totalParts, supabase), 60000);
      }
    } catch (error) {
      console.error("checkBatchStatus error:", error.message);
      await supabase
        .from("analysis_queue")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("unique_id", unique_id);
    }
  }

  try {
    // Tek bir beyannameyi parçalara böl (örneğin ilk JSON verisini al)
    const beyannameData = json_data[0]; // Varsayım: Tek beyannameyi parçalıyoruz
    const beyannameString = JSON.stringify(beyannameData);
    const maxTokensPerPart = 50000; // Her parça için 50K token sınırı (örnek)
    const parts = [];
    let currentPart = "";
    let currentTokenCount = 0;

    const prompt = `
      Sen deneyimli bir finansal analist ve vergi danışmanısın. 
      Mali beyanname verilerinin bir parçasını analiz ederek, şirketin finansal durumu hakkında
      profesyonel içgörüler ve stratejik öneriler sunarsın. Analizlerinde açık, anlaşılır bir dil kullan
      ve karmaşık finansal kavramları basitleştir. Vergilendirme konularında güncel mevzuata uygun
      değerlendirmeler yap. Sana verilen veri parçasını analiz et ve sonuçlarını **Markdown** formatında sun.
    `;

    // Beyannameyi parçalara böl
    const tokens = beyannameString.split(" "); // Basit bir token ayırma (gerçekte daha iyi bir tokenizer kullanılabilir)
    for (const token of tokens) {
      const tokenLength = token.length / 4; // Yaklaşık token sayısı
      if (currentTokenCount + tokenLength > maxTokensPerPart && currentPart) {
        parts.push(currentPart);
        currentPart = "";
        currentTokenCount = 0;
      }
      currentPart += token + " ";
      currentTokenCount += tokenLength;
    }
    if (currentPart) parts.push(currentPart.trim());

    const totalParts = parts.length;

    await supabase
      .from("analysis_queue")
      .update({ status: "processing", batch_progress: `0/${totalParts} processed` })
      .eq("unique_id", unique_id);

    const batchIds = [];
    const batchPayload = {
      requests: parts.map((part, index) => ({
        custom_id: `${unique_id}-part-${index}`,
        params: {
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\n${part}`,
            },
          ],
        },
      })),
    };

    const batchRes = await fetch("https://api.anthropic.com/v1/messages/batches", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(batchPayload),
    });

    if (!batchRes.ok) throw new Error(await batchRes.text());

    const batchData = await batchRes.json();
    batchIds.push(batchData.id);

    setTimeout(() => checkBatchStatus(unique_id, batchIds, totalParts, supabase), 60000);

    return new Response(JSON.stringify({ message: "Batch analiz başlatıldı" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Hata:", error.message);
    await supabase
      .from("analysis_queue")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("unique_id", unique_id);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});