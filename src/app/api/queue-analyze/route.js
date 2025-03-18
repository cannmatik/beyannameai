// app/api/queue-analyze/route.js
import { createClient } from "@supabase/supabase-js";
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function processAnalysisAsync(uniqueId, userId, beyannameIds, jsonData, authToken) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authToken } },
  });

  try {
    const prompt = `
Şirketin mali beyannamesi üzerinden kapsamlı bir **finansal analiz** gerçekleştir. Analizi **Markdown** formatında detaylı ve açıklayıcı bir şekilde oluştur.

- **Başlıkları** '#' ile, **alt başlıkları** '##' ile belirt.
- **Rapor içeriği:**
  - **Genel Değerlendirme:** Şirketin mevcut finansal durumu, büyüme eğilimleri, likidite durumu ve borçluluk oranları.
  - **KDV Matrahı & Tevkifatlı İşlemler:** Vergi yükümlülükleri, KDV matrahı, tevkifat uygulanan işlemler ve bunların finansal tabloya etkileri.
  - **Nakit Akışı & Karlılık:** Şirketin gelir-gider dengesi, kâr marjları, operasyonel kârlılık durumu.
  - **Geleceğe Yönelik Riskler ve Fırsatlar:** Finansal göstergelere göre şirketin karşılaşabileceği riskler ve gelişim fırsatları.
  - **Öneriler:** Finansal iyileştirme için alınabilecek aksiyonlar ve vergi avantajları.

**Eksik veriler için mantıklı tahminlerde bulunarak analizi tamamla.**  
Eğer birden fazla dosya ve ay varsa irketin mevcut ayı önceki aylarla kıyaslayan bir trend analizi de ekle.

İşte analiz edilmesi gereken JSON verileri:

\`\`\`json
${JSON.stringify(jsonData, null, 2)}
\`\`\`
`;

    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const analysisText = claudeResponse.content?.[0]?.text;
    if (!analysisText) throw new Error("Claude API'den geçerli analiz alınamadı.");

    // Kuyruk durumunu güncelle...

    const { error: updateError } = await supabase
      .from("analysis_queue")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("unique_id", uniqueId);
    if (updateError) throw new Error(`Kuyruk güncelleme hatası: ${updateError.message}`);

    // Analizi kaydet
    const { error: insertError } = await supabase
      .from("beyanname_analysis")
      .insert({
        unique_id: uniqueId,
        user_id: userId,
        beyanname_ids: beyannameIds,
        analysis_response: analysisText,
        pdf_url: "",
        created_at: new Date().toISOString(),
      });
    if (insertError) throw new Error(`Analiz ekleme hatası: ${insertError.message}`);
  } catch (error) {
    console.error("Analiz hatası:", error);
    await supabase
      .from("analysis_queue")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("unique_id", uniqueId);
  }
}

export async function POST(req) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { unique_id, user_id, beyanname_ids, json_data } = await req.json();
    if (user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Yetkisiz kullanıcı" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Önce analysis_queue'ya ekle
    const { error: queueError } = await supabase
      .from("analysis_queue")
      .insert({
        unique_id: unique_id,
        user_id: user_id,
        beyanname_ids: beyanname_ids,
        status: "pending",
      });
    if (queueError) throw new Error(`Kuyruk ekleme hatası: ${queueError.message}`);

    // Analizi asenkron olarak başlat (beklemeden)
    processAnalysisAsync(unique_id, user_id, beyanname_ids, json_data, authHeader);

    // Hemen yanıt dön, analiz arka planda devam etsin
    return new Response(
      JSON.stringify({ success: true, message: "Analiz kuyruğa eklendi ve işlem başladı" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}