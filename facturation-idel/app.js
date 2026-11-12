/* Interface de l'application – données stockées localement dans le navigateur (localStorage). */
(function () {
  const M = window.IDEL_MOTEUR, N = window.IDEL_NOMENCLATURE, T = window.IDEL_TARIFS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  // ---------- Stockage ----------
  const CLE = 'facturation-idel-v1';
  const vide = { patients: [], visites: [], factures: [], params: { zone: 'METRO', alsaceMoselle: false, surcharges: {}, nom: '', rpps: '' } };
  let db = (() => { try { return { ...vide, ...JSON.parse(localStorage.getItem(CLE)) }; } catch { return structuredClone(vide); } })();
  const save = () => localStorage.setItem(CLE, JSON.stringify(db));
  const params = () => ({ zone: db.params.zone, alsaceMoselle: db.params.alsaceMoselle, surcharges: db.params.surcharges });
  const nomPatient = (p) => p ? `${p.nom.toUpperCase()} ${p.prenom}` : '?';

  // ---------- Onglets ----------
  document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('nav button, .onglet').forEach((e) => e.classList.remove('actif'));
    b.classList.add('actif'); $(b.dataset.onglet).classList.add('actif'); rafraichir();
  });

  // ---------- NIR ----------
  function verifierNir(nir) {
    const s = nir.replace(/\s/g, '').toUpperCase();
    if (!s) return { ok: true, msg: '' };
    if (!/^[12378]\d{2}(0[1-9]|1[0-2]|[2-9]\d)(\d{2}|2A|2B)\d{6}\d{2}$/.test(s)) return { ok: false, msg: 'NIR : format invalide (13 chiffres + clé de 2 chiffres).' };
    const corps = s.slice(0, 13).replace('2A', '19').replace('2B', '18');
    const cle = 97n - (BigInt(corps) % 97n);
    return Number(s.slice(13)) === Number(cle) ? { ok: true, msg: 'NIR valide ✓' } : { ok: false, msg: `NIR : clé incorrecte (attendue ${String(cle).padStart(2, '0')}).` };
  }
  $('pNir').oninput = () => { const r = verifierNir($('pNir').value); $('nirMsg').textContent = r.msg; $('nirMsg').className = r.ok ? 'info' : 'erreur'; };

  // ---------- Patients ----------
  function remplirPatient(p) {
    $('titrePatient').textContent = p ? 'Modifier le patient' : 'Nouveau patient';
    $('pId').value = p?.id || ''; $('pNom').value = p?.nom || ''; $('pPrenom').value = p?.prenom || '';
    $('pDdn').value = p?.ddn || ''; $('pNir').value = p?.nir || ''; $('pAdresse').value = p?.adresse || '';
    $('pPec').value = p?.priseEnCharge || 60; $('pBsi').value = p?.bsi || ''; $('pHorsAgglo').checked = !!p?.horsAgglo;
    $('pDist').value = p?.distanceAR ?? ''; $('pZone').value = p?.zoneIK || 'PLAINE'; $('nirMsg').textContent = '';
  }
  $('annulerPatient').onclick = () => remplirPatient(null);
  $('formPatient').onsubmit = (e) => {
    e.preventDefault();
    const nir = verifierNir($('pNir').value);
    if (!nir.ok) { alert(nir.msg); return; }
    if ($('pHorsAgglo').checked && !(Number($('pDist').value) > 0)) { alert('Hors agglomération : indiquez la distance aller-retour en km.'); return; }
    const p = { id: $('pId').value || uid(), nom: $('pNom').value.trim(), prenom: $('pPrenom').value.trim(), ddn: $('pDdn').value,
      nir: $('pNir').value.trim(), adresse: $('pAdresse').value.trim(), priseEnCharge: Number($('pPec').value), bsi: $('pBsi').value || null,
      horsAgglo: $('pHorsAgglo').checked, distanceAR: Number($('pDist').value) || 0, zoneIK: $('pZone').value };
    const i = db.patients.findIndex((x) => x.id === p.id);
    if (i >= 0) db.patients[i] = p; else db.patients.push(p);
    save(); remplirPatient(null); rafraichir();
  };
  function afficherPatients() {
    const l = [...db.patients].sort((a, b) => nomPatient(a).localeCompare(nomPatient(b)));
    $('listePatients').innerHTML = l.length ? `<table><tr><th>Patient</th><th>NIR</th><th>AMO</th><th>BSI</th><th>Déplacement</th><th></th></tr>${l.map((p) => `
      <tr><td>${esc(nomPatient(p))}</td><td>${esc(p.nir)}</td><td>${p.priseEnCharge} %</td><td>${esc(p.bsi || '–')}</td>
      <td>${p.horsAgglo ? `IK ${esc(p.zoneIK.toLowerCase())} – ${p.distanceAR} km A/R` : 'Agglomération (IFD seule)'}</td>
      <td><button data-edit="${p.id}">Modifier</button> <button class="danger" data-del="${p.id}">Supprimer</button></td></tr>`).join('')}</table>` : '<p class="info">Aucun patient.</p>';
    $('listePatients').querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => remplirPatient(db.patients.find((p) => p.id === b.dataset.edit)));
    $('listePatients').querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      if (db.visites.some((v) => v.patientId === b.dataset.del)) { alert('Ce patient a des passages enregistrés : suppression impossible.'); return; }
      if (confirm('Supprimer ce patient ?')) { db.patients = db.patients.filter((p) => p.id !== b.dataset.del); save(); rafraichir(); }
    });
  }

  // ---------- Saisie d'un passage ----------
  let actesEnCours = [];
  const dateT = () => $('dateTournee').value;
  function remplirSelectActes() {
    const d = dateT();
    const dispo = N.ACTES.filter((a) => (!a.du || d >= a.du) && (!a.au || d <= a.au));
    $('vActe').innerHTML = dispo.map((a) => `<option value="${a.id}">${esc(a.libelle)} — ${a.forfait ? a.lettre : a.lettre + ' ' + String(a.coef).replace('.', ',')}${a.verifie === false ? ' ⚠' : ''}</option>`).join('');
  }
  function libelleActe(ref) {
    if (ref.libre) return `${ref.libelle || 'Acte libre'} (${ref.lettre} ${String(ref.coef).replace('.', ',')})`;
    const a = N.ACTES.find((x) => x.id === ref.id); return a ? a.libelle : ref.id;
  }
  function afficherActesEnCours() {
    $('listeActes').innerHTML = actesEnCours.map((a, i) => `<li>${esc(libelleActe(a))}<button type="button" data-i="${i}" title="Retirer">×</button></li>`).join('');
    $('listeActes').querySelectorAll('button').forEach((b) => b.onclick = () => { actesEnCours.splice(Number(b.dataset.i), 1); afficherActesEnCours(); });
    apercu();
  }
  $('ajoutActe').onclick = () => { if ($('vActe').value) { actesEnCours.push({ id: $('vActe').value }); afficherActesEnCours(); } };
  $('ajoutLibre').onclick = () => {
    const lettre = $('libLettre').value.trim().toUpperCase(), coef = Number($('libCoef').value);
    if (!T.TARIFS[lettre]) { alert(`Lettre-clé inconnue. Possibles : ${Object.keys(T.TARIFS).filter((k) => !k.startsWith('IK') && !['IFD','MAU','MCI','NUIT','NUIT_PROFONDE','DIMANCHE'].includes(k)).join(', ')}`); return; }
    if (!(coef > 0)) { alert('Coefficient invalide.'); return; }
    actesEnCours.push({ libre: true, lettre, coef, libelle: $('libLibelle').value.trim(), tauxPlein: $('libTauxPlein').checked });
    ['libLettre', 'libCoef', 'libLibelle'].forEach((i) => $(i).value = ''); $('libTauxPlein').checked = false;
    afficherActesEnCours();
  };
  const visiteDuFormulaire = () => ({ id: uid(), date: dateT(), heure: $('vHeure').value, patientId: $('vPatient').value, lieu: $('vLieu').value,
    actes: [...actesEnCours], mci: $('vMci').checked, prescriptionNuit: $('vNuit').checked, memeDeplacement: $('vMemeDep').checked });

  function htmlResultat(r) {
    return `${r.erreurs.map((e) => `<div class="erreur">⛔ ${esc(e)}</div>`).join('')}${r.alertes.map((e) => `<div class="alerte">⚠ ${esc(e)}</div>`).join('')}
      ${r.lignes.length ? `<table><tr><th>Cotation</th><th>Libellé</th><th class="num">Montant</th></tr>${r.lignes.map((l) => `<tr><td><span class="cotation">${esc(l.cotation)}</span></td><td>${esc(l.libelle)}</td><td class="num">${eur(l.montant)}</td></tr>`).join('')}
      <tr><td colspan="2"><b>Total</b> — part AMO ${eur(r.partAMO)} · part patient/complémentaire ${eur(r.partPatientAMC)}</td><td class="num"><b>${eur(r.total)}</b></td></tr></table>` : ''}`;
  }
  function apercu() {
    if (!$('vPatient').value || !actesEnCours.length) { $('apercu').innerHTML = ''; return; }
    const v = visiteDuFormulaire();
    const autres = db.visites.filter((x) => x.date === v.date);
    const j = M.calculerJournee([...autres, v], db.patients, params());
    const r = j.resultats.find((x) => x.visiteId === v.id);
    $('apercu').innerHTML = `<h3>Aperçu de la cotation</h3>${htmlResultat(r)}`;
  }
  ['vPatient', 'vHeure', 'vLieu', 'vMci', 'vNuit', 'vMemeDep'].forEach((i) => $(i).addEventListener('change', apercu));
  $('vPatient').addEventListener('change', () => { const p = db.patients.find((x) => x.id === $('vPatient').value); if (p?.bsi && !actesEnCours.length) { actesEnCours.push({ id: p.bsi }); afficherActesEnCours(); } });

  $('formVisite').onsubmit = (e) => {
    e.preventDefault();
    if (!actesEnCours.length) { alert('Ajoutez au moins un acte.'); return; }
    if (estValidee(dateT())) { alert('Cette journée est déjà validée.'); return; }
    db.visites.push(visiteDuFormulaire()); save();
    actesEnCours = []; ['vMci', 'vNuit', 'vMemeDep'].forEach((i) => $(i).checked = false); $('vHeure').value = '';
    afficherActesEnCours(); rafraichir();
  };

  // ---------- Journée ----------
  const estValidee = (d) => db.factures.some((f) => f.date === d);
  function afficherJournee() {
    const d = dateT();
    const vis = db.visites.filter((v) => v.date === d);
    const feries = M.joursFeries(Number(d.slice(0, 4)), db.params.alsaceMoselle);
    const jourSem = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
    $('infoJour').innerHTML = `${jourSem}${feries[d] ? ' — <b>jour férié : ' + esc(feries[d]) + '</b>' : ''}${estValidee(d) ? ' — <span class="ok">journée validée</span>' : ''}`;
    if (!vis.length) { $('journee').innerHTML = '<p class="info">Aucun passage saisi.</p>'; return null; }
    const j = M.calculerJournee(vis, db.patients, params());
    const nbErr = j.resultats.reduce((s, r) => s + r.erreurs.length, 0);
    $('journee').innerHTML = j.resultats.map((r) => {
      const v = vis.find((x) => x.id === r.visiteId), p = db.patients.find((x) => x.id === v.patientId);
      return `<div class="passage"><h3><span>${esc(v.heure)} — ${esc(nomPatient(p))} (${v.lieu === 'DOMICILE' ? 'domicile' : 'cabinet'})</span>
        ${estValidee(d) ? '' : `<button class="danger" data-supv="${v.id}">Supprimer</button>`}</h3>
        <div>Actes : ${v.actes.map((a) => esc(libelleActe(a))).join(' ; ')}</div>${htmlResultat(r)}</div>`;
    }).join('') + `<p class="total">Total de la journée : ${eur(j.total)}</p>` + (nbErr ? `<div class="erreur">${nbErr} erreur(s) à corriger avant validation.</div>` : '');
    $('journee').querySelectorAll('[data-supv]').forEach((b) => b.onclick = () => { if (confirm('Supprimer ce passage ?')) { db.visites = db.visites.filter((v) => v.id !== b.dataset.supv); save(); rafraichir(); } });
    return { j, nbErr, vis };
  }
  $('validerJournee').onclick = () => {
    const d = dateT();
    if (estValidee(d)) { alert('Journée déjà validée.'); return; }
    const r = afficherJournee();
    if (!r) return;
    if (r.nbErr) { alert('Impossible de valider : corrigez d\'abord les erreurs (en rouge).'); return; }
    const nbAl = r.j.resultats.reduce((s, x) => s + x.alertes.length, 0);
    if (nbAl && !confirm(`${nbAl} alerte(s) (en orange). Les avez-vous toutes vérifiées ?`)) return;
    r.j.resultats.forEach((res) => {
      const v = r.vis.find((x) => x.id === res.visiteId), p = db.patients.find((x) => x.id === v.patientId);
      db.factures.push({ id: uid(), date: d, heure: v.heure, patientId: p.id, patient: nomPatient(p), nir: p.nir, cotation: res.cotation,
        lignes: res.lignes, total: res.total, partAMO: res.partAMO, partPatientAMC: res.partPatientAMC, tauxAMO: p.priseEnCharge });
    });
    save(); rafraichir(); alert('Journée validée.');
  };

  // ---------- Factures ----------
  function facturesFiltrees() {
    const du = $('fDu').value || '0000', au = $('fAu').value || '9999';
    return db.factures.filter((f) => f.date >= du && f.date <= au).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  }
  function afficherFactures() {
    const l = facturesFiltrees();
    const tot = l.reduce((s, f) => s + f.total, 0), amo = l.reduce((s, f) => s + f.partAMO, 0);
    $('listeFactures').innerHTML = l.length ? `<table><tr><th>Date</th><th>Patient</th><th>Cotation</th><th class="num">Total</th><th class="num">AMO</th><th class="num">Patient/AMC</th></tr>
      ${l.map((f) => `<tr><td>${esc(f.date)} ${esc(f.heure)}</td><td>${esc(f.patient)}</td><td><span class="cotation">${esc(f.cotation)}</span></td><td class="num">${eur(f.total)}</td><td class="num">${eur(f.partAMO)}</td><td class="num">${eur(f.partPatientAMC)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Total (${l.length} passages)</b></td><td class="num"><b>${eur(M.arrondi(tot))}</b></td><td class="num">${eur(M.arrondi(amo))}</td><td class="num">${eur(M.arrondi(tot - amo))}</td></tr></table>` : '<p class="info">Aucune facture sur la période.</p>';
  }
  $('fDu').onchange = $('fAu').onchange = afficherFactures;
  $('exportCsv').onclick = () => {
    const n = (x) => String(x).replace('.', ',');
    const lignes = [['Date', 'Heure', 'Patient', 'NIR', 'Cotation', 'Total', 'Taux AMO', 'Part AMO', 'Part patient/AMC']]
      .concat(facturesFiltrees().map((f) => [f.date, f.heure, f.patient, f.nir, f.cotation, n(f.total), f.tauxAMO, n(f.partAMO), n(f.partPatientAMC)]));
    const csv = '﻿' + lignes.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    telecharger(csv, `factures_${$('fDu').value || 'debut'}_${$('fAu').value || 'fin'}.csv`, 'text/csv');
  };

  // ---------- Tarifs ----------
  function afficherTarifs() {
    const d = $('tDate').value || today(), z = db.params.zone;
    $('tableTarifs').innerHTML = `<table><tr><th>Code</th><th class="num">Montant (${z === 'DOM' ? 'DROM' : 'métropole'})</th><th>Période (clé de correction)</th><th>Statut</th></tr>${Object.keys(T.TARIFS).map((c) => {
      const lignes = T.TARIFS[c].filter((l) => l.du <= d); const l = lignes[lignes.length - 1];
      const v = M.valeurTarif(c, d, z, db.params.surcharges);
      return `<tr><td>${c}</td><td class="num">${v.erreur ? '—' : eur(v.montant)}</td><td>${l ? `${c}|${z}|${l.du}` : ''}</td><td>${v.erreur ? `<span class="erreur">${esc(v.erreur)}</span>` : v.ok ? '<span class="ok">vérifié</span>' : `<span class="alerte">${esc(v.note || 'à vérifier')}</span>`}</td></tr>`;
    }).join('')}</table>`;
    $('tableActes').innerHTML = `<table><tr><th>Acte</th><th>Cotation</th><th>Validité</th><th>Cumul</th><th>Statut</th></tr>${N.ACTES.map((a) => `<tr><td>${esc(a.libelle)}</td><td>${a.lettre} ${String(a.coef).replace('.', ',')}</td>
      <td>${a.du ? 'dès ' + a.du : ''} ${a.au ? "jusqu'au " + a.au : ''}</td><td>${a.tauxPlein || a.forfait ? 'taux plein' : 'art. 11B'}</td><td>${a.verifie === false ? '⚠ à contrôler' : '<span class="ok">✓</span>'}</td></tr>`).join('')}</table>`;
  }
  $('tDate').onchange = afficherTarifs;

  // ---------- Paramètres ----------
  function afficherParams() {
    $('sNom').value = db.params.nom || ''; $('sRpps').value = db.params.rpps || ''; $('sZone').value = db.params.zone; $('sAlsace').checked = !!db.params.alsaceMoselle;
    $('listeSurcharges').innerHTML = Object.entries(db.params.surcharges).map(([k, v]) => `<li>${esc(k)} = ${eur(Number(v))}<button type="button" data-k="${esc(k)}">×</button></li>`).join('');
    $('listeSurcharges').querySelectorAll('button').forEach((b) => b.onclick = () => { delete db.params.surcharges[b.dataset.k]; save(); afficherParams(); });
  }
  $('ajoutSurcharge').onclick = () => {
    const k = $('sCle').value.trim().toUpperCase().replace(/\|(\d)/, '|$1'); const v = Number($('sVal').value);
    const m = /^([A-Z_]+)\|(METRO|DOM)\|(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (!m || !T.TARIFS[m[1]] || !T.TARIFS[m[1]].some((l) => l.du === m[3])) { alert('Clé invalide : copiez-la depuis l\'onglet Tarifs.'); return; }
    if (!(v > 0)) { alert('Montant invalide.'); return; }
    db.params.surcharges[k] = v; save(); $('sCle').value = ''; $('sVal').value = ''; afficherParams();
  };
  $('formParam').onsubmit = (e) => {
    e.preventDefault();
    Object.assign(db.params, { nom: $('sNom').value.trim(), rpps: $('sRpps').value.trim(), zone: $('sZone').value, alsaceMoselle: $('sAlsace').checked });
    save(); alert('Paramètres enregistrés.'); rafraichir();
  };
  function telecharger(contenu, nom, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenu], { type })); a.download = nom; a.click(); URL.revokeObjectURL(a.href);
  }
  $('sauvegarder').onclick = () => telecharger(JSON.stringify(db, null, 2), `sauvegarde_idel_${today()}.json`, 'application/json');
  $('restaurer').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.patients) || !Array.isArray(d.visites)) throw new Error();
      if (confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) { db = { ...structuredClone(vide), ...d }; save(); rafraichir(); }
    } catch { alert('Fichier de sauvegarde invalide.'); }
  };

  // ---------- Rafraîchissement ----------
  function rafraichir() {
    const sel = $('vPatient').value;
    $('vPatient').innerHTML = '<option value="">— choisir —</option>' + [...db.patients].sort((a, b) => nomPatient(a).localeCompare(nomPatient(b))).map((p) => `<option value="${p.id}">${esc(nomPatient(p))}</option>`).join('');
    $('vPatient').value = sel;
    remplirSelectActes(); afficherJournee(); afficherPatients(); afficherFactures(); afficherTarifs(); afficherParams(); apercu();
  }
  $('dateTournee').value = today(); $('tDate').value = today();
  $('dateTournee').onchange = () => { actesEnCours = []; afficherActesEnCours(); rafraichir(); };
  rafraichir();
})();
