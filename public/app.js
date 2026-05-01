'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

const JOURS_LABELS = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
};

const CAT_EMOJI = {
  'Viandes': '🍗', 'Poissons': '🐟', 'Végétarien': '🥦',
  'Pâtes & Riz': '🍝', 'Soupe': '🥣', 'Salade': '🥗',
};

const COURSE_EMOJI = {
  'Fruits & Légumes': '🥦', 'Viandes & Poissons': '🥩',
  'Produits laitiers & Œufs': '🥚', 'Boulangerie': '🥖',
  'Épicerie sèche': '🌾', 'Conserves & Sauces': '🥫',
  'Surgelés': '🧊', 'Boissons': '🥤', 'Hygiène & Maison': '🧴',
};

// ── Week helpers ───────────────────────────────────────────────────────────
function getCurrentWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMondayDate() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));
  return monday.toISOString().split('T')[0];
}

function formatWeekLabel(semaine) {
  const [, w] = semaine.split('-W');
  const d = new Date(getMondayDate());
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `Sem. ${parseInt(w)} · ${day}`;
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  view: 'menu',
  recettes: [],
  gardeManger: [],
  historique: [],
  semaine: getCurrentWeek(),
  lundiDate: getMondayDate(),
  menu: null,         // { lundi: {id, nom, duree_min}, ... }
  semaineId: null,    // Notion page ID de l'entrée historique courante
  statut: null,
  courses: null,      // { liste_courses: {...}, total_articles: N }
  checked: {},
  loading: false,
  loadingMsg: '',
  replacingDay: null,
  recetteFilter: 'all',
  recetteSearch: '',
};

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Erreur HTTP ${r.status}`);
  return data;
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ── Loading ────────────────────────────────────────────────────────────────
function setLoading(loading, msg = '') {
  state.loading = loading;
  state.loadingMsg = msg;
  render();
}

// ── localStorage ───────────────────────────────────────────────────────────
function loadChecked() {
  try { return JSON.parse(localStorage.getItem(`carter-checked-${state.semaine}`) || '{}'); }
  catch { return {}; }
}

function saveChecked() {
  localStorage.setItem(`carter-checked-${state.semaine}`, JSON.stringify(state.checked));
}

function loadCourses() {
  try { return JSON.parse(localStorage.getItem(`carter-courses-${state.semaine}`)); }
  catch { return null; }
}

function saveCourses(courses) {
  localStorage.setItem(`carter-courses-${state.semaine}`, JSON.stringify(courses));
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('week-label').textContent = formatWeekLabel(state.semaine);
  state.checked = loadChecked();
  state.courses = loadCourses();

  setLoading(true, 'Chargement…');
  try {
    const data = await api('GET', '/api/data');
    state.recettes = data.recettes;
    state.gardeManger = data.gardeManger;
    state.historique = data.historique;

    const current = data.historique.find(h => h.semaine === state.semaine);
    if (current) {
      state.semaineId = current.id;
      state.statut = current.statut;
      try { state.menu = JSON.parse(current.validation_json); } catch { state.menu = null; }
      if (state.menu && Object.keys(state.menu).length !== 7) state.menu = null;
    }
  } catch (err) {
    toast(`Erreur chargement : ${err.message}`, 5000);
  } finally {
    setLoading(false);
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.tab;
      render();
    });
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('modal-search').addEventListener('input', renderModalList);
}

// ── Render dispatcher ──────────────────────────────────────────────────────
function render() {
  const view = document.getElementById('view');

  if (state.loading) {
    view.innerHTML = `
      <div class="loading-wrap">
        <div class="spinner"></div>
        <p class="loading-text">${state.loadingMsg}</p>
      </div>`;
    return;
  }

  if (state.view === 'menu') renderMenuView(view);
  else if (state.view === 'courses') renderCoursesView(view);
  else renderRecettesView(view);
}

// ── Menu view ──────────────────────────────────────────────────────────────
function renderMenuView(container) {
  if (!state.menu) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗓</div>
        <div class="empty-title">Pas encore de menu</div>
        <div class="empty-desc">Gemini va sélectionner 7 recettes adaptées à votre famille pour la semaine.</div>
        <button class="btn btn-primary" id="btn-plan">✨ Planifier avec Gemini</button>
      </div>`;
    document.getElementById('btn-plan').addEventListener('click', planifierMenu);
    return;
  }

  const statut = state.statut || 'En attente';
  const badgeClass = statut === 'Courses faites' ? 'badge-done' : 'badge-pending';

  let html = `
    <div class="status-bar">
      <span class="badge ${badgeClass}">${statut}</span>
      <button class="btn btn-outline btn-sm" id="btn-replan">🎲 Replanifier</button>
    </div>`;

  for (const jour of JOURS) {
    const r = state.menu[jour];
    if (!r) continue;
    const full = state.recettes.find(rec => rec.id === r.id);
    const emoji = CAT_EMOJI[full?.categorie] || '🍽';
    html += `
      <div class="day-card">
        <span class="day-tag">${JOURS_LABELS[jour]}</span>
        <div class="day-info">
          <div class="day-recipe-name">${r.nom}</div>
          <div class="day-meta">${emoji} ${full?.categorie || ''} · ⏱ ${r.duree_min} min</div>
        </div>
        <button class="btn-replace" data-day="${jour}">Changer</button>
      </div>`;
  }

  html += `
    <div class="actions-footer">
      <button class="btn btn-primary btn-full" id="btn-courses">🛒 Générer les courses</button>
    </div>`;

  container.innerHTML = html;

  document.getElementById('btn-replan').addEventListener('click', planifierMenu);
  document.getElementById('btn-courses').addEventListener('click', genererCourses);
  container.querySelectorAll('.btn-replace').forEach(btn => {
    btn.addEventListener('click', () => openReplacePicker(btn.dataset.day));
  });
}

