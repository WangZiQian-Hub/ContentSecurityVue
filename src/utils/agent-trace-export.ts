// ZIP STORE records: UTF-8 names, CRC32, no dependencies and no disguised JSON files.
export function traceZip(files: { name: string; text: string }[]): Blob {
  const encoder = new TextEncoder(),
    chunks: Uint8Array<ArrayBuffer>[] = [],
    central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  const header = (size: number) => new Uint8Array(size)
  for (const file of files) {
    const name = encoder.encode(file.name),
      data = encoder.encode(file.text)
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    crc = (crc ^ 0xffffffff) >>> 0
    const local = header(30),
      l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true)
    l.setUint16(4, 20, true)
    l.setUint16(6, 0x800, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, data.length, true)
    l.setUint32(22, data.length, true)
    l.setUint16(26, name.length, true)
    chunks.push(local, name, data)
    const c = header(46),
      v = new DataView(c.buffer)
    v.setUint32(0, 0x02014b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 20, true)
    v.setUint16(8, 0x800, true)
    v.setUint32(16, crc, true)
    v.setUint32(20, data.length, true)
    v.setUint32(24, data.length, true)
    v.setUint16(28, name.length, true)
    v.setUint32(42, offset, true)
    central.push(c, name)
    offset += local.length + name.length + data.length
  }
  const end = header(22),
    e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(
    12,
    central.reduce((n, a) => n + a.length, 0),
    true,
  )
  e.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}
export async function tracePng(lines: string[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = Math.max(600, lines.length * 32 + 100)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片导出')
  ctx.fillStyle = '#f3f8ff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#163a70'
  ctx.font = '22px sans-serif'
  lines.forEach((line, i) => ctx.fillText(line, 40, 60 + i * 32, 1520))
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片生成失败'))), 'image/png'),
  )
}


