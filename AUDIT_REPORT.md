# FokusTrack v4.6.1 — Laporan Audit Pemeliharaan Final

Tanggal audit: 26 November 2026  
Basis audit: source `FokusTrack-v4.5-source.zip` yang diunggah pada percakapan ini.  
Tujuan: pemeliharaan pra-deployment, perbaikan bug, validasi data, pengurangan pekerjaan berulang, dan penguatan integrasi Push.

## Ringkasan hasil

Source dinaikkan dari v4.5 ke **v4.6.0 Final Maintenance**. Perubahan mencakup logika streak, pengelolaan timer, antrean alarm, penyimpanan/migrasi, validasi data keuangan, paginasi daftar, penghitungan grafik, dan ketahanan companion Push Server.

Hasil tes otomatis yang dapat dijalankan: **21/21 lulus**. Parser TypeScript/TSX: **22 file lolos** menggunakan TypeScript compiler global 5.8.3. Pemeriksaan sintaks JavaScript Node dan validasi JSON juga lulus.

**Status rilis:** source telah diperiksa dan diperbaiki, tetapi belum dapat dinyatakan 100% bebas bug atau production-ready sebelum build dependency penuh, tes browser, tes Push nyata, dan pengujian perangkat Android dilakukan. Dependensi proyek tidak tersedia di lingkungan audit; percobaan instalasi offline gagal karena paket tidak ada di cache npm.

## Temuan utama v4.5 dan perbaikannya

| Prioritas | Area | Risiko/bug yang ditemukan | Perbaikan v4.6.0 |
|---|---|---|---|
| Kritis | Konsistensi/Streak | Aktivitas selesai setelah tengah malam dihitung pada tanggal jadwal, bukan tanggal penyelesaian aktual | Perhitungan streak mengutamakan `completedAt` dan memakai tanggal lokal perangkat |
| Kritis | Timer/Recovery | Penanda sesi pemulihan bisa dibersihkan sebelum record sesi benar-benar berhasil disimpan | Penanda tetap aktif sampai data sesi dengan ID stabil berhasil masuk ke snapshot lokal |
| Kritis | Reset total | Kunci timer/data migrasi lama bisa tersisa dan berpotensi dipulihkan kembali setelah reset | Reset menghapus key v4/v3 dan timer v4.6/v4.5 yang relevan |
| Tinggi | Antrean Alarm | Menandai alarm saat ini selesai dapat membuang alarm berikutnya | Penghapusan antrean berdasarkan ID alarm; tes regresi ditambahkan |
| Tinggi | Alarm bersamaan | Batas antrean 50 membuat reminder tambahan ditandai sudah dipicu tetapi tidak ditampilkan | Semua reminder due dipertahankan; penambahan queue dan reset snooze dibatch agar tidak memicu ribuan render |
| Tinggi | Reminder foreground | Pemindaian semua kegiatan setiap detik menyebabkan kerja CPU berulang | Scheduler menunggu deadline reminder terdekat dengan satu timeout, lalu bangun ulang saat fokus/visibility berubah |
| Tinggi | Reminder terlambat | Catch-up lokal memiliki grace 10 menit; lebih lama sengaja dilewati | Kebijakan dipertahankan dan didokumentasikan agar reminder lama tidak membanjiri pengguna. Ini batas desain, bukan jaminan replay |
| Tinggi | Push Server | Error dari PushSubscription lama bisa menghapus subscription baru yang sudah terdaftar | Penghapusan device kini hanya jika endpoint dan key subscription masih sama dengan subscription yang gagal |
| Tinggi | Push Server | Pengiriman yang sedang berjalan dapat menandai jadwal baru sebagai terkirim jika ID reminder dipakai ulang | Server membandingkan fingerprint payload jadwal sebelum mengubah status kirim/retry |
| Tinggi | Push Server | URL request cacat dapat melempar error saat parsing | Parsing URL dibungkus dan dijawab HTTP 400 |
| Tinggi | Push Server | Revision sinkronisasi sama dapat menimpa jadwal yang sudah tersimpan | Revision duplikat maupun lebih lama ditolak |
| Tinggi | Penyimpanan | Kesalahan `localStorage` dapat tidak terlihat atau status error timer menutupi error data | Error data dan timer dipisah; pemulihan dari snapshot rusak dan timer invalid ditandai pada UI |
| Menengah | Pusat Pengingat | Semua jadwal hari ini dirender sekaligus | Paginasi 25 item, muat bertahap |
| Menengah | Beranda/Kalender/Fokus/Keuangan | Daftar besar dirender sekaligus | Paginasi daftar 50 item per langkah |
| Menengah | Keuangan | Agregasi grafik melakukan scan transaksi berulang untuk setiap hari | Grafik 7 hari dihitung satu kali lintas transaksi dan hanya menampilkan tinggi batang jika nilai > 0 |
| Menengah | Keuangan | Kategori transaksi pemasukan/pengeluaran dan nilai jumlah rawan data tidak valid | Nilai harus integer aman dan positif; kategori divalidasi sesuai tipe transaksi |
| Menengah | Sample Data | Data contoh bisa menimpa atau menggandakan data pengguna | Fixture contoh ditambahkan tanpa menimpa data dan dicegah dari duplikasi; jadwal contoh dipindahkan ke besok |
| Menengah | Skrip audit server | `server/package.json` menunjuk ke folder tes dan skrip audit yang tidak tersedia | Skrip server disederhanakan ke pemeriksaan sintaks file yang benar |
| Menengah | Hosting | Push Server berupa proses Node aktif dan file JSON lokal, tidak cocok untuk Vercel serverless | Dokumentasi deploy dipertegas: frontend di Vercel, Push Server di host Node always-on dengan disk persisten |

