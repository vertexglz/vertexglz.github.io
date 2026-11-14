import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const client = createClient(
  'https://alqjzlamqnbfdbtczigm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscWp6bGFtcW5iZmRidGN6aWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NjYzNDcsImV4cCI6MjExMDI0MjM0N30.En76PFRox5kRpna9ZXGF09Cz8f_l0AWn7xAgnTgmTkM',
);

const $ = (id) => document.getElementById(id);
const feed = $('blog-feed');
const reader = $('reader');
const message = $('admin-message');
let isAdmin = false;
let editingPostId = null;
let editingMediaPath = null;
let editingMediaType = null;
let siteSettings = null;
let siteBlocks = [];
let isManaging = false;
let winterCheckins = [];

const habits = [
  { id: 'gym', label: 'Спорт / зал', hint: 'сила и энергия' },
  { id: 'programming', label: 'Программирование', hint: 'код каждый день' },
  { id: 'english', label: 'Английский', hint: 'язык и практика' },
  { id: 'reading', label: 'Чтение', hint: 'несколько страниц' },
  { id: 'walk', label: 'Прогулка', hint: 'свежая голова' },
];

function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function startOfWeek(date) { const result = new Date(date); const day = result.getDay() || 7; result.setDate(result.getDate() - day + 1); result.setHours(0, 0, 0, 0); return result; }
function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); return result; }

function renderWinterArc() {
  const today = new Date();
  const todayKey = dateKey(today);
  const weekStart = startOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthKey = dateKey(monthStart);
  const hasCheckin = (activity, date) => winterCheckins.some((checkin) => checkin.activity === activity && checkin.checkin_date === date);
  const todayDone = winterCheckins.filter((checkin) => checkin.checkin_date === todayKey).length;
  const weekKeys = weekDays.map(dateKey);
  const weekDone = winterCheckins.filter((checkin) => weekKeys.includes(checkin.checkin_date)).length;
  const monthDone = winterCheckins.filter((checkin) => checkin.checkin_date >= monthKey && checkin.checkin_date <= todayKey).length;
  const expectedMonth = today.getDate() * habits.length;
  $('arc-dashboard').innerHTML = `<div class="arc-stat"><span>СЕГОДНЯ</span><b>${todayDone} / ${habits.length}</b></div><div class="arc-stat"><span>ЭТА НЕДЕЛЯ</span><b>${weekDone} / ${habits.length * 7}</b></div><div class="arc-stat"><span>ЭТОТ МЕСЯЦ</span><b>${monthDone} / ${expectedMonth}</b></div>`;
  $('habit-head').innerHTML = `<tr><th>АКТИВНОСТЬ</th>${weekDays.map((date) => `<th>${new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date)}<br>${date.getDate()}</th>`).join('')}</tr>`;
  $('habit-body').innerHTML = habits.map((habit) => `<tr><td class="habit-name">${habit.label}<small>${habit.hint}</small></td>${weekDays.map((date) => {
    const key = dateKey(date); const checked = hasCheckin(habit.id, key);
    return `<td>${isAdmin ? `<input class="habit-check" type="checkbox" aria-label="${habit.label}, ${key}" data-habit="${habit.id}" data-date="${key}" ${checked ? 'checked' : ''}>` : checked ? '<span class="habit-done" aria-label="Выполнено">✓</span>' : '—'}</td>`;
  }).join('')}</tr>`).join('');
  document.querySelectorAll('[data-habit]').forEach((input) => input.addEventListener('change', () => toggleHabit(input.dataset.habit, input.dataset.date, input.checked)));
}

async function loadWinterArc() {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const from = dateKey(weekStart < monthStart ? weekStart : monthStart);
  const to = dateKey(addDays(weekStart, 6));
  const { data, error } = await client.from('winter_arc_checkins').select('activity,checkin_date').gte('checkin_date', from).lte('checkin_date', to);
  if (!error) { winterCheckins = data || []; renderWinterArc(); }
}