// ── Courses view ───────────────────────────────────────────────────────────
function renderCoursesView(container) {
  if (!state.menu) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">Pas de menu planifié</div>
        <div class="empty-desc">Planifie d'abord le menu de la semaine dans l'onglet Menu.</div>
      </div>`;
    return;
  }

  if (!state.courses) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">Liste de courses vide</div>
        <div class="empty-desc">Génère la liste depuis l'onglet Menu une fois le menu planifié.</div>
        <button class="btn btn-primary" id="btn-gen">🛒 Générer avec Gemini</button>
      </div>`;
    document.getElementById('btn-gen')?.addEventListener('click', genererCourses);
    return;
  }

  const { liste_courses, total_articles } = state.courses;
  const totalChecked = Object.values(state.checked).filter(Boolean).length;
  const pct = total_articles > 0 ? Math.round((totalChecked / total_articles) * 100) : 0;

  let html = `
    <div class="status-bar">
      <span style="font-size:13px;color:var(--text-muted)">${totalChecked} / ${total_articles} articles</span>
      <button class="btn btn-outline btn-sm" id="btn-regen">🔄 Regénérer</button>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" id="progress-fill" style="width:${pct}%"></div>
    </div>`;

  for (const [cat, items] of Object.entries(liste_courses)) {
    if (!items?.length) continue;
    const emoji = COURSE_EMOJI[cat] || '🛒';
    html += `<div class="course-section"><p class="course-category">${emoji} ${cat}</p><ul>`;
    for (const item of items) {
      const key = `${cat}::${item.article}`;
      const checked = !!state.checked[key];
      html += `
        <li class="course-item${checked ? ' checked' : ''}">
          <label>
            <input type="checkbox" data-key="${key}"${checked ? ' checked' : ''}>
            <span class="item-name">${item.article}</span>
            <span class="item-qty">${item.quantite} ${item.unite}</span>
          </label>
        </li>`;
    }
    html += '</ul></div>';
  }

  html += `
    <div class="actions-footer">
      <button class="btn btn-secondary btn-full" id="btn-done">✓ Courses faites</button>
    </div>`;

  container.innerHTML = html;

  document.getElementById('btn-regen')?.addEventListener('click', genererCourses);
  document.getElementById('btn-done')?.addEventListener('click', marquerCoursesFaites);

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.checked[cb.dataset.key] = cb.checked;
      saveChecked();
      cb.closest('.course-item').classList.toggle('checked', cb.checked);

      const checked = Object.values(state.checked).filter(Boolean).length;
      const pct = state.courses.total_articles > 0
        ? Math.round((checked / state.courses.total_articles) * 100) : 0;
      document.getElementById('progress-fill').style.width = `${pct}%`;
      container.querySelector('.status-bar span').textContent = `${checked} / ${state.courses.total_articles} articles`;
    });
  });
}

// ── Recettes view ──────────────────────────────────────────────────────────
function renderRecettesView(container) {
  const categories = [...new Set(state.recettes.map(r => r.categorie).filter(Boolean))];

  let filtered = state.recettes;
  if (state.recetteSearch) {
    const q = state.recetteSearch.toLowerCase();
    filtered = filtered.filter(r => r.nom.toLowerCase().includes(q));
  }
  if (state.recetteFilter !== 'all') {
    filtered = filtered.filter(r => r.categorie === state.recetteFilter);
  }

  const chips = ['all', ...categories].map(c => {
    const label = c === 'all' ? 'Toutes' : `${CAT_EMOJI[c] || ''} ${c}`;
    return `<button class="filter-chip${state.recetteFilter === c ? ' active' : ''}" data-filter="${c}">${label}</button>`;
  }).join('');

  let html = `
    <input type="search" class="search-input" id="recette-search" placeholder="Rechercher une recette…" value="${state.recetteSearch}" />
    <div class="filters">${chips}</div>
    <p class="count-label">${filtered.length} recette${filtered.length !== 1 ? 's' : ''}</p>`;

  if (filtered.length === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);padding:24px 0">Aucune recette trouvée</p>';
  }

  for (const r of filtered) {
    html += `
      <div class="recipe-card">
        <div class="recipe-card-name">
          ${r.nom}${r.adapte_bebe ? '<span class="baby-dot" title="Adapté bébé"></span>' : ''}
        </div>
        <div class="recipe-card-meta">
          <span>${CAT_EMOJI[r.categorie] || ''} ${r.categorie}</span>
          <span>⏱ ${r.duree_minutes} min</span>
          <span>${r.jour_type || ''}</span>
        </div>
      </div>`;
  }

  container.innerHTML = html;

  document.getElementById('recette-search')?.addEventListener('input', e => {
    state.recetteSearch = e.target.value;
    renderRecettesView(container);
  });

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.recetteFilter = chip.dataset.filter;
      renderRecettesView(container);
    });
  });
}