/** Render the displayed audit canvas, including SVG graphs and ECharts canvases. */
export async function tracePagePng(root: HTMLElement, onProgress: (value: number) => void = () => {}): Promise<Blob> {
  onProgress(72)
  await document.fonts.ready
  let copied = 0
  const yieldFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const width = Math.ceil(Math.max(root.scrollWidth, root.getBoundingClientRect().width))
  const height = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height))
  if (!width || !height) throw new Error('页面尚未加载，请稍后导出')
  const excluded = '.view-export-status,.at-task,.ats-export-status,.ex-export-status,.tools-export-status,.at-heading > div,.el-overlay,.el-popper'
  async function copy(source: Element): Promise<Element | null> {
    if (++copied % 100 === 0) {
      onProgress(Math.min(86, 74 + copied / 1000))
      await yieldFrame()
    }
    if (source.matches(excluded)) return null
    const style = getComputedStyle(source)
    if (style.display === 'none' || style.visibility === 'hidden') return null
    const clone = source.cloneNode(false) as Element & { style: CSSStyleDeclaration }
    if (clone.style) {
      for (const key of Array.from(style)) clone.style.setProperty(key, style.getPropertyValue(key))
      clone.style.setProperty('animation', 'none')
      clone.style.setProperty('transition', 'none')
      // Computed styles are self-contained: prevent a second transform in the SVG wrapper.
      clone.style.setProperty('caret-color', 'transparent')
    }
    if (source instanceof HTMLCanvasElement) {
      const img = document.createElement('img')
      img.src = source.toDataURL('image/png')
      img.style.cssText = clone.getAttribute('style') || ''
      img.width = source.clientWidth
      img.height = source.clientHeight
      return img
    }
    if (source instanceof HTMLInputElement) clone.setAttribute('value', source.value)
    if (source instanceof HTMLTextAreaElement) clone.textContent = source.value
    if (source instanceof HTMLImageElement && source.src && !source.src.startsWith('data:')) {
      // Never fetch arbitrary external assets while exporting an audit page.
      if (!source.complete || !source.naturalWidth) return null
      const canvas = document.createElement('canvas')
      canvas.width = source.naturalWidth; canvas.height = source.naturalHeight
      canvas.getContext('2d')?.drawImage(source, 0, 0)
      clone.setAttribute('src', canvas.toDataURL('image/png'))
      clone.removeAttribute('srcset')
    }
    if (!(source instanceof HTMLTextAreaElement)) {
      for (const child of source.childNodes) {
        const node = child instanceof Element ? await copy(child) : child.cloneNode(true)
        if (node) clone.appendChild(node)
      }
    }
    // Preserve the visible slice of scrollable code/log/sequence panels.
    if ((source.scrollTop || source.scrollLeft) && clone.firstElementChild) {
      const children = Array.from(clone.childNodes)
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `transform:translate(${-source.scrollLeft}px,${-source.scrollTop}px)`
      for (const child of children) wrapper.appendChild(child)
      clone.appendChild(wrapper)
    }
    return clone
  }
  const content = await copy(root) as HTMLElement | null
  if (!content) throw new Error('没有可导出的页面内容')
  content.style.margin = '0'
  content.style.width = `${width}px`
  content.style.boxSizing = 'border-box'
  // Export-only masthead: do not reuse fixed computed flex widths after removing actions.
  const heading = content.querySelector<HTMLElement>('.at-heading')
  const tabs = content.querySelector<HTMLElement>('.at-tabs')
  if (heading) {
    heading.style.cssText = 'display:block;width:100%;height:auto;min-height:0;margin:0 0 18px;padding:4px 0 0;box-sizing:border-box;'
    const title = heading.querySelector<HTMLElement>('h1')
    if (title) title.style.cssText = 'display:block;width:auto;height:auto;margin:0;padding:0;font:700 30px/1.5 Microsoft YaHei,Arial,sans-serif;white-space:nowrap;color:#142644;'
  }
  if (tabs) {
    tabs.style.cssText = 'display:flex;align-items:center;flex-wrap:nowrap;gap:12px;width:100%;height:auto;min-height:72px;margin:0 0 20px;padding:12px;box-sizing:border-box;border:1px solid #dce7f7;border-radius:12px;background:#ffffff;'
    tabs.querySelector('.at-page')?.remove()
    for (const button of tabs.querySelectorAll<HTMLElement>(':scope > button')) {
      const active = button.classList.contains('active')
      // Flatten copied child spans so inherited text-fill cannot override the export palette.
      const label = button.textContent?.trim() || ''
      button.textContent = label
      button.style.cssText = `display:block;flex:0 0 auto;width:auto;min-width:160px;height:auto;margin:0;padding:12px 28px;box-sizing:border-box;white-space:nowrap;font:700 20px/1.5 Microsoft YaHei,Arial,sans-serif;border:1px solid ${active ? '#456cff' : '#dce7f7'};border-radius:10px;background:${active ? '#456cff' : '#f3f7ff'};color:${active ? '#fff' : '#435e82'};-webkit-text-fill-color:${active ? '#fff' : '#435e82'};`
    }
  }
  // Normalize text sizing only in the detached export tree. Computed inline
  // widths can otherwise squeeze labels when the SVG lays out the cloned page.
  const labels = '.el-tag,.el-tag__content,.el-button > span,.el-select__placeholder,.ats-kpis span,.ats-kpis strong,.tool-metric b,.tool-metric strong,.tool-metric small,.at-categories > span,.at-parse-status,.at-recognition-label,.ex-sample .el-tag'
  for (const label of content.querySelectorAll<HTMLElement>(labels)) {
    label.style.whiteSpace = 'nowrap'
    label.style.wordBreak = 'normal'
    label.style.overflowWrap = 'normal'
    label.style.flexShrink = '0'
    label.style.height = 'auto'
    label.style.minHeight = 'min-content'
    if (!label.classList.contains('el-select__placeholder')) label.style.width = 'auto'
  }
  for (const title of content.querySelectorAll<HTMLElement>('h2,h3,h4,.panel-heading,.ats-filters label,.tools-query > b,.at-context > label')) {
    title.style.whiteSpace = 'nowrap'
    title.style.wordBreak = 'normal'
    title.style.flexShrink = '0'
    title.style.height = 'auto'
  }
  for (const cell of content.querySelectorAll<HTMLElement>('th')) {
    cell.style.whiteSpace = 'nowrap'
    cell.style.wordBreak = 'normal'
    cell.style.textOverflow = 'clip'
    cell.style.overflow = 'visible'
  }
  // Keep language totals distinct instead of "100English 100".
  for (const value of content.querySelectorAll<HTMLElement>('.at-ingest-grid .panel-content p > span')) {
    value.style.display = 'inline-block'
    value.style.width = 'auto'
    value.style.marginRight = '14px'
    value.style.marginInlineEnd = '14px'
    value.style.whiteSpace = 'nowrap'
  }
  for (const cell of content.querySelectorAll<HTMLElement>('.ats-sample-table .cell')) {
    cell.style.width = 'auto'
    cell.style.inlineSize = 'auto'
    cell.style.boxSizing = 'border-box'
    cell.style.paddingInline = '10px'
    cell.style.whiteSpace = 'nowrap'
    cell.style.wordBreak = 'normal'
  }
  // Metric icons and labels must not compete with the numbers for fixed widths.
  for (const card of content.querySelectorAll<HTMLElement>('.ats-kpis article')) {
    card.style.gap = '10px'
    card.style.paddingLeft = '12px'
    card.style.paddingRight = '12px'
    for (const child of card.querySelectorAll<HTMLElement>(':scope > div')) {
      child.style.width = 'auto'
      child.style.minWidth = '0'
      child.style.height = 'auto'
    }
  }
  // Export-specific layouts for rows whose live flex widths become stale in SVG.
  const styleExport = (selector: string, rules: Record<string, string>) => {
    for (const element of content.querySelectorAll<HTMLElement>(selector)) {
      for (const [key, value] of Object.entries(rules)) element.style.setProperty(key, value, 'important')
    }
  }
  styleExport('.at-issue', {
    display: 'grid', 'grid-template-columns': 'auto auto minmax(0,1fr) auto',
    'align-items': 'center', gap: '8px', 'flex-wrap': 'nowrap',
  })
  styleExport('.at-issue > *', { width: 'auto', 'inline-size': 'auto', 'min-width': '0', 'margin': '0', 'align-self': 'center' })
  styleExport('.at-issue > .el-button,.at-issue > strong', { 'white-space': 'nowrap', 'justify-self': 'end' })
  styleExport('.at-issue > small', { 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' })
  styleExport('.at-file-actions', { display: 'flex', 'flex-wrap': 'nowrap', width: 'auto', 'inline-size': 'auto', gap: '14px' })
  styleExport('.at-file-actions > *', { 'flex-shrink': '0', 'margin-inline': '0', 'white-space': 'nowrap' })
  styleExport('.at-mapping-title', { 'flex-wrap': 'nowrap', 'align-items': 'center' })
  styleExport('.at-mapping-title strong', { width: 'auto', 'inline-size': 'auto', 'white-space': 'nowrap', 'flex-shrink': '0' })
  styleExport('.ats-pagination', { display: 'flex', 'flex-wrap': 'nowrap', 'align-items': 'center', 'justify-content': 'flex-end', gap: '16px' })
  styleExport('.ats-pagination > span', { width: 'max-content', 'inline-size': 'max-content', height: 'auto', 'block-size': 'auto', 'white-space': 'nowrap', flex: '0 0 auto', 'line-height': '32px' })
  styleExport('.ats-pagination > .el-pagination', { flex: '0 0 auto', 'white-space': 'nowrap' })
  styleExport('.tools-metrics', { display: 'grid', 'grid-template-columns': 'auto repeat(6,minmax(72px,1fr)) minmax(390px,2fr)', 'align-items': 'center', gap: '10px', height: 'auto', 'block-size': 'auto' })
  styleExport('.tools-metrics > *', { width: 'auto', 'inline-size': 'auto', 'min-width': '0', 'margin-inline': '0' })
  styleExport('.tool-timing', { 'white-space': 'nowrap', 'align-self': 'center' })
  styleExport('.tool-explanation button', { display: 'inline-flex', width: 'max-content', 'inline-size': 'max-content', height: 'auto', 'block-size': 'auto', 'white-space': 'nowrap', 'word-break': 'normal', 'flex-shrink': '0', 'line-height': '22px', 'vertical-align': 'middle' })
  styleExport('.tool-explanation', { height: 'auto', 'block-size': 'auto', 'min-height': '28px', 'line-height': '24px' })
  onProgress(88)
  await yieldFrame()
  const padding = 28
  const exportWidth = width + padding * 2, exportHeight = height + padding * 2 + 80
  const wrapper = document.createElement('div')
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  wrapper.style.cssText = `width:${exportWidth}px;height:${exportHeight}px;padding:${padding}px;box-sizing:border-box;background:linear-gradient(135deg,#f0f6ff,#ffffff);font-family:Microsoft YaHei,Arial,sans-serif;`
  wrapper.appendChild(content)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(wrapper)}</foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  onProgress(94)
  await yieldFrame()
  const scale = Math.min(2, 16000 / exportWidth, 16000 / exportHeight, Math.sqrt(48000000 / (exportWidth * exportHeight)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(exportWidth * scale)
  canvas.height = Math.ceil(exportHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片导出')
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0)
  onProgress(97)
  await yieldFrame()
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('页面图片生成失败')), 'image/png'))
}
