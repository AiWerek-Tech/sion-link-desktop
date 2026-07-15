# Walkthrough - SION Link Desktop Companion App

Kami telah berhasil menginisialisasi dan membangun aplikasi native desktop **SION Link Desktop** di dalam direktori `d:/my_dev/SION-Media/sion-link-desktop`. 

Aplikasi ini bertindak sebagai wrapper khusus berbasis Electron yang memuat interface web SION Link (Presenter, Operator, Viewer, Stage) dari server lokal operator.

---

## Perubahan yang Dilakukan

Kami telah membuat struktur aplikasi baru sebagai berikut:

1. **Konfigurasi Project**:
   * [package.json](file:///d:/my_dev/SION-Media/sion-link-desktop/package.json): Mendefinisikan detail aplikasi (`tech.aiwerek.sionlink.desktop`), skrip build/dev, dependensi Electron/TypeScript, dan pengaturan pengemasan menggunakan `electron-builder`.
   * [tsconfig.json](file:///d:/my_dev/SION-Media/sion-link-desktop/tsconfig.json): Mengatur opsi kompilator TypeScript agar menghasilkan kode CommonJS di folder `out/`.

2. **Proses Utama Electron (Backend)**:
   * [src/main.ts](file:///d:/my_dev/SION-Media/sion-link-desktop/src/main.ts): Mengelola daur hidup jendela (*window lifecycle*), mendengarkan pintasan keyboard (`Esc` atau `Ctrl+Shift+D`) untuk kembali ke menu koneksi, menyimpan konfigurasi login terakhir ke file JSON lokal, serta melakukan validasi token/kode ke server SION Media Operator sebelum membuka halaman web remote.
   * [src/preload.ts](file:///d:/my_dev/SION-Media/sion-link-desktop/src/preload.ts): Menyediakan IPC Bridge (`sionLink`) secara aman untuk renderer, membatasi akses API Electron hanya pada protocol `file://` (layar koneksi lokal) demi mencegah celah keamanan XSS dari remote web.

3. **Interface Koneksi (Frontend)**:
   * [src/renderer/index.html](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/index.html): Kerangka HTML input IP, Port, dan Kode Akses SION Link.
   * [src/renderer/style.css](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/style.css): Desain antarmuka premium dengan gaya *glassmorphism*, skema warna gelap dengan aksen indigo menyala (neon glow) yang senada dengan estetika SION Media, lengkap dengan efek transisi mikro dan loading spinner.
   * [src/renderer/renderer.js](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/renderer.js): Logika form penanganan tombol, pemuatan data tersimpan, serta fitur penghubung otomatis (*auto-connect*) selama 3 detik dengan tombol pembatalan instan jika pengguna ingin mengubah kredensial.

---

## Verifikasi yang Dilakukan

### 1. Instalasi Dependensi & Kompilasi TypeScript
Kami telah menginstal modul secara sukses dan menjalankan kompilasi TypeScript dengan perintah:
```powershell
npm run build
```
**Hasil**: Kompilasi sukses tanpa ada galat tipe data (*type errors*). File keluaran `out/main.js` dan `out/preload.js` berhasil dibuat.

---

## Cara Menjalankan & Menguji Aplikasi

Anda dapat menguji aplikasi ini secara lokal dengan mengikuti langkah-langkah berikut:

### Langkah 1: Jalankan SION Media Desktop (Operator)
1. Buka workspace **SION Media Desktop**.
2. Jalankan aplikasi operator dalam mode pengembangan:
   ```powershell
   npm run dev
   ```
3. Buka menu **Pengaturan (Settings)** -> **SION Link**.
4. Klik **Aktifkan SION Link**. Salin alamat IP/Port dan salah satu kode akses peran (misalnya *Pemateri* atau *Stage Display*).

### Langkah 2: Jalankan SION Link Desktop (Companion)
1. Buka terminal pada folder `d:/my_dev/SION-Media/sion-link-desktop`.
2. Jalankan aplikasi pendamping:
   ```powershell
   npm run dev
   ```
3. Masukkan IP, Port, dan Kode Akses yang telah disalin dari aplikasi operator.
4. Centang **Ingat perangkat ini**, lalu klik **Hubungkan**.
5. **Verifikasi**: Jendela aplikasi akan memuat antarmuka remote yang sesuai dengan peran dari kode tersebut.
6. Tekan tombol `Esc` atau `Ctrl+Shift+D` pada keyboard untuk keluar dari tampilan remote dan kembali ke layar koneksi utama. Tutup dan buka kembali aplikasi untuk melihat alur *auto-connect* bekerja.

### Langkah 3: Pengemasan Aplikasi (Opsional)
Untuk membuat berkas installer `.exe` portable untuk Windows:
```powershell
npm run dist
```
Hasil kemasan executable akan dibuat di dalam folder `dist/`.
