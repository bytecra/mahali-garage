import log from '../utils/logger'
import { salaryRepo } from '../database/repositories/salaryRepo'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

export function initPayrollScheduler(): void {
  if (timer) return
  const tick = (): void => {
    try {
      salaryRepo.runDailyPayrollTasks()
    } catch (e) {
      log.error('payrollScheduler tick', e)
    }
  }
  setTimeout(tick, 8_000)
  timer = setInterval(tick, CHECK_INTERVAL_MS)
}

export function stopPayrollScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
