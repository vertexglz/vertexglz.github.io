import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { dateKey, getArcDates, addDays } from './arc-dates.js?v=20261115-calendar-3';

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
let editingPostSlug = null;
let editingMediaPath = null;
let editingMediaType = null;
let siteSettings = null;
let siteBlocks = [];
let isManaging = false;
let winterCheckins = [];
let winterNote = null;
let tagCatalog = [];
// Give writing a post its own simple window, separate from site settings.
const postDialog = document.createElement('dialog');
postDialog.id = 'post-dialog';
postDialog.innerHTML = '<form id="simple-post-form"><h2 id="post-dialog-title">Новый пост</h2><p>Поделись тем, что у тебя нового.</p><label id="simple-title-label">Название поста</label><label id="simple-body-label">Что внутри</label><label id="simple-media-label">Прикрепить картинку или видео (по желанию)</label><details class="post-options"><summary>Дополнительно</summary><label>Темы через запятую<input id="post-tags" maxlength="180" placeholder="разработка, winterarc"></label><label>Режим публикации<select id="post-mode"><option value="publish">Опубликовать сейчас</option><option value="draft">Сохранить черновик</option><option value="schedule">Опубликовать позже</option></select></label><label id="post-schedule-label" class="hidden">Дата и время публикации <small>по МСК</small><input id="post-schedule" type="datetime-local"></label><label><input id="post-pinned" type="checkbox"> Закрепить в начале ленты</label><label id="post-remove-media-label" class="hidden"><input id="post-remove-media" type="checkbox"> Убрать прикреплённый файл</label></details><p id="post-form-message" role="status"></p><div class="post-form-actions"><button class="action" type="button" id="post-cancel">Отмена</button></div></form>';
postDialog.setAttribute('aria-labelledby', 'post-dialog-title');
document.body.append(postDialog);
const adminOverview = document.createElement('section');
adminOverview.className = 'manager admin-dashboard';
adminOverview.innerHTML = '<h3>ЦЕНТР УПРАВЛЕНИЯ</h3><div class="admin-overview" id="admin-overview"><div><b>—</b><span>ПОСТЫ</span></div><div><b>—</b><span>КОММЕНТАРИИ</span></div><div><b>—</b><span>ВИЗИТЫ / 7 ДНЕЙ</span></div></div><div id="media-library"></div><div id="edit-history"></div>';
$('editor').prepend(adminOverview);
$('post-title').previousElementSibling.remove();
$('simple-title-label').append($('post-title'));
$('simple-body-label').append($('post-body'));
const oldMediaLabel = $('post-media').parentElement;
$('simple-media-label').append($('post-media'));
oldMediaLabel.remove();
['post-slug','post-excerpt'].forEach((id) => $(id).remove());
$('post-published').parentElement.remove();
$('simple-post-form').append($('save-post'));
$('save-post').textContent = 'Опубликовать';
$('post-title').placeholder = 'О чём этот пост?';
$('post-body').placeholder = 'Напиши свой текст…';
$('post-cancel').addEventListener('click', () => postDialog.close());
$('simple-post-form').addEventListener('submit', (event) => { event.preventDefault(); if (!$('save-post').disabled) $('save-post').click(); });
$('post-mode').addEventListener('change', () => $('post-schedule-label').classList.toggle('hidden', $('post-mode').value !== 'schedule'));
function showPostForm() {
  $('post-dialog-title').textContent = editingPostId ? 'Редактировать пост' : 'Новый пост';
  $('post-form-message').textContent = '';
  $('post-remove-media-label').classList.toggle('hidden', !editingMediaPath);
  $('save-post').textContent = editingPostId ? 'Сохранить изменения' : 'Опубликовать';
  $('admin-modal').classList.add('hidden');
  postDialog.showModal();
  $('post-title').focus();
}
const visualElements = new Map();
const savedElementEdits = new Map();
let selectedVisual = null;
// Semantic keys keep saved edits tied to the same element when the layout changes.
const visualKeyGroups = [
  ['nav-tab', 'nav [data-tab]'], ['hero-title', '#home h1'], ['hero-copy', '#home p'], ['hero-eyebrow', '#home .eyebrow'], ['hero-avatar', '#home img'],
  ['about-title', '#about h2'], ['about-heading', '#about h3'], ['about-copy', '#about p'], ['about-quote', '#about blockquote'], ['about-cite', '#about cite a'],
  ['about-trait', '#about .trait'], ['about-note', '#about .about-note'], ['about-skill', '#about .skill-pills span'], ['project-title', '#projects .section-placeholder h2'],
  ['project-heading', '#projects .section-placeholder h3'], ['project-copy', '#projects .section-placeholder p'], ['project-status', '#projects .project-status'],
  ['winter-title', '#winter h2'], ['winter-copy', '#winter .section-placeholder > p:first-of-type'], ['blog-title', '#blog-title'], ['blog-copy', '#blog-panel .blog-head p'], ['footer', 'footer > span'],
];
const legacyVisualKeys = new Map();
let legacyIndex = 0;
visualKeyGroups.forEach(([prefix, selector]) => document.querySelectorAll(selector).forEach((element, index) => {
  const key = element.id || `${prefix}-${index + 1}`;
  element.dataset.visualKey = key;
  visualElements.set(key, element);
  legacyVisualKeys.set(`page-element-${legacyIndex++}`, key);
}));

function applyElementProperties(element, properties) {
  if (typeof properties.text === 'string' && element.tagName !== 'IMG') element.textContent = properties.text;
  if (element.tagName === 'IMG' && typeof properties.src === 'string' && /^(https:\/\/|assets\/)/.test(properties.src)) element.src = properties.src;
  element.style.color = /^#[0-9a-f]{6}$/i.test(properties.color || '') ? properties.color : '';
  element.style.fontSize = Number.isFinite(properties.size) && properties.size >= 8 && properties.size <= 120 ? `${properties.size}px` : '';
  element.style.textAlign = ['left', 'center', 'right'].includes(properties.align) ? properties.align : '';
}

