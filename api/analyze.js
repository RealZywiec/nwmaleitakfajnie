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
 
  const prompt = `Jesteś precyzyjnym dietetykiem z bazą danych wartości odżywczych. Przeanalizuj zdjęcie metodycznie.
 
KROK 1 - WYPISZ KAŻDY SKŁADNIK:
Zidentyfikuj każdy widoczny produkt osobno z szacowaną gramaturą.
 
KROK 2 - OBLICZ KAŻDY SKŁADNIK Z TEJ BAZY:
Chleb pszenny: 265 kcal/100g (B:9g W:49g T:3g)
Chleb razowy: 220 kcal/100g (B:9g W:41g T:3g)
Masło: 740 kcal/100g (B:1g W:0g T:82g)
Majonez: 680 kcal/100g (B:1g W:3g T:75g)
Jajko gotowane/sadzone: 155 kcal/100g, 1 sztuka=60g=93 kcal (B:13g W:1g T:11g)
Ser żółty: 380 kcal/100g (B:25g W:1g T:31g)
Szynka/wędlina: 180 kcal/100g (B:18g W:2g T:11g)
Kurczak pieczony: 195 kcal/100g (B:30g W:0g T:8g)
Ryż gotowany: 130 kcal/100g (B:3g W:28g T:0g)
Makaron gotowany: 160 kcal/100g (B:6g W:31g T:1g)
Ziemniaki gotowane: 87 kcal/100g (B:2g W:20g T:0g)
Zupa pomidorowa: 45 kcal/100ml
Zupa rosół: 25 kcal/100ml
Banan: 89 kcal/100g
Jabłko: 52 kcal/100g
Twaróg: 98 kcal/100g (B:12g W:3g T:4g)
Jogurt naturalny: 59 kcal/100g (B:3g W:5g T:3g)
Płatki owsiane suche: 370 kcal/100g (B:13g W:62g T:7g)
Łosoś: 208 kcal/100g (B:20g W:0g T:14g)
Mięso mielone smażone: 250 kcal/100g (B:22g W:0g T:18g)
Olej/oliwa: 900 kcal/100g
Dla każdego produktu którego nie ma powyżej: użyj dokładnych wartości z bazy USDA FoodData Central. Jeśli produkt jest nieznany lub trudny do zidentyfikowania, użyj najbliższego odpowiednika z USDA i zaznacz confidence jako niska.
 
KROK 3 - ZSUMUJ I SPRAWDŹ LOGIKĘ:
- 1 kanapka (kromka 30g + masło 5g + wędlina 20g) = ok. 180-220 kcal
- 4 kanapki = 720-880 kcal
- Talerz zupy 300ml = 75-150 kcal
- Porcja ryżu z kurczakiem = 450-600 kcal
- Jeśli wynik wydaje się za wysoki lub za niski - przelicz ponownie
 
WAŻNE: Odpowiedz WYŁĄCZNIE jedną linią JSON bez żadnych spacji, enterów ani tekstu przed lub po. Wszystkie wartości tekstowe w jednej linii:
{"name":"nazwa po polsku","portion":"X g","kcal":0,"protein":0.0,"carbs":0.0,"fat":0.0,"fiber":0.0,"confidence":"wysoka","tip":"krotka wskazowka"}`;
 
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
 
