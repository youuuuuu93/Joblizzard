# Facturation IDEL – aide au calcul des cotations pour infirmier(e) libéral(e)

Application **hors ligne** : ouvrez simplement `index.html` dans Chrome, Edge ou Firefox.
Aucune installation n'est nécessaire et aucune donnée ne quitte l'ordinateur. Les données sont enregistrées dans le navigateur ; pensez à **Paramètres → Télécharger une sauvegarde**.

## Ce que fait le programme
- **Tarifs datés** : la valeur de chaque lettre-clé est choisie selon la **date du soin**. Par exemple, l'AMI vaut 3,15 € jusqu'au 05/11/2026, puis 3,35 € à partir du 06/11/2026 (avenant 11). Les tarifs DROM/Mayotte sont gérés.
- **Article 11B** : l'acte au plus fort coefficient est compté à 100 %, le 2e à 50 %, les suivants à 0. Font exception les actes « taux plein » (perfusions, forfaits BSI, DI).
- **AMI → AMX** automatiquement pour un patient au forfait BSI. Un seul forfait BSA/BSB/BSC est accepté par jour et par patient, et il doit correspondre au niveau du patient.
- **AIS** refusée à partir du 21/06/2026 (suppression). **Pansement** : AMI 2 jusqu'au 20/06/2026, puis AMI 2,02.
- **Majorations** :
  - MAU : acte unique AMI/AMX de coefficient ≤ 1,5.
  - MCI.
  - Nuit 20h-23h / 5h-8h (9,15 €) et 23h-5h (18,30 €), **uniquement si la prescription le précise**.
  - Dimanche et jours fériés (8,50 €). Les jours fériés sont calculés automatiquement, y compris Pâques, l'Ascension, la Pentecôte et, en option, Alsace-Moselle. Quand une majoration de nuit et une majoration de dimanche tombent ensemble, la plus élevée est retenue.
- **Déplacements** :
  - IFD à chaque passage au domicile.
  - IK si le patient habite hors agglomération. On retire 2 km (plaine) ou 1 km (montagne) de la distance aller-retour.
  - Plafonnement journalier des IK : -50 % du 300e au 399e km, -100 % au-delà de 400 km.
  - Ni IFD ni IK au cabinet, ni pour un 2e patient au même domicile.
- **Contrôles** :
  - Les **erreurs** (rouge) bloquent la validation : tarif inconnu, acte hors période, heure manquante, BSI incohérent, etc.
  - Les **alertes** (orange) doivent être confirmées avant de valider.
  - La clé du numéro de sécurité sociale (NIR) est vérifiée.
- Factures avec part AMO (60 % ou 100 %) et part patient/complémentaire, **export CSV** pour Excel, impression.

## Limites importantes
- Ce n'est **pas** un logiciel de télétransmission agréé SESAM-Vitale : il ne crée pas de feuilles de soins électroniques (FSE). Il sert à calculer et contrôler les cotations, et à suivre votre chiffre d'affaires.
- La NGAP comporte beaucoup de cas particuliers. Le catalogue (`nomenclature.js`) couvre les actes courants. Les coefficients marqués ⚠ doivent être contrôlés sur la NGAP officielle. Pour les autres actes, utilisez « Acte libre ».
- Certaines valeurs sont signalées « à confirmer » : DROM depuis l'avenant 11, IK à pied/ski, AMI au 01/11/2027. Corrigez-les dans **Paramètres → Corriger un tarif** après vérification sur [ameli.fr](https://www.ameli.fr/infirmier/exercice-liberal/facturation-remuneration/tarifs-conventionnels/tarifs).

## Mettre à jour les tarifs
Ajoutez une ligne datée dans `tarifs.js`, par exemple `{ du: '2027-11-01', metro: 3.45, dom: 3.62, ok: true }`. Les soins antérieurs gardent l'ancien tarif.

## Tests
`node --test tests/*.test.js` lance 14 scénarios de calcul vérifiés.
