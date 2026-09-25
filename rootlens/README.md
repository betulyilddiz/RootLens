# RootLens — Mikroservis Kök Neden Analizi

RootLens, mikroservis sistemlerinde oluşan hata ve yavaşlıkları metrik, log ve trace verilerini birlikte inceleyerek açıklayan bir gözlemlenebilirlik platformudur.

## Bu sürümde neler var?

- Profesyonel, sade kontrol paneli: Genel Bakış, Olaylar, Telemetri Kaynakları ve Sistem Bağla sayfaları
- Otomatik izleme: RootLens bağlı kaynakları varsayılan olarak 30 saniyede bir denetler
- Genel bağlantı yapısı: Prometheus, Jaeger ve OpenSearch adresleri **Sistem Bağla** sayfasından düzenlenebilir
- Astronomy Shop entegrasyonu: Açık kaynaklı mikroservis test sistemiyle gerçek çalışma verisinin alınması

## Çalıştırma

Önce `astronomy-shop` klasöründe:

```powershell
docker compose -f compose.yaml -f compose.observability.yaml up
```

Yeni terminalde yine aynı klasörde:

```powershell
docker compose -f compose.rootlens.yaml up --build
```

RootLens: http://localhost:5173

## Kullanım

RootLens açılır açılmaz kaynakları otomatik kontrol eder. **Şimdi yenile** isteğe bağlı anlık kontroldür. **Sistem Bağla** sayfası, başka bir mikroservis sisteminin Prometheus, Jaeger ve log adreslerini tanımlamak içindir.

Normal kullanıcı hata üretmez. Kontrollü hata senaryoları yalnızca proje ekibinin test/doğrulama sürecinde kullanılacaktır.