async function toggleHabit(activity, checkinDate, isChecked) {
  const query = client.from('winter_arc_checkins');
  const { error } = isChecked
    ? await query.insert({ activity, checkin_date: checkinDate })
    : await query.delete().eq('activity', activity).eq('checkin_date', checkinDate);
  notice(error ? 'Не удалось обновить отметку.' : 'Прогресс Winter Arc сохранён.');
  if (!error) loadWinterArc();
}

function setActiveTab(tab, updateHash = false) {
  const selected = ['blog', 'about', 'projects', 'winter'].includes(tab) ? tab : 'blog';
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === selected));
  document.querySelectorAll('[data-tab]').forEach((link) => {
    const active = link.dataset.tab === selected;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (updateHash) history.pushState(null, '', `#${selected}`);
}

document.querySelectorAll('[data-tab]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  setActiveTab(link.dataset.tab, true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));
window.addEventListener('hashchange', () => setActiveTab(window.location.hash.slice(1)));

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function notice(text) { message.textContent = text; }
function formatDate(value) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value)); }
function mediaMarkup(path, type) {
  if (!path) return '';
  const { data } = client.storage.from('post-media').getPublicUrl(path);
  const url = data.publicUrl;
  return type === 'video' ? `<video class="post-media" controls src="${url}"></video>` : `<img class="post-media" src="${url}" alt="Медиа к посту">`;
}

function applySettings(settings) {
  if (!settings) return;
  siteSettings = settings;
  $('site-title').textContent = settings.site_title;
  $('site-tagline').textContent = settings.tagline;
  document.documentElement.style.setProperty('--cyan', settings.accent_color);
  $('home').classList.toggle('hidden', !settings.show_hero);
  $('blog-panel').classList.toggle('hidden', !settings.show_blog);
}

async function loadSettings() {
  const { data } = await client.from('site_settings').select('*').eq('id', true).maybeSingle();
  applySettings(data);
}

function renderSiteBlocks() {
  const container = $('site-blocks');
  const visible = siteBlocks.filter((block) => block.is_visible || isAdmin);
  container.innerHTML = visible.map((block) => block.block_type === 'heading'
    ? `<section class="site-block"><h2>${escapeHtml(block.title || block.content)}</h2>${block.content && block.title ? `<p>${escapeHtml(block.content)}</p>` : ''}</section>`
    : `<section class="site-block"><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.content)}</p></section>`).join('');
}

async function loadSiteBlocks() {
  const { data, error } = await client.from('site_blocks').select('*').order('sort_order').order('created_at');
  if (!error) { siteBlocks = data || []; renderSiteBlocks(); if (isAdmin && isManaging) renderBlockManager(); }
}

function renderBlockManager() {
  const manager = $('block-manager');
  manager.innerHTML = siteBlocks.map((block, index) => `<div class="block-editor" data-block-row="${block.id}">
    <input data-block-title value="${escapeHtml(block.title)}" placeholder="Заголовок">
    <button class="action" type="button" data-save-block="${block.id}">СОХР.</button>
    <button class="action" type="button" data-up-block="${block.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
    <button class="action" type="button" data-down-block="${block.id}" ${index === siteBlocks.length - 1 ? 'disabled' : ''}>↓</button>
    <textarea data-block-content placeholder="Текст">${escapeHtml(block.content)}</textarea>
    <label><input type="checkbox" data-block-visible ${block.is_visible ? 'checked' : ''}> Показывать посетителям</label>
    <button class="action" type="button" data-delete-block="${block.id}">УДАЛИТЬ</button>
    <small>${block.block_type === 'heading' ? 'Тип: заголовок' : 'Тип: текстовый блок'}</small>
  </div>`).join('') || '<p class="admin-status">Пока нет дополнительных блоков.</p>';
  document.querySelectorAll('[data-save-block]').forEach((button) => button.addEventListener('click', () => saveBlock(button.dataset.saveBlock)));
  document.querySelectorAll('[data-delete-block]').forEach((button) => button.addEventListener('click', () => deleteBlock(button.dataset.deleteBlock)));
  document.querySelectorAll('[data-up-block]').forEach((button) => button.addEventListener('click', () => moveBlock(button.dataset.upBlock, -1)));
  document.querySelectorAll('[data-down-block]').forEach((button) => button.addEventListener('click', () => moveBlock(button.dataset.downBlock, 1)));
}

