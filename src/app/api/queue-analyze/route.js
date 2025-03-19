import { createClient } from "@supabase/supabase-js";
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function processAnalysisAsync(uniqueId, userId, beyannameIds, jsonData, authHeader) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    // İlk olarak status'u "processing" olarak güncelle
    await supabase
      .from("analysis_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("unique_id", uniqueId);

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
Başlıkları '#' ile, alt başlıkları '##' ile belirt .
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
${JSON.stringify(jsonData, null, 2)}
\`\`\`

Raporu mümkün olduğunca detaylı ve profesyonel bir şekilde hazırla. Her bölümde ilgili verilere dayanarak yorumlar ve öneriler sun.
Tablo oluşturmaktan kaçın çıktı pdf olacak ona göre sadece metin yaz 
    `;

    // Claude API isteği için timeout ekleme
    const claudeResponse = await Promise.race([
      anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 8192,
        temperature: 0.2,
        system: systemInstructions,
        messages: [{ role: "user", content: userPrompt }],
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Claude API isteği zaman aşımına uğradı")), 120000)
      )
    ]);

    const analysisText = claudeResponse.content[0]?.text?.trim();
    if (!analysisText) {
      throw new Error("Claude API'den geçerli analiz alınamadı veya yanıt boş.");
    }

    // Başarılı tamamlanma durumunda kuyruk durumunu güncelle
    const { error: queueErr } = await supabase
      .from("analysis_queue")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("unique_id", uniqueId);
    if (queueErr) throw new Error(`Kuyruk güncelleme hatası: ${queueErr.message}`);

    // Analizi kaydet
    const { error: insertErr } = await supabase
      .from("beyanname_analysis")
      .insert({
        unique_id: uniqueId,
        user_id: userId,
        beyanname_ids: beyannameIds,
        analysis_response: analysisText,
        pdf_url: "",
        created_at: new Date().toISOString(),
      });
    if (insertErr) throw new Error(`Analiz ekleme hatası: ${insertErr.message}`);
  } catch (error) {
    console.error("Analiz hatası:", error);

    // Hata durumunda hem kuyruk durumunu güncelle hem de log ekle
    await supabase
      .from("analysis_queue")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("unique_id", uniqueId);

    await supabase
      .from("analysis_logs")
      .insert({
        unique_id: uniqueId,
        error_message: error.message,
        stack: error.stack,
        created_at: new Date().toISOString(),
      });

    throw error;
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

    // Kuyruğa eklerken created_at ve updated_at ekle
    const { error: queueError } = await supabase
      .from("analysis_queue")
      .insert({
        unique_id,
        user_id,
        beyanname_ids,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        json_data: json_data // JSON verisini de saklayalım ki retry için kullanılabilsin
      });
    if (queueError) throw new Error(`Kuyruk ekleme hatası: ${queueError.message}`);

    processAnalysisAsync(unique_id, user_id, beyanname_ids, json_data, authHeader).catch(
      (err) => console.error("Asenkron analiz hatası:", err)
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Analiz kuyruğa eklendi ve işlem başladı",
        unique_id: unique_id
      }),
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