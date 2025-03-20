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

    const anthropic = new Anthropic({ apiKey: claudeApiKey });
    const systemInstructions = `
Sen deneyimli bir finansal analist ve vergi danışmanısın. 
Mali beyanname verilerini derinlemesine analiz ederek, şirketlerin finansal durumları hakkında
profesyonel içgörüler ve stratejik öneriler sunarsın. Analizlerinde açık, anlaşılır bir dil kullan
ve karmaşık finansal kavramları basitleştir. Vergilendirme konularında güncel mevzuata uygun
değerlendirmeler yap.
`;

    const userPrompt = `
Şirketin mali beyannamesi üzerinden kapsamlı bir **finansal analiz raporu** oluştur. 
Raporu **Markdown** formatında, aşağıdaki yapıya uygun şekilde detaylı ve açıklayıcı bir şekilde hazırla. 
Başlıkları '#' ile, alt başlıkları '##' ile belirt.
Aşağıdaki JSON verilerini analiz et ve raporu şu bölümlerle yapılandır:

1. **Şirket Bilgileri:** Şirket adı, vergi numarası, iletişim bilgileri, dönem gibi temel bilgileri içer.
2. **Finansal Özet:** Toplam işlem tutarı, toplam damga vergisi, ortalama vergi oranı gibi özet bilgiler.
3. **İşlem Analizi:** İşlem sayısı, belge türü dağılımı gibi detaylı analizler.
4. **Önemli İşlemler:** En yüksek tutarlı işlemler ve damga vergisi ödemeleri.
5. **Sektörel Dağılım:** İşlemlerin sektörlere göre dağılımı (örneğin, teknoloji, gayrimenkul vb.).
6. **Risk ve Öneriler:** Vergi optimizasyonu, işlem yoğunluğu ve sektörel çeşitlendirme önerileri.
7. **Yasal Uyumluluk:** Mevzuata uygunluk değerlendirmesi.
8. **Sonuç ve Değerlendirme:** Genel bir özet ve stratejik değerlendirme.
0. **Sonraki Ayın Projeksiyonu:** Eğer farklı tarihlere sahip birden fazla belge yüklenmişse bunları inceleyip sonraki aylar için muhtemel senaryolar ve neye ağırlık verilmesi gerektiğini içerir.

JSON verisi:
\`\`\`json
${JSON.stringify(json_data, null, 2)}
\`\`\`

Raporu mümkün olduğunca detaylı ve profesyonel bir şekilde hazırla. Her bölümde ilgili verilere dayanarak yorumlar ve öneriler sun.
Tablo oluşturmaktan kaçın, çıktı PDF olacak ona göre sadece metin yaz.
`;

    // Claude API isteği için timeout ekleme
    const claudeResponse = await Promise.race([
      anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219", // Güncel model
        max_tokens: 8192, // Daha uzun ve detaylı raporlar için artırdım
        temperature: 0.2, // Profesyonel ve tutarlı yanıtlar için düşük sıcaklık
        system: systemInstructions,
        messages: [{ role: "user", content: userPrompt }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Claude API isteği zaman aşımına uğradı")), 120000) // 2 dakika timeout
      ),
    ]);

    const analysisText = claudeResponse.content[0]?.text?.trim();
    if (!analysisText) throw new Error("Claude API'den yanıt alınamadı");

    // Durumu "completed" olarak güncelle
    await supabase
      .from("analysis_queue")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("unique_id", unique_id);

    // Analiz sonucunu kaydet
    await supabase.from("beyanname_analysis").insert({
      unique_id,
      user_id,
      beyanname_ids,
      analysis_response: analysisText,
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

    // Hata durumunda "failed" olarak güncelle
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