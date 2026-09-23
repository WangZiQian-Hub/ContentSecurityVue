export function mapKeys(value: unknown, direction: 'snake' | 'camel'): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, direction))
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        direction === 'snake'
          ? key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
          : key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        mapKeys(item, direction),
      ]),
    )
  }
  return value
}
