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
Sen, finansal analiz ve vergi danışmanlığı alanında uzun yıllara dayanan deneyime sahip, uzman bir profesyonelsin. Mali beyanname verilerini (farklı türlerde ve karışık yapıda olabilir) en ince ayrıntısına kadar analiz eder, şirketlerin finansal sağlıklarını, performanslarını ve vergi yükümlülüklerini değerlendirirsin. Analizlerin, yalnızca sayısal verilere dayanmakla kalmaz, aynı zamanda stratejik içgörüler ve uygulanabilir öneriler sunar. Finansal kavramları sade, anlaşılır bir dille ifade eder ve Türkiye’nin güncel vergi mevzuatına tam uyum sağlarsın. Şirketlerin vergi optimizasyonu için yaratıcı çözümler önerirsin.

Raporlarını, profesyonel bir üslupla ve yapılandırılmış bir şekilde, **Markdown** formatında hazırlarsın. Ana başlıklar için '#', alt başlıklar için '##' ve '###', maddeler için '-' kullanırsın. Metin tabanlı açıklamalar ve listeler kullanarak, tablolardan tamamen kaçınırsın (çünkü rapor PDF’e çevrilecek). Analizlerin, şirketin karar vericilerine rehber olacak kadar detaylı ve kapsamlıdır.
`;

    const userPrompt = `
Aşağıdaki JSON formatındaki mali beyanname verilerini analiz ederek, şirketin finansal durumu hakkında **son derece kapsamlı ve detaylı bir Finansal Analiz Raporu** oluştur. JSON verisi, tek bir beyanname türünden veya birden fazla farklı beyanname türünden (örneğin, damga vergisi, KDV, gelir vergisi, kurumlar vergisi vb.) oluşabilir ve karışık bir yapıda olabilir. Raporu **Markdown** formatında hazırla; ana başlıklar için '#', alt başlıklar için '##' ve '###', maddeler için '-' formatını kullan. Tablo kullanmaktan kaçın; bunun yerine metin tabanlı açıklamalar ve listeler kullan, çünkü rapor PDF formatında sunulacak.

Raporu şu bölümlerle yapılandır ve her birinde verilere dayalı derinlemesine yorumlar, içgörüler ve stratejik öneriler sun. Verinin yapısına göre esnek bir şekilde analiz yap; yalnızca damga vergisine odaklanmak zorunda değilsin, tüm beyanname türlerini ve ilgili vergi yüklerini dikkate al:

# Şirket Bilgileri
- Şirketin tam unvanı (yasal adı, veriden çıkarılabilirse)
- Vergi kimlik numarası (varsa)
- Kayıtlı adres (il, ilçe, açık adres; veriden çıkarılabilirse)
- İletişim bilgileri (telefon numarası, e-posta adresi; veriden çıkarılabilirse)
- Analizin kapsadığı dönem (örneğin, 2023 Q1, tam yıl veya birden fazla dönem)
- Şirketin faaliyet gösterdiği ana sektör veya sektörler (veriden tahmin edilerek)

# Finansal Özet
- Toplam gelir (dönem bazında, tüm beyanname türlerinden elde edilen gelirler)
- Toplam gider (kategorilere göre özet; örneğin, personel giderleri, operasyonel giderler)
- Net kar veya zarar (tüm beyanname verileri dikkate alınarak)
- Toplam işlem tutarı (beyannamelerdeki tüm işlemlerin toplamı)
- Toplam vergi yükü (damga vergisi, KDV, gelir vergisi vb. tüm vergi türleri ayrı ayrı ve toplamda)
- Ortalama vergi oranı (toplam vergi / toplam işlem tutarı; her vergi türü için ayrı ayrı hesaplanabilir)
- Diğer dikkat çeken finansal metrikler (örneğin, işlem başına ortalama tutar, gider/gelir oranı)

