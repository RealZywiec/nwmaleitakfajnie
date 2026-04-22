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
 
  const prompt = `Jesteś doświadczonym dietetykiem klinicznym. Przeanalizuj dokładnie to zdjęcie jedzenia.

INSTRUKCJA:
1. Zidentyfikuj każdy składnik osobno który widzisz na zdjęciu
2. Dla każdego składnika oceń gramaturę na podstawie tego co widzisz - rozmiar, grubość, ilość
3. Dla każdego składnika oblicz kalorie i makro używając swojej wiedzy o wartościach odżywczych
4. Zsumuj wszystkie składniki
5. Sprawdź czy wynik jest realistyczny dla tej porcji

WAŻNE:
- Zawsze rozkładaj na składniki, nigdy nie szacuj całego dania na raz
- Gramaturę oceniaj wyłącznie na podstawie zdjęcia, nie zakładaj z góry
- Używaj swojej pełnej wiedzy żywieniowej, nie upraszczaj
- Jeśli coś jest trudne do rozpoznania - zaznacz confidence jako niska

Odpowiedz WYŁĄCZNIE jedną linią JSON:
{"name":"nazwa po polsku","portion":"X g","kcal":0,"protein":0.0,"carbs":0.0,"fat":0.0,"fiber":0.0,"confidence":"wysoka lub srednia lub niska","tip":"krotka wskazowka"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
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
            temperature: 0,
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
    console.log('RAW:', raw.slice(0, 400));
 
    // Wyciągnij JSON – szukaj { ... } i weź tylko pierwszą parę nawiasów
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
 
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'Brak JSON w odpowiedzi: ' + raw.slice(0, 200) });
    }
 
    let jsonStr = raw.slice(start, end + 1);
 
    // Usuń znaki kontrolne które psują parsowanie
    jsonStr = jsonStr
      .replace(/[\u0000-\u001F\u007F]/g, ' ') // wszystkie znaki kontrolne -> spacja
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ');
 
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      // Ostatnia deska ratunku – wyciągnij wartości regexem
      console.error('Parse failed, trying regex extraction. JSON:', jsonStr.slice(0, 300));
      const get = (key) => {
        const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"?([^",}]+)"?`));
        return m ? m[1].trim() : null;
      };
      result = {
        name: get('name') || 'Nierozpoznane',
        portion: get('portion') || '–',
        kcal: parseFloat(get('kcal')) || 0,
        protein: parseFloat(get('protein')) || 0,
        carbs: parseFloat(get('carbs')) || 0,
        fat: parseFloat(get('fat')) || 0,
        fiber: parseFloat(get('fiber')) || 0,
        confidence: get('confidence') || 'niska',
        tip: get('tip') || '',
      };
    }
 
    return res.status(200).json(result);
 
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Błąd serwera: ' + err.message });
  }
}
 
