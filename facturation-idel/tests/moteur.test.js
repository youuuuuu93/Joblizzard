// Tests du moteur : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../moteur.js');

const P = (o = {}) => ({ id: 'p1', nom: 'TEST', prenom: 'A', distanceAR: 0, horsAgglo: false, zoneIK: 'PLAINE', bsi: null, priseEnCharge: 60, ...o });
const V = (o = {}) => ({ id: 'v1', date: '2026-11-12', heure: '10:00', patientId: 'p1', lieu: 'DOMICILE', actes: [], ...o });
const metro = { zone: 'METRO' };
const jour = (vs, ps, params = metro) => M.calculerJournee(vs, ps, params);
const ligne = (r, code) => r.lignes.find((l) => l.code === code);

test('AMI change de valeur le 6/11/2026', () => {
  assert.equal(M.valeurTarif('AMI', '2026-11-05', 'METRO').montant, 3.15);
  assert.equal(M.valeurTarif('AMI', '2026-11-06', 'METRO').montant, 3.35);
  assert.equal(M.valeurTarif('AMI', '2026-11-06', 'DOM').montant, 3.51);
});

test('AIS refusée à partir du 21/06/2026', () => {
  const r = jour([V({ date: '2026-06-21', actes: [{ id: 'AIS3' }] })], [P()]).resultats[0];
  assert.ok(r.erreurs.length > 0);
  const r2 = jour([V({ date: '2026-06-19', actes: [{ id: 'AIS3' }] })], [P()]).resultats[0];
  assert.equal(r2.erreurs.length, 0);
  assert.equal(ligne(r2, 'AIS').montant, 7.95); // 3 × 2,65
});

