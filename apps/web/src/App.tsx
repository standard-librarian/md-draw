import { importMarkdownTextModel, importStructuredContent, parseStructuredImport } from '@md-draw/importer'
import {
	DefaultMainMenu,
	DefaultMainMenuContent,
	Editor,
	TLComponents,
	TLUiMainMenuProps,
	TLUiOverrides,
	Tldraw,
	TldrawUiMenuActionItem,
	TldrawUiMenuGroup,
	TldrawUiMenuSubmenu,
	useEditor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { useEffect, useMemo, useState } from 'react'
import {
	createSlide,
	goToAdjacentSlide,
	getSlideBounds,
	inferCurrentSlide,
	moveToSlide,
	SlideShapeUtil,
	useCurrentSlide,
	useSlideActions,
	useSlides,
} from './slides'
import { getSectionsForSlides } from './slideText'

const SAMPLE = `flowchart TD
  A[HiScholar Product Vision] --> B[Phase 0: Discovery and MVP Definition]
  B --> C{Is MVP scope clear?}
  C -->|Yes| E[Phase 1: Build Web MVP]`

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isImportOpen, setIsImportOpen] = useState(false)
	const [isSlidesPanelOpen, setIsSlidesPanelOpen] = useState(false)
	const [value, setValue] = useState(SAMPLE)
	const [submitErrors, setSubmitErrors] = useState<string[]>([])

	useEffect(() => {
		if (!editor) return

		const onKeyDown = (event: KeyboardEvent) => {
			if (!isSlidesPanelOpen) return
			if (event.defaultPrevented) return
			if (event.metaKey || event.ctrlKey || event.altKey) return
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
			if (shouldIgnoreSlideShortcut(event.target)) return
			if (editor.getEditingShapeId() !== null) return

			const moved = goToAdjacentSlide(editor, event.key === 'ArrowRight' ? 'next' : 'previous')
			if (!moved) return

			event.preventDefault()
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [editor, isSlidesPanelOpen])

	const handleImport = () => {
		if (!editor) return

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
			setIsImportOpen(false)
			setIsSlidesPanelOpen(true)
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
		setIsImportOpen(false)
		setIsSlidesPanelOpen(true)
	}

	const components = useMemo<TLComponents>(
		() => ({
			MainMenu: function MainMenu(props: TLUiMainMenuProps) {
				return (
					<DefaultMainMenu {...props}>
						<DefaultMainMenuContent />
						<SlidesMainMenuContent />
					</DefaultMainMenu>
				)
			},
		}),
		[]
	)

	const overrides = useMemo<TLUiOverrides>(
		() => ({
			actions(editor, actions) {
				return {
					...actions,
					'toggle-slides-panel': {
						id: 'toggle-slides-panel',
						label: 'Open slides panel',
						onSelect: () => setIsSlidesPanelOpen((open) => !open),
					},
					'open-import-dialog': {
						id: 'open-import-dialog',
						label: 'Import content',
						onSelect: () => {
							setSubmitErrors([])
							setIsImportOpen(true)
						},
					},
					'new-slide': {
						id: 'new-slide',
						label: 'New slide',
						onSelect: () => {
							const slide = createSlide(editor)
							moveToSlide(editor, slide)
							setIsSlidesPanelOpen(true)
						},
					},
					'next-slide': {
						id: 'next-slide',
						label: 'Next slide',
						onSelect: () => {
							if (goToAdjacentSlide(editor, 'next')) {
								setIsSlidesPanelOpen(true)
							}
						},
					},
					'previous-slide': {
						id: 'previous-slide',
						label: 'Previous slide',
						onSelect: () => {
							if (goToAdjacentSlide(editor, 'previous')) {
								setIsSlidesPanelOpen(true)
							}
						},
					},
				}
			},
		}),
		[]
	)

	return (
		<div className="app">
			<Tldraw
				components={components}
				overrides={overrides}
				shapeUtils={[SlideShapeUtil]}
				persistenceKey="md_draw_slides"
				onMount={(editor) => {
					setEditor(editor)
				}}
			>
				{editor ? (
					<>
						{isSlidesPanelOpen ? <SlidesPanel onClose={() => setIsSlidesPanelOpen(false)} /> : null}
						{isImportOpen ? (
							<ImportDialog
								value={value}
								submitErrors={submitErrors}
								onChange={(next) => {
									setValue(next)
									setSubmitErrors([])
								}}
								onClose={() => setIsImportOpen(false)}
								onImport={handleImport}
							/>
						) : null}
					</>
				) : null}
			</Tldraw>
		</div>
	)
}

function shouldIgnoreSlideShortcut(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	if (target.isContentEditable) return true
	return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"], [contenteditable=""], [role="textbox"]'))
}

function SlidesMainMenuContent() {
	const slides = useSlides()

	return (
		<TldrawUiMenuGroup id="slides-group">
			<TldrawUiMenuSubmenu id="slides" label="Slides">
				<TldrawUiMenuGroup id="slides-actions">
					<TldrawUiMenuActionItem actionId="toggle-slides-panel" />
					<TldrawUiMenuActionItem actionId="open-import-dialog" />
					<TldrawUiMenuActionItem actionId="new-slide" disabled={false} />
					<TldrawUiMenuActionItem actionId="next-slide" disabled={slides.length === 0} />
					<TldrawUiMenuActionItem actionId="previous-slide" disabled={slides.length === 0} />
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}

function SlidesPanel({ onClose }: { onClose: () => void }) {
	const slides = useSlides()
	const currentSlide = useCurrentSlide()
	const actions = useSlideActions()
	return (
		<div className="slides-panel">
			<div className="slides-panel-header">
				<div style={{ fontWeight: 600 }}>Slides</div>
				<button className="button secondary small" onClick={onClose}>
					Close
				</button>
			</div>
			{slides.length === 0 ? (
				<div className="slides-empty">
					<p style={{ margin: 0 }}>No slides yet. Create one when you want slide-based imports or navigation.</p>
					<button className="button" onClick={actions.addSlide}>
						Create first slide
					</button>
				</div>
			) : (
				<div className="slides-list">
					{slides.map((slide, index) => (
						<SlideButton key={slide.id} slideId={slide.id} index={index} active={slide.id === currentSlide?.id} />
					))}
				</div>
			)}
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
	value,
	submitErrors,
	onChange,
	onClose,
	onImport,
}: {
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
						Import into slides
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
