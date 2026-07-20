/** 段落分割工具 — 前后端共享，保证分段一致性。 */

export function splitIntoParagraphs(content: string): string[] {
  const raw = content.replace(/\r\n/g, '\n').trim()
  if (!raw) return [content]

  // 1. HTML 块级标签分割
  if (/<\/(p|h[1-6]|li|blockquote|div)>/i.test(raw)) {
    const parts = raw.split(/(<\/p>|<\/h[1-6]>|<\/li>|<\/blockquote>|<\/div>)/i)
    const segs: string[] = []
    let cur = ''
    for (const p of parts) {
      cur += p
      if (/<\/(p|h[1-6]|li|blockquote|div)>$/i.test(p.trim())) {
        if (cur.trim()) segs.push(cur.trim())
        cur = ''
      }
    }
    if (cur.trim()) segs.push(cur.trim())
    if (segs.length > 1) return segs
  }

  // 2. 双换行分割
  const double = raw.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  if (double.length > 1) return double

  // 3. 单换行分割
  const single = raw.split(/\n/).map(s => s.trim()).filter(Boolean)
  if (single.length > 1) return single

  // 4. 句子分割（剥离标签后的纯文本分析）
  const plain = raw.replace(/<[^>]+>/g, '').trim()
  if (plain.length > 60) {
    const sentences = plain.split(/(?<=[.。!?！？])\s*/).map(s => s.trim()).filter(s => s.length > 2)
    if (sentences.length > 1) return sentences
  }

  // 5. 硬切
  if (plain.length > 120) {
    const chunks: string[] = []
    for (let i = 0; i < plain.length; i += 120) chunks.push(plain.slice(i, i + 120).trim())
    if (chunks.length > 1) return chunks
  }

  return [raw]
}