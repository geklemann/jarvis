// Folha de pagamento (tabelas de 2026 que o sistema usa por padrão): INSS progressivo, IRRF com desconto
// simplificado e o redutor de 2026 (isenção até R$ 5.000, redução até R$ 7.350), e o holerite completo.
// Os valores esperados foram calculados à mão, faixa a faixa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const { ev, ctx } = carregarSistema();
const F = ev('window.Folha');

test('INSS progressivo: primeira faixa, faixas intermediárias e teto', () => {
  assert.equal(F.inss(1621), 121.58);   // 1.621,00 × 7,5%
  assert.equal(F.inss(3000), 248.60);   // 121,575 + 115,3656 + 11,6592
  assert.equal(F.inss(6000), 641.51);   // … + 174,1716 + 230,4022
  assert.equal(F.inss(10000), 988.09, 'acima do teto (R$ 8.475,55) o desconto para de crescer');
  assert.equal(F.inss(20000), 988.09);
});

test('IRRF: isento até R$ 5.000 de rendimento (redutor de 2026)', () => {
  assert.equal(F.irrf(5000, F.inss(5000), 0).ir, 0);
  assert.equal(F.irrf(3000, F.inss(3000), 2).ir, 0);
});

test('IRRF: faixa do redutor (R$ 5.000 a R$ 7.350)', () => {
  // base = 6.000 − 641,51 (INSS > simplificado) = 5.358,49 → 27,5% − 908,73 = 564,85; redução 978,62 − 0,133145 × 6.000 = 179,75
  const r = F.irrf(6000, 641.51, 0);
  assert.equal(r.base, 5358.49);
  assert.equal(r.ir, 385.10);
});

test('IRRF: acima de R$ 7.350 sem redutor, com dependente', () => {
  // deduções = 988,09 + 189,59 = 1.177,68 → base 8.822,32 → 27,5% − 908,73 = 1.517,41
  const r = F.irrf(10000, 988.09, 1);
  assert.equal(r.base, 8822.32);
  assert.equal(r.ir, 1517.41);
});

test('IRRF: usa o desconto simplificado quando é maior que as deduções legais', () => {
  // INSS 400 < simplificado 607,20 → base = 8.000 − 607,20 = 7.392,80 → 27,5% − 908,73 = 1.124,29
  const r = F.irrf(8000, 400, 0);
  assert.equal(r.base, 7392.80);
  assert.equal(r.ir, 1124.29);
});

test('holerite CLT de R$ 3.000 no mês cheio', () => {
  ctx.__c = { id: 'c1', nome: 'Pessoa Teste', vinculo: 'clt', salario: 3000, admissao: '2025-01-02', ativo: true, dependentes_ir: 0, politica_horas: 'banco' };
  const h = ev(`Folha.calcular(window.__c,'2026-09')`);
  assert.equal(h.bruto, 3000);
  assert.equal(h.inss, 248.60);
  assert.equal(h.irrf, 0);
  assert.equal(h.fgts, 240, 'FGTS 8% sobre a base do INSS');
  assert.equal(h.liquido, 2751.40);
  assert.equal(h.encargos, 834, 'patronal 20% + RAT 2% + terceiros 5,8% = 27,8%');
});

test('holerite: admissão no meio do mês paga só os dias trabalhados', () => {
  ctx.__c = { id: 'c2', nome: 'Admitida', vinculo: 'clt', salario: 3000, admissao: '2026-09-16', ativo: true, dependentes_ir: 0, politica_horas: 'banco' };
  const h = ev(`Folha.calcular(window.__c,'2026-09')`);
  assert.equal(h.bruto, 1500, '15 de 30 dias');
});

test('holerite: pró-labore com INSS de 11% e sem FGTS', () => {
  ctx.__c = { id: 'c3', nome: 'Sócio', vinculo: 'prolabore', salario: 5000, admissao: '2024-01-01', ativo: true, dependentes_ir: 0 };
  const h = ev(`Folha.calcular(window.__c,'2026-09')`);
  assert.equal(h.inss, 550);
  assert.equal(h.fgts, 0);
  assert.equal(h.encargos, 1000, '20% da empresa');
});

test('colaborador admitido depois do mês não tem holerite', () => {
  ctx.__c = { id: 'c4', nome: 'Futuro', vinculo: 'clt', salario: 2000, admissao: '2026-10-05', ativo: true };
  assert.equal(ev(`Folha.calcular(window.__c,'2026-09')`), null);
});
