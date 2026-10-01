// Relatório semanal e canais de envio (servidor): qual semana entra no relatório (horário de Brasília, segunda a
// domingo, uma vez por semana) e o formato do telefone para o WhatsApp.
import test from 'node:test';
import assert from 'node:assert/strict';

const { semanaAnterior } = await import('../supabase/functions/_shared/semana.ts');
globalThis.Deno ??= { env: { get: () => undefined } };
const { telefone, canaisDisponiveis } = await import('../supabase/functions/_shared/canais.ts');

test('numa quinta-feira, o relatório é da semana anterior (segunda a domingo)', () => {
  const s = semanaAnterior(new Date('2026-10-01T15:00:00Z'));
  assert.equal(s.ini, '2026-09-21');
  assert.equal(s.fim, '2026-09-27');
  assert.equal(s.iniAnt, '2026-09-14');
  assert.equal(s.fimAnt, '2026-09-20');
  assert.equal(s.chave, '2026-S39');
});

test('na segunda de manhã (horário de Brasília), cobre a semana que acabou no domingo', () => {
  const s = semanaAnterior(new Date('2026-10-05T12:00:00Z'));
  assert.deepEqual([s.ini, s.fim, s.chave], ['2026-09-28', '2026-10-04', '2026-S40']);
});

test('domingo 23 h em Brasília (já segunda em UTC) ainda conta como domingo', () => {
  const s = semanaAnterior(new Date('2026-10-05T02:00:00Z'));
  assert.deepEqual([s.ini, s.fim], ['2026-09-21', '2026-09-27']);
});

test('virada de ano: a semana ISO 1 de 2027 começa em 04/01/2027', () => {
  const s = semanaAnterior(new Date('2027-01-12T15:00:00Z'));
  assert.deepEqual([s.ini, s.fim, s.chave], ['2027-01-04', '2027-01-10', '2027-S01']);
});

test('telefone para o WhatsApp: só dígitos, com 55 para número brasileiro', () => {
  assert.equal(telefone('(47) 99999-1234'), '5547999991234');
  assert.equal(telefone('47 3333-1234'), '554733331234');
  assert.equal(telefone('+55 47 99999-1234'), '5547999991234');
});

test('sem chaves no servidor, nenhum canal fica disponível', () => {
  assert.deepEqual(canaisDisponiveis(), { email: false, whatsapp: false });
});
