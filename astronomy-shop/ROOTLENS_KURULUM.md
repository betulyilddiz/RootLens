# RootLens ile gerçek telemetri toplama

Bu klasör, resmi OpenTelemetry Astronomy Shop Demo'nun kaynak kodudur. RootLens için test edilen gerçek mikroservis sistemidir.

## 1. Astronomy Shop'u çalıştır

Docker Desktop açıkken bu klasörde:

```bash
docker compose -f compose.yaml -f compose.observability.yaml up --build
```

Bu işlem ürün, sepet, ödeme, kargo gibi servisleri; Prometheus metrik sistemini, Jaeger trace sistemini ve OpenSearch log sistemini çalıştırır.

## 2. RootLens köprüsünü çalıştır

Yeni bir terminal açın ve yine bu klasörde:

```bash
docker compose -f compose.rootlens.yaml up --build
```

RootLens: http://localhost:5173

## 3. Gerçek veriyi al

1. Astronomy Shop sitesinde birkaç işlem yapın. Sistem kendi servislerinden telemetri üretir.
2. RootLens ekranında **Gerçek Verileri Çek** butonuna basın.
3. RootLens Prometheus'tan canlı hedef metriklerini, Jaeger'dan izlenen servisleri ve OpenSearch'ten log indekslerini sorgular.

Not: Bu demo Docker kaynakları açısından ağır olabilir. İlk çalıştırmada imajların inmesi ve servislerin ayağa kalkması zaman alabilir.
