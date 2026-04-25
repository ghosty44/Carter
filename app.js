'use strict';

const ITEMS = {
  fruits: [
    { name: 'Pommes', emoji: '🍎', qty: () => rnd(4,8) + ' pcs' },
    { name: 'Bananes', emoji: '🍌', qty: () => rnd(3,6) + ' pcs' },
    { name: 'Oranges', emoji: '🍊', qty: () => rnd(3,6) + ' pcs' },
    { name: 'Fraises', emoji: '🍓', qty: () => rnd(1,2) + ' barquette(s)' },
    { name: 'Raisins', emoji: '🍇', qty: () => rnd(1,2) + ' grappe(s)' },
    { name: 'Citrons', emoji: '🍋', qty: () => rnd(2,4) + ' pcs' },
    { name: 'Tomates', emoji: '🍅', qty: () => rnd(4,8) + ' pcs' },
    { name: 'Carottes', emoji: '🥕', qty: () => rnd(4,8) + ' pcs' },
    { name: 'Salade', emoji: '🥬', qty: () => '1 pièce' },
    { name: 'Courgettes', emoji: '🥒', qty: () => rnd(2,4) + ' pcs' },
    { name: 'Poivrons', emoji: '🫑', qty: () => rnd(2,3) + ' pcs' },
    { name: 'Oignons', emoji: '🧅', qty: () => rnd(3,5) + ' pcs' },
    { name: 'Ail', emoji: '🧄', qty: () => '1 tête' },
    { name: 'Pommes de terre', emoji: '🥔', qty: () => rnd(6,10) + ' pcs' },
    { name: 'Champignons', emoji: '🍄', qty: () => '250 g' },
    { name: 'Épinards', emoji: '🥦', qty: () => '1 sachet' },
    { name: 'Brocoli', emoji: '🥦', qty: () => '1 tête' },
    { name: 'Avocat', emoji: '🥑', qty: () => rnd(1,3) + ' pcs' },
    { name: 'Mangue', emoji: '🥭', qty: () => rnd(1,2) + ' pcs' },
    { name: 'Kiwi', emoji: '🥝', qty: () => rnd(3,5) + ' pcs' },
  ],
  dairy: [
    { name: 'Lait', emoji: '🥛', qty: () => rnd(1,3) + ' L' },
    { name: 'Beurre', emoji: '🧈', qty: () => '250 g' },
    { name: 'Yaourts nature', emoji: '🍶', qty: () => '1 pack x6' },
    { name: 'Fromage râpé', emoji: '🧀', qty: () => '200 g' },
    { name: 'Crème fraîche', emoji: '🍦', qty: () => '20 cl' },
    { name: 'Œufs', emoji: '🥚', qty: () => rnd(6,12) + ' pcs' },
    { name: 'Mozzarella', emoji: '🧀', qty: () => rnd(1,2) + ' boule(s)' },
    { name: 'Camembert', emoji: '🧀', qty: () => '1 pièce' },
    { name: 'Fromage blanc', emoji: '🥣', qty: () => '500 g' },
  ],
  meat: [
    { name: 'Poulet', emoji: '🍗', qty: () => rnd(2,4) + ' blanc(s)' },
    { name: 'Bœuf haché', emoji: '🥩', qty: () => rnd(300,600) + ' g' },
    { name: 'Saumon', emoji: '🐟', qty: () => rnd(2,3) + ' pavé(s)' },
    { name: 'Crevettes', emoji: '🍤', qty: () => '300 g' },
    { name: 'Lardons', emoji: '🥓', qty: () => '200 g' },
    { name: 'Côtes de porc', emoji: '🍖', qty: () => rnd(2,4) + ' pcs' },
    { name: 'Jambon', emoji: '🥩', qty: () => rnd(4,6) + ' tranches' },
    { name: 'Thon en boîte', emoji: '🐡', qty: () => rnd(1,3) + ' boîte(s)' },
    { name: 'Sardines', emoji: '🐠', qty: () => '1 boîte' },
    { name: 'Merguez', emoji: '🌭', qty: () => rnd(4,8) + ' pcs' },
  ],
  bakery: [
    { name: 'Pain de mie', emoji: '🍞', qty: () => '1 sachet' },
    { name: 'Baguette', emoji: '🥖', qty: () => rnd(1,2) + ' pcs' },
    { name: 'Croissants', emoji: '🥐', qty: () => rnd(2,4) + ' pcs' },
    { name: 'Pains au chocolat', emoji: '🍫', qty: () => rnd(2,4) + ' pcs' },
    { name: 'Biscottes', emoji: '🍪', qty: () => '1 paquet' },
    { name: 'Brioche', emoji: '🍞', qty: () => '1 pièce' },
  ],
  drinks: [
    { name: 'Eau minérale', emoji: '💧', qty: () => rnd(6,12) + ' bouteilles' },
    { name: 'Jus d\'orange', emoji: '🍊', qty: () => '1 L' },
    { name: 'Café', emoji: '☕', qty: () => '250 g' },
    { name: 'Thé', emoji: '🍵', qty: () => '1 boîte' },
    { name: 'Coca-Cola', emoji: '🥤', qty: () => '1,5 L' },
    { name: 'Bière', emoji: '🍺', qty: () => rnd(4,8) + ' canettes' },
    { name: 'Vin rouge', emoji: '🍷', qty: () => '1 bouteille' },
    { name: 'Limonade', emoji: '🍋', qty: () => '1,5 L' },
    { name: 'Sirop menthe', emoji: '🌿', qty: () => '1 bouteille' },
  ],
  snacks: [
    { name: 'Pâtes', emoji: '🍝', qty: () => rnd(1,2) + ' paquet(s)' },
    { name: 'Riz', emoji: '🍚', qty: () => '1 kg' },
    { name: 'Chips', emoji: '🥔', qty: () => rnd(1,3) + ' sachet(s)' },
    { name: 'Chocolat noir', emoji: '🍫', qty: () => rnd(1,3) + ' tablette(s)' },
    { name: 'Confiture', emoji: '🍓', qty: () => '1 pot' },
    { name: 'Miel', emoji: '🍯', qty: () => '1 pot' },
    { name: 'Huile d\'olive', emoji: '🫙', qty: () => '1 bouteille' },
    { name: 'Sauce tomate', emoji: '🍅', qty: () => rnd(1,2) + ' bocal(s)' },
    { name: 'Céréales', emoji: '🥣', qty: () => '1 boîte' },
    { name: 'Crackers', emoji: '🍘', qty: () => '1 paquet' },
    { name: 'Gâteaux secs', emoji: '🍪', qty: () => '1 paquet' },
    { name: 'Lentilles', emoji: '🫘', qty: () => '500 g' },
    { name: 'Conserves de légumes', emoji: '🥫', qty: () => rnd(2,4) + ' boîtes' },
    { name: 'Farine', emoji: '🌾', qty: () => '1 kg' },
    { name: 'Sucre', emoji: '🍬', qty: () => '1 kg' },
    { name: 'Sel & poivre', emoji: '🧂', qty: () => '1 set' },
  ],
  hygiene: [
    { name: 'Papier toilette', emoji: '🧻', qty: () => '1 pack' },
    { name: 'Shampoing', emoji: '🚿', qty: () => '1 flacon' },
    { name: 'Gel douche', emoji: '🛁', qty: () => '1 flacon' },
    { name: 'Dentifrice', emoji: '🦷', qty: () => '1 tube' },
    { name: 'Brosse à dents', emoji: '🪥', qty: () => rnd(1,4) + ' pcs' },
    { name: 'Déodorant', emoji: '💨', qty: () => '1 flacon' },
    { name: 'Liquide vaisselle', emoji: '🫧', qty: () => '1 flacon' },
    { name: 'Lessive', emoji: '🧺', qty: () => '1 boîte' },
    { name: 'Éponges', emoji: '🧽', qty: () => '1 sachet' },
    { name: 'Sacs poubelle', emoji: '🗑️', qty: () => '1 rouleau' },
  ],
};

