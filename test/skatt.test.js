// Kjør med: node test/skatt.test.js
const assert = require('assert');
const S = require('../js/skatt.js');

const naer = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

const p = {
  omsetning: 1500000, kostnader: 200000, agaSats: 0.141, otpSats: 0.02, fradrag: 0,
  inngangsverdi: 30000, skjermingsrente: 0.04, privatFormue: 0, asFormue: 0, friEK: 0,
  medLatent: false, medFormue: false, otpVekt: 0
};

// Trinnskatt og trygdeavgift
naer(S.trinnskatt(226100), 0);
naer(S.trinnskatt(318300), (318300 - 226100) * 0.017);
naer(S.trinnskatt(600000), (318300 - 226100) * 0.017 + (600000 - 318300) * 0.04);
naer(S.trygdeavgift(99650), 0);
naer(S.trygdeavgift(100000), 350 * 0.25);
naer(S.trygdeavgift(600000), 600000 * 0.076);
naer(S.minstefradrag(100000), 46000);
naer(S.minstefradrag(1000000), 95700);
naer(S.formuesskatt(2900000), 10000);

// Kun utbytte: selskapsskatt 22 %, deretter (utbytte − skjerming) × 1,72 × 22 % minus personfradrag
const r0 = S.beregn(p, 0, 0);
naer(r0.selskapsskatt, 1300000 * 0.22);
naer(r0.utbytte, 1300000 * 0.78);
const forventetAlm = ((1014000 - 1200) * 1.72 - 114540) * 0.22;
naer(r0.utbytteskatt, forventetAlm);
naer(r0.aga, 0);

// Lønn: totalregnskapet går opp – netto + skatt = overskudd før lønn (uten OTP og latent skatt)
const q = { ...p, otpSats: 0 };
const r1 = S.beregn(q, 600000, 0);
naer(r1.netto + r1.totalSkatt, 1300000, 2);

// Optimum ved høyt overskudd skal ligge rundt innslagspunktet for trinn 4 (980 100) med AGA 14,1 %
const stor = { ...q, omsetning: 3000000, kostnader: 0 };
const opt = S.optimer(stor, 0);
assert.ok(opt.lonn > 900000 && opt.lonn <= 980100, 'optimal lønn: ' + opt.lonn);

// Marginalskatt: utbytte over skjerming ≈ 51,5 %, lønn i trinn 4 med AGA 14,1 % ≈ 52,9 %
const m = S.marginal(q, 1200000, 500000);
naer(m.utbytte * 1000, 515.2, 1);
naer(m.lonn * 1000, (1 - (1 - 0.22 - 0.076 - 0.167) / 1.141) * 1000, 1);

// Sone V (0 % AGA): lønn lønner seg helt opp til trinn 5
const sone5 = S.optimer({ ...stor, agaSats: 0, omsetning: 4000000 }, 0);
assert.ok(sone5.lonn >= 1467200 - 100, 'sone V: ' + sone5.lonn);

// Beholdt i selskapet gir mindre utbytte
const r2 = S.beregn(p, 0, 200000);
naer(r2.utbytte, 1300000 * 0.78 - 200000);

console.log('Alle tester OK. Optimal lønn ved 3 MNOK overskudd:', Math.round(opt.lonn));
