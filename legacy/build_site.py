#!/usr/bin/env python3
"""Construit la version hébergée de GAC Pilot à partir de la source de l'artifact.

Entrée  : ~/gac-pilot/source-artifact.html  (export de l'artifact Claude)
Sortie  : ~/gac-pilot/site/public/index.html

La page de l'artifact parle à la capability `db` de Claude ; la version hébergée
parle à la fonction Netlify `bridge`, qui écrit dans Airtable via n8n.
Ce script remplace uniquement cette couche de données — le reste est identique.

Déploiement :
  cd ~/gac-pilot/site
  npx netlify-cli deploy --prod --dir public --functions netlify/functions \\
      --site 2055bb1e-95a6-4439-a526-8966c205595e
"""
import os, sys

BASE = os.path.expanduser('~/gac-pilot')
SRC = BASE + '/source-artifact.html'
OUT = BASE + '/site'

html = open(SRC, encoding='utf-8').read()
orig = html
errors = []

def sub_once(needle, replacement, label):
    global html
    if html.count(needle) != 1:
        errors.append('%s : %d occurrence(s) au lieu de 1' % (label, html.count(needle)))
        return
    html = html.replace(needle, replacement)

# ---------- 1. écran de connexion ----------
LOGIN = '''<div id="gate" style="position:fixed;inset:0;z-index:9999;background:#F7F5FF;display:flex;align-items:center;justify-content:center;padding:20px">
  <form id="gate-form" style="background:#fff;border-radius:16px;padding:32px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(33,11,44,.12)">
    <div style="font:800 22px/1.2 'Plus Jakarta Sans',system-ui,sans-serif;color:#210B2C;margin-bottom:6px">GAC Pilot</div>
    <div style="font:14px/1.5 'Plus Jakarta Sans',system-ui,sans-serif;color:#6B6280;margin-bottom:20px">Accès réservé</div>
    <input id="gate-pwd" type="password" autocomplete="current-password" placeholder="Mot de passe"
      style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #E4DEF7;border-radius:10px;font:15px 'Plus Jakarta Sans',system-ui,sans-serif;margin-bottom:12px">
    <button type="submit" style="width:100%;padding:12px;border:0;border-radius:10px;background:#6D28D9;color:#fff;font:600 15px 'Plus Jakarta Sans',system-ui,sans-serif;cursor:pointer">Entrer</button>
    <div id="gate-err" style="color:#B91C1C;font:13px 'Plus Jakarta Sans',system-ui,sans-serif;margin-top:12px" hidden></div>
  </form>
</div>
'''
sub_once('<body>\n', '<body>\n' + LOGIN, 'ecran de connexion')

# ---------- 2. pont API à la place de la capability db ----------
SHIM = '''
  // ---------------- pont vers Airtable via la fonction Netlify ----------------
  var API = {
    pwd: null,
    call: function(action, body){
      return fetch('/api/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-password': API.pwd || '' },
        body: JSON.stringify(body || {})
      }).then(function(r){
        if(r.status === 401){ var e = new Error('mot de passe refuse'); e.code = 'unauthorized'; throw e; }
        return r.text().then(function(t){
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch(_){ data = null; }
          if(!r.ok){
            var err = new Error((data && data.message) || t || ('HTTP ' + r.status));
            err.code = (data && data.code) || ('http_' + r.status);
            throw err;
          }
          return data;
        });
      });
    }
  };

  function makeDb(){
    var leadsCb = null, leadsErr = null, metaCb = null, timer = null, pulling = false;
    function pull(){
      if(pulling) return Promise.resolve();
      pulling = true;
      return API.call('leads', {}).then(function(rows){
        rows = rows || [];
        var docs = rows.map(function(r){
          return { id: r.id, data: function(){ return { fields: r.fields || {} }; } };
        });
        if(leadsCb) leadsCb({ docs: docs });
        if(metaCb) metaCb({ exists: true, data: function(){ return { at: Date.now(), count: rows.length }; } });
      }).catch(function(err){
        if(leadsErr) leadsErr(err);
      }).then(function(){ pulling = false; });
    }
    return {
      refresh: pull,
      collection: function(name){
        return {
          limit: function(){ return this; },
          onSnapshot: function(cb, err){
            leadsCb = cb; leadsErr = err;
            pull();
            if(timer) clearInterval(timer);
            timer = setInterval(pull, 25000);
          },
          add: function(obj){ return API.call('sourcing', obj); }
        };
      },
      doc: function(path){
        if(path === 'meta/lastSync'){
          return { onSnapshot: function(cb){ metaCb = cb; } };
        }
        var id = path.replace('leads/', '');
        return {
          update: function(patch){
            return API.call('update', { recordId: id, fields: patch.fields || {} })
              .then(function(){ return pull(); });
          }
        };
      }
    };
  }

  var db = null;'''
