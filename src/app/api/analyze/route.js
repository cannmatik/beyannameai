import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

// Bu ayar, Next.js'in bu route'u Node.js ortamında çalıştırmasını garanti eder
export const runtime = "nodejs";

export async function POST(req) {
  try {
    // 1) Supabase Auth
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: "Kullanıcı doğrulanamadı." }, { status: 401 });
    }

    // 2) Gövdeden beyanname verisini al
    // Gönderdiğin body: { data: beyannameData }
    const { data: beyannameData } = await req.json();
    if (!beyannameData || !beyannameData.length) {
      return NextResponse.json({ error: "Beyanname verileri eksik." }, { status: 400 });
    }

    // 3) ChatGPT Prompt – Derinlemesine analiz
    // Bu kısım GPT-4 olarak ayarlı. Eğer GPT-4 yetkin yoksa "gpt-3.5-turbo" yapabilirsin.
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

    // GPT API'ye istek
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // OPENAI_API_KEY'in Vercel ortam değişkenlerinde tanımlı olduğundan emin ol
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        // İstersen burayı "gpt-3.5-turbo" olarak değiştirebilirsin:
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
        max_tokens: 3500, // GPT-4 (8k) için yeterli olabilir
        temperature: 0.7,
      }),
    });

    // OpenAI cevabını JSON'a çevir
    const openAiData = await openAiRes.json();

    // Başarısız durumdaysa burada daha net hata mesajı yakalıyoruz
    if (!openAiRes.ok) {
      console.error("OpenAI API Error:", openAiData);
      // Dönen hatayı kullanıcının da görebileceği şekilde geri dönelim
      return NextResponse.json(
        {
          error: openAiData.error?.message || "OpenAI API hatası.",
          details: openAiData.error,
        },
        { status: openAiRes.status }
      );
    }

    // Eğer hata yoksa, analiz metni
    const analysisText = openAiData.choices[0].message.content.trim();

    // 4) PDF oluşturma işlemleri
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
    const boldPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Bold.ttf");

    // Montserrat fontlarını okuyoruz
    const regularBytes = fs.readFileSync(regularPath);
    const boldBytes = fs.readFileSync(boldPath);

    // Fontları PDF'e göm
    const regularFont = await pdfDoc.embedFont(regularBytes);
    const boldFont = await pdfDoc.embedFont(boldBytes);

    // Yeni bir sayfa ekle
    let page = pdfDoc.addPage();
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Kenar boşlukları vs.
    const marginLeft = 50;
    const marginTop = 60;
    const marginBottom = 60;
    const lineHeight = 16;

    // Üst başlık kutusu
    page.drawRectangle({
      x: marginLeft - 5,
      y: pageHeight - marginTop - 60,
      width: pageWidth - (marginLeft * 2 - 10),
      height: 60,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Ana başlık
    page.setFont(boldFont);
    page.setFontSize(16);
    page.drawText("BEYANNAME API - Detaylı Mali Analiz", {
      x: marginLeft,
      y: pageHeight - marginTop - 30,
      color: rgb(0, 0, 0),
    });

    let cursorY = pageHeight - marginTop - 80;

    // 5) Markdown metni satır satır PDF'e çizelim
    const rawLines = analysisText.split("\n");

    for (const rawLine of rawLines) {
      // wrapText ile satırları belli uzunlukta sarıyoruz
      const lines = wrapText(rawLine, 90);

      for (const line of lines) {
        // Sayfa sonuna geldiysek yeni sayfa
        if (cursorY < marginBottom) {
          page = pdfDoc.addPage();
          page.setFont(regularFont);
          page.setFontSize(12);
          cursorY = page.getSize().height - marginTop;
        }

        // Markdown başlıklarına göre font ayarı
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
          // Normal metin
          page.setFont(regularFont);
          page.setFontSize(12);
          page.drawText(line, { x: marginLeft, y: cursorY });
          cursorY -= lineHeight;
        }
      }
    }

    // 6) Önceki Analizleri de PDF'e ekliyoruz
    const { data: oldAnalyses, error: oldError } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (oldError) {
      throw new Error(`Önceki analizler çekilemedi: ${oldError.message}`);
    }

    // Yeni sayfa
    page = pdfDoc.addPage();
    cursorY = page.getSize().height - marginTop;

    page.setFont(boldFont);
    page.setFontSize(14);
    page.drawText("Önceki Analizler", { x: marginLeft, y: cursorY });
    cursorY -= lineHeight + 10;

    if (!oldAnalyses || oldAnalyses.length === 0) {
      page.setFont(regularFont);
      page.drawText("Henüz analiz kaydı yok.", { x: marginLeft, y: cursorY });
      cursorY -= lineHeight;
    } else {
      page.setFont(boldFont);
      page.setFontSize(12);
      page.drawText("Tarih", { x: marginLeft, y: cursorY });
      page.drawText("Analiz Özeti", { x: marginLeft + 130, y: cursorY });
      cursorY -= lineHeight + 5;

      // Alt çizgi
      page.drawLine({
        start: { x: marginLeft, y: cursorY },
        end: { x: pageWidth - marginLeft, y: cursorY },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      cursorY -= lineHeight - 5;

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

        // Analiz metninin ilk 80 karakteri
        const snippet = (item.analysis_response || "").substring(0, 80).replace(/\n/g, " ");
        page.drawText(snippet + "...", { x: marginLeft + 130, y: cursorY });
        cursorY -= lineHeight;
      }
    }

    // 7) PDF'yi byte dizisi olarak kaydet
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // 8) Supabase'e PDF olarak yükle
    const pdfFileName = `analysis_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("analyses")
      .upload(pdfFileName, pdfBuffer, { contentType: "application/pdf" });

    if (uploadError) {
      throw new Error(`PDF yüklenemedi: ${uploadError.message}`);
    }

    // Public URL al
    const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(pdfFileName);
    const pdf_url = publicData.publicUrl;

    // 9) Analizi veritabanına kaydet
    await supabase.from("beyanname_analysis").insert([
      { user_id: user.id, analysis_response: analysisText, pdf_url },
    ]);

    // Son olarak JSON dön
    return NextResponse.json({ response: analysisText, pdf_url });
  } catch (err) {
    console.error("Analiz Hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * wrapText => metni maxChars kadar böler
 * (Uzun satırları çoklu satıra bölmek için kullanılıyor)
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