async function saveBlock(id) {
  const row = document.querySelector(`[data-block-row="${id}"]`);
  const payload = { title: row.querySelector('[data-block-title]').value.trim(), content: row.querySelector('[data-block-content]').value.trim(), is_visible: row.querySelector('[data-block-visible]').checked, updated_at: new Date().toISOString() };
  const { error } = await client.from('site_blocks').update(payload).eq('id', id);
  notice(error ? 'Не удалось сохранить блок.' : 'Блок сохранён.');
  if (!error) loadSiteBlocks();
}

async function moveBlock(id, direction) {
  const index = siteBlocks.findIndex((block) => block.id === id);
  const target = siteBlocks[index + direction];
  if (!target) return;
  const current = siteBlocks[index];
  const [{ error: firstError }, { error: secondError }] = await Promise.all([
    client.from('site_blocks').update({ sort_order: target.sort_order, updated_at: new Date().toISOString() }).eq('id', current.id),
    client.from('site_blocks').update({ sort_order: current.sort_order, updated_at: new Date().toISOString() }).eq('id', target.id),
  ]);
  notice(firstError || secondError ? 'Не удалось изменить порядок.' : 'Порядок блока изменён.');
  if (!firstError && !secondError) loadSiteBlocks();
}

async function deleteBlock(id) {
  const { error } = await client.from('site_blocks').delete().eq('id', id);
  notice(error ? 'Не удалось удалить блок.' : 'Блок удалён.');
  if (!error) loadSiteBlocks();
}

async function loadPosts() {
  const { data, error } = await client.from('posts').select('id,title,slug,excerpt,body,media_path,media_type,published_at,created_at').eq('is_published', true).order('published_at', { ascending: false }).limit(5);
  if (error) { feed.innerHTML = '<div class="empty">Не удалось загрузить блог. Попробуйте позже.</div>'; return; }
  if (!data.length) { feed.innerHTML = '<div class="empty">Первый пост появится совсем скоро.</div>'; return; }
  feed.innerHTML = data.map((post) => `<button class="post-card" type="button" data-post-id="${post.id}"><span class="meta">${formatDate(post.published_at || post.created_at)}</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt)}</p></button>`).join('');
  document.querySelectorAll('[data-post-id]').forEach((button) => button.addEventListener('click', () => openPost(data.find((post) => post.id === button.dataset.postId))));
}

