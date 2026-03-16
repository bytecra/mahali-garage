import { useEffect, useRef } from 'react'

/**
 * Detects barcode scanner input — scanners emit characters very rapidly
 * then terminate with Enter. Buffer input between rapid keystrokes.
 */
export function useBarcode(onScan: (barcode: string) => void, active = true): void {
  const bufferRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (e.key.length > 1 && e.key !== 'Enter') return

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        if (barcode.length >= 3) {
          onScan(barcode)
        }
        bufferRef.current = ''
        if (timerRef.current) clearTimeout(timerRef.current)
        return
      }

      bufferRef.current += e.key

      // Reset buffer if no new character within 100ms (human typing vs scanner)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        bufferRef.current = ''
      }, 100)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [onScan, active])
}
