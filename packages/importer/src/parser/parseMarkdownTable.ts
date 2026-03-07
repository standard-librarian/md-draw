import { ImportMessage, MarkdownTableModel, MarkdownTableParseResult } from '../model'

export function parseMarkdownTable(input: string): MarkdownTableParseResult {
	const lines = input.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
	const warnings: ImportMessage[] = []
	const errors: ImportMessage[] = []

	if (lines.length < 2) {
		return {
			ok: false,
			format: 'markdown-table',
			model: { columns: [], rows: [], headerRowIndex: 0 },
			warnings,
			errors: [{ message: 'Expected a Markdown table with a header row and separator row.' }],
		}
	}

	const headerCells = splitRow(lines[0])
	const separatorCells = splitRow(lines[1])
	if (headerCells.length === 0 || separatorCells.length !== headerCells.length) {
		return {
			ok: false,
			format: 'markdown-table',
			model: { columns: [], rows: [], headerRowIndex: 0 },
			warnings,
			errors: [{ line: 2, message: 'Markdown table separator row must match the header column count.' }],
		}
	}

	const columns = separatorCells.map((cell, index) => {
		if (!/^:?-{3,}:?$/.test(cell)) {
			errors.push({ line: 2, message: `Column ${index + 1} has an invalid Markdown table separator.` })
		}
		return {
			align: cell.startsWith(':') && cell.endsWith(':') ? 'middle' : cell.endsWith(':') ? 'end' : 'start',
		} as MarkdownTableModel['columns'][number]
	})

	const rows = [headerCells]
	for (let i = 2; i < lines.length; i++) {
		const cells = splitRow(lines[i])
		if (cells.length !== headerCells.length) {
			warnings.push({ line: i + 1, message: 'Table row column count did not match the header and was padded or trimmed.' })
		}
		rows.push(normalizeRow(cells, headerCells.length))
	}

	return { ok: errors.length === 0 && rows.length > 1, format: 'markdown-table', model: { columns, rows, headerRowIndex: 0 }, warnings, errors }
}

function splitRow(line: string) {
	const trimmed = line.replace(/^\|/, '').replace(/\|$/, '')
	const cells: string[] = []
	let current = ''
	let escaped = false
	for (const char of trimmed) {
		if (escaped) {
			current += char
			escaped = false
			continue
		}
		if (char === '\\') {
			escaped = true
			continue
		}
		if (char === '|') {
			cells.push(current.trim())
			current = ''
			continue
		}
		current += char
	}
	cells.push(current.trim())
	return cells
}

function normalizeRow(cells: string[], length: number) {
	const normalized = cells.slice(0, length)
	while (normalized.length < length) normalized.push('')
	return normalized
}