async function loadElementEdits() {
  const { data, error } = await client.from('site_element_edits').select('element_key,properties');
  if (!error) (data || []).forEach((row) => {
    const key = legacyVisualKeys.get(row.element_key) || row.element_key;
    savedElementEdits.set(key, row.properties);
    const element = visualElements.get(key);
    if (element) applyElementProperties(element, row.properties);
  });
}

function openElementEditor(element) {
  selectedVisual = element;
  const image = element.tagName === 'IMG';
  $('element-text-label').classList.toggle('hidden', image);
  $('element-image-label').classList.toggle('hidden', !image);
  $('element-text').value = element.textContent;
  $('element-image').value = image ? element.getAttribute('src') : '';
  const style = getComputedStyle(element);
  const rgb = style.color.match(/\d+/g);
  $('element-color').value = rgb ? `#${rgb.slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}` : '#e9f8ff';
  $('element-size').value = Math.round(parseFloat(style.fontSize));
  $('element-align').value = ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left';
  $('element-status').textContent = '';
  $('element-dialog').showModal();
}

document.addEventListener('click', async (event) => {
  if (!isAdmin || !isManaging || event.target.closest('#admin-modal, #element-dialog, #visual-toolbar')) return;
  const postCard = event.target.closest('[data-post-id]');
  if (postCard) {
    event.preventDefault(); event.stopImmediatePropagation();
    await loadAdminTools();
    $('admin-modal').classList.remove('hidden');
    document.querySelector(`[data-edit-post="${postCard.dataset.postId}"]`)?.click();
    $('post-title').focus();
    return;
  }
  const element = event.target.closest('[data-visual-key]');
  if (!element) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openElementEditor(element);
}, true);
$('element-cancel').addEventListener('click', () => $('element-dialog').close());
$('element-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isAdmin || !isManaging || !selectedVisual) return;
  const element = selectedVisual;
  const properties = { text: $('element-text').value, src: $('element-image').value.trim(), color: $('element-color').value, size: Number($('element-size').value), align: $('element-align').value };
  if (element.tagName === 'IMG' && !/^(https:\/\/|assets\/)/.test(properties.src)) { $('element-status').textContent = 'Укажи HTTPS-адрес изображения.'; return; }
  const button = event.submitter;
  button.disabled = true;
  try {
    let result;
    const previousAppearance = savedElementEdits.get(element.dataset.visualKey) || { color: '', size: 0, align: '' };
    const previous = element.dataset.blockId
      ? { kind: 'block', blockId: element.dataset.blockId, blockField: element.dataset.blockField, value: (siteBlocks.find((item) => item.id === element.dataset.blockId) || {})[element.dataset.blockField] || '', appearance: previousAppearance }
      : { kind: 'element', properties: { ...previousAppearance, text: element.tagName === 'IMG' ? '' : element.textContent, src: element.tagName === 'IMG' ? element.getAttribute('src') : '' } };
    const historyResult = await client.from('site_edit_history').insert({ element_key: element.dataset.visualKey, properties: previous });
    if (historyResult.error) throw historyResult.error;
    if (element.dataset.blockId) {
      result = await client.from('site_blocks').update({ [element.dataset.blockField]: properties.text, updated_at: new Date().toISOString() }).eq('id', element.dataset.blockId).select('id').single();
      if (result.error) throw result.error;
      const block = siteBlocks.find((item) => item.id === element.dataset.blockId);
      if (block) block[element.dataset.blockField] = properties.text;
      result = await client.from('site_element_edits').upsert({ element_key: element.dataset.visualKey, properties, updated_at: new Date().toISOString() }).select('element_key').single();
    } else {
      result = await client.from('site_element_edits').upsert({ element_key: element.dataset.visualKey, properties, updated_at: new Date().toISOString() }).select('element_key').single();
    }
    if (result.error) throw result.error;
    savedElementEdits.set(element.dataset.visualKey, properties);
    applyElementProperties(element, properties);
    $('element-dialog').close();
  } catch { $('element-status').textContent = 'Не удалось сохранить. Изменения остались в окне — попробуй ещё раз.'; }
  finally { button.disabled = false; }
});
$('visual-settings').addEventListener('click', () => $('admin-modal').classList.remove('hidden'));
const visualPageSelect = document.createElement('select');
visualPageSelect.setAttribute('aria-label', 'Вкладка для редактирования');
visualPageSelect.innerHTML = '<option value="blog">Блог</option><option value="about">Обо мне</option><option value="projects">Проекты</option><option value="winter">Winter Arc</option>';
visualPageSelect.addEventListener('change', () => setActiveTab(visualPageSelect.value, true));
$('visual-toolbar').prepend(visualPageSelect);
$('visual-exit').addEventListener('click', async () => { isManaging = false; await refreshAdmin(); });

const habits = [
  { id: 'gym', label: 'Спорт / зал', hint: 'сила и энергия' },
  { id: 'programming', label: 'Программирование', hint: 'код каждый день' },
  { id: 'english', label: 'Английский', hint: 'язык и практика' },
  { id: 'reading', label: 'Чтение', hint: 'несколько страниц' },
  { id: 'walk', label: 'Прогулка', hint: 'свежая голова' },
];

