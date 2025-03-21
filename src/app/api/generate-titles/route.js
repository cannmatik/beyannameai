import { Anthropic } from "@anthropic-ai/sdk";

const claudeApiKey = process.env.CLAUDE_API_KEY || "";

export async function GET(req) {
  const anthropic = new Anthropic({ apiKey: claudeApiKey });

  const systemInstructions = `
Sen bir yaratıcı yazar ve pazarlama uzmanısın. Finansal analiz ve yapay zekâ temalı, 3-10 kelime uzunluğunda, dikkat çekici ve profesyonel başlıklar üretirsin. Her başlık, "Sorgera Beyanname AI" ile ilgili olmalı ve strateji, gelecek, finansal güç gibi temaları vurgulamalı. Türkçe, akıcı ve etkileyici bir dil kullan. Yanıtında sadece başlıkları listele, başka açıklama veya numaralandırma ekleme.
`;

  const userPrompt = `
"Sorgera Beyanname AI" temalı, 3-10 kelime uzunluğunda, 5 farklı başlık üret.  
Örnekler:  
- "Sorgera Beyanname AI ile Geleceği Şekillendirin!"  
- "Finansal Gücünüzü Sorgera AI ile Keşfedin!"  
- "Stratejik Analizler Sorgera ile Hayat Buluyor!"  
Yanıtında yalnızca başlıkları yaz, başka metin ekleme.
`;

  try {
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 200,
      temperature: 0.7,
      system: systemInstructions,
      messages: [{ role: "user", content: userPrompt }],
    });

    const titlesText = claudeResponse.content[0]?.text?.trim();
    if (!titlesText) throw new Error("Claude API'den yanıt alınamadı");

    const titles = titlesText
      .split("\n")
      .map((line) => line.replace(/^-|\d+\.\s/g, "").trim())
      .filter((line) => line.length > 0);

    return new Response(JSON.stringify({ titles }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Başlık üretme hatası:", error.message);
    return new Response(JSON.stringify({ error: "Başlık üretilemedi" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}