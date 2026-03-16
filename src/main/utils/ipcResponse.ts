export interface IpcSuccess<T> {
  success: true
  data: T
}

export interface IpcError {
  success: false
  error: string
  code: string
}

export type IpcResponse<T> = IpcSuccess<T> | IpcError

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export function ok<T>(data: T): IpcSuccess<T> {
  return { success: true, data }
}

export function err(error: string, code = 'ERR_UNKNOWN'): IpcError {
  return { success: false, error, code }
}
