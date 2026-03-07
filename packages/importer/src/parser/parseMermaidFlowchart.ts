import { DiagramDirection, DiagramModel, DiagramNode, FlowchartParseResult, ImportMessage, NodeKind } from '../model'

const FLOWCHART_HEADER_RE = /^\s*flowchart\s+(TD|LR)\s*$/i
const DIRECTION_RE = /^direction\s+(TD|LR)\s*$/i
const EDGE_RE = /^([\s\S]*?)\s*-->\s*(?:\|([^|]+)\|\s*)?([\s\S]*?)$/
const UNSUPPORTED_LINE_RE = /^(style|classDef|class|linkStyle|click)\b/i
const NODE_ID_RE = /^[A-Za-z0-9_:.\/-]+$/

type ParsedNodeToken = Pick<DiagramNode, 'id' | 'label' | 'kind'> & { explicitness: number }
type FlowchartStatement = { text: string; line: number }

export function parseMermaidFlowchart(input: string): FlowchartParseResult {
	const lines = input.replace(/\r\n/g, '\n').split('\n')
	const warnings: ImportMessage[] = []
	const errors: ImportMessage[] = []
	const firstMeaningfulLine = lines.find((line) => line.trim() !== '' && !line.trim().startsWith('%%'))

	if (!firstMeaningfulLine) {
		return {
			ok: false,
			format: 'flowchart',
			model: { direction: 'TD', nodes: [], edges: [] },
			warnings,
			errors: [{ message: 'Expected Mermaid flowchart input.' }],
		}
	}

	const headerMatch = FLOWCHART_HEADER_RE.exec(firstMeaningfulLine.trim())
	if (!headerMatch) {
		return {
			ok: false,
			format: 'flowchart',
			model: { direction: 'TD', nodes: [], edges: [] },
			warnings,
			errors: [
				{
					line: getLineNumber(lines, firstMeaningfulLine),
					message: 'Only `flowchart TD` and `flowchart LR` are supported.',
				},
			],
		}
	}

	let direction = headerMatch[1].toUpperCase() as DiagramDirection
	const nodeMap = new Map<string, ParsedNodeToken>()
	const edges: DiagramModel['edges'] = []
	const statements = collectStatements(lines, (getLineNumber(lines, firstMeaningfulLine) ?? 1) + 1, errors)

	for (const statement of statements) {
		const trimmed = statement.text.trim()
		const lineNumber = statement.line

		const directionMatch = DIRECTION_RE.exec(trimmed)
		if (directionMatch) {
			direction = directionMatch[1].toUpperCase() as DiagramDirection
			continue
		}

		if (/^subgraph\b/i.test(trimmed)) {
			warnings.push({ line: lineNumber, message: 'Subgraphs are not supported and were ignored.' })
			continue
		}

		if (/^end$/i.test(trimmed)) {
			warnings.push({ line: lineNumber, message: 'Subgraph delimiters are ignored.' })
			continue
		}

		if (UNSUPPORTED_LINE_RE.test(trimmed)) {
			warnings.push({ line: lineNumber, message: 'Styling and interactive Mermaid directives are ignored.' })
			continue
		}

		if (trimmed.includes('-->')) {
			const match = EDGE_RE.exec(trimmed)
			if (!match) {
				errors.push({ line: lineNumber, message: 'Malformed edge syntax.' })
				continue
			}

			const [, fromToken, edgeLabel, toToken] = match
			const from = parseNodeToken(fromToken)
			const to = parseNodeToken(toToken)

			if (!from || !to) {
				errors.push({ line: lineNumber, message: 'Unable to parse one or both edge endpoints.' })
				continue
			}

			upsertNode(nodeMap, from)
			upsertNode(nodeMap, to)
			edges.push({
				id: `edge:${edges.length + 1}`,
				from: from.id,
				to: to.id,
				label: edgeLabel?.trim() || undefined,
			})
			continue
		}

		const node = parseNodeToken(trimmed)
		if (node) {
			upsertNode(nodeMap, node)
			continue
		}

		if (trimmed.includes('--')) {
			errors.push({ line: lineNumber, message: 'Only `-->` edges are supported.' })
			continue
		}

		warnings.push({ line: lineNumber, message: 'Unsupported Mermaid syntax was ignored.' })
	}

	return {
		ok: errors.length === 0,
		format: 'flowchart',
		model: {
			direction,
			nodes: Array.from(nodeMap.values()).map(({ explicitness: _explicitness, ...node }) => node),
			edges,
		},
		warnings,
		errors,
	}
}