let arcSelectedDay = null;
const arcNavigation = document.createElement('div');
arcNavigation.className = 'arc-navigation';
arcNavigation.innerHTML = '<div class="arc-navigation-controls"><button class="action" id="arc-prev" type="button" aria-label="На день назад">←</button><button class="action" id="arc-today" type="button">Сегодня</button><button class="action" id="arc-next" type="button" aria-label="На день вперёд">→</button><span id="arc-range"></span><button class="action" id="arc-share" type="button">ПОДЕЛИТЬСЯ НЕДЕЛЕЙ</button></div><p id="arc-status" role="status"></p>';
document.querySelector('#winter .tracker-wrap').before(arcNavigation);
function renderWinterArc() {
  const { today, days: weekDays, weekStart, weekEnd, monthStart } = getArcDates(new Date(), arcSelectedDay);
  const labelDate = (date) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  $('arc-range').textContent = `${labelDate(weekDays[0])} — ${labelDate(weekDays[6])}`;
  const todayKey = dateKey(today);
  const monthKey = dateKey(monthStart);
  const hasCheckin = (activity, date) => winterCheckins.some((checkin) => checkin.activity === activity && checkin.checkin_date === date);
  const todayDone = winterCheckins.filter((checkin) => checkin.checkin_date === todayKey).length;
  const weekDone = winterCheckins.filter((checkin) => checkin.checkin_date >= dateKey(weekStart) && checkin.checkin_date <= dateKey(weekEnd)).length;
  const monthDone = winterCheckins.filter((checkin) => checkin.checkin_date >= monthKey && checkin.checkin_date <= todayKey).length;
  const expectedMonth = today.getUTCDate() * habits.length;
  $('arc-dashboard').innerHTML = `<div class="arc-stat"><span>СЕГОДНЯ</span><b>${todayDone} / ${habits.length}</b></div><div class="arc-stat"><span>ЭТА НЕДЕЛЯ</span><b>${weekDone} / ${habits.length * 7}</b></div><div class="arc-stat"><span>ЭТОТ МЕСЯЦ</span><b>${monthDone} / ${expectedMonth}</b></div>`;
  const habitScores = habits.map((habit) => ({ ...habit, count: winterCheckins.filter((item) => item.activity === habit.id && item.checkin_date >= monthKey && item.checkin_date <= todayKey).length }));
  const bestHabit = [...habitScores].sort((a, b) => b.count - a.count)[0];
  const completedDays = new Set(winterCheckins.map((item) => item.checkin_date));
  const streakStart = completedDays.has(todayKey) ? today : addDays(today, -1);
  let streak = 0;
  for (let date = streakStart; dateKey(date) >= dateKey(addDays(today, -365)); date = addDays(date, -1)) { if (completedDays.has(dateKey(date))) streak += 1; else break; }
  const historyDays = [...completedDays].sort();
  let record = 0; let run = 0; let previousDay = '';
  historyDays.forEach((key) => { run = previousDay && key === dateKey(addDays(new Date(`${previousDay}T00:00:00Z`), 1)) ? run + 1 : 1; record = Math.max(record, run); previousDay = key; });
  const monthPercent = expectedMonth ? Math.round((monthDone / expectedMonth) * 100) : 0;
  $('arc-insights').innerHTML = `<article class="arc-insight"><span>ТЕМП МЕСЯЦА</span><b>${monthPercent}%</b></article><article class="arc-insight"><span>ЛУЧШИЙ РИТМ</span><b>${bestHabit?.label || '—'} · ${bestHabit?.count || 0}</b></article><article class="arc-insight"><span>СЕРИЯ ДНЕЙ</span><b>${streak} ${streak === 1 ? 'день' : streak >= 2 && streak <= 4 ? 'дня' : 'дней'}</b><small>день засчитывается с любой активностью</small></article><article class="arc-insight"><span>ЛИЧНЫЙ РЕКОРД</span><b>${record || 0} дн.</b><small>за последние 365 дней</small></article>`;
  const monthDays = Array.from({ length: today.getUTCDate() }, (_, index) => addDays(monthStart, index));
  $('arc-heatmap-label').textContent = `${monthDone} действий · ${monthPercent}%`;
  $('arc-heatmap').innerHTML = monthDays.map((date) => { const done = winterCheckins.filter((item) => item.checkin_date === dateKey(date)).length; const level = done === 0 ? 0 : done < 3 ? 1 : done < 5 ? 2 : 3; const height = Math.max(8, Math.round((done / habits.length) * 100)); return `<div class="heat-cell level-${level}" title="${dateKey(date)}: ${done} из ${habits.length}" aria-label="${dateKey(date)}: ${done} из ${habits.length}"><i style="height:${height}%"></i><span>${date.getUTCDate()}</span></div>`; }).join('');
  const selectedKey = arcSelectedDay || todayKey;
  const noteContent = winterNote?.note_date === selectedKey ? winterNote.content : '';
  $('arc-note-card').innerHTML = isAdmin ? `<div class="eyebrow">// DAILY NOTE</div><h3>Заметка дня · ${selectedKey}</h3><p>Коротко зафиксируй, что получилось или что хочешь улучшить.</p><form class="arc-note-form" id="arc-note-form"><textarea id="arc-note-content" maxlength="1000" placeholder="Сегодня я…">${escapeHtml(noteContent)}</textarea><button class="action" type="submit">СОХРАНИТЬ ЗАМЕТКУ</button><span class="toast" id="arc-note-message"></span></form>` : noteContent ? `<div class="eyebrow">// DAILY NOTE</div><h3>Заметка дня</h3><p>${escapeHtml(noteContent)}</p>` : '';
  $('arc-note-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const content = $('arc-note-content').value.trim(); const { error } = content ? await client.from('winter_arc_notes').upsert({ note_date: selectedKey, content, updated_at: new Date().toISOString() }) : await client.from('winter_arc_notes').delete().eq('note_date', selectedKey); $('arc-note-message').textContent = error ? 'Не удалось сохранить заметку.' : 'Заметка сохранена.'; if (!error) loadWinterArc(); });
  $('habit-head').innerHTML = `<tr><th>АКТИВНОСТЬ</th>${weekDays.map((date) => `<th class="${dateKey(date) === todayKey ? 'arc-today' : ''}" ${dateKey(date) === todayKey ? 'aria-current="date"' : ''}>${new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(date)}<br>${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date)}${dateKey(date) === todayKey ? '<small>СЕГОДНЯ</small>' : ''}</th>`).join('')}</tr>`;
  $('habit-body').innerHTML = habits.map((habit) => `<tr><td class="habit-name">${habit.label}<small>${habit.hint}</small></td>${weekDays.map((date) => {
    const key = dateKey(date); const checked = hasCheckin(habit.id, key);
    return `<td class="${key === todayKey ? 'arc-today' : ''}">${isAdmin ? `<input class="habit-check" type="checkbox" aria-label="${habit.label}, ${key}" data-habit="${habit.id}" data-date="${key}" ${checked ? 'checked' : ''}>` : checked ? '<span class="habit-done" aria-label="Выполнено">✓</span>' : '—'}</td>`;
  }).join('')}</tr>`).join('');
  document.querySelectorAll('[data-habit]').forEach((input) => input.addEventListener('change', () => toggleHabit(input.dataset.habit, input.dataset.date, input.checked)));
}

