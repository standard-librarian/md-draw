import type { TLShapeId } from 'tldraw'

export type DiagramDirection = 'TD' | 'LR'
export type StructuredImportFormat = 'flowchart' | 'sequence' | 'gantt' | 'markdown-table' | 'markdown-text'
export type NodeKind = 'process' | 'decision' | 'round' | 'terminator' | 'unknown'

export interface DiagramNode {
	id: string
	label: string
	kind: NodeKind
}

export interface DiagramEdge {
	id: string
	from: string
	to: string
	label?: string
}

export interface DiagramModel {
	direction: DiagramDirection
	nodes: DiagramNode[]
	edges: DiagramEdge[]
}

export interface LayoutedNode extends DiagramNode {
	x: number
	y: number
	width: number
	height: number
}

export interface LayoutedEdge extends DiagramEdge {
	points?: { x: number; y: number }[]
}

export interface LayoutedDiagram {
	direction: DiagramDirection
	nodes: LayoutedNode[]
	edges: LayoutedEdge[]
}

export interface GanttConfig {
	title?: string
	dateFormat?: string
	axisFormat?: string
}

export interface GanttSection {
	id: string
	label: string
	taskIds: string[]
}

export interface GanttTask {
	id: string
	label: string
	sectionId: string
	startDate: string
	durationDays: number
	endDate: string
	dependsOn?: string
}

export interface GanttModel {
	config: GanttConfig
	sections: GanttSection[]
	tasks: GanttTask[]
}

export interface SequenceParticipant {
	id: string
	label: string
}

export type SequenceMessageStyle = 'solid' | 'dashed'

export interface SequenceMessage {
	id: string
	from: string
	to: string
	label: string
	style: SequenceMessageStyle
}

export interface SequenceBranch {
	label: string
	messageIds: string[]
}

export interface SequenceBlock {
	id: string
	type: 'alt'
	branches: SequenceBranch[]
}

export interface SequenceDiagramModel {
	participants: SequenceParticipant[]
	messages: SequenceMessage[]
	blocks: SequenceBlock[]
}

export interface MarkdownTableColumn {
	align?: 'start' | 'middle' | 'end'
}

export interface MarkdownTableModel {
	columns: MarkdownTableColumn[]
	rows: string[][]
	headerRowIndex: 0
}

export type MarkdownBlockKind = 'heading' | 'paragraph' | 'bulleted-list' | 'numbered-list' | 'blockquote' | 'code'

export interface MarkdownBlock {
	id: string
	kind: MarkdownBlockKind
	level?: number
	text: string
}

export interface MarkdownSection {
	id: string
	title?: string
	blocks: MarkdownBlock[]
}

export interface MarkdownTextModel {
	sections: MarkdownSection[]
}

export interface ImportMessage {
	line?: number
	message: string
}

export interface FlowchartParseResult {
	ok: boolean
	format: 'flowchart'
	model: DiagramModel
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export interface GanttParseResult {
	ok: boolean
	format: 'gantt'
	model: GanttModel
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export interface SequenceParseResult {
	ok: boolean
	format: 'sequence'
	model: SequenceDiagramModel
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export interface MarkdownTableParseResult {
	ok: boolean
	format: 'markdown-table'
	model: MarkdownTableModel
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export interface MarkdownTextParseResult {
	ok: boolean
	format: 'markdown-text'
	model: MarkdownTextModel
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export interface UnsupportedParseResult {
	ok: false
	format: null
	model: null
	warnings: ImportMessage[]
	errors: ImportMessage[]
}

export type StructuredParseResult =
	| FlowchartParseResult
	| SequenceParseResult
	| GanttParseResult
	| MarkdownTableParseResult
	| MarkdownTextParseResult
	| UnsupportedParseResult

export interface BoxLike {
	x: number
	y: number
	w: number
	h: number
}

export interface ImportResult {
	ok: boolean
	warnings: ImportMessage[]
	errors: ImportMessage[]
	createdShapeIds: TLShapeId[]
}