sub_once('  var db = null;', SHIM, 'pont API')

# ---------- 3. refus des écritures vers une colonne absente d'Airtable ----------
OLD_SAVE = """  function saveLeadFields(id, patch){
    return setPath(id).update({ fields: patch, _dirty: true, _updatedAt: Date.now() })
      .catch(function(err){ showToast('Échec de l\\'enregistrement : ' + (err && err.code || 'erreur')); });
  }"""

NEW_SAVE = """  var KNOWN_COLS = null;
  function saveLeadFields(id, patch){
    if(KNOWN_COLS){
      var absentes = Object.keys(patch).filter(function(k){ return KNOWN_COLS.indexOf(k) === -1; });
      if(absentes.length){
        showToast('Non enregistré : la colonne « ' + absentes[0] + ' » n\\'existe pas encore dans Airtable.');
        return Promise.reject(new Error('colonne_absente'));
      }
    }
    return setPath(id).update({ fields: patch })
      .catch(function(err){
        showToast('Échec de l\\'enregistrement : ' + ((err && err.message) || 'erreur'));
        throw err;
      });
  }"""
sub_once(OLD_SAVE, NEW_SAVE, 'saveLeadFields')

sub_once(
    "saveLeadFields(id, { 'Étape pipeline': newStage }).then(function(){ showToast('Étape mise à jour — synchro Airtable sous ~10 min'); });",
    "saveLeadFields(id, { 'Étape pipeline': newStage }).then(function(){ showToast('Étape mise à jour dans Airtable'); }).catch(function(){ renderAll(); });",
    'appel kanban')

sub_once('    saveLeadFields(id, patch);\n', '    saveLeadFields(id, patch).catch(function(){});\n', 'appel cellule')

sub_once(
    """    saveLeadFields(currentMailId, patch).then(function(){
      document.getElementById('mail-modal').hidden = true;
      showToast('Email enregistré — synchro vers Airtable/Brevo sous ~10 min');
    });""",
    """    saveLeadFields(currentMailId, patch).then(function(){
      document.getElementById('mail-modal').hidden = true;
      showToast('Email enregistré dans Airtable — départ vers Brevo sous 10 min');
    }).catch(function(){});""",
    'appel modal mail')

# ---------- 4. init() remplacé par la porte d'entrée + démarrage ----------
OLD_INIT = """  async function init(){
    claude.use('sample').then(function(fn){ sampleFn = fn; if(!fn){ document.getElementById('mail-rewrite-btn').title = 'Indisponible dans cette vue'; } });
    db = await claude.use('db');
    if(!db){ setStatus('Base de données indisponible dans cette vue — données non chargées', true); renderAll(); return; }
    db.collection('leads').limit(1000).onSnapshot(function(snap){
      state.leads = snap.docs.map(function(d){ var data = d.data() || {}; return { id: d.id, fields: data.fields || {} }; });
      state.ready = true;
      setStatus(state.leads.length + ' leads en direct depuis Airtable');
      renderAll();
    }, function(err){ setStatus('Erreur de lecture (' + err.code + ')', true); });
    db.doc('meta/lastSync').onSnapshot(function(snap){
      state.lastSync = snap.exists ? snap.data() : null;
      renderSettings();
    });
  }
  init();"""

