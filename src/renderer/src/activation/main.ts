/**
 * Activation window logic — loads device ID, validates and submits license code.
 */

declare global {
  interface Window {
    electronAPI: {
      license: {
        getHwId: () => Promise<{ success: boolean; data?: string }>
        activate: (key: string) => Promise<{ success: boolean; data?: { success: boolean; error?: string }; error?: string }>
      }
      app: {
        licenseActivated: () => void
      }
    }
  }
}

const deviceIdEl = document.getElementById('device-id') as HTMLSpanElement
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement
const licenseInput = document.getElementById('license-code') as HTMLInputElement
const activateBtn = document.getElementById('activate-btn') as HTMLButtonElement
const errorEl = document.getElementById('error') as HTMLDivElement
const successEl = document.getElementById('success') as HTMLDivElement

function showError(msg: string): void {
  errorEl.textContent = msg
  errorEl.classList.add('visible')
  successEl.classList.remove('visible')
}

function showSuccess(): void {
  errorEl.classList.remove('visible')
  successEl.classList.add('visible')
}

async function loadDeviceId(): Promise<void> {
  try {
    const res = await window.electronAPI.license.getHwId()
    if (res.success && res.data) {
      deviceIdEl.textContent = res.data
    } else {
      deviceIdEl.textContent = 'Unable to load'
    }
  } catch {
    deviceIdEl.textContent = 'Error'
  }
}

copyBtn.addEventListener('click', () => {
  const id = deviceIdEl.textContent
  if (id && id !== '—' && id !== 'Unable to load' && id !== 'Error') {
    navigator.clipboard.writeText(id).then(() => {
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy' }, 2000)
    })
  }
})

activateBtn.addEventListener('click', async () => {
  const code = licenseInput.value.trim()
  if (!code) {
    showError('Please enter your license code.')
    return
  }
  errorEl.classList.remove('visible')
  successEl.classList.remove('visible')
  activateBtn.disabled = true
  activateBtn.textContent = 'Activating…'
  try {
    const res = await window.electronAPI.license.activate(code)
    const data = res.data as { success: boolean; error?: string } | undefined
    if (res.success && data?.success) {
      showSuccess()
      window.electronAPI.app.licenseActivated()
    } else {
      const msg = data?.error || res.error || 'Activation failed. Please check your code and try again.'
      showError(msg)
      activateBtn.disabled = false
      activateBtn.textContent = 'Activate'
    }
  } catch {
    showError('An error occurred. Please try again.')
    activateBtn.disabled = false
    activateBtn.textContent = 'Activate'
  }
})

licenseInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') activateBtn.click()
})

loadDeviceId()
