import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const entry of ['index.html', 'styles.css', 'favicon.svg', 'src']) await cp(entry, `dist/${entry}`, { recursive: true });
console.log('Готово: dist/. Для предпросмотра: npm run preview');