NEW_INIT = """  var rewriteBtn = document.getElementById('mail-rewrite-btn');
  if(rewriteBtn){ rewriteBtn.title = "Réécriture IA disponible uniquement dans la version Claude"; }

  function start(){
    db = makeDb();
    API.call('schema', {}).then(function(res){
      KNOWN_COLS = (res && res.colonnes) || null;
      renderSettings();
    }).catch(function(){ KNOWN_COLS = null; });
    chargerStatsBrevo();
    setInterval(chargerStatsBrevo, 60000);
    db.collection('leads').limit(1000).onSnapshot(function(snap){
      state.leads = snap.docs.map(function(d){ var data = d.data() || {}; return { id: d.id, fields: data.fields || {} }; });
      state.ready = true;
      setStatus(state.leads.length + ' leads en direct depuis Airtable');
      renderAll();
    }, function(err){
      if(err && err.code === 'unauthorized'){ openGate('Session expirée, reconnecte-toi.'); return; }
      setStatus('Erreur de lecture (' + ((err && err.code) || 'inconnue') + ')', true);
    });
    db.doc('meta/lastSync').onSnapshot(function(snap){
      state.lastSync = snap.exists ? snap.data() : null;
      renderSettings();
    });
  }

  // ---------------- porte d'entrée ----------------
  var gate = document.getElementById('gate');
  var gateForm = document.getElementById('gate-form');
  var gateErr = document.getElementById('gate-err');
  function openGate(msg){
    API.pwd = null;
    try { localStorage.removeItem('gac_pwd'); } catch(_){}
    gate.hidden = false;
    gate.style.display = 'flex';
    if(msg){ gateErr.textContent = msg; gateErr.hidden = false; }
  }
  function closeGate(){ gate.style.display = 'none'; gate.hidden = true; }

  function tryPassword(pwd){
    API.pwd = pwd;
    return API.call('ping', {}).then(function(){
      try { localStorage.setItem('gac_pwd', pwd); } catch(_){}
      closeGate();
      start();
      return true;
    });
  }

  gateForm.addEventListener('submit', function(e){
    e.preventDefault();
    gateErr.hidden = true;
    var pwd = document.getElementById('gate-pwd').value;
    tryPassword(pwd).catch(function(err){
      gateErr.textContent = (err && err.code === 'unauthorized') ? 'Mot de passe incorrect.' : 'Connexion impossible : ' + ((err && err.message) || 'erreur');
      gateErr.hidden = false;
    });
  });

  var saved = null;
  try { saved = localStorage.getItem('gac_pwd'); } catch(_){}
  if(saved){
    tryPassword(saved).catch(function(){ openGate(); });
  } else {
    openGate();
  }"""
sub_once(OLD_INIT, NEW_INIT, 'init')

# ---------- 5. texte des réglages ----------
sub_once(
    "el.innerHTML = 'Base Airtable \"Lead Pilot\" — '+n+' leads synchronisés.<br>Dernière synchro : '+lastSyncTxt+'.<br>Les écritures (colonnes éditées, étape pipeline, validation email) sont poussées vers Airtable/Brevo par une tâche planifiée toutes les heures, tant qu\\'une session Claude Code reste active sur le Mac.';",
    "var manquantes = '';\n"
    "    if(KNOWN_COLS){\n"
    "      var attendues = ['Étape pipeline','Valeur deal','Pack','Statut appel','Prochaine action','Responsable'];\n"
    "      var abs = attendues.filter(function(c){ return KNOWN_COLS.indexOf(c) === -1; });\n"
    "      if(abs.length){ manquantes = '<br><br><strong>À créer dans Airtable</strong> pour que le pipeline soit enregistré : ' + abs.join(', ') + '.'; }\n"
    "    }\n"
    "    el.innerHTML = 'Base Airtable \"Lead Pilot\" — '+n+' leads synchronisés.<br>Dernière lecture : '+lastSyncTxt+' (rafraîchissement automatique toutes les 25 secondes).<br>Les écritures partent vers Airtable immédiatement. Les leads validés rejoignent la liste Brevo « Leads validés - GAC Pilot » dans les 10 minutes.' + manquantes;",
    'texte reglages')

if errors:
    print('ECHEC :')
    for e in errors:
        print('  -', e)
    sys.exit(1)

os.makedirs(OUT + '/public', exist_ok=True)
open(OUT + '/public/index.html', 'w', encoding='utf-8').write(html)
print('site/public/index.html ecrit : %d octets (source %d)' % (len(html), len(orig)))