function getLineNumber(lines: string[], target: string) {
	const index = lines.findIndex((line) => line === target)
	return index >= 0 ? index + 1 : undefined
}

function collectStatements(lines: string[], startLine: number, errors: ImportMessage[]): FlowchartStatement[] {
	const statements: FlowchartStatement[] = []
	let buffer: string[] = []
	let bufferStart = startLine

	for (let i = startLine; i <= lines.length; i++) {
		const rawLine = lines[i - 1]
		if (rawLine === undefined) continue
		const trimmed = rawLine.trim()
		if (!trimmed || trimmed.startsWith('%%')) continue

		if (buffer.length === 0) {
			bufferStart = i
		}

		buffer.push(trimmed)

		if (getDelimiterBalance(buffer.join('\n')) <= 0) {
			statements.push({ text: buffer.join('\n'), line: bufferStart })
			buffer = []
		}
	}

	if (buffer.length) {
		errors.push({ line: bufferStart, message: 'Unterminated multiline Mermaid node label.' })
	}

	return statements
}

function getDelimiterBalance(text: string) {
	let square = 0
	let curly = 0
	let paren = 0
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (char === '[') square++
		else if (char === ']') square--
		else if (char === '{') curly++
		else if (char === '}') curly--
		else if (char === '(') paren++
		else if (char === ')') paren--
	}
	return Math.max(square, curly, paren)
}

function parseNodeToken(token: string): ParsedNodeToken | null {
	const trimmed = token.trim()
	if (!trimmed) return null

	const shapePatterns: Array<{ re: RegExp; kind: NodeKind; explicitness: number }> = [
		{ re: /^([A-Za-z0-9_:.\/-]+)\(\(([\s\S]+)\)\)$/, kind: 'terminator', explicitness: 4 },
		{ re: /^([A-Za-z0-9_:.\/-]+)\(\[([\s\S]+)\]\)$/, kind: 'round', explicitness: 4 },
		{ re: /^([A-Za-z0-9_:.\/-]+)\(([\s\S]+)\)$/, kind: 'round', explicitness: 3 },
		{ re: /^([A-Za-z0-9_:.\/-]+)\{([\s\S]+)\}$/, kind: 'decision', explicitness: 4 },
		{ re: /^([A-Za-z0-9_:.\/-]+)\[([\s\S]+)\]$/, kind: 'process', explicitness: 4 },
	]

	for (const { re, kind, explicitness } of shapePatterns) {
		const match = re.exec(trimmed)
		if (match) {
			const [, id, label] = match
			return { id, label: normalizeLabel(label, id), kind, explicitness }
		}
	}

	if (NODE_ID_RE.test(trimmed)) {
		return { id: trimmed, label: trimmed, kind: 'unknown', explicitness: 1 }
	}

	return null
}

function normalizeLabel(label: string, fallback: string) {
	const trimmed = dedentMultiline(label)
	if (!trimmed) return fallback
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

function dedentMultiline(label: string) {
	const lines = label.replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/\s+$/g, ''))
	if (lines.length === 1) return lines[0].trim()

	const first = lines[0].trim()
	const rest = lines.slice(1)
	const nonEmptyRest = rest.filter((line) => line.trim() !== '')
	const indent = nonEmptyRest.length ? Math.min(...nonEmptyRest.map((line) => line.match(/^\s*/)?.[0].length ?? 0)) : 0

	return [first, ...rest.map((line) => line.slice(Math.min(indent, line.length)).trimEnd())].join('\n').trim()
}

function upsertNode(nodeMap: Map<string, ParsedNodeToken>, incoming: ParsedNodeToken) {
	const existing = nodeMap.get(incoming.id)
	if (!existing) {
		nodeMap.set(incoming.id, incoming)
		return
	}

	const shouldReplace =
		incoming.explicitness > existing.explicitness ||
		(existing.label === existing.id && incoming.label !== incoming.id)

	if (!shouldReplace) return

	nodeMap.set(incoming.id, { ...existing, ...incoming })
}
