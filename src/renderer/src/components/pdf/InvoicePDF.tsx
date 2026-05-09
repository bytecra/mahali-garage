import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Path,
} from '@react-pdf/renderer'
import { formatDateByPattern, getDateFormat } from '../../store/dateFormatStore'
import { DIRHAM_PATH } from '../../lib/dirhamSvg'

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
  colPrice:    { flex: 2 },
  colTotal:    { flex: 2 },
  thText:      { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#555' },
  tdText:      { fontSize: 9, color: '#333' },
  totalsBox:   { marginTop: 12, alignItems: 'flex-end' },
  totalRow:    { flexDirection: 'row', gap: 24, marginBottom: 3 },
  totalLabel:  { width: 80, textAlign: 'right', fontSize: 9, color: '#666' },
  grandTotal:  { flexDirection: 'row', gap: 24, marginTop: 4, paddingTop: 4, borderTop: '1pt solid #111' },
  grandLabel:  { width: 80, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold' },
  footer:      { marginTop: 24, paddingTop: 12, borderTop: '0.5pt solid #e5e7eb' },
  footerText:  { fontSize: 9, color: '#888', textAlign: 'center' },
  codeFootnote:{ fontSize: 8, color: '#888', textAlign: 'right', marginTop: 4 },
  notes:       { marginTop: 12, padding: 8, backgroundColor: '#fffbeb', borderRadius: 4, borderLeft: '2pt solid #f59e0b' },
  notesLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 2 },
  notesText:   { fontSize: 9, color: '#78350f' },
  balanceDue:  { marginTop: 8, padding: 8, backgroundColor: '#fee2e2', borderRadius: 4 },
  balanceText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#dc2626', textAlign: 'center' },
})

function fmtDate(d: string): string { return formatDateByPattern(d, getDateFormat()) }

function Sym({ size, color = '#1a1a1a' }: { size: number; color?: string }) {
  const h = size * (74.28 / 85.41)
  return (
    <Svg viewBox="0 0 85.41 74.28" style={{ width: size, height: h }}>
      <Path d={DIRHAM_PATH} fill={color} />
    </Svg>
  )
}

function Money({
  amount,
  fontSize = 9,
  color = '#111',
  bold = false,
  justify = 'flex-end',
  containerStyle = {},
}: {
  amount: number
  fontSize?: number
  color?: string
  bold?: boolean
  justify?: 'flex-end' | 'flex-start' | 'center'
  containerStyle?: object
}) {
  const abs = Math.abs(amount)
  const neg = amount < 0
  const family = bold ? 'Helvetica-Bold' : 'Helvetica'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: justify, ...containerStyle }}>
      {neg && <Text style={{ fontSize, color, fontFamily: family }}>-</Text>}
      <Sym size={fontSize * 0.85} color={color} />
      <Text style={{ fontSize, color, fontFamily: family, marginLeft: 1 }}>{abs.toFixed(2)}</Text>
    </View>
  )
}

export function InvoicePDF({ inv }: { inv: InvoiceData }): JSX.Element {
  const code = inv.currency_code ?? 'AED'
  const displayCode = code.trim().toUpperCase() === 'AED' ? 'AED' : code
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Sym size={8} color="#555" />
              <Text style={[styles.invoiceDate, { marginTop: 0, marginLeft: 2 }]}> · {displayCode}</Text>
            </View>
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
          <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>Unit Price</Text>
          <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>Total</Text>
        </View>
        {inv.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableAlt}>
            <View style={styles.colName}>
              <Text style={styles.tdText}>{item.product_name}</Text>
              {item.product_sku && <Text style={[styles.tdText, { color: '#aaa', fontSize: 8 }]}>{item.product_sku}</Text>}
            </View>
            <Text style={[styles.tdText, styles.colQty]}>{item.quantity}</Text>
            <Money amount={item.unit_price} fontSize={9} color="#333" containerStyle={{ flex: 2 }} />
            <Money amount={item.line_total} fontSize={9} color="#333" containerStyle={{ flex: 2 }} />
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Money amount={inv.subtotal} fontSize={9} containerStyle={{ width: 80 }} />
          </View>
          {inv.discount_amount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Money amount={-inv.discount_amount} fontSize={9} color="#dc2626" containerStyle={{ width: 80 }} />
            </View>
          )}
          {inv.tax_enabled && inv.tax_amount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({inv.tax_rate}%)</Text>
              <Money amount={inv.tax_amount} fontSize={9} containerStyle={{ width: 80 }} />
            </View>
          )}
          <View style={styles.grandTotal}>
            <Text style={styles.grandLabel}>TOTAL</Text>
            <Money amount={inv.total_amount} fontSize={11} bold containerStyle={{ width: 80 }} />
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Paid</Text>
            <Money amount={inv.amount_paid} fontSize={9} color="#16a34a" containerStyle={{ width: 80 }} />
          </View>
          <Text style={styles.codeFootnote}>Amounts in {displayCode}</Text>
        </View>

        {inv.balance_due > 0 && (
          <View style={styles.balanceDue}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[styles.balanceText, { marginRight: 4 }]}>BALANCE DUE:</Text>
              <Money amount={inv.balance_due} fontSize={11} color="#dc2626" bold justify="flex-start" />
            </View>
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
