import { Editor } from 'tldraw'
import { BoxLike, ImportResult } from '../model'
import { parseStructuredImport } from '../parser/parseStructuredImport'
import { importGanttModel } from './importGantt'
import { importMarkdownTableModel } from './importMarkdownTable'
import { importMarkdownTextModel } from './importMarkdownText'
import { importMermaidFlowchart } from './importMermaidFlowchart'
import { importMermaidSequence } from './importMermaidSequence'

export function importStructuredContent(editor: Editor, input: string, options?: { targetBounds?: BoxLike }): ImportResult {
	const parseResult = parseStructuredImport(input)
	if (parseResult.format === null) {
		return { ok: false, warnings: parseResult.warnings, errors: parseResult.errors, createdShapeIds: [] }
	}
	if (parseResult.format === 'flowchart') return importMermaidFlowchart(editor, input, options?.targetBounds)
	if (parseResult.format === 'sequence') return importMermaidSequence(editor, input, options?.targetBounds)
	if (parseResult.format === 'gantt') return importGanttModel(editor, parseResult.model, { ok: parseResult.errors.length === 0, warnings: parseResult.warnings, errors: parseResult.errors }, options?.targetBounds)
	if (parseResult.format === 'markdown-table') return importMarkdownTableModel(editor, parseResult.model, { ok: parseResult.errors.length === 0, warnings: parseResult.warnings, errors: parseResult.errors }, options?.targetBounds)
	return importMarkdownTextModel(editor, parseResult.model, options)
}
