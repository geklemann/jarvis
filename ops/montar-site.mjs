// Monta a versão publicada do site em _site/: cópia de web/ (sem web/_local) com cada .js e .css compactado.
// Os arquivos continuam separados e na mesma ordem (o site depende de um script estender o anterior), então a
// compactação não muda o comportamento — e os testes rodam de novo sobre _site/ antes de publicar.
// Uso: node ops/montar-site.mjs   (sem esbuild instalado, copia sem compactar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = path.join(RAIZ, 'web'), DESTINO = path.join(RAIZ, '_site');
let esbuild = null;
try { esbuild = (await import('esbuild')).default; } catch { console.log('esbuild não instalado (npm install): publicando sem compactar.'); }

fs.rmSync(DESTINO, { recursive: true, force: true });
let antes = 0, depois = 0, n = 0;
function copiar(dir) {
  for (const nome of fs.readdirSync(dir)) {
    const de = path.join(dir, nome), rel = path.relative(ORIGEM, de), para = path.join(DESTINO, rel);
    if (rel === '_local' || rel.startsWith('_local' + path.sep)) continue;
    if (fs.statSync(de).isDirectory()) { fs.mkdirSync(para, { recursive: true }); copiar(de); continue; }
    fs.mkdirSync(path.dirname(para), { recursive: true });
    const compactar = esbuild && /\.(js|css)$/.test(nome) && !rel.startsWith('vendor' + path.sep) && !/\.min\./.test(nome);
    if (!compactar) { fs.copyFileSync(de, para); continue; }
    const fonte = fs.readFileSync(de, 'utf8');
    const { code } = esbuild.transformSync(fonte, { loader: nome.endsWith('.css') ? 'css' : 'js', minify: true, target: nome.endsWith('.css') ? ['chrome100', 'safari15', 'firefox100'] : 'es2020', charset: 'utf8', legalComments: 'none' });
    fs.writeFileSync(para, code); antes += fonte.length; depois += code.length; n++;
  }
}
copiar(ORIGEM);
console.log(`_site montado: ${n} arquivo(s) compactado(s), ${(antes / 1024).toFixed(0)} KB → ${(depois / 1024).toFixed(0)} KB.`);
