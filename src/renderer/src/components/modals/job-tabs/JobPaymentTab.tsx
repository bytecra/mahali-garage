import { useMemo } from 'react'
import { formatCurrency } from '../../../lib/utils'
import type { JobFormState, JobLineItem } from './JobDetailsTab'
import CurrencyText from '../../shared/CurrencyText'

const PAYMENT_METHODS = ['', 'Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] as const

function computeInvoiceDiscount(partsSubtotal: number, discountType: string, discountValueStr: string): number {
  const v = Number(discountValueStr) || 0
  if (partsSubtotal <= 0 || v <= 0) return 0
  if (discountType === 'fixed') return Math.min(v, partsSubtotal)
  if (discountType === 'percentage') return Math.min(partsSubtotal * (v / 100), partsSubtotal)
  return 0
}

export default function JobPaymentTab(props: {
  form: JobFormState
  setField: (key: keyof JobFormState, val: string | boolean) => void
  lineItems: JobLineItem[]
  isEdit: boolean
}): JSX.Element {
  const { form, setField, lineItems, isEdit } = props
  const inputCls =
    'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  const laborHours = Number(form.labor_hours) || 0
  const laborRate = Number(form.labor_rate) || 0
  const laborTotal = laborHours * laborRate
  const partsSell = useMemo(
    () => lineItems.reduce((s, p) => s + p.quantity * p.sell, 0),
    [lineItems],
  )
  const taxRate = Number(form.tax_rate) || 0
  const subtotal = laborTotal + partsSell
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount
  const deposit = Number(form.deposit) || 0
  const balanceDue = total - deposit

  const invDiscType = form.invoice_discount_type
  const invoiceDiscEstimate = useMemo(
    () => computeInvoiceDiscount(partsSell, invDiscType, form.invoice_discount_value),
    [partsSell, invDiscType, form.invoice_discount_value],
  )
  const taxableAfterDisc = Math.max(0, partsSell - invoiceDiscEstimate)
  const taxOnInvoiceEst = taxableAfterDisc * (taxRate / 100)
  const draftInvoiceTotalEst = taxableAfterDisc + taxOnInvoiceEst

  return (
    <div className="space-y-4 max-h-[min(70vh,720px)] overflow-y-auto pe-1">
      <p className="text-xs text-muted-foreground">
        Part line items are edited on the <strong className="text-foreground">Job</strong> tab. Set diagnosis, labor,
        tax, and deposit here; invoice discount applies to part lines when you generate the draft invoice.
      </p>

      <div className="space-y-2">
        <label className={labelCls}>Diagnosis</label>
        <textarea
          value={form.diagnosis}
          onChange={e => setField('diagnosis', e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>
      {isEdit && (
        <div className="space-y-2">
          <label className={labelCls}>Work done</label>
          <textarea
            value={form.work_done}
            onChange={e => setField('work_done', e.target.value)}
            rows={2}
            className={inputCls}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Labor hours</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.labor_hours}
            onChange={e => setField('labor_hours', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Labor rate / hr</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.labor_rate}
            onChange={e => setField('labor_rate', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Labor total</label>
          <input readOnly value={formatCurrency(laborTotal)} className={`${inputCls} bg-muted/50`} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5 text-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Job total</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Parts sell</span>
          <CurrencyText amount={partsSell} />
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Labor</span>
          <CurrencyText amount={laborTotal} />
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 font-medium">
          <span>Subtotal</span>
          <CurrencyText amount={subtotal} />
        </div>
        {taxRate > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({taxRate}%)</span>
            <CurrencyText amount={taxAmount} />
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-border pt-1.5">
          <span>Total</span>
          <span className="text-primary">
            <CurrencyText amount={total} />
          </span>
        </div>
        {deposit > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deposit</span>
            <span>
              -<CurrencyText amount={deposit} />
            </span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>Balance due</span>
          <CurrencyText amount={balanceDue} className={balanceDue > 0 ? 'text-destructive' : 'text-green-600'} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tax rate (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.tax_rate}
            onChange={e => setField('tax_rate', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Deposit (AED)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.deposit}
            onChange={e => setField('deposit', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {(invDiscType === 'percentage' || invDiscType === 'fixed') && (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Draft invoice (estimate)</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            Invoice generator uses <strong className="text-foreground">part lines only</strong> for subtotal, then discount
            and tax.
          </p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Parts subtotal</span>
            <CurrencyText amount={partsSell} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice discount</span>
            <span className={invoiceDiscEstimate > 0 ? 'text-destructive' : 'text-muted-foreground'}>
              {invoiceDiscEstimate > 0 ? '-' : ''}
              <CurrencyText amount={invoiceDiscEstimate} />
            </span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
              <CurrencyText amount={taxOnInvoiceEst} />
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-border pt-1.5">
            <span>Est. invoice total</span>
            <CurrencyText amount={draftInvoiceTotalEst} />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Settlement &amp; invoice</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Payment method and terms for this job; invoice discount applies when you generate the draft invoice.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Payment method</label>
            <select
              value={form.payment_method}
              onChange={e => setField('payment_method', e.target.value)}
              className={inputCls}
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m || 'unset'} value={m}>
                  {m || '— Not set —'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Invoice discount</label>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={form.invoice_discount_type}
                onChange={e => setField('invoice_discount_type', e.target.value as JobFormState['invoice_discount_type'])}
                className={`${inputCls} flex-1 min-w-[120px]`}
              >
                <option value="">None</option>
                <option value="percentage">Percent (%)</option>
                <option value="fixed">Fixed (AED)</option>
              </select>
              {form.invoice_discount_type ? (
                <input
                  type="number"
                  min={0}
                  step={form.invoice_discount_type === 'percentage' ? 0.1 : 0.01}
                  max={form.invoice_discount_type === 'percentage' ? 100 : undefined}
                  value={form.invoice_discount_value}
                  onChange={e => setField('invoice_discount_value', e.target.value)}
                  className={`${inputCls} w-[100px]`}
                  placeholder={form.invoice_discount_type === 'percentage' ? '%' : 'AED'}
                />
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Payment terms</label>
          <textarea
            value={form.invoice_payment_terms}
            onChange={e => setField('invoice_payment_terms', e.target.value)}
            rows={3}
            placeholder="e.g. Due on pickup, Net 7 days…"
            className={inputCls}
          />
        </div>
      </div>
    </div>
  )
}

