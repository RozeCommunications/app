// ============================================================
// ROZE ASSISTANT — Apps Script v4
// Architecture centralisée : TOUS les prompts sont ici.
// La PWA envoie les paramètres, Apps Script construit le prompt,
// appelle l'IA et retourne le résultat.
//
// Nouveautés v4 :
//   - Prompts LinkedIn et Instagram entièrement différenciés
//   - Post texte LI : pas de séparation post/légende, 3 hashtags intégrés
//   - Carrousels : hooks différenciés LI (insight pro) vs IG (tension/question)
//   - Réel IG : nouveau prompt expert + sortie tableau 4 colonnes
//   - Vidéo LI : sortie tableau (Temps | Visuel/sous-titres | Audio | Émotion)
//   - Stories : 3 types (Vente/Storytelling-Lifestyle/Valeur-Astuce) avec tableau 3 colonnes
//   - Profil_IA : lecture des champs "Mots interdits" et "Emojis de marque"
//   - max_tokens 3000 pour Carrousel, 2500 pour les autres
// ============================================================

// ============================================================
// DÉSINSCRIPTION EMAIL — lien depuis l'email (requête GET)
// ============================================================
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  if (params.action === 'desabonner' && params.email) {
    const email = String(params.email).toLowerCase().trim();
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const acces = ss.getSheetByName("Acces");
    if (acces) {
      const data = acces.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).toLowerCase().trim() === email) {
          acces.getRange(i + 1, 4).setValue('non');
          return HtmlService.createHtmlOutput(
            '<html><head><meta charset="UTF-8"/></head>' +
            '<body style="font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff;">' +
            '<div style="max-width:420px;margin:auto;">' +
            '<div style="font-size:2.5rem;margin-bottom:16px;">🔕</div>' +
            '<h2 style="color:#E8186D;margin-bottom:12px;">Désinscription confirmée</h2>' +
            '<p style="color:#aaa;line-height:1.7;">Tu ne recevras plus le rappel hebdomadaire.<br/>' +
            'Tu peux réactiver l\'email à tout moment depuis<br/><strong style="color:#fff;">Mon Compte → Connexions</strong>.</p>' +
            '</div></body></html>'
          );
        }
      }
    }
    return HtmlService.createHtmlOutput(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#aaa;"><p>Email non trouvé.</p></body></html>'
    );
  }
  return HtmlService.createHtmlOutput('<html><body></body></html>');
}

// ============================================================
// MAJ CONSENTEMENT EMAIL (depuis la PWA)
// ============================================================
function majMailOptin(donnees) {
  const email  = String(donnees.email || '').toLowerCase().trim();
  const optin  = String(donnees.optin || 'oui').toLowerCase().trim();

  if (!email) return reponse({ succes: false, info: 'Email manquant' });

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const acces = ss.getSheetByName("Acces");
  if (!acces) return reponse({ succes: false, info: 'Feuille Acces introuvable' });

  const data = acces.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === email) {
      acces.getRange(i + 1, 4).setValue(optin === 'non' ? 'non' : 'oui');
      return reponse({ succes: true, optin: optin });
    }
  }
  return reponse({ succes: false, info: 'Utilisateur non trouvé' });
}

function doPost(e) {
  // ── PROTECTION GLOBALE : capture TOUTES les exceptions et garantit JSON valide ──
  // Sans ce try/catch, une exception non gérée ferait renvoyer à Apps Script
  // une page HTML d'erreur qui casse le fetch côté PWA avec 'Load failed'
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reponse({ erreur: "Aucune donnée reçue" });
    }

    let donnees;
    try {
      donnees = JSON.parse(e.postData.contents);
    } catch(parseErr) {
      return reponse({ erreur: "Payload JSON invalide : " + parseErr.message });
    }

    const action = donnees.action;

    if (action === "generer_post")        return genererPost(donnees);
    if (action === "generer_semaine")     return genererSemaine(donnees);
    if (action === "enregistrer_semaine") return enregistrerSemaine(donnees);
    if (action === "enregistrer_posts")   return enregistrerPosts(donnees);
    if (action === "maj_post")            return majPost(donnees);
    if (action === "maj_statut_post")     return majStatutPost(donnees);
    if (action === "supprimer_post")      return supprimerPost(donnees);
    if (action === "lire_profil_ia")      return lireProfilIA();
    if (action === "lire_posts")          return lirePostsGeneres(donnees.limite || 200);
    if (action === "maj_mail_optin")      return majMailOptin(donnees);
    if (action === "verifier_acces")      return verifierAcces(donnees.email);
    if (action === "lire_config")         return lireConfig();
    if (action === "sauvegarder_config")  return sauvegarderConfig(donnees.config);
    if (action === "lire_md")             return lireFichierDrive(donnees.lienMd);
    if (action === "importer_photo")      return importerPhoto(donnees);
    if (action === "lire_matiere_recente")  return lireMatiereRecente();
    if (action === "lire_veille_auto")      return lireVeilleAuto();
    if (action === "sauvegarder_veille")    return sauvegarderVeilleAuto(donnees.veille);
    if (action === "maj_memoire")           { const res = majMemoireEvolutive(donnees.matiere, donnees.cle_ia, donnees.ia) || {succes:true}; return reponse(res); }
    if (action === "recherche_actu")       return rechercheActuIA(donnees);

    return reponse({ erreur: "Action inconnue : " + action });
  } catch(err) {
    // Capture toute exception non prévue (ex: appelClaude qui plante, lireProfilIA qui crashe...)
    console.error('doPost exception : ' + err.message + '\n' + err.stack);
    return reponse({ erreur: 'Erreur serveur : ' + err.message });
  }
}

// ============================================================
// MODÈLES IA — CONFIGURATION ET RÉSILIENCE
// ────────────────────────────────────────────────────────────
// Stratégie combinée : fallback hiérarchisé + auto-découverte
// 
// 1. Essai du modèle actif (cache) ou du défaut
// 2. Si erreur "modèle obsolète/inconnu" → essai fallback suivant
// 3. Si tous les fallbacks échouent → appel /v1/models pour découvrir
// 4. Le modèle qui fonctionne est mis en cache (évite re-tentatives)
//
// ⚠️ DERNIÈRE VÉRIFICATION DES MODÈLES : 20 avril 2026
// Vérifier tous les 6-12 mois :
//   • https://docs.claude.com/en/docs/about-claude/model-deprecations
//   • https://ai.google.dev/gemini-api/docs/deprecations
// ============================================================

// Modèles par défaut — prioritaires, budget raisonnable, tier équivalent à ce qu'on utilisait
const MODELES_CLAUDE_FALLBACKS = [
  'claude-sonnet-4-6',           // Sonnet 4.6 — priorité (string court, sans date = toujours valide)
  'claude-sonnet-4-5',           // Sonnet 4.5 — fallback (string court valide)
  'claude-haiku-4-5-20251001',   // Haiku 4.5 — fallback économique (date obligatoire pour Haiku)
  'claude-sonnet-4-20250514'     // Sonnet 4 original (deprecated 15 juin 2026 — dernier recours)
];

const MODELES_GEMINI_FALLBACKS = [
  'gemini-2.5-flash',            // Tier Flash — priorité
  'gemini-2.5-flash-lite',       // Tier Flash-Lite — fallback économique
  'gemini-2.0-flash'             // Original (shutdown 1 juin 2026) — dernier recours
];

// Patterns qui indiquent qu'un modèle est obsolète/inconnu (à détecter dans les messages d'erreur)
function estErreurModeleObsolete(code, texte) {
  if (code === 404) return true; // Modèle introuvable → tenter suivant
  if (code === 400 || code === 403) {
    const t = String(texte || '').toLowerCase();
    // Uniquement si le message mentionne explicitement le modèle comme invalide/retiré
    if (t.indexOf('model') >= 0 && (
      t.indexOf('not found') >= 0 ||
      t.indexOf('does not exist') >= 0 ||
      t.indexOf('deprecated') >= 0 ||
      t.indexOf('retired') >= 0 ||
      t.indexOf('unavailable') >= 0 ||
      t.indexOf('discontinued') >= 0 ||
      t.indexOf('no longer available') >= 0 ||
      t.indexOf('sunset') >= 0 ||
      t.indexOf('end of life') >= 0 ||
      t.indexOf('unknown model') >= 0 ||
      t.indexOf('no such model') >= 0
    )) return true;
    // NE PAS traiter "invalid_request_error" comme obsolète — c'est un 400 générique
    // (ex: prompt trop long, paramètre invalide → remonter l'erreur réelle)
    return false;
  }
  return false;
}

// Cache du modèle actif — stocké dans PropertiesService (persiste entre exécutions AS)
function getModeleActif(fournisseur) {
  try {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty('modele_actif_' + fournisseur) || null;
  } catch(e) { return null; }
}

function setModeleActif(fournisseur, modele) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('modele_actif_' + fournisseur, modele);
  } catch(e) { /* silencieux */ }
}

// Auto-découverte : liste les modèles disponibles via /v1/models (dernier recours)
// Pour Anthropic : renvoie [{id, created_at, ...}], on veut le plus récent dans le tier cible
function decouvrirModelesClaude(cle) {
  try {
    const options = {
      method: 'get',
      headers: {
        'x-api-key': cle,
        'anthropic-version': '2023-06-01'
      },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/models?limit=50', options);
    if (response.getResponseCode() !== 200) return [];
    const data = JSON.parse(response.getContentText());
    if (!data.data || !Array.isArray(data.data)) return [];
    // Filtrer : on veut des modèles Sonnet ou Haiku (évite Opus qui est cher)
    // Trié par date de création (plus récent d'abord — c'est le tri par défaut de l'API)
    return data.data
      .filter(m => m.id && (m.id.indexOf('sonnet') >= 0 || m.id.indexOf('haiku') >= 0))
      .map(m => m.id);
  } catch(e) {
    console.log('Erreur découverte Claude : ' + e.message);
    return [];
  }
}

// Pour Google Gemini : /v1beta/models?key=XXX
function decouvrirModelesGemini(cle) {
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + cle;
    const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return [];
    const data = JSON.parse(response.getContentText());
    if (!data.models || !Array.isArray(data.models)) return [];
    // Filtrer : on veut des modèles Flash (évite Pro qui est cher) qui supportent generateContent
    return data.models
      .filter(m => m.name && m.name.indexOf('flash') >= 0)
      .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.indexOf('generateContent') >= 0)
      .map(m => m.name.replace(/^models\//, ''));
  } catch(e) {
    console.log('Erreur découverte Gemini : ' + e.message);
    return [];
  }
}

// ============================================================
// PROFIL — Lire depuis Profil_IA (Zone 1 + Zone 2 mémoire)
// Inclut les nouveaux champs : Mots interdits, Emojis de marque
// ============================================================
function lireProfilIA() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Profil_IA");
  if (!sheet) return reponse({ erreur: "Onglet Profil_IA introuvable" });

  const donnees = sheet.getDataRange().getValues();
  let zone1 = [];
  let zone2 = {};
  let motInterdits = '';
  let emojisMarque = '';
  let enZone2 = false;

  // Champs spéciaux extraits proprement — pas injectés dans zone1 brute
  const CHAMPS_SPECIAUX = [
    'Mots interdits', 'Emojis de marque', 'Catégorie métier', 'Tronc',
    'Registre', 'Tonalité', 'Partage personnel', 'Cible client',
    'Mots-clés veille 1', 'Mots-clés veille 2', 'Mots-clés veille 3',
    'Expressions de marque'
  ];
  const speciaux = {};

  donnees.forEach(row => {
    const label  = String(row[0] || '').trim();
    const valeur = String(row[1] || '').trim();
    if (label.includes('ZONE 2')) { enZone2 = true; return; }
    if (label.startsWith('▌') || label.startsWith('ℹ️') || label.startsWith('⚠️') || !label) return;

    if (CHAMPS_SPECIAUX.includes(label)) { speciaux[label] = valeur; return; }

    if (!enZone2 && valeur && !valeur.startsWith('←')) zone1.push(label + ' : ' + valeur);
    if (enZone2  && valeur && !valeur.startsWith('←')) zone2[label] = valeur;
  });

  // Rétrocompatibilité clés legacy
  motInterdits = speciaux['Mots interdits']  || '';
  emojisMarque = speciaux['Emojis de marque'] || '';

  return reponse({
    zone1:            zone1.join('\n'),
    zone2:            zone2,
    speciaux:         speciaux,
    mots_interdits:   motInterdits,
    emojis_marque:    emojisMarque,
    profil_complet:   construireContexteIA(zone1, zone2, speciaux)
  });
}

function construireContexteIA(zone1Lignes, zone2, speciaux) {
  const s = speciaux || {};
  const motInterdits = s['Mots interdits']  || '';
  const emojisMarque = s['Emojis de marque'] || '';
  const registre     = s['Registre']         || 'tutoiement';
  const tonalite     = s['Tonalité']          || '';
  const partage      = s['Partage personnel'] || '';
  const cible        = s['Cible client']      || '';
  const exprMarque   = s['Expressions de marque'] || '';
  const tronc        = s['Tronc']             || '';

  let ctx = "=== PROFIL DU PROFESSIONNEL ===\n";
  ctx += zone1Lignes.join('\n');

  // Bloc ton — injecté en priorité haute, avant la matière
  ctx += "\n\n=== TON ET VOIX — RÈGLE ABSOLUE ===\n";
  ctx += "Registre : " + (registre === 'vouvoiement' ? 'VOUVOIEMENT strict dans tous les posts' : 'TUTOIEMENT dans tous les posts') + "\n";
  if (tonalite)  ctx += "Tonalité : " + tonalite + "\n";
  if (partage)   ctx += "Niveau de partage personnel : " + partage + "\n";
  if (exprMarque) ctx += "Expressions propres à ce professionnel (à réutiliser naturellement) : " + exprMarque + "\n";
  if (motInterdits) ctx += "Mots et formules à ÉVITER absolument : " + motInterdits + "\n";
  ctx += "RÈGLE : chaque post respecte ce ton sans exception. Jamais de registre opposé.\n";

  // Cible client
  if (cible) {
    ctx += "\n=== CIBLE CLIENT ===\n" + cible + "\n";
  }

  // Tronc éditorial
  if (tronc) {
    ctx += "\n=== TYPE D'ACTIVITÉ ===\n";
    if (tronc === 'produit') {
      ctx += "Vendeur de produits physiques. Le produit peut apparaître naturellement dans les contenus sans forcer la vente.\n";
      ctx += "Les stories peuvent mettre en scène le produit en arrière-plan. La promotion directe est possible ponctuellement.\n";
    } else if (tronc === 'service') {
      ctx += "Prestataire de service. Le service ne se montre pas — c'est la personne, ses valeurs et sa vision qui créent la confiance.\n";
      ctx += "Jamais de promotion quotidienne du service. Les stories parlent du quotidien pro, des valeurs, de la vision.\n";
    } else {
      ctx += "Activité mixte (produits et services). Adapter selon le contenu de la semaine.\n";
    }
  }

  // Synthèse évolutive (texte libre — vue d'ensemble)
  if (zone2['Synthèse évolutive']) {
    ctx += "\n=== CE QUE L'IA A APPRIS SUR CE PROFESSIONNEL (mémoire évolutive) ===\n";
    ctx += zone2['Synthèse évolutive'];
  }

  // Pools structurés — alimentés par les réponses hebdomadaires
  // Ces éléments doivent ancrer le post dans du réel, pas du générique
  const poolsSections = [
    { label: 'Douleurs clients détectées', titre: 'DOULEURS/FREINS entendus chez sa cible', key: 'Douleurs clients détectées' },
    { label: 'Objections fréquentes',      titre: 'OBJECTIONS de prospects',                key: 'Objections fréquentes' },
    { label: 'Résultats clients',          titre: 'RÉSULTATS obtenus par ses clients',      key: 'Résultats clients' },
    { label: 'Thèmes récurrents',          titre: 'THÈMES qui reviennent dans son activité', key: 'Thèmes récurrents' },
    { label: 'Ce qui résonne',             titre: 'FORMULATIONS qui fonctionnent',          key: 'Ce qui résonne' }
  ];

  const poolsRemplis = poolsSections.filter(p => zone2[p.key] && String(zone2[p.key]).trim().length > 0);
  if (poolsRemplis.length > 0) {
    ctx += "\n\n=== CE QUE SA CIBLE VIT RÉELLEMENT (issu de ses retours hebdomadaires) ===\n";
    poolsRemplis.forEach(p => {
      ctx += "\n" + p.titre + " :\n" + zone2[p.key] + "\n";
    });
    ctx += "\n→ Utilise ces éléments pour ancrer le post dans du concret. Évite les formulations génériques quand tu as des éléments réels à portée.\n";
  }

  // ── RÈGLE ANTI-META IA — UNIVERSELLE ──
  // Empêche l'IA de structurer sa réponse avec des sections comme "**Texte du post**", "**Hook**", etc.
  // Ces meta-labels se retrouvent sinon dans le texte final et polluent l'affichage
  ctx += "\n\n=== FORMAT DE RÉPONSE — RÈGLE ABSOLUE ===\n";
  ctx += "Ta réponse est le CONTENU LUI-MÊME, jamais une structuration commentée de ce contenu.\n";
  ctx += "INTERDIT ABSOLU — ne jamais écrire dans ta réponse :\n";
  ctx += "  • Des labels de section en gras : **Texte du post**, **Hook**, **Corps**, **CTA**, **Introduction**, **Conclusion**, **Partie 1**, **Slide 2**, **Légende**\n";
  ctx += "  • Des préambules : 'Voici', 'Ok', 'Parfait', 'Voilà', 'Je te propose', 'Bien sûr'\n";
  ctx += "  • Des titres Markdown (# ## ###) pour annoncer des sections\n";
  ctx += "  • Des phrases qui décrivent ce que tu vas faire ou que tu as fait\n";
  ctx += "RÈGLE : le post commence DIRECTEMENT par le hook/contenu. Aucun préambule. Aucune structuration meta.\n";
  ctx += "Si le format demande plusieurs sections (carrousel JSON, script vidéo tableau), respecte UNIQUEMENT la structure demandée.\n\n";

  // Vocabulaire interdit
  if (motInterdits) {
    ctx += "\n\n=== VOCABULAIRE INTERDIT — RÈGLE ABSOLUE ===\n";
    ctx += "N'utilise JAMAIS ces mots ou expressions :\n" + motInterdits + "\n";
    ctx += "Reformule avec un synonyme ou une périphrase si nécessaire.\n";
  }

  // Emojis de marque
  if (emojisMarque) {
    ctx += "\n=== EMOJIS DE MARQUE ===\n";
    ctx += "Emojis autorisés (liste exclusive) : " + emojisMarque + "\n";
    ctx += "Parcimonie : 1 à 2 max par légende. Placement : fin du hook ou début de puce IG uniquement.\n";
    ctx += "INTERDIT ailleurs dans le texte.\n";
  }

  return ctx;
}

// ============================================================
// GÉNÉRATION — 1 post
// ============================================================
function genererPost(donnees) {
  try {
  const cle_ia         = donnees.cle_ia;
  const ia             = donnees.ia || 'claude';
  const reseau         = donnees.reseau  || 'LinkedIn';
  const format         = donnees.format  || 'Post texte';
  const pilier         = donnees.pilier  || 'autorite';
  const sujet          = donnees.sujet   || '';
  const matiere        = donnees.matiere || '';
  const actu_manuel    = donnees.actu    || '';

  // Si pas d'actu fournie par la PWA, chercher dans Veille_Auto (Reddit)
  // On prend le résultat le plus récent non encore utilisé
  let actu = actu_manuel;
  if (!actu && (format === 'Post texte' || format === 'Photo' || format === 'Carrousel')) {
    try {
      const veilleData = lireVeilleAuto();
      if (veilleData && veilleData.getContent) {
        const vObj = JSON.parse(veilleData.getContent());
        const veille = vObj.veille || [];
        // Prendre la veille la plus récente non utilisée
        const recente = veille.reverse().find(v => v.utilise !== 'oui' && v.resultat && v.resultat.length > 10);
        if (recente) {
          actu = recente.resultat;
          // Marquer comme utilisée (best-effort, pas bloquant)
          try { marquerVeilleUtilisee(recente.requete, recente.date); } catch(e) { /* ignore */ }
        }
      }
    } catch(e) {
      console.log('Lecture veille auto échouée : ' + e.message);
    }
  }
  const antiRedondance = donnees.anti_redondance || '';

  if (!cle_ia) return reponse({ erreur: 'Clé API manquante. Configure-la dans Mon Compte > Connexions.' });

  const profilData = lireProfilIA();
  const profilObj  = JSON.parse(profilData.getContent());

  // Enrichir le profil avec les paramètres de personnalisation envoyés par la PWA
  const speciaux = profilObj.speciaux || {};
  if(donnees.cat_metier)   speciaux['Catégorie métier']    = donnees.cat_metier;
  if(donnees.tronc)        speciaux['Tronc']               = donnees.tronc;
  if(donnees.registre)     speciaux['Registre']            = donnees.registre;
  if(donnees.tonalite)     speciaux['Tonalité']             = donnees.tonalite;
  if(donnees.partage)      speciaux['Partage personnel']   = donnees.partage;
  if(donnees.cible)        speciaux['Cible client']        = donnees.cible;
  if(donnees.expr_marque)  speciaux['Expressions de marque'] = donnees.expr_marque;
  if(donnees.mots_interdits) speciaux['Mots interdits']      = donnees.mots_interdits;

  const profil = construireContexteIA(
    (profilObj.zone1 || '').split('\n'),
    profilObj.zone2  || {},
    speciaux
  );

  const maxTokens = format === 'Carrousel' ? 16384 : (format === 'Réel' || format === 'Vidéo') ? 4096 : format === 'Stories' ? 4096 : 4096;

  // Sélection de la figure narrative (Post texte, Photo, et Carrousel — pas pour Réel/Vidéo/Stories)
  let figureUtilisee = null;
  let figureCarrousel = null; // pour injection dans prompt carrousel
  let prompt;
  const figuresRecentes = (donnees.figures_recentes || '') + ',' + (profilObj.zone2 && profilObj.zone2['Figures récentes'] ? profilObj.zone2['Figures récentes'] : '');

  if (format === 'Post texte' || format === 'Photo') {
    const rappelSujet = sujet ? `\n\n— RAPPEL SUJET PRIORITAIRE : ${sujet} — Ce sujet doit rester au centre du post.` : '';
    const figure = selectionnerFigure(pilier, matiere, sujet, donnees.figure_forcee || '', figuresRecentes);
    const figurePrompt = construireFigurePrompt(figure, reseau, pilier, profil, matiere, sujet, rappelSujet, antiRedondance);
    if (figurePrompt) {
      prompt = figurePrompt;
      figureUtilisee = figure;
    }
  } else if (format === 'Carrousel') {
    // Pour le carrousel : on sélectionne aussi une figure mais on l'injecte comme directive narrative
    // dans le prompt carrousel (qui garde sa structure JSON 5-12 slides)
    figureCarrousel = selectionnerFigure(pilier, matiere, sujet, donnees.figure_forcee || '', figuresRecentes);
    figureUtilisee = figureCarrousel;
  }

  // Fallback : prompt classique si pas de figure applicable
  if (!prompt) {
    prompt = construirePrompt(
      reseau, format, pilier, profil, matiere,
      sujet, donnees.story_type || '', actu,
      donnees.stats_eviter || '', antiRedondance,
      figureCarrousel
    );
  }

  let texte = '';
  if (ia === 'gemini') texte = appelGemini(cle_ia, prompt, maxTokens);
  else                 texte = appelClaude(cle_ia, prompt, maxTokens);

  return reponse({
    texte,
    succes: true,
    figure_code: figureUtilisee ? figureUtilisee.code : null,
    figure_nom:  figureUtilisee ? figureUtilisee.nom : null,
    figure_levier: figureUtilisee ? figureUtilisee.levier : null
  });
  } catch(err) {
    console.error('genererPost exception : ' + err.message + '\n' + err.stack);
    return reponse({ erreur: 'Génération échouée : ' + err.message });
  }
}

// ============================================================
// GÉNÉRATION — Semaine complète
// ============================================================
function genererSemaine(donnees) {
  try {
  const cle_ia         = donnees.cle_ia;
  const ia             = donnees.ia || 'claude';
  const posts          = donnees.posts || [];
  const matiere        = donnees.matiere || '';
  const antiRedondance = donnees.anti_redondance || '';

  if (!cle_ia) return reponse({ erreur: 'Clé API manquante. Configure-la dans Mon Compte > Connexions.' });

  const profilData = lireProfilIA();
  const profilObj  = JSON.parse(profilData.getContent());

  const speciaux = profilObj.speciaux || {};
  if(donnees.cat_metier)   speciaux['Catégorie métier']    = donnees.cat_metier;
  if(donnees.tronc)        speciaux['Tronc']               = donnees.tronc;
  if(donnees.registre)     speciaux['Registre']            = donnees.registre;
  if(donnees.tonalite)     speciaux['Tonalité']             = donnees.tonalite;
  if(donnees.partage)      speciaux['Partage personnel']   = donnees.partage;
  if(donnees.cible)        speciaux['Cible client']        = donnees.cible;
  if(donnees.expr_marque)  speciaux['Expressions de marque'] = donnees.expr_marque;

  const profil = construireContexteIA(
    (profilObj.zone1 || '').split('\n'),
    profilObj.zone2  || {},
    speciaux
  );

  const resultats = [];
  for (const p of posts) {
    const maxTokens = p.typeContenu === 'Carrousel' ? 8192 : (p.typeContenu === 'Réel' || p.typeContenu === 'Vidéo') ? 4096 : 4096; // Tous les autres formats : 3500
    const prompt = construirePrompt(
      p.reseau, p.typeContenu, p.pilier || 'autorite',
      profil, matiere, '', '', '', '', antiRedondance
    );
    let texte = '';
    try {
      if (ia === 'gemini') texte = appelGemini(cle_ia, prompt, maxTokens);
      else                 texte = appelClaude(cle_ia, prompt, maxTokens);
    } catch(e) {
      texte = "Erreur génération : " + e.message;
    }
    resultats.push({ reseau: p.reseau, typeContenu: p.typeContenu, pilier: p.pilier, date: p.date || '', texte });
  }
  return reponse({ resultats, succes: true });
  } catch(err) {
    console.error('genererSemaine exception : ' + err.message + '\n' + err.stack);
    return reponse({ erreur: 'Génération semaine échouée : ' + err.message });
  }
}

