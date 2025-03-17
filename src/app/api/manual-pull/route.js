// app/api/manual-pull/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export async function POST(req) {
  try {
    // 1) Yetki kontrolü
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
    }

    // 2) URL üzerinden queue_id parametresini alıyoruz
    const url = new URL(req.url);
    const queueId = url.searchParams.get("queue_id");
    if (!queueId) {
      return NextResponse.json({ error: "queue_id eksik" }, { status: 400 });
    }

    // 3) Kuyruk kaydını getir (sadece pending veya error durumundakiler işleme alınır)
    const { data: queueItem, error: qErr } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();
    if (qErr || !queueItem) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }
    if (queueItem.status !== "pending" && queueItem.status !== "error") {
      return NextResponse.json({ error: "Bu kayıt pending/error değil, tekrar çekilemez" }, { status: 400 });
    }

    // 4) ChatGPT isteği: GPT-4 (standart, 8k context) kullanılarak detaylı ve uzun rapor istiyoruz.
    const prompt = `
# BEYANNAME AI By Can Matik
# Detaylı Finansal Rapor

Lütfen aşağıdaki XML formatındaki detaylı beyanname belgesini eksiksiz incele. 
Raporunuzda şunlar yer almalıdır:
- **Genel Bilgiler:** Firma adı, vergi numarası, beyanname dönemi, beyanname türü vb.
- **Beyanname Detayları:** Belgedeki tüm bilgilerin özet ve detaylı açıklamaları.
- **Finansal Analiz:** Riskler, vergi yükü, nakit akışı, öngörüler, öneriler.
- **Gelecek Ay İçin Tavsiyeler:** Bir sonraki ay dikkat edilmesi gerekenler, vergi planlaması, nakit yönetimi stratejileri.
- **Gönderim Tarihi ve İncelenen Belgeler:** Raporun hazırlanma tarihi, saat bilgisi ve incelenen belgelerin detayları.
Veriler:
${JSON.stringify(queueItem.payload, null, 2)}
`;
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4", // Tier 1 kullanımınızda GPT-4 (standart) kullanılacaktır.
        max_tokens: 3000,
        temperature: 1,
        messages: [
          { role: "system", content: "Sen ileri düzey bir finans uzmanısın, detaylı ve kapsamlı analizler üret." },
          { role: "user", content: prompt },
        ]
      }),
    });
    const openAiData = await openAiRes.json();
    if (!openAiRes.ok) {
      await supabase.from("analysis_queue").update({
        status: "error",
        result: openAiData.error?.message || "OpenAI hatası"
      }).eq("id", queueId);
      return NextResponse.json({ error: openAiData.error?.message || "OpenAI API Hatası" }, { status: 500 });
    }
    const gptAnswer = openAiData.choices[0].message.content.trim();

    // 5) PDF oluşturma: Gelişmiş formatlama
    let pdfUrl = null;
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Fontları yükle: Regular ve Bold
      const regularFontPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
      const boldFontPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Bold.ttf");
      const regularFontBytes = fs.readFileSync(regularFontPath);
      const boldFontBytes = fs.readFileSync(boldFontPath);
      const regularFont = await pdfDoc.embedFont(regularFontBytes);
      const boldFont = await pdfDoc.embedFont(boldFontBytes);

      let page = pdfDoc.addPage();
      let { width, height } = page.getSize();

      // Margin ayarları
      const marginLeft = 50;
      const marginRight = 50;
      const marginTop = 60;
      const marginBottom = 60;
      let cursorY = height - marginTop;

      // Üst başlık: İki satıra bölünmüş
      const titleLine1 = "BEYANNAME AI By Can Matik";
      const titleLine2 = "Detaylı Finansal Rapor";
      const titleFontSize = 20;
      const titleWidth1 = boldFont.widthOfTextAtSize(titleLine1, titleFontSize);
      const titleWidth2 = boldFont.widthOfTextAtSize(titleLine2, titleFontSize);
      const titleX1 = (width - titleWidth1) / 2;
      const titleX2 = (width - titleWidth2) / 2;
      const titleBlockHeight = 50;
      page.drawRectangle({
        x: marginLeft - 10,
        y: cursorY - titleBlockHeight,
        width: width - marginLeft - marginRight + 20,
        height: titleBlockHeight,
        color: rgb(0.9, 0.9, 0.9),
      });
      page.setFont(boldFont);
      page.setFontSize(titleFontSize);
      page.drawText(titleLine1, { x: titleX1, y: cursorY - 20, color: rgb(0, 0, 0) });
      page.drawText(titleLine2, { x: titleX2, y: cursorY - 40, color: rgb(0, 0, 0) });
      cursorY -= (titleBlockHeight + 10);

      // Gönderim Tarihi (Türkiye saatine göre)
      const submissionDate = new Date(queueItem.created_at || Date.now())
        .toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
      page.setFont(regularFont);
      page.setFontSize(12);
      page.drawText(`Gönderim Tarihi: ${submissionDate}`, { x: marginLeft, y: cursorY });
      cursorY -= 20;

      // İncelenen Belgeler: Tüm belge bilgilerini ekle
      let reviewedDocs = "";
      if (Array.isArray(queueItem.payload)) {
        reviewedDocs = queueItem.payload.map(doc => {
          return `• Firma: ${doc.firma_adi || "Bilinmiyor"}, Vergi No: ${doc.vergi_no || "Bilinmiyor"}, Dönem: ${doc.donem_yil || "?"}/${doc.donem_ay || "?"}${doc.beyanname_turu ? `, Beyanname Türü: ${doc.beyanname_turu}` : ""}`;
        }).join("\n");
      } else if (typeof queueItem.payload === "object") {
        reviewedDocs = `• Firma: ${queueItem.payload.firma_adi || "Bilinmiyor"}, Vergi No: ${queueItem.payload.vergi_no || "Bilinmiyor"}, Dönem: ${queueItem.payload.donem_yil || "?"}/${queueItem.payload.donem_ay || "?"}${queueItem.payload.beyanname_turu ? `, Beyanname Türü: ${queueItem.payload.beyanname_turu}` : ""}`;
      } else {
        reviewedDocs = "Tek belge gönderildi.";
      }
      page.setFont(boldFont);
      page.setFontSize(12);
      page.drawText("İncelenen Belgeler:", { x: marginLeft, y: cursorY });
      cursorY -= 18;
      const reviewedLines = wrapText(reviewedDocs, 80);
      page.setFont(regularFont);
      page.setFontSize(12);
      reviewedLines.forEach(line => {
        if (cursorY < marginBottom) {
          page = pdfDoc.addPage();
          ({ width, height } = page.getSize());
          cursorY = height - marginTop;
        }
        page.drawText(line, { x: marginLeft + 10, y: cursorY });
        cursorY -= 15;
      });
      cursorY -= 10;

      // Ayırıcı çizgi
      page.drawLine({
        start: { x: marginLeft, y: cursorY },
        end: { x: width - marginRight, y: cursorY },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      cursorY -= 20;

      // Analiz Metni: GPT yanıtını satır satır, markdown formatını dikkate alarak yaz
      const analysisLines = gptAnswer.split("\n");
      for (let line of analysisLines) {
        if (line.trim() === "") {
          cursorY -= 10;
          continue;
        }
        let currentFont = regularFont;
        let currentSize = 12;
        if (line.startsWith("### ")) {
          currentFont = boldFont;
          currentSize = 14;
          line = line.replace("### ", "").trim();
        } else if (line.startsWith("## ")) {
          currentFont = boldFont;
          currentSize = 16;
          line = line.replace("## ", "").trim();
        } else if (line.startsWith("# ")) {
          currentFont = boldFont;
          currentSize = 18;
          line = line.replace("# ", "").trim();
        } else if (line.startsWith("* ")) {
          line = "• " + line.replace("* ", "").trim();
        }
        const wrapped = wrapText(line, 80);
        for (let wline of wrapped) {
          if (cursorY < marginBottom) {
            page = pdfDoc.addPage();
            ({ width, height } = page.getSize());
            cursorY = height - marginTop;
          }
          page.setFont(currentFont);
          page.setFontSize(currentSize);
          page.drawText(wline, { x: marginLeft, y: cursorY, color: rgb(0, 0, 0) });
          cursorY -= currentSize + 5;
        }
        cursorY -= 5;
      }

      // PDF'i byte array'e çevir
      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);

      // Supabase Storage'a yükle
      const fileName = `manual_analysis_${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("analyses")
        .upload(fileName, pdfBuffer, { contentType: "application/pdf" });
      if (!uploadErr) {
        const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(fileName);
        pdfUrl = publicData.publicUrl;
      }
    } catch (pdfErr) {
      console.error("PDF oluşturma hatası:", pdfErr);
    }

    // 6) Önceki analizler tablosuna ekle (beyanname_analysis)
    await supabase.from("beyanname_analysis").insert({
      user_id: user.id,
      analysis_response: gptAnswer,
      pdf_url: pdfUrl,
    });

    // 7) Kuyruk kaydını sil (başarılı analiz artık kuyrukta kalmasın)
    await supabase.from("analysis_queue").delete().eq("id", queueId);

    return NextResponse.json({ success: true, pdf_url: pdfUrl });
  } catch (err) {
    console.error("Analiz Hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Belirtilen maxWidth karakterinde satırlara bölmek için basit bir wrapText fonksiyonu.
 */
function wrapText(text, maxWidth) {
  const words = text.split(/\s+/);
  let lines = [];
  let currentLine = "";
  for (let word of words) {
    if ((currentLine + word).length <= maxWidth) {
      currentLine += word + " ";
    } else {
      lines.push(currentLine.trim());
      currentLine = word + " ";
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}
