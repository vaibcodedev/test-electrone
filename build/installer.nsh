; Custom NSIS hooks, included by electron-builder before its own templates (nsis.include defaults to this file).

; «Не вдалося закрити Vault» with no Vault running. electron-builder's check looks for any process whose path
; STARTS WITH the install folder, without a trailing backslash: Vault installed in Downloads\Vault and the setup
; started from Downloads\Vault-0.1.0-beta.26-setup.exe matched the setup itself, which it could never close.
; This is the same flow (ask, close gently, then force, then «Повторити»), matching only $INSTDIR\Vault.exe —
; the app and its helper processes, never the installer or anything else that merely sits next to it.

!macro vaultFindApp _RETURN
  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -C "if (@(Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path -ieq '$INSTDIR\${APP_EXECUTABLE_FILENAME}'}).Count -gt 0) { exit 0 } else { exit 1 }"`
  ${else}
    ; No PowerShell: by image name for this user — the setup's own name is never Vault.exe.
    nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
  ${endIf}
  Pop ${_RETURN}
!macroend

!macro vaultKillApp _FORCE
  Push $0
  ${if} $IsPowerShellAvailable == 0
    ${if} ${_FORCE} == 1
      StrCpy $0 "-Force"
    ${else}
      StrCpy $0 ""
    ${endIf}
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path -ieq '$INSTDIR\${APP_EXECUTABLE_FILENAME}'} | % { Stop-Process -Id $$_.ProcessId $0 }"`
  ${else}
    ${if} ${_FORCE} == 1
      StrCpy $0 "/F"
    ${else}
      StrCpy $0 ""
    ${endIf}
    nsExec::Exec `"$CmdPath" /C taskkill $0 /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  ${endIf}
  Pop $0 ; nsExec's exit code
  Pop $0
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE

  ${if} ${isUpdated}
    ; an update: the app is quitting on its own, give it a moment
    Sleep 300
  ${endIf}

  !insertmacro vaultFindApp $R0
  ${if} $R0 == 0
    ${if} ${isUpdated}
      Sleep 1000
      Goto vaultStopProcess
    ${endIf}
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK vaultStopProcess
    Quit

    vaultStopProcess:
    DetailPrint "$(appClosing)"
    !insertmacro vaultKillApp 0
    Sleep 300

    StrCpy $R1 0
    vaultLoop:
      IntOp $R1 $R1 + 1
      !insertmacro vaultFindApp $R0
      ${if} $R0 == 0
        Sleep 1000
        !insertmacro vaultKillApp 1
        !insertmacro vaultFindApp $R0
        ${if} $R0 == 0
          DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
          Sleep 2000
        ${else}
          Goto vaultNotRunning
        ${endIf}
      ${else}
        Goto vaultNotRunning
      ${endIf}

      ; Still there: most likely started as administrator — only the person can close it.
      ${if} $R1 > 1
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY vaultLoop
        Quit
      ${else}
        Goto vaultLoop
      ${endIf}
    vaultNotRunning:
  ${endIf}
!macroend
