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

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function notice(text) { message.textContent = text; }
function formatDate(value) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value)); }

async function loadPosts() {
  const { data, error } = await client.from('posts').select('id,title,slug,excerpt,body,published_at,created_at').eq('is_published', true).order('published_at', { ascending: false });
  if (error) { feed.innerHTML = '<div class="empty">Не удалось загрузить блог. Попробуйте позже.</div>'; return; }
  if (!data.length) { feed.innerHTML = '<div class="empty">Первый пост появится совсем скоро.</div>'; return; }
  feed.innerHTML = data.map((post) => `<button class="post-card" type="button" data-post-id="${post.id}"><span class="meta">${formatDate(post.published_at || post.created_at)}</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt)}</p></button>`).join('');
  document.querySelectorAll('[data-post-id]').forEach((button) => button.addEventListener('click', () => openPost(data.find((post) => post.id === button.dataset.postId))));
}

async function openPost(post) {
  const { data: comments } = await client.from('comments').select('author_name,body,created_at').eq('post_id', post.id).eq('is_approved', true).order('created_at');
  reader.classList.remove('hidden');
  reader.innerHTML = `<span class="meta">${formatDate(post.published_at || post.created_at)}</span><h3>${escapeHtml(post.title)}</h3><div class="body-copy">${escapeHtml(post.body)}</div><section class="comments"><h3>КОММЕНТАРИИ</h3><div>${(comments || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong><br>${escapeHtml(comment.body)}</div>`).join('') || '<p>Пока нет комментариев.</p>'}</div><form class="form-grid" id="comment-form"><input id="comment-name" maxlength="80" required placeholder="Ваше имя"><textarea id="comment-body" maxlength="2000" required placeholder="Ваш комментарий"></textarea><button class="action">ОТПРАВИТЬ НА МОДЕРАЦИЮ</button><span class="toast" id="comment-message"></span></form></section>`;
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
  $('editor').classList.toggle('hidden', !isAdmin);
  $('admin-status').textContent = isAdmin ? 'Вы вошли как администратор. Можно создавать посты.' : user ? 'Аккаунт создан, но права администратора ещё не назначены.' : 'Войдите с email и паролем.';
  if (isAdmin) loadAdminTools();
}

async function loadAdminTools() {
  const [{ data: posts }, { data: pending }] = await Promise.all([
    client.from('posts').select('id,title,slug,excerpt,body,is_published').order('created_at', { ascending: false }),
    client.from('comments').select('id,author_name,body,post_id,created_at').eq('is_approved', false).order('created_at'),
  ]);
  $('post-manager').innerHTML = `<h3>ПОСТЫ</h3>${(posts || []).map((post) => `<div class="comment"><strong>${escapeHtml(post.title)}</strong><br><button class="action" type="button" data-edit-post="${post.id}">РЕДАКТИРОВАТЬ</button></div>`).join('') || '<p>Постов пока нет.</p>'}`;
  $('moderation').innerHTML = `<h3>МОДЕРАЦИЯ</h3>${(pending || []).map((comment) => `<div class="comment"><strong>${escapeHtml(comment.author_name)}</strong>: ${escapeHtml(comment.body)}<br><button class="action" type="button" data-approve="${comment.id}">ОДОБРИТЬ</button> <button class="action" type="button" data-delete-comment="${comment.id}">УДАЛИТЬ</button></div>`).join('') || '<p>Нет комментариев на модерации.</p>'}`;
  document.querySelectorAll('[data-edit-post]').forEach((button) => button.addEventListener('click', () => {
    const post = posts.find((item) => item.id === button.dataset.editPost);
    editingPostId = post.id; $('post-title').value = post.title; $('post-slug').value = post.slug; $('post-excerpt').value = post.excerpt; $('post-body').value = post.body; $('post-published').checked = post.is_published; $('save-post').textContent = 'ОБНОВИТЬ ПОСТ';
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
$('signup').addEventListener('click', async () => {
  const { error } = await client.auth.signUp({ email: $('admin-email').value.trim(), password: $('admin-password').value });
  notice(error ? 'Не удалось создать аккаунт.' : 'Аккаунт создан. Напишите мне «аккаунт создан», чтобы назначить его администратором.');
  if (!error) await refreshAdmin();
});
$('logout').addEventListener('click', async () => { await client.auth.signOut(); notice('Вы вышли из аккаунта.'); await refreshAdmin(); });
$('save-post').addEventListener('click', async () => {
  const title = $('post-title').value.trim();
  const slug = $('post-slug').value.trim().toLowerCase();
  const isPublished = $('post-published').checked;
  if (!title || !slug) { notice('Добавьте заголовок и slug поста.'); return; }
  const payload = { title, slug, excerpt: $('post-excerpt').value.trim(), body: $('post-body').value.trim(), is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null };
  const { error } = editingPostId ? await client.from('posts').update(payload).eq('id', editingPostId) : await client.from('posts').insert(payload);
  notice(error ? 'Не удалось сохранить пост. Проверьте slug: только латиница, цифры и дефисы.' : 'Пост сохранён.');
  if (!error) { ['post-title','post-slug','post-excerpt','post-body'].forEach((id) => { $(id).value = ''; }); $('post-published').checked = false; editingPostId = null; $('save-post').textContent = 'СОХРАНИТЬ ПОСТ'; loadPosts(); loadAdminTools(); }
});

await refreshAdmin();
loadPosts();
