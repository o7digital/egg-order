import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('guide.html', 'dist/guide.html');
await cp('assets', 'dist/assets', { recursive: true });
console.log('Static site built in dist/');