// ── Actions ────────────────────────────────────────────────────────────────
async function planifierMenu() {
  if (!state.recettes.length) {
    toast('Aucune recette dans Notion', 4000);
    return;
  }

  setLoading(true, 'Gemini planifie la semaine…');
  try {
    const historyNames = state.historique
      .slice(0, 4)
      .flatMap(h => {
        try { return Object.values(JSON.parse(h.validation_json)).map(r => r.nom); }
        catch { return []; }
      });

    const result = await api('POST', '/api/gemini/menu', {
      recettes: state.recettes,
      historique: historyNames,
    });

    state.menu = result.menu;
    state.statut = 'En attente';

    if (state.semaineId) {
      await api('PATCH', `/api/historique/${state.semaineId}`, {
        validation_json: state.menu,
        statut: 'En attente',
      });
    } else {
      const created = await api('POST', '/api/historique', {
        semaine: state.semaine,
        date_debut: state.lundiDate,
        validation_json: state.menu,
      });
      state.semaineId = created.id;
    }

    toast('Menu planifié ✓');
  } catch (err) {
    toast(`Erreur : ${err.message}`, 5000);
  } finally {
    setLoading(false);
  }
}

async function genererCourses() {
  if (!state.menu) return;
  setLoading(true, 'Gemini génère la liste de courses…');
  try {
    const result = await api('POST', '/api/gemini/courses', {
      menu: state.menu,
      recettes: state.recettes,
      gardeManger: state.gardeManger,
    });

    state.courses = result;
    state.checked = {};
    saveCourses(result);
    saveChecked();

    state.view = 'courses';
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'courses');
    });
    toast('Liste générée ✓');
  } catch (err) {
    toast(`Erreur : ${err.message}`, 5000);
  } finally {
    setLoading(false);
  }
}

async function marquerCoursesFaites() {
  try {
    if (state.semaineId) {
      await api('PATCH', `/api/historique/${state.semaineId}`, { statut: 'Courses faites' });
    }
    state.statut = 'Courses faites';
    toast('Semaine terminée ✓');
    render();
  } catch (err) {
    toast(`Erreur : ${err.message}`, 5000);
  }
}

// ── Recipe picker modal ────────────────────────────────────────────────────
function openReplacePicker(jour) {
  state.replacingDay = jour;
  const jourLabel = jour.charAt(0).toUpperCase() + jour.slice(1);
  document.getElementById('modal-title').textContent = `Changer — ${jourLabel}`;
  document.getElementById('modal-search').value = '';
  renderModalList();
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  state.replacingDay = null;
}

function renderModalList() {
  const q = document.getElementById('modal-search').value.toLowerCase();
  const jour = state.replacingDay;
  const isWeekend = ['samedi', 'dimanche'].includes(jour);

  let candidates = state.recettes.filter(r =>
    r.jour_type === (isWeekend ? 'Weekend' : 'Semaine')
  );
  if (q) candidates = candidates.filter(r => r.nom.toLowerCase().includes(q));

  const html = candidates.length
    ? candidates.map(r => `
        <div class="modal-recipe-item" data-id="${r.id}" data-nom="${r.nom}" data-duree="${r.duree_minutes}">
          <div class="modal-recipe-name">${r.nom}</div>
          <div class="modal-recipe-meta">${CAT_EMOJI[r.categorie] || ''} ${r.categorie} · ⏱ ${r.duree_minutes} min</div>
        </div>`).join('')
    : '<p style="padding:16px;color:var(--text-muted)">Aucune recette trouvée</p>';

  const list = document.getElementById('modal-list');
  list.innerHTML = html;

  list.querySelectorAll('.modal-recipe-item').forEach(item => {
    item.addEventListener('click', () =>
      selectRecipe(item.dataset.id, item.dataset.nom, parseInt(item.dataset.duree))
    );
  });
}

async function selectRecipe(id, nom, duree_min) {
  const jour = state.replacingDay;
  closeModal();
  state.menu[jour] = { id, nom, duree_min };

  try {
    if (state.semaineId) {
      await api('PATCH', `/api/historique/${state.semaineId}`, { validation_json: state.menu });
    }
    toast(`${nom} sélectionné ✓`);
  } catch (err) {
    toast(`Erreur sauvegarde : ${err.message}`, 4000);
  }

  render();
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