test('Injection seule à domicile : AMI 1 + MAU + IFD', () => {
  const r = jour([V({ actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.cotation, 'AMI 1 + MAU + IFD');
  assert.equal(r.total, 7.45); // 3,35 + 1,35 + 2,75
  assert.equal(r.partAMO, 4.47);
  assert.equal(r.partPatientAMC, 2.98);
});

test('Article 11B : 100 % / 50 % / 0 %', () => {
  const r = jour([V({ actes: [{ id: 'INJ_SC' }, { id: 'PREL_V' }, { id: 'INJ_IM' }] })], [P()]).resultats[0];
  const actes = r.lignes.filter((l) => l.type === 'ACTE');
  assert.equal(actes[0].cotation, 'AMI 1,5');
  assert.equal(actes[0].montant, 5.03); // 1,5 × 3,35 = 5,025
  assert.equal(actes[1].cotation, 'AMI 1 (50 %)');
  assert.equal(actes[1].montant, 1.68); // 0,5 × 3,35 = 1,675
  assert.equal(actes[2].montant, 0);
  assert.ok(!ligne(r, 'MAU'), 'pas de MAU si plusieurs actes');
});

test('Patient BSI : AMI → AMX, forfait taux plein', () => {
  const r = jour([V({ actes: [{ id: 'BSB' }, { id: 'INJ_SC' }] })], [P({ bsi: 'BSB' })]).resultats[0];
  assert.deepEqual(r.erreurs, []);
  assert.equal(ligne(r, 'BSB').montant, 18.2);
  assert.equal(ligne(r, 'AMX').montant, 3.35);
});

test('Forfait BSI incohérent ou en double = erreur', () => {
  assert.ok(jour([V({ actes: [{ id: 'BSC' }] })], [P({ bsi: 'BSA' })]).resultats[0].erreurs.length);
  const j = jour([V({ actes: [{ id: 'BSA' }] }), V({ id: 'v2', heure: '18:00', actes: [{ id: 'BSA' }] })], [P({ bsi: 'BSA' })]);
  assert.ok(j.resultats[1].erreurs.some((e) => e.includes('déjà facturé')));
});

test('Nuit : seulement avec prescription', () => {
  const sans = jour([V({ heure: '21:30', actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.ok(!ligne(sans, 'NUIT'));
  const avec = jour([V({ heure: '21:30', prescriptionNuit: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.equal(ligne(avec, 'NUIT').montant, 9.15);
  const prof = jour([V({ heure: '02:00', prescriptionNuit: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.equal(ligne(prof, 'NUIT_PROFONDE').montant, 18.3);
  const matin = jour([V({ heure: '07:59', prescriptionNuit: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.equal(ligne(matin, 'NUIT').montant, 9.15);
  const jourOk = jour([V({ heure: '08:00', prescriptionNuit: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.ok(!ligne(jourOk, 'NUIT'));
});

test('Dimanche et jours fériés (dont Pâques mobiles)', () => {
  const dim = jour([V({ date: '2026-11-15', actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.equal(ligne(dim, 'DIMANCHE').montant, 8.5);
  const f = M.joursFeries(2027, false);
  assert.ok(f['2027-03-29']); // lundi de Pâques 2027
  assert.ok(f['2027-05-06']); // Ascension 2027
  assert.ok(f['2027-05-17']); // lundi de Pentecôte 2027
  assert.ok(M.joursFeries(2027, true)['2027-03-26']); // vendredi saint (Alsace-Moselle)
  const armistice = jour([V({ date: '2026-11-11', actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.ok(ligne(armistice, 'DIMANCHE'));
  // nuit + dimanche : non cumulable, la plus élevée
  const nd = jour([V({ date: '2026-11-15', heure: '23:30', prescriptionNuit: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.ok(ligne(nd, 'NUIT_PROFONDE') && !ligne(nd, 'DIMANCHE'));
});

test('IK : abattement aller-retour', () => {
  const r = jour([V({ actes: [{ id: 'INJ_SC' }] })], [P({ horsAgglo: true, distanceAR: 12 })]).resultats[0];
  assert.equal(ligne(r, 'IK_PLAINE').cotation, 'IK 10');
  assert.equal(ligne(r, 'IK_PLAINE').montant, 3.5);
  const m = jour([V({ actes: [{ id: 'INJ_SC' }] })], [P({ horsAgglo: true, distanceAR: 12, zoneIK: 'MONTAGNE' })]).resultats[0];
  assert.equal(ligne(m, 'IK_MONTAGNE').montant, 5.5); // 11 × 0,50
});

test('IK : plafonnement journalier (300 km -50 %, 400 km -100 %)', () => {
  const pats = [P({ id: 'a', horsAgglo: true, distanceAR: 252 }), P({ id: 'b', horsAgglo: true, distanceAR: 152 })];
  const j = jour([V({ id: '1', patientId: 'a', heure: '08:00', actes: [{ id: 'INJ_SC' }] }),
                  V({ id: '2', patientId: 'b', heure: '09:00', actes: [{ id: 'INJ_SC' }] })], pats);
  assert.equal(ligne(j.resultats[0], 'IK_PLAINE').montant, 87.5); // 250 km × 0,35
  // 2e visite : 150 km → 50 km à 100 %, 100 km à 50 %, 0 km au-delà de 400
  assert.equal(ligne(j.resultats[1], 'IK_PLAINE').montant, 35); // 50×0,35 + 100×0,175
  assert.equal(j.kmIKParJour['2026-11-12'], 400);
});

test('Cabinet : pas d\'IFD ni IK ; même domicile : pas de déplacement', () => {
  const c = jour([V({ lieu: 'CABINET', actes: [{ id: 'INJ_SC' }] })], [P({ horsAgglo: true, distanceAR: 20 })]).resultats[0];
  assert.equal(c.cotation, 'AMI 1 + MAU');
  const md = jour([V({ memeDeplacement: true, actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0];
  assert.ok(!ligne(md, 'IFD'));
});

test('Perfusions cumulées à taux plein', () => {
  const r = jour([V({ actes: [{ id: 'PERF_LONGUE' }, { id: 'PERF_FLACON' }] })], [P()]).resultats[0];
  assert.equal(r.lignes.filter((l) => l.type === 'ACTE').every((l) => l.pct === 1), true);
  assert.equal(ligne(r, 'AMI').montant, 46.9); // 14 × 3,35
});

test('Pansement : AMI 2 avant le 21/06/2026, AMI 2,02 ensuite', () => {
  assert.ok(jour([V({ actes: [{ id: 'PST_SIMPLE_OLD' }] })], [P()]).resultats[0].erreurs.length);
  const r = jour([V({ actes: [{ id: 'PST_SIMPLE' }] })], [P()]).resultats[0];
  assert.equal(ligne(r, 'AMI').montant, 6.77); // 2,02 × 3,35 = 6,767
  assert.ok(jour([V({ date: '2026-06-01', actes: [{ id: 'PST_SIMPLE' }] })], [P()]).resultats[0].erreurs.length);
});

test('Erreurs bloquantes : tarif DROM inconnu, heure manquante, sans acte', () => {
  assert.ok(jour([V({ date: '2027-11-02', actes: [{ id: 'INJ_SC' }] })], [P()], { zone: 'DOM' }).resultats[0].erreurs.length);
  assert.ok(jour([V({ heure: '', actes: [{ id: 'INJ_SC' }] })], [P()]).resultats[0].erreurs.length);
  assert.ok(jour([V({ actes: [] })], [P()]).resultats[0].erreurs.length);
  // surcharge manuelle débloque
  const s = jour([V({ date: '2027-11-02', actes: [{ id: 'INJ_SC' }] })], [P()], { zone: 'DOM', surcharges: { 'AMI|DOM|2027-11-01': 3.62 } }).resultats[0];
  assert.equal(ligne(s, 'AMI').montant, 3.62);
});
