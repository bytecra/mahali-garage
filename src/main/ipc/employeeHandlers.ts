import { ipcMain, dialog, shell, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { employeeRepo } from '../database/repositories/employeeRepo'
import { salaryRepo, type SalaryType } from '../database/repositories/salaryRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

const DOCUMENTS_BASE = path.join(
  app.getPath('documents'),
  'Mahali Garage',
  'Employee Documents',
)

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function registerEmployeeHandlers(): void {
  /* ── Employees CRUD ────────────────────────────────────────────────────── */

  ipcMain.handle('employees:list', (event, filters) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(employeeRepo.list(filters))
    } catch (e) {
      log.error('employees:list', e)
      return err('Failed to list employees')
    }
  })

  ipcMain.handle('employees:getById', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const emp = employeeRepo.getById(id)
      return emp ? ok(emp) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) {
      log.error('employees:getById', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:create', (event, data) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const emp = employeeRepo.create({ ...data, created_by: session.userId })
      return ok(emp)
    } catch (e) {
      log.error('employees:create', e)
      return err('Failed to create employee')
    }
  })

  ipcMain.handle('employees:previewNextId', (event) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const preview = employeeRepo.previewEmployeeId()
      return ok(preview)
    } catch (e) {
      log.error('employees:previewNextId', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:update', (event, id: number, data) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const emp = employeeRepo.update(id, data)
      return ok(emp)
    } catch (e) {
      log.error('employees:update', e)
      return err('Failed to update employee')
    }
  })

  ipcMain.handle('employees:delete', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      employeeRepo.delete(id)
      return ok(true)
    } catch (e) {
      log.error('employees:delete', e)
      return err('Failed to delete employee')
    }
  })

  /* ── Vacations ─────────────────────────────────────────────────────────── */

  ipcMain.handle('employees:listVacations', (event, employeeId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(employeeRepo.listVacations(employeeId))
    } catch (e) {
      log.error('employees:listVacations', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:addVacation', (event, data) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const result = employeeRepo.addVacation({ ...data, approved_by: session.userId })
      return ok(result)
    } catch (e) {
      log.error('employees:addVacation', e)
      return err('Failed to add vacation')
    }
  })

  ipcMain.handle('employees:endVacation', (event, vacationId: number, actualReturnDate: string) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      employeeRepo.endVacation(vacationId, actualReturnDate)
      return ok(true)
    } catch (e) {
      log.error('employees:endVacation', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:deleteVacation', (event, vacationId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      employeeRepo.deleteVacation(vacationId)
      return ok(true)
    } catch (e) {
      log.error('employees:deleteVacation', e)
      return err('Failed')
    }
  })

  /* ── Documents ─────────────────────────────────────────────────────────── */

  ipcMain.handle('employees:listDocuments', (event, employeeId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(employeeRepo.listDocuments(employeeId))
    } catch (e) {
      log.error('employees:listDocuments', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:uploadDocument', (event, data) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')

      const { employeeId, documentType, documentName, fileBuffer, fileName, mimeType, metadata } = data

      const emp = employeeRepo.getById(employeeId) as { employee_id: string } | undefined
      if (!emp) return err('Employee not found', 'ERR_NOT_FOUND')

      const empFolder = path.join(DOCUMENTS_BASE, emp.employee_id)
      ensureDir(empFolder)

      const timestamp = new Date().toISOString().split('T')[0]
      const ext = path.extname(fileName || 'file.jpg') || '.jpg'
      const sanitized = documentType.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      const finalName = `${sanitized}_${timestamp}_${Date.now()}${ext}`
      const filePath = path.join(empFolder, finalName)

      fs.writeFileSync(filePath, Buffer.from(fileBuffer))
      const stats = fs.statSync(filePath)

      const result = employeeRepo.addDocument({
        employee_id: employeeId,
        document_type: documentType,
        document_name: documentName || fileName,
        file_path: filePath,
        file_size: stats.size,
        mime_type: mimeType,
        issue_date: metadata?.issueDate ?? null,
        expiry_date: metadata?.expiryDate ?? null,
        document_number: metadata?.documentNumber ?? null,
        notes: metadata?.notes ?? null,
        uploaded_by: session.userId,
      })

      return ok({ ...result, filePath, fileSize: stats.size })
    } catch (e) {
      log.error('employees:uploadDocument', e)
      return err('Failed to upload document')
    }
  })

  ipcMain.handle('employees:openDocument', (event, docId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')

      const doc = employeeRepo.getDocument(docId) as { file_path: string } | undefined
      if (!doc || !fs.existsSync(doc.file_path))
        return err('Document file not found', 'ERR_NOT_FOUND')

      shell.openPath(doc.file_path)
      return ok(true)
    } catch (e) {
      log.error('employees:openDocument', e)
      return err('Failed to open document')
    }
  })

  ipcMain.handle('employees:deleteDocument', (event, docId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')

      const doc = employeeRepo.getDocument(docId) as { file_path: string } | undefined
      if (doc && fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path)
      }
      employeeRepo.deleteDocument(docId)
      return ok(true)
    } catch (e) {
      log.error('employees:deleteDocument', e)
      return err('Failed to delete document')
    }
  })

  ipcMain.handle('employees:getSalary', (event, employeeId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(salaryRepo.getByEmployeeId(employeeId))
    } catch (e) {
      log.error('employees:getSalary', e)
      return err('Failed')
    }
  })

  ipcMain.handle('employees:upsertSalary', (event, data: {
    employee_id: number
    salary_type: SalaryType
    amount: number
    payment_day?: number | null
    start_date: string
    notes?: string | null
    custom_period?: string | null
  }) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const row = salaryRepo.upsert(data)
      return ok(row)
    } catch (e) {
      log.error('employees:upsertSalary', e)
      return err('Failed to save salary')
    }
  })

  ipcMain.handle('employees:listPayroll', (event, filter: 'all' | 'paid' | 'unpaid' | 'overdue') => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(salaryRepo.listPayroll(filter ?? 'all'))
    } catch (e) {
      log.error('employees:listPayroll', e)
      return err('Failed to load payroll')
    }
  })

  ipcMain.handle('employees:markSalaryPaid', (event, employeeId: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner')
        return err('Forbidden', 'ERR_FORBIDDEN')
      const result = salaryRepo.markPaid(employeeId)
      return ok(result)
    } catch (e) {
      log.error('employees:markSalaryPaid', e)
      const msg = e instanceof Error ? e.message : 'Failed to record payment'
      return err(msg)
    }
  })

  ipcMain.handle('employees:chooseFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
        ],
      })
      if (result.canceled || !result.filePaths.length) return ok(null)
      const filePath = result.filePaths[0]
      const buffer = fs.readFileSync(filePath)
      const fileName = path.basename(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
      }
      return ok({
        fileName,
        fileBuffer: Array.from(buffer),
        mimeType: mimeMap[ext] || 'application/octet-stream',
        fileSize: buffer.length,
      })
    } catch (e) {
      log.error('employees:chooseFile', e)
      return err('Failed to choose file')
    }
  })
}