## Pemeriksaan per modul

### Beranda

- Daftar aktivitas hari ini menggunakan paginasi 50.
- Pencarian kegiatan berikutnya menggunakan daftar yang sudah terurut, menghindari sort tambahan.
- Status aktivitas dan timer tetap memakai state pusat.
- Batas: daftar aktivitas memiliki maksimum 10.000 record; ketika batas tercapai, penambahan baru ditolak tanpa menghapus record lama.

### Fokus dan timer custom

- Durasi custom tetap tersedia dari 1 menit sampai 12 jam.
- Hitung mundur menggunakan deadline absolut dan pembaruan UI per detik, bukan akumulasi interval 250 ms.
- Timer dapat melanjutkan sisa waktu setelah refresh/reopen.
- Pemulihan timer yang selesai ketika PWA tertutup membuat record dengan ID sesi stabil agar tidak menggandakan sesi.
- Riwayat sesi ditampilkan bertahap 50.
- Penyelesaian manual menghitung menit penuh yang benar-benar dijalani; durasi di bawah satu menit tidak dicatat sebagai sesi.
- Batas platform: tidak ada jaminan suara alarm timer tepat pada waktunya ketika PWA benar-benar dihentikan. Sesi direkonsiliasi saat aplikasi dibuka kembali.

### Kalender dan alarm

- Validasi tanggal, jam, dan rentang waktu; jadwal lintas tengah malam belum didukung dan ditolak.
- Kegiatan tersortir menurut tanggal dan jam mulai.
- Pengingat foreground menunggu deadline terdekat, dengan wake-up saat tab kembali fokus/visible.
- Snooze dihapus setelah pemicu benar-benar diproses.
- Semua reminder yang due dipertahankan dalam antrean agar tidak hilang ketika banyak kegiatan memiliki jam yang sama.
- Pusat Pengingat hanya merender 25 entri awal dan bisa dimuat bertahap.
- Grace reminder lokal 10 menit: reminder yang lebih lama ditandai sudah diproses dan tidak diputar ulang.

### Keuangan

