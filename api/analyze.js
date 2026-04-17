export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brak klucza API na serwerze. Ustaw zmienną ANTHROPIC_API_KEY w Vercel.' });
  }

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'Brak zdjęcia.' });
  }

  const prompt = `Jesteś precyzyjnym ekspertem od żywienia i dietetyki. Przeanalizuj dokładnie zdjęcie i oszacuj wartości odżywcze.

WAŻNE ZASADY SZACOWANIA:
- Oceń realną wielkość porcji widocznej na zdjęciu (nie standardową – to co FAKTYCZNIE jest na talerzu)
- Uwzględnij sposób przygotowania (smażone ma więcej kalorii niż gotowane, sosy dodają kalorii)
- Jeśli widoczne jest opakowanie z etykietą – użyj danych z etykiety
- Bądź realistyczny: nie zaniżaj ani nie zawyżaj. Typowy talerz obiadu to 400-700 kcal, śniadanie 300-500 kcal
- Jeśli nie możesz rozpoznać produktu – napisz co widzisz i podaj 0 dla wartości

Odpowiedz WYŁĄCZNIE w formacie JSON (bez markdown, bez \`\`\`, bez żadnego innego tekstu):
{
  "name": "pełna nazwa potrawy po polsku",
  "portion": "szacowana wielkość porcji np. '350g' lub '1 talerz (~400g)'",
  "kcal": liczba_całkowita,
  "protein": liczba_z_jednym_miejscem_po_przecinku,
  "carbs": liczba_z_jednym_miejscem_po_przecinku,
  "fat": liczba_z_jednym_miejscem_po_przecinku,
  "fiber": liczba_z_jednym_miejscem_po_przecinku,
  "confidence": "wysoka" lub "średnia" lub "niska",
  "tip": "krótka wskazówka żywieniowa max 15 słów"
}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json();
      return res.status(anthropicRes.status).json({
        error: errData?.error?.message || 'Błąd API Anthropic',
      });
    }

    const data = await anthropicRes.json();
    const raw = data.content?.[0]?.text || '';

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Nieprawidłowa odpowiedź od AI.' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'Wewnętrzny błąd serwera: ' + err.message });
  }
}
