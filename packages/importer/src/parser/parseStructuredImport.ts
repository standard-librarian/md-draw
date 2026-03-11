import { StructuredParseResult } from '../model'
import { parseMarkdownTable } from './parseMarkdownTable'
import { parseMarkdownText } from './parseMarkdownText'
import { parseMermaidFlowchart } from './parseMermaidFlowchart'
import { parseMermaidGantt } from './parseMermaidGantt'

export function parseStructuredImport(input: string): StructuredParseResult {
	const normalizedInput = normalizeStructuredImportInput(input)
	const lines = normalizedInput.split('\n').map((line) => line.trim()).filter(Boolean)
	const firstMeaningfulLine = lines.find((line) => !line.startsWith('%%'))

	if (!firstMeaningfulLine) {
		return {
			ok: false,
			format: null,
			model: null,
			warnings: [],
			errors: [{ message: 'Paste Mermaid, a Markdown table, or Markdown text.' }],
		}
	}

	if (/^flowchart\b/i.test(firstMeaningfulLine)) return parseMermaidFlowchart(normalizedInput)
	if (/^gantt\b/i.test(firstMeaningfulLine)) return parseMermaidGantt(normalizedInput)
	if (looksLikeMarkdownTable(lines)) return parseMarkdownTable(normalizedInput)
	return parseMarkdownText(normalizedInput)
}

function looksLikeMarkdownTable(lines: string[]) {
	if (lines.length < 2) return false
	return /\|/.test(lines[0]) && /^\|?[\s:|\-]+\|?$/.test(lines[1])
}

export function normalizeStructuredImportInput(input: string) {
	const normalized = input.replace(/\r\n/g, '\n')
	const match = /^\s*(```|~~~)mermaid[^\n]*\n([\s\S]*?)\n?\1\s*$/.exec(normalized)
	return match ? match[2] : normalized
}
