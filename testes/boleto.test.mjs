// Boleto pela linha digitável: os boletos de teste são montados aqui com um cálculo próprio dos dígitos verificadores
// (independente do código testado), em formato bancário e de arrecadação, e o leitor tem que achar e decifrar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acharBoletos, beneficiario, lerLinha, vencimentoFator } from '../supabase/functions/_shared/boleto.ts';

// ── Montagem independente ──
const m10 = (s) => { let t = 0; [...s].reverse().forEach((c, i) => { let p = +c * (i % 2 ? 1 : 2); t += p > 9 ? p - 9 : p; }); return (10 - (t % 10)) % 10; };
const m11 = (s) => { let t = 0; [...s].reverse().forEach((c, i) => { t += +c * (2 + (i % 8)); }); const r = 11 - (t % 11); return r >= 10 || r === 0 ? 1 : r; };
const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
function boleto(banco, vencimento, valor, livre = '1234567890123456789012345') {
  const fator = vencimento >= '2025-02-22' ? 1000 + dias('2025-02-22', vencimento) : dias('1997-10-07', vencimento);
  const fv = String(fator).padStart(4, '0') + String(Math.round(valor * 100)).padStart(10, '0');
  const dv = m11(banco + '9' + fv + livre);
  const c1 = banco + '9' + livre.slice(0, 5), c2 = livre.slice(5, 15), c3 = livre.slice(15, 25);
  return `${c1.slice(0, 5)}.${c1.slice(5)}${m10(c1)} ${c2.slice(0, 5)}.${c2.slice(5)}${m10(c2)} ${c3.slice(0, 5)}.${c3.slice(5)}${m10(c3)} ${dv} ${fv}`;
}

test('bancário: banco, valor e vencimento (fator novo, depois de fev/2025)', () => {
  const l = boleto('341', '2026-10-20', 1234.56);
  const b = lerLinha(l, '2026-10-01');
  assert.equal(b.tipo, 'bancario');
  assert.equal(b.bancoNome, 'Itaú');
  assert.equal(b.valor, 1234.56);
  assert.equal(b.vencimento, '2026-10-20');
});

test('fator antigo (antes de fev/2025) e escolha da base mais próxima de hoje', () => {
  assert.equal(vencimentoFator(9999, '2025-02-01'), '2025-02-21', 'último dia da base antiga');
  assert.equal(vencimentoFator(1000, '2025-03-01'), '2025-02-22', 'primeiro dia da base nova');
  assert.equal(lerLinha(boleto('237', '2024-12-10', 99.9), '2024-12-01').vencimento, '2024-12-10');
});

test('dígito verificador errado não é aceito', () => {
  const l = boleto('001', '2026-11-05', 50).replace(/^(\d{4})\d/, (m, a) => a + ((+m[4] + 1) % 10));
  assert.equal(lerLinha(l, '2026-10-01'), null);
});

test('acha a linha no texto do PDF, com pontos, espaços e quebras', () => {
  const l1 = boleto('104', '2026-10-15', 289.9), l2 = boleto('756', '2026-10-25', 1500);
  const texto = `Recibo do pagador\nBeneficiário: Embalagens Sul Ltda CNPJ 12.345.678/0001-90\nLinha digitável\n${l1}\n...\n${l2.replace(/ /g, '\n')}\n${l1}`;
  const bs = acharBoletos(texto, '2026-10-01');
  assert.deepEqual(bs.map((b) => [b.bancoNome, b.valor, b.vencimento]), [['Caixa', 289.9, '2026-10-15'], ['Sicoob', 1500, '2026-10-25']]);
  assert.equal(beneficiario(texto), 'Embalagens Sul Ltda');
});

test('arrecadação (conta de consumo/tributo): valor real e data no convênio', () => {
  // 8 (arrecadação) · 3 (energia) · 6 (valor real, módulo 10) · DV · valor 11 · empresa 4 · data 20261020 · resto.
  const sem = '836' + '00000015790' + '1234' + '20261020' + '0'.repeat(43 - 3 - 11 - 4 - 8);
  assert.equal(sem.length, 43);
  const dvg = m10(sem);
  const barras = sem.slice(0, 3) + dvg + sem.slice(3);
  const blocos = [0, 11, 22, 33].map((i) => barras.slice(i, i + 11));
  const linha = blocos.map((b) => b + m10(b)).join(' ');
  const b = lerLinha(linha, '2026-10-01');
  assert.equal(b.tipo, 'arrecadacao');
  assert.equal(b.valor, 157.9);
  assert.equal(b.vencimento, '2026-10-20');
});
