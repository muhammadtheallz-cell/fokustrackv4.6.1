# FokusTrack Push Server v4.6.0

Companion server ini menjadwalkan dan mengirim Web Push ke browser yang telah berlangganan. Server tidak menyimpan data transaksi/keuangan. Ia menyimpan device ID, token API per perangkat, endpoint subscription Web Push, dan jadwal notifikasi yang diperlukan.

## Prasyarat

- Node.js 20.19 atau lebih baru (disarankan Node.js 22 LTS).
- Host HTTPS yang selalu aktif dan disk persisten untuk `DATA_FILE`.
- PWA FokusTrack juga harus di-host melalui HTTPS.

## Setup

```bash
npm install
npm run generate-vapid
cp .env.example .env
```

Isi `.env` menggunakan kunci hasil generator, origin PWA, dan email pengelola. Jalankan:

```bash
npm start
```

`GET /health` menguji apakah server hidup.

## API yang dipakai PWA

- `POST /api/push/register`: mendaftarkan PushSubscription dan mengembalikan token perangkat.
- `PUT /api/push/reminders`: mengganti daftar jadwal aktif perangkat.
- `POST /api/push/test`: mengirim satu notifikasi uji.

Server memvalidasi ID perangkat, jalur klik same-origin, dan endpoint Push HTTPS dari penyedia browser yang dikenal. Daftar perangkat dibatasi dan disimpan dengan objek tanpa prototype untuk menghindari penyalahgunaan key khusus.

Endpoint jadwal dan uji memerlukan `Authorization: Bearer <device-token>`. Origin browser harus cocok dengan `APP_ORIGIN`.

## Operasional

Server menyimpan jadwal pada file JSON dan membangun ulang timer ketika proses dimulai. Jadwal mendatang tidak dibatasi ke 60 hari; timer panjang akan dijadwalkan ulang secara bertahap ketika batas `setTimeout` runtime tercapai. Kegagalan sementara saat mengirim push dicoba ulang hingga tiga kali tambahan; subscription yang sudah tidak valid akan dihapus. Ini cocok sebagai starter untuk satu deployment kecil/personal, bukan pengganti database/queue terkelola untuk skala besar. Gunakan volume disk persisten. Hindari deployment serverless atau scale-to-zero: jika proses tidur pada saat jadwal jatuh tempo, push tidak dapat dikirim tepat waktu. Untuk layanan produksi multi-user, tambahkan autentikasi akun, rate limiting, database transaksional, job queue, observability, dan rotasi token.
