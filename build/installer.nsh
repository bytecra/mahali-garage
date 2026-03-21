; Mahali Garage — custom NSIS hooks for electron-builder
; Macros run after common.nsh (WinVer.nsh, x64.nsh) is loaded by the main template.

Var MahaliGarage_DetectedArchLabel

!macro preInit
  ; Earliest hook in .onInit — before language selection and wizard pages.
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_OK|MB_ICONSTOP "Mahali Garage requires Windows 7 or later.$\r$\n$\r$\nYour version of Windows is not supported. Setup will exit."
    SetErrorLevel 1
    Quit
  ${EndIf}

  ${If} ${RunningX64}
    StrCpy $MahaliGarage_DetectedArchLabel "64-bit (x64)"
  ${Else}
    StrCpy $MahaliGarage_DetectedArchLabel "32-bit (x86)"
  ${EndIf}
!macroend

!macro customInit
  ; After check64BitAndSetRegView / initMultiUser, before any installer page.
  ${IfNot} ${Silent}
    MessageBox MB_OK|MB_USERICON "This setup detected a $MahaliGarage_DetectedArchLabel Windows system.$\r$\n$\r$\nThe matching build will be installed. You can choose the installation folder on the next screens."
  ${EndIf}
!macroend

!macro customInstall
  DetailPrint "Mahali Garage: finishing installation steps..."
!macroend

!macro customUnInstall
  DetailPrint "Mahali Garage: custom uninstall cleanup complete."
!macroend
