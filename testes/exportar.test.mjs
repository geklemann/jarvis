// Exportação para Excel: os textos da tela viram células do tipo certo (reais, percentual, número, data)
// e códigos continuam texto (CEP, NCM, número do pedido, SKU).
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const { ev } = carregarSistema();
const celula = ev('window.Exportar.celula');
const n = (t) => { const c = celula(t); assert.equal(c?.t, 'n', `"${t}" deveria virar número`); return c.v; };
const s = (t) => { const c = celula(t); assert.equal(c?.t, 's', `"${t}" deveria continuar texto`); return c.v; };

test('valores em reais, inclusive negativos', () => {
  assert.equal(n('R$ 1.234,56'), 1234.56);
  assert.equal(n('−R$ 10,00'), -10);
  assert.equal(n('R$ -5,00'), -5);
  assert.equal(n('R$ 0,99'), 0.99);
});

test('formato contábil entre parênteses é negativo', () => {
  assert.equal(n('(2.861,40)'), -2861.4);
});

test('percentuais viram fração com o formato de %', () => {
  assert.equal(n('12,5%'), 0.125);
  assert.equal(n('-3%'), -0.03);
  assert.equal(celula('12,5%').z, '0.0%');
});

test('números com separador de milhar', () => {
  assert.equal(n('3.472'), 3472);
  assert.equal(n('1.234.567,00'), 1234567);
  assert.equal(n('16'), 16);
});

test('datas dd/mm/aaaa viram data', () => {
  const c = celula('30/09/2026');
  assert.equal(c.t, 'd');
  assert.equal(c.v.toISOString().slice(0, 10), '2026-09-30');
});

test('códigos continuam texto', () => {
  s('20040-020');            // CEP
  s('95030010');             // NCM
  s('2000014811757289');     // pedido do Mercado Livre
  s('LM-3413');              // SKU
  s('0123');                 // zero à esquerda
  s('Shopee');
});

test('traço e vazio viram célula vazia', () => {
  assert.equal(celula('–'), null);
  assert.equal(celula('  '), null);
});
