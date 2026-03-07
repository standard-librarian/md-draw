import { importMarkdownTextModel, importStructuredContent, parseStructuredImport } from '@md-draw/importer'
import { Tldraw, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useMemo, useState } from 'react'
import { createSlide, getSlideBounds, getSlides, inferCurrentSlide, moveToSlide, SlideShapeUtil, useCurrentSlide, useSlideActions, useSlides } from './slides'
import { getSectionsForSlides } from './slideText'

const SAMPLE = `flowchart TD
  A[HiScholar Product Vision] --> B[Phase 0: Discovery and MVP Definition]
  B --> C{Is MVP scope clear?}
  C -->|Yes| E[Phase 1: Build Web MVP]`

function App() {
	const [editor, setEditor] = useState<any>(null)
	const [isOpen, setIsOpen] = useState(false)
	const [value, setValue] = useState(SAMPLE)
	const [submitErrors, setSubmitErrors] = useState<string[]>([])

	return (
		<div className="app">
			<Tldraw
				shapeUtils={[SlideShapeUtil]}
				persistenceKey="md_draw_slides"
				onMount={(editor) => {
					setEditor(editor)
					if (getSlides(editor).length === 0) {
						const slide = createSlide(editor, 100)
						moveToSlide(editor, slide)
					}
				}}
			>
				{editor ? (
					<>
						<OverlayControls onOpen={() => setIsOpen(true)} />
						<SlidesPanel />
						{isOpen ? (
							<ImportDialog
								editor={editor}
								value={value}
								submitErrors={submitErrors}
								onChange={(next) => {
									setValue(next)
									setSubmitErrors([])
								}}
								onClose={() => setIsOpen(false)}
								onImport={() => {
									const parseResult = parseStructuredImport(value)
									const currentSlide = inferCurrentSlide(editor) ?? createSlide(editor)
									if (parseResult.format === 'markdown-text' && parseResult.model.sections.length > 1) {
										const sections = getSectionsForSlides(parseResult.model.sections)
										const createdIds: string[] = []
										for (let i = 0; i < sections.length; i++) {
											const slide = i === 0 ? currentSlide : createSlide(editor)
											const result = importMarkdownTextModel(
												editor,
												{ sections: [sections[i]] },
												{ targetBounds: getSlideBounds(editor, slide) }
											)
											createdIds.push(...result.createdShapeIds)
										}
										if (!createdIds.length) {
											setSubmitErrors(['Nothing importable was found.'])
											return
										}
										moveToSlide(editor, currentSlide)
										setIsOpen(false)
										return
									}

									const result = importStructuredContent(editor, value, {
										targetBounds: getSlideBounds(editor, currentSlide),
									})
									if (!result.createdShapeIds.length) {
										setSubmitErrors(result.errors.map((error: { message: string }) => error.message))
										return
									}
									moveToSlide(editor, currentSlide)
									setIsOpen(false)
								}}
							/>
						) : null}
					</>
				) : null}
			</Tldraw>
		</div>
	)
}

function OverlayControls({ onOpen }: { onOpen: () => void }) {
	const actions = useSlideActions()
	return (
		<div className="overlay">
			<button className="button" onClick={onOpen}>
				Import
			</button>
			<button className="button secondary" onClick={actions.previousSlide}>
				Prev
			</button>
			<button className="button secondary" onClick={actions.nextSlide}>
				Next
			</button>
			<button className="button secondary" onClick={actions.addSlide}>
				New slide
			</button>
		</div>
	)
}

function SlidesPanel() {
	const slides = useSlides()
	const currentSlide = useCurrentSlide()
	return (
		<div className="slides-panel">
			<div style={{ fontWeight: 600 }}>Slides</div>
			<div className="slides-list">
				{slides.map((slide, index) => (
					<SlideButton key={slide.id} slideId={slide.id} index={index} active={slide.id === currentSlide?.id} />
				))}
			</div>
		</div>
	)
}

function SlideButton({ slideId, index, active }: { slideId: string; index: number; active: boolean }) {
	const editor = useEditor()
	const slides = useSlides()
	const editorSlides = useMemo(() => slides, [slides])
	return (
		<button
			className={`slide-item${active ? ' active' : ''}`}
			onClick={(event) => {
				event.preventDefault()
				const slide = editorSlides.find((candidate) => candidate.id === slideId)
				if (slide) {
					moveToSlide(editor, slide)
				}
			}}
		>
			{`Slide ${index + 1}`}
		</button>
	)
}

function ImportDialog({
	editor,
	value,
	submitErrors,
	onChange,
	onClose,
	onImport,
}: {
	editor: any
	value: string
	submitErrors: string[]
	onChange: (value: string) => void
	onClose: () => void
	onImport: () => void
}) {
	const parseResult = useMemo(() => parseStructuredImport(value), [value])
	const hasImportableContent =
		parseResult.format === 'flowchart'
			? parseResult.model.nodes.length > 0
			: parseResult.format === 'gantt'
				? parseResult.model.tasks.length > 0
				: parseResult.format === 'markdown-table'
					? parseResult.model.rows.length > 1
					: parseResult.format === 'markdown-text'
						? parseResult.model.sections.length > 0
						: false

	return (
		<div className="dialog-backdrop">
			<div className="dialog">
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
					<h3 style={{ margin: 0 }}>Import content</h3>
					<button className="button secondary" onClick={onClose}>
						Close
					</button>
				</div>
				<p style={{ marginTop: 0 }}>Supported: Mermaid flowcharts, Mermaid gantt, Markdown tables, and Markdown text.</p>
				<div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
					Detected format: {parseResult.format ?? 'unknown'}
				</div>
				<textarea value={value} onChange={(event) => onChange(event.currentTarget.value)} />
				<MessageList title="Errors" items={submitErrors.map((message) => ({ message }))} tone="error" />
				<MessageList title="Errors" items={parseResult.errors} tone="error" />
				<MessageList title="Warnings" items={parseResult.warnings} tone="warning" />
				<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
					<button className="button" disabled={!hasImportableContent} onClick={onImport}>
						Import into current slide
					</button>
				</div>
			</div>
		</div>
	)
}

function MessageList({
	title,
	items,
	tone,
}: {
	title: string
	items: Array<{ line?: number; message: string }>
	tone: 'warning' | 'error'
}) {
	if (items.length === 0) return null
	return (
		<div className={`message-box ${tone}`}>
			<div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
			<ul style={{ margin: 0, paddingLeft: 18 }}>
				{items.map((item, index) => (
					<li key={`${item.line ?? 'general'}-${index}`}>
						{item.line ? `Line ${item.line}: ` : ''}
						{item.message}
					</li>
				))}
			</ul>
		</div>
	)
}

export default App
