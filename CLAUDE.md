# UxGsol Twitter İçerik Asistanı

## Proje Amacı
Bu proje @UxGsol hesabı için otomatik içerik üretim ve analiz sistemidir.
Sistem her gün kripto/teknoloji trendlerini tarar, başarılı hesapları analiz eder
ve @UxGsol'un tarzında tweet taslakları üretir.

## Hesap Bilgileri
- Twitter: @UxGsol
- Niche: Kripto Twitter, DeFi, teknoloji, ecosystem tracking
- Dil: İngilizce
- Takipçi: ~88K
- Hedef kitle: Kripto yatırımcıları, DeFi kullanıcıları, tech meraklıları

## UxGsol'un Tweet Tarzı
Başarılı tweet formatları (1.7M görüntülenme alan Polymarket örneğine göre):

### Format 1: "Crazy Story" (EN ETKİLİ)
```
[Şok edici/merak uyandıran başlık - 1 cümle]

[Kim / Ne oldu - 1-2 cümle]

[Nasıl yaptı - 2-3 cümle]

[Sonuç / Twist]

[İlgili görsel veya kaynak]
```
Örnek: "This guy literally hacked Polymarket with a hair dryer..."

### Format 2: "Hidden Info / Timeline"
```
[Az bilinen tarihi veya teknik detay]

[Tarihler ve adımlar - bullet list]

[Neden önemli - 1 cümle]
```

### Format 3: "Unpopular Truth"
```
Not sure who needs to hear this, but [cesur görüş]

[Neden - 2-3 cümle]

[Kanıt veya örnek]
```

### Format 4: "Data Reveal"
```
[Şaşırtıcı veri veya sıralama - 1 cümle]

[Bağlam - 1-2 cümle]

[Görsel: chart, tablo, screenshot]
```

## Takip Edilecek Referans Hesaplar
Bu hesapların başarılı formatlarını analiz et:
- @loshmi (41K - content creator, daytrading)
- @0xSweep (244K - Finance, Crypto & Tech)
- @Jeremybtc (büyük hesap - BTC analizi)
- @waleswoosh (270K - NFT, ekosistem)
- @StarPlatinum_ (97K - kripto tarihi, analiz)

## Sistem Görevleri

### Görev 1: Günlük Trend Tarama
Her çalıştırıldığında şu kaynakları tara:
- https://cryptopanic.com (kripto haberleri)
- https://decrypt.co (kripto haber)
- https://thedefiant.io (DeFi haberleri)
- X trending topics (kripto kategorisi)

Hedef: Bugün viral olabilecek 5-10 konu bul.

### Görev 2: Referans Hesap Analizi
Referans hesapların son 10 tweetini analiz et:
- Görüntülenme, like, RT sayılarını kaydet
- En çok etkileşim alan tweet formatını belirle
- "Bu hafta çalışan format" raporu çıkar

### Görev 3: Tweet Taslağı Üretimi
Bulunan trendler + başarılı formatları birleştirerek:
- Her format için 1-2 tweet taslağı yaz
- Toplamda günlük 5 tweet önerisi hazırla
- Her taslak için tahmini etkileşim potansiyeli belirt (Yüksek/Orta/Düşük)

### Görev 4: Haftalık Analiz Raporu
Haftada bir @UxGsol'un kendi performansını analiz et:
- Hangi tweetler en iyi performans gösterdi
- Hangi format/saat/konu daha iyi çalışıyor
- Gelecek hafta için strateji önerisi

## Çıktı Formatı

Her günlük çalıştırmada şu raporu üret:

```
=== UxGsol Günlük İçerik Raporu - [TARİH] ===

📊 BUGÜNÜN TREND KONULARI:
1. [Konu] - [Kaynak] - [Neden önemli]
2. ...

🔥 REFERANS HESAPLARDA BU HAFTA EN ÇOK ÇALIŞAN:
- Format: [format adı]
- Örnek: [hesap] - "[tweet özeti]" - [etkileşim sayısı]

✍️ BUGÜNÜN TWEET ÖNERİLERİ:

--- Öneri 1 [Format: Crazy Story] [Potansiyel: YÜKSEK] ---
[Tweet metni buraya - 280 karakter max]

--- Öneri 2 [Format: Hidden Info] [Potansiyel: ORTA] ---
[Tweet metni buraya]

--- Öneri 3 [Format: Unpopular Truth] [Potansiyel: YÜKSEK] ---
[Tweet metni buraya]

--- Öneri 4 [Format: Data Reveal] [Potansiyel: ORTA] ---
[Tweet metni buraya]

--- Öneri 5 [Format: Crazy Story] [Potansiyel: YÜKSEK] ---
[Tweet metni buraya]

💡 BUGÜNÜN TAVSİYESİ:
[Bugün ne zaman, hangi formatta paylaşmalı - 1 paragraf]
```

## Önemli Kurallar
1. Tweet'leri otomatik ATMA — sadece taslak hazırla, kullanıcı onaylasın
2. Tüm tweetler İngilizce olmalı
3. Clickbait değil, gerçek ve ilginç içerik üret
4. UxGsol'un sesini yakala: direkt, bilgilendirici, hafif edgy
5. Kaynak olmadan veri paylaşma
6. Her tweet taslağı 280 karakter limitini aşmamalı (thread ise belirt)

## Çalıştırma Talimatı
Claude Code'da şunu söyle:
"Run the daily content report for UxGsol"

veya Türkçe:
"Günlük içerik raporunu hazırla"

## Dosya Yapısı
```
uxgsol-assistant/
├── CLAUDE.md          ← Bu dosya (Claude Code talimatları)
├── reports/           ← Günlük raporlar buraya kaydedilir
│   └── 2025-04-25.md
├── analysis/          ← Haftalık analizler
└── templates/         ← Tweet şablonları
```

## Kurulum Notları
- Python 3.x gerekli
- pip install requests beautifulsoup4 anthropic
- Anthropic API key: ANTHROPIC_API_KEY environment variable olarak set et
- İlk çalıştırmada: `claude "Run daily content report for UxGsol"`
