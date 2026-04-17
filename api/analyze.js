export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza API. Ustaw GEMINI_API_KEY w Vercel.' });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Brak zdjęcia.' });

  const prompt = `Jesteś precyzyjnym ekspertem od żywienia i dietetyki. Przeanalizuj dokładnie zdjęcie i oszacuj wartości odżywcze.

WAŻNE ZASADY:
- Oceń realną wielkość porcji widocznej na zdjęciu
- Uwzględnij sposób przygotowania (smażone ma więcej kalorii niż gotowane)
- Jeśli widoczne jest opakowanie z etykietą – użyj danych z etykiety
- Bądź realistyczny: typowy talerz obiadu to 400-700 kcal, śniadanie 300-500 kcal
- Zupa to zazwyczaj 100-300 kcal na porcję

Odpowiedz WYŁĄCZNIE w formacie JSON bez markdown i bez żadnego innego tekstu:
{"name":"pełna nazwa potrawy po polsku","portion":"szacowana wielkość np. 350g","kcal":liczba,"protein":liczba,"carbs":liczba,"fat":liczba,"fiber":liczba,"confidence":"wysoka lub średnia lub niska","tip":"krótka wskazówka max 15 słów"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({
        error: err?.error?.message || 'Błąd API Gemini'
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) return res.status(500).json({ error: 'Nieprawidłowa odpowiedź od AI.' });

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'Błąd serwera: ' + err.message });
  }
}
