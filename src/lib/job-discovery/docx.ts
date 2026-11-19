/**
 * Minimal DOCX renderer — a stored (uncompressed) OOXML zip.
 *
 * One column, one font, real paragraph structure. No images, no tables, no
 * tracked changes. Enough for an ATS to parse and for a human to edit.
 */

import type { ResumeLayout } from './types'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function zipFiles(files: Array<{ name: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  const dosTime = 0
  const dosDate = 0x21

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, file.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(dosTime, 12)
    cd.writeUInt16LE(dosDate, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(file.data.length, 20)
    cd.writeUInt32LE(file.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)

    offset += local.length + name.length + file.data.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, centralBuffer, end])
}

function documentXml(text: string, layout: ResumeLayout): string {
  const style = {
    modern: { font: 'Calibri', size: 22, margin: 1440 },
    technical: { font: 'Consolas', size: 20, margin: 1080 },
    minimal: { font: 'Arial', size: 20, margin: 1800 },
  }[layout] ?? { font: 'Calibri', size: 22, margin: 1440 }
  const kindFor = (line: string): 'heading' | 'bullet' | 'normal' => {
    const trimmed = line.trim()
    if (/^(experience|projects|skills|certifications|education|summary)$/i.test(trimmed)) return 'heading'
    if (trimmed.length > 1 && trimmed === trimmed.toUpperCase() && trimmed.length < 42 && /[A-Z]/.test(trimmed)) return 'heading'
    if (/^[-•]\s+/.test(trimmed)) return 'bullet'
    return 'normal'
  }
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, '    '))
    .map((line) => {
      const kind = kindFor(line)
      const size = kind === 'heading' ? style.size + 4 : style.size
      const bold = kind === 'heading' ? '<w:b/>' : ''
      const indent = kind === 'bullet' ? '<w:ind w:left="360"/>' : ''
      return `    <w:p><w:pPr>${indent}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${style.font}" w:hAnsi="${style.font}"/>${bold}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${paragraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${style.margin}" w:right="${style.margin}" w:bottom="${style.margin}" w:left="${style.margin}"/></w:sectPr>
  </w:body>
</w:document>`
}

export function renderResumeDocx(sourceText: string, layout: ResumeLayout = 'modern'): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  return zipFiles([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml(sourceText, layout), 'utf8') },
  ])
}
