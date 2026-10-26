import { renderPrivacy } from '../lib/privacy-render.mjs';
import { privacyDocument } from '../lib/privacy.mjs';
import { mkdir, copyFile, cp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('guide.html', 'dist/guide.html');
await cp('assets', 'dist/assets', { recursive: true });
await mkdir('dist/privacy',{recursive:true});
for(const file of await readdir('legal/privacy')) {
  if(!file.endsWith('.json'))continue;
  const bytes=await readFile('legal/privacy/'+file),document=JSON.parse(bytes);
  await copyFile('legal/privacy/'+file,'dist/privacy/'+file);
  for(const language of ['en','es'])await writeFile(`dist/privacy/${document.version}.${language}.html`,renderPrivacy(document,bytes,{archive:true,language}));
  if(document.version===privacyDocument.version)await writeFile('dist/privacy.html',renderPrivacy(document,bytes));
}
console.log('Static site built in dist/');
