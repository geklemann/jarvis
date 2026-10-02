// Caixa projetado: saldo + repasses + vendas futuras − contas, dia a dia; vencidos contam hoje; aponta o 1º dia negativo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projetarCaixa } from '../supabase/functions/_shared/caixa.ts';

test('acha o dia em que o saldo fica negativo e o menor saldo', () => {
  const p = projetarCaixa('2026-10-02', 1000, [{ d: '2026-10-05', v: 500 }], [{ d: '2026-09-28', v: 300 }, { d: '2026-10-04', v: 1500 }], [], 10);
  assert.equal(p.dias[0].saldo, 700, 'conta vencida sai hoje');
  assert.equal(p.negativoEm, '2026-10-04');
  assert.equal(p.min, -800);
  assert.equal(p.diaMin, '2026-10-04');
  assert.equal(p.dias.at(-1).saldo, -300);
});

test('vendas futuras entram depois do prazo do canal e evitam o falso alarme', () => {
  const sem = projetarCaixa('2026-10-02', 0, [], [{ d: '2026-10-08', v: 400 }], [], 10);
  assert.equal(sem.negativoEm, '2026-10-08');
  const com = projetarCaixa('2026-10-02', 0, [], [{ d: '2026-10-08', v: 400 }], [{ porDia: 100, prazo: 2 }], 10);
  assert.equal(com.dias[1].saldo, 0, 'a venda de hoje só entra daqui a 2 dias');
  assert.equal(com.dias[2].saldo, 100);
  assert.equal(com.negativoEm, null, 'em 08/10 já entraram 500');
});
