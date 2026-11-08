// Host-only check of public authored regressions; not part of the service or runtime image.
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const scratch=await mkdtemp(join(tmpdir(),'holdbuddy-public-audits-'));
try{
 const files=['audit-regressions','goal-variation'];
 await build({entryPoints:files.map(f=>fileURLToPath(new URL(`../tests/${f}.test.ts`,import.meta.url))),bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},outdir:scratch,logLevel:'warning'});
 for(const file of files)await import(pathToFileURL(join(scratch,`${file}.test.mjs`)).href);
}finally{await rm(scratch,{recursive:true,force:true});}
