/*
 * MOTEUR DE CALCUL DE LA FACTURATION IDEL
 * Règles appliquées :
 *  - Valeur des lettres-clés selon la DATE du soin et la ZONE (métropole / DROM).
 *  - Article 11B NGAP : acte de plus fort coefficient à 100 %, 2e acte à 50 %, suivants non facturés
 *    (sauf actes « taux plein » dérogatoires : perfusions, forfaits BSI, DI...).
 *  - AMI → AMX automatiquement pour un patient au forfait BSI.
 *  - MAU si un seul acte AMI/AMX de coefficient ≤ 1,5 dans la séance.
 *  - Majorations nuit (sur prescription) / dimanche-férié : non cumulables, la plus élevée est retenue.
 *  - IFD par déplacement au domicile ; IK si hors agglomération, abattement aller-retour + plafonnement journalier.
 * Le moteur ne « devine » jamais : s'il manque une information, il produit une ERREUR bloquante.
 */
(function (root) {
  const T = (typeof module !== 'undefined' && module.exports) ? require('./tarifs.js') : root.IDEL_TARIFS;
  const N = (typeof module !== 'undefined' && module.exports) ? require('./nomenclature.js') : root.IDEL_NOMENCLATURE;

  const arrondi = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const fmtCoef = (c) => String(Math.round(c * 1000) / 1000).replace('.', ',');

  // ---------- Dates & jours fériés ----------
  function paques(annee) { // algorithme de Meeus/Jones/Butcher
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(annee, mois - 1, jour));
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const plusJours = (d, n) => new Date(d.getTime() + n * 86400000);

  function joursFeries(annee, alsaceMoselle) {
    const p = paques(annee);
    const f = {
      [`${annee}-01-01`]: "Jour de l'an", [`${annee}-05-01`]: 'Fête du travail', [`${annee}-05-08`]: 'Victoire 1945',
      [`${annee}-07-14`]: 'Fête nationale', [`${annee}-08-15`]: 'Assomption', [`${annee}-11-01`]: 'Toussaint',
      [`${annee}-11-11`]: 'Armistice', [`${annee}-12-25`]: 'Noël',
      [iso(plusJours(p, 1))]: 'Lundi de Pâques', [iso(plusJours(p, 39))]: 'Ascension', [iso(plusJours(p, 50))]: 'Lundi de Pentecôte',
    };
    if (alsaceMoselle) { f[iso(plusJours(p, -2))] = 'Vendredi saint'; f[`${annee}-12-26`] = 'Saint-Étienne'; }
    return f;
  }

  function parseDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d) ? null : d;
  }

  // ---------- Tarifs ----------
  function valeurTarif(code, date, zone, surcharges) {
    const lignes = (T.TARIFS[code] || []).filter((l) => l.du <= date).sort((a, b) => (a.du < b.du ? -1 : 1));
    const ligne = lignes[lignes.length - 1];
    if (!ligne) return { erreur: `Aucun tarif « ${code} » connu à la date du ${date}.` };
    if (ligne.supprime) return { erreur: `« ${code} » n'existe plus à la date du ${date}. ${ligne.note || ''}`.trim() };
    const cleSurcharge = `${code}|${zone}|${ligne.du}`;
    if (surcharges && surcharges[cleSurcharge] != null && surcharges[cleSurcharge] !== '') {
      return { montant: Number(surcharges[cleSurcharge]), ok: true, note: 'Valeur saisie manuellement dans les paramètres.' };
    }
    const montant = zone === 'DOM' ? ligne.dom : ligne.metro;
    if (montant == null) return { erreur: `Tarif « ${code} » (${zone === 'DOM' ? 'DROM' : 'métropole'}) inconnu au ${date} : saisissez-le dans Paramètres après vérification sur ameli.fr.` };
    return { montant, ok: !!ligne.ok, note: ligne.note };
  }

  function trouverActe(ref) {
    if (ref.libre) return { id: 'LIBRE', libelle: ref.libelle || 'Acte libre', lettre: ref.lettre, coef: Number(ref.coef), tauxPlein: !!ref.tauxPlein, verifie: true, libre: true };
    return N.ACTES.find((a) => a.id === ref.id) || null;
  }

  // ---------- Majoration horaire ----------
  function trancheHoraire(heure) {
    if (!/^\d{2}:\d{2}$/.test(heure || '')) return null;
    const h = Number(heure.slice(0, 2));
    if (h >= 23 || h < 5) return 'NUIT_PROFONDE';
    if (h >= 20 || h < 8) return 'NUIT';
    return 'JOUR';
  }

  // ---------- Calcul d'une visite (hors plafonnement IK journalier) ----------
  function calculerVisite(visite, patient, params) {
    const zone = params.zone === 'DOM' ? 'DOM' : 'METRO';
    const surch = params.surcharges || {};
    const res = { visiteId: visite.id, lignes: [], erreurs: [], alertes: [], total: 0, kmIK: 0, zoneIK: null };
    const err = (m) => res.erreurs.push(m), warn = (m) => { if (!res.alertes.includes(m)) res.alertes.push(m); };

    const d = parseDate(visite.date);
    if (!d) { err('Date du soin invalide.'); return res; }
    if (!patient) { err('Patient introuvable.'); return res; }
    if (!visite.actes || visite.actes.length === 0) { err('Aucun acte saisi.'); return res; }
    if (visite.lieu !== 'DOMICILE' && visite.lieu !== 'CABINET') err('Lieu du soin (domicile/cabinet) non précisé.');

    const tarif = (code) => {
      const t = valeurTarif(code, visite.date, zone, surch);
      if (t.erreur) { err(t.erreur); return null; }
      if (!t.ok) warn(`Tarif ${code} non confirmé (${t.note || 'à vérifier'}).`);
      return t.montant;
    };
    const ajouter = (l) => { l.montant = arrondi(l.montant); res.lignes.push(l); };

    // 1) Actes
    const actes = [];
    visite.actes.forEach((ref) => {
      const a = trouverActe(ref);
      if (!a) { err(`Acte inconnu : ${ref.id}`); return; }
      if (a.libre && (!a.lettre || !(a.coef > 0))) { err('Acte libre : lettre-clé et coefficient obligatoires.'); return; }
      if (a.du && visite.date < a.du) { err(`« ${a.libelle} » n'est applicable qu'à partir du ${a.du}.`); return; }
      if (a.au && visite.date > a.au) { err(`« ${a.libelle} » n'est plus applicable après le ${a.au}.`); return; }
      if (a.verifie === false) warn(`Coefficient de « ${a.libelle} » (${a.lettre} ${fmtCoef(a.coef)}) à contrôler sur la NGAP.${a.note ? ' ' + a.note : ''}`);
      let lettre = a.lettre;
      if (lettre === 'AMI' && patient.bsi) lettre = 'AMX';
      if (a.forfait) {
        if (!patient.bsi) err(`Forfait ${a.lettre} facturé alors que le patient n'a pas de BSI renseigné.`);
        else if (patient.bsi !== a.lettre) err(`Forfait ${a.lettre} incohérent avec le niveau BSI du patient (${patient.bsi}).`);
      }
      actes.push({ ...a, lettre });
    });

    // 2) Article 11B
    const derog = actes.filter((a) => a.tauxPlein || a.forfait);
    const soumis = actes.filter((a) => !(a.tauxPlein || a.forfait)).sort((x, y) => y.coef - x.coef);
    if (derog.length && soumis.length) warn('Séance mêlant actes dérogatoires (taux plein) et actes soumis à l\'article 11B : vérifier les règles de cumul spécifiques.');
    const factures = [];
    soumis.forEach((a, i) => {
      const pct = i === 0 ? 1 : i === 1 ? 0.5 : 0;
      factures.push({ a, pct });
      if (pct === 0) warn(`« ${a.libelle} » : 3e acte ou plus de la séance, non facturable (article 11B).`);
    });
    derog.forEach((a) => factures.push({ a, pct: 1 }));
    factures.forEach(({ a, pct }) => {
      const v = tarif(a.lettre);
      if (v == null) return;
      const coefApplique = a.coef * pct;
      const cot = a.forfait ? a.lettre : `${a.lettre} ${fmtCoef(a.coef)}${pct === 0.5 ? ' (50 %)' : pct === 0 ? ' (0 % – art. 11B)' : ''}`;
      ajouter({ type: 'ACTE', code: a.lettre, libelle: a.libelle, cotation: cot, coef: a.coef, pct, valeur: v, montant: coefApplique * v });
    });
    const actesPayants = factures.filter((f) => f.pct > 0);

    // 3) Majorations
    if (actesPayants.length) {
      const amiAmx = actes.filter((a) => a.lettre === 'AMI' || a.lettre === 'AMX');
      if (actes.length === 1 && amiAmx.length === 1 && amiAmx[0].coef <= 1.5) {
        const v = tarif('MAU'); if (v != null) ajouter({ type: 'MAJ', code: 'MAU', libelle: 'Majoration acte unique', cotation: 'MAU', montant: v });
      }
      if (visite.mci) {
        const v = tarif('MCI'); if (v != null) ajouter({ type: 'MAJ', code: 'MCI', libelle: 'Majoration de coordination infirmière', cotation: 'MCI', montant: v });
        if (!actes.some((a) => a.id === 'PST_LOURD')) warn('MCI : réservée aux soins palliatifs ou pansements lourds et complexes — vérifier l\'éligibilité.');
      }
      // horaires / dimanche
      const feries = joursFeries(d.getUTCFullYear(), params.alsaceMoselle);
      const estDimFerie = d.getUTCDay() === 0 || !!feries[visite.date];
      const tranche = trancheHoraire(visite.heure);
      if (!tranche) err('Heure du passage manquante ou invalide (HH:MM) : nécessaire pour les majorations de nuit.');
      let candidat = null;
      if (tranche && tranche !== 'JOUR') {
        if (visite.prescriptionNuit) candidat = tranche;
        else warn('Passage de nuit sans prescription mentionnant l\'horaire : majoration de nuit NON appliquée.');
      }
      if (estDimFerie) {
        if (candidat) {
          const vn = valeurTarif(candidat, visite.date, zone, surch).montant || 0;
          const vd = valeurTarif('DIMANCHE', visite.date, zone, surch).montant || 0;
          warn('Majorations nuit et dimanche/férié non cumulables : la plus élevée est retenue.');
          if (vd > vn) candidat = 'DIMANCHE';
        } else candidat = 'DIMANCHE';
        if (feries[visite.date]) warn(`Jour férié : ${feries[visite.date]}.`);
      }
      if (candidat) {
        const v = tarif(candidat);
        const lib = { NUIT: 'Majoration de nuit (20h-23h / 5h-8h)', NUIT_PROFONDE: 'Majoration de nuit (23h-5h)', DIMANCHE: 'Majoration dimanche / jour férié' }[candidat];
        const cot = { NUIT: 'NUI', NUIT_PROFONDE: 'NUI (23h-5h)', DIMANCHE: 'F (dim./férié)' }[candidat];
        if (v != null) ajouter({ type: 'MAJ', code: candidat, libelle: lib, cotation: cot, montant: v });
      }
    }

    // 4) Déplacements
    if (visite.lieu === 'DOMICILE' && actesPayants.length) {
      if (visite.memeDeplacement) {
        warn('Plusieurs patients au même domicile : IFD et IK ne sont facturés qu\'une seule fois (sur l\'autre patient).');
      } else {
        const v = tarif('IFD'); if (v != null) ajouter({ type: 'DEP', code: 'IFD', libelle: 'Indemnité forfaitaire de déplacement', cotation: 'IFD', montant: v });
        if (patient.horsAgglo) {
          const zoneIK = patient.zoneIK || 'PLAINE';
          const dist = Number(patient.distanceAR);
          if (!(dist > 0)) err('Patient hors agglomération : distance aller-retour (km) manquante.');
          else {
            const abat = T.REGLES_IK.abattementAllerRetour[zoneIK];
            if (abat == null) err(`Zone IK inconnue : ${zoneIK}`);
            else {
              res.kmIK = Math.max(0, Math.round((dist - abat) * 10) / 10);
              res.zoneIK = zoneIK;
              warn('IK : calculées depuis le cabinet de l\'infirmier(e) le/la plus proche du domicile du patient.');
            }
          }
        }
      }
    }
    return res;
  }

  // ---------- Calcul d'une journée (applique le plafonnement IK) ----------
  function calculerJournee(visites, patients, params) {
    const tri = [...visites].sort((a, b) => ((a.date || '') + (a.heure || '')).localeCompare((b.date || '') + (b.heure || '')));
    const cumulParJour = {}; let cumulKm = 0; let jourCourant = null;
    const paliers = [...T.REGLES_IK.plafonnementJournalier].sort((a, b) => a.aPartirDuKm - b.aPartirDuKm);
    const coefKm = (km) => { let c = 1; paliers.forEach((p) => { if (km >= p.aPartirDuKm) c = 1 - p.abattement; }); return c; };
    const resultats = tri.map((v) => {
      const p = patients.find((x) => x.id === v.patientId);
      const r = calculerVisite(v, p, params);
      if (v.date !== jourCourant) { if (jourCourant) cumulParJour[jourCourant] = cumulKm; jourCourant = v.date; cumulKm = cumulParJour[v.date] || 0; }
      if (r.kmIK > 0 && r.erreurs.length === 0) {
        const code = 'IK_' + r.zoneIK;
        const t = valeurTarif(code, v.date, params.zone === 'DOM' ? 'DOM' : 'METRO', params.surcharges);
        if (t.erreur) r.erreurs.push(t.erreur);
        else {
          if (!t.ok) r.alertes.push(`Tarif ${code} non confirmé (${t.note || 'à vérifier'}).`);
          // ventilation km par km (au dixième) dans les paliers journaliers
          let montant = 0; const pas = 0.1; let reste = Math.round(r.kmIK * 10);
          let reduit = false;
          while (reste > 0) { const c = coefKm(cumulKm); if (c < 1) reduit = true; montant += pas * t.montant * c; cumulKm = Math.round((cumulKm + pas) * 10) / 10; reste--; }
          if (reduit) r.alertes.push(`Plafonnement journalier des IK appliqué (cumul de la journée : ${String(cumulKm).replace('.', ',')} km).`);
          const lib = { PLAINE: 'plaine', MONTAGNE: 'montagne', PIED_SKI: 'à pied / à ski' }[r.zoneIK];
          r.lignes.push({ type: 'DEP', code, libelle: `Indemnités kilométriques (${lib})`, cotation: `IK ${String(r.kmIK).replace('.', ',')}`, valeur: t.montant, montant: arrondi(montant) });
        }
      }
      r.total = arrondi(r.lignes.reduce((s, l) => s + l.montant, 0));
      const taux = p && Number(p.priseEnCharge) ? Number(p.priseEnCharge) : 60;
      r.partAMO = arrondi(r.total * taux / 100);
      r.partPatientAMC = arrondi(r.total - r.partAMO);
      r.cotation = r.lignes.map((l) => l.cotation).join(' + ');
      return r;
    });
    // forfait BSI : un seul par jour et par patient
    const vus = {};
    tri.forEach((v, i) => (v.actes || []).forEach((a) => {
      if (['BSA', 'BSB', 'BSC'].includes(a.id)) {
        const k = `${v.patientId}|${v.date}`;
        if (vus[k]) resultats[i].erreurs.push('Forfait BSI déjà facturé ce jour pour ce patient (1 forfait par jour maximum).');
        vus[k] = true;
      }
    }));
    if (jourCourant) cumulParJour[jourCourant] = cumulKm;
    return { resultats, total: arrondi(resultats.reduce((s, r) => s + r.total, 0)), kmIKParJour: cumulParJour };
  }

  const api = { calculerVisite, calculerJournee, valeurTarif, joursFeries, trancheHoraire, paques, arrondi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IDEL_MOTEUR = api;
})(this);
