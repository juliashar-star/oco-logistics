/**
 * Помощник изоляции: каждый запрос к данным ограничен companyId текущего пользователя.
 */
export function scopeToCompany<T extends Record<string, unknown>>(
  companyId: string,
  where: T = {} as T,
): T & { companyId: string } {
  return { ...where, companyId };
}
