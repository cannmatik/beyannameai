import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

export async function handler(req, res) {
  try {
    // 1) Ortam değişkenlerinden Supabase ve OpenAI anahtarlarını al
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !openAiKey) {
      throw new Error("Environment değişkenleri eksik!");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2) 'pending' kayıtları çek
    const { data: jobs, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    if (!jobs || jobs.length === 0) {
      return res.json({ message: "Sırada iş yok." });
    }

    for (const job of jobs) {
      // a) GPT çağrısı
      const prompt = `
Firmanın mali durumunu incele:
${JSON.stringify(job.payload)}
`;
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // GPT-4 erişimin varsa burayı "gpt-4" yap
          messages: [
            { role: "system", content: "Finansal analiz uzmanısın." },
            { role: "user", content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });
      const openAiData = await openAiRes.json();

      if (!openAiRes.ok) {
        console.error("OpenAI Error:", openAiData);
        // Hata durumunda status=error olarak işaretle
        await supabase
          .from("analysis_queue")
          .update({ status: "error", result: openAiData.error?.message || "OpenAI Hatası" })
          .eq("id", job.id);
        continue; // bir sonraki job'a geç
      }

      const analysisText = openAiData.choices[0].message.content.trim();

      // b) PDF oluşturma (basit örnek)
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      // Burada Montserrat fontunu, Edge Functions'a dahil etmen gerekiyor.
      const fontPath = path.join(Deno.cwd(), "Montserrat-Regular.ttf");
      const fontBytes = fs.readFileSync(fontPath);
      const regularFont = await pdfDoc.embedFont(fontBytes);

      const page = pdfDoc.addPage();
      page.setFont(regularFont);
      page.setFontSize(12);

      let cursorY = page.getSize().height - 50;
      page.drawText("Beyanname Analiz Sonucu", { x: 50, y: cursorY });
      cursorY -= 30;

      const lines = analysisText.split("\n");
      for (const line of lines) {
        page.drawText(line, { x: 50, y: cursorY });
        cursorY -= 15;
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = new Uint8Array(pdfBytes);

      // c) Supabase Storage'a yükle
      const pdfFileName = `analysis_${job.id}_${Date.now()}.pdf`;
      const { data: uploaded, error: uploadError } = await supabase.storage
        .from("analyses")
        .upload(pdfFileName, pdfBuffer, { contentType: "application/pdf" });
      if (uploadError) {
        // Hata olursa job'u error'a düşürebilirsin.
        await supabase
          .from("analysis_queue")
          .update({ status: "error", result: `PDF yükleme hatası: ${uploadError.message}` })
          .eq("id", job.id);
        continue;
      }

      const { data: publicData } = supabase.storage
        .from("analyses")
        .getPublicUrl(pdfFileName);
      const pdfUrl = publicData.publicUrl;

      // d) DB güncelle (status=done)
      await supabase
        .from("analysis_queue")
        .update({
          status: "done",
          result: analysisText,
          pdf_url: pdfUrl,
        })
        .eq("id", job.id);
    }

    return res.json({ message: "Tüm pending kayıtlar işlendi." });
  } catch (err) {
    console.error("Edge Function Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