let arcLoadedDay = '';
let arcRequest = 0;
let arcMidnightTimer;
async function loadWinterArc() {
  const request = ++arcRequest;
  const { today, weekEnd } = getArcDates(new Date(), arcSelectedDay);
  $('arc-status').textContent = 'Загрузка отметок…';
  $('habit-body').setAttribute('aria-busy', 'true');
  document.querySelectorAll('[data-habit]').forEach((input) => { input.disabled = true; });
  const readRange = (from, to) => client.from('winter_arc_checkins').select('activity,checkin_date').gte('checkin_date', from).lte('checkin_date', to);
  const selectedKey = arcSelectedDay || dateKey(today);
  const rangeEnd = dateKey(weekEnd > today ? weekEnd : today);
  const results = await Promise.all([readRange(dateKey(addDays(today, -365)), rangeEnd), client.from('winter_arc_notes').select('note_date,content,updated_at').eq('note_date', selectedKey).maybeSingle()]);
  if (request !== arcRequest) return;
  $('habit-body').setAttribute('aria-busy', 'false');
  if (results.some((result) => result.error)) { $('arc-status').textContent = 'Не удалось загрузить отметки. Нажми «Сегодня» или стрелку, чтобы повторить.'; return; }
  winterCheckins = results[0].data || [];
  winterNote = results[1].data || null;
  arcLoadedDay = dateKey(today);
  renderWinterArc();
  $('arc-status').textContent = arcSelectedDay ? 'Просмотр истории · статистика выше — за текущие периоды' : 'Текущие даты · московское время';
}

function shiftArcDay(amount) {
  const { center } = getArcDates(new Date(), arcSelectedDay);
  arcSelectedDay = dateKey(addDays(center, amount));
  if (arcSelectedDay === dateKey(getArcDates().today)) arcSelectedDay = null;
  loadWinterArc();
}
$('arc-prev').addEventListener('click', () => shiftArcDay(-1));
$('arc-next').addEventListener('click', () => shiftArcDay(1));
$('arc-today').addEventListener('click', () => { arcSelectedDay = null; loadWinterArc(); });
$('arc-share').addEventListener('click', async () => {
  const { today, weekStart, weekEnd } = getArcDates();
  const done = winterCheckins.filter((item) => item.checkin_date >= dateKey(weekStart) && item.checkin_date <= dateKey(weekEnd)).length;
  const text = `Winter Arc · ${done}/${habits.length * 7} действий за неделю. Двигаюсь дальше → ${location.origin}${location.pathname}#winter`;
  try { if (navigator.share) await navigator.share({ title: 'Winter Arc · vertexglz', text, url: `${location.origin}${location.pathname}#winter` }); else await navigator.clipboard.writeText(text); $('arc-status').textContent = 'Итоги недели готовы: ссылка скопирована.'; } catch { /* Visitor closed the native share dialog. */ }
});

function scheduleArcMidnight() {
  clearTimeout(arcMidnightTimer);
  const now = new Date();
  arcMidnightTimer = setTimeout(() => {
    renderWinterArc();
    loadWinterArc();
    scheduleArcMidnight();
  }, Math.max(100, getArcDates(now).nextMidnight - now + 50));
}
function resumeArcCalendar() {
  if (arcLoadedDay !== dateKey(getArcDates().today)) { renderWinterArc(); loadWinterArc(); }
  scheduleArcMidnight();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeArcCalendar(); });
