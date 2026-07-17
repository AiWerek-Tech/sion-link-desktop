; SION Link Desktop - NSIS installer polish
; Bahasa Indonesia setup copy + short readiness page for church operators.

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TITLE "Selamat Datang di Setup SION Link"
!define MUI_WELCOMEPAGE_TEXT "Wizard ini akan memasang SION Link Desktop pada komputer pemateri atau operator pendamping.$\r$\n$\r$\nSION Link menghubungkan perangkat ini ke SION Media, termasuk PowerPoint Bridge real-time melalui SION Presentation Agent.$\r$\n$\r$\nTutup PowerPoint Bridge atau SION Link yang sedang berjalan sebelum melanjutkan."

!define MUI_DIRECTORYPAGE_TITLE "Pilih Lokasi Instalasi"
!define MUI_DIRECTORYPAGE_SUBTITLE "Tentukan folder untuk memasang SION Link Desktop."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Pilih folder tempat SION Link Desktop akan dipasang. Setup juga akan membundel SION Presentation Agent untuk PowerPoint di dalam aplikasi."

!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE "SION Link Siap Digunakan"
!define MUI_FINISHPAGE_TEXT "Instalasi SION Link Desktop telah selesai.$\r$\n$\r$\nBuka SION Media pada laptop operator, pastikan kedua perangkat berada di jaringan yang sama, lalu sambungkan SION Link dari halaman koneksi."
!define MUI_FINISHPAGE_RUN_TEXT "Jalankan SION Link Desktop"

!define MUI_UNWELCOMEPAGE_TITLE_3LINES
!define MUI_UNWELCOMEPAGE_TITLE "Hapus SION Link Desktop"
!define MUI_UNWELCOMEPAGE_TEXT "Wizard ini akan menghapus SION Link Desktop dari komputer.$\r$\n$\r$\nData koneksi terakhir tetap dipertahankan agar pemasangan berikutnya lebih mudah."
!define MUI_UNFINISHPAGE_TITLE "SION Link Telah Dihapus"

!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var ReadinessDialog
Var ReadinessHeader
Var ReadinessBody

Function SionLinkReadinessPage
  nsDialogs::Create 1018
  Pop $ReadinessDialog
  ${If} $ReadinessDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 22u "Yang Akan Dipasang"
  Pop $ReadinessHeader
  CreateFont $0 "Segoe UI" 12 700
  SendMessage $ReadinessHeader ${WM_SETFONT} $0 1

  ${NSD_CreateLabel} 0 32u 100% 128u \
    "Setup akan menyiapkan:$\r$\n$\r$\n  - SION Link Desktop untuk koneksi ke SION Media.$\r$\n  - SION Presentation Agent untuk PowerPoint Bridge di Windows.$\r$\n  - Shortcut Desktop dan Start Menu.$\r$\n$\r$\nCatatan penting:$\r$\n  - Tidak membutuhkan hak administrator.$\r$\n  - Pastikan Microsoft PowerPoint sudah terpasang untuk fitur PowerPoint Bridge.$\r$\n  - Jika Windows SmartScreen muncul, pilih More info lalu Run anyway."
  Pop $ReadinessBody
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $ReadinessBody ${WM_SETFONT} $1 1

  nsDialogs::Show
FunctionEnd

Function SionLinkReadinessPageLeave
FunctionEnd

!macro customPageAfterChangeDir
  Page custom SionLinkReadinessPage SionLinkReadinessPageLeave
!macroend
!endif
