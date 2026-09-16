-- Strip leftover QSR/restaurant tenant branding from the dance pilot.
-- Applied migrations that originally seeded that name are left untouched
-- (Prisma checksums). This is the live rename.

UPDATE "organizations"
SET
  "name" = 'Salsa Attitude',
  "slug" = 'salsa-attitude',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'bati' OR "name" ILIKE '%bati%';

UPDATE "locations"
SET
  "name" = replace("name", 'Bati', 'Salsa Attitude'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name" ILIKE '%bati%';

-- Onboarding / CNESST leftovers that still named the restaurant.

UPDATE "formation_modules"
SET
  "title" = 'Les valeurs du studio',
  "summary" = 'Valeurs, mission et attentes dès le premier cours.',
  "body" = 'Découvrez l''esprit du studio : accueil, rythme et respect des partenaires. Ce module est obligatoire avant votre première soirée à l''accueil.',
  "steps" = '[
    {"order":1,"title":"Pourquoi le studio existe","body":"Enseigner la danse sociale avec des salles équilibrées Lead / Follow et un accueil chaleureux."},
    {"order":2,"title":"Les 5 valeurs","body":"Communiquer, s''entraider entre postes et signaler les problèmes tôt."},
    {"order":3,"title":"Quiz","body":"Valider la compréhension des standards d''équipe."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000205';

UPDATE "formation_modules"
SET
  "title" = 'Le système RitmoKit',
  "summary" = 'RitmoKit, horaires, pointeuse et messages d''équipe.',
  "body" = 'Apprenez à utiliser RitmoKit au quotidien : sessions, pointeuse, messages et alertes.',
  "steps" = '[
    {"order":1,"title":"App RitmoKit","body":"Installer la PWA et activer les notifications."},
    {"order":2,"title":"Pointeuse","body":"Pointer à l''heure avec ton NIP sur la tablette."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000206';

UPDATE "formation_modules"
SET
  "title" = 'Sécurité studio — CNESST',
  "summary" = 'Plancher, sorties, premiers soins et signalement avant le premier cours.',
  "body" = 'Ce module couvre les risques CNESST d''un studio de danse : plancher glissant, volume sonore, sorties de secours et signalement des incidents.',
  "steps" = '[
    {"order":1,"title":"Plancher","body":"Essuyer toute eau ou boisson immédiatement. Chaussures de danse propres uniquement."},
    {"order":2,"title":"Volume et circulation","body":"Garder les allées libres. Signaler un volume trop fort au responsable de salle."},
    {"order":3,"title":"Signalement","body":"Tout incident ou quasi-accident doit être signalé au gérant et consigné dans RitmoKit le jour même."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000201';

UPDATE "formation_modules"
SET
  "title" = 'Ouverture de l''accueil — module interactif',
  "summary" = 'Checklist studio pour ouvrir la soirée.',
  "body" = 'Validez chaque étape d''ouverture avant le premier élève. Ce module reprend la SOP épinglée sur #accueil.',
  "steps" = '[
    {"order":1,"title":"Salle","body":"Lumières, sono et tablette Accueil allumées. Vérifier les sorties."},
    {"order":2,"title":"Caisse","body":"Compter le fond de caisse et ouvrir la file Interac."},
    {"order":3,"title":"Mise en place","body":"Préparer le roster de la soirée et les prix walk-in."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000204';

UPDATE "formation_modules"
SET
  "title" = 'Sécurité accueil — CNESST',
  "summary" = 'Ergonomie à la tablette, circulation et gestion des files.',
  "body" = 'Formation obligatoire pour tout employé à l''accueil : posture à la tablette, files d''attente et procédure en cas de déversement.',
  "steps" = '[
    {"order":1,"title":"Posture & ergonomie","body":"Alterner les tâches debout toutes les 2 h. Tablette à hauteur des yeux."},
    {"order":2,"title":"Hygiène","body":"Lavage des mains après encaissement cash et avant de toucher le matériel partagé."},
    {"order":3,"title":"Déversement","body":"Baliser, nettoyer, sécher. Aviser l''instructeur si le plancher de danse est mouillé."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000202';

UPDATE "formation_modules"
SET
  "title" = 'Sécurité logistique — CNESST',
  "summary" = 'Manutention des caisses de sono et matériel de salle.',
  "body" = 'Formation pour le matériel lourd du studio : caisses de sono, chaises et tapis.',
  "steps" = '[
    {"order":1,"title":"Manutention","body":"Soulever avec les jambes, pas le dos. Deux personnes pour une caisse de sono."},
    {"order":2,"title":"Câbles","body":"Rassembler les câbles hors des allées avant l''ouverture des portes."},
    {"order":3,"title":"Rangement","body":"Ranger chaises et tapis après la dernière classe. Laisser les sorties libres."}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000203';

UPDATE "sops"
SET
  "title" = 'Ouverture de l''accueil',
  "steps" = replace(replace("steps"::text, 'Bati', 'studio'), 'fiche Bati', 'fiche Accueil')::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" ILIKE '%cuisine%' OR "steps"::text ILIKE '%bati%';
