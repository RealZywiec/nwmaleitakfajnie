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

  const prompt = `Jesteś precyzyjnym dietetykiem. Oszacuj kalorie i makro dla jedzenia na zdjęciu.

ZASADY SZACOWANIA – trzymaj się ich ściśle:
- Domyślnie zakładaj MNIEJSZĄ porcję jeśli nie masz pewności – lepiej niedoszacować niż przeszacować
- Kanapka z wędliną: 150-200 kcal sztuka
- Jajko sadzone/gotowane: 70-80 kcal sztuka  
- Łyżka majonezu: 90 kcal, masła: 70 kcal
- Talerz zupy (300ml): 100-250 kcal zależnie od rodzaju
- Porcja ryżu/makaronu na talerzu: 200-250g (nie 400g)
- Pierś kurczaka standardowa: 150g = 165 kcal
- NIE dodawaj kalorii których nie widzisz na zdjęciu
- Jeśli widzisz opakowanie z etykietą – użyj dokładnie tych wartości

Odpowiedz TYLKO samym JSON, zero innych słów:
{"name":"nazwa po polsku","portion":"szacowana gramatura","kcal":liczba,"protein":liczba,"carbs":liczba,"fat":liczba,"fiber":liczba,"confidence":"wysoka lub średnia lub niska","tip":"krótka wskazówka max 10 słów"}`;
  
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
