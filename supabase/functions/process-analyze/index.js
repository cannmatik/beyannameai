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
Sen, finansal analiz ve vergi danışmanlığı alanında uzun yıllara dayanan deneyime sahip, uzman bir profesyonelsin. Mali beyanname verilerini en ince ayrıntısına kadar analiz eder, şirketlerin finansal sağlıklarını, performanslarını ve vergi yükümlülüklerini değerlendirirsin. Analizlerin, yalnızca sayısal verilere dayanmakla kalmaz, aynı zamanda stratejik içgörüler ve uygulanabilir öneriler sunar. Finansal kavramları karmaşık olmaktan çıkarıp sade, anlaşılır bir dille ifade edersin. Vergilendirme değerlendirmelerinde, Türkiye’nin güncel vergi mevzuatına tam uyum sağlar ve şirketlerin vergi optimizasyonu için yaratıcı çözümler önerirsin.

Raporlarını, profesyonel bir üslupla ve yapılandırılmış bir şekilde, **Markdown** formatında hazırlarsın. Ana başlıklar için '#', alt başlıklar için '##' ve '###', maddeler için '-' kullanırsın. Metin tabanlı açıklamalar ve listeler kullanarak, tablolardan tamamen kaçınırsın (çünkü rapor PDF’e çevrilecek). Analizlerin, şirketin karar vericilerine rehber olacak kadar detaylı, aynı zamanda net ve öz olacak şekilde dengelenmiştir.
`;

    const userPrompt = `
Aşağıdaki JSON formatındaki mali beyanname verilerini analiz ederek, şirketin finansal durumu hakkında kapsamlı bir **Finansal Analiz Raporu** oluştur. Raporu **Markdown** formatında hazırla ve aşağıdaki bölümleri detaylı, açıklayıcı ve profesyonel bir şekilde ele al. Ana başlıklar için '#', alt başlıklar için '##' ve '###', maddeler için '-' formatını kullan. Tablo kullanmaktan kaçın; bunun yerine metin tabanlı açıklamalar ve listeler kullan, çünkü rapor PDF formatında sunulacak.

Raporu şu bölümlerle yapılandır ve her birinde verilere dayalı derinlemesine yorumlar, içgörüler ve stratejik öneriler sun:

# Şirket Bilgileri
- Şirketin tam unvanı (yasal adı)
- Vergi kimlik numarası
- Kayıtlı adres (il, ilçe, açık adres)
- İletişim bilgileri (telefon numarası, e-posta adresi)
- Analizin kapsadığı dönem (örneğin, 2023 Q1 veya Ocak-Mart 2023)
- Şirketin faaliyet gösterdiği ana sektör veya sektörler

# Finansal Özet
- Toplam gelir (dönem bazında)
- Toplam gider (kategorilere göre kısa bir özetle)
- Net kar veya zarar
- Toplam işlem tutarı (beyannamedeki tüm işlemlerin toplamı)
- Toplam damga vergisi miktarı
- Ortalama vergi oranı (damga vergisi / toplam işlem tutarı)
- Diğer dikkat çeken finansal metrikler (örneğin, işlem başına ortalama tutar)

# İşlem Analizi
## İşlem Sayıları ve Türleri
- Toplam işlem sayısı
- Belge türlerine göre dağılım (örneğin, faturalar, makbuzlar, sözleşmeler)
## İşlem Hacmi Dağılımı
- İşlem hacminin aylık veya çeyreklik dağılımı (örneğin, Ocak’ta X TL, Şubat’ta Y TL)
- İşlem yoğunluğunda dikkat çeken patternler veya anormallikler (örneğin, belirli bir ayda ani artış)
- Ortalama işlem tutarı ve standart sapma gibi istatistiksel bilgiler

# Önemli İşlemler
- En yüksek tutarlı 5 işlem için:
  - İşlem tarihi
  - İşlem açıklaması (kısa ve net)
  - İşlem tutarı
  - Ödenen damga vergisi
- Bu işlemlerin şirketin finansal durumu üzerindeki etkisi
- Önemli işlemlerin stratejik açıdan değerlendirilmesi

# Sektörel Dağılım
- İşlemlerin sektörlere göre dağılımı (örneğin, teknoloji %40, gayrimenkul %30, diğer %30)
- Her bir sektördeki işlem hacmi ve vergi yükü
- Şirketin sektörel çeşitlendirme durumu hakkında yorumlar
- Sektörel riskler veya fırsatlar üzerine kısa bir değerlendirme

# Risk ve Öneriler
## Potansiyel Riskler
- Yüksek vergi yükü
- Belirli sektörlere veya işlem türlerine aşırı bağımlılık
- İşlem yoğunluğunda dengesizlik
## Stratejik Öneriler
- Vergi optimizasyonu için öneriler (örneğin, muafiyetlerden yararlanma yolları)
- Operasyonel iyileştirmeler için stratejik tavsiyeler
- Finansal riskleri azaltmaya yönelik kısa ve uzun vadeli öneriler

# Yasal Uyumluluk
- Şirketin beyanname verilerinin güncel vergi mevzuatına uygunluğu
- Potansiyel uyumsuzluklar veya dikkat edilmesi gereken alanlar
- Uyumluluğu artırmak için önerilen düzeltici eylemler
- Vergi denetimlerinde öne çıkabilecek riskli noktalar

# Sonuç ve Değerlendirme
- Analizin temel bulgularının özeti
- Şirketin finansal sağlığı ve operasyonel performansı hakkında genel bir değerlendirme
- Karar vericiler için actionable insights (örneğin, hangi alanlara yatırım yapılmalı)
- Şirketin kısa vadeli ve uzun vadeli stratejik konumu

# Sonraki Ayın Projeksiyonu
## Geçmiş Trendler
- Eğer JSON verisinde farklı dönemlere ait belgeler varsa geçmiş trendlerin analizi (örneğin, işlem hacminde artış/azalış)
- Tek dönemlik veri varsa genel bir değerlendirme
## Gelecek Senaryolar
- Gelecek ay için olası finansal senaryolar (iyimser, kötümser, gerçekçi)
- Stratejik odaklanılması gereken alanlar (örneğin, gider kontrolü, yeni sektörlere açılım)

JSON verisi:
\`\`\`json
${JSON.stringify(json_data, null, 2)}
\`\`\`

Raporu mümkün olduğunca detaylı, profesyonel ve rehber bir şekilde hazırla. Her bölümde, verilere dayalı yorumlar yap, şirketin güçlü ve zayıf yönlerini vurgula ve uygulanabilir öneriler sun. Markdown formatını tutarlı bir şekilde kullan (ana başlıklar '#', alt başlıklar '##' ve '###', maddeler '-'), metni PDF çıktısına uygun hale getir ve görsel hiyerarşiyi destekle.
`;

    // Claude API isteği için timeout ekleme
    const claudeResponse = await Promise.race([
      anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 10192, // Daha uzun raporlar için yeterli
        temperature: 0.2,
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