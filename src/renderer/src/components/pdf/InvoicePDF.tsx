import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'

interface SaleItem {
  product_name: string
  product_sku: string | null
  quantity: number
  unit_price: number
  discount: number
  line_total: number
}

export interface InvoiceData {
  invoice_number: string
  sale_number: string
  created_at: string
  customer_name: string | null
  cashier_name: string | null
  items: SaleItem[]
  subtotal: number
  discount_amount: number
  tax_enabled: boolean
  tax_rate: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  notes: string | null
  store_name?: string
  store_address?: string
  store_phone?: string
  invoice_footer?: string
  currency_symbol?: string
  currency_code?: string
  /** Data URL (e.g. image/png;base64,...) */
  store_logo?: string
}

const styles = StyleSheet.create({
  page:        { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  topHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 16 },
  logo:        { width: 72, height: 72, objectFit: 'contain' },
  logoSlot:    { width: 72, height: 72 },
  headerMain:  { flex: 1, flexDirection: 'column' },
  storeNameLg: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 4 },
  storeInfo:   { fontSize: 10, color: '#555', marginTop: 2 },
  headerRight: { width: 150, alignItems: 'flex-end' },
  invoiceTitle:{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#2563eb' },
  invoiceNum:  { fontSize: 11, color: '#333', marginTop: 6, fontFamily: 'Helvetica-Bold' },
  invoiceDate: { fontSize: 9, color: '#555', marginTop: 4 },
  divider:     { borderBottom: '1pt solid #e5e7eb', marginVertical: 12 },
  metaRow:     { flexDirection: 'row', gap: 24, marginBottom: 12 },
  metaBox:     { flex: 1 },
  metaLabel:   { fontSize: 8, color: '#888', textTransform: 'uppercase', marginBottom: 2 },
  metaValue:   { fontSize: 10, color: '#111' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 2 },
  tableRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: '0.5pt solid #f0f0f0' },
  tableAlt:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: '0.5pt solid #f0f0f0', backgroundColor: '#fafafa' },
  colName:     { flex: 4 },
  colQty:      { flex: 1, textAlign: 'center' },
  colPrice:    { flex: 2, textAlign: 'right' },
  colTotal:    { flex: 2, textAlign: 'right' },
  thText:      { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#555' },
  tdText:      { fontSize: 9, color: '#333' },
  totalsBox:   { marginTop: 12, alignItems: 'flex-end' },
  totalRow:    { flexDirection: 'row', gap: 24, marginBottom: 3 },
  totalLabel:  { width: 80, textAlign: 'right', fontSize: 9, color: '#666' },
  totalValue:  { width: 80, textAlign: 'right', fontSize: 9, color: '#111' },
  grandTotal:  { flexDirection: 'row', gap: 24, marginTop: 4, paddingTop: 4, borderTop: '1pt solid #111' },
  grandLabel:  { width: 80, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandValue:  { width: 80, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold' },
  footer:      { marginTop: 24, paddingTop: 12, borderTop: '0.5pt solid #e5e7eb' },
  footerText:  { fontSize: 9, color: '#888', textAlign: 'center' },
  codeFootnote:{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 4 },
  notes:       { marginTop: 12, padding: 8, backgroundColor: '#fffbeb', borderRadius: 4, borderLeft: '2pt solid #f59e0b' },
  notesLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 2 },
  notesText:   { fontSize: 9, color: '#78350f' },
  balanceDue:  { marginTop: 8, padding: 8, backgroundColor: '#fee2e2', borderRadius: 4 },
  balanceText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#dc2626', textAlign: 'center' },
})

function fmtDate(d: string): string { return new Date(d).toLocaleDateString() }

export function InvoicePDF({ inv }: { inv: InvoiceData }): JSX.Element {
  const sym = inv.currency_symbol ?? 'د.إ'
  const code = inv.currency_code ?? 'AED'
  const fmt = (n: number): string => `${sym}${n.toFixed(2)}`
  const logoSrc = inv.store_logo?.startsWith('data:') ? inv.store_logo : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topHeader}>
          {logoSrc
            ? <Image src={logoSrc} style={styles.logo} />
            : <View style={styles.logoSlot} />}
          <View style={styles.headerMain}>
            <Text style={styles.storeNameLg}>{inv.store_name ?? 'Garage'}</Text>
            {inv.store_address ? <Text style={styles.storeInfo}>{inv.store_address}</Text> : null}
            {inv.store_phone ? <Text style={styles.storeInfo}>Tel: {inv.store_phone}</Text> : null}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNum}>{inv.invoice_number}</Text>
            <Text style={styles.invoiceDate}>Date: {fmtDate(inv.created_at)}</Text>
            <Text style={[styles.invoiceDate, { marginTop: 2 }]}>{sym} · {code}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Billed To</Text>
            <Text style={styles.metaValue}>{inv.customer_name ?? 'Walk-in Customer'}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Served By</Text>
            <Text style={styles.metaValue}>{inv.cashier_name ?? '—'}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Sale #</Text>
            <Text style={styles.metaValue}>{inv.sale_number}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={[styles.thText, styles.colName]}>Item</Text>
          <Text style={[styles.thText, styles.colQty]}>Qty</Text>
          <Text style={[styles.thText, styles.colPrice]}>Unit Price</Text>
          <Text style={[styles.thText, styles.colTotal]}>Total</Text>
        </View>
        {inv.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableAlt}>
            <View style={styles.colName}>
              <Text style={styles.tdText}>{item.product_name}</Text>
              {item.product_sku && <Text style={[styles.tdText, { color: '#aaa', fontSize: 8 }]}>{item.product_sku}</Text>}
            </View>
            <Text style={[styles.tdText, styles.colQty]}>{item.quantity}</Text>
            <Text style={[styles.tdText, styles.colPrice]}>{fmt(item.unit_price)}</Text>
            <Text style={[styles.tdText, styles.colTotal]}>{fmt(item.line_total)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{fmt(inv.subtotal)}</Text></View>
          {inv.discount_amount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={[styles.totalValue, { color: '#dc2626' }]}>-{fmt(inv.discount_amount)}</Text></View>}
          {inv.tax_enabled && inv.tax_amount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax ({inv.tax_rate}%)</Text><Text style={styles.totalValue}>{fmt(inv.tax_amount)}</Text></View>}
          <View style={styles.grandTotal}><Text style={styles.grandLabel}>TOTAL</Text><Text style={styles.grandValue}>{fmt(inv.total_amount)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Paid</Text><Text style={[styles.totalValue, { color: '#16a34a' }]}>{fmt(inv.amount_paid)}</Text></View>
          <Text style={styles.codeFootnote}>Amounts in {code}</Text>
        </View>

        {inv.balance_due > 0 && (
          <View style={styles.balanceDue}>
            <Text style={styles.balanceText}>BALANCE DUE: {fmt(inv.balance_due)}</Text>
          </View>
        )}

        {inv.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>NOTES</Text>
            <Text style={styles.notesText}>{inv.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{inv.invoice_footer ?? 'Thank you for your business!'}</Text>
        </View>
      </Page>
    </Document>
  )
}
