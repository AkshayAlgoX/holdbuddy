import { readFile, readdir, mkdir, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
const pkg=JSON.parse(await readFile('package.json','utf8'));
await mkdir('dist/licenses',{recursive:true});
for(const name of Object.keys(pkg.dependencies)){
 const dir=join('node_modules',name);const files=(await readdir(dir)).filter(f=>/^(license|ofl|copying)/i.test(f));
 if(!files.length)throw Error(`Missing license for ${name}`);
 for(const file of files)await writeFile(join('dist/licenses',name.replace(/[@/]/g,'_')+'-'+file),await readFile(join(dir,file)));
}
await writeFile('dist/licenses/THIRD_PARTY_NOTICES.md',await readFile('THIRD_PARTY_NOTICES.md'));
await cp("licenses", "dist/licenses/model", {recursive:true});
