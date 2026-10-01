// Ponto e banco de horas. A regra existe em dois lugares (tela: web/ponto.js; servidor: supabase/functions/_shared/ponto_calc.ts)
// e os dois precisam dar o mesmo resultado. Também confere um mês montado à mão, com cada tipo de dia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const servidor = await import('../supabase/functions/_shared/ponto_calc.ts');
const { ev } = carregarSistema();
const tela = ev('window.Ponto');

const casos = [
  ['08:00', '12:00', '13:00', '17:00'],          // 8h
  ['08:00', '12:00', '13:00', '18:00'],          // 9h
  ['22:00', '23:30'],                            // 1h30
  ['08:00', '12:00', '13:00'],                   // par incompleto
  ['12:00', '08:00'],                            // saída antes da entrada
  ['08:00', '10:00', '10:15', '12:00', '13:00', '17:00'], // três pares
  [],                                            // sem marcação
];

test('horas trabalhadas: tela e servidor calculam igual', () => {
  for (const m of casos) assert.equal(tela.trabalhado(m), servidor.trabalhado(m), `marcações ${JSON.stringify(m)}`);
});

test('horas trabalhadas: valores conferidos', () => {
  assert.equal(servidor.trabalhado(casos[0]), 480);
  assert.equal(servidor.trabalhado(casos[2]), 90);
  assert.equal(servidor.trabalhado(casos[3]), null, 'par incompleto não soma (fica a conferir)');
  assert.equal(servidor.trabalhado(casos[4]), null);
  assert.equal(servidor.trabalhado(casos[5]), 465);
});

test('banco de horas de um mês com cada tipo de dia', () => {
  // Setembro de 2026 começa numa terça. Jornada de 8h, segunda a sexta. "Hoje" = 08/09.
  const colab = { jornada_min: 480, dias_semana: [1, 2, 3, 4, 5], saldo_inicial: 0, inicio: '2026-09-01' };
  const dia = (data, marcacoes, tipo = 'normal', conferido = true) => ({ data, marcacoes, tipo, conferido });
  const dias = [
    dia('2026-09-01', ['08:00', '12:00', '13:00', '18:00']), // 9h → +60
    dia('2026-09-02', ['08:00', '12:00', '13:00', '16:00']), // 7h → −60
    dia('2026-09-03', [], 'falta'),                          // −480
    // 04/09 (sexta) sem registro → −480 e fica pendente
    dia('2026-09-05', ['08:00', '12:00'], 'normal', false),  // sábado, fora da escala → +240, ainda não conferido
    dia('2026-09-07', [], 'feriado'),                        // 0
    dia('2026-09-08', ['08:00']),                            // hoje, incompleto → ainda não conta
  ];
  const r = servidor.resumoMes(colab, dias, [{ competencia: '2026-09', minutos: 30 }], '2026-09', '2026-09-08');
  assert.deepEqual(r, { creditos: 330, debitos: -1020, saldo: -690, pendentes: 2 });
});

test('saldo acumulado soma o saldo inicial e os meses', () => {
  const colab = { jornada_min: 480, dias_semana: [1, 2, 3, 4, 5], saldo_inicial: 120, inicio: '2026-09-01' };
  const dias = [{ data: '2026-09-01', marcacoes: ['08:00', '12:00', '13:00', '18:00'], tipo: 'normal', conferido: true }];
  // Só 01/09 (hoje): 9h → +60; o saldo inicial de 2h entra uma vez.
  assert.equal(servidor.acumulado(colab, dias, [], '2026-09', '2026-09-01'), 180);
});
