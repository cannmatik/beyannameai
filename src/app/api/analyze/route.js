import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    // 1) Supabase Auth
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı doğrulanamadı." }, { status: 401 });
    }

    // 2) Gövdeden beyanname verisi
    const { data: beyannameData } = await req.json();
    if (!beyannameData || !beyannameData.length) {
      return NextResponse.json({ error: "Beyanname verileri eksik." }, { status: 400 });
    }

    // 3) ChatGPT Prompt – Derinlemesine analiz (ama 8k gpt-4)
    const prompt = `
Lütfen aşağıdaki beyannameler ışığında firmanın mali durumunu, işlem hacmini, 
risklerini ve geleceğe yönelik projeksiyonlarını detaylı bir biçimde analiz et. 
Aşağıdaki konuları mutlaka kapsa:

1. **Genel Bakış**: Firmanın işlem hacmi, vergisel yükü ve kârlılık oranları
2. **Risk Analizi**: Mevzuat riskleri, ödemelerde gecikme olasılığı, nakit akışı riski
3. **Gelecek Projeksiyonu**: Bir sonraki dönemde (3-6 ay / 1 yıl) öngörülen hacim artışı, vergi yükü tahmini
4. **Stratejik Öneriler**: Nasıl maliyet düşürülebilir, hangi alanlara yatırım yapılmalı, hangi ortaklıklar ya da finansman araçları değerlendirilebilir
5. **İleri Düzey Finansal Oranlar**: Firma isterse ROE, ROI, Likidite oranları vb.

Lütfen analizini 
- **Markdown başlıkları** (#, ##, ###) kullanarak bölümle, 
- **madde işaretleri** (* ) ile liste oluştur 
- Her bölümde gerekirse rakamsal örnekler ve simülasyon senaryoları ver.

Beyanname Verileri:
${JSON.stringify(beyannameData)}
`;

    // gpt-4 (8k)
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Sen ileri düzey bir finansal danışmansın. Ayrıntılı analiz ve projeksiyonlar oluştur.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 3500, // gpt-4 (8k) için uygun
        temperature: 0.7,
      }),
    });

    const openAiData = await openAiRes.json();
    if (!openAiRes.ok) {
      throw new Error(openAiData.error?.message || "OpenAI API hatası.");
    }
    const analysisText = openAiData.choices[0].message.content.trim();

    // 4) PDF oluşturma
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
    const boldPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Bold.ttf");

    const regularBytes = fs.readFileSync(regularPath);
    const boldBytes = fs.readFileSync(boldPath);

    const regularFont = await pdfDoc.embedFont(regularBytes);
    const boldFont = await pdfDoc.embedFont(boldBytes);

    // Sayfa ayarları
    let page = pdfDoc.addPage();
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const marginLeft = 50;
    const marginTop = 60;
    const marginBottom = 60;
    const lineHeight = 16;

    // Üst Başlık Kutusu
    page.drawRectangle({
      x: marginLeft - 5,
      y: pageHeight - marginTop - 60,
      width: pageWidth - (marginLeft * 2 - 10),
      height: 60,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Ana Başlık
    page.setFont(boldFont);
    page.setFontSize(16);
    page.drawText("BEYANNAME API - Detaylı Mali Analiz", {
      x: marginLeft,
      y: pageHeight - marginTop - 30,
      color: rgb(0, 0, 0),
    });

    let cursorY = pageHeight - marginTop - 80;

    // 5) Markdown Metni işleme
    const rawLines = analysisText.split("\n");

    for (const rawLine of rawLines) {
      const lines = wrapText(rawLine, 90);

      for (const line of lines) {
        if (cursorY < marginBottom) {
          page = pdfDoc.addPage();
          page.setFont(regularFont);
          page.setFontSize(12);
          cursorY = page.getSize().height - marginTop;
        }

        if (line.startsWith("# ")) {
          // "# " => Büyük Başlık
          const text = line.replace("# ", "").trim();
          page.setFont(boldFont);
          page.setFontSize(14);
          page.drawText(text, { x: marginLeft, y: cursorY });
          cursorY -= lineHeight + 4;
        } else if (line.startsWith("## ")) {
          // Orta Başlık
          const text = line.replace("## ", "").trim();
          page.setFont(boldFont);
          page.setFontSize(13);
          page.drawText(text, { x: marginLeft, y: cursorY });
          cursorY -= lineHeight;
        } else if (line.startsWith("### ")) {
          // Küçük Başlık
          const text = line.replace("### ", "").trim();
          page.setFont(boldFont);
          page.setFontSize(12);
          page.drawText(text, { x: marginLeft, y: cursorY });
          cursorY -= lineHeight;
        } else if (line.startsWith("* ")) {
          // Bullet
          const text = line.replace("* ", "").trim();
          page.setFont(regularFont);
          page.setFontSize(12);
          page.drawText("• " + text, { x: marginLeft + 20, y: cursorY });
          cursorY -= lineHeight;
        } else {
          // Normal
          page.setFont(regularFont);
          page.setFontSize(12);
          page.drawText(line, { x: marginLeft, y: cursorY });
          cursorY -= lineHeight;
        }
      }
    }

    // 6) Önceki Analizler
    const { data: oldAnalyses, error: oldError } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (oldError) {
      throw new Error(`Önceki analizler çekilemedi: ${oldError.message}`);
    }

    page = pdfDoc.addPage();
    cursorY = page.getSize().height - marginTop;

    page.setFont(boldFont);
    page.setFontSize(14);
    page.drawText("Önceki Analizler", { x: marginLeft, y: cursorY });
    cursorY -= (lineHeight + 10);

    if (!oldAnalyses || oldAnalyses.length === 0) {
      page.setFont(regularFont);
      page.drawText("Henüz analiz kaydı yok.", { x: marginLeft, y: cursorY });
      cursorY -= lineHeight;
    } else {
      page.setFont(boldFont);
      page.setFontSize(12);
      page.drawText("Tarih", { x: marginLeft, y: cursorY });
      page.drawText("Analiz Özeti", { x: marginLeft + 130, y: cursorY });
      cursorY -= (lineHeight + 5);

      page.drawLine({
        start: { x: marginLeft, y: cursorY },
        end: { x: pageWidth - marginLeft, y: cursorY },
        thickness: 1,
        color: rgb(0,0,0),
      });
      cursorY -= (lineHeight - 5);

      page.setFont(regularFont);
      page.setFontSize(12);
      for (const item of oldAnalyses) {
        if (cursorY < marginBottom) {
          page = pdfDoc.addPage();
          page.setFont(regularFont);
          page.setFontSize(12);
          cursorY = page.getSize().height - marginTop;
        }
        const dateStr = new Date(item.created_at).toLocaleString("tr-TR");
        page.drawText(dateStr, { x: marginLeft, y: cursorY });

        const snippet = (item.analysis_response || "")
          .substring(0, 80)
          .replace(/\n/g, " ");
        page.drawText(snippet + "...", { x: marginLeft + 130, y: cursorY });
        cursorY -= lineHeight;
      }
    }

    // 7) PDF kaydet
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // 8) Supabase'e Yükle
    const pdfFileName = `analysis_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("analyses")
      .upload(pdfFileName, pdfBuffer, { contentType: "application/pdf" });
    if (uploadError) {
      throw new Error(`PDF yüklenemedi: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage
      .from("analyses")
      .getPublicUrl(pdfFileName);
    const pdf_url = publicData.publicUrl;

    // 9) Kaydı DB'ye ekle
    await supabase.from("beyanname_analysis").insert([
      { user_id: user.id, analysis_response: analysisText, pdf_url },
    ]);

    return NextResponse.json({ response: analysisText, pdf_url });
  } catch (err) {
    console.error("Analiz Hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * wrapText => metni maxChars kadar böler
 */
function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (let word of words) {
    if ((currentLine + word).length <= maxChars) {
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