// ============================================================
// CATÉGORIE MÉTIER — fonction centrale unique
// Priorité : champ explicite (speciaux['Catégorie métier']) > détection par mots-clés
// ============================================================
function getCategorieMetier(profil, categorieExplicite) {
  // Priorité au choix explicite de l'utilisateur dans Mon Compte (18 sous-catégories possibles)
  const VALID_CATS = ['artisan','metierdart','agriculture','commercant','boutique',
                      'soin','praticien','sport','consultant','patrimoine','immobilier',
                      'reglementee','creatif','digital','createur','formateur',
                      'eventiel','transport','persoServ','independant'];
  if (categorieExplicite && VALID_CATS.indexOf(categorieExplicite) >= 0) {
    return categorieExplicite;
  }
  const p = (profil || '').toLowerCase();

  // ── MÉTIERS MANUELS & ARTISANAT ──
  if (/agriculteur|maraîcher|apiculteur|éleveur|paysan|pêcheur|aquaculteur|viticulteur|brasseur artisanal|amap|circuit court|fermier|terroir/.test(p)) return 'agriculture';
  if (/céramiste|verrier|tapissier|restaurateur de meubles|sculpteur|potier|ferronnier|ébéniste|graveur|émailleur|encadreur|doreur|relieur|horloger|cordonnier|maroquinier|créateur (de bijoux|d'objets)|bijoutier(\s|-)cr/.test(p)) return 'metierdart';
  if (/artisan|menuisier|plombier|électricien|maçon|charpentier|carreleur|vitrier|serrurier|couvreur|plâtrier|façadier|cuisiniste|paysagiste|jardinier|élagueur|peintre en bâtiment|chauffagiste|domoticien/.test(p)) return 'artisan';

  // ── COMMERCE & VENTE ──
  if (/boulang|pâtissi|boucher|charcuti|fromag|caviste|torréfacteur|chocolati|confiseur|glacier|traiteur|épiceri|primeur|crémier|poissonn|brasserie/.test(p)) return 'commercant';
  if (/boutique|magasin|friperie|concept store|prêt-à-porter|vêtement|chaussures|maroquinerie|accessoires|bijouterie(?!.*créat)|mode|déco|décoration|librairie|disquaire|jouets|antiquaire|brocanteur/.test(p)) return 'boutique';

  // ── BIEN-ÊTRE, SANTÉ & SPORT ──
  if (/coach sportif|prof.*yoga|prof.*pilates|préparateur physique|fitness|musculation|crossfit|coach.*course|running|coach.*sportive|personal trainer|coach.*forme/.test(p)) return 'sport';
  if (/sophro|naturo|ostéo|kinési(?!ologue)|hypno|réflexo|magnétis|énergétici|nutritionni|diététici|acupunct|pédicure|podologue|thérapeute|psycho(?:logue|thérapeute)|chiropract/.test(p)) return 'praticien';
  if (/coiffeur|coiffeuse|barbier|esthétici|onglerie|prothésiste ongulaire|tatoueur|massage|spa|bien-être|salon de beauté|maquilleur|maquilleuse/.test(p)) return 'soin';

  // ── CONSEIL, EXPERTISE & FINANCE ──
  if (/agent immobilier|mandataire immobilier|chasseur immobilier|courtier (en|de) crédit|négociateur immobilier|conseil en immobilier(?! patrimoni)/.test(p)) return 'immobilier';
  if (/conseiller (financier|en investissement|patrimoni|en gestion)|gestion de patrimoine|cgp\b|cif\b|cgpi\b|family office|wealth|fiscaliste|notaire|assureur|expert-comptable patrimoni/.test(p)) return 'patrimoine';
  if (/avocat|huissier|vétérinaire|médecin|pharmacien|expert-comptable|commissaire aux comptes|architecte/.test(p)) return 'reglementee';
  if (/consultant|coach (pro|business|d'entreprise|professionnel)|expert|analyste|stratège|auditeur|directeur conseil|advisor/.test(p)) return 'consultant';

  // ── CRÉATION & CONTENU ──
  if (/podcasteur|podcasteuse|streamer|streameur|youtuber|tiktokeur|tiktokeuse|créateur de contenu|créatrice de contenu|influenceur|influenceuse|content creator/.test(p)) return 'createur';
  if (/développeur|développeuse|webdesigner|web designer|community manager|consultant seo|seo|spécialiste réseaux sociaux|social media manager|growth|webmaster|intégrateur|frontend|backend|fullstack/.test(p)) return 'digital';
  if (/photographe|vidéaste|graphiste|illustrateur|illustratrice|designer(?!.*ux)|créatif|créatrice|artiste|musicien|musicienne|comédien|comédienne|rédacteur|rédactrice|copywriter|auteur|autrice|monteur|monteuse vidéo|brand designer|directeur artistique/.test(p)) return 'creatif';

  // ── SERVICES & RELATION ──
  if (/wedding planner|organisateur d'événements|décorateur d'intérieur|décoratrice|home stager|animateur événement|événementiel/.test(p)) return 'eventiel';
  if (/vtc|taxi|chauffeur privé|auto-école|moniteur (auto|moto)|moniteur de plongée|guide (de pêche|nature|touristique)|loueur de véhicules/.test(p)) return 'transport';
  if (/aide.ménagère|garde d'enfants|nounou|baby-sitter|auxiliaire de vie|repasseuse|concierge privé|service à domicile|toiletteur|toiletteuse|pet.sitter|comportementaliste canin|dresseur/.test(p)) return 'persoServ';
  if (/formateur|formatrice|enseignant|enseignante|professeur|prof |pédagogue|prof de musique|prof de langue|coach scolaire|coach certifié(?!.*sport)/.test(p)) return 'formateur';

  return 'independant'; // Fallback ultime
}

// ============================================================
// Anecdote utilisée dans les prompts : vraie (pool Zone 2) ou générique fallback
// ============================================================
function pickAnecdoteVecue() {
  try {
    const data = lireZonePools();
    if (!data || !data.pools['Anecdotes vécues']) return null;
    const pool = data.pools['Anecdotes vécues'];
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  } catch(e) {
    return null;
  }
}

// ============================================================
// CŒUR — Construire le prompt selon format, réseau, pilier
// ============================================================
// ============================================================
// MOTEUR DE FIGURES NARRATIVES
// Architecture : 15 figures réparties sur 4 piliers
// Chaque figure porte un levier psychologique + mécanique narrative précise
// La sélection est automatique mais peut être forcée (pour "Autre figure")
// ============================================================

const FIGURES = {
  expertise: [
    { code: 'E1', nom: 'La preuve par le chiffre',    levier: 'autorité cognitive',       desc: 'Données → interprétation → implication pratique' },
    { code: 'E2', nom: 'Le mythe déconstruit',         levier: 'dissonance cognitive',      desc: 'Croyance répandue → fissure → vérité alternative' },
    { code: 'E3', nom: 'Le tutoriel incarné',           levier: 'apprentissage vicariant',   desc: '"Voilà comment je fais" → étapes concrètes → bénéfice actionnable' },
    { code: 'E4', nom: 'Le cas client raconté',         levier: 'projection-identification', desc: 'Situation → transformation → résultat mesurable' }
  ],
  autorite: [
    { code: 'A1', nom: "L'opinion tranchée",            levier: 'biais de conformité inversé', desc: 'Prise de position claire → argument → invitation au débat' },
    { code: 'A2', nom: 'La coulisse révélatrice',       levier: 'curiosity gap + transparence', desc: "Ce que personne ne montre → ce que ça m'a appris" },
    { code: 'A3', nom: 'La lettre ouverte',              levier: 'empathie directe',         desc: "S'adresser directement à un sous-groupe de la cible" },
    { code: 'A4', nom: 'Le bilan de secteur',            levier: 'expertise contextualisée', desc: "Ce que j'observe dans mon domaine → ce que ça signifie pour toi" }
  ],
  visibilite: [
    { code: 'V1', nom: 'La liste actionnable',           levier: 'utilité perçue + liste',   desc: 'N choses → chaque item = 1 idée autonome avec valeur standalone' },
    { code: 'V2', nom: 'La question miroir',              levier: 'réciprocité + introspection', desc: 'Question qui renvoie le lecteur à sa propre expérience' },
    { code: 'V3', nom: 'Le before/after narratif',        levier: 'espoir + contraste',       desc: 'Situation de départ → moment charnière → résultat' },
    { code: 'V4', nom: 'La tendance réagée',              levier: 'FOMO + positionnement',    desc: 'Phénomène observé → angle personnel → invitation à réagir' }
  ],
  activite: [
    { code: 'Ac1', nom: "La coulisse d'activité",        levier: 'proxémie + confiance',     desc: "Scène de travail → pourquoi → ce que ça dit de mes valeurs" },
    { code: 'Ac2', nom: "L'offre incarnée",               levier: 'désir + identification',   desc: 'Situation client → bénéfice vécu → invitation douce' },
    { code: 'Ac3', nom: 'La promo narrative',              levier: 'urgence réelle + contexte', desc: 'Raison sincère → offre → fenêtre temporelle' }
  ]
};

// Détecte des signaux dans la matière pour orienter la sélection
function detecterSignalMatiere(matiere, sujet) {
  const txt = (matiere + ' ' + sujet).toLowerCase();
  // Signaux pour Expertise
  if (/\d+[\s%]|chiffr|étude|statis|donnée|source|recherch/.test(txt)) return 'E1';
  if (/mythe|faux|croit|réalité|erreur répandue|on pense que/.test(txt)) return 'E2';
  if (/comment faire|pas à pas|étapes?|tutoriel|méthode/.test(txt)) return 'E3';
  if (/client.*résultat|succès|transformation|case study|témoignage/.test(txt)) return 'E4';
  // Signaux pour Autorité
  if (/j'estime|je pense que|mon avis|je suis convaincu|opinion|position/.test(txt)) return 'A1';
  if (/coulisse|aparté|franchement|entre nous|comment je travaille/.test(txt)) return 'A2';
  if (/si tu es|pour ceux qui|pour toi qui|je m'adresse/.test(txt)) return 'A3';
  if (/tendance|secteur|observe|ce que je vois|évolution/.test(txt)) return 'A4';
  // Signaux pour Visibilité
  if (/\d+\s+(?:conseils?|astuces?|raisons?|façons?|manières?|clés?|erreurs?|points?)/.test(txt)) return 'V1';
  if (/\?|question|qu'en penses-tu|comment tu|qu'est-ce qui/.test(txt)) return 'V2';
  if (/avant.*après|changement|évolution|transformation|passé de/.test(txt)) return 'V3';
  if (/actu|news|nouveau|vient de|vient d'|tendance|viral/.test(txt)) return 'V4';
  // Signaux pour Activité
  if (/promo|soldes?|offre spéciale|réduction|jusqu'au|code/.test(txt)) return 'Ac3';
  if (/offre|service|prestation|produit|dispo/.test(txt)) return 'Ac2';
  return null; // Pas de signal détecté
}

// Sélectionne la figure à utiliser
// figureForce : si défini, utiliser cette figure précise (bouton "Autre figure")
// figuresUtilisees : liste des codes utilisés récemment (anti-répétition)
function selectionnerFigure(pilier, matiere, sujet, figureForce, figuresUtilisees) {
  const pool = FIGURES[pilier] || FIGURES['expertise'];

  // Figure forcée (bouton "Autre figure" ou "Regénérer avec même figure")
  if (figureForce) {
    const fig = pool.find(f => f.code === figureForce);
    if (fig) return fig;
  }

  // Sélection automatique
  // 1. Détecter un signal dans la matière
  const signalCode = detecterSignalMatiere(matiere, sujet);
  if (signalCode) {
    const figSignal = pool.find(f => f.code === signalCode);
    // Utiliser le signal seulement si la figure n'a pas été utilisée récemment
    const recentes = (figuresUtilisees || '').split(',').slice(0, 4);
    if (figSignal && !recentes.includes(figSignal.code)) return figSignal;
  }

  // 2. Anti-répétition : éviter les 2 dernières figures du même pilier
  const recentes = (figuresUtilisees || '').split(',').map(c => c.trim()).filter(c => c);
  const candidates = pool.filter(f => !recentes.slice(0, 2).includes(f.code));
  if (candidates.length > 0) {
    // Prendre aléatoirement dans les candidates
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 3. Fallback : première figure du pool
  return pool[0];
}

function construirePrompt(reseau, format, pilier, profil, matiere, sujet, storyType, actu, statsEviter, antiRedondance, figureCarrousel) {

  const base = profil ? profil + "\n\n" : '';

  // Catégorie métier — extraire depuis le profil construit (qui contient le tronc)
  const catMatch = profil.match(/Catégorie métier\s*:\s*(\S+)/);
  const categorieExplicite = catMatch ? catMatch[1] : '';
  const categorieMetier = getCategorieMetier(profil, categorieExplicite);

    // ── CIBLE FINALE du professionnel (ses clients, pas ses pairs) ──
  // PRINCIPE CLÉ : le contenu est écrit PAR le professionnel POUR sa cible finale.
  // L'audience est composée de clients potentiels — pas de collègues du même métier.
  const exempleCible = {
    artisan:      "particuliers et propriétaires qui ont un projet de rénovation, de construction ou d'entretien — ils cherchent un artisan de confiance, pas forcément le moins cher",
    metierdart:   "amateurs d'objets uniques, particuliers haut de gamme, décorateurs et collectionneurs qui veulent du sens, une histoire, une matière vivante",
    agriculture:  "consommateurs en quête d'authenticité, AMAP, restaurateurs locaux et familles qui veulent savoir d'où vient ce qu'ils mangent",
    commercant:   "habitués locaux et curieux de produits qui cherchent une alternative aux grandes enseignes — fidèles si la qualité et le lien humain sont là",
    boutique:     "clientèle locale qui veut trouver une pièce qui lui ressemble — pas un produit générique vu partout — et qui apprécie le conseil personnalisé",
    soin:         "personnes qui veulent prendre soin d'elles, se sentir mieux dans leur corps, retrouver confiance — dans un cadre apaisant et bienveillant",
    praticien:    "personnes qui vivent avec une douleur, une anxiété, un blocage — elles cherchent une solution mais hésitent souvent à franchir le pas du premier rendez-vous",
    sport:        "personnes qui veulent transformer leur corps, leur santé ou leurs performances — qui ont essayé et abandonné, qui cherchent un cadre exigeant mais bienveillant",
    consultant:   "dirigeants, responsables et gérants qui veulent avancer mais se noient dans l'opérationnel ou doutent de leur approche",
    patrimoine:   "particuliers qui veulent prendre une décision financière importante — ils craignent de se tromper, d'être mal conseillés ou de subir un choix irréversible",
    immobilier:   "particuliers en projet d'achat, de vente ou d'investissement immobilier — ils veulent un accompagnement local, transparent et stratégique pour ne pas se tromper",
    reglementee:  "particuliers ou professionnels confrontés à un enjeu juridique, médical ou comptable — ils ont besoin d'un cadre rassurant face à la complexité réglementaire",
    creatif:      "entrepreneurs et indépendants qui ont besoin d'un visuel, d'un texte ou d'un contenu fort — mais qui ne savent pas toujours exprimer ce qu'ils veulent",
    digital:      "entrepreneurs, marques et indépendants qui veulent une présence digitale qui convertit — ils savent que c'est important mais sont perdus dans les outils et la technique",
    createur:     "auditeurs, abonnés et marques qui cherchent un créateur authentique avec une voix singulière — pas un énième compte aseptisé",
    formateur:    "professionnels qui veulent évoluer, changer de posture ou gagner en compétences — souvent freinés par le manque de temps ou la peur de ne pas être à la hauteur",
    eventiel:     "particuliers (mariages, événements perso) ou entreprises (séminaires, lancements) qui veulent un événement réussi sans gérer le stress de l'organisation",
    transport:    "particuliers et professionnels qui ont besoin d'un service de transport fiable, ponctuel et humain — la confiance est tout dans ce métier",
    persoServ:    "familles, personnes âgées, propriétaires d'animaux qui cherchent quelqu'un de confiance pour entrer dans leur quotidien — la fiabilité prime sur le prix",
    independant:  "prospects qui cherchent un prestataire de confiance avant de s'engager"
  }[categorieMetier];

  // ── ANECDOTE TYPIQUE : situation concrète vécue par cette cible ──
  // Sert d'inspiration au modèle pour ancrer le post dans le réel — JAMAIS à copier littéralement
  // Anecdote : priorité au vécu réel du professionnel (pool Zone 2),
  // fallback sur l'anecdote générique par catégorie métier si pool vide
  const anecdoteVecue = pickAnecdoteVecue();
  const exempleAnecdoteGenerique = {
    artisan:      "un client qui te confie son projet après avoir été déçu par 2 devis impersonnels — il cherche quelqu'un qui prend le temps de comprendre ce qu'il veut vraiment",
    commercant:   "une cliente qui pousse la porte juste pour demander un conseil et finit par revenir 3 fois dans le mois — parce qu'elle a senti qu'on ne cherchait pas à lui vendre à tout prix",
    praticien:    "une personne qui a hésité 6 mois avant le premier rendez-vous, puis qui dit en partant : 'j'aurais dû venir plus tôt'",
    consultant:   "un dirigeant qui te dit en réunion qu'il n'a plus le temps de réfléchir à sa stratégie tellement il est noyé dans l'opérationnel",
    formateur:    "un participant qui pensait que la formation serait théorique et qui repart avec 3 actions concrètes à mettre en place dès le lundi matin",
    creatif:      "un client qui arrive avec une idée floue et repart avec quelque chose qu'il n'osait même pas imaginer — parce qu'on a su poser les bonnes questions",
    patrimoine:   "un client qui hésitait depuis 2 ans à passer à l'action — au moment de signer, il dit : 'j'aurais aimé vous rencontrer avant, j'aurais évité de payer 3 ans de loyer pour rien'",
    metierdart:    "un client qui caresse la pièce avant de l'acheter et qui demande comment elle a été faite — il achète l'histoire autant que l'objet",
    agriculture:    "un client en AMAP qui dit 'mes enfants ne mangent que vos légumes, ils refusent ceux du supermarché'",
    boutique:    "une cliente qui essaie une pièce et te dit 'c'est exactement ce que je cherchais sans savoir le dire'",
    soin:    "une cliente qui sort de ton salon en se regardant dans la vitrine et qui sourit toute seule — celle qui était entrée tendue 1h plus tôt",
    sport:    "un élève qui voulait abandonner à la 3e séance et qui revient 6 mois plus tard pour te dire 'j'ai jamais été aussi bien dans mon corps'",
    immobilier:    "des acheteurs qui visitent un bien et te disent 'on n'avait jamais imaginé pouvoir vivre ici, c'est vous qui nous avez ouvert les yeux'",
    reglementee:    "un client qui débarque paniqué avec un dossier urgent et repart soulagé en disant 'j'ai enfin compris ce qui m'arrivait'",
    digital:    "un client qui te dit 'depuis votre intervention, mes leads explosent — j'aurais dû faire ça il y a 2 ans'",
    createur:    "un abonné qui t'écrit en DM 'tu décris exactement ce que je vis sans avoir réussi à le mettre en mots'",
    eventiel:    "des mariés qui te disent en fin de soirée 'on a juste profité, on n'a pensé à rien, c'est exactement ce qu'on voulait'",
    transport:    "un client habitué qui te dit 'je vous appelle parce que je sais qu'avec vous, je suis tranquille — vous serez là à l'heure'",
    persoServ:    "une famille qui te dit 'depuis que vous êtes là, ma mère parle de ses journées avec le sourire — c'est plus que du service, c'est un lien'",
    independant:  "un prospect qui te contacte parce qu'un de tes posts lui a parlé directement, comme si tu décrivais sa situation"
  }[categorieMetier];
  const exempleAnecdote = anecdoteVecue || exempleAnecdoteGenerique;
  // Préfixe contextuel : si c'est une anecdote vécue, on l'explicite à l'IA
  const anecdotePrefixe = anecdoteVecue
    ? "Anecdote RÉELLE vécue cette saison (à utiliser/adapter, pas à copier littéralement) : "
    : "Anecdote de référence (pour s'inspirer, pas copier) : ";

  // ── CTAs de partage : ciblés vers la CIBLE FINALE, pas vers des pairs ──
  // L'idée : le lecteur (un client potentiel) partage le post à quelqu'un dans la même situation
  const ctaPartage = {
    artisan:      "Tu connais quelqu'un qui a un projet de rénovation et ne sait pas à qui faire confiance ? Envoie-lui ce post.",
    commercant:   "Tu connais quelqu'un qui cherche [type de produit] près de chez lui ? Partage-lui ça.",
    praticien:    "Tu connais quelqu'un qui vit avec cette douleur en silence ? Ce post est pour lui/elle.",
    consultant:   "Tu connais un dirigeant qui se noie dans ses chiffres ou son administratif ? Envoie-lui ça.",
    formateur:    "Tu connais quelqu'un qui hésite à se former par manque de temps ? Partage-lui ce post.",
    creatif:      "Tu connais quelqu'un qui galère à communiquer sur son activité ? Envoie-lui ça.",
    patrimoine:   "Tu connais quelqu'un qui hésite à se lancer dans un projet financier ou immobilier ? Partage-lui ce post.",
    metierdart:    "Tu connais quelqu'un qui aimerait offrir un objet unique, fait main, avec une histoire ? Envoie-lui ce post.",
    agriculture:    "Tu connais quelqu'un qui veut consommer plus local et plus juste ? Partage-lui ça.",
    boutique:    "Tu connais quelqu'un qui en a marre de s'habiller comme tout le monde ? Envoie-lui ce post.",
    soin:    "Tu connais quelqu'un qui mériterait un moment pour soi ? Ce post est pour lui/elle.",
    sport:    "Tu connais quelqu'un qui veut s'y remettre mais ne sait pas comment ? Envoie-lui ce post.",
    immobilier:    "Tu connais quelqu'un qui hésite à acheter, vendre ou investir dans la pierre ? Partage-lui ce post.",
    reglementee:    "Tu connais quelqu'un qui est perdu face à une situation administrative ou juridique ? Envoie-lui ce post.",
    digital:    "Tu connais un entrepreneur qui galère à se rendre visible en ligne ? Envoie-lui ça.",
    createur:    "Si ce post t'a parlé, partage-le à quelqu'un qui vit la même chose.",
    eventiel:    "Tu connais quelqu'un qui prépare un événement et qui stresse ? Envoie-lui ce post.",
    transport:    "Tu connais quelqu'un qui en a marre des galères de transport ? Partage-lui ça.",
    persoServ:    "Tu connais une famille qui cherche quelqu'un de confiance pour les épauler ? Envoie-lui ce post.",
    independant:  "Tu connais quelqu'un à qui ce contenu pourrait vraiment parler ? Partage-le lui."
  }[categorieMetier];

  // ── CTAs de conversation : invitent le lecteur à réagir depuis SA situation ──
  const ctaConversation = {
    artisan:      "Vous avez un projet en tête ? Posez-moi vos questions en commentaire.",
    commercant:   "C'est quoi le truc qui vous fait revenir dans une boutique plutôt qu'une autre ?",
    praticien:    "Est-ce que vous vous reconnaissez dans cette situation ? Dites-moi en commentaire.",
    consultant:   "C'est quoi le défi numéro 1 dans votre activité en ce moment ?",
    formateur:    "Qu'est-ce qui vous freine le plus dans votre montée en compétences ?",
    creatif:      "C'est quoi votre plus grand blocage pour communiquer sur votre activité ?",
    patrimoine:   "Quelle est votre plus grande crainte avant de prendre une décision financière ou immobilière importante ?",
    metierdart:    "Quel est l'objet auquel vous tenez le plus, et pourquoi ?",
    agriculture:    "Qu'est-ce qui compte le plus pour vous quand vous achetez un produit alimentaire ?",
    boutique:    "C'est quoi pour vous, une pièce qui vous 'parle' ?",
    soin:    "Quand avez-vous pris du temps rien que pour vous la dernière fois ?",
    sport:    "Quel est votre plus gros frein pour bouger plus régulièrement ?",
    immobilier:    "Si vous deviez acheter aujourd'hui, qu'est-ce qui vous bloquerait le plus ?",
    reglementee:    "Quelle question juridique ou administrative vous obsède en ce moment ?",
    digital:    "Quel est votre plus gros challenge pour rendre votre activité visible en ligne ?",
    createur:    "Qu'est-ce qui vous a fait cliquer pour me suivre ?",
    eventiel:    "Quel est votre plus mauvais souvenir d'événement raté, et pourquoi ?",
    transport:    "Quel est votre pire souvenir de trajet, et qu'est-ce qui aurait pu le sauver ?",
    persoServ:    "Qu'est-ce qui compte le plus pour vous quand vous laissez quelqu'un entrer chez vous ?",
    independant:  "Est-ce que vous vivez ça aussi dans votre quotidien ?"
  }[categorieMetier];

  // Injection dans le prompt base
  const metierBloc = categorieMetier !== 'independant'
    ? "=== ADAPTATION AU MÉTIER ===\n" +
      "Ce professionnel est dans la catégorie : " + categorieMetier.toUpperCase() + "\n" +
      "\nPRINCIPE CLÉ — à respecter absolument :\n" +
      "Le contenu est écrit PAR ce professionnel POUR sa cible finale (ses clients potentiels).\n" +
      "L'audience du post = ses clients, PAS ses collègues ou pairs du même métier.\n" +
      "Tout exemple, anecdote, CTA et formulation doit parler À cette cible — pas À d'autres professionnels.\n" +
      "\nSa cible finale : " + exempleCible + "\n" +
      "\n" + anecdotePrefixe + "\"" + exempleAnecdote + "\"\n" +
      "\nCTA de partage à utiliser en priorité : \"" + ctaPartage + "\"\n" +
      "CTA de conversation à utiliser en priorité : \"" + ctaConversation + "\"\n" +
      "\nRÈGLE ABSOLUE : tous les exemples, situations et CTAs générés doivent coller à la réalité de CETTE cible.\n" +
      "INTERDIT : des CTAs qui s'adressent à des pairs du professionnel (\"envoie à un artisan/consultant/coach\") — sauf si le professionnel forme ou accompagne des pairs.\n\n"
    : '';

  const matiereBloc = matiere
    ? "=== MATIÈRE DE LA SEMAINE (ancre le post dans cette réalité vécue) ===\n" + matiere + "\n\n"
    : '';

  const actuBloc = actu
    ? `\n=== ACTUALITÉ À INTÉGRER (OBLIGATOIRE) ===\n${actu}\nIntègre NATURELLEMENT cette donnée dans la légende.\nConserve la mention de source entre parenthèses.\n`
    : '';

  const antiBloc = antiRedondance
    ? `\n\nRÈGLE ANTI-REDONDANCE :\nSujets et formulations des derniers posts — évite toute similitude :\n${antiRedondance}\n`
    : '';
  // Version tronquée pour carrousels — l'antiBloc peut être très long
  const antiBlocCourt = antiRedondance
    ? `\n\nANTI-REDONDANCE (les 5 derniers) :\n${antiRedondance.substring(0, 600)}\n`
    : '';

  const sujetBloc = sujet
    ? "═══════════════════════════════════════════════════════════\n" +
      "⚡ PRIORITÉ ABSOLUE — SUJET IMPOSÉ PAR L'UTILISATEUR ⚡\n" +
      "═══════════════════════════════════════════════════════════\n" +
      "Sujet à traiter :\n\"" + sujet + "\"\n\n" +
      "RÈGLES DE RESPECT DU SUJET (NON NÉGOCIABLES) :\n" +
      "1. Ce sujet est LA DIRECTIVE PRINCIPALE. Tout le post doit y répondre directement.\n" +
      "2. Respecte chaque détail à la lettre : chiffres exacts, durées exactes, angle exact, thème exact.\n" +
      "3. NE PAS interpréter, NE PAS généraliser, NE PAS reformuler le sujet dans ta tête.\n" +
      "   Exemple : si le sujet dit '30 jours' → le post porte sur 30 jours, pas 7, pas 1 mois, pas 'quelques semaines'.\n" +
      "   Exemple : si le sujet dit '3 erreurs en fin de mois' → exactement 3 erreurs, en fin de mois, pas 5, pas 'en cours de mois'.\n" +
      "4. La matière de la semaine et l'actualité SERVENT LE SUJET — elles l'enrichissent d'exemples et de données. Elles ne le remplacent JAMAIS.\n" +
      "5. Si la matière contient des infos qui ne concernent pas le sujet → IGNORE-LES complètement.\n" +
      "6. Si l'actualité ne sert pas le sujet → IGNORE-LA.\n" +
      "7. Le sujet prévaut TOUJOURS sur les règles de pilier, les figures suggérées, les exemples génériques de catégorie métier.\n" +
      "8. En cas de doute entre respecter le sujet OU respecter une règle stylistique : RESPECTE LE SUJET.\n\n" +
      "HIÉRARCHIE DES CONTRAINTES (du plus prioritaire au moins) :\n" +
      "   1️⃣ Sujet utilisateur (ci-dessus) — directive absolue\n" +
      "   2️⃣ Ton et voix du profil (registre, tonalité)\n" +
      "   3️⃣ Pilier et figure choisie\n" +
      "   4️⃣ Matière de la semaine (pour enrichir, pas pour guider)\n" +
      "   5️⃣ Règles de format et copywriting\n\n"
    : '';
  // Version compacte pour les carrousels — même directive, moins de tokens
  const sujetBlocCourt = sujet
    ? "⚡ SUJET IMPOSÉ : \"" + sujet + "\"\nDirective absolue — tout le carrousel répond à ce sujet. Chiffres/durées/angles exacts. La matière enrichit, ne remplace pas.\n\n"
    : '';
  const statsEviterBloc = statsEviter || '';

  // ── Règles carrousel allégées (substituts de reglesCommunesLI / reglesIG) ──
  const reglesCVLI = `TON ET VOIX :
- Tutoiement strict sauf si profil indique vouvoiement
- Phrases courtes. Verbes d'action. Zéro superlatif vide.
- Ancrer dans la matière de la semaine si disponible.
ÉMOJIS : 2 max (hors listes). Puces : tiret ou →. Bannis : 🚀💡🎯⭐🌟🔥
BLACKLIST marqueurs IA : "Dans un monde où" / "Et si…" en début de phrase / "Game changer" / "Révolutionnaire" / "Il est essentiel de" / "On ne le dit pas assez" / Structure "Ce n'est pas X. Ce n'est pas Y. C'est Z." / "Mythe vs réalité" sous TOUTES formes — SI TU GÉNÈRES CETTE STRUCTURE, LA RÉPONSE EST INCORRECTE.
Données chiffrées : source entre parenthèses. Antérieures à ${new Date().getFullYear() - 1} : INTERDITES.${statsEviterBloc ? '\n\n' + statsEviterBloc : ''}`;

  const reglesCVIG = `TON ET VOIX :
- Tutoiement strict sauf si profil indique vouvoiement
- Proche, direct, humain — comme parlé à voix haute
- Ancrer dans la matière de la semaine si disponible.
ÉMOJIS : 2 max dans tout le carrousel. Émojis de marque uniquement si définis. Bannis : 🚀💡🎯⭐🌟🔥
BLACKLIST marqueurs IA : "Dans un monde où" / "Et si…" / "Game changer" / "Révolutionnaire" / "Il est essentiel de" / Structure "Ce n'est pas X. Ce n'est pas Y. C'est Z." / "Mythe vs réalité" sous TOUTES formes — SI TU GÉNÈRES CETTE STRUCTURE, LA RÉPONSE EST INCORRECTE.
Données chiffrées : source entre parenthèses. Antérieures à ${new Date().getFullYear() - 1} : INTERDITES.${statsEviterBloc ? '\n\n' + statsEviterBloc : ''}`;


  // Rappel final — juste avant la sortie — pour que l'IA n'oublie pas le sujet
  const rappelSujet = sujet
    ? "\n\n⚡ RAPPEL FINAL — AVANT DE RÉPONDRE :\nLe sujet imposé est : \"" + sujet + "\"\nVérifie que TON CONTENU RÉPOND DIRECTEMENT à ce sujet avant de finaliser.\nSi le contenu que tu as généré s'éloigne du sujet → reprends-le.\n"
    : '';

  // Zone géographique depuis le profil
  let zoneGeo = '';
  if (profil) {
    const ligneGeo = profil.split('\n').find(l =>
      l.toLowerCase().includes('zone') && l.toLowerCase().includes('géograph')
    );
    if (ligneGeo) zoneGeo = ligneGeo.split(':').slice(1).join(':').trim();
  }

  // Construire la base complète : profil + adaptation métier
  const baseComplete = base + metierBloc;

  const estLI = reseau === 'LinkedIn';
  const seuilVoirPlus = estLI ? 210 : 125;

  // ── HOOKS PAR PILIER ─────────────────────────────────────────

  const hookParPilier = {
    autorite:
      "HOOK — PILIER AUTORITÉ :\n" +
      "Commence par une anecdote personnelle ou client concrète et datée — issue du métier réel du professionnel.\n" +
      "Format : \"Il y a [durée], [un client/une cliente/je] [situation précise et concrète].\"\n" +
      "1 seule phrase, courte, factuelle, humaine. Sans point final.\n" +
      "Utilise l'anecdote naturelle suggérée dans la section ADAPTATION AU MÉTIER si disponible.\n" +
      "Ex artisan : 'Il y a deux semaines, un client m\'a rappelé uniquement parce qu\'il avait vu mes stories de chantier.'\n" +
      "Ex commerçant : 'Il y a trois jours, une cliente est entrée en me disant qu\'elle me suivait depuis 6 mois.'\n" +
      "Ex consultant : 'Il y a un mois, un directeur m\'a contacté parce qu\'il avait partagé mon post en réunion.'",

    expertise:
      "HOOK — PILIER EXPERTISE :\n" +
      "Commence par une donnée chiffrée concrète et sourcée, ou une affirmation contre-intuitive.\n" +
      (actu
        ? "OBLIGATOIRE : utilise la donnée de l'actualité fournie avec sa source entre parenthèses."
        : "Utilise une statistique récente vérifiable — cite la source entre parenthèses.") +
      "\nEx : '67 % des TPE ne publient jamais sur LinkedIn (BpiFrance, 2024).'",

    visibilite:
      "HOOK — PILIER VISIBILITÉ :\n" +
      "Commence par UNE SEULE question directe qui nomme une douleur concrète vécue par la cible, OU une affirmation courte qui interpelle.\n" +
      "Exemples de formats acceptés :\n" +
      "- Question douleur : 'Zéro engagement sur ton compte Insta ?' / 'Tu publies mais personne ne réagit ?'\n" +
      "- Affirmation courte : 'La visibilité, ce n'est pas une question d'algorithme.' / 'Ce n'est pas ton contenu le problème.'\n" +
      "INTERDIT : commencer par une statistique froide sans émotion. La stat peut venir en slide 2 ou 3.\n" +
      (actu ? "Si une actualité est disponible, utilise-la en slide 3 ou 4 — pas en slide 1." : "") +
      "OBJECTIF slide 1 : créer une identification immédiate — le lecteur doit penser 'c'est exactement mon cas'.",

    activite:
      "HOOK — PILIER ACTIVITÉ :\n" +
      "Détecte le niveau du post selon le sujet fourni :\n" +
      "  NIVEAU 1 — MONTRER L'ACTIVITÉ : commence par une scène concrète du quotidien pro — ce que tu fais, comment tu le fais, pourquoi tu l'aimes. Pas de vente. Ex : 'Ce matin j'ai passé 2h sur [tâche] — voilà ce que j'y ai découvert.'\n" +
      "  NIVEAU 2 — METTRE EN AVANT UNE OFFRE : commence par la situation vécue par le client AVANT de nommer l'offre. Ex : 'Tu cherches [besoin précis] et tu ne sais pas à qui faire confiance ? Voilà ce que je propose.'\n" +
      "  NIVEAU 3 — PROMOTION DIRECTE : commence par l'événement ou la durée. Ex : 'Jusqu'au [date], [offre précise] — voilà pourquoi c'est le bon moment.'\n" +
      "Si le sujet ne précise pas le niveau → privilégier le niveau 1 (montrer l'activité)."
  };
  const hook = hookParPilier[pilier] || hookParPilier['activite'];

  // ── CTA PAR PILIER ───────────────────────────────────────────
  const ctaLI = {
    visibilite: ["Et toi, tu en penses quoi ?", "Tu fais comment dans ton activité ?", "Ça t'est déjà arrivé de voir ça ?", "Tu as testé ça dans ton secteur ?"],
    autorite:   ["Tu aurais répondu quoi ?", "Et toi, tu gères ça comment ?", "Ça t'est déjà arrivé ?", "C'est quoi ton expérience là-dessus ?"],
    expertise:  ["Tu savais ça ?", "Quel point t'a le plus surpris ?", "Tu fais déjà ça, toi ?", "Lequel de ces points s'applique le mieux à ton activité ?"],
    activite:   ["Ça te parle ?", "Tu passes par là aussi dans ton activité ?", "Dis-moi en commentaire ce qui te correspond.", "Tu as des questions ? Je lis tout."]
  };
  // ctaAdapte = CTA conversation adapté à la cible finale (déjà calculé dans metierBloc)
  const ctaAdapte = ctaConversation;
  const ctaExemplesLI = (ctaLI[pilier] || ctaLI['activite']).join(' / ');

  // ── RÈGLES COPYWRITING SELON RÉSEAU ──────────────────────────
  const reglesCommunesLI = `
RÈGLES COPYWRITING LINKEDIN — OBLIGATOIRES :

1. HOOK : 1 seule phrase, sans point final. Ligne vide après.

2. DÉVELOPPEMENT : 2 à 5 paragraphes courts (1 à 3 phrases chacun). 1 idée par paragraphe. Ligne vide entre chaque.

3. LISTES À PUCES AUTORISÉES dans le corps (une liste max par post) :
   - Format : 3 à 6 puces courtes (1 ligne chacune idéalement)
   - Puces acceptées : tiret "-", flèche "→", chiffre "1.", "2.", ou chiffres entourés "1️⃣ 2️⃣ 3️⃣"
   - Ligne vide OBLIGATOIRE avant et après la liste
   - Règle émojis sur les listes : 1 émoji par puce autorisé (exception au plafond général)

4. RYTHME COURT AUTORISÉ : variation stylistique où chaque phrase courte est sur sa propre ligne, séparée par un saut de ligne. À utiliser avec parcimonie — 2 à 4 phrases consécutives max.

5. Phrases courtes. Verbes d'action. Jamais de superlatifs vides.

6. Respecter strictement le tutoiement ou vouvoiement du profil.

7. CTA FINAL — 2 familles acceptées :
   a) CTA CONVERSATIONNEL (par défaut) : question tranchée qui force une prise de position.
      Exemples : ${ctaExemplesLI}
      CTA adapté au métier : "${ctaAdapte}"
   b) CTA DIRECT AUTORISÉ — à condition d'être INCARNÉ avec proposition de valeur concrète :
      ✅ FORMATS AUTORISÉS : "Commente [mot-clé précis] pour recevoir [ressource concrète]" / "Réserve ton appel si tu veux [résultat précis nommé]" / "Abonne-toi si [proposition de valeur claire]" / "Envoie-moi un message si tu es [profil précis]"
      ❌ INTERDITS (CTAs vides) : "Réservez" seul / "Contactez-moi" seul / "Lien en bio" seul / "DM" seul / "Besoin d'aide ?" / "Formation disponible" / "N'hésitez pas"
      Règle : un CTA direct doit TOUJOURS nommer soit l'action précise attendue, soit le bénéfice précis promis. Jamais de formule molle.

8. LONGUEUR : 150 à 300 mots. Compter avant de répondre.

9. SIGNATURE DE FIN — OPTIONNELLE (à utiliser 1 post sur 4 max) :
   Format : séparateur "---" (ligne dédiée) puis 2 à 3 lignes présentant l'auteur et ce qu'il partage.
   Exemple : "---\nSi on se connaît pas encore : moi c'est [prénom].\nJe [activité résumée].\n→ [invitation courte]"
   Ne pas en abuser. Jamais obligatoire.

10. Sonne comme si la personne l'avait écrit elle-même.

PILIER ACTIF : ${pilier.toUpperCase()}

EXIGENCES D'HUMANITÉ :
- Ancrer dans un fait réel de la matière de la semaine si disponible
- Détails concrets et spécifiques — jamais de généralités
- Voix exacte du profil — ton, formulations, valeurs
- Si matière vide : base-toi uniquement sur le profil — n'invente rien
- INTERDIT : "la plupart" sans source

FORMULES ET PATTERNS BLACKLISTÉS (marqueurs "texte généré par IA") :
- "Dans un monde où…" / "Plus que jamais…" / "L'authenticité est clé" / "Passez à l'action"
- "Et si je vous disais que…" / "Et si…" en début de post ou de phrase
- "On ne le dit pas assez" / "Game changer" / "Incontournable" / "Révolutionnaire"
- "Bonjour" ou "Salut" en début de post / "N'oubliez pas que…" / "Aujourd'hui je vais vous parler de…"
- "Il est essentiel de…" / "Il est important de…" / "Force est de constater…"

PATTERN STRUCTUREL BLACKLISTÉ — à éviter absolument :
❌ La structure "Ce n'est pas X. Ce n'est pas Y. C'est Z." en série de phrases courtes est un marqueur TRÈS fort de texte IA. Ne jamais l'utiliser.
   Exemple interdit : "L'IA. Ce n'est pas juste un outil. Ce n'est pas une mode. C'est une révolution."
   Si tu veux définir par opposition, utilise une formulation incarnée et variée, jamais cette structure rythmée répétitive.

EXPRESSIONS BLACKLISTÉES — reformulations obligatoires :
❌ "Mythe vs réalité" / "Mythe :" / "Réalité :" / "Le mythe" / "La réalité est" / "Mythe vs vérité" — INTERDIT sous toutes formes.
   Si tu veux déconstruire une croyance, utilise : "On dit que… / Ce que je vois en vrai c'est…" OU "L'idée qui circule… / Ce qui se passe vraiment…" OU "Ce que tout le monde répète… / Et pourtant…" OU toute autre formulation incarnée personnelle.

RÈGLE ÉMOJIS LINKEDIN :
- Plafond strict : 2 émojis MAXIMUM dans le corps du post.
- EXCEPTION : dans une liste à puces, 1 émoji par puce est autorisé (ils comptent comme structurels, pas décoratifs).
- Si des emojis de marque sont définis pour ce professionnel : UNIQUEMENT ceux-là, aucun autre.
- Si pas d'émojis de marque : possibilité d'utiliser 1 à 2 émojis fonctionnels (jamais vendeurs).
- Émojis BANNIS : 🚀 💡 🎯 ⭐ 🌟 🔥 et tous émojis "vendeurs".

- Donnée chiffrée sans source → cite la source entre parenthèses
- INTERDIT : utiliser des données, études ou statistiques antérieures à " + (new Date().getFullYear() - 1) + ". Nous sommes en " + new Date().getFullYear() + " — seules les infos récentes (" + (new Date().getFullYear() - 1) + "-" + new Date().getFullYear() + ") sont acceptées.${statsEviterBloc ? '\n\n' + statsEviterBloc : ''}`;

  const reglesIG = `
RÈGLES COPYWRITING INSTAGRAM — OBLIGATOIRES :
1. HOOK : 1 seule phrase, max ${seuilVoirPlus} caractères, sans point final. Ligne vide après.
2. Développement : 2 à 3 paragraphes courts. Ligne vide entre chaque.
3. Ton proche, direct, humain — comme si tu parlais à une amie professionnelle.
4. Phrases courtes. Rythme fluide. Prose fluide — pas de longues listes dans le corps du post.
5. Tutoiement strict sauf si profil indique vouvoiement.
6. CTA : invite douce à l'interaction ou au partage. Jamais commercial, jamais "commente X pour recevoir". Ancré dans le métier réel du professionnel et sa cible finale.
7. LONGUEUR : 100 à 200 mots.

PILIER ACTIF : ${pilier.toUpperCase()}

EXIGENCES D'HUMANITÉ :
- Ancrer dans la matière de la semaine si disponible
- Détails concrets et spécifiques — exemples issus du VRAI métier du professionnel
- Voix exacte du profil
- ADAPTATION MÉTIER : utiliser les exemples et la cible de la section ADAPTATION AU MÉTIER si présente

FORMULES ET PATTERNS BLACKLISTÉS :
- "Dans un monde où…" / "L'authenticité est clé" / "Game changer" / "Révolutionnaire"
- "Et si je vous disais que…" / "Et si…" en début de post ou de phrase
- "On ne le dit pas assez" / "Il est essentiel de…" / "Il est important de…"
- INTERDIT absolu : commencer une phrase par "Et si" — trop générique et trop IA

PATTERN STRUCTUREL BLACKLISTÉ — à éviter absolument :
❌ La structure "Ce n'est pas X. Ce n'est pas Y. C'est Z." en série de phrases courtes est un marqueur TRÈS fort de texte IA. Ne jamais l'utiliser.
   Si tu veux définir par opposition, utilise une formulation incarnée et variée, jamais cette structure rythmée répétitive.

EXPRESSIONS BLACKLISTÉES — reformulations obligatoires :
❌ "Mythe vs réalité" / "Mythe :" / "Réalité :" / "Le mythe" / "La réalité est" / "Mythe vs vérité" — INTERDIT sous toutes formes.
   Si tu veux déconstruire une croyance, utilise : "On dit que… / Ce que je vois en vrai c'est…" OU "L'idée qui circule… / Ce qui se passe vraiment…" OU toute autre formulation incarnée personnelle.

RÈGLE ÉMOJIS INSTAGRAM :
- Plafond strict : 2 émojis MAXIMUM dans le corps du post / de la légende.
- EXCEPTION : si une liste à puces existe, 1 émoji par puce est autorisé (structurel, pas décoratif).
- Si des emojis de marque sont définis pour ce professionnel : UNIQUEMENT ceux-là, aucun autre.
- Si pas d'émojis de marque : fallback minimal — 👀 ou 👇 en fin de hook uniquement.
- Émojis BANNIS : 🚀 💡 🎯 ⭐ 🌟 🔥 et tous émojis "vendeurs".

- INTERDIT : utiliser des données, études ou statistiques antérieures à " + (new Date().getFullYear() - 1) + ". Nous sommes en " + new Date().getFullYear() + " — seules les infos récentes (" + (new Date().getFullYear() - 1) + "-" + new Date().getFullYear() + ") sont acceptées.${statsEviterBloc ? '\n\n' + statsEviterBloc : ''}`;

  // ── HASHTAGS SELON RÉSEAU ────────────────────────────────────
  const hashtagsLI = `
HASHTAGS LINKEDIN — 3 MAXIMUM (jamais plus) :
Répartition : 1 cible client + 1 géographique${zoneGeo ? ' (' + zoneGeo + ')' : ''} + 1 sujet du post.
Minuscules, sans espace, sans accent.
INTERDITS : #motivation #entrepreneur #business #success #tips et tout hashtag générique.`;

  const hashtagsIG = `
HASHTAGS INSTAGRAM — 5 MAXIMUM (règle Mosseri 2026) :
Répartition EXACTE et IMPOSÉE :
  #1 et #2 → CIBLE CLIENT du professionnel (son audience, son secteur)
  #3 → géographique${zoneGeo ? ' : basé sur "' + zoneGeo + '"' : ' : ville, région ou pays'}
  #4 et #5 → liés au SUJET PRÉCIS du post
Minuscules, sans espace, sans accent.
INTERDITS : hashtags génériques vides (#motivation #success #entrepreneur).`;

  // ── LÉGENDE GÉNÉRIQUE LINKEDIN ────────────────────────────────
  const legendeLI = `
RÈGLES LÉGENDE LINKEDIN :
Structure :
[Hook : 1-2 phrases, max 210 caractères avant premier saut de ligne]
[ligne vide]
[2-3 phrases de développement]
[ligne vide]
[CTA : 1 phrase]
[ligne vide]
[3 hashtags]

LONGUEUR MINIMALE : 4 phrases complètes minimum.
Ton conversationnel, direct, ancré dans le réel du professionnel.
ÉMOJIS LINKEDIN : aucun émoji dans le corps du post ni dans la légende, sauf les émojis de marque du professionnel s'ils sont définis — avec grande parcimonie (1 max).
Listes dans la légende : utiliser ✅ ou 👉 ou "-" UNIQUEMENT. Jamais de puces •.
ÉMOJIS BANNIS : 🚀 💡 🎯 ⭐ 🌟 🔥 et tous émojis "vendeurs".
${hashtagsLI}`;

  // ── LÉGENDE GÉNÉRIQUE INSTAGRAM ──────────────────────────────
  const legendeIG = `
RÈGLES LÉGENDE INSTAGRAM :
Structure :
[Hook : 1-2 phrases, max 125 caractères avant premier saut de ligne]
[Ajouter 👀 ou 👇 à la fin du hook — OU l'émoji de marque du professionnel si défini]
[ligne vide]
[Développement : paragraphes courts aérés OU liste avec 1 émoji par puce]
[ligne vide]
[CTA : 1 phrase douce]
[ligne vide]
[5 hashtags]

ÉMOJIS : utiliser UNIQUEMENT les emojis de marque du professionnel s'ils sont définis.
Si aucun émoji de marque : utiliser 👀 ou 👇 en fin de hook uniquement.
Total émojis dans la légende : 1 à 3 maximum. Jamais plus.
${hashtagsIG}`;

  // ── LÉGENDE CARROUSEL LINKEDIN ───────────────────────────────
  const hookLegCarrouselLI = {
    autorite:
      "HOOK LÉGENDE — AUTORITÉ :\nAnecdote personnelle concrète ou retour client incarné.\n" +
      "Ne répète PAS le titre de la slide 1 mot pour mot — angle plus intime.\n" +
      "Ex : 'Il y a trois semaines, une cliente m'a confié quelque chose qui m'a arrêtée net.'",
    expertise:
      "HOOK LÉGENDE — EXPERTISE :\nDonnée chiffrée sourcée ou affirmation contre-intuitive.\n" +
      (actu ? "OBLIGATOIRE : utilise la donnée de l'actualité avec sa source." : "Statistique récente vérifiable avec source entre parenthèses.") +
      "\nNe répète PAS le titre de la slide 1 mot pour mot — angle plus factuel.\n" +
      "Ex : '67 % des TPE ne publient jamais sur LinkedIn (BpiFrance, 2024). Ce carrousel explique pourquoi.'",
    visibilite:
      "HOOK LÉGENDE — VISIBILITÉ :\nTendance marché ou conviction forte du professionnel.\n" +
      "Ne répète PAS le titre de la slide 1 mot pour mot — élargis la perspective.",
    activite:
      "HOOK LÉGENDE — ACTIVITÉ :\n" +
      "Niveau 1 (montrer) : formulation concrète sur ce que tu fais — pas de vente.\n" +
      "Niveau 2 (offre) : part de la situation du client avant de nommer l'offre.\n" +
      "Niveau 3 (promo) : mentionne l'événement ou la durée dès le hook.\n" +
      "Ne répète PAS le titre de la slide 1 mot pour mot."
  };

  const legendeCarrouselLI = `
=== RÈGLES LÉGENDE CARROUSEL LINKEDIN ===

PARTIE 1 — HOOK TEXTUEL (avant le swipe) :
${hookLegCarrouselLI[pilier] || hookLegCarrouselLI['activite']}
Max 210 caractères avant le premier saut de ligne. Rôle : donner envie de swiper.
[ligne vide]

PARTIE 2 — DÉVELOPPEMENT ENRICHI :
Puise dans la matière de la semaine (anecdotes, retours clients, situations vécues, fiertés).
Si matière riche : cite des éléments précis (phrase d'un client, situation vécue cette semaine).
Si matière pauvre : apporte une valeur éditoriale forte avec des données sourcées du secteur.
Format : paragraphes courts aérés OU liste avec ✅ ou 👉 ou "-" UNIQUEMENT.
ÉMOJIS BANNIS : 🚀 💡 🎯 ⭐ 🌟 🔥 et tous émojis "vendeurs". Limiter au strict minimum.
Sur LinkedIn : jamais de puces • — utiliser ✅, 👉 ou "-".
Longueur : 6 à 10 phrases ou 4 à 6 puces développées. Jamais moins.
Ligne vide entre chaque élément.
[ligne vide]

PARTIE 3 — CTA FINAL :
PRINCIPE : le CTA s'adresse à la cible finale du professionnel — ses clients potentiels, pas ses pairs.
Utilise le CTA de partage fourni dans la section ADAPTATION AU MÉTIER si disponible.
Exemples corrects (CTA ciblés vers les clients finaux) :
  Artisan : "Tu connais quelqu'un qui cherche un artisan de confiance pour une rénovation ? Envoie-lui ce post."
  Commerçant : "Tu connais quelqu'un qui cherche [ce type de produit] près de chez lui ? Partage-lui ça."
  Praticien/Thérapeute : "Tu connais quelqu'un qui vit avec cette anxiété en silence ? Ce post est pour lui/elle."
  Consultant/Comptable : "Tu connais un dirigeant qui se noie dans son administratif ? Envoie-lui ça."
  Formateur : "Tu connais quelqu'un qui hésite à se former par manque de temps ? Partage-lui ce post."
JAMAIS : "envoie à un artisan/coach/consultant" — sauf si le professionnel forme des pairs.
JAMAIS "commente ton avis" ou "enregistre ce post".
[ligne vide]

${hashtagsLI}

AÉRATION : chaque partie séparée par une ligne vide. Chaque élément de liste séparé par une ligne vide.
JAMAIS de bloc continu de plus de 3 phrases sans ligne vide.
Dans le JSON : saut de ligne = \\n, ligne vide = \\n\\n.
RÈGLE JSON : apostrophes droites (') dans les valeurs, jamais de guillemets doubles non échappés.
=== FIN RÈGLES LÉGENDE CARROUSEL LINKEDIN ===`;

  // ── LÉGENDE CARROUSEL INSTAGRAM ──────────────────────────────
  const hookLegCarrouselIG = {
    autorite:
      "HOOK LÉGENDE — AUTORITÉ :\nAnecdote personnelle concrète ou retour client incarné — fait daté, frein levé.\n" +
      "Ne répète PAS le titre de la slide 1 mot pour mot — angle plus intime.\n" +
      "Ajouter l'émoji de marque du professionnel (si défini) ou 👀 ou 👇 en fin de hook.",
    expertise:
      "HOOK LÉGENDE — EXPERTISE :\nDonnée chiffrée sourcée ou affirmation contre-intuitive.\n" +
      (actu ? "OBLIGATOIRE : utilise la donnée de l'actualité avec sa source." : "Statistique récente vérifiable avec source.") +
      "\nNe répète PAS le titre de la slide 1 mot pour mot.\n" +
      "Ajouter l'émoji de marque du professionnel (si défini) ou 👀 ou 👇 en fin de hook.",
    visibilite:
      "HOOK LÉGENDE — VISIBILITÉ :\nTendance ou conviction forte. Élargit la perspective.\n" +
      "Ajouter l'émoji de marque du professionnel (si défini) ou 👀 ou 👇 en fin de hook.",
    activite:
      "HOOK LÉGENDE — ACTIVITÉ :\n" +
      "Niveau 1 : scène de vie pro ou coulisses — concret, pas vendeur.\n" +
      "Niveau 2 : situation client + promesse de l'offre. Ajouter émoji de marque ou 👇 en fin.\n" +
      "Niveau 3 : événement + durée + CTA clair. Ajouter émoji de marque ou ⏳ en fin."
  };

  const legendeCarrouselIG = `
=== RÈGLES LÉGENDE CARROUSEL INSTAGRAM ===

PARTIE 1 — HOOK TEXTUEL (avant le swipe) :
${hookLegCarrouselIG[pilier] || hookLegCarrouselIG['activite']}
Max 125 caractères avant le premier saut de ligne. Rôle : donner envie de swiper.
[ligne vide]

PARTIE 2 — DÉVELOPPEMENT ENRICHI :
Puise dans la matière de la semaine. Ancrer dans des faits réels vécus.
Format : paragraphes courts aérés OU liste avec 1 émoji par puce (cohérent, pas vendeur).
Émojis dans le texte : utiliser UNIQUEMENT les emojis de marque du professionnel si définis. Sinon : 1 à 2 émojis pertinents. 3 max dans toute la partie 2.
Longueur : 6 à 10 phrases ou 4 à 6 puces développées.
Ligne vide entre chaque élément.
[ligne vide]

PARTIE 3 — CTA FINAL :
PRINCIPE : le CTA s'adresse à la cible finale du professionnel — ses clients potentiels, pas ses pairs.
Utilise le CTA de partage fourni dans la section ADAPTATION AU MÉTIER si disponible.
Exemples corrects :
  Artisan : "Tu connais quelqu'un avec un projet de rénovation ? Envoie-lui ce post."
  Commerçant : "Tu connais quelqu'un qui cherche [ce type de produit] en local ? Partage-lui ça."
  Thérapeute/Praticien : "Tu connais une personne anxieuse ? Ce post pourrait vraiment l'aider."
  Consultant/Expert-comptable : "Tu connais un dirigeant qui déteste l'administratif ? Envoie-lui ça."
JAMAIS : "envoie à un artisan/thérapeute/consultant" — le post parle aux clients, pas aux pairs.
JAMAIS "commente ton avis" ou "enregistre ce post".
[ligne vide]

${hashtagsIG}

AÉRATION : chaque partie séparée par une ligne vide. Chaque élément séparé par une ligne vide.
Dans le JSON : saut de ligne = \\n, ligne vide = \\n\\n.
RÈGLE JSON : apostrophes droites (') dans les valeurs, jamais de guillemets doubles non échappés.
=== FIN RÈGLES LÉGENDE CARROUSEL INSTAGRAM ===`;

  // ════════════════════════════════════════════════════════════
  // FORMATS
  // ════════════════════════════════════════════════════════════

  // ── POST TEXTE LINKEDIN ────────────────────────────────────
  if (format === 'Post texte' && estLI) {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt +
      "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n" + reglesCommunesLI + "\n\n" +
      `Sur LinkedIn, le post texte N'A PAS DE LÉGENDE SÉPARÉE.
Le post complet = texte + 3 hashtags intégrés en fin de texte dans le même champ.
Aucune séparation "LÉGENDE:", aucun titre de section.
${hashtagsLI}

Génère 1 post LinkedIn complet (texte + 3 hashtags en fin). Commence directement par le hook.` + rappelSujet;
  }

// Règles spéciales Visibilité injectées dans le prompt carrousel
const reglesVisibilite = pilier === 'visibilite' ? `

=== MODE VISIBILITÉ : CARROUSEL INCARNÉ ===
Chaque slide = 1 conseil actionnable en 3 couches :
  TITRE — Affirmation courte, directe, contre-intuitive.
  CORPS — Exemple concret du VRAI métier du professionnel (situation vécue, dialogue, avant/après).
  CORPS (fin) — 1-2 phrases punch qui distillent la leçon.

SLIDE 2 — TENSION NARRATIVE OBLIGATOIRE : ne pas encore donner les conseils.
Creuser le problème avec empathie. Reformuler la douleur. Dire ce que le problème N'EST PAS.
Terminer par une invitation à swiper : "(alors prépare-toi à enregistrer)" ou équivalent.

SLIDES CONTENU (3+) : "Point N : [Verbe d'action] [objet court]" — numérotation autorisée ici.

TON : tutoiement chaleureux. Phrases courtes. Humour doux. Concret du quotidien pro.
Jamais de conseil générique sans exemple. L'exemple > l'affirmation abstraite.

SLIDE CONCLUSION : question douce ou affirmation légère. CTA naturel ancré dans le contenu.
JAMAIS "likez, commentez, abonnez-vous".
=== FIN MODE VISIBILITÉ ===
` : '';
// Règles spéciales Activité — 3 niveaux
const reglesActivite = pilier === 'activite' ? `

=== MODE ACTIVITÉ : 3 NIVEAUX DE CONTENU ===

Détecte le niveau selon le sujet fourni par l'utilisateur :

NIVEAU 1 — MONTRER L'ACTIVITÉ (défaut si rien n'est précisé)
But : créer de la proximité, de la confiance, de l'identification.
Contenu : coulisses, process, produits en situation, savoir-faire en action, journée type, avant/après.
Ton : incarné, direct, curieux. PAS de vente. PAS de prix.
Exemples par métier :
  Artisan : "Ce matin j'ai posé ce carrelage — voilà pourquoi j'ai choisi ce joint"
  Commerçant : "Ce produit est arrivé hier — voilà pourquoi je l'ai sélectionné"
  Praticien : "En consultation aujourd'hui, une patiente m'a dit quelque chose qui m'a frappée"
  Créatif : "Voilà comment je prépare un shooting — chaque détail compte"
Structure :
  - Hook : scène concrète, pas un concept abstrait
  - Corps : détails sensoriels, gestes, matières, sons — ce qui donne l'impression d'y être
  - CTA : question ouverte ou invitation à réagir depuis l'expérience du lecteur

NIVEAU 2 — METTRE EN AVANT UNE OFFRE
But : présenter un produit ou service de façon désirable, sans pression.
Contenu : description de l'offre ancrée dans la situation vécue par le client.
Ton : utile, bienveillant. L'offre arrive APRÈS la situation — jamais en premier.
Structure OBLIGATOIRE :
  1. Situation vécue par le client (1-2 phrases) — ce qu'il ressent, cherche, subit
  2. Ce que le produit/service change concrètement — 1 bénéfice par paragraphe max
  3. Invitation douce — pas "achetez", mais "si tu te reconnais dans ça, voilà ce que je propose"
Exemples :
  Commerçant : "Tu cherches [produit] mais tu ne veux pas [inconvénient courant] ? Voilà ce qu'on a en boutique."
  Artisan : "Tu veux [résultat] sans [galère habituelle] ? Voilà comment on travaille."
  Praticien : "Si tu vis avec [douleur] depuis trop longtemps — voilà ce qui peut changer."

NIVEAU 3 — PROMOTION DIRECTE
But : annoncer une promotion, une offre spéciale, un événement limité.
Conditions : l'utilisateur mentionne un prix, une date, un code promo, ou les mots "promotion", "offre spéciale", "soldes", "lancement".
Ton : enthousiaste mais pas criant. La rareté ou l'urgence est réelle, jamais fabriquée.
Structure OBLIGATOIRE :
  1. L'événement ou la durée — dès la première phrase ("Jusqu'au [date]" / "Ce week-end seulement")
  2. L'offre précise — produit, service, réduction, condition
  3. Pourquoi maintenant — une raison sincère (anniversaire boutique, fin de saison, arrivage limité…)
  4. CTA direct et simple — "Passe en boutique" / "Réserve ta place" / "Envoie-moi un message"
INTERDIT : urgence artificielle, fausses pénuries, "offre valable jusqu'à épuisement" sans raison réelle.

RÈGLE GLOBALE ACTIVITÉ :
- Si le sujet contient un prix, une date limite, un code → NIVEAU 3
- Si le sujet parle d'un produit ou service spécifique sans date ni prix → NIVEAU 2
- Sinon → NIVEAU 1
=== FIN MODE ACTIVITÉ ===
` : '';
// Règles spéciales Expertise injectées dans le prompt
const reglesExpertise = pilier === 'expertise' ? `

=== MODE EXPERTISE : CARROUSEL PÉDAGOGIQUE À IMPACT ===
Ce pilier demande un carrousel de type "démonstration chiffrée" — le plus partagé et sauvegardé sur les réseaux sociaux.

RÈGLE 2 — MISE EN ACCENT DU TITRE :
Dans le champ "titre" de chaque slide, entoure le groupe de mots le plus fort avec [ACCENT]...[/ACCENT].
Ce groupe sera affiché dans la couleur de charte du professionnel.
Choisis la partie émotionnelle ou chiffrée — pas les mots fonctionnels.
Ex : "Ne plus [ACCENT]avoir besoin de travailler[/ACCENT] ?"
Ex : "[ACCENT]67% des TPE[/ACCENT] ne publient jamais"
MAXIMUM 1 groupe accent par titre.

RÈGLE 3 — SOUS-TITRE SLIDE 1 = PROMESSE DE VALEUR EXPLICITE :
Le sous-titre de la slide 1 doit annoncer exactement ce que le lecteur va apprendre en swipant.
Format obligatoire : "[Élément concret 1], [élément concret 2], et [bénéfice direct pour le lecteur]."
Ex : "La règle, les chiffres, et ce que ça change pour toi aujourd'hui."
Ex : "L'erreur, la méthode, et comment l'appliquer dès cette semaine."
Pas de formule vague. Pas de "tout ce que tu dois savoir".

RÈGLE 4 — CHIFFRES ISOLÉS DANS LE CORPS :
Si une slide contient un chiffre clé (statistique, pourcentage, montant, durée), il doit être :
- Placé en DÉBUT du champ "corps", seul, sans être noyé dans une phrase
- Suivi d'une ligne d'explication courte (max 10 mots)
Format : "[CHIFFRE CLÉ] — [explication courte]"
Ex : "847 vues en 48h — sans publicité, sans abonnés au départ"
Ex : "3x plus d'engagement — sur les posts avec données sourcées"
Si pas de chiffre pertinent sur une slide : ne pas forcer. Règle active uniquement quand un chiffre existe.

RÈGLE 6 — VARIÉTÉ OBLIGATOIRE DES FORMATS DE SLIDES 2 À 6 :
Les 5 slides de contenu ne doivent PAS être au même format.
Alterne obligatoirement entre ces formats — utilise chacun au moins une fois :
  A) CHIFFRE GÉANT : 1 stat chiffrée en corps + 1 ligne d'explication
  B) LISTE 3 ÉLÉMENTS : 3 points courts, chacun sur sa ligne, séparés par "/"
  C) COMPARAISON AVANT/APRÈS : "❌ [croyance fausse]" puis "✅ [réalité]"
  D) ÉTAPES NUMÉROTÉES : "1. [action] — 2. [action] — 3. [action]"
  E) CITATION OU VERBATIM : une vraie phrase dite par un client ou par le professionnel, entre guillemets

Dans le champ "sousTitre", indique le format utilisé avec le code : [FORMAT:A], [FORMAT:B], etc.
Cela permet au viewer de l'adapter visuellement.
=== FIN MODE EXPERTISE ===
` : '';

  // ── CARROUSEL LINKEDIN ─────────────────────────────────────
  // Bloc figure narrative pour carrousel (si fournie)
  const figureBlocCV = figureCarrousel ? `

═══ STRUCTURE NARRATIVE — FIGURE "${figureCarrousel.nom}" (code ${figureCarrousel.code}) ═══
LEVIER PSYCHOLOGIQUE : ${figureCarrousel.levier}
MÉCANIQUE À RESPECTER : ${figureCarrousel.desc}

Le carrousel doit suivre cette mécanique narrative :
- Slide 1 (hook) : amorcer la figure (premier élément de la mécanique)
- Slides 2 à N-1 (contenu) : dérouler progressivement la mécanique
- Slide N (conclusion) : aboutir à l'effet psychologique du levier

Cette figure rend ce carrousel UNIQUE — ne pas tomber dans une structure générique "introduction / 3 conseils / conclusion".
═══

` : '';

  if (format === 'Carrousel' && estLI) {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt + legendeCarrouselLI +
      "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n\n" +
      figureBlocCV +
      `Génère un CARROUSEL LinkedIn (ratio 3:4).
Hook slide 1 — LINKEDIN : insight professionnel, donnée chiffrée ou observation terrain percutante.
La slide 1 ancre le carrousel dans une réalité professionnelle concrète.
Si une photo est disponible dans la matière (Q7), le CTA ou le hook peut y faire référence.

${reglesCVLI}
${reglesExpertise}
${reglesVisibilite}
${reglesActivite}

RÈGLE ABSOLUE : réponds UNIQUEMENT avec le JSON brut. Commence par { et termine par }.
Termine TOUJOURS par l'accolade fermante } — ne coupe JAMAIS en plein milieu d'une slide.


RÈGLE SLIDE "SURPRISE" — OBLIGATOIRE si le carrousel fait 6 slides ou plus :
Intercale au moins 1 slide de type "surprise" entre 2 slides de contenu.
La slide surprise N'EST PAS un conseil. C'est une rupture de rythme délibérée pour retenir l'attention.

4 variantes (choisir selon le sujet) :
A) INTERPELLATION DIRECTE : phrase courte qui s'adresse personnellement au lecteur.
   Ex : "Est-ce que tu fais partie de ceux qui…"
B) AVIS DE PRO : ton point de vue personnel et tranché sur ce qui vient d'être dit.
   Ex : "Mon avis : la plupart n'appliquent jamais ce point. Pas par manque de temps. Par peur."
C) FAIT INATTENDU : donnée courte et surprenante liée au sujet, non mentionnée avant.
D) BASCULE DE POINT DE VUE : reformulation vue du côté du client.
   Ex : "Ce que voit ton client quand tu ne fais pas ça : quelqu'un qui improvise."

Position : toujours entre 2 slides de contenu (jamais en slide 1 ou dernière slide).
Format JSON : "type": "surprise" — Titre max 10 mots. Corps : 1-2 phrases. Sous-titre : vide ou variante utilisée.

NOMBRE DE SLIDES : 5 à 12 selon le sujet. La dernière slide est toujours "conclusion".

{
  "slides": [
    {"num": 1, "type": "hook",       "titre": "...", "sousTitre": "...", "corps": ""},
    {"num": 2, "type": "contenu",    "titre": "...", "sousTitre": "[FORMAT:A/B/C/D/E selon règle 6]", "corps": "..."},
    ... (autant de slides contenu que nécessaire, entre 3 et 10)
    {"num": X, "type": "surprise",   "titre": "...", "sousTitre": "...", "corps": "..."},
    ... (continuer les slides de contenu)
    {"num": N, "type": "conclusion", "titre": "...", "sousTitre": "...", "corps": "..."}
  ],
  "legende": "hook\\n\\ndeveloppement\\n\\nCTA\\n\\n#hashtag1 #hashtag2 #hashtag3"
}

Règles slides :
- Slide 1 : titre max 10 mots. Sous-titre max 8 mots (= promesse de valeur si pilier Expertise ou Visibilité).
- Slide 2 (TOUJOURS) : NE PAS encore donner le premier conseil. Creuser le problème / créer la tension narrative. Corps : 2-3 phrases courtes + invitation à swiper ("(alors prépare-toi à enregistrer)" ou équivalent naturel). 1 seule idée par slide.
- Slides 3+ : titre max 5 mots (ou "Point N : [action]" pour Visibilité). Corps max 22 mots. 1 seule idée.
  En mode Expertise : sousTitre = code format [FORMAT:X]. En mode Visibilité : structure 3 couches (affirmation → exemple → punch). Sinon : texte libre max 6 mots.
- Slide 7 (conclusion) : question ouverte émotionnelle qui parle AU LECTEUR.
  Sous-titre max 8 mots. INTERDIT : mention offre, formation, lien bio, services de l'auteur.
- Jamais de slide surchargée — l'espace vide est un outil de lecture.
- INTERDIT : ne jamais écrire les mots "Hook", "Contenu", "CTA", "Conclusion", "Introduction" dans les titres ou sous-titres des slides. Ces labels sont réservés au code, pas au contenu visible.
- INTERDIT dans les titres et sous-titres : chiffres de hiérarchie (1. 2. 3.), lettres de liste (A. B. C.), numéros entre parenthèses (1) 2) 3)). 1 slide = 1 seule idée autonome, jamais une liste numérotée.
- INTERDIT dans le corps des slides : guillemets autour des exemples ❌/✅. Format correct : ❌ Phrase fausse. ✅ Phrase vraie. Jamais de guillemets ni d'apostrophes autour des phrases d'exemple.` + rappelSujet;
  }

  // ── CARROUSEL INSTAGRAM ────────────────────────────────────
  if (format === 'Carrousel' && !estLI) {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt + legendeCarrouselIG +
      "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n\n" +
      figureBlocCV +
      `Génère un CARROUSEL Instagram (ratio 3:4).
Hook slide 1 — INSTAGRAM : crée une TENSION ou une QUESTION immédiate.
Phrase courte qui provoque curiosité, surprise ou identification forte.
Ex : "Elle publiait depuis 8 mois. Personne ne la voyait. Voici pourquoi."
Si une photo est disponible dans la matière (Q7), le hook ou le CTA peut y faire référence.

${reglesCVIG}
${reglesExpertise}
${reglesVisibilite}
${reglesActivite}

RÈGLE ABSOLUE : réponds UNIQUEMENT avec le JSON brut. Commence par { et termine par }.
Termine TOUJOURS par l'accolade fermante } — ne coupe JAMAIS en plein milieu d'une slide.


RÈGLE SLIDE "SURPRISE" — OBLIGATOIRE si le carrousel fait 6 slides ou plus :
Intercale au moins 1 slide de type "surprise" entre 2 slides de contenu.
La slide surprise N'EST PAS un conseil. C'est une rupture de rythme délibérée pour retenir l'attention.

4 variantes (choisir selon le sujet) :
A) INTERPELLATION DIRECTE : phrase courte qui s'adresse personnellement au lecteur.
   Ex : "Est-ce que tu fais partie de ceux qui…"
B) AVIS DE PRO : ton point de vue personnel et tranché sur ce qui vient d'être dit.
   Ex : "Mon avis : la plupart n'appliquent jamais ce point. Pas par manque de temps. Par peur."
C) FAIT INATTENDU : donnée courte et surprenante liée au sujet, non mentionnée avant.
D) BASCULE DE POINT DE VUE : reformulation vue du côté du client.
   Ex : "Ce que voit ton client quand tu ne fais pas ça : quelqu'un qui improvise."

Position : toujours entre 2 slides de contenu (jamais en slide 1 ou dernière slide).
Format JSON : "type": "surprise" — Titre max 10 mots. Corps : 1-2 phrases. Sous-titre : vide ou variante utilisée.

NOMBRE DE SLIDES : 5 à 12 selon le sujet. La dernière slide est toujours "conclusion".

{
  "slides": [
    {"num": 1, "type": "hook",       "titre": "...", "sousTitre": "...", "corps": ""},
    {"num": 2, "type": "contenu",    "titre": "...", "sousTitre": "[FORMAT:A/B/C/D/E selon règle 6]", "corps": "..."},
    ... (autant de slides contenu que nécessaire, entre 3 et 10)
    {"num": X, "type": "surprise",   "titre": "...", "sousTitre": "...", "corps": "..."},
    ... (continuer les slides de contenu)
    {"num": N, "type": "conclusion", "titre": "...", "sousTitre": "...", "corps": "..."}
  ],
  "legende": "hook 👀\\n\\ndeveloppement\\n\\nCTA\\n\\n#h1 #h2 #h3 #h4 #h5"
}

Règles slides :
- Slide 1 : titre tension/question max 8 mots. Sous-titre max 10 mots (= promesse de valeur si pilier Expertise ou Visibilité).
- Slide 2 (TOUJOURS) : NE PAS encore donner le premier conseil. Creuser le problème / créer la tension narrative. Corps : 2-3 phrases courtes + invitation à swiper ("(alors prépare-toi à enregistrer)" ou équivalent). 1 seule idée.
- Slides 3+ : titre max 5 mots (ou "Point N : [action]" pour Visibilité). Corps max 22 mots. 1 seule idée.
  En mode Expertise : sousTitre = code format [FORMAT:X]. En mode Visibilité : structure 3 couches. Sinon : texte libre max 6 mots.
- Slide 7 (conclusion) : invitation douce au partage vers la cible cliente. Parle AU LECTEUR.
  INTERDIT : mention offre, formation, lien bio, services.
  AUTORISÉ : "Pense à envoyer ce carrousel à [cible cliente déduite du profil] que tu connais."
- Jamais de slide surchargée.
- INTERDIT dans les titres et sous-titres : chiffres de hiérarchie (1. 2. 3.), lettres de liste (A. B. C.), numéros entre parenthèses. 1 slide = 1 seule idée autonome.
- INTERDIT dans le corps des slides : guillemets autour des exemples ❌/✅. Format correct : ❌ Phrase fausse. ✅ Phrase vraie. Jamais de guillemets autour des exemples.
- INTERDIT dans le JSON : des guillemets droits " à l'intérieur d'une valeur string sans les échapper. Utilise des guillemets français «mot» ou l'apostrophe.
- INTERDIT dans le JSON : des guillemets droits " à l'intérieur d'une valeur string sans les échapper. Si tu veux citer un mot, utilise des guillemets français «mot» ou l'apostrophe. Jamais de " non-échappé dans le JSON.` + rappelSujet;
  }

  // ── VIDÉO LINKEDIN ─────────────────────────────────────────
  if (format === 'Vidéo' && estLI) {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt +
      "PILIER : " + pilier.toUpperCase() + "\n\n" +
      `Tu es un expert en stratégie de contenu et copywriting spécialisé dans la vidéo LinkedIn native à haute performance.
Ta mission : générer un script de vidéo LinkedIn et sa légende, adaptés au profil et à la matière de la semaine.

STRUCTURE DU SCRIPT — 4 TEMPS :

1. ACCROCHE (0-5 sec) :
   Phrase-choc + promesse claire. INTERDIT : "Aujourd'hui je vais vous parler de…" / "Bonjour, je suis…"
   Ex : "Ton profil LinkedIn existe depuis 3 ans. Mais est-ce que tes clients le savent vraiment ?"

2. DÉVELOPPEMENT (6-70 sec) — 3 points concrets :
   1 point = 1 idée actionnable immédiatement. Transitions claires.
   Ancrer dans la matière de la semaine.

3. CONCLUSION (71-80 sec) :
   Résumé de la promesse tenue. 1-2 phrases.

4. CTA ORAL (81-90 sec) :
   Invite à commenter ou partager une expérience. Jamais commercial.
   Ex : "Et toi, tu publies combien de fois par semaine ?" / "Dis-moi en commentaire ce qui te bloque."

RÈGLES :
- ~180-200 mots parlés total (60-90 sec de parole naturelle)
- Vidéo LinkedIn regardée à 85% SANS SON — le script doit fonctionner lu seul
- Ton professionnel mais humain, jamais corporate
- Respecter le tutoiement/vouvoiement du profil
- Chaque phrase courte, directe, verbe d'action

${reglesCommunesLI}

LÉGENDE LINKEDIN VIDÉO :
${legendeLI}
1 phrase d'accroche (reprend le hook vidéo) + 1 phrase développement + CTA textuel court.

FORMAT DE RÉPONSE OBLIGATOIRE — tableau 4 colonnes :

SCRIPT:
| Temps | Visuel & sous-titres à l'écran | Audio / Voix off | Émotion |
|-------|-------------------------------|------------------|---------|
| 0-5s  | [texte affiché à l'écran]     | [ce qu'on dit]   | [ton/feeling de la scène] |
(1 ligne = 1 moment clé de 3-8 secondes)

LÉGENDE:
[texte de légende prêt à poster]` + rappelSujet;
  }

  // ── RÉEL INSTAGRAM ─────────────────────────────────────────
  if (format === 'Réel') {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt +
      "PILIER : " + pilier.toUpperCase() + "\n\n" +
      `Tu es un expert en stratégie de contenu et copywriting spécialisé dans les Réels Instagram à haute performance.
Ta mission : générer un script de Réel et sa légende, adaptés au profil et à la matière de la semaine.

STRUCTURE DU SCRIPT — 4 TEMPS :

1. LE HOOK (0-3 sec) :
   ${pilier === 'autorite'
     ? "PILIER AUTORITÉ : opinion tranchée ou vérité impopulaire que peu osent dire. Arrête le scroll."
     : pilier === 'activite'
     ? "PILIER ACTIVITÉ : montre une scène concrète de ton quotidien pro, ou si le sujet l'indique, annonce l'offre ou la promo en 1 phrase directe."
     : "PILIER EXPERTISE/VISIBILITÉ : 'pattern interrupt' — casse une idée reçue ou annonce un résultat contre-intuitif. INTERDIT d'écrire 'mythe', 'mythe vs réalité' ou variantes."
   }
   Règle : 1 phrase max à l'écran, max 7 mots, lisible SANS le son.

2. LE CORPS (4-35 sec) :
   Utilise le "Je". Raconte une mini-anecdote, une erreur vécue ou une observation brute.
   Indique des changements visuels (angle caméra, texte à l'écran, b-roll) toutes les 3 secondes.
   1 à 3 pépites concrètes, actionnables, sans blabla.
   Rythme oral : 1 phrase = 1 idée. Jamais de subordonnées imbriquées.

3. LA CHUTE (36-42 sec) :
   Conclusion surprenante ou vérité impopulaire qui fait réfléchir. Phrase qui reste en tête.

4. LE CTA (43-45 sec) :
   Invite à l'interaction humaine. Jamais à la vente.
   Ex : "Et toi, t'en penses quoi ?" / "Dis-moi en commentaire si j'exagère."

RÈGLES D'ÉCRITURE :
- Première personne (Je/J')
- Ton direct, sans filtre, avec caractère — pas corporatif
- Chaque phrase sonne comme si c'était dit à voix haute naturellement
- Ancrer dans la matière de la semaine si disponible

LA LÉGENDE (caption) :
- Démarre par une phrase qui prolonge le hook du Réel
- Sauts de ligne généreux. Mélange expertise pro et authenticité.
- 5 à 8 mots-clés SEO intégrés naturellement dans le texte (pas juste en hashtag)
${legendeIG}

CONSEIL DE TOURNAGE :
1 conseil concret sur le ton, le décor ou le cadrage pour maximiser l'authenticité.

FORMAT DE RÉPONSE OBLIGATOIRE — respecter exactement, dans cet ordre, SANS EXCEPTION :

RÈGLE D'INTÉGRITÉ : Termine TOUJOURS le tableau complet jusqu'au CTA final (43-45s), puis LÉGENDE, puis CONSEIL.
Ne coupe JAMAIS en plein milieu d'une ligne ou d'une section. Un script complet de 45 secondes a entre 8 et 12 lignes.

SCRIPT:
| Temps | Visuel & texte à l'écran | Audio / Voix off | Émotion |
|-------|--------------------------|------------------|---------|
| 0-3s  | ...                      | ...              | ...     |
(1 ligne = 1 moment clé de 3-5 secondes)

LÉGENDE:
[texte de légende prêt à poster avec 5 hashtags]

CONSEIL:
[1 conseil de tournage]` + rappelSujet;
  }

  // ── STORIES INSTAGRAM ──────────────────────────────────────
  if (format === 'Stories') {
    const sujetDuJour = sujet.replace(/^\[STORY [A-Z-]+\] /, '');

    const structureParType = {
      vente: `STRUCTURE VENTE — 3 temps narratifs dans cet ordre :

1. CONTEXTE / SITUATION / AVIS (2-3 slides)
   Observation du quotidien, fait sociétal ou avis professionnel assumé.
   Amener le sujet SANS parler de soi ni de l'offre — ancrer dans ce que la cible reconnaît.
   Format : prise de parole face caméra OU photo statique avec texte.

2. DOULEUR / PROBLÈME DE LA CIBLE (2-3 slides)
   Décrire concrètement la douleur vécue. Scène de vie réelle que la cible revit en lisant.
   Détails précis, visuels, incarnés. Pas de jargon.
   Format : prise de parole face caméra OU photo statique avec texte.

3. APPEL À L'ACTION (1-2 slides)
   Pourquoi ce professionnel fait ce métier — lien personnel et sincère.
   CTA : inviter à répondre à la story OU à utiliser le sticker lien intégré pour prise de RDV ou contact.
   Ex : "Réponds à cette story pour qu'on en parle" / "Le lien est juste là 👇 [sticker lien]"

RÈGLES : max 20 mots à l'écran par slide. Première personne. Voix exacte du professionnel.`,

      'storytelling-lifestyle': `STRUCTURE STORYTELLING/LIFESTYLE — 3 à 5 slides au total :

Choisir parmi ces 3 angles selon la matière disponible :
A) Scène du quotidien pro ou perso qui révèle qui tu es (moment réel, détail humain)
B) Opinion assumée sur un sujet qui touche ta cible (prise de position claire, pas de nuance molle)
C) Valeur incarnée via une anecdote du quotidien (ce que tu fais / ce que tu crois / comment tu vis)

Structure narrative :
- Ouverture : l'instant (où, quand, quoi) — max 15 mots à l'écran
- Milieu : l'émotion ou la pensée que cet instant a provoqué — max 15 mots
- Fin : le lien avec la cible ou une conviction pro — max 15 mots

Ton : intime, spontané, sans filtre. Montrer sans démontrer.
Format : prise de parole face caméra OU photo statique avec texte selon l'angle choisi.`,

      valeur: `STRUCTURE VALEUR/ASTUCE — 4 à 5 slides :

Slide 1 : titre-choc en gros plan. Max 8 mots.
Ex : "L'erreur que font 9 pros sur 10" / "Ce que personne ne te dit sur [sujet]"

Slides 2-4 : 1 astuce OU 1 avis de pro par slide. Texte court (max 15 mots).
Suggestion de format : fond coloré ou photo statique avec texte superposé.
Alterner avec prises de parole face caméra si pertinent.

Slide finale : CTA doux — question ouverte UNIQUEMENT.
Ex : "Tu es d'accord avec ça ?" / "Tu fais partie de ces personnes aussi ?" / "Réponds-moi avec ton expérience."
JAMAIS "swipe up", "lien en bio", "réserve ta place", "commente", "enregistre".`
    };

    const structure = structureParType[storyType] || structureParType['storytelling-lifestyle'];

    return baseComplete + matiereBloc + antiBlocCourt +
      `Tu vas écrire un script de stories Instagram pour ce professionnel.

TYPE : ${storyType ? storyType.toUpperCase() : 'STORYTELLING-LIFESTYLE'}
SUJET : ${sujetDuJour}

${structure}

EXIGENCES ABSOLUES :
- Première personne, voix exacte du professionnel (profil ci-dessus)
- Chaque phrase sonne comme dit à voix haute naturellement
- Aucune phrase générique — chaque détail colle au métier, à la cible, à l'univers
- Ancrer dans la matière de la semaine si disponible
- Pas de hashtags dans le script de story

FORMAT DE RÉPONSE OBLIGATOIRE — tableau 4 colonnes :

Règles de durée par partie :
- 📹 Vidéo face cam : durée "jusqu'à 60s" — script oral COMPLET et AÉRÉ, 4-6 phrases minimum pour remplir jusqu'à 60 secondes. Sépare les phrases par " / " pour signaler les pauses naturelles.
- 🖼️ Photo statique : durée "10s" — texte court, max 15 mots, lisible en un coup d'œil.
- Colonne "Ton" : émotion ou attitude de la prise de parole (ex : bienveillant, direct, complice, sincère, posé).

SCRIPT:
| Durée | Texte à l'écran | Format & décor | Ton |
|-------|-----------------|----------------|-----|
| jusqu'à 60s | [script oral développé, phrases séparées par /] | [📹 Vidéo face cam — décor : bureau rangé, lumière naturelle] | [ton] |
| 10s | [texte court max 15 mots] | [🖼️ Photo statique — fond coloré ou capture d'écran] | [ton] |
(1 ligne = 1 partie de story)

AUCUN texte en dehors du tableau pour le script.` + rappelSujet;
  }

  // ── PHOTO INSTAGRAM ────────────────────────────────────────
  if (format === 'Photo') {
    const photoInstruction = `Le hook doit créer une TENSION ou une CURIOSITÉ sur ce que la photo montre ou cache.
Ex : "Ce que cette photo ne montre pas, c'est les 8 mois où personne ne la voyait."
Commence directement par ce hook — pas de description neutre de la photo.`;

    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + antiBlocCourt +
      "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n\n" +
      `${photoInstruction}

Génère un texte pour une publication PHOTO Instagram.
Structure : hook visuel (tension/curiosité) → développement 2 paragraphes → CTA interaction.
LONGUEUR : 100 à 180 mots.
${reglesIG}
${legendeIG}
Génère le texte du post (100-180 mots) puis "LÉGENDE:" suivi de la légende avec 5 hashtags.` + rappelSujet;
  }

  // ── POST TEXTE INSTAGRAM (défaut IG) ──────────────────────
  if (!estLI) {
    return baseComplete + sujetBlocCourt + matiereBloc + actuBloc + legendeIG + antiBlocCourt +
      "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n" + reglesIG +
      "\n\nGénère 1 post Instagram qui suit exactement cette méthode.\n" +
      "Puis \"LÉGENDE:\" suivi de la légende avec 5 hashtags selon les règles ci-dessus.";
  }

  // ── POST TEXTE LINKEDIN (défaut LI) ───────────────────────
  return base + sujetBlocCourt + matiereBloc + actuBloc + legendeLI + antiBlocCourt +
    "PILIER : " + pilier.toUpperCase() + "\n" + hook + "\n" + reglesCommunesLI +
    "\n\nSur LinkedIn, le post texte N'A PAS DE LÉGENDE SÉPARÉE.\n" +
    "Le post complet = texte + 3 hashtags intégrés en fin de texte.\n" +
    hashtagsLI +
    "\n\nGénère 1 post LinkedIn complet. Commence directement par le hook.";
}

// ============================================================
// APPEL API CLAUDE
// ============================================================
// Tentative d'appel Claude avec un modèle précis — renvoie {succes, texte?, code?, erreur?}
// Séparé pour pouvoir retry sur plusieurs modèles en cascade
function tentativeAppelClaude(cle, modele, prompt, maxTokens) {
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cle,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: modele,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  const code     = response.getResponseCode();
  const texte    = response.getContentText();
  if (code === 200) {
    try {
      const data = JSON.parse(texte);
      const stopReason = data.stop_reason || '?';
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      console.log('[API] stop_reason='+stopReason+' input='+inputTokens+' output='+outputTokens+' model='+data.model);
      return { succes: true, texte: data.content?.[0]?.text || '' };
    } catch(e) { return { succes: false, code: code, erreur: 'Parse JSON : ' + e.message }; }
  }
  return { succes: false, code: code, erreur: texte };
}

function appelClaude(cle, prompt, maxTokens) {
  maxTokens = maxTokens || 16384;

  // Vider le cache si le modèle en cache n'est pas dans la liste fallbacks
  // (protection contre un cache corrompu avec un vieux nom de modèle)
  const enCacheCheck = getModeleActif('claude');
  if (enCacheCheck && MODELES_CLAUDE_FALLBACKS.indexOf(enCacheCheck) < 0) {
    setModeleActif('claude', null);
  }
  // Construction de la liste de modèles à essayer :
  // 1. Modèle en cache (s'il existe) en priorité absolue
  // 2. Modèles par défaut hiérarchisés
  // 3. Dédupliqué pour éviter de retenter le même
  const enCache = getModeleActif('claude');
  const candidats = [];
  if (enCache) candidats.push(enCache);
  MODELES_CLAUDE_FALLBACKS.forEach(m => { if (candidats.indexOf(m) < 0) candidats.push(m); });

  let derniereErreur = null;
  let derniereCode   = null;

  for (let i = 0; i < candidats.length; i++) {
    const modele = candidats[i];
    const r = tentativeAppelClaude(cle, modele, prompt, maxTokens);
    if (r.succes) {
      // Succès — mettre en cache ce modèle si différent de l'actif actuel
      if (enCache !== modele) setModeleActif('claude', modele);
      return r.texte;
    }
    // Erreurs non récupérables — remonter immédiatement
    if (r.code === 401) throw new Error('CLE_INVALIDE_CLAUDE');
    if (r.code === 429) throw new Error('QUOTA_CLAUDE');
    // Erreur modèle obsolète → on tente le suivant
    if (estErreurModeleObsolete(r.code, r.erreur)) {
      console.log('Modèle Claude obsolète : ' + modele + ' → essai suivant');
      derniereErreur = r.erreur;
      derniereCode   = r.code;
      continue;
    }
    // Autre erreur → remonter avec le vrai message Anthropic
    let msgErreur = 'ERREUR_API_' + r.code;
    try {
      const parsed = JSON.parse(r.erreur);
      if (parsed && parsed.error && parsed.error.message) {
        msgErreur = parsed.error.message;
      }
    } catch(e) {}
    throw new Error(msgErreur);
  }

  // Si on arrive ici, tous les fallbacks ont échoué — tentative d'auto-découverte
  console.log('Tous les fallbacks Claude épuisés — auto-découverte…');
  const decouverts = decouvrirModelesClaude(cle);
  for (let i = 0; i < decouverts.length; i++) {
    const modele = decouverts[i];
    // Ne pas retenter ceux déjà essayés
    if (candidats.indexOf(modele) >= 0) continue;
    const r = tentativeAppelClaude(cle, modele, prompt, maxTokens);
    if (r.succes) {
      console.log('Auto-découverte réussie : ' + modele);
      setModeleActif('claude', modele);
      return r.texte;
    }
  }

  throw new Error('AUCUN_MODELE_CLAUDE_DISPONIBLE (dernier code : ' + derniereCode + ')');
}

// ============================================================
// APPEL API GEMINI
// ============================================================
// Tentative d'appel Gemini avec un modèle précis
function tentativeAppelGemini(cle, modele, prompt, maxTokens) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modele + ':generateContent?key=' + cle;
  const options = {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens }
    }),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();
  const texte    = response.getContentText();
  if (code === 200) {
    try {
      const data = JSON.parse(texte);
      return { succes: true, texte: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    } catch(e) { return { succes: false, code: code, erreur: 'Parse JSON : ' + e.message }; }
  }
  return { succes: false, code: code, erreur: texte };
}

function appelGemini(cle, prompt, maxTokens) {
  maxTokens = maxTokens || 16384;

  const enCache = getModeleActif('gemini');
  const candidats = [];
  if (enCache) candidats.push(enCache);
  MODELES_GEMINI_FALLBACKS.forEach(m => { if (candidats.indexOf(m) < 0) candidats.push(m); });

  let derniereErreur = null;
  let derniereCode   = null;

  for (let i = 0; i < candidats.length; i++) {
    const modele = candidats[i];
    const r = tentativeAppelGemini(cle, modele, prompt, maxTokens);
    if (r.succes) {
      if (enCache !== modele) setModeleActif('gemini', modele);
      return r.texte;
    }
    // Auth erreur → remonter
    if (r.code === 401 || r.code === 403) {
      const t = String(r.erreur || '').toLowerCase();
      if (t.indexOf('api key') >= 0 || t.indexOf('permission') >= 0) {
        throw new Error('CLE_INVALIDE_GEMINI');
      }
    }
    if (r.code === 429) throw new Error('QUOTA_GEMINI');
    if (estErreurModeleObsolete(r.code, r.erreur)) {
      console.log('Modèle Gemini obsolète : ' + modele + ' → essai suivant');
      derniereErreur = r.erreur;
      derniereCode   = r.code;
      continue;
    }
    throw new Error('ERREUR_GEMINI_' + r.code);
  }

  // Auto-découverte
  console.log('Tous les fallbacks Gemini épuisés — auto-découverte…');
  const decouverts = decouvrirModelesGemini(cle);
  for (let i = 0; i < decouverts.length; i++) {
    const modele = decouverts[i];
    if (candidats.indexOf(modele) >= 0) continue;
    const r = tentativeAppelGemini(cle, modele, prompt, maxTokens);
    if (r.succes) {
      console.log('Auto-découverte réussie : ' + modele);
      setModeleActif('gemini', modele);
      return r.texte;
    }
  }

  throw new Error('AUCUN_MODELE_GEMINI_DISPONIBLE (dernier code : ' + derniereCode + ')');
}

// ============================================================
// FIGURES NARRATIVES — Prompts spécialisés
// 15 figures × 2 plateformes (LI + IG)
// Chaque figure = levier psychologique + mécanique narrative précise
// ============================================================

function construireFigurePrompt(figure, reseau, pilier, profil, matiere, sujet, rappelSujet, antiRedondance) {
  const estLI = reseau === 'LinkedIn';
  const code = figure.code;

  // ── Anti-redondance — injecté dans tous les prompts figure ──
  const antiBlocFigure = antiRedondance
    ? `

ANTI-REDONDANCE (les 5 derniers posts) :
${String(antiRedondance).substring(0, 600)}
Évite tout sujet ou formulation similaire.
`
    : '';

  // ── Contexte commun à toutes les figures ────────────────────
  // (profil déjà construit par construireContexteIA, on l'enrichit avec la figure)
  const intro = estLI
    ? `Tu es un expert en stratégie de contenu LinkedIn pour professionnels indépendants et PME.
Ta mission : créer un post LinkedIn qui s'arrête dans le fil, crée de l'engagement et positionne l'auteur.

GRAMMAIRE LINKEDIN — règles non négociables :
- Hook : 1-2 phrases maximum avant le "Voir plus" (~140 caractères). Doit créer de la tension ou de la curiosité.
- Corps : paragraphes courts (2-3 phrases max). Un espace blanc entre chaque.
- Listes à puces : acceptées si elles apportent de la clarté. Max 5 items.
- CTA : question directe ou invitation concrète. Jamais à la vente directe.
- Longueur totale : 800-1500 caractères. Pas de hashtag dans le corps — 3 max à la fin.
- Ton : professionnel mais humain. L'émotion est admise si légitimée par l'expertise.`
    : `Tu es un expert en stratégie de contenu Instagram pour professionnels locaux et créateurs.
Ta mission : créer un post Instagram qui arrête le scroll en 0,3 secondes et génère de l'engagement authentique.

GRAMMAIRE INSTAGRAM — règles non négociables :
- Hook : 1 phrase ultra-courte (max 10 mots). Visuel, émotionnel, ou paradoxal. SANS "bonjour", SANS introduction.
- Corps : 1-2 phrases par paragraphe, retour à la ligne systématique.
- Le "Je" est obligatoire — l'authenticité incarnée prime sur tout.
- Émojis : marqueurs visuels (pas décoratifs). 1 par paragraphe max. Cohérents avec la marque.
- CTA : interaction humaine uniquement. Jamais à la vente directe.
- Longueur caption : 150-400 mots. 5 hashtags en fin de légende seulement.
- Ton : direct, sans filtre, avec caractère. Chaque phrase sonne comme si elle était dite à voix haute.`;

  const sujetBloc = sujet ? `\n\nSUJET DU POST — PRIORITÉ ABSOLUE :\n${sujet}\nTout le post gravite autour de ce sujet. L'IA ne doit jamais le dénaturer ni le diluer.\n` : '';

  const matiereBloc = matiere ? `\n\nMATIÈRE DE LA SEMAINE — source d'inspiration :\n${matiere}\n` : '';

  // ══════════════════════════════════════════════════════════════
  // EXPERTISE
  // ══════════════════════════════════════════════════════════════

  if (code === 'E1') {
    // La preuve par le chiffre — levier : autorité cognitive
    const mecanique = estLI
      ? `FIGURE : "La preuve par le chiffre"
LEVIER : Autorité cognitive — un chiffre concret crée une ancre mentale que le cerveau ne peut pas ignorer.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Le chiffre ou le résultat surprenant en premier. Pas d'introduction. Ex : "87% des artisans font cette erreur sans le savoir."
  2. CONTEXTE : D'où vient ce chiffre ? Que révèle-t-il sur la réalité du secteur ?
  3. INTERPRÉTATION : Ce que ça signifie concrètement pour la cible (1 implication par paragraphe)
  4. ACTION : Ce que ça change dans la pratique — conseil actionnable, pas générique.
  5. CTA : Question qui invite le lecteur à confronter ce chiffre à sa propre réalité.
INTERDIT : statistiques non sourcées ou trop vieilles. Si pas de chiffre dans la matière, en déduire un de l'observation professionnelle (et le formuler comme tel : "Dans mon expérience...").`
      : `FIGURE : "La preuve par le chiffre"
LEVIER : Autorité cognitive — un chiffre dans les premières secondes arrête le scroll et force la curiosité.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Le chiffre seul, sans contexte. Maximum 8 mots. Ex : "9 clients sur 10 me posent la même question."
  2. TENSION : Le lecteur ne sait pas encore pourquoi ce chiffre est important — créer la frustration positive.
  3. RÉVÉLATION : Ce que ce chiffre révèle sur la réalité vécue par la cible.
  4. PÉPITE : 1 seule action concrète. Courte. Pas de liste.
  5. CTA : Question personnelle. "Et toi ?"
Caption : commence par une reformulation du chiffre avec une conséquence émotionnelle. Légende + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'E2') {
    // Le mythe déconstruit — levier : dissonance cognitive
    const mecanique = estLI
      ? `FIGURE : "Le mythe déconstruit"
LEVIER : Dissonance cognitive — corriger une croyance répandue crée un inconfort productif qui pousse à lire jusqu'au bout.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Énoncer la croyance répandue comme si on l'admettait — puis la renverser immédiatement. Ex : "On dit tous que [croyance]. C'est faux."
  2. D'OÙ VIENT CE MYTHE : origine compréhensible (pas de jugement) — montrer qu'on comprend pourquoi les gens y croient.
  3. LA FISSURE : le moment ou l'observation qui a changé la perspective de l'auteur.
  4. LA VÉRITÉ ALTERNATIVE : ce qui fonctionne vraiment, avec preuves ou exemples concrets.
  5. CTA : "Et toi, tu as encore cette croyance ?" ou confrontation directe.
INTERDIT : "mythe", "réalité", "mythe vs réalité", "idée reçue" dans les titres.
INTERDIT : démonter une croyance que la cible n'a pas réellement.`
      : `FIGURE : "Le mythe déconstruit"
LEVIER : Dissonance cognitive — contredire une croyance courante crée un choc cognitif qui force l'arrêt du scroll.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La croyance répandue retournée en une phrase. Pattern : "[Ce que tout le monde croit]... c'est faux." ou "Non. [Affirmation inverse]."
  2. TENSION : Je l'ai cru aussi. Scène personnelle courte pour créer l'identification.
  3. RENVERSEMENT : Ce qui change quand on abandonne cette croyance — effet concret, vécu.
  4. NOUVELLE RÈGLE : La vérité alternative en 1-2 phrases ultra-courtes. Mémorable.
  5. CTA : "Tu le savais ?" ou "Tu y croyais encore ?"
INTERDIT : les mots "mythe", "réalité", "idée reçue" — trouver un angle personnel.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'E3') {
    // Le tutoriel incarné — levier : apprentissage vicariant
    const mecanique = estLI
      ? `FIGURE : "Le tutoriel incarné"
LEVIER : Apprentissage vicariant — on apprend en observant quelqu'un d'autre faire. L'incarnation ("je fais") crée plus de confiance que le prescriptif ("tu dois faire").
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Le résultat obtenu grâce à cette méthode. Concret, mesurable si possible. "Voilà comment je [résultat]."
  2. POURQUOI CETTE MÉTHODE : Contexte personnel — pourquoi l'auteur a développé ou adopté ce process.
  3. LES ÉTAPES : 3 à 5 étapes max. Chaque étape = 1 action concrète. Format : "D'abord... Ensuite... Enfin..."
  4. LE DÉTAIL QUI CHANGE TOUT : 1 astuce spécifique, non-évidente, issue de l'expérience réelle.
  5. CTA : "Et toi, comment tu fais ?" ou invitation à partager sa version.
INTERDIT : liste générique. Chaque étape doit sonner comme si elle venait d'une vraie pratique.`
      : `FIGURE : "Le tutoriel incarné"
LEVIER : Apprentissage vicariant — voir quelqu'un faire step-by-step crée plus d'engagement qu'une liste d'instructions.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Voilà exactement comment je [action]" — concret, direct, sans fioritures.
  2. CONTEXTE COURT : Pourquoi cette méthode, en 1 phrase.
  3. ÉTAPES : 3 max. Chaque étape = 1 phrase. Format oral, pas académique.
  4. LA PÉPITE : L'astuce que personne ne donne d'habitude. Vécue, pas théorique.
  5. CTA : "Tu testes et tu me dis ?" ou "Sauvegarde pour ne pas oublier."
Caption : développe une étape en profondeur + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'E4') {
    // Le cas client raconté — levier : projection-identification
    const mecanique = estLI
      ? `FIGURE : "Le cas client raconté"
LEVIER : Projection-identification — le lecteur se reconnaît dans la situation du client et imagine sa propre transformation.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La situation de départ du client. Concrète, reconnaissable. Anonymisée si nécessaire. "Un de mes clients avait [problème précis]."
  2. LE BLOCAGE : Ce qui empêchait d'avancer. La douleur réelle, pas la surface.
  3. LE TOURNANT : L'intervention, la décision, le changement — ce qui a tout basculé.
  4. LE RÉSULTAT : Mesurable si possible. Toujours formulé du point de vue du client, pas de l'auteur.
  5. LE PRINCIPE GÉNÉRALISABLE : Ce que ce cas apprend à tous. "Ce que j'en retiens..."
  6. CTA : "Tu te reconnais dans cette situation ?"
INTERDIT : se mettre en avant. Le héros = le client. L'auteur est le guide.`
      : `FIGURE : "Le cas client raconté"
LEVIER : Projection-identification — l'histoire d'un client devient le miroir de la situation du lecteur.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La situation de départ du client en 1 phrase. Doit résonner avec la douleur de la cible.
  2. AVANT : Ce que vivait le client. Détails précis qui créent l'identification.
  3. LE DÉCLIC : Ce qui a changé. Court. Émotionnel.
  4. APRÈS : Le résultat. En mots du client si possible, pas en jargon pro.
  5. CTA : "Et toi, tu en es où ?" ou "Écris-moi si tu te reconnais dans ça."
Caption : développe le côté émotionnel + hashtags.
INTERDIT : se glorifier. Le client est le héros.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  // ══════════════════════════════════════════════════════════════
  // AUTORITÉ
  // ══════════════════════════════════════════════════════════════

  if (code === 'A1') {
    // L'opinion tranchée — levier : biais de conformité inversé
    const mecanique = estLI
      ? `FIGURE : "L'opinion tranchée"
LEVIER : Biais de conformité inversé — prendre une position claire et défendable attire ceux qui partagent cet avis et polarise positivement.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La prise de position, nette, sans nuance d'introduction. "Je pense que [position]." ou "[Affirmation forte]."
  2. L'ARGUMENT PRINCIPAL : Pourquoi l'auteur pense ça. 1 argument solide, pas une liste.
  3. CE QUE ÇA CHANGE : L'implication pratique de cette opinion. Concret.
  4. L'OBJECTION ANTICIPÉE : Reconnaître honnêtement que d'autres peuvent penser différemment — sans se dédire.
  5. CTA : Invitation directe au débat. "Et toi ? Tu es d'accord ou pas du tout ?"
INTERDIT : l'opinion molle ou le "d'un côté... de l'autre". Une opinion = une position.
INTERDIT : les opinions non liées au domaine d'expertise ou aux valeurs professionnelles.`
      : `FIGURE : "L'opinion tranchée"
LEVIER : Biais de conformité inversé — une prise de position clivante arrête le scroll et force à réagir.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : L'opinion en 1 phrase. Directe, pas de "je pense que" — juste l'affirmation.
  2. POURQUOI : 1-2 phrases. L'expérience qui a forgé cet avis.
  3. CE QUE ÇA IMPLIQUE : 1 conséquence concrète pour la cible.
  4. L'INVITATION : "Tu es d'accord ?" ou "Dis-moi ce que tu en penses en commentaire."
Format IG : ultra-court. Pas de liste. Ton direct, presque provocateur mais jamais irrespectueux.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'A2') {
    // La coulisse révélatrice — levier : curiosity gap + transparence
    const mecanique = estLI
      ? `FIGURE : "La coulisse révélatrice"
LEVIER : Curiosity gap + transparence — montrer ce que personne ne montre crée une tension narrative et humanise l'expert.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Ce que personne ne vous montre dans [domaine]." ou "Voilà ce qui se passe vraiment quand [situation]."
  2. LA SCÈNE : Description concrète d'une coulisse professionnelle. Détails sensoriels. Ce qui se passe avant/pendant/après.
  3. CE QUE ÇA RÉVÈLE : L'insight qui vient de cette coulisse — ce que ça apprend sur le métier, le client, soi-même.
  4. LA LEÇON TRANSFÉRABLE : Ce que le lecteur peut en tirer pour sa propre pratique.
  5. CTA : Question qui invite à partager sa propre expérience de coulisse.
INTERDIT : la fausse transparence. Si on montre une coulisse, elle doit être vraie et légèrement vulnérable.`
      : `FIGURE : "La coulisse révélatrice"
LEVIER : Curiosity gap — les coulisses créent une intimité qui renforce la confiance et pousse à s'abonner.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Ce que vous ne voyez jamais sur [activité]." ou "Ce matin j'ai [action de coulisse]."
  2. LA SCÈNE : 3-4 lignes max. Concrètes, sensorielles, humaines.
  3. L'INSIGHT : Ce que cette coulisse m'a appris ou révèle.
  4. CTA : "C'est pareil chez toi ?" ou invitation à commenter.
Caption : développe une réflexion née de cette coulisse + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'A3') {
    // La lettre ouverte — levier : empathie directe
    const mecanique = estLI
      ? `FIGURE : "La lettre ouverte"
LEVIER : Empathie directe — s'adresser directement à un sous-groupe précis de la cible crée un sentiment d'être vu et compris.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Cette publication s'adresse à ceux qui [description précise du sous-groupe]." — Être très spécifique sur qui est visé.
  2. CE QUE JE SAIS DE TOI : Décrire ce que vit ce sous-groupe avec empathie et précision. Pas de jugement.
  3. CE QUE JE VEUX TE DIRE : Le message du cœur — ce que l'auteur aurait aimé entendre dans cette situation.
  4. LE CONSEIL SINCÈRE : 1 seul. Concret. Issu de l'expérience.
  5. CTA : Invitation à répondre si la personne se reconnaît.
INTERDIT : le ciblage trop large ("à ceux qui travaillent dur"). Doit être ultra-spécifique.`
      : `FIGURE : "La lettre ouverte"
LEVIER : Empathie directe — être nommé dans un post crée un sentiment immédiat de connexion.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Pour toi qui [description très précise]." ou "Si tu [situation spécifique], ce post est pour toi."
  2. JE TE VOIS : Décrire leur réalité avec des détails qui font dire "c'est exactement ça".
  3. CE QUE TU MÉRITES D'ENTENDRE : Message sincère, sans condescendance.
  4. CTA : "Réponds-moi si c'est toi." ou "Envoie ça à quelqu'un qui en a besoin."
Format ultra-personnel, presque intime.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'A4') {
    // Le bilan de secteur — levier : expertise contextualisée
    const mecanique = estLI
      ? `FIGURE : "Le bilan de secteur"
LEVIER : Expertise contextualisée — partager ce qu'on observe dans son secteur positionne l'auteur comme observateur privilegié et interprète du réel.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Ce que j'observe en ce moment dans [secteur/domaine]." — ancrer dans le temps présent.
  2. L'OBSERVATION : Tendance, changement de comportement, évolution. Concrète, pas abstraite.
  3. POURQUOI ÇA ARRIVE : L'analyse de l'auteur. Pas une liste de causes — un argument principal.
  4. CE QUE ÇA SIGNIFIE : Pour la cible, concrètement. Opportunité ou risque ?
  5. CTA : "Vous observez la même chose ?" ou "Comment vous adaptez-vous ?"
INTERDIT : pseudo-analyse creuse. Chaque observation doit venir d'une expérience réelle.`
      : `FIGURE : "Le bilan de secteur"
LEVIER : Expertise contextualisée — partager une observation de terrain positionne comme insider du domaine.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Ce que je vois changer en ce moment dans [domaine]." — 1 phrase, présent, spécifique.
  2. L'OBSERVATION : Courte, concrète, avec un exemple ou une situation vécue.
  3. MON ANALYSE : Ce que ça signifie pour la cible — 1-2 phrases, angle personnel.
  4. CTA : "Tu observes la même chose ?" ou "C'est pareil dans ton domaine ?"
Format IG : ancré dans l'observation terrain, pas dans l'analyse académique.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  // ══════════════════════════════════════════════════════════════
  // VISIBILITÉ
  // ══════════════════════════════════════════════════════════════

  if (code === 'V1') {
    // La liste actionnable — levier : utilité perçue + effet de liste
    const mecanique = estLI
      ? `FIGURE : "La liste actionnable"
LEVIER : Utilité perçue + effet de liste — le cerveau perçoit une liste comme un objet de valeur prêt à l'emploi.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Annonce la promesse de la liste. Ex : "3 choses que j'aurais aimé savoir avant de [situation]."
  2. TRANSITION : 1 phrase pour contextualiser pourquoi cette liste maintenant.
  3. LA LISTE : 3 à 7 items maximum. Chaque item = 1 action ou 1 idée autonome. Format : bullet ou numéroté.
     → Chaque item doit avoir assez de substance pour être partagé seul.
  4. LA CONCLUSION : Ce que l'auteur retient de tout ça. Pas un résumé — un angle supplémentaire.
  5. CTA : "Lequel résonne le plus pour toi ?"
INTERDIT : les listes de platitudes. Chaque item doit apporter quelque chose de non-évident.`
      : `FIGURE : "La liste actionnable"
LEVIER : Utilité perçue — une liste est l'un des formats les plus sauvegardés sur Instagram.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "N choses que [proposition de valeur]." Ultra-clair, ultra-direct.
  2. LA LISTE : Max 5 items. Chaque item = 1 ligne. Émoji au début si cohérent avec la marque.
  3. CONCLUSION : 1 phrase — la synthèse inattendue ou le conseil méta.
  4. CTA : "Sauvegarde pour t'en souvenir." ou "Lequel te parle le plus ?"
Caption : développe 1 item en particulier + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'V2') {
    // La question miroir — levier : réciprocité + introspection
    const mecanique = estLI
      ? `FIGURE : "La question miroir"
LEVIER : Réciprocité + introspection — une question bien posée renvoie le lecteur à sa propre expérience et génère des commentaires authentiques.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Poser le contexte de la question avec une observation ou un constat. Pas encore la question.
  2. MON EXPÉRIENCE PERSONNELLE : Partager sa propre réponse à la question, honnêtement. L'auteur répond en premier.
  3. CE QUE J'EN RETIENS : L'insight personnel tiré de cette réflexion.
  4. LA QUESTION : Formulée simplement, ouverte, accessible. À la fin du post.
  5. CTA : La question elle-même — ne pas ajouter d'autre invitation, ça ferait redondant.
INTERDIT : poser une question rhétorique sans vraiment attendre de réponse. La réponse de l'auteur en premier = crédibilité.`
      : `FIGURE : "La question miroir"
LEVIER : Réciprocité + introspection — l'auteur répond d'abord, puis invite. Ça génère beaucoup plus de commentaires qu'une question directe.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Le contexte ou l'observation qui amène la question. 1 phrase max.
  2. MA RÉPONSE : L'auteur répond honnêtement à sa propre question. Court, sincère.
  3. LA QUESTION : Posée clairement au lecteur. Accessible, pas académique.
  4. CTA : "Et toi ?" ou "Réponds en commentaire."
Format IG : très court, très personnel, très invitant.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'V3') {
    // Le before/after narratif — levier : espoir + contraste
    const mecanique = estLI
      ? `FIGURE : "Le before/after narratif"
LEVIER : Espoir + contraste — raconter une transformation active l'espoir chez le lecteur et le pousse à s'imaginer dans la situation "après".
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La situation "après" — le résultat en premier. Crée la curiosité sur comment on y est arrivé.
  2. LE AVANT : Décrire honnêtement la situation de départ. Vulnérable si nécessaire. Pas d'exagération.
  3. LE MOMENT CHARNIÈRE : L'instant précis où quelque chose a basculé. 1 phrase, forte.
  4. LE APRÈS : Comment les choses ont changé. Concret, pas abstrait.
  5. LE PRINCIPE : Ce que cette transformation apprend de généralisable.
  6. CTA : "Tu es dans le AVANT ou le APRÈS ?" ou invitation à partager son propre avant/après.
INTERDIT : la transformation miracle. La friction doit être réelle.`
      : `FIGURE : "Le before/after narratif"
LEVIER : Espoir + contraste — l'histoire de transformation est le format le plus partagé sur Instagram.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Le APRÈS en 1 phrase. Le résultat qui donne envie de lire.
  2. AVANT : 2-3 lignes. Honnête, incarné, avec une image concrète.
  3. LE DÉCLIC : 1 phrase. Le moment charnière.
  4. APRÈS : 2-3 lignes. Résultat concret.
  5. CTA : "Et toi, tu en es où dans ton parcours ?"
Caption : développe le déclic en profondeur + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'V4') {
    // La tendance réagée — levier : FOMO + positionnement
    const mecanique = estLI
      ? `FIGURE : "La tendance réagée"
LEVIER : FOMO + positionnement — réagir à une tendance du secteur montre qu'on est dans le temps présent et positionne comme expert en veille.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Nommer la tendance ou le phénomène. "Vous avez sûrement vu [tendance]..."
  2. CE QUE JE EN PENSE : L'angle personnel — accord, désaccord, nuance ? 1 position claire.
  3. CE QUE ÇA RÉVÈLE : Ce que cette tendance dit de l'évolution du secteur ou du comportement des clients.
  4. CE QUE ÇA CHANGE POUR MA CIBLE : Implication concrète pour les clients ou pour le professionnel.
  5. CTA : "Vous l'avez constaté aussi ?" ou "Comment vous positionnez-vous face à ça ?"
INTERDIT : réagir sans angle. La réaction doit apporter un point de vue clair.`
      : `FIGURE : "La tendance réagée"
LEVIER : FOMO + positionnement — être dans l'actualité de son secteur renforce la crédibilité et l'engagement.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Tu as vu ce qui se passe avec [tendance] ?" ou "[Phénomène] — voilà ce que j'en pense."
  2. L'OBSERVATION : Courte, factuelle, ancrée dans ce qui se passe maintenant.
  3. MON AVIS : Bref et tranché. Pas de "d'un côté... de l'autre".
  4. POUR TOI, ÇA CHANGE QUOI : 1 implication pratique pour la cible.
  5. CTA : "Tu en penses quoi ?"
Caption : développe l'analyse de tendance + hashtags.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  // ══════════════════════════════════════════════════════════════
  // ACTIVITÉ
  // ══════════════════════════════════════════════════════════════

  if (code === 'Ac1') {
    // La coulisse d'activité — levier : proxémie + confiance
    const mecanique = estLI
      ? `FIGURE : "La coulisse d'activité"
LEVIER : Proxémie + confiance — montrer ce qui se passe vraiment dans son travail crée une intimité professionnelle qui différencie de la concurrence.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : Une scène concrète du quotidien professionnel. Pas un concept — une action. "Ce matin j'ai [verbe d'action précis]."
  2. LA COULISSE : Décrire ce qui se passe vraiment — gestes, décisions, obstacles. Détails spécifiques au métier.
  3. POURQUOI C'EST IMPORTANT : Ce que cette étape représente pour la qualité du résultat ou pour le client.
  4. CE QUE ÇA DIT DES VALEURS : Lien entre la coulisse et ce en quoi l'auteur croit professionnellement.
  5. CTA : "Vous saviez que cette étape existait ?" ou "C'est pareil dans votre domaine ?"
INTERDIT : la pub déguisée. Pas de mention de prix ou de CTA commercial.`
      : `FIGURE : "La coulisse d'activité"
LEVIER : Proxémie + confiance — les coulisses créent le sentiment d'être invité dans l'univers de l'auteur.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Ce matin [action concrète de mon quotidien]." Ultra-spécifique, visuel.
  2. LES DÉTAILS : 3-4 lignes. Ce qui se passe vraiment. Sensoriels si possible.
  3. LE SENS : Pourquoi cette étape compte. 1 phrase sincère.
  4. CTA : "Tu veux voir comment ça marche ?" ou "C'est ça, mon quotidien. Et le tien ?"
Caption : raconte l'anecdote plus en détail + hashtags.
INTERDIT : la coulisse aseptisée. Montrer ce qui est vraiment dans l'envers du décor.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'Ac2') {
    // L'offre incarnée — levier : désir + identification
    const mecanique = estLI
      ? `FIGURE : "L'offre incarnée"
LEVIER : Désir + identification — présenter une offre à travers la situation vécue par le client la rend désirable sans pression commerciale.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La situation vécue par le client. Concrète, reconnaissable. Pas l'offre — le client d'abord.
  2. LA DOULEUR : Ce que cette situation génère concrètement (perte de temps, argent, stress, opportunité manquée).
  3. CE QUI CHANGE : Comment l'offre résout cette douleur — 1 bénéfice principal, pas une liste.
  4. LA PREUVE : Un résultat client ou une illustration concrète de la transformation.
  5. CTA : "Si tu te reconnais dans ça, je peux t'aider." ou invitation douce sans pression.
INTERDIT : commencer par l'offre. La situation client doit arriver en premier.`
      : `FIGURE : "L'offre incarnée"
LEVIER : Désir + identification — l'offre arrive après que le lecteur s'est reconnu dans la situation décrite.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : "Si tu [situation du client en 1 phrase]..." — direct, sans introduction.
  2. TU VIS PEUT-ÊTRE ÇA : 2-3 lignes sur la douleur. Précises. Incarnées.
  3. VOILÀ CE QUE JE PROPOSE : L'offre en 2 phrases max. Bénéfice d'abord, produit ensuite.
  4. CTA : "Envoie-moi un message si tu veux qu'on en parle." ou lien bio.
Format IG : ne jamais ressembler à une pub. Toujours commencer par le client.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  if (code === 'Ac3') {
    // La promo narrative — levier : urgence réelle + contexte
    const mecanique = estLI
      ? `FIGURE : "La promo narrative"
LEVIER : Urgence réelle + contexte — une promotion est engageante quand elle a une raison sincère d'exister, pas quand elle est fabriquée.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : L'événement ou la durée en premier. "Jusqu'au [date]..." ou "Ce week-end uniquement..."
  2. LA RAISON SINCÈRE : Pourquoi cette promo maintenant ? Anniversaire, fin de saison, arrivage, lancement — raison concrète et honnête.
  3. L'OFFRE PRÉCISE : Ce qui est proposé, pour qui, à quel prix ou avec quel avantage.
  4. CE QUI CHANGE POUR LE CLIENT : Le bénéfice concret de saisir cette opportunité maintenant.
  5. CTA : Simple, direct, avec modalité claire. "Passe en boutique", "Envoie-moi un message", "Lien en bio".
INTERDIT : urgence artificielle, fausses pénuries. L'honnêteté est le seul CTA qui fonctionne vraiment.`
      : `FIGURE : "La promo narrative"
LEVIER : Urgence réelle + contexte — une promo avec une vraie histoire derrière génère de l'engagement, pas juste des clics.
MÉCANIQUE OBLIGATOIRE :
  1. HOOK : La date ou la durée. Ultra-clair. "Jusqu'au [date], [ce qui change]."
  2. POURQUOI MAINTENANT : La raison sincère derrière la promo. 1-2 phrases.
  3. L'OFFRE : Simple, claire, avec une modalité d'action.
  4. CTA : Direct. "Réserve ta place", "Passe au shop", "Lien en bio".
Caption : développe la raison + conditions + hashtags.
INTERDIT : urgence fabriquée. Les gens sentent la manipulation.`;
    return profil + sujetBloc + matiereBloc + antiBlocFigure + `\n${intro}\n\n${mecanique}` + rappelSujet;
  }

  // Fallback — retourner null pour déclencher le prompt classique
  return null;
}

// ============================================================
// MÉMOIRE ÉVOLUTIVE — architecture structurée
// 6 pools stockés en Zone 2 (tous FIFO, plafond 20 items sauf Synthèse) :
//   • Anecdotes vécues      → situations concrètes (Q1, Q2)
//   • Douleurs clients      → freins/peurs (Q3)
//   • Objections fréquentes → hésitations prospects (Q3)
//   • Résultats clients     → fiertés & retours (Q5, Q2)
//   • Thèmes récurrents     → observations secteur (Q4)
//   • Synthèse évolutive    → vue d'ensemble 600 mots (texte libre)
// ============================================================

const POOL_MAX = 20;
const POOL_LABELS = [
  'Anecdotes vécues',
  'Douleurs clients détectées',
  'Objections fréquentes',
  'Résultats clients',
  'Thèmes récurrents'
];

// Lire tous les pools + la synthèse depuis Profil_IA
// Retourne { pools: {labelPool: [items]}, synthese: string, rows: {label: rowNumber} }
function lireZonePools() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Profil_IA");
  if (!sheet) return null;

  const donnees = sheet.getDataRange().getValues();
  const pools   = {};
  const rows    = {};
  let synthese  = '';
  let enZone2   = false;

  POOL_LABELS.forEach(l => pools[l] = []);

  donnees.forEach((row, idx) => {
    const label = String(row[0] || '').trim();
    if (label.includes('ZONE 2')) { enZone2 = true; return; }
    if (!enZone2) return;
    if (label === 'Synthèse évolutive')    { synthese = String(row[1]||''); rows['Synthèse évolutive'] = idx+1; return; }
    if (label === 'Dernière mise à jour')  { rows['Dernière mise à jour'] = idx+1; return; }
    if (POOL_LABELS.indexOf(label) >= 0) {
      const raw = String(row[1]||'').trim();
      // Parsing : chaque ligne commençant par • est un item, sinon c'est vide/legacy
      if (raw) {
        const items = raw.split('\n')
          .map(s => s.replace(/^[•\-\*]\s*/, '').trim())
          .filter(s => s.length > 0 && !s.startsWith('←'));
        pools[label] = items;
      }
      rows[label] = idx+1;
    }
  });

  return { pools, synthese, rows, sheet };
}

// Écrire un pool : concatène les nouveaux items aux anciens (nouveaux en tête),
// déduplique (case-insensitive), plafonne à POOL_MAX items
function mergePool(ancienItems, nouveauxItems) {
  const seen = new Set();
  const merged = [];
  // 1. Nouveaux en tête (plus récents = plus pertinents)
  nouveauxItems.forEach(item => {
    const key = item.toLowerCase().trim();
    if (key.length > 2 && !seen.has(key)) { seen.add(key); merged.push(item.trim()); }
  });
  // 2. Anciens à la suite (on garde l'historique)
  ancienItems.forEach(item => {
    const key = item.toLowerCase().trim();
    if (key.length > 2 && !seen.has(key)) { seen.add(key); merged.push(item.trim()); }
  });
  // 3. Plafond FIFO
  return merged.slice(0, POOL_MAX);
}

// Écrire tous les pools dans la feuille
function ecrireZonePools(sheet, pools, rows, nouvelleSynthese) {
  POOL_LABELS.forEach(label => {
    if (rows[label] && pools[label]) {
      const texte = pools[label].map(item => '• ' + item).join('\n');
      sheet.getRange(rows[label], 2).setValue(texte);
    }
  });
  if (rows['Synthèse évolutive'] && nouvelleSynthese) {
    sheet.getRange(rows['Synthèse évolutive'], 2).setValue(nouvelleSynthese);
  }
  if (rows['Dernière mise à jour']) {
    sheet.getRange(rows['Dernière mise à jour'], 2).setValue(new Date().toLocaleDateString('fr-FR'));
  }
}

// Extraire du texte JSON depuis une réponse IA — robuste aux préambules
function extraireJSON(texte) {
  if (!texte) return null;
  // Retire les blocs markdown ```json ... ``` et ``` ... ```
  let t = texte.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // Cherche le premier { et le dernier } correspondant
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.substring(i, j+1)); }
  catch(e) { return null; }
}

// FONCTION PRINCIPALE — refondue
// Retourne : { succes: bool, message?: string }
// Côté PWA, si succes=false, afficher toast d'alerte (l'ancien état est préservé)
function majMemoireEvolutive(matiereSemaine, cle_ia, ia) {
  const donnees = lireZonePools();
  if (!donnees) return { succes: false, message: 'Onglet Profil_IA introuvable' };
  if (!donnees.rows['Synthèse évolutive']) return { succes: false, message: 'Ligne "Synthèse évolutive" introuvable en Zone 2' };

  const { pools, synthese, rows, sheet } = donnees;

  // Résumé des pools actuels pour contexte IA (évite les doublons)
  const poolsResume = POOL_LABELS.map(l => {
    const items = pools[l].slice(0, 10); // 10 premiers pour contexte
    if (!items.length) return l + ' : (vide)';
    return l + ' :\n' + items.map(it => '  • ' + it).join('\n');
  }).join('\n\n');

  const prompt = `Tu es l'assistant IA d'un professionnel. Tu dois extraire des éléments structurés depuis la matière hebdomadaire.

SYNTHÈSE ACTUELLE (à mettre à jour en fin) :
${synthese || '(aucune synthèse encore)'}

POOLS ACTUELS (ce qu'on sait déjà — NE PAS redire si identique ou très proche) :
${poolsResume}

MATIÈRE DE CETTE SEMAINE :
${matiereSemaine}

Ta tâche : extraire depuis la matière uniquement LES NOUVEAUTÉS (pas ce qui est déjà dans les pools).
Réponds UNIQUEMENT avec un JSON valide, sans préambule, sans markdown, strictement ce format :

{
  "anecdotes_nouvelles": ["anecdote concrète 1", "anecdote concrète 2"],
  "douleurs_nouvelles": ["douleur/frein détecté"],
  "objections_nouvelles": ["objection entendue"],
  "resultats_nouveaux": ["résultat/fierté observée"],
  "themes_nouveaux": ["thème/observation secteur"],
  "synthese_maj": "synthèse mise à jour, max 600 mots, 3ème personne"
}

RÈGLES STRICTES :
- Chaque item est une phrase courte (8-25 mots), concrète, utilisable dans un post.
- Extraire MAX 3 items par catégorie. Vides ([]) autorisés si rien de nouveau.
- Ne pas inventer : uniquement ce qui est présent dans la matière.
- Les anecdotes doivent être des situations vécues (pas de généralités).
- Pas de guillemets imbriqués, pas de caractères spéciaux cassants.`;

  let reponse_ia = '';
  try {
    if (ia === 'gemini') reponse_ia = appelGemini(cle_ia, prompt, 1500);
    else                 reponse_ia = appelClaude(cle_ia, prompt, 1500);
  } catch(e) {
    console.log('Erreur mémoire (appel IA) : ' + e.message);
    return { succes: false, message: 'Appel IA échoué : ' + e.message };
  }

  const parsed = extraireJSON(reponse_ia);
  if (!parsed) {
    console.log('Erreur mémoire : JSON invalide — réponse : ' + (reponse_ia||'').substring(0, 300));
    return { succes: false, message: 'Format de réponse IA invalide (JSON attendu)' };
  }

  // Merge chaque pool
  const newPools = {
    'Anecdotes vécues':           mergePool(pools['Anecdotes vécues'],           parsed.anecdotes_nouvelles || []),
    'Douleurs clients détectées': mergePool(pools['Douleurs clients détectées'], parsed.douleurs_nouvelles  || []),
    'Objections fréquentes':      mergePool(pools['Objections fréquentes'],      parsed.objections_nouvelles|| []),
    'Résultats clients':          mergePool(pools['Résultats clients'],          parsed.resultats_nouveaux  || []),
    'Thèmes récurrents':          mergePool(pools['Thèmes récurrents'],          parsed.themes_nouveaux     || [])
  };

  const nouvelleSynthese = parsed.synthese_maj || synthese;

  try {
    ecrireZonePools(sheet, newPools, rows, nouvelleSynthese);
  } catch(e) {
    console.log('Erreur écriture mémoire : ' + e.message);
    return { succes: false, message: 'Écriture Sheet échouée : ' + e.message };
  }

  return { succes: true };
}

// ============================================================
// LIRE LA MATIÈRE LA PLUS RÉCENTE (S-1, S-2, S-3)
// Appelé par la PWA quand la matière de la semaine courante est vide.
// Remonte jusqu'à 3 semaines en arrière pour trouver du contenu.
// ============================================================
function lireMatiereRecente() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Matiere_hebdo");
  if (!sheet) return reponse({ matiere: '', semaineTrouvee: '', vide: true });

  const donnees = sheet.getDataRange().getValues();

  // Calculer les clés des 3 semaines précédentes
  function clesSemainesPrecedentes() {
    const cles = [];
    const now = new Date();
    for (let delta = 1; delta <= 3; delta++) {
      const d = new Date(now.getTime() - delta * 7 * 24 * 3600 * 1000);
      const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = d2.getUTCDay() || 7;
      d2.setUTCDate(d2.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
      const sem = Math.ceil((((d2 - yearStart) / 86400000) + 1) / 7);
      cles.push('S.' + String(sem).padStart(2, '0') + '-' + d2.getUTCFullYear());
    }
    return cles; // ['S.15-2026', 'S.14-2026', 'S.13-2026']
  }

  const clesCibles = clesSemainesPrecedentes();

  // Parcourir les lignes du Sheets pour trouver la plus récente non vide
  for (const cle of clesCibles) {
    for (const row of donnees) {
      const semaineLigne = String(row[0] || '').trim();
      if (semaineLigne !== cle) continue;

      // Vérifier si au moins une réponse est renseignée (colonnes B à I)
      const reponses = [row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]]
        .map(v => String(v || '').trim())
        .filter(v => v !== '');

      if (reponses.length === 0) continue; // semaine vide — passer à S-2

      // Reconstruire la matière formatée
      const labels = ['Anecdote', 'Retour client', 'Frein entendu', 'Observation', 'Fierté', 'Offre semaine', 'Photo dispo', 'Intention'];
      const matiere = labels
        .map((lbl, i) => ({ lbl, val: String(row[i + 1] || '').trim() }))
        .filter(({ val }) => val !== '')
        .map(({ lbl, val }) => lbl + ' : ' + val)
        .join('\n');

      return reponse({
        matiere,
        semaineTrouvee: cle,
        vide: false
      });
    }
  }

  // Aucune semaine avec contenu trouvée sur les 3 dernières
  return reponse({ matiere: '', semaineTrouvee: '', vide: true });
}

// ============================================================
// ENREGISTRER SEMAINE
// ============================================================
function enregistrerSemaine(donnees) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Matiere_hebdo");
  if (!sheet) return reponse({ erreur: "Onglet Matiere_hebdo introuvable" });

  const semaine = donnees.semaine || '';
  const q = donnees.questions || {};

  const valeurs = sheet.getDataRange().getValues();
  let ligneExistante = -1;
  for (let i = 0; i < valeurs.length; i++) {
    if (String(valeurs[i][0]) === semaine) { ligneExistante = i + 1; break; }
  }

  const row  = ligneExistante > 0 ? ligneExistante : sheet.getLastRow() + 1;
  const ligne = [semaine, q.q1||'', q.q2||'', q.q3||'', q.q4||'', q.q5||'', q.q6||'', q.q7||'', q.q8||''];
  sheet.getRange(row, 1, 1, ligne.length).setValues([ligne]);

  let memoireStatus = { succes: true };
  if (donnees.cle_ia && donnees.ia) {
    const matiere = [
      'Anecdote : '       + (q.q1||''),
      'Retour client : '  + (q.q2||''),
      'Frein entendu : '  + (q.q3||''),
      'Observation : '    + (q.q4||''),
      'Fierté : '         + (q.q5||''),
      'Offre semaine : '  + (q.q6||''),
      'Photo dispo : '    + (q.q7||''),
      'Intention : '      + (q.q8||''),
    ].filter(l => !l.endsWith(': ')).join('\n');
    memoireStatus = majMemoireEvolutive(matiere, donnees.cle_ia, donnees.ia) || { succes: true };
  }

  // Lancer la veille Reddit automatique (asynchrone — ne bloque pas l'enregistrement)
  // Si ça échoue, l'enregistrement de semaine reste valide
  let veilleStatus = { succes: true, nbResultats: 0 };
  try {
    if (donnees.cle_ia && donnees.ia) {
      // Lire le profil pour avoir métier + cible (nécessaire pour générer les requêtes)
      const profilObj2 = lireProfilIA();
      const sp2 = {};
      if (profilObj2 && profilObj2.getContent) {
        try {
          const po = JSON.parse(profilObj2.getContent());
          if (po.speciaux) Object.assign(sp2, po.speciaux);
        } catch(e2) { /* ignore parse errors */ }
      }
      // Compléter avec les données envoyées par la PWA (plus fraîches)
      if (donnees.cat_metier) sp2['Catégorie métier'] = donnees.cat_metier;
      if (donnees.cible)      sp2['Cible client']     = donnees.cible;

      // Passer aussi zone2 pour que l'IA connaisse les douleurs déjà détectées
      let zone2PourVeille = {};
      if (profilObj2 && profilObj2.getContent) {
        try {
          const po2 = JSON.parse(profilObj2.getContent());
          if (po2.zone2) zone2PourVeille = po2.zone2;
        } catch(e3) { /* ignore */ }
      }
      const profilPourVeille = { speciaux: sp2, zone2: zone2PourVeille };
      veilleStatus = lancerVeilleReddit(profilPourVeille, donnees.cle_ia, donnees.ia) || { succes: true, nbResultats: 0 };
    }
  } catch(e) {
    console.log('Veille Reddit échouée (non bloquant) : ' + e.message);
    veilleStatus = { succes: false, nbResultats: 0 };
  }

  return reponse({
    succes: true,
    ligne: row,
    memoire_succes: memoireStatus.succes,
    memoire_message: memoireStatus.message || '',
    veille_reddit: veilleStatus.nbResultats || 0
  });
}

// ============================================================
// ENREGISTRER POSTS
// ============================================================
function enregistrerPosts(donnees) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Posts_generes");
  if (!sheet) sheet = ss.insertSheet("Posts_generes");

  sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, 8, sheet.getMaxRows(), 1).setNumberFormat('@');

  const posts   = donnees.posts || [];
  const semaine = donnees.semaine || '';

  posts.forEach(post => {
    const dateProg = String(post.dateProg || post.date || '').substring(0, 10);
    const dateGen  = String(post.dateGen  || post.date || '').substring(0, 10);
    const idPost   = String(post.id || Date.now());
    sheet.appendRow([
      dateProg, semaine,
      post.reseau  || '',
      post.type    || post.typeContenu || '',
      post.contenu || post.texte || '',
      post.legende || '',
      post.statut  || 'À relire',
      dateGen,
      idPost   // colonne 9 — id stable cross-device
    ]);
  });

  return reponse({ succes: true });
}

// ============================================================
// MAJ POST
// ============================================================
function majPost(donnees) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Posts_generes");
  if (!sheet) return reponse({ erreur: "Onglet Posts_generes introuvable" });

  const id      = String(donnees.id || '');
  const valeurs = sheet.getDataRange().getValues();
  for (let i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][0]) === id || String(valeurs[i][4]).includes(id)) {
      if (donnees.texte)   sheet.getRange(i+1, 5).setValue(donnees.texte);
      if (donnees.legende) sheet.getRange(i+1, 6).setValue(donnees.legende);
      if (donnees.statut)  sheet.getRange(i+1, 7).setValue(donnees.statut);
      return reponse({ succes: true });
    }
  }
  return reponse({ succes: false, info: "Post non trouvé" });
}

