import { ipcMain, shell, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDb } from '../database/index'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

const docsDir = path.join(app.getPath('userData'), 'store', 'docs')
fs.mkdirSync(docsDir, { recursive: true })

function isOwnerOrManager(session: { role: string } | undefined): boolean {
  return session?.role === 'owner' || session?.role === 'manager'
}

function isPathUnderDocs(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  const base = path.resolve(docsDir)
  return resolved === base || resolved.startsWith(base + path.sep)
}

/** If name exists on disk, append timestamp before extension. */
function uniqueDiskFileName(originalName: string): string {
  const ext = path.extname(originalName)
  const base = path.basename(originalName, ext) || 'document'
  const safeBase = base.replace(/[^\w\-.\s]/g, '_').trim() || 'document'
  const first = `${safeBase}${ext}`
  if (!fs.existsSync(path.join(docsDir, first))) return first
  return `${safeBase}_${Date.now()}${ext}`
}

export function registerStoreDocumentHandlers(): void {
  ipcMain.handle('storeDocuments:list', event => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT sd.*, u.full_name AS uploaded_by_name
           FROM store_documents sd
           LEFT JOIN users u ON u.id = sd.uploaded_by
           ORDER BY sd.created_at DESC`
        )
        .all()
      return ok(rows)
    } catch (e) {
      log.error('storeDocuments:list', e)
      return err('Failed to list store documents')
    }
  })

  ipcMain.handle('storeDocuments:upload', (event, data: unknown) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!isOwnerOrManager(session)) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = data as {
        name: string
        doc_type: string
        file_name: string
        file_data: string
        has_expiry: number
        expiry_date?: string
        notes?: string
      }
      let buffer: Buffer
      try {
        buffer = Buffer.from(d.file_data, 'base64')
      } catch {
        return err('Invalid file data')
      }
      if (!buffer.length) return err('Empty file')

      const diskName = uniqueDiskFileName(d.file_name || 'upload')
      const fullPath = path.join(docsDir, diskName)
      fs.writeFileSync(fullPath, buffer)

      const db = getDb()
      const result = db
        .prepare(
          `INSERT INTO store_documents (
            name, doc_type, file_path, file_name, has_expiry, expiry_date, notes, uploaded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          d.name.trim(),
          d.doc_type,
          fullPath,
          diskName,
          d.has_expiry ? 1 : 0,
          d.has_expiry && d.expiry_date ? d.expiry_date : null,
          d.notes?.trim() || null,
          session!.userId
        )
      return ok({ id: Number(result.lastInsertRowid), file_path: fullPath })
    } catch (e) {
      log.error('storeDocuments:upload', e)
      return err('Failed to upload document')
    }
  })

  ipcMain.handle('storeDocuments:delete', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!isOwnerOrManager(session)) return err('Forbidden', 'ERR_FORBIDDEN')
      const db = getDb()
      const row = db
        .prepare('SELECT file_path FROM store_documents WHERE id = ?')
        .get(id) as { file_path: string } | undefined
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      db.prepare('DELETE FROM store_documents WHERE id = ?').run(id)
      try {
        if (row.file_path && fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path)
      } catch {
        /* non-fatal */
      }
      return ok(null)
    } catch (e) {
      log.error('storeDocuments:delete', e)
      return err('Failed to delete document')
    }
  })

  ipcMain.handle('storeDocuments:openFile', (event, filePath: string) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!filePath || typeof filePath !== 'string') return err('Invalid path')
      if (!isPathUnderDocs(filePath)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!fs.existsSync(filePath)) return err('File not found', 'ERR_NOT_FOUND')
      void shell.openPath(filePath)
      return ok(null)
    } catch (e) {
      log.error('storeDocuments:openFile', e)
      return err('Failed to open file')
    }
  })

  ipcMain.handle('storeDocuments:showInFolder', (event, filePath: string) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!filePath || typeof filePath !== 'string') return err('Invalid path')
      if (!isPathUnderDocs(filePath)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!fs.existsSync(filePath)) return err('File not found', 'ERR_NOT_FOUND')
      shell.showItemInFolder(filePath)
      return ok(null)
    } catch (e) {
      log.error('storeDocuments:showInFolder', e)
      return err('Failed to show in folder')
    }
  })
}
