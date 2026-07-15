# SION Link Desktop 💻⚡

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-windows-lightgrey.svg)](#)
[![Framework](https://img.shields.io/badge/built%20with-Electron%20%7C%20TypeScript-brightgreen.svg)](#)

**SION Link Desktop** adalah aplikasi *companion* resmi desktop native untuk ekosistem **SION Media**. Aplikasi ini dirancang untuk mempermudah operator dan pemateri dalam menghubungkan perangkat mereka ke server SION Media di jaringan lokal serta menyinkronkan presentasi PowerPoint secara langsung tanpa perangkat keras tambahan seperti capture card.

---

## ✨ Fitur Utama

- **🔍 Auto Network Discovery**: Mencari dan menemukan server SION Media secara otomatis di jaringan lokal (Wi-Fi / LAN) tanpa perlu mengonfigurasi IP dan port secara manual.
- **🔌 PowerPoint Live Bridge**: Sinkronisasi slide aktif, Speaker Notes, judul slide, dan pratinjau slide berikutnya dari Microsoft PowerPoint langsung ke server SION Media secara real-time melalui skrip interop PowerShell.
- **📋 Smart Paste**: Membaca dan mem-parsing alamat IP, port, serta kode akses secara otomatis saat Anda menyalin tautan (URL) dari SION Media.
- **🛡️ Secure Native Workspace**: Menyediakan *sandbox* khusus untuk pemateri, operator, live viewer, dan stage display dengan proteksi navigasi origin untuk menghindari ketidaksengajaan keluar dari halaman kerja.
- **🔄 Auto-Reconnect & History**: Penyimpanan riwayat perangkat untuk akses cepat serta pemulihan sesi otomatis ketika terjadi pemutusan jaringan.

---

## 🛠️ Persyaratan Sistem

- **Sistem Operasi**: Windows 10/11 (diperlukan untuk kompatibilitas PowerPoint Bridge).
- **Aplikasi Pendukung**: Microsoft PowerPoint (diperlukan untuk fitur PowerPoint Bridge).
- **Node.js**: Versi LTS terbaru (direkomendasikan v18+ atau v20+).

---

## 🚀 Memulai Pengembangan

### 1. Kloning Repositori
```bash
git clone https://github.com/AiWerek-Tech/sion-link-desktop.git
cd sion-link-desktop
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Menjalankan Mode Pengembangan
Menjalankan TypeScript compiler secara watch-mode dan membuka aplikasi Electron:
```bash
npm run dev
```

### 4. Build Aplikasi (Distribusi)
Mengompilasi berkas produksi dan menghasilkan installer Windows (.exe) menggunakan `electron-builder`:
```bash
npm run dist
```
Installer akan dibuat dan disimpan di direktori `/dist`.

---

## 📂 Struktur Folder Proyek

```text
sion-link-desktop/
├── .dev-docs/           # Dokumentasi perencanaan dan tugas pengembangan
├── src/
│   ├── main.ts          # Main process Electron (kontrol jendela, IPC, PowerShell interop)
│   ├── preload.ts       # Jembatan IPC aman (contextBridge) antara main dan renderer
│   └── renderer/        # Berkas antarmuka pengguna (HTML, CSS, JS)
├── tsconfig.json        # Konfigurasi TypeScript
├── package.json         # Dependensi proyek & konfigurasi build electron-builder
└── README.md            # Dokumentasi utama proyek
```

---

## 🔒 Keamanan & Integrasi IPC

Aplikasi ini menggunakan konfigurasi keamanan terbaik untuk Electron:
- `contextIsolation` diaktifkan (`true`).
- `nodeIntegration` dimatikan (`false`).
- Berkas `preload.ts` membatasi API yang diekspos ke antarmuka web, sehingga mencegah eksekusi kode berbahaya dari luar.
- Validasi ketat terhadap input alamat IP dan port yang dimasukkan ke PowerPoint Bridge.

---

## 👤 Kontributor & Lisensi

Dikembangkan oleh **AiWerek Tech** untuk ekosistem **SION Media**.
Untuk kontribusi dan pelaporan bug, silakan buat *issue* atau kirimkan *pull request* di repositori ini.
