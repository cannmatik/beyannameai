import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export async function POST(req) {
  try {
    // 1) Auth Token
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorized (no token)" }, { status: 401 });
    }

    // 2) Kullanıcı doğrula
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    // 3) queue_id param
    const url = new URL(req.url);
    const queueId = url.searchParams.get("queue_id");
    if (!queueId) {
      return NextResponse.json({ error: "Missing queue_id" }, { status: 400 });
    }

    // 4) Kayıt bul (pending veya error olabilir)
    const { data: queueItem, error: itemErr } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();

    if (itemErr || !queueItem) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // SADECE pending veya error ise yeniden deneyeceğiz
    if (queueItem.status !== "pending" && queueItem.status !== "error") {
      return NextResponse.json(
        { error: "Record is not pending or error, cannot pull again." },
        { status: 400 },
      );
    }

    // 5) GPT'ye göndereceğimiz Prompt => Daha uzun & zengin analiz istiyoruz
    const prompt = `
[BEYANNAME AI By Can Matik - Detaylı Finansal Analiz]

Aşağıdaki beyanname verilerine göre çok kapsamlı bir analiz hazırla. 
Lütfen markdown başlıkları (##, ### vb.) ve madde işaretleri kullan. 
Riskler, fırsatlar, gelecek öngörüleri, tavsiyeler, şirketin nakit akışı ve vergi yükü konularına özellikle değin. 
Analiz uzun ve detaylı olsun, mümkünse birkaç paragraf içersin.

Beyanname Verileri:
${JSON.stringify(queueItem.payload, null, 2)}

Unutma, başlığa "BEYANNAME AI By Can Matik" ekle.
    `;

    // 6) ChatGPT isteği
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // YENİ KEY'İNİZLE DEĞİŞTİRİN:
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // GPT-4 varsa burada "gpt-4" diyebilirsiniz
        messages: [
          {
            role: "system",
            content: "Sen ileri düzey bir finans uzmanısın. Detaylı, uzun analizler üret.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 3000,
        temperature: 0.7,
      }),
    });

    const openAiData = await openAiRes.json();
    if (!openAiRes.ok) {
      // Hata => queue'u error yap
      await supabase
        .from("analysis_queue")
        .update({
          status: "error",
          result: openAiData.error?.message || "OpenAI error",
        })
        .eq("id", queueId);

      return NextResponse.json(
        { error: openAiData.error?.message || "OpenAI API Error" },
        { status: 500 },
      );
    }

    const gptAnswer = openAiData.choices[0].message.content.trim();

    // 7) PDF oluşturma
    let pdfUrl = null;
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Font
      const fontPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
      const fontBytes = fs.readFileSync(fontPath);
      const regularFont = await pdfDoc.embedFont(fontBytes);

      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      // Kenar boşlukları
      const marginLeft = 50;
      const marginTop = 50;
      let cursorY = height - marginTop;

      // Gri kutu üst başlık
      page.drawRectangle({
        x: marginLeft - 10,
        y: cursorY - 60,
        width: width - marginLeft * 2 + 20,
        height: 60,
        color: rgb(0.85, 0.85, 0.85),
      });

      page.setFont(regularFont);
      page.setFontSize(16);
      page.drawText("BEYANNAME AI By Can Matik (Detailed Analysis)", {
        x: marginLeft,
        y: cursorY - 35,
        color: rgb(0, 0, 0),
      });
      cursorY -= 80;

      // GPT cevabını satır satır yazalım
      page.setFontSize(12);
      const lines = wrapText(gptAnswer, 90);
      const lineHeight = 14;

      for (let line of lines) {
        // Yeni sayfa kontrolü
        if (cursorY <= 50) {
          // yeni sayfa
          const newPage = pdfDoc.addPage();
          page.setFont(regularFont);
          page.setFontSize(12);

          cursorY = newPage.getSize().height - marginTop;
        }
        page.drawText(line, {
          x: marginLeft,
          y: cursorY,
          color: rgb(0, 0, 0),
        });
        cursorY -= lineHeight;
      }

      // PDF'i byte array'e çevir
      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);

      // Supabase storage'a yükle
      const fileName = `manual_analysis_${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("analyses")
        .upload(fileName, pdfBuffer, { contentType: "application/pdf" });

      if (!uploadErr) {
        const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(fileName);
        pdfUrl = publicData.publicUrl;
      }
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
    }

    // 8) "previous analyses" tablosuna ekle (beyanname_analysis)
    await supabase.from("beyanname_analysis").insert({
      user_id: user.id,
      analysis_response: gptAnswer,
      pdf_url: pdfUrl,
    });

    // 9) Queue kaydını artık silelim (başarılı olduktan sonra)
    // Bu sayede "Queue" tablosunda görünmez (yani 'done' kaydı kalmıyor).
    await supabase
      .from("analysis_queue")
      .delete()
      .eq("id", queueId);

    // Front-end'e mesaj
    return NextResponse.json({ success: true, pdf_url: pdfUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Metin satırlarını 'maxWidth' karakterde kırmak için basit bir wrap fonksiyonu
 */
function wrapText(text, maxWidth) {
  const words = text.split(/\s+/);
  let lines = [];
  let currentLine = "";

  for (let w of words) {
    if ((currentLine + w).length <= maxWidth) {
      currentLine += w + " ";
    } else {
      lines.push(currentLine.trim());
      currentLine = w + " ";
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }
  return lines;
}
