import { StructuredParseResult } from '../model'
import { parseMarkdownTable } from './parseMarkdownTable'
import { parseMarkdownText } from './parseMarkdownText'
import { parseMermaidFlowchart } from './parseMermaidFlowchart'
import { parseMermaidGantt } from './parseMermaidGantt'

export function parseStructuredImport(input: string): StructuredParseResult {
	const lines = input.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
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

	if (/^flowchart\b/i.test(firstMeaningfulLine)) return parseMermaidFlowchart(input)
	if (/^gantt\b/i.test(firstMeaningfulLine)) return parseMermaidGantt(input)
	if (looksLikeMarkdownTable(lines)) return parseMarkdownTable(input)
	return parseMarkdownText(input)
}

function looksLikeMarkdownTable(lines: string[]) {
	if (lines.length < 2) return false
	return /\|/.test(lines[0]) && /^\|?[\s:|\-]+\|?$/.test(lines[1])
}
