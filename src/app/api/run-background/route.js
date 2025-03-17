import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Bu ayar, Node.js ortamında PDF oluşturmayı sağlar
export const runtime = "nodejs";

export async function GET() {
  try {
    // 1) Tablodan pending kayıtları al
    const { data: jobs, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("status", "pending");

    if (error) throw new Error(error.message);

    // Hiç pending yoksa
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "Bekleyen iş yok." });
    }

    // Her job için GPT ve PDF yap
    for (const job of jobs) {
      // a) GPT istek
      const prompt = `Beyanname Analizi\n${JSON.stringify(job.payload)}`;
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // GPT-4 varsa "gpt-4"
          messages: [
            { role: "system", content: "Sen finans uzmanısın." },
            { role: "user", content: prompt },
          ],
          max_tokens: 1000,
        }),
      });
      const openAiData = await openAiRes.json();

      if (!openAiRes.ok) {
        // Hata olursa status=error
        await supabase
          .from("analysis_queue")
          .update({
            status: "error",
            result: openAiData.error?.message || "OpenAI Hatası",
          })
          .eq("id", job.id);
        continue;
      }

      const analysisText = openAiData.choices[0].message.content.trim();

      // b) PDF (basit) - PDF yerine istersen MD -> PDF şekilde uzun yazabilirsin
      const pdfBuffer = Buffer.from(analysisText, "utf8");
      const fileName = `analysis_${job.id}_${Date.now()}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from("analyses")
        .upload(fileName, pdfBuffer, { contentType: "application/pdf" });

      if (uploadErr) {
        await supabase
          .from("analysis_queue")
          .update({
            status: "error",
            result: `PDF yükleme hatası: ${uploadErr.message}`,
          })
          .eq("id", job.id);
        continue;
      }

      const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(fileName);
      const pdfUrl = publicData.publicUrl;

      // c) DB güncelle => done
      await supabase
        .from("analysis_queue")
        .update({
          status: "done",
          result: analysisText,
          pdf_url: pdfUrl,
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ message: "Pending işler işlendi." });
  } catch (err) {
    console.error("run-background Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