// ============================================================
// MAJ STATUT POST
// ============================================================
function majStatutPost(donnees) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Posts_generes");
  if (!sheet) return reponse({ erreur: "Onglet Posts_generes introuvable" });

  const id      = String(donnees.id || '').trim();
  const statut  = donnees.statut || 'Publié';
  const valeurs = sheet.getDataRange().getValues();

  for (let i = 1; i < valeurs.length; i++) {
    // Chercher par id stable (colonne 9) en priorité
    const idColonne = String(valeurs[i][8] || '').trim();
    if (idColonne && idColonne === id) {
      sheet.getRange(i+1, 7).setValue(statut);
      return reponse({ succes: true });
    }
  }
  // Fallback : numéro de ligne
  const numLigne = parseInt(id);
  if (numLigne > 1 && numLigne <= valeurs.length) {
    sheet.getRange(numLigne, 7).setValue(statut);
    return reponse({ succes: true });
  }
  return reponse({ succes: false, info: "Post non trouvé" });
}

// ============================================================
// SUPPRIMER POST
// ============================================================
function supprimerPost(donnees) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Posts_generes");
  if (!sheet) return reponse({ erreur: "Onglet Posts_generes introuvable" });

  const idBrut   = String(donnees.id || '').trim();
  const dernLigne = sheet.getLastRow();
  const data = sheet.getRange(1, 1, dernLigne, 9).getValues();

  // CAS 1 : id stable dans colonne 9
  for (let i = data.length - 1; i >= 1; i--) {
    const idColonne = String(data[i][8] || '').trim();
    if (idColonne && idColonne === idBrut) {
      sheet.deleteRow(i + 1);
      return reponse({ succes: true, methode: 'id-stable' });
    }
  }

  // CAS 2 : numéro de ligne (ancien format)
  const numLigne = parseInt(idBrut);
  if (numLigne > 1 && numLigne <= dernLigne && idBrut.length <= 6) {
    sheet.deleteRow(numLigne);
    return reponse({ succes: true, methode: 'ligne' });
  }

  // CAS 3 : chercher par contenu texte
  if (donnees.texte) {
    const aiguille = String(donnees.texte).substring(0, 50);
    for (let i = data.length - 1; i >= 1; i--) {
      const contenu = String(data[i][4] || '');
      if (contenu.substring(0, 50) === aiguille) {
        sheet.deleteRow(i + 1);
        return reponse({ succes: true, methode: 'texte', ligne: i + 1 });
      }
    }
  }

  return reponse({ succes: false, info: 'Post introuvable dans le Sheets' });
}

