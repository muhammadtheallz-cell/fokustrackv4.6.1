# FokusTrack v4.6.1 — Build Compatibility Patch

FokusTrack adalah Progressive Web App (PWA) mobile-first untuk mengelola kegiatan, pengingat, sesi fokus, konsistensi, dan catatan keuangan pribadi.

## Arsitektur

- **Frontend PWA:** React 19, TypeScript, Vite, dan Workbox. Dapat di-host sebagai situs statis HTTPS, termasuk di Vercel.
- **Penyimpanan aplikasi:** `localStorage` pada browser/perangkat. Data kegiatan, transaksi, pengaturan, dan sesi fokus tidak otomatis tersinkron ke perangkat lain.
- **Focus timer:** durasi preset atau custom 1 menit sampai 12 jam. Timer memakai deadline absolut dan menyimpan state lokal.
- **Background reminders:** Web Push melalui companion server Node.js yang harus terus aktif dan memiliki disk persisten. Server ini bukan bagian dari Vercel static hosting.

## Menjalankan frontend secara lokal

Prasyarat: Node.js **22.x** dan npm.

```bash
npm install
npm run dev
```

Buka URL lokal yang ditampilkan Vite.

## Pemeriksaan lokal

```bash
npm test
npm run audit:syntax
npm run build
```

`npm run build` menjalankan TypeScript project build dan Vite production build. Jalankan perintah ini setelah dependensi berhasil dipasang.

## Deploy frontend ke GitHub + Vercel

1. Ekstrak folder `fokustrack` dari ZIP dan buat repository GitHub dari isi folder proyek tersebut.
2. Commit source code ke GitHub. Jangan commit `.env`, `server/.env`, token API, VAPID private key, atau file data server.
3. Import repository itu ke Vercel.
4. Jika `package.json` ada di root repository, set **Root Directory** ke `.`. Jika repository menyimpan proyek di dalam subfolder `fokustrack/`, set Root Directory ke `fokustrack`.
5. Gunakan **Framework Preset: Vite**, **Install Command: `npm install`**, **Build Command: `npm run build`**, dan **Output Directory: `dist`**.
6. Pilih Node.js runtime 22.x untuk proses build.
7. Tambahkan Environment Variables berikut di Vercel sebelum build produksi:
   - `VITE_PUSH_API_URL` = URL HTTPS publik companion Push Server.
   - `VITE_WEB_PUSH_PUBLIC_KEY` = VAPID public key yang sama dengan server.
8. Deploy. Situs PWA wajib HTTPS agar Service Worker, Notifications, dan Push API dapat digunakan.

Catatan: tidak ada `package-lock.json` di paket ini. Setelah `npm install` pertama yang berhasil, commit `package-lock.json` hasil instalasi agar versi dependency terkunci dan build berikutnya lebih reproducible.

## Deploy companion Push Server

Folder `server/` harus di-deploy sebagai **layanan Node.js yang selalu aktif**, satu instance, dengan disk persisten. Jangan menjalankan proses ini sebagai Vercel Serverless Function atau di hosting yang scale-to-zero: scheduler menggunakan timer proses Node dan file JSON lokal untuk menyimpan perangkat/pengingat.

```bash
cd server
npm install
npm run generate-vapid
```

Salin `server/.env.example` menjadi `server/.env`, lalu isi:

- `PORT`: port yang disediakan host.
- `APP_ORIGIN`: origin frontend persis, misalnya `https://fokustrack.vercel.app` (tanpa slash akhir).
- `VAPID_SUBJECT`: alamat email pengelola dengan format `mailto:`.
- `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY`: hasil `npm run generate-vapid`.
- `DATA_FILE`: path file pada disk persisten yang dapat ditulis.

Jalankan `npm start`. Pastikan host memberi URL HTTPS dan proses Node tidak tidur. Endpoint `GET /health` dapat dipakai sebagai health check.

Di Vercel, atur `VITE_PUSH_API_URL` ke URL publik server tersebut dan `VITE_WEB_PUSH_PUBLIC_KEY` ke VAPID public key. Jika variabel Vite diubah, frontend harus di-build/deploy ulang.

## Operasi Push dan batasan

- Server menyimpan ID perangkat, token API acak, PushSubscription, dan jadwal notifikasi yang diperlukan. Server tidak menyimpan transaksi, saldo, atau catatan keuangan.
- Jadwal dikirim saat berubah dan server menjadwalkannya selama proses berjalan. Saat server restart, data jadwal dibaca dari disk dan timer dibangun ulang.
- Satu Push Server instance dianjurkan. Jangan scale ke beberapa instance menggunakan JSON file lokal.
- Pengingat server yang sudah lebih dari 10 menit lewat ketika server kembali aktif dilewati agar tidak mengirim alarm basi.
- Pengingat foreground lokal juga memiliki jendela catch-up 10 menit. Pengingat yang terlewat lebih lama ditandai agar tidak mengulang terus.
- Web Push adalah notifikasi sistem berbasis event. Browser, Push Service, jaringan, izin, dan optimasi baterai Android dapat memengaruhi keterlambatan. PWA tidak dapat menjamin alarm keras/berulang setara aplikasi Jam Android.
- Timer fokus yang selesai saat aplikasi ditutup akan dipulihkan dan dicatat ketika aplikasi dibuka kembali; alarm timer tepat pada waktu akhir ketika PWA benar-benar dihentikan tidak dijamin.

## Data, backup, dan privasi

- Data utama berada di `localStorage` perangkat. Bersihkan data situs/browser dapat menghapus data aplikasi.
- Ekspor backup JSON secara berkala, terutama sebelum deploy atau mengganti perangkat.
- Import backup mengganti snapshot aktif setelah konfirmasi. File backup dibatasi 10 MB dan dihasilkan dalam JSON ringkas.
- Bila banner penyimpanan/pemulihan muncul, periksa data dan unduh backup sebelum melanjutkan.
- Multi-tab memiliki sinkronisasi melalui event `storage`, tetapi `localStorage` bukan database transaksional dan tidak menyediakan resolusi konflik yang kuat. Hindari mengedit data yang sama dari banyak tab secara bersamaan.

## Batas kapasitas aplikasi

- Kegiatan: maksimum 10.000 record.
- Transaksi: maksimum 50.000 record.
- Sesi fokus: maksimum 50.000 record.
- Pengingat Push aktif: maksimum 200 per perangkat.

Untuk pemakaian pribadi, backup dan batas ini cukup sebagai perlindungan awal. Jika aplikasi berkembang menjadi multi-user atau membutuhkan sinkronisasi lintas perangkat, pindahkan data utama ke backend/database terkelola dan tambahkan autentikasi serta job queue.
