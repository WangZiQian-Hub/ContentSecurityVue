/** 传输保持资源语种编码，所有治理页面统一展示名称；兼容历史中文标签。 */
export function languageName(code: string) {
  return (
    (
      {
        all: '全部语种',
        zh: '中文',
        en: '英文',
        ja: '日文',
        ar: '阿拉伯文',
        other: '其他',
        ko: '韩文',
        fr: '法文',
        de: '德文',
        es: '西班牙文',
      } as Record<string, string>
    )[code] || code
  )
}