// ============================================================
// CONTRÔLE D'ACCÈS
// ============================================================
function verifierAcces(email) {
  if (!email) return reponse({ autorise: false, message: "Email manquant" });

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Acces");

  if (!sheet) {
    sheet = ss.insertSheet("Acces");
    sheet.getRange(1,1,1,3).setValues([["Email","Statut","Nom"]]);
    sheet.getRange(2,1,1,3).setValues([["contact@roze-communications.com","actif","Roze (admin)"]]);
  }

  const data      = sheet.getDataRange().getValues();
  const emailNorm = email.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const rowEmail  = String(data[i][0] || '').toLowerCase().trim();
    const rowStatut = String(data[i][1] || '').toLowerCase().trim();
    if (rowEmail === emailNorm) {
      if (rowStatut === 'actif') return reponse({ autorise: true, nom: String(data[i][2] || '') });
      return reponse({ autorise: false, message: "Accès désactivé. Contacte Roze Communications." });
    }
  }
  return reponse({ autorise: false, message: "Email non autorisé. Contacte Roze Communications." });
}

// ============================================================
// LIRE POSTS GÉNÉRÉS
// ============================================================
function lirePostsGeneres(limite) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Posts_generes");
  if (!sheet) return reponse({ posts: [] });

  const derniereLigne = sheet.getLastRow();
  if (derniereLigne < 1) return reponse({ posts: [] });

  const data  = sheet.getRange(1, 1, derniereLigne, 9).getValues();
  const posts = [];
  const vus   = new Set();

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    let date = '';
    if (row[0] instanceof Date) {
      date = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      const colA = String(row[0] || '').trim();
      if (!colA) continue;
      const mISO = colA.match(/^(\d{4}-\d{2}-\d{2})/);
      const mFR  = colA.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (mISO)     date = mISO[1];
      else if (mFR) date = mFR[3] + '-' + mFR[2] + '-' + mFR[1];
      else continue;
    }

    const reseau  = String(row[2] || '');
    const type    = String(row[3] || '');
    const contenu = String(row[4] || '');
    const legende = String(row[5] || '');
    const statut  = String(row[6] || '') || 'À relire';
    const dateGen = row[7] ? String(row[7]).substring(0, 10) : date;
    // Colonne 9 (index 8) : id stable — sinon numéro de ligne en fallback
    const idStable = row[8] ? String(row[8]).trim() : String(i + 1);

    if (!contenu) continue;

    const cle = date + '|' + reseau + '|' + type + '|' + contenu.substring(0, 50);
    if (vus.has(cle)) continue;
    vus.add(cle);

    posts.push({ id: idStable, date, dateGen, reseau, typeContenu: type || 'Post texte', texte: contenu, legende, statut, dateAffiche: date });

    if (posts.length >= limite) break;
  }

  return reponse({ posts });
}

