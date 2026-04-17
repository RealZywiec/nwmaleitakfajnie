export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza API.' });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Brak zdjęcia.' });

  const prompt = `Jesteś światowej klasy ekspertem dietetyki i sztuczną inteligencją do wizyjnej analizy żywności. Twoim zadaniem jest oszacowanie kaloryczności i makroskładników absolutnie każdego jedzenia i napoju na zdjęciu z maksymalną możliwą precyzją.

ZASADY ANALIZY (STOSUJ DO KAŻDEGO ZDJĘCIA BEZ WYJĄTKU):
1. DEKONSTRUKCJA: Zidentyfikuj wszystkie widoczne elementy na talerzu/w opakowaniu. 
2. UKRYTE KALORIE (NAJWAŻNIEJSZE): Zawsze analizuj sposób obróbki termicznej. Jeśli jedzenie błyszczy, jest smażone, ma panierkę, sos lub jest to fast-food/restauracja – ZAWSZE doliczaj dodatkowy tłuszcz (olej, masło) i węglowodany (cukier w sosach). Jedzenie poza domem jest zawsze bardziej kaloryczne.
3. SZACUNKOWA WAGA: Oceniaj wielkość porcji na podstawie kontekstu (wielkość talerza, sztućców, dłoni, opakowania). Jeśli brakuje punktu odniesienia, zakładaj standardową dużą porcję dla dorosłego człowieka.
4. PRODUKTY GOTOWE: Jeśli widzisz etykietę, markę, logo sieciówki (np. McDonald's) lub kod kreskowy – bezwzględnie dopasuj wartości do oficjalnych tabel odżywczych tego konkretnego produktu.
5. REALIZM: Nie zaniżaj kalorii. Lepiej podać wartość o 10% wyższą i bezpieczną, niż sztucznie odchudzić posiłek.

ZASADY ZWROTU DANYCH:
Zwróć TYLKO i WYŁĄCZNIE surowy format JSON. Zero jakiegokolwiek tekstu, powitań, czy znaczników markdown. Zwróć TABLICĘ (Array) obiektów. Jeśli na zdjęciu jest kilka osobnych dań, rozbij je na osobne obiekty. Jeśli to potrawka/mix – zrób z tego jeden obiekt, ale zsumuj wszystko.

Format:
[
  {
    "name": "Szczegółowa nazwa potrawy/produktu po polsku",
    "portion_g": liczba (tylko liczba, np. 350),
    "kcal": liczba,
    "protein": liczba,
    "carbs": liczba,
    "fat": liczba,
    "fiber": liczba,
    "hidden_factors": "krótko: co doliczono z ukrytych rzeczy (np. olej ze smażenia, gęsty sos majonezowy)"
  }
]`;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10000,
            responseMimeType: 'application/json',
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Błąd Gemini API' });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('RAW:', raw.slice(0, 300));

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Zły format odpowiedzi: ' + raw.slice(0, 150) });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Błąd serwera: ' + err.message });
  }
}
