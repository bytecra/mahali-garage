import { registerAuthHandlers }     from './authHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerCategoryHandlers } from './categoryHandlers'
import { registerBrandHandlers }    from './brandHandlers'
import { registerSupplierHandlers } from './supplierHandlers'
import { registerProductHandlers }  from './productHandlers'
import { registerCustomerHandlers } from './customerHandlers'
import { registerSaleHandlers }     from './saleHandlers'
import { registerRepairHandlers }   from './repairHandlers'
import { registerReportHandlers }   from './reportHandlers'
import { registerUserHandlers }     from './userHandlers'
import { registerBackupHandlers }   from './backupHandlers'
import { registerLicenseHandlers }  from './licenseHandlers'
import { registerPartnerHandlers }  from './partnerHandlers'
import { registerActivityHandlers } from './activityHandlers'
import { registerExpenseHandlers }      from './expenseHandlers'
import { registerTaskHandlers }          from './taskHandlers'
import { registerNotificationHandlers }  from './notificationHandlers'
import { registerVehicleHandlers }       from './vehicleHandlers'
import { registerJobCardHandlers }       from './jobCardHandlers'
import { registerServiceHandlers }       from './serviceHandlers'
import { registerJobTypeHandlers }       from './jobTypeHandlers'
import { registerCustomReceiptHandlers } from './customReceiptHandlers'
import { registerEmployeeHandlers }      from './employeeHandlers'
import { registerCarBrandHandlers }        from './carBrandHandlers'
import { registerServiceCatalogHandlers } from './serviceCatalogHandlers'
import { registerCashDrawerHandlers } from './cashDrawerHandlers'
import { registerAssetHandlers } from './assetHandlers'
import { registerPrintHandlers } from './printHandlers'

export function registerAllHandlers(): void {
  registerAuthHandlers()
  registerSettingsHandlers()
  registerCategoryHandlers()
  registerBrandHandlers()
  registerSupplierHandlers()
  registerProductHandlers()
  registerCustomerHandlers()
  registerSaleHandlers()
  registerRepairHandlers()
  registerReportHandlers()
  registerUserHandlers()
  registerBackupHandlers()
  registerLicenseHandlers()
  registerPartnerHandlers()
  registerActivityHandlers()
  registerExpenseHandlers()
  registerTaskHandlers()
  registerNotificationHandlers()
  registerVehicleHandlers()
  registerJobCardHandlers()
  registerServiceHandlers()
  registerJobTypeHandlers()
  registerCustomReceiptHandlers()
  registerEmployeeHandlers()
  registerCarBrandHandlers()
  registerServiceCatalogHandlers()
  registerCashDrawerHandlers()
  registerAssetHandlers()
  registerPrintHandlers()
}