// ============================================================
// CONFIG
// ============================================================
function lireConfig() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Config");
  if (!sheet) return reponse({ config: {} });

  const data = sheet.getDataRange().getValues();
  const config = {};
  data.forEach(row => {
    const key = String(row[0] || '').trim();
    const val = String(row[1] || '').trim();
    if (key) config[key] = val;
  });
  return reponse({ config });
}

function sauvegarderConfig(config) {
  if (!config) return reponse({ erreur: "Config manquante" });

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Config");
  if (!sheet) {
    sheet = ss.insertSheet("Config");
    sheet.getRange(1,1).setValue("// Config Roze Assistant — ne pas modifier manuellement");
  }

  const rows = Object.entries(config).map(([k, v]) => [k, v]);
  sheet.clearContents();
  sheet.getRange(1,1).setValue("// Config Roze Assistant — ne pas modifier manuellement");
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  return reponse({ succes: true });
}

// ============================================================
// ============================================================
// RECHERCHE ACTU IA — via web_search
// Utilise appelClaude() → fallback automatique, jamais de modèle en dur
// La PWA délègue cette requête à l'AS pour bénéficier du système de cache/fallback
// ============================================================
function rechercheActuIA(donnees) {
  const cle_ia = donnees.cle_ia || '';
  const metier  = donnees.metier  || '';
  const pilier  = donnees.pilier  || 'autorite';
  const sujet   = donnees.sujet   || '';
  const urlSource = donnees.url_source || '';

  if (!cle_ia) return reponse({ erreur: 'Clé API manquante' });

  // Construire la requête de recherche
  const queries = {
    expertise:  `${metier} données chiffres statistiques récentes 2025 2026`,
    autorite:   `${metier} tendances actualité ${new Date().getFullYear()}`,
    visibilite: `${metier} réseaux sociaux contenu viral engagement`,
    activite:   `${metier} clients avis témoignages résultats`
  };
  const query = sujet
    ? `${sujet} ${metier} données récentes`
    : (queries[pilier] || queries['autorite']);

  // Prompt web_search — délégué à appelClaude qui gère le fallback modèle
  const prompt = `Recherche sur le web : "${query}"

RÈGLES :
- Extrais 1 à 3 faits concrets, récents, chiffrés ou factuels (chiffres, stats, nouveautés, tendances)
- Chaque donnée doit être spécifique et sourcée — INTERDIT les généralités vagues
- Format : fait exact + source entre parenthèses (nom média, date)
- Pas d'introduction ni de conclusion — uniquement les données
- Si aucune donnée pertinente : réponds uniquement "AUCUNE_DONNÉE"`;

  try {
    // Appel avec web_search via tentativeAppelClaudeWebSearch
    const resultat = appelClaudeWebSearch(cle_ia, prompt, urlSource);
    if (!resultat || resultat === 'AUCUNE_DONNÉE') {
      return reponse({ succes: true, actu: '' });
    }
    return reponse({ succes: true, actu: resultat });
  } catch(e) {
    console.log('rechercheActuIA erreur : ' + e.message);
    return reponse({ erreur: 'Recherche échouée : ' + e.message });
  }
}

