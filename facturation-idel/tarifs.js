/*
 * TARIFS CONVENTIONNELS INFIRMIERS LIBÉRAUX (lettres-clés, forfaits, majorations, déplacements)
 * ------------------------------------------------------------------------------------------------
 * Chaque valeur est DATÉE : le programme choisit automatiquement la valeur en vigueur
 * à la date du soin. Pour ajouter une revalorisation, ajoutez une ligne { du: 'AAAA-MM-JJ', ... }.
 *
 *   metro : montant en métropole (€)
 *   dom   : montant DROM / Mayotte (€) — null = inconnu => le programme REFUSE de facturer
 *   ok    : true  = valeur vérifiée (ameli.fr / texte publié au JO)
 *           false = valeur prévisionnelle ou non confirmée => le programme affiche une ALERTE
 *
 * Sources : ameli.fr (tarifs conventionnels infirmiers), avenant 11 approuvé par l'arrêté
 * du 5 mai 2026 (JO du 6 mai 2026), décision UNCAM du 2 juin 2026 (JO du 20 juin 2026).
 * Vérifiez toujours sur : https://www.ameli.fr/infirmier/exercice-liberal/facturation-remuneration/tarifs-conventionnels/tarifs
 */
(function (root) {
  const TARIFS = {
    // ---- Lettres-clés (valeur d'un coefficient 1) ----
    AMI: [
      { du: '2025-01-01', metro: 3.15, dom: 3.30, ok: true },
      { du: '2026-11-06', metro: 3.35, dom: 3.51, ok: true, note: 'Avenant 11 (6 mois après JO du 6/05/2026). Valeur DROM 3,51 € à confirmer sur ameli.' },
      { du: '2027-11-01', metro: 3.45, dom: null, ok: false, note: 'Avenant 11 – 2e étape PRÉVISIONNELLE, à confirmer.' },
    ],
    AMX: [ // actes techniques chez un patient pris en charge au forfait BSI : même valeur que l'AMI
      { du: '2025-01-01', metro: 3.15, dom: 3.30, ok: true },
      { du: '2026-11-06', metro: 3.35, dom: 3.51, ok: true, note: 'Avenant 11.' },
      { du: '2027-11-01', metro: 3.45, dom: null, ok: false, note: 'PRÉVISIONNEL.' },
    ],
    AIS: [ // supprimée le 21/06/2026 (décision UNCAM du 2 juin 2026)
      { du: '2025-01-01', metro: 2.65, dom: 2.70, ok: true },
      { du: '2026-06-21', supprime: true, note: 'AIS supprimée depuis le 21/06/2026 : coter en AMI (ou AMX si patient au BSI).' },
    ],
    DI: [ // bilan de soins infirmiers (BSI) – valeur de la lettre-clé
      { du: '2025-01-01', metro: 10.00, dom: 10.00, ok: true },
    ],

    // ---- Forfaits journaliers BSI (taux plein, jamais décotés) ----
    BSA: [{ du: '2025-01-01', metro: 13.00, dom: 13.25, ok: true }],
    BSB: [{ du: '2025-01-01', metro: 18.20, dom: 18.55, ok: true }],
    BSC: [{ du: '2025-01-01', metro: 28.70, dom: 29.25, ok: true }],

    // ---- Majorations ----
    MAU: [{ du: '2025-01-01', metro: 1.35, dom: 1.35, ok: true }],   // acte unique
    MCI: [{ du: '2025-01-01', metro: 5.00, dom: 5.00, ok: true }],   // coordination infirmière
    NUIT: [{ du: '2025-01-01', metro: 9.15, dom: 9.15, ok: true }],  // 20h-23h et 5h-8h (sur prescription)
    NUIT_PROFONDE: [{ du: '2025-01-01', metro: 18.30, dom: 18.30, ok: true }], // 23h-5h (sur prescription)
    DIMANCHE: [{ du: '2025-01-01', metro: 8.50, dom: 8.50, ok: true }], // dimanche et jours fériés

    // ---- Déplacements ----
    IFD: [{ du: '2025-01-01', metro: 2.75, dom: 2.75, ok: true, note: 'Valeur DROM à confirmer sur ameli.' }],
    IK_PLAINE: [{ du: '2025-01-01', metro: 0.35, dom: 0.35, ok: true, note: 'Valeur DROM à confirmer sur ameli.' }],
    IK_MONTAGNE: [{ du: '2025-01-01', metro: 0.50, dom: 0.50, ok: true, note: 'Valeur DROM à confirmer sur ameli.' }],
    IK_PIED_SKI: [{ du: '2025-01-01', metro: 3.40, dom: 3.40, ok: false, note: 'À vérifier sur ameli.' }],
  };

  // Règles de calcul des déplacements (configurables)
  const REGLES_IK = {
    // abattement (km) déduit de la distance ALLER-RETOUR, selon la zone
    abattementAllerRetour: { PLAINE: 2, MONTAGNE: 1, PIED_SKI: 0 },
    // plafonnement journalier des IK (cumul des km facturés dans la journée)
    plafonnementJournalier: [
      { aPartirDuKm: 300, abattement: 0.5 }, // du 300e au 399e km : -50 %
      { aPartirDuKm: 400, abattement: 1.0 }, // à partir du 400e km : -100 %
    ],
  };

  const api = { TARIFS, REGLES_IK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IDEL_TARIFS = api;
})(this);
