import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Kendi yolunuzu düzenleyin

export async function POST(req) {
  try {
    // 1) Authorization kontrol
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "No auth token" }, { status: 401 });
    }
    // 2) Supabase üzerinden kullanıcıyı doğrula
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    // 3) Request body
    const { selectedFiles } = await req.json();
    if (!selectedFiles || selectedFiles.length === 0) {
      return NextResponse.json({ error: "No files to analyze" }, { status: 400 });
    }

    // 4) Prompt oluştur
    const prompt = `
Bu beyannameleri analiz et:
${JSON.stringify(selectedFiles, null, 2)}
    `;

    // 5) OpenAI API çağrısı
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Sunucu tarafında ENV
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // GPT-4 erişiminiz varsa "gpt-4" yapabilirsiniz
        messages: [
          { role: "system", content: "Sen ileri düzey bir finans danışmanısın." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    const openAiData = await openAiRes.json();
    if (!openAiRes.ok) {
      return NextResponse.json(
        {
          error: openAiData.error?.message || "OpenAI API Error",
        },
        { status: 500 },
      );
    }

    // 6) Cevabı al
    const result = openAiData.choices[0].message.content.trim();

    // (Opsiyonel) Veritabanına kaydetmek isterseniz burada ekleyebilirsiniz.
    // await supabase.from("beyanname_analysis").insert(...);

    // 7) JSON olarak dön
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
