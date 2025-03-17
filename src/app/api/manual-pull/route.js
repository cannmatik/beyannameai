import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req) {
  let queueId = null;
  try {
    // Token kontrolü
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      console.log("Token eksik");
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      console.log("Kullanıcı doğrulanamadı");
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
    }
    
    // URL'den queue_id alınıyor
    const url = new URL(req.url);
    queueId = url.searchParams.get("queue_id");
    if (!queueId) {
      console.log("queue_id eksik");
      return NextResponse.json({ error: "queue_id eksik" }, { status: 400 });
    }
    
    console.log("Queue item için id:", queueId);
    // İlgili kuyruğu çekelim
    const { data: queueItem, error: qErr } = await supabase
      .from("analysis_queue")
      .select("*, analysis_uuid, json_data, created_at, firma_adi, vergi_no, donem_yil, donem_ay")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();
    if (qErr || !queueItem) {
      console.log("Kayıt bulunamadı:", qErr);
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }
    
    if (queueItem.status !== "pending" && queueItem.status !== "error") {
      console.log("Kayıt durumu uygun değil:", queueItem.status);
      return NextResponse.json({ error: "Bu kayıt pending/error değil" }, { status: 400 });
    }
    
    // Durum güncellemesi: processing
    console.log("Kayıt durumu processing'e güncelleniyor");
    await supabase
      .from("analysis_queue")
      .update({ status: "processing", progress: 0 })
      .eq("id", queueId);
    
    // Claude API için prompt oluşturuluyor
    const prompt = `
# Sorgera Beyanname AI Analiz Raporu

Lütfen aşağıdaki XML formatındaki detaylı beyanname belgesini eksiksiz incele. 
Raporunuzda şunlar yer almalıdır:
- **Genel Bilgiler:** Firma adı, vergi numarası, beyanname dönemi, beyanname türü vb.
- **Beyanname Detayları:** Belgedeki tüm bilgilerin özet ve detaylı açıklamaları.
- **Finansal Analiz:** Riskler, vergi yükü, nakit akışı, öngörüler, öneriler.
- **Gelecek Ay İçin Tavsiyeler:** Bir sonraki ay dikkat edilmesi gerekenler, vergi planlaması, nakit yönetimi stratejileri.
Veriler:
${JSON.stringify(queueItem.json_data, null, 2)}
`;
    console.log("Oluşturulan prompt:", prompt);
    
    await supabase.from("analysis_queue").update({ progress: 25 }).eq("id", queueId);
    
    // Claude API çağrısı
    console.log("Claude API'ye istek gönderiliyor");
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229",
        max_tokens: 3000,
        temperature: 1,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "Sen ileri düzey bir finans uzmanısın, detaylı ve kapsamlı analizler üret." },
        ],
      }),
    });
    
    await supabase.from("analysis_queue").update({ progress: 50 }).eq("id", queueId);
    
    const claudeData = await claudeRes.json();
    console.log("Claude API'den gelen veri:", claudeData);
    
    if (!claudeRes.ok) {
      console.log("Claude API hatası:", claudeData.error);
      await supabase.from("analysis_queue").update({
        status: "error",
        result: claudeData.error?.message || "Claude hatası",
      }).eq("id", queueId);
      return NextResponse.json({ error: claudeData.error?.message || "Claude API Hatası" }, { status: 500 });
    }
    
    const gptAnswer = claudeData.content[0].text.trim();
    console.log("Claude API cevabı (analiz metni):", gptAnswer);
    
    await supabase.from("analysis_queue").update({ progress: 75 }).eq("id", queueId);
    
    // PDF oluşturma işlemleri
    let pdfUrl = null;
    try {
      console.log("PDF oluşturuluyor");
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      const regularFontPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
      const boldFontPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Bold.ttf");
      const regularFontBytes = fs.readFileSync(regularFontPath);
      const boldFontBytes = fs.readFileSync(boldFontPath);
      const regularFont = await pdfDoc.embedFont(regularFontBytes);
      const boldFont = await pdfDoc.embedFont(boldFontBytes);
      
      let page = pdfDoc.addPage();
      let { width, height } = page.getSize();
      
      const marginLeft = 50;
      const marginRight = 50;
      const marginTop = 60;
      const marginBottom = 60;
      let cursorY = height - marginTop;
      
      const titleLine1 = "Sorgera Beyanname AI";
      const titleLine2 = "Analiz Raporu";
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
      
      const submissionDate = new Date(queueItem.created_at || Date.now())
        .toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
      page.setFont(regularFont);
      page.setFontSize(12);
      page.drawText(`Gönderim Tarihi: ${submissionDate}`, { x: marginLeft, y: cursorY });
      cursorY -= 20;
      
      let reviewedDocs = `• Firma: ${queueItem.firma_adi || "Bilinmiyor"}, Vergi No: ${queueItem.vergi_no || "Bilinmiyor"}, Dönem: ${queueItem.donem_yil || "?"}/${queueItem.donem_ay || "?"}`;
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
      
      page.drawLine({
        start: { x: marginLeft, y: cursorY },
        end: { x: width - marginRight, y: cursorY },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      cursorY -= 20;
      
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
      
      if (cursorY < marginBottom + 20) {
        page = pdfDoc.addPage();
        ({ width, height } = page.getSize());
        cursorY = height - marginTop;
      }
      page.setFont(regularFont);
      page.setFontSize(10);
      page.drawText("Sorgera Beyanname AI tarafından oluşturulmuştur", {
        x: marginLeft,
        y: marginBottom,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);
      
      const fileName = `manual_analysis_${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("analyses")
        .upload(fileName, pdfBuffer, { contentType: "application/pdf" });
      if (!uploadErr) {
        const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(fileName);
        pdfUrl = publicData.publicUrl;
      }
      console.log("Oluşturulan PDF URL:", pdfUrl);
    } catch (pdfErr) {
      console.error("PDF oluşturma hatası:", pdfErr);
    }
    
    await supabase.from("analysis_queue").update({ progress: 100 }).eq("id", queueId);
    console.log("Analiz kaydı ekleniyor");
    await supabase.from("beyanname_analysis").insert({
      user_id: user.id,
      analysis_response: gptAnswer,
      pdf_url: pdfUrl,
    });
    
    await supabase.from("analysis_queue").update({ status: "completed", pdf_url: pdfUrl }).eq("id", queueId);
    console.log("Queue status 'completed' olarak güncellendi");
    return NextResponse.json({ success: true, pdf_url: pdfUrl });
  } catch (err) {
    console.error("Analiz Hatası:", err);
    await supabase.from("analysis_queue").update({
      status: "error",
      result: err.message,
    }).eq("id", queueId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }
  return lines;
}
