/*
 * CATALOGUE DES ACTES (NGAP – Titre XVI, actes infirmiers les plus courants)
 * ------------------------------------------------------------------------------------------------
 *   lettre      : AMI (devient automatiquement AMX si le patient est au forfait BSI), DI, BSA...
 *   coef        : coefficient NGAP
 *   du / au     : période de validité de l'acte (le programme refuse un acte hors période)
 *   tauxPlein   : true = cumul à taux plein par dérogation à l'article 11B (jamais décoté)
 *   forfait     : true = forfait journalier (1 par jour et par patient maximum)
 *   verifie     : false = coefficient à contrôler sur la NGAP en vigueur (alerte affichée)
 *
 * Toujours contrôler avec la NGAP officielle :
 *   https://www.ameli.fr/infirmier/exercice-liberal/facturation-remuneration/nomenclatures-codage/ngap
 * Vous pouvez ajouter/modifier des actes ici, ou utiliser « Acte libre » dans l'application.
 */
(function (root) {
  const ACTES = [
    // --- Injections & prélèvements ---
    { id: 'INJ_IM',  libelle: 'Injection intramusculaire', lettre: 'AMI', coef: 1, verifie: true },
    { id: 'INJ_SC',  libelle: 'Injection sous-cutanée', lettre: 'AMI', coef: 1, verifie: true },
    { id: 'INJ_ID',  libelle: 'Injection intradermique', lettre: 'AMI', coef: 1, verifie: true },
    { id: 'INJ_INS', libelle: "Injection d'insuline", lettre: 'AMI', coef: 1, verifie: true },
    { id: 'INJ_IVD', libelle: 'Injection intraveineuse directe isolée', lettre: 'AMI', coef: 2, verifie: true },
    { id: 'INJ_IVS', libelle: 'Injection intraveineuse directe en série', lettre: 'AMI', coef: 1.5, verifie: true },
    { id: 'PREL_V',  libelle: 'Prélèvement par ponction veineuse directe', lettre: 'AMI', coef: 1.5, verifie: true },
    { id: 'PREL_C',  libelle: 'Prélèvement sanguin capillaire', lettre: 'AMI', coef: 1, verifie: false },
    { id: 'SURV_DIAB', libelle: 'Surveillance et observation patient diabétique insulino-traité (glycémie)', lettre: 'AMI', coef: 1, verifie: true },

    // --- Pansements ---
    { id: 'PST_SIMPLE_OLD', libelle: 'Pansement (autre que lourd et complexe)', lettre: 'AMI', coef: 2, au: '2026-06-20', verifie: true },
    { id: 'PST_SIMPLE',     libelle: 'Pansement (autre que lourd et complexe) – depuis 21/06/2026', lettre: 'AMI', coef: 2.02, du: '2026-06-21', verifie: false,
      note: 'Décision UNCAM du 2/06/2026 : AMI 2 → AMI 2,02. Contrôler le libellé exact de l\'acte sur la NGAP.' },
    { id: 'PST_LOURD', libelle: 'Pansement lourd et complexe (+ MCI possible)', lettre: 'AMI', coef: 4, verifie: true },
    { id: 'ANALG_TOP', libelle: 'Analgésie topique préalable à un pansement', lettre: 'AMI', coef: 1.1, verifie: true },
    { id: 'ABL_FILS_10', libelle: 'Ablation de fils ou agrafes (≤ 10)', lettre: 'AMI', coef: 2, verifie: false },
    { id: 'ABL_FILS_P10', libelle: 'Ablation de fils ou agrafes (> 10)', lettre: 'AMI', coef: 4, verifie: false },

    // --- Perfusions (stades cumulables à taux plein – dérogation art. 11B) ---
    { id: 'PERF_COURTE', libelle: 'Perfusion courte ≤ 1 h sous surveillance continue', lettre: 'AMI', coef: 9, tauxPlein: true, verifie: true },
    { id: 'PERF_COURTE_IMMU', libelle: 'Perfusion courte ≤ 1 h – patient immunodéprimé ou cancéreux', lettre: 'AMI', coef: 10, tauxPlein: true, verifie: true },
    { id: 'PERF_LONGUE', libelle: 'Forfait perfusion > 1 h (organisation surveillance)', lettre: 'AMI', coef: 14, tauxPlein: true, verifie: true },
    { id: 'PERF_LONGUE_IMMU', libelle: 'Forfait perfusion > 1 h – patient immunodéprimé ou cancéreux', lettre: 'AMI', coef: 15, tauxPlein: true, verifie: true },
    { id: 'PERF_FLACON', libelle: 'Changement de flacon / branchement en Y (perfusion)', lettre: 'AMI', coef: 4.1, tauxPlein: true, verifie: true },
    { id: 'PERF_RETRAIT', libelle: 'Arrêt et retrait du dispositif de perfusion > 24 h', lettre: 'AMI', coef: 5, tauxPlein: true, verifie: true },

    // --- Thérapeutique orale ---
    { id: 'PILULIER', libelle: 'Administration et surveillance d\'une thérapeutique orale (troubles psy/cognitifs/neuro/sensoriels/moteurs)', lettre: 'AMI', coef: 1.2, verifie: false,
      note: 'Champ élargi aux troubles neurologiques, sensoriels et moteurs depuis le 21/06/2026.' },

    // --- Soins de nursing (AIS) – SUPPRIMÉS au 21/06/2026 ---
    { id: 'AIS3', libelle: 'Séance de soins infirmiers (AIS 3)', lettre: 'AIS', coef: 3, au: '2026-06-20', verifie: true },

    // --- Bilan de soins infirmiers & forfaits BSI ---
    { id: 'BSI_INIT', libelle: 'Bilan de soins infirmiers initial', lettre: 'DI', coef: 2.5, tauxPlein: true, verifie: false },
    { id: 'BSI_RENOUV', libelle: 'Bilan de soins infirmiers – renouvellement', lettre: 'DI', coef: 1.2, tauxPlein: true, verifie: false },
    { id: 'BSA', libelle: 'Forfait BSI dépendance légère (journalier)', lettre: 'BSA', coef: 1, tauxPlein: true, forfait: true, verifie: true },
    { id: 'BSB', libelle: 'Forfait BSI dépendance intermédiaire (journalier)', lettre: 'BSB', coef: 1, tauxPlein: true, forfait: true, verifie: true },
    { id: 'BSC', libelle: 'Forfait BSI dépendance lourde (journalier)', lettre: 'BSC', coef: 1, tauxPlein: true, forfait: true, verifie: true },
  ];

  const api = { ACTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IDEL_NOMENCLATURE = api;
})(this);
