import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@md-draw/importer': path.resolve(__dirname, '../../packages/importer/src/index.ts'),
		},
	},
})
