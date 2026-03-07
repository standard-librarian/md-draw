import { describe, expect, it } from 'vitest'
import { getSectionsForSlides } from './slideText'

describe('getSectionsForSlides', () => {
	it('keeps multiple markdown sections split for slides', () => {
		expect(
			getSectionsForSlides([
				{ id: '1', title: 'One', blocks: [] },
				{ id: '2', title: 'Two', blocks: [] },
			])
		).toHaveLength(2)
	})
})
