import { MarkdownSection } from '@md-draw/importer'

export function getSectionsForSlides(sections: MarkdownSection[]) {
	return sections.length > 1 ? sections : sections.slice(0, 1)
}
