# Daftar Berkas Kode PowerPoint Bridge SION 📂

Berikut adalah peta jalan berkas-berkas kode yang saling terhubung untuk membangun sistem **PowerPoint Bridge** pada **SION Link Desktop** (Client) dan **SION Media Desktop** (Server).

---

## 1. 💻 SION Link Desktop (Client / Sisi Pengirim)

Semua logika client terpusat pada empat berkas utama berikut:

| Nama Berkas | Path Absolut | Peran / Deskripsi Fungsional |
| :--- | :--- | :--- |
| **`main.ts`** | [main.ts](file:///d:/my_dev/SION-Media/sion-link-desktop/src/main.ts) | Main process Electron. Mengatur inisialisasi aplikasi, alur polling slide 500ms, koneksi COM PowerPoint via PowerShell, pembacaan file JPEG lokal, pengiriman slide, serta penerimaan dan eksekusi perintah navigasi jauh. |
| **`index.html`** | [index.html](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/index.html) | Antarmuka pengguna (HTML). Menyediakan layout tab *Koneksi*, *Cari Server*, *Riwayat*, dan *PowerPoint Bridge*, serta panduan kode dan pesan pintasan keyboard (`ESC`/`Ctrl+Shift+D`). |
| **`renderer.js`** | [renderer.js](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/renderer.js) | Logika frontend client. Mengelola interaksi input form, pemicu scan otomatis di tab pencarian, serta visualisasi status koneksi dan polling di status bar. |
| **`style.css`** | [style.css](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/style.css) | Desain visual (CSS). Mengimplementasikan Windows 11 Fluent Design System untuk tombol, kartu history, input, dan overlay transisi. |

---

## 2. 🖥️ SION Media Desktop (Server / Sisi Penerima)

Komponen server terbagi antara proses backend Node.js (main/preload) dan frontend React (renderer):

### A. Backend Server & IPC Bridge
| Nama Berkas | Path Absolut | Peran / Deskripsi Fungsional |
| :--- | :--- | :--- |
| **`presenter-remote-server.ts`** | [presenter-remote-server.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/main/presenter-remote-server.ts) | Server HTTP presenter remote. Mengelola endpoint `/api/presentation-source` (untuk menerima gambar JPEG slide), memvalidasi header file, menyimpan gambar unik dengan *timestamp*, melakukan pembersihan otomatis, dan menampung antrean perintah (`powerPointBridgeCommandQueues`). |
| **`ipc-handlers.ts`** | [ipc-handlers.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/main/ipc-handlers.ts) | Pengelola komunikasi IPC. Menghubungkan tombol aksi di antarmuka React dengan logika backend server (seperti menyetujui akses client, memutuskan perangkat, atau mengantrekan perintah `NEXT`/`PREV`). |
| **`index.ts` (Preload)** | [index.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/preload/index.ts) | Preload script Electron. Mengekspos fungsi-fungsi IPC jembatan PowerPoint secara aman ke objek global `window.api.presenterRemote` di sisi browser. |
| **`index.d.ts` (Preload)** | [index.d.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/preload/index.d.ts) | Definisi tipe TypeScript. Menjamin tipe data parameter dan respons dari API PowerPoint Bridge bersifat *type-safe* saat dikompilasi. |

### B. Frontend React (UI Operator & Engine Proyeksi)
| Nama Berkas | Path Absolut | Peran / Deskripsi Fungsional |
| :--- | :--- | :--- |
| **`App.tsx`** | [App.tsx](file:///d:/my_dev/SION-Media/sion-media-desktop/src/renderer/src/App.tsx) | Logika utama React. Mendengarkan event `PRESENTATION_SOURCE` dari jembatan IPC. Jika PowerPoint Bridge sedang tayang aktif (`PPT LIVE`), ia langsung mengirimkan slide baru secara otomatis ke layar LIVE. |
| **`PowerPointBridgePanel.tsx`** | [PowerPointBridgePanel.tsx](file:///d:/my_dev/SION-Media/sion-media-desktop/src/renderer/src/components/projection/PowerPointBridgePanel.tsx) | UI Panel PowerPoint Bridge. Menampilkan daftar permintaan koneksi, pratinjau slide aktif dan berikutnya, catatan pembicara, tombol "Muat ke Preview", "Tayangkan", serta tombol kontrol navigasi jarak jauh ("Slide Sebelumnya" & "Slide Berikutnya"). |
| **`powerPointBridge.ts`** | [powerPointBridge.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/renderer/src/utils/powerPointBridge.ts) | Helper Proyeksi. Memformat data slide PowerPoint menjadi bentuk biner slide SION dengan tipe latar belakang gambar (`mode: 'image'`) menggunakan berkas JPEG hasil tangkapan. |
| **`usePowerPointBridgeStore.ts`** | [usePowerPointBridgeStore.ts](file:///d:/my_dev/SION-Media/sion-media-desktop/src/renderer/src/store/usePowerPointBridgeStore.ts) | Penyimpanan State (Zustand). Mengelola state lokal untuk pratinjau slide PPT aktif, state persetujuan otomatis ke preview/live, dan detail perangkat client yang terhubung. |
