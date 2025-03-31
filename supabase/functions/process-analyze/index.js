import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { Anthropic } from "npm:@anthropic-ai/sdk";

const supabaseUrl = "https://tfdlwdylqficchvdqaqc.supabase.co";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const claudeApiKey = Deno.env.get("CLAUDE_API_KEY") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const body = await req.json();
    const { unique_id, user_id, beyanname_ids, json_data } = body;

    // Durumu "processing" olarak güncelle
    await supabase
      .from("analysis_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("unique_id", unique_id);

    // user_id ile company_info’dan company_id’yi çek
    const { data: companyData, error: companyError } = await supabase
      .from("company_info")
      .select("id")
      .eq("user_id", user_id)
      .single();

    if (companyError) {
      console.warn("company_info’dan company_id çekilemedi:", companyError.message);
      throw new Error("Şirket bilgisi bulunamadı.");
    }

    const companyId = companyData?.id || null;
    if (!companyId) {
      console.warn("company_id bulunamadı, default prompt kullanılacak.");
    }

    // Şirkete özel prompt’u çek (is_custom: true)
    let systemInstructions, userPrompt, model, maxTokens, usedPrompt;

    if (companyId) {
      const { data: customPromptData, error: customPromptError } = await supabase
        .from("prompts")
        .select("system_instructions, prompt, model, max_tokens")
        .eq("company_id", companyId)
        .eq("is_custom", true)
        .single();

      if (customPromptError && customPromptError.code !== "PGRST116") {
        throw new Error("Custom prompt verisi çekilemedi: " + customPromptError.message);
      }

      if (customPromptData) {
        systemInstructions = customPromptData.system_instructions;
        userPrompt = customPromptData.prompt.text; // jsonb olduğu için .text
        model = customPromptData.model;
        maxTokens = customPromptData.max_tokens;
        usedPrompt = customPromptData.prompt; // Tam jsonb objesini kaydediyoruz
      }
    }

    // Şirkete özel prompt bulunamazsa default prompt’u çek
    if (!systemInstructions) {
      const { data: defaultPromptData, error: defaultPromptError } = await supabase
        .from("prompts")
        .select("system_instructions, prompt, model, max_tokens")
        .eq("company_id", 9999)
        .eq("is_custom", false)
        .single();

      if (defaultPromptError) {
        throw new Error("Default prompt verisi çekilemedi: " + defaultPromptError.message);
      }

      systemInstructions = defaultPromptData.system_instructions;
      userPrompt = defaultPromptData.prompt.text; // jsonb olduğu için .text
      model = defaultPromptData.model;
      maxTokens = defaultPromptData.max_tokens;
      usedPrompt = defaultPromptData.prompt; // Tam jsonb objesini kaydediyoruz
    }

    const anthropic = new Anthropic({ apiKey: claudeApiKey });

    // JSON verisini prompt’a yerleştir
    const finalUserPrompt = userPrompt.replace("{{JSON_DATA}}", JSON.stringify(json_data, null, 2));

    // Claude API isteği
    const claudeResponse = await Promise.race([
      anthropic.messages.create({
        model: model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: systemInstructions,
        messages: [{ role: "user", content: finalUserPrompt }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Claude API isteği zaman aşımına uğradı")), 120000)
      ),
    ]);

    const analysisText = claudeResponse.content[0]?.text?.trim();
    if (!analysisText) throw new Error("Claude API'den yanıt alınamadı");

    // Durumu "completed" olarak güncelle
    await supabase
      .from("analysis_queue")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("unique_id", unique_id);

    // Analiz sonucunu kaydet (yeni sütunlarla birlikte)
    await supabase.from("beyanname_analysis").insert({
      unique_id,
      user_id,
      beyanname_ids,
      analysis_response: analysisText,
      used_prompt: usedPrompt, // Kullanılan prompt (jsonb)
      input_data: json_data,   // Gönderilen input (jsonb)
      pdf_url: null,
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Analiz tamamlandı" }),
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("Error in process-analyze:", error.message);

    if (body?.unique_id) {
      await supabase
        .from("analysis_queue")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("unique_id", body.unique_id);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});