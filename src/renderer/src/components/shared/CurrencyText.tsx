import { cn } from '../../lib/utils'
import { DIRHAM_PATH } from '../../lib/dirhamSvg'

interface CurrencyTextProps {
  amount: number | null | undefined
  symbol?: string
  className?: string
  negativeClassName?: string
}

export default function CurrencyText({
  amount,
  className,
  negativeClassName = 'text-red-600 dark:text-red-400',
}: CurrencyTextProps): JSX.Element {
  const value = Number(amount ?? 0)
  const safe = Number.isNaN(value) ? 0 : value
  const isNegative = safe < 0
  const formatted = Math.abs(safe).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return (
    <span className={cn('inline-flex items-center gap-px', className, isNegative && negativeClassName)}>
      {isNegative && <span>-</span>}
      <svg
        viewBox="0 0 85.41 74.28"
        aria-hidden="true"
        style={{ height: '0.82em', width: 'auto', display: 'inline-block', verticalAlign: '-0.06em', flexShrink: 0 }}
      >
        <path fill="currentColor" d={DIRHAM_PATH} />
      </svg>
      <span className="tabular-nums">{formatted}</span>
    </span>
  )
}
