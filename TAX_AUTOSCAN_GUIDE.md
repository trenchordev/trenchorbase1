# 🚀 Tax Auto-Scan System - Kullanım Kılavuzu

## 📋 Sistem Özellikleri

Tax Auto-Scan sistemi, bir token eklendiğinde otomatik olarak **2940 blok (~98 dakika)** boyunca vergili işlemleri tarayıp leaderboard'a kaydeden bir arka plan işleme sistemidir.

### ✨ Özellikler

- ✅ **Otomatik Tarama**: Token eklendiğinde 98 dakika boyunca sürekli tarama
- ✅ **Blok Atlamaz**: Her blok sırayla taranır, hiçbir işlem kaçmaz
- ✅ **Vercel Timeout Güvenli**: Her cron çalışması 60 saniye içinde biter
- ✅ **Real-time Leaderboard**: Her dakika güncellenl leaderboard
- ✅ **Progress Tracking**: Admin panelde canlı ilerleme takibi
- ✅ **Pause/Resume**: İstediğiniz zaman durdurabilir ve devam ettirebilirsiniz

## 🏗️ Mimari

```
Token Ekleme (Admin Panel)
    ↓
Start Auto-Scan API
    ↓
Redis Job Queue (Job Created)
    ↓
Vercel Cron (Her 1 dakika çalışır)
    ↓
5-10 Blok Tarama (Timeout safe)
    ↓
Leaderboard Güncelleme (Incremental)
    ↓
2940 Blok Tamamlandı → Job Complete
```

### 🔧 Teknik Detaylar

- **Block Scanning Rate**: 5-10 blok/dakika
- **Total Duration**: 2940 blok = ~98 dakika (Base network)
- **Cron Interval**: Her 1 dakika
- **Timeout Safety**: Her scan maksimum 60 saniye
- **Data Storage**: Redis Sorted Sets (incremental updates)

## 📦 Kurulum

### 1. Gerekli Dosyalar

Oluşturulan yeni dosyalar:
```
src/
  lib/
    taxScanJobManager.js         # Job management logic
  app/
    api/
      cron/
        tax-scanner/
          route.js                # Cron worker endpoint
      admin/
        start-auto-scan/
          route.js                # Start auto-scan
        stop-auto-scan/
          route.js                # Stop auto-scan
        resume-auto-scan/
          route.js                # Resume auto-scan
        job-status/
          route.js                # Get job status
```

### 2. Environment Variables

`.env` dosyanıza ekleyin:

```bash
# Cron Security (Production'da MUTLAKA kullanın!)
CRON_SECRET=your_random_secure_secret_here_12345

# RPC Endpoints (Infura önerilir)
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
INFURA_API_KEY=your_infura_api_key_here
NEXT_PUBLIC_INFURA_API_KEY=your_infura_api_key_here

# Redis & Admin (zaten mevcutsa değiştirmeyin)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
ADMIN_PASSWORD=your_secure_admin_password
```

### 3. Vercel Cron Aktifleştirme

`vercel.json` güncellenmiştir:

```json
{
  "crons": [
    {
      "path": "/api/cron/tax-scanner",
      "schedule": "* * * * *"
    }
  ]
}
```

Bu cron **her 1 dakikada bir** çalışır ve aktif job'ları işler.

### 4. Deploy

```bash
# Git commit & push
git add .
git commit -m "feat: Add tax auto-scan system"
git push

# Vercel'de otomatik deploy olacak
# Cron'lar otomatik aktif olur
```

## 🎯 Kullanım

### Admin Panel'den Auto-Scan Başlatma

1. **Admin Panel → Tax Campaigns sekmesi**
2. Bir campaign seçin
3. **"▶ AUTO-SCAN"** butonuna tıklayın
4. Onay verin

**Sistem otomatik olarak:**
- Current block'u alır
- 2940 blok ileri hesaplar (end block)
- Redis'te job oluşturur
- Her dakika cron worker tarafından işlenir

### Job Status Takibi

Admin panelde campaign kartında:
- **🟢 SCANNING**: Aktif olarak taranıyor
- **Progress Bar**: Tamamlanan blok yüzdesi
- **Remaining Time**: Tahmini kalan süre
- **Leaderboard**: Real-time güncelleniyor

### Manuel Kontrol

```bash
# Job durumlarını görmek için
# Admin panel otomatik 10 saniyede bir günceller
# Veya tarayıcı console'da:
fetch('/api/admin/job-status').then(r => r.json()).then(console.log)
```

### Pause/Resume

- **⏸ STOP**: Taramayı geçici olarak durdurur
- **▶ RESUME**: Kaldığı yerden devam eder
- Progress kaybolmaz, aynı bloktan devam eder

## 🔍 API Endpoints

### Start Auto-Scan
```bash
POST /api/admin/start-auto-scan
Body: { "campaignId": "your-campaign-id" }
Auth: Admin cookie required
```

### Stop Auto-Scan
```bash
POST /api/admin/stop-auto-scan
Body: { "campaignId": "your-campaign-id" }
Auth: Admin cookie required
```

### Resume Auto-Scan
```bash
POST /api/admin/resume-auto-scan
Body: { "campaignId": "your-campaign-id" }
Auth: Admin cookie required
```

### Get Job Status
```bash
GET /api/admin/job-status?campaignId=your-campaign-id
Auth: Admin cookie required

# Veya tüm job'lar için:
GET /api/admin/job-status
```

