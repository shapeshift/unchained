import { ApiError } from '.'

const MAX_PAGE_SIZE = 100

export function validatePageSize(pageSize: number): void {
  if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')
  if (pageSize > MAX_PAGE_SIZE) throw new ApiError('Bad Request', 422, `Max allowed page size is ${MAX_PAGE_SIZE}`)
}