const ALL_CATEGORIES = Object.keys(ITEMS);

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function getPool(category) {
  if (category === 'all') return ALL_CATEGORIES.flatMap(c => ITEMS[c]);
  return ITEMS[category] || [];
}

// ---- DOM ----
const categoryEl = document.getElementById('category');
const countEl    = document.getElementById('count');
const countDisp  = document.getElementById('count-display');
const genBtn     = document.getElementById('generate-btn');
const listSec    = document.getElementById('list-section');
const listEl     = document.getElementById('shopping-list');
const copyBtn    = document.getElementById('copy-btn');
const clearBtn   = document.getElementById('clear-btn');
const customIn   = document.getElementById('custom-item');
const addBtn     = document.getElementById('add-btn');
const toastEl    = document.getElementById('toast');

countEl.addEventListener('input', () => { countDisp.textContent = countEl.value; });

genBtn.addEventListener('click', generate);

function generate() {
  const pool = getPool(categoryEl.value);
  const count = parseInt(countEl.value, 10);
  const picked = pickRandom(pool, count);

  listEl.innerHTML = '';
  picked.forEach(item => appendItem(item.emoji, item.name, item.qty()));

  listSec.hidden = false;
  listSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function appendItem(emoji, name, qty) {
  const li = document.createElement('li');
  li.innerHTML = `
    <input type="checkbox" class="item-check" />
    <span class="item-emoji">${emoji}</span>
    <span class="item-name">${escHtml(name)}</span>
    <span class="item-qty">${escHtml(qty)}</span>
    <button class="item-delete" title="Supprimer">✕</button>
  `;

  li.querySelector('.item-check').addEventListener('change', e => {
    li.classList.toggle('checked', e.target.checked);
  });

  li.querySelector('.item-delete').addEventListener('click', () => {
    li.style.animation = 'none';
    li.style.opacity = '0';
    li.style.transform = 'translateX(20px)';
    li.style.transition = 'all .2s';
    setTimeout(() => {
      li.remove();
      if (!listEl.children.length) listSec.hidden = true;
    }, 200);
  });

  listEl.appendChild(li);
}

copyBtn.addEventListener('click', () => {
  const lines = [...listEl.querySelectorAll('li')].map(li => {
    const name = li.querySelector('.item-name').textContent;
    const qty  = li.querySelector('.item-qty').textContent;
    return `${name} — ${qty}`;
  });
  if (!lines.length) return;
  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => toast('Liste copiée ✓'))
    .catch(() => toast('Impossible de copier'));
});

clearBtn.addEventListener('click', () => {
  listEl.innerHTML = '';
  listSec.hidden = true;
});

addBtn.addEventListener('click', addCustom);
customIn.addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); });

function addCustom() {
  const val = customIn.value.trim();
  if (!val) return;
  appendItem('📝', val, '');
  customIn.value = '';
  listSec.hidden = false;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Service worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
