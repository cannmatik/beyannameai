import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("Hello from Functions!");

// Ortam değişkenlerini oku
const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req) => {
  try {
    const { name } = await req.json();
    const data = {
      message: `Hello ${name}!`,
      supabaseUrl: supabaseUrl,        // NEXT_PUBLIC_SUPABASE_URL'yi gösteriyoruz
      openAiKeySet: Boolean(openAiKey)  // OpenAI API anahtarının ayarlı olup olmadığını true/false şeklinde gösteriyoruz
    };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/* 
Localde test etmek için:
1. `supabase start` komutunu çalıştırın.
2. Terminal veya Postman üzerinden aşağıdaki isteği gönderin:

curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/backgroundAnalyze' \
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Functions"}'
*/