async function openPost(post) {
  const { data: comments } = await client.from('comments').select('author_name,body,created_at').eq('post_id', post.id).eq('is_approved', true).order('created_at');
  reader.classList.remove('hidden');
  reader.innerHTML = `<span class="meta">${formatDate(post.published_at || post.created_at)}</span><h3>${escapeHtml(post.title)}</h3><div class="body-copy">${escapeHtml(post.body)}</div>${mediaMarkup(post.media_path, post.media_type)}<section class="comments"><h3>КОММЕНТАРИИ</h3><div>${(comments || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong><br>${escapeHtml(comment.body)}</div>`).join('') || '<p>Пока нет комментариев.</p>'}</div><form class="form-grid" id="comment-form"><input id="comment-name" maxlength="80" required placeholder="Ваше имя"><textarea id="comment-body" maxlength="2000" required placeholder="Ваш комментарий"></textarea><button class="action">ОТПРАВИТЬ НА МОДЕРАЦИЮ</button><span class="toast" id="comment-message"></span></form></section>`;
  $('comment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await client.from('comments').insert({ post_id: post.id, author_name: $('comment-name').value.trim(), body: $('comment-body').value.trim() });
    $('comment-message').textContent = result.error ? 'Не удалось отправить комментарий.' : 'Спасибо! Комментарий отправлен на модерацию.';
    if (!result.error) event.target.reset();
  });
  reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshAdmin() {
  const { data: { user } } = await client.auth.getUser();
  isAdmin = false;
  if (user) {
    const { data } = await client.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    isAdmin = Boolean(data);
  }
  $('auth-controls').classList.toggle('hidden', isAdmin);
  $('mode-picker').classList.toggle('hidden', !isAdmin || isManaging);
  $('editor').classList.toggle('hidden', !isAdmin || !isManaging);
  document.body.classList.toggle('editing-mode', isAdmin && isManaging);
  $('admin-toggle').textContent = isAdmin ? 'РЕЖИМ АДМИНА' : 'ВХОД АДМИНА';
  $('arc-admin-note').classList.toggle('hidden', !isAdmin);
  $('admin-status').textContent = isAdmin ? (isManaging ? 'Режим управления активен: все изменения сохраняются для посетителей.' : 'Вы вошли как администратор. Выберите режим работы.') : user ? 'Аккаунт создан, но права администратора ещё не назначены.' : 'Войдите с email и паролем.';
  if (isAdmin && isManaging) loadAdminTools();
  if (isAdmin && siteSettings) {
    $('builder-title').value = siteSettings.site_title;
    $('builder-tagline').value = siteSettings.tagline;
    $('builder-accent').value = siteSettings.accent_color;
    $('builder-hero').checked = siteSettings.show_hero;
    $('builder-blog').checked = siteSettings.show_blog;
  }
  renderSiteBlocks();
  loadWinterArc();
}

async function loadAdminTools() {
  const [{ data: posts }, { data: pending }] = await Promise.all([
    client.from('posts').select('id,title,slug,excerpt,body,media_path,media_type,is_published').order('created_at', { ascending: false }),
    client.from('comments').select('id,author_name,body,post_id,created_at').eq('is_approved', false).order('created_at'),
  ]);
  $('post-manager').innerHTML = `<h3>ПОСТЫ</h3>${(posts || []).map((post) => `<div class="comment"><strong>${escapeHtml(post.title)}</strong><br><button class="action" type="button" data-edit-post="${post.id}">РЕДАКТИРОВАТЬ</button></div>`).join('') || '<p>Постов пока нет.</p>'}`;
  $('moderation').innerHTML = `<h3>МОДЕРАЦИЯ</h3>${(pending || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong>: ${escapeHtml(comment.body)}<br><button class="action" type="button" data-approve="${comment.id}">ОДОБРИТЬ</button> <button class="action" type="button" data-delete-comment="${comment.id}">УДАЛИТЬ</button></div>`).join('') || '<p>Нет комментариев на модерации.</p>'}`;
  document.querySelectorAll('[data-edit-post]').forEach((button) => button.addEventListener('click', () => {
    const post = posts.find((item) => item.id === button.dataset.editPost);
    editingPostId = post.id; editingMediaPath = post.media_path; editingMediaType = post.media_type; $('post-title').value = post.title; $('post-slug').value = post.slug; $('post-excerpt').value = post.excerpt; $('post-body').value = post.body; $('post-published').checked = post.is_published; $('save-post').textContent = 'ОБНОВИТЬ ПОСТ';
  }));
  document.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', async () => { await client.from('comments').update({ is_approved: true }).eq('id', button.dataset.approve); loadAdminTools(); }));
  document.querySelectorAll('[data-delete-comment]').forEach((button) => button.addEventListener('click', async () => { await client.from('comments').delete().eq('id', button.dataset.deleteComment); loadAdminTools(); }));
}

$('admin-toggle').addEventListener('click', async () => { $('admin-panel').classList.toggle('hidden'); await refreshAdmin(); });
$('login').addEventListener('click', async () => {
  const { error } = await client.auth.signInWithPassword({ email: $('admin-email').value.trim(), password: $('admin-password').value });
  notice(error ? 'Не удалось войти: проверьте email и пароль.' : 'Вход выполнен.');
  if (!error) await refreshAdmin();
});
async function signOutAdmin() { isManaging = false; await client.auth.signOut(); notice('Вы вышли из аккаунта.'); await refreshAdmin(); }
$('logout').addEventListener('click', signOutAdmin);
$('logout-editor').addEventListener('click', signOutAdmin);
$('preview-site').addEventListener('click', () => { isManaging = false; refreshAdmin(); });
$('exit-manager').addEventListener('click', () => { isManaging = false; refreshAdmin(); });
$('manage-site').addEventListener('click', async () => { isManaging = true; await refreshAdmin(); await loadSiteBlocks(); });
$('save-builder').addEventListener('click', async () => {
  const settings = { site_title: $('builder-title').value.trim(), tagline: $('builder-tagline').value.trim(), accent_color: $('builder-accent').value, show_hero: $('builder-hero').checked, show_blog: $('builder-blog').checked, updated_at: new Date().toISOString() };
  if (!settings.site_title || !settings.tagline) { notice('Заполните название и подзаголовок.'); return; }
  const { error } = await client.from('site_settings').update(settings).eq('id', true);
  notice(error ? 'Не удалось сохранить оформление.' : 'Оформление обновлено.');
  if (!error) applySettings(settings);
});
$('add-block').addEventListener('click', async () => {
  const title = $('new-block-title').value.trim();
  const content = $('new-block-content').value.trim();
  if (!title && !content) { notice('Добавьте заголовок или текст блока.'); return; }
  const nextOrder = siteBlocks.length ? Math.max(...siteBlocks.map((block) => block.sort_order)) + 1 : 0;
  const { error } = await client.from('site_blocks').insert({ block_type: $('new-block-type').value, title, content, sort_order: nextOrder });
  notice(error ? 'Не удалось добавить блок.' : 'Блок добавлен.');
  if (!error) { $('new-block-title').value = ''; $('new-block-content').value = ''; loadSiteBlocks(); }
});
$('save-post').addEventListener('click', async () => {
  const title = $('post-title').value.trim();
  const slug = $('post-slug').value.trim().toLowerCase();
  const isPublished = $('post-published').checked;
  if (!title || !slug) { notice('Добавьте заголовок и slug поста.'); return; }
  let mediaPath = editingMediaPath;
  let mediaType = editingMediaType;
  const file = $('post-media').files[0];
  if (file) {
    if (file.size > 52428800 || !['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type)) { notice('Поддерживаются только изображения и видео до 50 МБ.'); return; }
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    const uploaded = await client.storage.from('post-media').upload(`${Date.now()}-${safeName}`, file, { contentType: file.type });
    if (uploaded.error) { notice('Не удалось загрузить медиафайл.'); return; }
    mediaPath = uploaded.data.path;
    mediaType = file.type.startsWith('video/') ? 'video' : 'image';
  }
  const payload = { title, slug, excerpt: $('post-excerpt').value.trim(), body: $('post-body').value.trim(), media_path: mediaPath, media_type: mediaType, is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null };
  const { error } = editingPostId ? await client.from('posts').update(payload).eq('id', editingPostId) : await client.from('posts').insert(payload);
  notice(error ? 'Не удалось сохранить пост. Проверьте slug: только латиница, цифры и дефисы.' : 'Пост сохранён.');
  if (!error) { ['post-title','post-slug','post-excerpt','post-body','post-media'].forEach((id) => { $(id).value = ''; }); $('post-published').checked = false; editingPostId = null; editingMediaPath = null; editingMediaType = null; $('save-post').textContent = 'СОХРАНИТЬ ПОСТ'; loadPosts(); loadAdminTools(); }
});

await loadSettings();
await refreshAdmin();
await loadSiteBlocks();
await loadWinterArc();
loadPosts();
setActiveTab(window.location.hash.slice(1));