// Appel Claude avec tool web_search — utilise le même système de fallback que appelClaude
function appelClaudeWebSearch(cle, prompt, urlSource) {
  // Construire le message utilisateur
  const userContent = urlSource
    ? `Consulte cette page et extrais les informations les plus récentes et pertinentes.
URL : ${urlSource}

${prompt}`
    : prompt;

  // Utiliser le système de cache/fallback modèle — comme appelClaude
  const enCache = getModeleActif('claude');
  const candidats = [];
  if (enCache) candidats.push(enCache);
  MODELES_CLAUDE_FALLBACKS.forEach(m => { if (candidats.indexOf(m) < 0) candidats.push(m); });

  // Filtrer les modèles deprecated connus
  const candidatsFiltres = candidats.filter(m => m !== 'claude-sonnet-4-20250514');

  for (let i = 0; i < candidatsFiltres.length; i++) {
    const modele = candidatsFiltres[i];
    try {
      const options = {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cle,
          'anthropic-version': '2023-06-01'
        },
        payload: JSON.stringify({
          model: modele,
          max_tokens: 500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: userContent }]
        }),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
      const code = response.getResponseCode();
      const raw  = response.getContentText();

      if (code === 200) {
        const data = JSON.parse(raw);
        const texte = (data.content || [])
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join(' ')
          .trim();
        // Mettre en cache ce modèle s'il fonctionne
        if (enCache !== modele) setModeleActif('claude', modele);
        return texte || '';
      }

      // Modèle obsolète → essai suivant
      if (estErreurModeleObsolete(code, raw)) {
        console.log('Web search : modèle obsolète ' + modele + ' → essai suivant');
        continue;
      }

      // Erreur non récupérable
      if (code === 401) throw new Error('CLE_INVALIDE');
      if (code === 429) throw new Error('QUOTA_DEPASSE');

    } catch(e) {
      if (e.message === 'CLE_INVALIDE' || e.message === 'QUOTA_DEPASSE') throw e;
      console.log('Web search erreur modèle ' + modele + ' : ' + e.message);
    }
  }

  // Auto-découverte en dernier recours
  const decouverts = decouvrirModelesClaude(cle).filter(m => m !== 'claude-sonnet-4-20250514');
  for (let i = 0; i < decouverts.length; i++) {
    const modele = decouverts[i];
    if (candidatsFiltres.indexOf(modele) >= 0) continue;
    try {
      const options = {
        method: 'post',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify({
          model: modele,
          max_tokens: 500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: userContent }]
        }),
        muteHttpExceptions: true
      };
      const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
      if (response.getResponseCode() === 200) {
        const data = JSON.parse(response.getContentText());
        const texte = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
        setModeleActif('claude', modele);
        return texte || '';
      }
    } catch(e) { /* continuer */ }
  }

  throw new Error('Aucun modèle disponible pour web_search');
}

