import { computed, createShapeId, EASINGS, Editor, ShapeUtil, TLResizeInfo, TLShape, T, atom, Rectangle2d, Geometry2d, RecordProps, SVGContainer, getPerfectDashProps, resizeBox, useEditor, useValue } from 'tldraw'
import { useCallback, useMemo } from 'react'

const SLIDE_TYPE = 'slide'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[SLIDE_TYPE]: { w: number; h: number }
	}
}

export type SlideShape = TLShape<typeof SLIDE_TYPE>
export const $currentSlideId = atom<string | null>('current-slide-id', null)

export class SlideShapeUtil extends ShapeUtil<SlideShape> {
	static override type = SLIDE_TYPE
	static override props: RecordProps<SlideShape> = { w: T.number, h: T.number }

	getDefaultProps(): SlideShape['props'] {
		return { w: 960, h: 540 }
	}

	override canBind() {
		return false
	}

	override hideRotateHandle() {
		return true
	}

	getGeometry(shape: SlideShape): Geometry2d {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false })
	}

	override onRotate(initial: SlideShape) {
		return initial
	}

	override onResize(shape: SlideShape, info: TLResizeInfo<SlideShape>) {
		return resizeBox(shape, info)
	}

	override onDoubleClick(shape: SlideShape) {
		moveToSlide(this.editor, shape)
		this.editor.selectNone()
	}

	component(shape: SlideShape) {
		const bounds = this.editor.getShapeGeometry(shape).bounds
		const zoomLevel = useValue('zoom level', () => this.editor.getZoomLevel(), [this.editor])
		const slides = useSlides()
		const index = slides.findIndex((s) => s.id === shape.id)
		const handleLabelPointerDown = useCallback(() => {
			$currentSlideId.set(shape.id)
			this.editor.select(shape.id)
		}, [shape.id, this.editor])
		if (!bounds) return null

		return (
			<>
				<div onPointerDown={handleLabelPointerDown} className="slide-label">
					{`Slide ${index + 1}`}
				</div>
				<SVGContainer>
					<g
						style={{ stroke: 'var(--tl-color-text)', strokeWidth: 'calc(1px * var(--tl-scale))', opacity: 0.25 }}
						pointerEvents="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{bounds.sides.map((side, i) => {
							const { strokeDasharray, strokeDashoffset } = getPerfectDashProps(side[0].dist(side[1]), 1 / zoomLevel, { style: 'dashed', lengthRatio: 6, forceSolid: zoomLevel < 0.2 })
							return <line key={i} x1={side[0].x} y1={side[0].y} x2={side[1].x} y2={side[1].y} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
						})}
					</g>
				</SVGContainer>
			</>
		)
	}

	indicator(shape: SlideShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}
}

export function getSlides(editor: Editor) {
	return editor
		.getSortedChildIdsForParent(editor.getCurrentPageId())
		.map((id) => editor.getShape(id))
		.filter((shape) => shape?.type === 'slide') as SlideShape[]
}

export function useSlides() {
	const editor = useEditor()
	return useValue<SlideShape[]>('slide shapes', () => getSlides(editor), [editor])
}

export function useCurrentSlide() {
	const editor = useEditor()
	const slides = useSlides()
	const selectedId = useValue($currentSlideId)
	return useMemo(() => slides.find((slide) => slide.id === selectedId) ?? inferCurrentSlide(editor), [slides, selectedId, editor])
}

export function inferCurrentSlide(editor: Editor) {
	const selected = editor.getSelectedShapes().find((shape) => shape.type === 'slide') as SlideShape | undefined
	if (selected) return selected
	const slides = getSlides(editor)
	const center = editor.getViewportPageBounds().center
	return slides.find((slide) => {
		const bounds = editor.getShapePageBounds(slide)
		return bounds?.containsPoint(center)
	}) ?? slides[0] ?? null
}

export function moveToSlide(editor: Editor, slide: SlideShape) {
	const bounds = editor.getShapePageBounds(slide.id)
	if (!bounds) return
	$currentSlideId.set(slide.id)
	editor.selectNone()
	editor.zoomToBounds(bounds, { inset: 0, animation: { duration: 400, easing: EASINGS.easeInOutCubic } })
}

export function createSlide(editor: Editor, x?: number) {
	const slides = getSlides(editor)
	const last = slides[slides.length - 1]
	const nextX = x ?? ((last?.x ?? 100) + ((last?.props.w ?? 960) + 180))
	const id = createShapeId()
	editor.createShape({ id, type: 'slide', x: nextX, y: last?.y ?? 100, props: { w: 960, h: 540 } })
	const slide = editor.getShape(id) as SlideShape
	$currentSlideId.set(id)
	return slide
}

export function getSlideBounds(editor: Editor, slide: SlideShape) {
	const bounds = editor.getShapePageBounds(slide)
	if (!bounds) return { x: slide.x, y: slide.y, w: slide.props.w, h: slide.props.h }
	return { x: bounds.minX + 36, y: bounds.minY + 36, w: bounds.width - 72, h: bounds.height - 72 }
}

function getAdjacentSlide(editor: Editor, direction: 'next' | 'previous') {
	const slides = getSlides(editor)
	const current = inferCurrentSlide(editor)
	if (!current || slides.length === 0) return null
	const index = slides.findIndex((slide) => slide.id === current.id)
	if (index === -1) return slides[0] ?? null
	return direction === 'next'
		? (slides[index + 1] ?? slides[0] ?? null)
		: (slides[index - 1] ?? slides[slides.length - 1] ?? null)
}

export function goToAdjacentSlide(editor: Editor, direction: 'next' | 'previous') {
	const slide = getAdjacentSlide(editor, direction)
	if (!slide) return false
	moveToSlide(editor, slide)
	return true
}

export function useSlideActions() {
	const editor = useEditor()
	return useMemo(
		() => ({
			addSlide() {
				const slide = createSlide(editor)
				moveToSlide(editor, slide)
			},
			nextSlide() {
				goToAdjacentSlide(editor, 'next')
			},
			previousSlide() {
				goToAdjacentSlide(editor, 'previous')
			},
		}),
		[editor]
	)
}

export const $slides = (editor: Editor) => computed('slides', () => getSlides(editor))