- Input jumlah harus integer aman, positif, dan masuk kategori yang diperbolehkan untuk tipe pemasukan/pengeluaran.
- Grafik 7 hari memakai satu pass agregasi.
- Transaksi ditampilkan 50 per batch.
- Rasio tabungan tetap negatif saat pengeluaran lebih besar daripada pemasukan; kondisi overspending tidak disembunyikan sebagai 0%.
- Catatan transaksi tetap lokal, tidak dikirim ke Push Server.

### Penyimpanan, migrasi, backup

- Data v3 dan v4 dinormalisasi dengan batas record dan validasi tiap tipe record.
- ID duplikat dipulihkan agar setiap record memiliki ID unik.
- Error penulisan data dan timer dicatat terpisah.
- Jika snapshot tersimpan rusak dan fallback lama dipakai, UI menampilkan peringatan pemulihan.
- Reset total menghapus snapshot migrasi lama dan kunci timer lama agar tidak muncul kembali.
- Restore backup dibatasi 10 MB, ekspor menggunakan JSON ringkas, dan transaksi/sesi tidak valid ditolak; data diganti setelah konfirmasi dari UI.
- Batas: `localStorage` bukan database transaksional, tidak terenkripsi, dan tidak memiliki resolusi konflik kuat untuk edit bersamaan dari banyak tab.

### Push Server dan Service Worker

- Endpoint subscription dibatasi ke HTTPS dan host layanan Push browser yang dikenal untuk mengurangi risiko SSRF.
- ID device divalidasi, objek database memakai null prototype, dan token API dibandingkan secara timing-safe.
- Jalur klik notifikasi dibatasi ke relative same-origin path.
- Batas perangkat 250 dan reminder aktif 200 per perangkat.
- Revision sinkronisasi duplikat/usang ditolak.
- Error subscription lama tidak menghapus subscription baru.
- Status terkirim/retry hanya diperbarui untuk payload yang sama dengan pekerjaan yang sedang dikirim.
- Server tetap menggunakan satu proses Node dan file JSON lokal. Harus always-on, satu instance, disk persisten. Tidak cocok untuk Vercel Functions, scale-to-zero, atau multi-instance tanpa database/queue.
- Push yang sudah lewat lebih dari 10 menit saat server kembali aktif akan dilewati.

## Pengujian yang berhasil

| Pengujian | Hasil |
|---|---|
| Unit tests Node (`node --test tests/*.test.mjs`) | **21/21 lulus** |
| Custom Focus Timer | **6 tes lulus**: 1 menit/12 jam, input invalid, label, format jam, deadline, menit selesai manual |
| Streak dan agregasi keuangan | **6 tes lulus**: tanggal penyelesaian lintas tengah malam, streak terputus, reset, >365 hari, grafik, local date |
| Alarm queue | **3 tes lulus**: hanya alarm saat ini dihapus, dismiss/snooze, antrean kosong |
| Push guards | **2 tes lulus**: stale subscription dan in-flight reminder tidak menimpa jadwal baru |
| Push security | **4 tes lulus**: ID device, path klik, host Push, subscription key |
| Parser TypeScript/TSX | **22 berkas tanpa parse diagnostic** dengan compiler global TypeScript 5.8.3 |
| Node syntax | `server/index.mjs`, `server/security.mjs`, generator VAPID, dan `public/push-handler.js` lolos `node --check` |
| JSON config | `package.json`, `server/package.json`, `vercel.json` valid |
| ZIP | Validasi struktur arsip dilakukan sebelum rilis |

## Belum terverifikasi