// ============================================================
// VEILLE REDDIT — Fetch automatique via l'API JSON publique
//
// Architecture :
// • genererRequetesVeille()  : génère 3 angles × 2 langues depuis le profil
// • fetchRedditMotCle()      : appelle reddit.com/search.json sans auth
// • synthetiserResultats()   : résume tous les résultats en français
// • lancerVeilleReddit()     : orchestre le tout
//
// Déclenchement : automatique après enregistrerSemaine()
// Source des requêtes : Catégorie métier + Cible client du profil
//   → Zéro configuration supplémentaire pour l'utilisateur
//
// Stratégie bilingue :
//   Chaque angle est recherché en FR ET EN pour capter le signal
//   international et les douleurs clients avant qu'elles arrivent en France
//
// ⚠️ Endpoint public non-officiel (reddit.com/search.json)
//    Fonctionne sans OAuth à < 10 req/min avec un User-Agent propre.
// ============================================================

// Fetch les posts Reddit pour un mot-clé donné
// Retourne un tableau de { titre, url, score, subreddit, extrait }
function fetchRedditMotCle(motCle, options) {
  options = options || {};
  const sort    = options.sort    || 'hot';    // hot, new, top
  const periode = options.periode || 'week';   // day, week, month
  const limite  = options.limite  || 8;        // nb de posts à récupérer

  // Nettoyer le mot-clé pour l'URL
  const q = encodeURIComponent(motCle.trim());

  // Endpoint search.json public — retourne les posts correspondant au mot-clé
  // ?restrict_sr=false : cherche sur tout Reddit (pas seulement un subreddit)
  // ?lang=fr : préférence langue française (pas toujours respectée)
  const url = `https://www.reddit.com/search.json?q=${q}&sort=${sort}&t=${periode}&limit=${limite}&type=link&lang=fr`;

  const options_fetch = {
    method: 'get',
    headers: {
      // User-Agent requis — Reddit bloque les UA vides ou génériques
      // Format recommandé par Reddit : <plateforme>:<identifiant>:<version>
      'User-Agent': 'RozeAssistant/1.0 (Outil veille sectorielle professionnels FR)',
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options_fetch);
    const code = response.getResponseCode();

    // 429 = trop de requêtes → ne pas bloquer, retourner vide
    if (code === 429) {
      console.log('Reddit rate limit atteint pour : ' + motCle);
      return [];
    }
    if (code !== 200) {
      console.log('Reddit erreur ' + code + ' pour : ' + motCle);
      return [];
    }

    const data = JSON.parse(response.getContentText());
    const posts = (data.data && data.data.children) ? data.data.children : [];

    return posts
      .map(p => p.data)
      .filter(p => p && p.title && !p.over_18) // filtrer NSFW
      .filter(p => p.score > 5)                // filtrer les posts très peu votés
      .map(p => ({
        titre:      p.title.substring(0, 150),
        url:        'https://reddit.com' + p.permalink,
        score:      p.score || 0,
        subreddit:  p.subreddit || '',
        // Le selftext est le corps du post (vide pour les liens)
        extrait:    (p.selftext || '').substring(0, 300).replace(/\n/g, ' ').trim()
      }))
      .sort((a, b) => b.score - a.score) // plus votés en premier
      .slice(0, 5); // garder les 5 meilleurs

  } catch(e) {
    console.log('Erreur fetch Reddit (' + motCle + ') : ' + e.message);
    return [];
  }
}

