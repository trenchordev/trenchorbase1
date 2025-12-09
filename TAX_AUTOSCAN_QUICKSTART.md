# 🚀 Tax Auto-Scan - Hızlı Başlangıç

## ⚡ 5 Dakikada Kurulum

### 1️⃣ Environment Variables Ekle

`.env` dosyanıza ekleyin:

```bash
CRON_SECRET=your_random_secret_12345
```

> Diğer environment variable'lar zaten mevcutsa dokunmayın.

### 2️⃣ Deploy Et

```bash
git add .
git commit -m "feat: Add tax auto-scan system"
git push
```

Vercel otomatik deploy edecek ve cron'u aktif edecek.

### 3️⃣ Kullan

1. **Admin Panel** → Tax Campaigns
2. Bir campaign seç
3. **"▶ AUTO-SCAN"** butonuna tıkla
4. Sistem 98 dakika boyunca otomatik tarayacak! 🎉

---

## 📊 Ne Yapar?

- ✅ Her 1 dakikada 5-10 blok tarar
- ✅ Toplam 2940 blok = ~98 dakika
- ✅ Leaderboard real-time güncellenir
- ✅ Hiçbir blok atlanmaz
- ✅ Vercel timeout'ına takılmaz

---

## 🎛️ Kontroller

| Buton | Açıklama |
|-------|----------|
| **▶ AUTO-SCAN** | Otomatik taramayı başlat |
| **⏸ STOP** | Geçici durdur |
| **▶ RESUME** | Devam et |
| **MANUAL SCAN** | Tek seferlik manuel tarama (eski sistem) |
| **VIEW** | Leaderboard'u görüntüle |

---

## 🔍 Monitoring

Admin panel'de her campaign kartında:
- 🟢 **SCANNING**: Aktif tarama
- 📊 **Progress Bar**: İlerleme yüzdesi
- ⏱️ **Remaining Time**: Kalan süre

System otomatik olarak 10 saniyede bir günceller.

---

## ❓ Sorun Giderme

### Cron çalışmıyor?

```bash
# Manuel test et:
curl https://your-domain.vercel.app/api/cron/tax-scanner \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Vercel Dashboard → Cron Jobs → Logs'u kontrol et.

### RPC rate limit?

Infura API key ekle:
```bash
INFURA_API_KEY=your_key_here
```

---

## 📖 Detaylı Dokümantasyon

Daha fazla bilgi için: **[TAX_AUTOSCAN_GUIDE.md](./TAX_AUTOSCAN_GUIDE.md)**

---

**🎉 Hazırsın! Sistem şimdi tam otomatik çalışacak.**
