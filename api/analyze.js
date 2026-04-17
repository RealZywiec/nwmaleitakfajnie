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

  const prompt = `Jesteś ekspertem od żywienia. Przeanalizuj zdjęcie i oszacuj wartości odżywcze dla widocznej porcji.
Odpowiedz TYLKO i WYŁĄCZNIE samym obiektem JSON, zero innych słów, zero markdown, zero backticks:
{"name":"nazwa po polsku","portion":"np. 350g","kcal":400,"protein":20.5,"carbs":45.0,"fat":12.0,"fiber":3.0,"confidence":"wysoka","tip":"krótka wskazówka po polsku"}`;

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
            maxOutputTokens: 512,
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