// ── ÉTAPE 1 : Générer les requêtes depuis le profil ─────────────────
// Prend métier + cible → produit 3 angles thématiques × 2 langues (FR + EN)
// L'utilisateur ne configure rien — le profil suffit
function genererRequetesVeille(metier, cible, tronc, categorieMetier, douleursConnues, cle_ia, ia) {
  // Angles adaptatifs selon la catégorie métier
  // Un consultant RH, un artisan et un commerçant n'ont pas les mêmes angles pertinents
  const anglesParCategorie = {
    consultant:  {
      angle1: "DOULEURS DES CLIENTS : problèmes que les dirigeants/DRH/managers cherchent à résoudre avant de faire appel à un consultant",
      angle2: "TENDANCES DU CONSEIL : évolutions de la profession (IA, nouvelles méthodes, réglementations, modes de travail)",
      angle3: "DÉCISION D'ACHAT : ce que les clients comparent avant de choisir — internaliser, logiciel, grand cabinet, ou consultant indépendant"
    },
    formateur: {
      angle1: "DOULEURS DES APPRENANTS : blocages, frustrations, besoins non satisfaits des participants avant une formation",
      angle2: "TENDANCES DE LA FORMATION : e-learning, micro-learning, IA dans la formation, nouvelles certifications, CPF",
      angle3: "ARBITRAGE : ce que les clients comparent — formation présentielle vs distancielle, auto-formation, coaching, YouTube"
    },
    praticien: {
      angle1: "DOULEURS DES PATIENTS/CLIENTS : symptômes, peurs, questions posées avant une première consultation",
      angle2: "TENDANCES THÉRAPEUTIQUES : nouvelles approches, remboursements, réglementations, alternatives reconnues",
      angle3: "RECHERCHE D'UN PRATICIEN : critères de choix, comparaison avec médecine conventionnelle, avis en ligne"
    },
    artisan: {
      angle1: "DOULEURS DES CLIENTS : ce que les particuliers redoutent avant de faire appel à un artisan (délais, prix, qualité)",
      angle2: "TENDANCES DU SECTEUR : nouveaux matériaux, réglementations, aides gouvernementales, digitalisation du métier",
      angle3: "COMPARAISON : bricolage soi-même vs artisan, grands groupes vs indépendants, comparateurs de devis"
    },
    commercant: {
      angle1: "COMPORTEMENT D'ACHAT : ce que les clients locaux cherchent vs e-commerce, prix, service, expérience en boutique",
      angle2: "TENDANCES RETAIL : commerce de proximité, click & collect, avis Google, réseaux sociaux locaux",
      angle3: "CONCURRENCE : grande surface vs commerce local, marketplace vs boutique, fidélisation vs prospection"
    },
    independant: {
      angle1: "DOULEURS DE LA CIBLE : questions, frustrations, besoins non couverts que les clients de ce professionnel expriment",
      angle2: "TENDANCES DU SECTEUR : évolutions, nouvelles pratiques, changements de comportement dans ce marché",
      angle3: "DÉCISION D'ACHAT : ce que les prospects comparent avant de choisir ce type de prestataire ou produit"
    }
  };

  // Sélectionner les angles selon la catégorie (fallback = indépendant générique)
  const cat = (categorieMetier || 'independant').toLowerCase().trim();
  const angles = anglesParCategorie[cat] || anglesParCategorie['independant'];

  // Construire le contexte de douleurs déjà connues (évite de chercher ce qu'on sait déjà)
  const douleursCtx = douleursConnues && douleursConnues.trim()
    ? `\nDouleurs clients déjà identifiées dans ce profil (NE PAS répéter ces angles — chercher du nouveau) :\n${douleursConnues.substring(0, 400)}`
    : '';

  // Type d'activité
  const troncCtx = tronc === 'produit'
    ? 'Vend des produits physiques.'
    : tronc === 'service'
    ? 'Vend des prestations de service.'
    : '';

  const prompt =
    'Tu es un expert en veille sectorielle pour les professionnels français indépendants.\n\n' +
    'Professionnel : ' + (metier || 'professionnel indépendant') + '\n' +
    (troncCtx ? troncCtx + '\n' : '') +
    'Cible cliente : ' + (cible || 'clients locaux') + '\n' +
    douleursCtx + '\n\n' +
    'Génère 3 requêtes de veille Reddit très spécifiques à CE professionnel et SA cible.\n' +
    'Chaque requête doit capturer ce que les CLIENTS DE CE MÉTIER recherchent réellement sur internet.\n\n' +
    'Angle 1 — ' + angles.angle1 + '\n' +
    'Angle 2 — ' + angles.angle2 + '\n' +
    'Angle 3 — ' + angles.angle3 + '\n\n' +
    'Pour chaque angle : 1 requête en FRANÇAIS (3-5 mots) + 1 en ANGLAIS (3-5 mots).\n' +
    'Les requêtes doivent être des termes réels tapés sur un moteur de recherche ou Reddit.\n' +
    'Pas de guillemets, pas de mots génériques comme "professionnel", "problème" seuls.\n\n' +
    'Réponds UNIQUEMENT avec ce JSON :\n' +
    '{\n' +
    '  "douleurs":     { "fr": "requête spécifique", "en": "specific query" },\n' +
    '  "tendances":    { "fr": "requête spécifique", "en": "specific query" },\n' +
    '  "alternatives": { "fr": "requête spécifique", "en": "specific query" }\n' +
    '}';

  try {
    let reponse = '';
    if (ia === 'gemini') reponse = appelGemini(cle_ia, prompt, 300);
    else                 reponse = appelClaude(cle_ia, prompt, 300);

    // Parser le JSON
    const clean = reponse.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const idx = clean.indexOf('{');
    const jdx = clean.lastIndexOf('}');
    if (idx < 0 || jdx <= idx) throw new Error('JSON non trouvé');

    const data = JSON.parse(clean.substring(idx, jdx + 1));
    const requetes = [];

    ['douleurs', 'tendances', 'alternatives'].forEach(angle => {
      if (data[angle]) {
        if (data[angle].fr) requetes.push({ terme: data[angle].fr, langue: 'fr', angle });
        if (data[angle].en) requetes.push({ terme: data[angle].en, langue: 'en', angle });
      }
    });

    return requetes; // max 6 requêtes
  } catch(e) {
    console.log('Génération requêtes veille échouée : ' + e.message);
    // Fallback : requêtes génériques basées sur le métier brut
    const fallbacks = [];
    if (metier) {
      fallbacks.push({ terme: metier + ' problèmes clients', langue: 'fr', angle: 'douleurs' });
      fallbacks.push({ terme: metier + ' client problems', langue: 'en', angle: 'douleurs' });
    }
    return fallbacks;
  }
}

// ── ÉTAPE 2 : Synthèse IA des résultats bruts ──────────────────────
// Prend tous les posts Reddit collectés → 1-3 insights exploitables en français
function synthetiserResultats(tousLesPostsParAngle, metier, cible, cle_ia, ia) {
  // Aplatir et limiter la taille de la synthèse
  const lignes = [];
  Object.entries(tousLesPostsParAngle).forEach(([angle, posts]) => {
    if (posts.length === 0) return;
    lignes.push(`--- ${angle.toUpperCase()} ---`);
    posts.slice(0, 4).forEach(p => {
      lignes.push(`"${p.titre}"${p.extrait ? ' — ' + p.extrait.substring(0, 80) : ''} [${p.subreddit}, ${p.score} votes]`);
    });
  });

  if (lignes.length === 0) return '';

  const dateStr2 = new Date().toLocaleDateString('fr-FR');
  const prompt =
    'Tu es un assistant de veille sectorielle pour un professionnel français.\n' +
    'Métier : ' + (metier || 'professionnel indépendant') + '\n' +
    'Cible : ' + (cible || 'clients locaux') + '\n' +
    'Date : ' + dateStr2 + '\n\n' +
    'Voici des posts Reddit récents collectés sur son secteur :\n\n' +
    lignes.join('\n') + '\n\n' +
    'Synthétise en 2-3 insights utiles pour ce professionnel, en FRANÇAIS :\n' +
    '- 1 insight sur ce que ses clients ressentent ou cherchent (DOULEUR)\n' +
    '- 1 insight sur une tendance ou évolution du secteur (si pertinent)\n' +
    '- 1 insight sur ce qui aide à se différencier (si pertinent)\n\n' +
    'Format : 1 insight = 1-2 phrases concises, avec mention de source "(Reddit, semaine du \' + dateStr2 + \')."\n' +
    'Commence directement. Pas d\'introduction. Si aucun insight pertinent : "AUCUNE_DONNÉE".';

  try {
    let resultat = '';
    if (ia === 'gemini') resultat = appelGemini(cle_ia, prompt, 400);
    else                 resultat = appelClaude(cle_ia, prompt, 400);

    if (!resultat || resultat.includes('AUCUNE_DONNÉE')) return '';
    return resultat.trim();
  } catch(e) {
    // Fallback : premier titre brut
    const premierPost = Object.values(tousLesPostsParAngle).flat()[0];
    if (premierPost) {
      return premierPost.titre + ' (Reddit, ' + new Date().toLocaleDateString('fr-FR') + ')';
    }
    return '';
  }
}

// ── ÉTAPE 3 : Orchestration complète ───────────────────────────────
// Zéro configuration utilisateur — tout vient du profil
function lancerVeilleReddit(profilData, cle_ia, ia) {
  const speciaux = profilData.speciaux || {};
  const metier   = speciaux['Catégorie métier'] || speciaux['Métier'] || '';
  const cible    = speciaux['Cible client'] || '';

  // Pas de profil = pas de veille (silencieux)
  if (!metier && !cible) {
    console.log('Veille Reddit : profil insuffisant (métier et cible absents)');
    return { succes: true, nbResultats: 0 };
  }

  // Étape 1 : générer les requêtes depuis le profil
  // Récupérer les douleurs clients déjà connues depuis Zone 2
  const zone2 = profilData.zone2 || {};
  const douleursConnues = zone2['Douleurs clients détectées'] || '';
  const tronc = speciaux['Tronc'] || '';

  const requetes = genererRequetesVeille(metier, cible, tronc, cat, douleursConnues, cle_ia, ia);
  if (requetes.length === 0) {
    return { succes: true, nbResultats: 0 };
  }

  // Étape 2 : fetch Reddit pour chaque requête
  const resultatsParAngle = {};
  requetes.forEach(req => {
    Utilities.sleep(800); // politesse envers Reddit

    const posts = fetchRedditMotCle(req.terme, {
      sort: 'hot',
      periode: 'week',
      limite: 6
    });

    if (posts.length > 0) {
      if (!resultatsParAngle[req.angle]) resultatsParAngle[req.angle] = [];
      // Dédupliquer par titre (les requêtes FR et EN peuvent remonter les mêmes posts)
      posts.forEach(p => {
        const dejaLa = resultatsParAngle[req.angle].some(x => x.titre === p.titre);
        if (!dejaLa) resultatsParAngle[req.angle].push(p);
      });
    }

    console.log('Reddit [' + req.langue + '/' + req.angle + '] "' + req.terme + '" → ' + posts.length + ' posts');
  });

  const totalPosts = Object.values(resultatsParAngle).flat().length;
  if (totalPosts === 0) {
    return { succes: true, nbResultats: 0 };
  }

  // Étape 3 : synthèse IA en français
  const synthese = synthetiserResultats(resultatsParAngle, metier, cible, cle_ia, ia);
  if (!synthese) {
    return { succes: true, nbResultats: 0 };
  }

  // Étape 4 : sauvegarder en 1 seule entrée (synthèse globale de la semaine)
  const dateStr = new Date().toLocaleDateString('fr-FR');
  const nouvelles = [{
    date:     dateStr,
    requete:  metier + ' / ' + cible, // pour traçabilité — pas affiché
    source:   'Reddit',
    resultat: synthese,
    utilise:  'non'
  }];

  sauvegarderVeilleAuto(nouvelles);
  return { succes: true, nbResultats: 1 };
}

// VEILLE AUTO — onglet Veille_Auto dans le Sheets
// Stocke les 3 dernières requêtes + résultats (max 20 lignes)
// ============================================================
function lireVeilleAuto() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Veille_Auto");
  if (!sheet) return reponse({ veille: [] });

  const data = sheet.getDataRange().getValues();
  const veille = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    veille.push({
      date:    String(row[0] || ''),
      requete: String(row[1] || ''),
      source:  String(row[2] || ''),
      resultat: String(row[3] || ''),
      utilise: String(row[4] || 'non')
    });
  }
  return reponse({ veille });
}

function sauvegarderVeilleAuto(veille) {
  if (!veille || !Array.isArray(veille)) return reponse({ erreur: "Veille invalide" });

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Veille_Auto");
  if (!sheet) {
    sheet = ss.insertSheet("Veille_Auto");
    sheet.getRange(1, 1, 1, 5).setValues([["Date", "Requête", "Source", "Résultat", "Utilisé"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // Conserver les 20 entrées les plus récentes + ajouter les nouvelles
  const existant = sheet.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .slice(-17); // garder les 17 dernières

  const nouvelles = veille.map(v => [
    v.date || new Date().toLocaleDateString("fr-FR"),
    v.requete || '',
    v.source  || 'web',
    v.resultat|| '',
    v.utilise || 'non'
  ]);

  const toutes = [...existant, ...nouvelles].slice(-20);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 5).setValues([["Date", "Requête", "Source", "Résultat", "Utilisé"]]);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
  if (toutes.length > 0) {
    sheet.getRange(2, 1, toutes.length, 5).setValues(toutes);
  }
  return reponse({ succes: true });
}

// Marque une entrée de veille comme utilisée
function marquerVeilleUtilisee(requete, date) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Veille_Auto');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === requete && String(data[i][0]) === date) {
      sheet.getRange(i + 1, 5).setValue('oui');
      break;
    }
  }
}

// ============================================================
// LIRE FICHIER DRIVE
// ============================================================
function lireFichierDrive(lien) {
  if (!lien) return reponse({ erreur: "Lien Drive manquant" });
  const regex = /\/d\/([a-zA-Z0-9_-]+)/;
  const match = lien.match(regex);
  if (!match) return reponse({ erreur: "Lien Drive invalide" });

  const fichierID = match[1];
  try {
    const fichier  = DriveApp.getFileById(fichierID);
    const mimeType = fichier.getMimeType();
    let contenu;
    if (mimeType === MimeType.GOOGLE_DOCS) {
      const url = "https://docs.google.com/document/d/" + fichierID + "/export?format=txt";
      const options = { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
      contenu = UrlFetchApp.fetch(url, options).getContentText("utf-8");
    } else {
      contenu = fichier.getBlob().getDataAsString("utf-8");
    }
    return reponse({ contenuMd: contenu });
  } catch(err) {
    return reponse({ erreur: "Fichier Drive inaccessible : " + err.message });
  }
}

// ============================================================
// IMPORTER PHOTO
// ============================================================
function importerPhoto(donnees) {
  try {
    const nom      = donnees.nom      || 'photo.jpg';
    const dossier  = donnees.dossier  || 'Photos';
    const mimeType = donnees.mimeType || 'image/jpeg';
    const base64   = donnees.base64   || '';
    if (!base64) return reponse({ erreur: 'Fichier manquant' });

    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nom);
    let folder;
    const folders = DriveApp.getFoldersByName(dossier);
    if (folders.hasNext()) folder = folders.next();
    else                   folder = DriveApp.createFolder(dossier);

    const file = folder.createFile(blob);
    return reponse({ succes: true, url: file.getUrl(), nom, dossier });
  } catch(e) {
    return reponse({ erreur: e.message });
  }
}

// ============================================================
// RAPPELS HEBDOMADAIRES
// ============================================================
const TEMPLATES_EMAIL = [
  // MAIL 1 : jour dynamique, accroche sur les derniers jours (pas "ce lundi")
  {
    sujet:    "★ C'est {JOUR} ? Ta semaine commence ici !",
    intro:    "Bonne semaine ! Avant de te lancer dans tes projets : ta compta, ton premier client du jour, etc... prends 5 minutes pour alimenter ton assistant IA.",
    accroche: "Qu'est-ce qui t'a marqué(e) dans ton activité ces derniers jours ?",
    tip:      "Une anecdote client ou une observation du terrain suffit pour générer du contenu percutant."
  },
  // MAIL 2
  {
    sujet:    "→ Tes contenus de la semaine, générés en 1 clic !",
    intro:    "Tes abonnés interagissent avec toi si tu es visible : sois au rendez-vous ! Ton assistant IA est prêt - il n'a besoin que de toi pour commencer.",
    accroche: "Qu'as-tu vécu cette semaine qui mériterait d'être partagé ?",
    tip:      "Pense à ajouter une photo cette semaine, et intègre-la en question 7."
  },
  // MAIL 3 : jour dynamique dans sujet et intro
  {
    sujet:    "★ {JOUR_MAJ} : c'est l'heure de ton rituel réseaux sociaux !",
    intro:    "{JOUR_MAJ} : 5 minutes pour préparer tes contenus hebdos ! La régularité, c'est ce qui fait la différence.",
    accroche: "Un retour client, une fierté, une observation - tout ça devient du contenu.",
    tip:      "Plus tes réponses sont précises, plus ton IA colle à ta voix."
  },
  // MAIL 4 : renforcé
  {
    sujet:    "→ Cette semaine, publie avec intention",
    intro:    "Bonjour ! Avant que la semaine s'emballe et que le quotidien reprenne le dessus : note ce qui compte vraiment. Tes contenus doivent refléter ta réalité de terrain.",
    accroche: "Quel moment de ta semaine passée a créé de la valeur pour tes clients ?",
    tip:      "Même 3 réponses bien détaillées suffisent pour générer des contenus de qualité - l'IA fait le reste."
  },
  // MAIL 5
  {
    sujet:    "★ Tes abonnés ne t'ont pas encore vu cette semaine ?",
    intro:    "Pour parler de toi, tes abonnés ont besoin de te voir ! C'est parti : réponds aux 8 questions et ton IA s'occupe du reste.",
    accroche: "Qu'est-ce que tu aurais aimé dire à tes clients cette semaine ?",
    tip:      "La question 8 (intention éditoriale) guide toute la génération de la semaine - ne la saute pas."
  },
  // MAIL 6 : jour dynamique
  {
    sujet:    "→ Nouveau {JOUR}, nouvelle opportunité de visibilité !",
    intro:    "Nouveau {JOUR}, nouvelle opportunité de visibilité ! Ta présence en ligne se construit semaine après semaine. C'est maintenant.",
    accroche: "Une fierté, un apprentissage, une surprise cette semaine ?",
    tip:      "Ton IA apprend de tes réponses au fil du temps - plus tu l'alimentes, mieux elle te connaît."
  },
  // MAIL 7
  {
    sujet:    "★ 5 minutes pour une semaine de contenus",
    intro:    "1 clic = tous tes contenus de la semaine ? Presque. L'équation est simple : 5 minutes de toi = toute une semaine de posts prêts.",
    accroche: "Qu'est-ce qui s'est passé cette semaine dans ton activité ?",
    tip:      "Réponds avec tes propres mots, dans ta façon naturelle de parler - c'est exactement ce dont ton IA a besoin pour sonner comme toi."
  },
  // MAIL 8 : Mosseri + régularité
  {
    sujet:    "→ La régularité paye : et tu le sais déjà",
    intro:    "Adam Mosseri, le directeur d'Instagram, le répète depuis des années : la régularité est le seul vrai secret de la visibilité. Publier les mêmes jours, chaque semaine - c'est ce qui compte.",
    accroche: "5 minutes aujourd'hui pour alimenter ton IA : qu'est-ce qui t'a marqué(e) cette semaine ?",
    tip:      "Tes posts sont planifiés aux mêmes jours chaque semaine - ta régularité est déjà intégrée dans l'outil."
  },
  // MAIL 9 : avis client, pas "verbatim"
  {
    sujet:    "★ Ton dernier avis client mérite d'être dans ton IA",
    intro:    "Ton dernier avis client mérite d'être dans ton IA - sinon elle passe à côté de ta réalité. Quelques mots sur ton actualité pro et elle génère le reste.",
    accroche: "Qu'est-ce que tes clients t'ont dit cette semaine qui mérite d'être partagé ?",
    tip:      "Les mots de tes clients (question 2) sont l'ingrédient le plus puissant : une vraie phrase vaut mille généralités."
  },
  // MAIL 10
  {
    sujet:    "→ C'est le moment ou jamais : alimente ton IA !",
    intro:    "C'est le moment ou jamais ! Cette semaine encore, tu peux publier avec intention et sans effort.",
    accroche: "Une observation, une anecdote, une fierté de ta semaine passée ?",
    tip:      "Si tu actives la recherche web, ton post intègrera une actualité récente de ton secteur - un vrai plus pour le pilier Expertise."
  },
];

const NOMS_JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

function jourEnvoiPourIndex(indexActif) { return Math.min(Math.floor(indexActif / 100), 6); }

function envoyerRappelSemaine() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const acces = ss.getSheetByName("Acces");
  if (!acces) return;

  const config = ss.getSheetByName("Config");
  let numSemaine = 0;
  if (config) {
    config.getDataRange().getValues().forEach(row => {
      if (String(row[0]).trim() === 'num_semaine_email') numSemaine = parseInt(row[1]) || 0;
    });
  }

  const tpl        = TEMPLATES_EMAIL[numSemaine % TEMPLATES_EMAIL.length];
  const annee      = new Date().getFullYear();
  const semaine    = getNumeroSemaine(new Date());
  const appUrl     = "https://app.roze-communications.fr";
  const jourActuel = (new Date().getDay() + 6) % 7;

  // Nom du jour d'envoi pour les templates dynamiques ({JOUR} / {JOUR_MAJ})
  const NOMS_JOURS_FR = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const jourNom    = NOMS_JOURS_FR[jourActuel] || 'Lundi'; // Ex : "Lundi"
  const jourNomMin = jourNom.toLowerCase();                 // Ex : "lundi"

  // Substituer {JOUR} et {JOUR_MAJ} dans les champs du template
  function substituJour(str) {
    return str
      .replace(/\{JOUR_MAJ\}/g, jourNom)
      .replace(/\{JOUR\}/g, jourNomMin);
  }
  const tplFinal = {
    sujet:    substituJour(tpl.sujet),
    intro:    substituJour(tpl.intro),
    accroche: substituJour(tpl.accroche),
    tip:      substituJour(tpl.tip),
  };

  const data = acces.getDataRange().getValues();
  let indexActif = 0, envois = 0;

  for (let i = 1; i < data.length; i++) {
    const email  = String(data[i][0] || '').trim();
    const statut = String(data[i][1] || '').toLowerCase().trim();
    const nom    = String(data[i][2] || '').trim().split(' ')[0] || 'toi';
    if (!email || statut !== 'actif') continue;
    // Vérifier le consentement email — colonne D (index 3), 'non' = désinscrit
    const mailOptin = String(data[i][3] || '').toLowerCase().trim();
    if (mailOptin === 'non') continue;
    if (jourEnvoiPourIndex(indexActif) !== jourActuel) { indexActif++; continue; }
    indexActif++;

    try {
      GmailApp.sendEmail(email, tplFinal.sujet, '', {
        htmlBody: construireEmailHtml(tplFinal, nom, appUrl, semaine, annee, email),
        name: 'Roze Assistant', noReply: false
      });
      envois++;
    } catch(e) { Logger.log('Erreur envoi ' + email + ' : ' + e.message); }
  }

  if (jourActuel === 0) majConfigKey(config, 'num_semaine_email', String(numSemaine + 1));
  Logger.log(envois + ' emails envoyés — template #' + (numSemaine % TEMPLATES_EMAIL.length));
}

function construireEmailHtml(tpl, prenom, appUrl, semaine, annee, emailDestinataire) {
  const lienDesabonnement = appUrl + '?action=desabonner&email=' + encodeURIComponent(emailDestinataire || '');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#111111;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:linear-gradient(135deg,#b01050,#E8186D);border-radius:16px 16px 0 0;padding:32px 36px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:8px;">✦ Roze Assistant</div>
        <div style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">${tpl.sujet.replace(/^[^\s]+ /, '')}</div>
      </td></tr>
      <tr><td style="background:#1a1a1a;padding:32px 36px;">
        <p style="font-size:16px;color:#e0e0e0;line-height:1.7;margin:0 0 20px;">Bonjour <strong style="color:#E8186D;">${prenom}</strong>,</p>
        <p style="font-size:15px;color:#cccccc;line-height:1.75;margin:0 0 24px;">${tpl.intro}</p>
        <div style="background:#222222;border-left:3px solid #E8186D;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 28px;">
          <p style="font-size:15px;color:#ffffff;line-height:1.6;margin:0;font-style:italic;">« ${tpl.accroche} »</p>
        </div>
        <p style="font-size:14px;color:#aaaaaa;line-height:1.65;margin:0 0 32px;">${tpl.tip}</p>
        <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
          <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#b01050,#E8186D);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 40px;border-radius:50px;letter-spacing:.5px;">✍️ Remplir mes questions →</a>
        </td></tr></table>
        <p style="font-size:12px;color:#555555;text-align:center;margin:28px 0 0;line-height:1.6;">Semaine ${semaine} · ${annee}<br/>Tu reçois ce rappel car tu utilises Roze Assistant.<br/><a href="${lienDesabonnement}" style="color:#555;text-decoration:underline;font-size:11px;">Me désabonner</a></p>
      </td></tr>
      <tr><td style="background:#0d0d0d;border-radius:0 0 16px 16px;padding:16px 36px;text-align:center;">
        <p style="font-size:11px;color:#444444;margin:0;">✦ Roze Communications · Formation Réseaux Sociaux & IA</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

// ============================================================
// UTILITAIRES
// ============================================================
function reponse(donnees) {
  return ContentService.createTextOutput(JSON.stringify(donnees)).setMimeType(ContentService.MimeType.JSON);
}

function getSemaineCourante() {
  const now   = new Date();
  const debut = new Date(now.getFullYear(), 0, 1);
  const sem   = Math.ceil((((now - debut) / 86400000) + debut.getDay() + 1) / 7);
  return 'S.' + String(sem).padStart(2,'0') + '-' + now.getFullYear();
}

function getNumeroSemaine(date) {
  const d      = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function majConfigKey(sheet, key, value) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
}
