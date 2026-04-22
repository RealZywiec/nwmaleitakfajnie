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
 
  const prompt = `Jesteś precyzyjnym dietetykiem analizującym zdjęcie jedzenia.

ZASADA: Zawsze rozbijaj posiłek na pojedyncze składniki. Nigdy nie licz całego dania jako jednej pozycji.

PROCES:
1. Zidentyfikuj każdy składnik widoczny na zdjęciu
2. Oceń gramaturę każdego składnika na podstawie tego co WIDZISZ na zdjęciu (rozmiar porcji, grubość, ilość)
3. Dla każdego składnika użyj wartości z tej bazy (kcal na 100g):
   Chleb pszenny: 265 | Chleb razowy: 220 | Masło: 740 | Majonez: 680
   Jajko całe: 155 | Ser żółty: 380 | Szynka/wędlina: 180 | Parówka: 290
   Kurczak pieczony: 195 | Kurczak smażony: 240 | Mięso mielone smażone: 250
   Ryż gotowany: 130 | Makaron gotowany: 160 | Ziemniaki gotowane: 87
   Frytki: 312 | Śmietana 18%: 185 | Mleko 3.2%: 61 | Jajecznica: 180
   Bulion/rosół: 25 | Twaróg: 98 | Jogurt naturalny: 59 | Płatki owsiane: 370
   Łosoś: 208 | Tuńczyk z puszki: 116 | Boczek smażony: 540
   Banan: 89 | Jabłko: 52 | Olej/oliwa: 900 | Ketchup: 100 | Musztarda: 70
   Marchew: 41 | Pomidor: 18 | Ogórek: 15 | Papryka: 31 | Cebula: 40
   Dla produktów spoza listy: użyj wartości z bazy USDA FoodData Central
4. Oblicz: gramatura_składnika × (kcal_na_100g / 100) dla każdego składnika
5. Zsumuj kalorie i makro wszystkich składników
6. Sprawdź logikę: jeśli wynik wydaje się za wysoki lub za niski względem tego co widzisz – przelicz ponownie

Odpowiedz WYŁĄCZNIE jedną linią JSON bez żadnego tekstu przed ani po:
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
 
