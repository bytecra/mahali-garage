import { ipcMain } from 'electron'
import { taskRepo } from '../database/repositories/taskRepo'
import { notificationRepo } from '../database/repositories/notificationRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerTaskHandlers(): void {
  // ── List ──────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const isPrivileged = ['owner', 'manager'].includes(session.role)
      const viewerUserId = isPrivileged ? undefined : session.userId
      return ok(taskRepo.list({ ...filters, viewerUserId }))
    } catch (e) {
      log.error('tasks:list', e)
      return err('Failed to list tasks', 'ERR_TASKS')
    }
  })

  // ── Get by ID ─────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const task = taskRepo.getById(id)
      if (!task) return err('Task not found', 'ERR_NOT_FOUND')
      return ok(task)
    } catch (e) {
      log.error('tasks:getById', e)
      return err('Failed to get task', 'ERR_TASKS')
    }
  })

  // ── Create ────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.create'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const taskId = taskRepo.create({ ...data, created_by: session.userId })

      // Handle assignees
      if (Array.isArray(data.assignee_ids) && data.assignee_ids.length > 0) {
        if (authService.hasPermission(event.sender.id, 'tasks.assign')) {
          taskRepo.setAssignees(taskId, data.assignee_ids, session.userId)
          notificationRepo.notifyAssigned(taskId, data.title, data.assignee_ids)
        }
      }

      return ok({ id: taskId })
    } catch (e) {
      log.error('tasks:create', e)
      return err('Failed to create task', 'ERR_TASKS')
    }
  })

  // ── Update ────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const task = taskRepo.getById(id)
      if (!task) return err('Task not found', 'ERR_NOT_FOUND')

      // Employees can only edit their own tasks
      const isPrivileged = ['owner', 'manager'].includes(session.role)
      if (!isPrivileged && !authService.hasPermission(event.sender.id, 'tasks.edit')) {
        if (task.created_by !== session.userId)
          return err('Cannot edit tasks you did not create', 'ERR_FORBIDDEN')
      }

      taskRepo.update(id, data)

      // Update assignees if provided
      if (Array.isArray(data.assignee_ids) && authService.hasPermission(event.sender.id, 'tasks.assign')) {
        const prev = taskRepo.getAssignees(id).map(a => a.user_id)
        taskRepo.setAssignees(id, data.assignee_ids, session.userId)
        const newAssignees = (data.assignee_ids as number[]).filter(uid => !prev.includes(uid))
        if (newAssignees.length > 0)
          notificationRepo.notifyAssigned(id, data.title ?? task.title, newAssignees)
      }

      return ok(null)
    } catch (e) {
      log.error('tasks:update', e)
      return err('Failed to update task', 'ERR_TASKS')
    }
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.delete'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const task = taskRepo.getById(id)
      if (!task) return err('Task not found', 'ERR_NOT_FOUND')
      taskRepo.delete(id)
      return ok(null)
    } catch (e) {
      log.error('tasks:delete', e)
      return err('Failed to delete task', 'ERR_TASKS')
    }
  })

  // ── Calendar ──────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:getForCalendar', (event, dateFrom: string, dateTo: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const isPrivileged = ['owner', 'manager'].includes(session.role)
      const viewerUserId = isPrivileged ? undefined : session.userId
      return ok(taskRepo.getForCalendar(dateFrom, dateTo, viewerUserId))
    } catch (e) {
      log.error('tasks:getForCalendar', e)
      return err('Failed to get calendar events', 'ERR_TASKS')
    }
  })

  // ── Set assignees ─────────────────────────────────────────────────────────
  ipcMain.handle('tasks:setAssignees', (event, taskId: number, userIds: number[]) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.assign'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const task = taskRepo.getById(taskId)
      if (!task) return err('Task not found', 'ERR_NOT_FOUND')
      const prev = taskRepo.getAssignees(taskId).map(a => a.user_id)
      taskRepo.setAssignees(taskId, userIds, session.userId)
      const newAssignees = userIds.filter(uid => !prev.includes(uid))
      if (newAssignees.length > 0)
        notificationRepo.notifyAssigned(taskId, task.title, newAssignees)
      return ok(null)
    } catch (e) {
      log.error('tasks:setAssignees', e)
      return err('Failed to set assignees', 'ERR_TASKS')
    }
  })

  // ── Create delivery from sale ─────────────────────────────────────────────
  ipcMain.handle('tasks:createDelivery', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.create'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const taskId = taskRepo.create({
        ...data,
        task_type: 'delivery',
        created_by: session.userId,
      })
      return ok({ id: taskId })
    } catch (e) {
      log.error('tasks:createDelivery', e)
      return err('Failed to create delivery', 'ERR_TASKS')
    }
  })

  // ── Dashboard summary ─────────────────────────────────────────────────────
  ipcMain.handle('tasks:getSummary', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'tasks.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)!
      const isPrivileged = ['owner', 'manager'].includes(session.role)
      const viewerUserId = isPrivileged ? undefined : session.userId
      return ok(taskRepo.getSummary(viewerUserId))
    } catch (e) {
      log.error('tasks:getSummary', e)
      return err('Failed to get task summary', 'ERR_TASKS')
    }
  })
}