### Cron Worker (Vercel tarafından çağrılır)
```bash
GET /api/cron/tax-scanner
Header: Authorization: Bearer CRON_SECRET
```

## 📊 Redis Data Structure

### Job Data
```
Key: tax-scan-job:{campaignId}
Type: Hash
Data: {
  campaignId,
  targetToken,
  taxWallet,
  startBlock,
  currentBlock,
  endBlock,
  status: 'active' | 'completed' | 'stopped' | 'failed',
  createdAt,
  lastScanAt,
  totalScanned,
  errorCount
}
```

### Active Jobs Set
```
Key: tax-scan-jobs:active
Type: Set
Members: [campaignId1, campaignId2, ...]
```

### Leaderboard (mevcut yapı - değişmedi)
```
Key: tax-leaderboard:{campaignId}
Type: Sorted Set
Score: taxPaidVirtual (float)
Member: walletAddress
```

## 🛠️ Troubleshooting

### Cron Çalışmıyor

**Problem**: Job başlatıldı ama ilerleme yok

**Çözüm**:
1. Vercel Dashboard → Cron Jobs → Logs kontrol edin
2. `CRON_SECRET` environment variable doğru set edilmiş mi?
3. Vercel'de cron aktif mi? (Hobby plan'da limit var)

```bash
# Test etmek için manual trigger:
curl https://your-domain.vercel.app/api/cron/tax-scanner \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### RPC Rate Limiting

**Problem**: "Too many requests" hatası

**Çözüm**:
1. Infura API key kullanın (ücretsiz 100k request/day)
2. `INFURA_API_KEY` environment variable ekleyin
3. Gerekirse cron interval'i artırın (2 dakikada bir)

### Job Stuck

**Problem**: Job "active" ama ilerlemiyor

**Çözüm**:
```bash
# Redis'ten job'u kontrol edin
# Admin panel'den STOP → RESUME deneyin
# Veya manual olarak job silin ve yeniden başlatın
```

## 📈 Performance Optimization

### RPC Seçimi

**Öncelik Sırası**:
1. **Infura** (en hızlı, batch support)
2. **Alchemy** (hızlı, limit cömert)
3. **Public RPC** (yavaş, rate limit var)

### Scan Interval Ayarlama

`vercel.json` içinde:
```json
{
  "schedule": "* * * * *"      // Her 1 dakika
  "schedule": "*/2 * * * *"    // Her 2 dakika
  "schedule": "*/5 * * * *"    // Her 5 dakika
}
```

Daha uzun interval = Daha az RPC call = Daha geç tamamlanma

### Block Chunk Size

`taxScanJobManager.js` içinde:
```javascript
const BLOCKS_PER_SCAN = 5;  // Varsayılan: 5 blok/scan
// Artırabilirsiniz: 10, 20 (RPC limit'e dikkat!)
```

## 🎛️ İleri Seviye Konfigürasyon

### Farklı Scan Süreleri

98 dakika yerine farklı süre istiyorsanız:

`taxScanJobManager.js` düzenleyin:
```javascript
const MAX_BLOCKS_PER_CAMPAIGN = 2940; // 98 dakika
// Değiştirin:
const MAX_BLOCKS_PER_CAMPAIGN = 1470; // 49 dakika
const MAX_BLOCKS_PER_CAMPAIGN = 5880; // 196 dakika (3+ saat)
```

### Error Handling

System otomatik retry yapar:
- 10 consecutive error → Job "failed" durumuna geçer
- Admin panel'den RESUME ile yeniden başlatılabilir

### Monitoring

Production'da izleme için:
- Vercel Logs (Cron execution logs)
- Redis monitoring (Upstash dashboard)
- Custom alerts (email/slack notification ekleyebilirsiniz)

## 🔒 Güvenlik

### Cron Endpoint Protection

**ÖNEMLİ**: Production'da mutlaka `CRON_SECRET` kullanın!

```bash
# .env dosyasına güçlü bir secret ekleyin
CRON_SECRET=$(openssl rand -base64 32)
```

Vercel otomatik olarak cron çağrılarına bu secret'i ekler.

### Admin Authentication

Tüm control endpoint'leri admin cookie kontrolü yapar:
- start-auto-scan
- stop-auto-scan
- resume-auto-scan
- job-status

## 🆘 Destek

### Log Kontrolü

**Vercel Dashboard**:
1. Functions → Logs
2. Filter: `/api/cron/tax-scanner`
3. Son 1 saat içindeki execution'ları görün

**Console Logs**:
- `[Cron]` prefix: Worker logs
- `[Job Manager]` prefix: Job management logs
- `[Scan]` prefix: Blockchain scanning logs

### Debug Mode

Admin panel'de **DEBUG** butonu ile:
- Hangi bloklar taranıyor
- Kaç transfer bulunuyor
- Filtreleme nasıl çalışıyor

## 📝 Changelog

### v2.0.0 - Tax Auto-Scan System
- ✨ Otomatik 98 dakika tarama
- ✨ Redis job queue
- ✨ Vercel cron integration
- ✨ Real-time progress tracking
- ✨ Pause/Resume support
- ✨ Admin panel UI improvements

---

**🎉 Sistem Hazır! Herhangi bir sorun olursa yukarıdaki troubleshooting adımlarını takip edin.**
