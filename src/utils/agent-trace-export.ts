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

/** Freeze the displayed audit page synchronously, then render its detached copy.
 * This exports the current page appearance, not a server-generated data report.
 * Nested scroll panels keep their visible slice; the outer page includes its
 * full height even when the application's main viewport has been scrolled.
 */
export async function tracePagePng(
  root: HTMLElement,
  onProgress: (value: number) => void = () => {},
): Promise<Blob> {
  const width = Math.ceil(Math.max(root.scrollWidth, root.getBoundingClientRect().width))
  const height = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height))
  if (!width || !height) throw new Error('页面尚未加载，请稍后导出')
  const excluded =
    '.page-snapshot-status,.view-export-status,.at-task,.ats-export-status,.ex-export-status,.tools-export-status,.at-heading > div,.el-overlay,.el-popper'
  // Do not yield while cloning: capture text, SVG, canvases, styles and selection
  // from the same browser frame before the user can change the live page.
  function copy(source: Element): Element | null {
    if (source.matches(excluded)) return null
    const style = getComputedStyle(source)
    if (style.display === 'none' || style.visibility === 'hidden') return null
    const clone = source.cloneNode(false) as HTMLElement | SVGElement
    for (const key of Array.from(style)) {
      // SVG marker/filter references must resolve inside the exported image.
      const value = style
        .getPropertyValue(key)
        .replace(/url\(["']?[^)"']*#([^)'" ]+)["']?\)/g, 'url(#$1)')
      clone.style.setProperty(key, value)
    }
    clone.style.setProperty('animation', 'none')
    clone.style.setProperty('transition', 'none')
    clone.style.setProperty('caret-color', 'transparent')
    if (source instanceof HTMLCanvasElement) {
      const img = document.createElement('img')
      img.src = source.toDataURL('image/png')
      img.style.cssText = clone.style.cssText
      img.width = source.clientWidth
      img.height = source.clientHeight
      return img
    }
    if (source instanceof HTMLInputElement) {
      clone.setAttribute('value', source.value)
      clone.toggleAttribute('checked', source.checked)
    }
    if (source instanceof HTMLTextAreaElement) clone.textContent = source.value
    if (source instanceof HTMLImageElement && source.src && !source.src.startsWith('data:')) {
      if (!source.complete || !source.naturalWidth)
        throw new Error('页面图片尚未加载完成，请稍后重试')
      const canvas = document.createElement('canvas')
      canvas.width = source.naturalWidth
      canvas.height = source.naturalHeight
      canvas.getContext('2d')?.drawImage(source, 0, 0)
      clone.setAttribute('src', canvas.toDataURL('image/png'))
      clone.removeAttribute('srcset')
    }
    if (!(source instanceof HTMLTextAreaElement)) {
      for (const child of source.childNodes) {
        const node = child instanceof Element ? copy(child) : child.cloneNode(true)
        if (node) clone.appendChild(node)
      }
    }
    if ((source.scrollTop || source.scrollLeft) && clone.firstElementChild) {
      const wrapper = document.createElement('div')
      wrapper.style.transform = `translate(${-source.scrollLeft}px,${-source.scrollTop}px)`
      while (clone.firstChild) wrapper.appendChild(clone.firstChild)
      clone.appendChild(wrapper)
    }
    return clone
  }
  const content = copy(root) as HTMLElement | null
  if (!content) throw new Error('没有可导出的页面内容')
  content.style.margin = '0'
  content.style.width = `${width}px`
  content.style.height = `${height}px`
  content.style.boxSizing = 'border-box'
  // All layout/style reads are complete. Everything below uses detached data.
  onProgress(65)
  await document.fonts.ready
  const padding = 20,
    exportWidth = width + padding * 2,
    exportHeight = height + padding * 2
  const wrapper = document.createElement('div')
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  wrapper.style.cssText = `width:${exportWidth}px;height:${exportHeight}px;padding:${padding}px;box-sizing:border-box;background:#f3f7ff;font-family:Microsoft YaHei,Arial,sans-serif;`
  wrapper.appendChild(content)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(wrapper)}</foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  onProgress(85)
  const scale = Math.min(
    2,
    16000 / exportWidth,
    16000 / exportHeight,
    Math.sqrt(48000000 / (exportWidth * exportHeight)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(exportWidth * scale)
  canvas.height = Math.ceil(exportHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片导出')
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0)
  onProgress(95)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('页面图片生成失败'))),
      'image/png',
    ),
  )
}
