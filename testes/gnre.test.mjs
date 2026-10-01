// GNRE: campo extra de outro documento (CT-e) nunca recebe a chave da NF-e (rejeição 260 de SE); data de pagamento
// automática = dia útil seguinte à emissão (sexta, sábado e domingo → segunda; feriados nacionais pulados), igual na
// tela e no servidor; Excel das guias com o número da nota sem zeros à esquerda; telas voltam ao estado original.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';
import { campoDeOutroDocumento, dataPagamentoGuia, diaUtilSeguinte, feriadoNacional, valorCampoExtra } from '../supabase/functions/_shared/gnre_regras.ts';

const { ev, ctx } = carregarSistema();
const NOTA = { chave: '42260965193225000157550010000151581038819691', numero: '015158', emissao: '2026-09-30' };

test('SE: campo 94 "Chave de Acesso do CTe/CTe-OS" não recebe a chave da NF-e', () => {
  assert.equal(campoDeOutroDocumento('Chave de Acesso do CTe/CTe-OS'), true);
  assert.equal(campoDeOutroDocumento('Chave do MDF-e'), true);
  assert.equal(valorCampoExtra('Chave de Acesso do CTe/CTe-OS', NOTA), null);
  assert.equal(valorCampoExtra('Chave de acesso da NF-e', NOTA), NOTA.chave);
  assert.equal(valorCampoExtra('Chave de Acesso', NOTA), NOTA.chave, 'chave genérica = NF-e');
  assert.equal(valorCampoExtra('Número da Nota Fiscal', NOTA), '015158');
  assert.equal(valorCampoExtra('Data de emissão', NOTA), '2026-09-30');
  assert.equal(valorCampoExtra('Informações complementares', NOTA), null);
});

// Outubro de 2026: 1 = quinta, 2 = sexta, 3–4 = fim de semana, 12 = Nossa Senhora Aparecida (segunda).
test('pagamento automático: dia útil seguinte à emissão', () => {
  assert.equal(diaUtilSeguinte('2026-10-01'), '2026-10-02', 'quinta → sexta');
  assert.equal(diaUtilSeguinte('2026-10-02'), '2026-10-05', 'sexta → segunda');
  assert.equal(diaUtilSeguinte('2026-10-03'), '2026-10-05', 'sábado → segunda');
  assert.equal(diaUtilSeguinte('2026-10-04'), '2026-10-05', 'domingo → segunda');
  assert.equal(diaUtilSeguinte('2026-10-09'), '2026-10-13', 'sexta antes do feriado de 12/10 → terça');
  assert.equal(diaUtilSeguinte('2026-12-24'), '2026-12-28', 'Natal na sexta → segunda');
});

test('feriados móveis de 2027: Carnaval 8 e 9/2, Sexta-feira Santa 26/3, Corpus Christi 27/5', () => {
  for (const d of ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27']) assert.equal(feriadoNacional(d), true, d);
  assert.equal(feriadoNacional('2027-03-25'), false);
});

test('data da guia: automática, fixa e nunca antes de hoje; tela e servidor iguais', () => {
  const casos = [
    [{ tipo: 'nota', emissao: '2026-10-02', vencimento: '2026-10-02' }, '2026-10-02', {}, '2026-10-05'],
    [{ tipo: 'nota', emissao: '2026-09-25', vencimento: '2026-09-25' }, '2026-10-01', {}, '2026-10-01'],
    [{ tipo: 'nota', emissao: '2026-10-02', vencimento: '2026-10-02' }, '2026-10-02', { modo: 'fixa', data: '2026-10-07' }, '2026-10-07'],
    [{ tipo: 'mensal', vencimento: '2026-10-10' }, '2026-10-01', {}, '2026-10-10'],
  ];
  for (const [g, h, o, esperado] of casos) {
    assert.equal(dataPagamentoGuia(g, h, o), esperado, `servidor ${JSON.stringify([g, o])}`);
    ctx.__a = [g, h, o];
    assert.equal(ev(`Difal.dataPagamento(...window.__a)`), esperado, `tela ${JSON.stringify([g, o])}`);
  }
  for (let d = new Date('2026-01-01T12:00:00Z'); d < new Date('2027-12-31T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    assert.equal(ev(`Difal.diaUtilSeguinte('${iso}')`), diaUtilSeguinte(iso), iso);
  }
});

test('Excel: célula marcada com o número da nota sai como número, sem zeros à esquerda', () => {
  ev(`window.__td={dataset:{expNum:'15158'},innerText:'015158'}`);
  assert.deepEqual(JSON.parse(JSON.stringify(ev(`Exportar.celulaTd(window.__td)`))), { t: 'n', v: 15158, z: '0' });
  assert.equal(ev(`Exportar.celula('015158').t`), 's', 'sem a marcação, código com zero continua texto');
});

test('menu: as telas voltam ao estado original e as preferências ficam', () => {
  ev(`window.__o={aba:'notas',sel:new Set(),pref:'fixa'};Reiniciar.registrar(window.__o,['aba','sel']);window.__o.aba='guias';window.__o.sel.add('x');window.__o.pref='auto';Reiniciar.tudo()`);
  assert.equal(ev(`window.__o.aba`), 'notas');
  assert.equal(ev(`window.__o.sel.size`), 0);
  assert.equal(ev(`window.__o.pref`), 'auto', 'chave fora da lista não é mexida');
  assert.ok(ev(`Reiniciar.quantas()`) >= 40, 'telas do sistema registradas');
});
