import { ImportMessage, MarkdownBlock, MarkdownSection, MarkdownTextModel, MarkdownTextParseResult } from '../model'

export function parseMarkdownText(input: string): MarkdownTextParseResult {
	const lines = input.replace(/\r\n/g, '\n').split('\n')
	const warnings: ImportMessage[] = []
	const errors: ImportMessage[] = []
	const sections: MarkdownSection[] = []
	let currentSection: MarkdownSection = { id: 'section-1', blocks: [] }
	let sectionIndex = 1
	let blockIndex = 1
	let i = 0

	while (i < lines.length) {
		const raw = lines[i]
		const trimmed = raw.trim()
		if (!trimmed) {
			i++
			continue
		}

		const headingMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed)
		if (headingMatch) {
			const level = headingMatch[1].length
			const text = headingMatch[2].trim()
			if (level === 1 && currentSection.blocks.length > 0) {
				sections.push(currentSection)
				sectionIndex += 1
				currentSection = { id: `section-${sectionIndex}`, title: text, blocks: [] }
			} else if (level === 1) {
				currentSection.title = text
			}
			currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'heading', level, text })
			i++
			continue
		}

		if (/^```/.test(trimmed)) {
			const buffer: string[] = []
			const startLine = i + 1
			i++
			while (i < lines.length && !/^```/.test(lines[i].trim())) {
				buffer.push(lines[i])
				i++
			}
			if (i >= lines.length) {
				errors.push({ line: startLine, message: 'Unterminated fenced code block.' })
			} else {
				i++
			}
			currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'code', text: buffer.join('\n').trimEnd() })
			continue
		}

		if (/^>\s?/.test(trimmed)) {
			const buffer: string[] = []
			while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
				buffer.push(lines[i].trim().replace(/^>\s?/, ''))
				i++
			}
			currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'blockquote', text: buffer.join('\n') })
			continue
		}

		if (/^[-*]\s+/.test(trimmed)) {
			const buffer: string[] = []
			while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
				buffer.push(lines[i].trim().replace(/^[-*]\s+/, ''))
				i++
			}
			currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'bulleted-list', text: buffer.map((line) => `• ${line}`).join('\n') })
			continue
		}

		if (/^\d+\.\s+/.test(trimmed)) {
			const buffer: string[] = []
			while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
				buffer.push(lines[i].trim())
				i++
			}
			currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'numbered-list', text: buffer.join('\n') })
			continue
		}

		const paragraph: string[] = []
		while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i].trim()) && !/^```/.test(lines[i].trim()) && !/^>\s?/.test(lines[i].trim()) && !/^[-*]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim())) {
			paragraph.push(lines[i].trim())
			i++
		}
		currentSection.blocks.push({ id: `block-${blockIndex++}`, kind: 'paragraph', text: paragraph.join(' ') })
	}

	if (currentSection.blocks.length > 0) sections.push(currentSection)
	if (sections.length === 0 && input.trim()) {
		sections.push({
			id: 'section-1',
			blocks: [{ id: 'block-1', kind: 'paragraph', text: input.trim() }],
		})
	}

	const model: MarkdownTextModel = { sections }
	return { ok: errors.length === 0 && model.sections.length > 0, format: 'markdown-text', model, warnings, errors }
}
