import { formatCurrency, cn } from '../../lib/utils'

interface CurrencyTextProps {
  amount: number | null | undefined
  symbol?: string
  className?: string
  negativeClassName?: string
}

export default function CurrencyText({
  amount,
  symbol,
  className,
  negativeClassName = 'text-red-600 dark:text-red-400',
}: CurrencyTextProps): JSX.Element {
  const value = Number(amount ?? 0)
  const isNegative = !Number.isNaN(value) && value < 0
  return (
    <span className={cn(className, isNegative && negativeClassName)}>
      {formatCurrency(value, symbol)}
    </span>
  )
}
