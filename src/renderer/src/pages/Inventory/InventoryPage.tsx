import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import ProductsPage from './ProductsPage'
import CategoriesPage from './CategoriesPage'
import BrandsPage from './BrandsPage'
import SuppliersPage from './SuppliersPage'
import PartnersPage from './PartnersPage'

type InventoryTab = 'products' | 'categories' | 'brands' | 'suppliers' | 'partners'

const TABS: Array<{ key: InventoryTab; label: string }> = [
  { key: 'products',   label: 'inventory.products' },
  { key: 'categories', label: 'inventory.categories' },
  { key: 'brands',     label: 'inventory.brands' },
  { key: 'suppliers',  label: 'inventory.suppliers' },
  { key: 'partners',   label: 'inventory.partnersTab' },
]

export default function InventoryPage(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<InventoryTab>('products')

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-2xl font-bold text-foreground mb-4">{t('inventory.title')}</h1>

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === tb.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'products'   && <ProductsPage />}
        {tab === 'categories' && <CategoriesPage />}
        {tab === 'brands'     && <BrandsPage />}
        {tab === 'suppliers'  && <SuppliersPage />}
        {tab === 'partners'   && <PartnersPage />}
      </div>
    </div>
  )
}