# İşlem Analizi
## İşlem Sayıları ve Türleri
- Toplam işlem sayısı (tüm beyanname türleri dahil)
- Belge türlerine göre dağılım (örneğin, faturalar, makbuzlar, sözleşmeler, beyanname türleri)
- Farklı beyanname türlerinin işlem sayısına etkisi (örneğin, KDV beyannameleri daha yoğun mu?)
## İşlem Hacmi Dağılımı
- İşlem hacminin aylık, çeyreklik veya beyanname türüne göre dağılımı
- İşlem yoğunluğunda dikkat çeken patternler veya anormallikler (örneğin, belirli bir vergi döneminde ani artış)
- Ortalama işlem tutarı ve istatistiksel bilgiler (standart sapma gibi)

# Önemli İşlemler
- En yüksek tutarlı 5 işlem için (tüm beyanname türlerinden):
  - İşlem tarihi
  - İşlem açıklaması (kısa ve net; beyanname türüyle ilişkilendirilerek)
  - İşlem tutarı
  - Ödenen vergi miktarı (ilgili vergi türü belirtilerek)
- Bu işlemlerin şirketin finansal durumu üzerindeki etkisi
- Önemli işlemlerin stratejik açıdan değerlendirilmesi (örneğin, büyük bir KDV iadesi mi, yüksek bir kurumlar vergisi mi?)

# Sektörel Dağılım
- İşlemlerin sektörlere göre dağılımı (veriden tahmin edilerek; örneğin, teknoloji, inşaat)
- Her bir sektördeki işlem hacmi ve vergi yükü (farklı vergi türleri dikkate alınarak)
- Şirketin sektörel çeşitlendirme durumu hakkında yorumlar
- Sektörel riskler veya fırsatlar üzerine değerlendirme

# Risk ve Öneriler
## Potansiyel Riskler
- Yüksek vergi yükü (her vergi türü için ayrı ayrı analiz)
- Belirli sektörlere veya beyanname türlerine aşırı bağımlılık
- İşlem yoğunluğunda dengesizlik veya mevzuata uyumsuzluk riskleri
## Stratejik Öneriler
- Vergi optimizasyonu için öneriler (her vergi türü için spesifik; örneğin, KDV iadeleri, muafiyetler)
- Operasyonel iyileştirmeler için tavsiyeler
- Finansal riskleri azaltmaya yönelik kısa ve uzun vadeli öneriler

# Yasal Uyumluluk
- Şirketin beyanname verilerinin Türkiye’nin güncel vergi mevzuatına uygunluğu (her beyanname türü için)
- Potansiyel uyumsuzluklar veya dikkat edilmesi gereken alanlar
- Uyumluluğu artırmak için önerilen düzeltici eylemler
- Vergi denetimlerinde öne çıkabilecek riskli noktalar

# Sonuç ve Değerlendirme
- Analizin temel bulgularının özeti (tüm beyanname türleri dikkate alınarak)
- Şirketin finansal sağlığı ve operasyonel performansı hakkında genel değerlendirme
- Karar vericiler için actionable insights
- Şirketin kısa ve uzun vadeli stratejik konumu

# Sonraki Dönem Projeksiyonu
## Geçmiş Trendler
- Farklı dönemlere ait veriler varsa trend analizi (örneğin, KDV’de artış, gelir vergisinde düşüş)
- Tek dönemlik veri varsa genel bir değerlendirme
## Gelecek Senaryolar
- Gelecek dönem için olası finansal senaryolar (iyimser, kötümser, gerçekçi)
- Stratejik odaklanılması gereken alanlar (örneğin, vergi planlaması, gider kontrolü)

JSON verisi:
\`\`\`json
${JSON.stringify(json_data, null, 2)}
\`\`\`

Raporu mümkün olduğunca detaylı, profesyonel ve rehber bir şekilde hazırla. Verinin karışık yapısına uyum sağlayarak, tüm beyanname türlerini ve vergi yüklerini analiz et. Her bölümde, verilere dayalı yorumlar yap, şirketin güçlü ve zayıf yönlerini vurgula ve uygulanabilir öneriler sun. Markdown formatını tutarlı bir şekilde kullan (ana başlıklar '#', alt başlıklar '##' ve '###', maddeler '-'), metni PDF çıktısına uygun hale getir ve görsel hiyerarşiyi destekle.
`;

    // Claude API isteği için timeout ekleme
    const claudeResponse = await Promise.race([
      anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 20192,
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