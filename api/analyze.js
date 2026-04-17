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

  const prompt = `Jesteś doświadczonym dietetykiem i potrafisz precyzyjnie szacować gramaturę posiłków ze zdjęć.

KROK 1 - ROZPOZNAJ CO WIDZISZ:
Zidentyfikuj każdy składnik na talerzu/misce osobno.

KROK 2 - OSZACUJ GRAMATURĘ METODYCZNIE:
- Porównaj rozmiar naczynia do standardowych (talerz obiadowy = 26cm, miseczka = 15cm)
- Oceń grubość i objętość każdego składnika
- Użyj punktów odniesienia: garść ryżu = ~150g, pierś kurczaka = 150-200g, ziemniaki średnie = 100g każdy, zupa w miseczce = 300-400ml
- Zsumuj wszystkie składniki

KROK 3 - OBLICZ MAKRO:
Na podstawie rzeczywistych wartości odżywczych każdego składnika oblicz łączne makro.

KROK 4 - SPRAWDŹ LOGIKĘ:
- Zupa 400ml nie może mieć 600 kcal
- Talerz ryżu z kurczakiem to zazwyczaj 500-700 kcal
- Jeśli widzisz opakowanie z etykietą - użyj danych z etykiety

Odpowiedz TYLKO samym JSON bez żadnego tekstu przed ani po:
{"name":"dokładna nazwa po polsku","portion":"X g lub ml (jak to oszacowałeś)","kcal":liczba,"protein":liczba,"carbs":liczba,"fat":liczba,"fiber":liczba,"confidence":"wysoka lub średnia lub niska","tip":"krótka wskazówka po polsku max 12 słów"}`;
  
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