window.addEventListener('focus', resumeArcCalendar);
scheduleArcMidnight();

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
  const pageTitles = { blog: 'Блог', about: 'Обо мне', projects: 'Проекты', winter: 'Winter Arc' };
  document.title = `${pageTitles[selected]} — vertexglz`;
  visualPageSelect.value = selected;
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
async function openRoute() {
  const hash = window.location.hash.slice(1);
  setActiveTab(hash);
  const match = /^post-([0-9a-f-]{36})$/i.exec(hash);
  if (match) {
    const { data } = await client.from('posts').select('id,title,body,media_path,media_type,published_at,created_at').eq('id', match[1]).eq('is_published', true).maybeSingle();
    if (data) await openPost(data);
  }
}
window.addEventListener('hashchange', openRoute);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatMoscowDateTimeInput(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

function moscowInputToIso(value) {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}:00+03:00`).toISOString() : null;
}

function notice(text) { message.textContent = text; }
function formatDate(value) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value)); }
function readingTime(value = '') { return Math.max(1, Math.ceil(String(value).trim().split(/\s+/).filter(Boolean).length / 180)); }
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

async function recordPrivacyFriendlyVisit() {
  try {
    let visitorKey = localStorage.getItem('vertexglz-visitor-key');
    if (!visitorKey) { visitorKey = crypto.randomUUID(); localStorage.setItem('vertexglz-visitor-key', visitorKey); }
    await client.from('site_visits').insert({ visitor_key: visitorKey, path: location.pathname || '/' });
  } catch { /* Analytics must never affect a visitor's experience. */ }
}

function renderSiteBlocks() {
  const container = $('site-blocks');
  const visible = siteBlocks.filter((block) => block.is_visible || isAdmin);
  container.innerHTML = visible.map((block) => block.block_type === 'heading'
    ? `<section class="site-block"><h2>${escapeHtml(block.title || block.content)}</h2>${block.content && block.title ? `<p>${escapeHtml(block.content)}</p>` : ''}</section>`
    : `<section class="site-block"><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.content)}</p></section>`).join('');
  container.querySelectorAll('.site-block').forEach((section, index) => {
    ['h2', 'p'].forEach((tag) => {
      const element = section.querySelector(tag);
      if (!element) return;
      element.dataset.visualKey = `block-${visible[index].id}-${tag}`;
      element.dataset.blockId = visible[index].id;
      element.dataset.blockField = tag === 'h2' && (visible[index].title || visible[index].block_type !== 'heading') ? 'title' : 'content';
      visualElements.set(element.dataset.visualKey, element);
      const saved = savedElementEdits.get(element.dataset.visualKey);
      if (saved) applyElementProperties(element, saved);
    });
  });
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

let feedFilter = 'all';
let feedTag = '';
let feedOffset = 0;
let feedBusy = false;
let feedVersion = 0;
async function loadTagCatalog() {
  const { data } = await client.from('posts').select('tags').eq('is_published', true);
  tagCatalog = [...new Set((data || []).flatMap((post) => post.tags || []))].sort((a, b) => a.localeCompare(b, 'ru')).slice(0, 12);
  renderTagFilter();
}
function renderTagFilter() {
  const available = feedTag && !tagCatalog.includes(feedTag) ? [feedTag, ...tagCatalog] : tagCatalog;
  $('tag-filter').innerHTML = `<button type="button" class="${!feedTag ? 'selected' : ''}" data-tag-filter="">Все темы</button>${available.map((tag) => `<button type="button" class="${tag === feedTag ? 'selected' : ''}" data-tag-filter="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}`;
  document.querySelectorAll('[data-tag-filter]').forEach((button) => button.addEventListener('click', () => { feedTag = button.dataset.tagFilter; loadPosts(); }));
}
async function deletePostFromFeed(post) {
  if (!isAdmin) return;
  if (!confirm(`Удалить пост «${post.title}» полностью? Это действие нельзя отменить.`)) return;
  const { error } = await client.from('posts').delete().eq('id', post.id);
  if (error) { notice('Не удалось удалить пост.'); return; }
  notice('Пост удалён из ленты.');
  reader.classList.add('hidden');
  await Promise.all([loadPosts(), loadTagCatalog()]);
  loadAdminTools();
}
async function loadPosts(append = false) {
  const version = ++feedVersion;
  if (!append) { feedOffset = 0; reader.classList.add('hidden'); feed.innerHTML = '<div class="empty">Загрузка записей…</div>'; }
  feedBusy = true;
  $('timeline-more').disabled = true;
  let query = client.from('posts').select('id,title,slug,excerpt,body,media_path,media_type,tags,is_pinned,published_at,created_at').eq('is_published', true).order('is_pinned', { ascending: false }).order('published_at', { ascending: false }).order('id').range(feedOffset, feedOffset + 5);
  if (feedFilter === 'media') query = query.not('media_path', 'is', null);
  if (feedTag) query = query.overlaps('tags', [feedTag]);
  const { data, error } = await query;
  if (version !== feedVersion) return;
  feedBusy = false;
  $('timeline-more').disabled = false;
  if (error) { if (!append) feed.innerHTML = '<div class="empty">Не удалось загрузить ленту. Обнови страницу, чтобы попробовать снова.</div>'; $('timeline-more').textContent = 'Попробовать ещё'; return; }
  if (!append) feed.innerHTML = '';
  const posts = (data || []).slice(0, 5);
  if (!append) renderTagFilter();
  $('timeline-more').classList.toggle('hidden', data.length <= 5);
  $('timeline-more').textContent = 'Показать ещё';
  if (!posts.length && !append) feed.innerHTML = `<div class="empty">${feedTag ? `По теме #${escapeHtml(feedTag)} пока нет записей. Выбери «Все темы», чтобы сбросить фильтр.` : feedFilter === 'media' ? 'Фото и видео появятся здесь вместе с новыми записями.' : 'Здесь начинается история.<br>Первой записи пока нет — скоро поделюсь тем, над чем работаю.'}</div>`;
  posts.forEach((post) => {
    const article = document.createElement('article');
    article.className = `timeline-post${post.is_pinned ? ' pinned' : ''}`; article.dataset.postId = post.id;
    const body = post.body || post.excerpt || '';
    article.innerHTML = `<img class="timeline-avatar" src="assets/fsociety-mark.jpg" alt="" width="44" height="44"><div><div class="timeline-author"><strong>vertexglz</strong><span>@vertexglz</span><time datetime="${escapeHtml(post.published_at || post.created_at)}">· ${formatDate(post.published_at || post.created_at)}</time><span class="reading-time">· ${readingTime(body)} мин чтения</span>${post.is_pinned ? '<span class="timeline-pin">⌁ ЗАКРЕПЛЕНО</span>' : ''}</div><h3>${escapeHtml(post.title)}</h3><p class="timeline-text">${escapeHtml(body.slice(0, 700))}</p>${body.length > 700 ? '<button class="timeline-expand" type="button">Читать полностью</button>' : ''}${(post.tags || []).length ? `<div class="timeline-tags">${post.tags.map((tag) => `<button class="post-tag" type="button" data-post-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}</div>` : ''}${mediaMarkup(post.media_path, post.media_type)}<div class="timeline-actions"><button type="button" data-discuss>◯ Комментарии</button><button type="button" data-share>↗ Ссылка</button></div></div>`;
    article.querySelector('.timeline-expand')?.addEventListener('click', (event) => { article.querySelector('.timeline-text').textContent = body; event.currentTarget.remove(); });
    article.querySelector('[data-discuss]').addEventListener('click', () => openPost(post));
    if (isAdmin) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'timeline-delete';
      deleteButton.textContent = '⌫ Удалить';
      deleteButton.setAttribute('aria-label', `Удалить пост «${post.title}»`);
      deleteButton.addEventListener('click', () => deletePostFromFeed(post));
      article.querySelector('.timeline-actions').append(deleteButton);
    }
    article.querySelectorAll('[data-post-tag]').forEach((button) => button.addEventListener('click', () => { feedTag = button.dataset.postTag; loadPosts(); }));
    article.querySelector('[data-share]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const url = `${location.origin}${location.pathname}#post-${post.id}`;
      try {
        if (navigator.share) await navigator.share({ title: post.title, text: post.excerpt || body.slice(0, 160), url });
        else await navigator.clipboard.writeText(url);
        button.textContent = navigator.share ? 'Поделились ✓' : 'Скопировано ✓';
      } catch (error) { if (error?.name !== 'AbortError') button.textContent = 'Не удалось поделиться'; }
    });
    feed.append(article);
  });
  feedOffset += posts.length;
}
$('timeline-more').addEventListener('click', () => { if (!feedBusy) loadPosts(true); });
const backToTop = $('back-to-top');
const updateBackToTop = () => backToTop.classList.toggle('hidden', window.scrollY < 540);
window.addEventListener('scroll', updateBackToTop, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
updateBackToTop();
document.querySelectorAll('[data-feed-filter]').forEach((button) => button.addEventListener('click', () => {
  feedFilter = button.dataset.feedFilter;
  document.querySelectorAll('[data-feed-filter]').forEach((item) => item.classList.toggle('selected', item === button));
  loadPosts();
}));
$('timeline-new-post').addEventListener('click', async () => {
  if (!isAdmin) return;
  editingPostId = null; editingPostSlug = null; editingMediaPath = null; editingMediaType = null;
  ['post-title','post-body','post-media'].forEach((id) => { $(id).value = ''; });
  $('post-tags').value = ''; $('post-mode').value = 'publish'; $('post-schedule').value = ''; $('post-pinned').checked = false; $('post-remove-media').checked = false; $('post-schedule-label').classList.add('hidden');
  showPostForm();
});

async function openPost(post) {
  const { data: comments } = await client.from('comments').select('author_name,body,created_at').eq('post_id', post.id).eq('is_approved', true).order('created_at');
  reader.classList.remove('hidden');
  reader.innerHTML = `<button class="timeline-expand" type="button" id="reader-back">← К ЛЕНТЕ</button><span class="meta">${formatDate(post.published_at || post.created_at)}</span><h3>${escapeHtml(post.title)}</h3>${(post.tags || []).length ? `<div class="timeline-tags">${post.tags.map((tag) => `<span class="post-tag">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}<div class="body-copy">${escapeHtml(post.body)}</div>${mediaMarkup(post.media_path, post.media_type)}<section class="comments"><h3>КОММЕНТАРИИ</h3><div>${(comments || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong><br>${escapeHtml(comment.body)}</div>`).join('') || '<p>Пока нет комментариев.</p>'}</div><form class="form-grid" id="comment-form"><input id="comment-website" class="comment-website" tabindex="-1" autocomplete="off" aria-hidden="true"><input id="comment-name" maxlength="80" required placeholder="Ваше имя"><textarea id="comment-body" maxlength="2000" required placeholder="Ваш комментарий"></textarea><button class="action">ОТПРАВИТЬ НА МОДЕРАЦИЮ</button><span class="toast" id="comment-message"></span></form></section>`;
  reader.querySelector('.meta').textContent += ` · ${readingTime(post.body)} мин чтения`;
  $('reader-back').addEventListener('click', () => { reader.classList.add('hidden'); history.replaceState(null, '', '#blog'); window.scrollTo({ top: $('blog-panel').offsetTop - 20, behavior: 'smooth' }); });
  $('comment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const lastCommentAt = Number(localStorage.getItem('vertexglz-last-comment-at') || 0);
    if ($('comment-website').value || Date.now() - lastCommentAt < 45_000) { $('comment-message').textContent = 'Попробуй отправить комментарий чуть позже.'; return; }
    const result = await client.from('comments').insert({ post_id: post.id, author_name: $('comment-name').value.trim(), body: $('comment-body').value.trim(), website: '' });
    $('comment-message').textContent = result.error ? (result.error.message?.includes('comment_rate_limit') ? 'Слишком часто: попробуй снова через минуту.' : 'Не удалось отправить комментарий.') : 'Спасибо! Комментарий отправлен на модерацию.';
    if (!result.error) { localStorage.setItem('vertexglz-last-comment-at', String(Date.now())); event.target.reset(); }
  });
  reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshAdmin({ reloadArc = true } = {}) {
  const wasAdmin = isAdmin;
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
  $('visual-toolbar').classList.toggle('hidden', !isAdmin || !isManaging);
  $('admin-toggle').textContent = isAdmin ? 'РЕЖИМ АДМИНА' : 'ВХОД АДМИНА';
  $('arc-admin-note').classList.toggle('hidden', !isAdmin);
  $('timeline-compose').classList.toggle('hidden', !isAdmin);
  $('timeline-new-post').classList.toggle('hidden', !isAdmin);
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
  if (reloadArc) loadWinterArc();
  if (wasAdmin !== isAdmin) loadPosts();
}

async function loadAdminTools() {
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [{ data: posts }, { data: pending }, { count: visits }, { data: history }] = await Promise.all([
    client.from('posts').select('id,title,slug,excerpt,body,media_path,media_type,tags,is_pinned,is_published,scheduled_for,published_at').order('created_at', { ascending: false }),
    client.from('comments').select('id,author_name,body,post_id,created_at').eq('is_approved', false).order('created_at'),
    client.from('site_visits').select('*', { count: 'exact', head: true }).gte('visit_day', weekAgo),
    client.from('site_edit_history').select('id,element_key,properties,created_at').order('created_at', { ascending: false }).limit(8),
  ]);
  $('admin-overview').innerHTML = `<div><b>${posts?.length || 0}</b><span>ПОСТЫ</span></div><div><b>${pending?.length || 0}</b><span>НА МОДЕРАЦИИ</span></div><div><b>${visits || 0}</b><span>ВИЗИТЫ / 7 ДНЕЙ</span></div>`;
  $('admin-toggle').innerHTML = isAdmin ? `РЕЖИМ АДМИНА${pending?.length ? `<i class="admin-badge">${pending.length}</i>` : ''}` : 'ВХОД АДМИНА';
  $('post-manager').innerHTML = `<h3>ПОСТЫ</h3>${(posts || []).map((post) => `<div class="comment"><strong>${escapeHtml(post.title)}</strong><br><small>${post.is_published ? (post.scheduled_for && new Date(post.scheduled_for) > new Date() ? 'Запланирован' : 'Опубликован') : 'Черновик'}${post.is_pinned ? ' · закреплён' : ''}</small><br><button class="action" type="button" data-edit-post="${post.id}">РЕДАКТИРОВАТЬ</button> <button class="action" type="button" data-preview-post="${post.id}">ПРЕДПРОСМОТР</button> <button class="action" type="button" data-toggle-post="${post.id}">${post.is_published ? 'В ЧЕРНОВИК' : 'ОПУБЛИКОВАТЬ'}</button> <button class="action" type="button" data-revert-post="${post.id}">ВЕРНУТЬ ВЕРСИЮ</button> <button class="action" type="button" data-delete-post="${post.id}">УДАЛИТЬ</button></div>`).join('') || '<p>Постов пока нет.</p>'}`;
  $('moderation').innerHTML = `<h3>МОДЕРАЦИЯ</h3>${(pending || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong>: ${escapeHtml(comment.body)}<br><button class="action" type="button" data-approve="${comment.id}">ОДОБРИТЬ</button> <button class="action" type="button" data-delete-comment="${comment.id}">УДАЛИТЬ</button></div>`).join('') || '<p>Нет комментариев на модерации.</p>'}`;
  const media = (posts || []).filter((post) => post.media_path);
  $('media-library').innerHTML = `<h3>МЕДИАТЕКА</h3>${media.length ? media.map((post) => { const { data } = client.storage.from('post-media').getPublicUrl(post.media_path); return `<a class="post-tag" href="${data.publicUrl}" target="_blank" rel="noopener">${escapeHtml(post.title)}</a>`; }).join(' ') : '<p class="admin-status">Пока нет прикреплённых файлов.</p>'}`;
  $('edit-history').innerHTML = `<h3>ПОСЛЕДНИЕ ПРАВКИ САЙТА</h3>${(history || []).map((item) => `<div class="comment"><small>${escapeHtml(item.element_key)} · ${formatDate(item.created_at)}</small><br><button class="action" type="button" data-restore-edit="${item.id}">ОТКАТИТЬ К ЭТОЙ ВЕРСИИ</button></div>`).join('') || '<p class="admin-status">История появится после первой правки элемента.</p>'}`;
  document.querySelectorAll('[data-edit-post]').forEach((button) => button.addEventListener('click', () => {
    const post = posts.find((item) => item.id === button.dataset.editPost);
    editingPostId = post.id; editingPostSlug = post.slug; editingMediaPath = post.media_path; editingMediaType = post.media_type; $('post-title').value = post.title; $('post-body').value = post.body; $('post-media').value = ''; $('post-tags').value = (post.tags || []).join(', '); $('post-pinned').checked = post.is_pinned; $('post-remove-media').checked = false; $('post-mode').value = post.is_published ? (post.scheduled_for && new Date(post.scheduled_for) > new Date() ? 'schedule' : 'publish') : 'draft'; $('post-schedule').value = formatMoscowDateTimeInput(post.scheduled_for); $('post-schedule-label').classList.toggle('hidden', $('post-mode').value !== 'schedule'); showPostForm();
  }));
  document.querySelectorAll('[data-preview-post]').forEach((button) => button.addEventListener('click', () => openPost(posts.find((item) => item.id === button.dataset.previewPost))));
  document.querySelectorAll('[data-toggle-post]').forEach((button) => button.addEventListener('click', async () => { const post = posts.find((item) => item.id === button.dataset.togglePost); await client.from('posts').update({ is_published: !post.is_published, scheduled_for: null, published_at: !post.is_published ? new Date().toISOString() : post.published_at }).eq('id', post.id); loadAdminTools(); loadPosts(); }));
  document.querySelectorAll('[data-revert-post]').forEach((button) => button.addEventListener('click', async () => { const { data: revision } = await client.from('post_revisions').select('id,snapshot').eq('post_id', button.dataset.revertPost).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (!revision) { notice('Для этого поста ещё нет сохранённой прошлой версии.'); return; } if (!confirm('Вернуть последнюю сохранённую версию поста?')) return; const { error } = await client.from('posts').update(revision.snapshot).eq('id', button.dataset.revertPost); if (!error) { await client.from('post_revisions').delete().eq('id', revision.id); notice('Прошлая версия поста восстановлена.'); loadAdminTools(); loadPosts(); } }));
  document.querySelectorAll('[data-delete-post]').forEach((button) => button.addEventListener('click', () => deletePostFromFeed(posts.find((item) => item.id === button.dataset.deletePost))));
  document.querySelectorAll('[data-restore-edit]').forEach((button) => button.addEventListener('click', async () => {
    const item = history.find((entry) => entry.id === button.dataset.restoreEdit); if (!item) return;
    const snapshot = item.properties?.kind ? item.properties : { kind: 'element', properties: item.properties };
    let error;
    if (snapshot.kind === 'block') {
      ({ error } = await client.from('site_blocks').update({ [snapshot.blockField]: snapshot.value, updated_at: new Date().toISOString() }).eq('id', snapshot.blockId));
      if (!error) { const block = siteBlocks.find((entry) => entry.id === snapshot.blockId); if (block) block[snapshot.blockField] = snapshot.value; }
      if (!error) ({ error } = await client.from('site_element_edits').upsert({ element_key: item.element_key, properties: snapshot.appearance || {}, updated_at: new Date().toISOString() }));
    } else ({ error } = await client.from('site_element_edits').upsert({ element_key: item.element_key, properties: snapshot.properties || {}, updated_at: new Date().toISOString() }));
    if (error) { notice('Не удалось восстановить версию.'); return; }
    const properties = snapshot.kind === 'block' ? { ...(snapshot.appearance || {}), text: snapshot.value } : (snapshot.properties || {});
    savedElementEdits.set(item.element_key, properties);
    const element = visualElements.get(item.element_key); if (element) applyElementProperties(element, properties);
    if (snapshot.kind === 'block') renderSiteBlocks();
    notice('Версия элемента восстановлена.');
  }));
  document.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', async () => { await client.from('comments').update({ is_approved: true }).eq('id', button.dataset.approve); loadAdminTools(); }));
  document.querySelectorAll('[data-delete-comment]').forEach((button) => button.addEventListener('click', async () => { await client.from('comments').delete().eq('id', button.dataset.deleteComment); loadAdminTools(); }));
}

$('admin-toggle').addEventListener('click', async () => { $('admin-modal').classList.toggle('hidden'); await refreshAdmin(); });
$('admin-close').addEventListener('click', () => $('admin-modal').classList.add('hidden'));
$('admin-modal').addEventListener('click', (event) => { if (event.target === $('admin-modal')) $('admin-modal').classList.add('hidden'); });
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
$('manage-site').addEventListener('click', async () => { isManaging = true; await refreshAdmin(); await loadSiteBlocks(); $('admin-modal').classList.add('hidden'); });
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
  if (!isAdmin) return;
  const postNotice = (text) => { $('post-form-message').textContent = text; };
  const title = $('post-title').value.trim();
  const body = $('post-body').value.trim();
  const slug = editingPostSlug || `post-${crypto.randomUUID()}`;
  if (!title || !body) { postNotice('Напиши название и текст поста.'); return; }
  $('save-post').disabled = true;
  try {
  let mediaPath = editingMediaPath;
  let mediaType = editingMediaType;
  if ($('post-remove-media').checked) { mediaPath = null; mediaType = null; }
  const file = $('post-media').files[0];
  if (file) {
    if (file.size > 52428800 || !['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type)) { postNotice('Выбери картинку или видео размером до 50 МБ.'); return; }
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    const uploaded = await client.storage.from('post-media').upload(`${Date.now()}-${safeName}`, file, { contentType: file.type });
    if (uploaded.error) { postNotice('Не удалось загрузить файл. Попробуй ещё раз.'); return; }
    mediaPath = uploaded.data.path;
    mediaType = file.type.startsWith('video/') ? 'video' : 'image';
  }
  const tags = [...new Set($('post-tags').value.split(',').map((tag) => tag.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
  const mode = $('post-mode').value;
  const scheduledFor = mode === 'schedule' && $('post-schedule').value ? moscowInputToIso($('post-schedule').value) : null;
  if (mode === 'schedule' && !scheduledFor) { postNotice('Выбери дату и время для отложенной публикации.'); return; }
  let existingPublishedAt = null;
  if (editingPostId) {
    const { data: current } = await client.from('posts').select('title,slug,excerpt,body,media_path,media_type,tags,is_pinned,is_published,scheduled_for,published_at').eq('id', editingPostId).single();
    if (current) { existingPublishedAt = current.published_at; await client.from('post_revisions').insert({ post_id: editingPostId, snapshot: current }); }
  }
  const isPublished = mode !== 'draft';
  const publishTime = scheduledFor || (isPublished ? (existingPublishedAt || new Date().toISOString()) : null);
  const payload = { title, slug, excerpt: body.slice(0, 180), body, media_path: mediaPath, media_type: mediaType, tags, is_pinned: $('post-pinned').checked, is_published: isPublished, scheduled_for: scheduledFor, published_at: publishTime };
  const { error } = editingPostId ? await client.from('posts').update(payload).eq('id', editingPostId) : await client.from('posts').insert(payload);
  if (error) { postNotice('Не удалось опубликовать пост. Текст сохранён в форме — попробуй ещё раз.'); return; }
  postDialog.close();
  editingPostId = null; editingPostSlug = null; editingMediaPath = null; editingMediaType = null;
  await loadPosts();
  loadAdminTools();
  } catch { postNotice('Не удалось сохранить. Попробуй ещё раз.'); }
  finally { $('save-post').disabled = false; }
});

// Do not make the blog wait for settings, authentication, or the tracker.
recordPrivacyFriendlyVisit();
const bootTasks = [loadSettings(), loadElementEdits(), refreshAdmin({ reloadArc: false }), loadSiteBlocks(), loadWinterArc(), loadTagCatalog(), loadPosts()];
await openRoute();
await Promise.allSettled(bootTasks);
