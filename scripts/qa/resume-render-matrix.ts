/**
 * Resume render matrix — Phase 7 visual QA fixture generator.
 *
 * Renders every template x paper size for short, long, sparse and Unicode
 * résumés, re-extracts the PDF text and writes the artifacts for inspection.
 */
import fs from 'node:fs'
import { renderResumePdf, extractPdfText, countPdfPages } from '@/lib/job-discovery/pdf'
import { renderResumeDocx } from '@/lib/job-discovery/docx'
import type { ResumeLayout, ResumePaper } from '@/lib/job-discovery/types'

const outDir = 'qa-artifacts/staging-v5/matrix'
fs.mkdirSync(outDir, { recursive: true })

const base = [
  'Ayesha Khan',
  'Senior Full-Stack Engineer',
  'Senior engineer with verified Rails, React and PostgreSQL work.',
  'Skills: Ruby on Rails, React, PostgreSQL, TypeScript, Node.js',
  'Experience',
  'Senior Full-Stack Engineer — Analytical Engines (2020-01 – Present)',
  '- Shipped a billing platform used by 2,000 businesses.',
  '- Rebuilt the dashboard and cut load time from 4s to 800ms.',
  'Projects',
  'Realtime operations dashboard — React, Node.js, PostgreSQL',
  '- Outcome: used by the operations team.',
  'Links',
  '- https://github.com/ayeshakhan',
].join('\n')

const long = [
  base,
  'Experience',
  'Full-Stack Engineer — Northwind (2016-01 – 2019-12)',
  '- Built a Rails + React ordering flow.',
  '- Led the PostgreSQL migration from a legacy schema.',
  ...Array.from({ length: 40 }, (_, index) => `- Delivered project ${index + 1} with verified outcomes.`),
].join('\n')

const sparse = ['Ayesha Khan', 'Engineer', 'Skills: React'].join('\n')
const unicode = ['Ayesha Khan — ایجنس', 'مهندس برمجيات', 'Skills: React, پایتون, Français'].join('\n')

const cases: Array<{ name: string; text: string }> = [
  { name: 'short', text: base },
  { name: 'long', text: long },
  { name: 'sparse', text: sparse },
  { name: 'unicode', text: unicode },
]

const layouts: ResumeLayout[] = ['modern', 'technical', 'minimal', 'ultra']
const papers: ResumePaper[] = ['letter', 'a4']

const rows: Array<Record<string, unknown>> = []

async function main() {
  for (const item of cases) {
    for (const layout of layouts) {
      for (const paper of papers) {
        const pdf = await renderResumePdf(item.text, layout, paper)
        const extracted = await extractPdfText(pdf)
        const name = `${item.name}-${layout}-${paper}`
        fs.writeFileSync(`${outDir}/${name}.pdf`, pdf)
        const docx = renderResumeDocx(item.text, layout, paper)
        fs.writeFileSync(`${outDir}/${name}.docx`, docx)
        const mediaBox = pdf.toString('latin1').match(/\/MediaBox \[0 0 (\d+) (\d+)\]/)
        rows.push({
          name,
          pages: countPdfPages(pdf),
          media: mediaBox ? `${mediaBox[1]}x${mediaBox[2]}` : '?',
          link: pdf.toString('latin1').includes('/Subtype /Link'),
          extractedChars: extracted.trim().length,
          hasName: extracted.includes('Ayesha'),
          docxMagic: docx.subarray(0, 2).toString('latin1'),
        })
      }
    }
  }
  console.table(rows)
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
