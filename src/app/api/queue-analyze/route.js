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
    // Daha detaylı prompt oluşturma
    const prompt = `
Şirketin mali beyannamesi üzerinden kapsamlı bir **finansal analiz** gerçekleştir. Analizi **Markdown** formatında detaylı ve açıklayıcı bir şekilde oluştur.

- **Başlıkları** '#' ile, **alt başlıkları** '##' ile belirt ama ### kullanamazsın en fazla alt başlık olabilir.
- **Rapor içeriği:**
  - **Yönetici Özeti:** Tüm finansal tabloların kısa bir özeti ve temel bulguların vurgulandığı genel değerlendirme.
  - **Finansal Durum Analizi:** 
    - Bilanço analizi (varlık ve yükümlülük yapısı)
    - Sermaye yapısı ve öz kaynak değerlendirmesi
    - Likidite oranları (Cari oran, asit-test oranı)
    - Borçluluk oranları (Borç/Özkaynak, Finansal kaldıraç)
  - **KDV Matrahı & Tevkifatlı İşlemler:** 
    - Vergi yükümlülükleri detayları
    - KDV matrahı ve hesaplama yöntemi
    - Tevkifat uygulanan işlemlerin detaylı analizi
    - KDV İade durumu ve önerileri
  - **Nakit Akışı & Karlılık:** 
    - Gelir-gider dengesi ve net nakit akışı
    - Brüt kâr, faaliyet kârı ve net kâr marjları
    - FAVÖK analizi ve karşılaştırmalı değerlendirme
    - Dönemsel nakit akışı değişimleri
  - **Oran Analizleri:**
    - Faaliyet oranları (Alacak devir hızı, stok devir hızı)
    - Karlılık oranları (ROA, ROE, Net kar marjı)
    - Verimlilik oranları
  - **Trend Analizi:** Son 3 dönem karşılaştırması ve büyüme/küçülme oranları
  - **Sektörel Karşılaştırma:** Şirketin sektör ortalamaları ile karşılaştırılması
  - **Geleceğe Yönelik Riskler ve Fırsatlar:** 
    - Mevcut finansal yapının sürdürülebilirliği
    - Potansiyel risk faktörleri ve etki analizi
    - Büyüme potansiyeli ve fırsat alanları
  - **Öneriler:** 
    - Finansal yapının iyileştirilmesi için stratejik öneriler
    - Vergi optimizasyonu ve avantajları için tavsiyeler
    - Maliyet kontrolü ve verimlilik artırma yöntemleri
    - Nakit akışı yönetimi için öneriler

**Eksik veriler için mantıklı tahminlerde bulunarak analizi tamamla ve varsa anomali tespit edilen alanlara özel vurgu yap.**  
Eğer birden fazla dönem verisi varsa, şirketin finansal performansını karşılaştırmalı trend analizi ile değerlendir ve görselleştirmeler için kullanılabilecek veri noktalarını belirt.

İşte analiz edilmesi gereken JSON verileri:

\`\`\`json
${JSON.stringify(jsonData, null, 2)}
\`\`\`
`;

    // Daha gelişmiş model ve daha yüksek token limiti kullanma
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219", // Daha gelişmiş model
      max_tokens: 12000, // Daha uzun çıktı
      temperature: 0.2, // Daha tutarlı sonuçlar için
      messages: [{ role: "user", content: prompt }],
      system: "Sen deneyimli bir finansal analist ve vergi danışmanısın. Mali beyanname verilerini derinlemesine analiz ederek, şirketlerin finansal durumları hakkında profesyonel içgörüler ve stratejik öneriler sunarsın. Analizlerinde açık, anlaşılır bir dil kullan ve karmaşık finansal kavramları basitleştir. Vergilendirme konularında güncel mevzuata uygun değerlendirmeler yap."
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