1. `npm install` dan `npm run build` penuh: gagal diverifikasi karena dependency tidak tersedia di cache/npm dalam lingkungan audit. Tanpa build penuh, belum dapat memastikan seluruh error integrasi TypeScript/Vite terselesaikan.
2. UI runtime di Chrome Android, Safari iOS, Firefox, atau browser lain belum diuji langsung.
3. Web Push end-to-end belum diuji dengan VAPID keys, domain HTTPS, dan perangkat target.
4. Restart server, disk penuh, koneksi putus, baterai saver Android, dan izin notifikasi dicabut belum diuji pada hosting nyata.
5. Load test 10.000 aktivitas / 50.000 transaksi belum dijalankan.

## Batasan yang harus dipahami sebelum rilis

- PWA + Web Push tidak dapat menjamin alarm keras, berulang, layar penuh, atau tepat waktu seperti alarm native Android. Pengiriman bergantung browser, OS, Push Service, jaringan, permission, dan battery optimization.
- Timer fokus yang melewati deadline saat aplikasi ditutup direkam ketika aplikasi dibuka lagi; notifikasi timer latar belakang belum dijadwalkan via Push Server.
- Data utama tersimpan lokal pada satu browser/perangkat. Tidak ada akun, cloud sync, multi-device replication, atau database cloud.
- Push Server adalah service sederhana untuk pemakaian personal/kecil. Untuk multi-user perlu autentikasi akun, database transaksional, job queue, observability, backup, dan kebijakan retensi data.

## Rekomendasi gate sebelum production

1. Pasang dependency dengan `npm install`, commit `package-lock.json`, jalankan `npm test`, `npm run audit:syntax`, dan `npm run build` hingga semuanya lulus.
2. Deploy frontend Vercel + Push Server Node always-on dengan HTTPS, disk persisten, `APP_ORIGIN` tepat, serta VAPID key yang cocok.
3. Tes di Android: timer 1 menit, 1 jam dan 12 jam; refresh ketika timer berjalan; selesai manual; reset total; restore backup; beberapa alarm bersamaan; snooze; alarm saat aplikasi tertutup; server restart.
4. Backup data sebelum upgrade dan verifikasi data setelah deploy.

**Kesimpulan:** source v4.6.1 membawa patch kompatibilitas build di atas perbaikan v4.6.0 dan telah menerima pemeriksaan statis/unit yang tersedia. Rilis ini layak untuk masuk tahap staging/pengujian perangkat, tetapi belum boleh diklaim bebas bug atau fully production-verified sebelum build dependency dan tes end-to-end selesai.


## Patch kompatibilitas deployment v4.6.1

Build Vercel v4.6.0 yang dijalankan dengan TypeScript strict melaporkan tiga error: dua strict-nullability diagnostics pada `src/context/AppContext.tsx` dan satu `BufferSource` typing diagnostic pada `src/utils/push.ts`.

Perbaikan pada v4.6.1:

- `loadInitialData()` mengulang pemeriksaan `Array.isArray()` terhadap `parsed.activities` dan `parsed.transactions` setelah normalisasi sehingga TypeScript dapat mempersempit tipe JSON secara aman sebelum membaca `length`/`some()`.
- `decodeBase64Url()` mengembalikan `ArrayBuffer` konkret untuk `PushManager.subscribe({ applicationServerKey })`; buffer tersebut bukan `SharedArrayBuffer`-capable `ArrayBufferLike`.
- Node engine frontend dan companion server ditetapkan ke `22.x` agar runtime deployment konsisten.

Pemeriksaan tambahan patch v4.6.1:

| Pemeriksaan | Hasil |
|---|---|
| TypeScript strict check terarah untuk `AppContext.tsx` dan `push.ts` dengan deklarasi React sementara | Lulus |
| Parser TypeScript/TSX | 22 file lolos |
| Unit tests | 21/21 lulus |
| Audit sintaks server dan Service Worker | Lulus |
| JSON config | Valid |

Build penuh `tsc -b && vite build` tetap perlu dikonfirmasi di Vercel setelah dependensi terpasang. Akses npm registry pada lingkungan patch gagal dengan DNS `EAI_AGAIN`, sehingga integrasi seluruh dependency belum bisa diuji di sini.
