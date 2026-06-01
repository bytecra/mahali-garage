import { useCallback, useState } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

/**
 * Number input that selects all on focus (so typing immediately replaces the value),
 * and restores the min (default 0) on blur if left empty.
 */
export default function NumericInput({ value, onChange, min = 0, max, step, ...rest }: Props): JSX.Element {
  const [raw, setRaw] = useState<string | null>(null)

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setRaw(String(value))
    e.target.select()
    rest.onFocus?.(e)
  }, [value, rest.onFocus])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseFloat(raw ?? '')
    const resolved = isNaN(parsed) ? (min ?? 0) : parsed
    const clamped = max != null ? Math.min(max, Math.max(min ?? 0, resolved)) : Math.max(min ?? 0, resolved)
    onChange(clamped)
    setRaw(null)
    rest.onBlur?.(e)
  }, [raw, min, max, onChange, rest.onBlur])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRaw(e.target.value)
    const parsed = parseFloat(e.target.value)
    if (!isNaN(parsed)) onChange(parsed)
  }, [onChange])

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      step={step}
      value={raw !== null ? raw : value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  )
}
