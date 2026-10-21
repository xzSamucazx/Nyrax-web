import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = (selector) => document.querySelector(selector);
const dialog = $('#authDialog');
const loginView = $('#loginView');
const registerView = $('#registerView');
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const loginMessage = $('#loginMessage');
const registerMessage = $('#registerMessage');
const oauthMessage = $('#oauthMessage');
const loginSubmit = $('#loginSubmit');
const registerSubmit = $('#registerSubmit');
const discordButton = $('#discordAuth');
const profileEditor = $('#profileEditor');
const displayNameInput = $('#displayNameInput');
const profileMessage = $('#profileMessage');
let currentUser = null;
let socialProfile = null;
const socialContent = $('#socialContent');
const socialIntro = $('#socialIntro');
const hoursList = $('#hoursList');
const searchResults = $('#searchResults');
const friendRequests = $('#friendRequests');
const friendsList = $('#friendsList');
const profileDialog = $('#profileDialog');
let activePlaySession = null;
let playTimerInterval = null;
let sessionHeartbeatInterval = null;

let supabase = null;
let authReady = false;
let activeView = 'login';

function displayNameFor(user) {
  const meta = user?.user_metadata || {};
  const chosen = String(meta.display_name || meta.nickname || meta.global_name || meta.full_name || meta.name || '').trim();
  return chosen || 'Jogador MK';
}

function message(element, text = '', kind = 'error') {
  element.textContent = text;
  element.dataset.kind = kind;
}

function setView(view) {
  activeView = view === 'register' ? 'register' : 'login';
  loginView.classList.toggle('hidden', activeView !== 'login');
  registerView.classList.toggle('hidden', activeView !== 'register');
  message(loginMessage);
  message(registerMessage);
  message(oauthMessage);
  if (activeView === 'register') {
    $('#registerEmail').focus();
  } else {
    $('#loginEmail').focus();
  }
}

function openAuth(view) {
  setView(view);
  loginForm.reset();
  registerForm.reset();
  setView(view);
  if (!dialog.open) dialog.showModal();
  if (!authReady) {
    const target = activeView === 'register' ? registerMessage : loginMessage;
    message(target, 'A conexão com o Supabase não foi carregada. Verifique a configuração e tente novamente.');
  }
}

function renderAccount(user) {
  const actions = $('#headerActions');
  actions.replaceChildren();

  currentUser = user || null;
  if (user) {
    const label = document.createElement('span');
    label.className = 'signed-in';
    label.textContent = displayNameFor(user);
    const logout = document.createElement('button');
    logout.className = 'ghost';
    logout.type = 'button';
    logout.textContent = 'Sair';
    logout.addEventListener('click', logoutAccount);
    const profileButton = document.createElement('button'); profileButton.className = 'ghost'; profileButton.type = 'button'; profileButton.textContent = 'Meu perfil'; profileButton.addEventListener('click', openPlayerProfile);
    actions.append(profileButton, label, logout);

    $('#accountTitle').textContent = 'Sua conta MK';
    $('#accountDescription').textContent = 'Seu perfil está conectado. Seu e-mail permanece privado na página.';
    profileEditor.classList.remove('hidden');
    displayNameInput.value = displayNameFor(user);
    message(profileMessage);
    $('#accountSignup').classList.add('hidden');
    $('#logoutButton').classList.remove('hidden');
    $('#accountNote').textContent = 'Sua conta está conectada ao Supabase Auth.';
    socialContent.classList.remove('hidden');
    socialIntro.textContent = 'Edite seu perfil, registre suas horas jogadas e conecte-se com outros jogadores.';
    loadSocialData().catch(error => { console.error('MK social load failed:', error?.message || error); $('#socialProfileMessage').textContent = 'Não foi possível carregar os dados sociais. Confira se o SQL de configuração foi executado no Supabase.'; });
  } else {
    const login = document.createElement('button');
    login.className = 'ghost';
    login.type = 'button';
    login.textContent = 'Entrar';
    login.addEventListener('click', () => openAuth('login'));

    const signup = document.createElement('button');
    signup.className = 'primary';
    signup.type = 'button';
    signup.textContent = 'Criar conta';
    signup.addEventListener('click', () => openAuth('register'));
    actions.append(login, signup);

    profileEditor.classList.add('hidden');
    $('#accountTitle').textContent = 'MK ID';
    $('#accountDescription').textContent = 'Crie sua conta pessoal para começar seu perfil.';
    $('#accountSignup').classList.remove('hidden');
    $('#logoutButton').classList.add('hidden');
    $('#accountNote').textContent = authReady
      ? 'Escolha entrar com e-mail ou continuar com Discord.'
      : 'A conexão com a autenticação ainda não foi confirmada.';
    socialContent.classList.add('hidden');
    socialIntro.textContent = 'Entre na sua conta para gerenciar seu perfil, suas horas jogadas e amizades.';
  }
}

function friendlyError(error, action) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('user already registered')) return 'Este e-mail já possui uma conta. Tente entrar.';
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (text.includes('password') && (text.includes('least') || text.includes('short'))) return 'A senha precisa ter pelo menos 12 caracteres.';
  if (text.includes('fetch') || text.includes('network') || text.includes('failed to fetch')) return 'Não foi possível conectar ao Supabase. Verifique a conexão e a configuração da hospedagem.';
  if (text.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.';
  return action === 'register'
    ? 'Não foi possível criar a conta. Confira os dados e as configurações de e-mail do Supabase.'
    : 'Não foi possível entrar. Confira os dados e tente novamente.';
}

function friendlyOAuthError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) return 'O provedor Discord não está ativado no Supabase.';
  if (text.includes('redirect') || text.includes('url')) return 'O endereço de retorno não está autorizado. Confira Authentication → URL Configuration e a Callback URL cadastrada no Discord.';
  if (text.includes('client_id') || text.includes('client secret') || text.includes('invalid client')) return 'As credenciais OAuth do Discord parecem incorretas. Confira-as no Supabase sem compartilhar o Client Secret.';
  if (text.includes('fetch') || text.includes('network') || text.includes('failed to fetch')) return 'Não foi possível conectar ao Supabase. Verifique a conexão e tente novamente.';
  return 'Não foi possível iniciar o login com Discord. Confira o provedor e as URLs OAuth no Supabase.';
}

async function readConfig() {
  // Use o endpoint do servidor quando disponível.
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config?.authConfigured && config?.supabaseUrl && config?.supabaseAnonKey) {
        return { url: config.supabaseUrl, key: config.supabaseAnonKey };
      }
    }
  } catch (_) {
    // Pode ser hospedagem estática: tenta a configuração pública.
  }

  const config = window.MK_SUPABASE_CONFIG;
  if (config?.supabaseUrl && config?.supabasePublishableKey) {
    return { url: config.supabaseUrl, key: config.supabasePublishableKey };
  }
  throw new Error('Configuração pública do Supabase não encontrada.');
}

async function loadAccount() {
  try {
    const config = await readConfig();
    supabase = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });
    authReady = true;
    $('#accountNote').textContent = 'Conexão com Supabase carregada. Você pode entrar ou criar uma conta.';

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    renderAccount(data.session?.user || null);
    discordButton.disabled = false;
    discordButton.innerHTML = '<span class="discord-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.73 5.35a18.3 18.3 0 0 0-4.52-1.4.07.07 0 0 0-.08.04c-.2.35-.43.8-.59 1.16a16.9 16.9 0 0 0-5.08 0c-.16-.37-.4-.81-.6-1.16a.08.08 0 0 0-.08-.04 18.2 18.2 0 0 0-4.52 1.4.07.07 0 0 0-.03.03C1.35 9.65.56 13.82.95 17.93c0 .02.02.04.03.05a18.4 18.4 0 0 0 5.54 2.8.08.08 0 0 0 .09-.03c.43-.59.81-1.21 1.14-1.87a.08.08 0 0 0-.04-.1 12.1 12.1 0 0 1-1.73-.82.08.08 0 0 1-.01-.13c.12-.09.23-.18.34-.27a.08.08 0 0 1 .08-.01c3.63 1.66 7.56 1.66 11.15 0a.08.08 0 0 1 .08.01c.11.09.22.19.34.27a.08.08 0 0 1-.01.13c-.55.32-1.13.59-1.73.82a.08.08 0 0 0-.04.1c.33.66.71 1.28 1.14 1.87a.08.08 0 0 0 .09.03 18.3 18.3 0 0 0 5.55-2.8.08.08 0 0 0 .03-.05c.46-4.75-.77-8.88-3.27-12.55a.06.06 0 0 0-.03-.03ZM8.02 14.9c-1.09 0-1.99-1-1.99-2.23s.88-2.23 1.99-2.23c1.12 0 2.01 1.01 1.99 2.23 0 1.23-.88 2.23-1.99 2.23Zm7.96 0c-1.09 0-1.99-1-1.99-2.23s.88-2.23 1.99-2.23c1.12 0 2.01 1.01 1.99 2.23 0 1.23-.87 2.23-1.99 2.23Z"/></svg></span>Continuar com Discord';

    supabase.auth.onAuthStateChange((event, session) => {
      renderAccount(session?.user || null);
      if (event === 'SIGNED_IN' && session?.user) {
        $('#accountNote').textContent = 'Login realizado com sucesso.';
        if (dialog.open) dialog.close();
      }
      if (event === 'SIGNED_OUT') {
        $('#accountNote').textContent = 'Você saiu da sua conta.';
      }
    });
  } catch (error) {
    authReady = false;
    renderAccount(null);
    $('#accountNote').textContent = 'Não foi possível conectar à autenticação. Abra o formulário para ver a orientação.';
    console.error('MK Gaming auth initialization failed:', error?.message || error);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  message(loginMessage);
  if (!loginForm.reportValidity()) return;
  if (!supabase || !authReady) {
    message(loginMessage, 'A conexão com o Supabase não está pronta. Confira a URL e a chave publicável.');
    return;
  }

  const email = $('#loginEmail').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Entrando…';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('A autenticação não retornou um usuário.');
    loginForm.reset();
    dialog.close();
    renderAccount(data.user);
  } catch (error) {
    message(loginMessage, friendlyError(error, 'login'));
    console.error('MK Gaming login error:', error?.message || error);
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Entrar';
  }
}

async function submitRegister(event) {
  event.preventDefault();
  message(registerMessage);
  if (!registerForm.reportValidity()) return;
  if (!supabase || !authReady) {
    message(registerMessage, 'A conexão com o Supabase não está pronta. Confira a URL e a chave publicável.');
    return;
  }

  const displayName = $('#registerDisplayName').value.trim();
  const email = $('#registerEmail').value.trim().toLowerCase();
  const password = $('#registerPassword').value;
  const confirmation = $('#confirmPassword').value;
  if (displayName.length < 2) {
    message(registerMessage, 'Escolha um nome com pelo menos 2 caracteres.');
    return;
  }
  if (password.length < 12) {
    message(registerMessage, 'A senha precisa ter pelo menos 12 caracteres.');
    return;
  }
  if (password !== confirmation) {
    message(registerMessage, 'As senhas não coincidem. Confira os dois campos.');
    return;
  }

  registerSubmit.disabled = true;
  registerSubmit.textContent = 'Criando conta…';
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { display_name: displayName } }
    });
    if (error) throw error;
    registerForm.reset();
    if (data.session && data.user) {
      dialog.close();
      renderAccount(data.user);
      $('#accountNote').textContent = 'Conta criada com sucesso.';
    } else {
      message(registerMessage, 'Cadastro iniciado. Verifique seu e-mail e confirme o endereço antes de entrar.', 'success');
    }
  } catch (error) {
    message(registerMessage, friendlyError(error, 'register'));
    console.error('MK Gaming registration error:', error?.message || error);
  } finally {
    registerSubmit.disabled = false;
    registerSubmit.textContent = 'Criar conta';
  }
}

async function loginWithDiscord() {
  message(oauthMessage);
  if (!supabase || !authReady) {
    message(oauthMessage, 'A conexão com o Supabase não está pronta. Atualize a página e tente novamente.');
    return;
  }

  discordButton.disabled = true;
  discordButton.textContent = 'Conectando ao Discord…';
  try {
    const redirectTo = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo }
    });
    if (error) throw error;
    // O SDK do Supabase inicia o redirecionamento automaticamente.
    // Se não houver navegação, mostramos uma mensagem útil em vez de deixar o botão preso.
    if (!data?.url) throw new Error('Supabase não retornou uma URL de autorização.');
  } catch (error) {
    message(oauthMessage, friendlyOAuthError(error));
    console.error('MK Gaming Discord OAuth error:', error?.message || error);
    discordButton.disabled = false;
    discordButton.textContent = 'Continuar com Discord';
  }
}

async function saveDisplayName() {
  message(profileMessage);
  if (!supabase || !currentUser) { message(profileMessage, 'Entre na sua conta antes de alterar o nome.'); return; }
  const displayName = displayNameInput.value.trim();
  if (displayName.length < 2 || displayName.length > 32) { message(profileMessage, 'O nome precisa ter entre 2 e 32 caracteres.'); return; }
  const saveButton = $('#saveDisplayName');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando…';
  try {
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    if (error) throw error;
    const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, display_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (profileError) throw profileError;
    renderAccount(data.user);
    message(profileMessage, 'Nome atualizado com sucesso.', 'success');
  } catch (error) {
    message(profileMessage, 'Não foi possível salvar o nome. Tente novamente.');
    console.error('MK Gaming display name update failed:', error?.message || error);
  } finally { saveButton.disabled = false; saveButton.textContent = 'Salvar nome'; }
}

async function logoutAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    $('#accountNote').textContent = 'Não foi possível sair da conta. Tente novamente.';
  }
}


function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function socialMessage(id, text='', kind='error') {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = text; el.dataset.kind = kind;
}
async function ensureSocialProfile(user) {
  const meta = user.user_metadata || {};
  const name = displayNameFor(user);
  const { data, error } = await supabase.from('profiles').upsert({
    id: user.id, display_name: name, updated_at: new Date().toISOString()
  }, { onConflict: 'id', ignoreDuplicates: false }).select().single();
  if (error) throw error;
  socialProfile = data;
  $('#profileBio').value = data.bio || '';
  $('#profilePublic').checked = data.is_public !== false;
  return data;
}
async function loadSocialData() {
  if (!supabase || !currentUser) return;
  try {
    await ensureSocialProfile(currentUser);
    await Promise.all([loadHours(), loadFriendRequests(), loadFriends()]);
    await restoreActivePlaySession();
  } catch (error) {
    console.error('Social profile setup failed:', error?.message || error);
    socialMessage('socialProfileMessage', 'Não foi possível carregar o perfil. Execute o arquivo supabase/mk-gaming-social.sql no SQL Editor do Supabase.');
  }
}
async function saveSocialProfile() {
  if (!currentUser) return;
  const bio = $('#profileBio').value.trim();
  const isPublic = $('#profilePublic').checked;
  const displayName = displayNameInput.value.trim();
  if (displayName.length < 2 || displayName.length > 32) {
    socialMessage('socialProfileMessage', 'Defina primeiro um nome de exibição entre 2 e 32 caracteres.'); return;
  }
  const button = $('#saveSocialProfile'); button.disabled = true; button.textContent = 'Salvando…';
  try {
    const { error: authError } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    if (authError) throw authError;
    const { data, error } = await supabase.from('profiles').upsert({ id: currentUser.id, display_name: displayName, bio, is_public: isPublic, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single();
    if (error) throw error;
    socialProfile = data;
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) renderAccount(userData.user);
    socialMessage('socialProfileMessage', 'Perfil salvo com sucesso.', 'success');
  } catch (error) {
    socialMessage('socialProfileMessage', 'Não foi possível salvar. Confira se o SQL social foi executado no Supabase.');
    console.error('Save social profile failed:', error?.message || error);
  } finally { button.disabled = false; button.textContent = 'Salvar perfil'; }
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}
function updatePlayTimer() {
  const timer = $('#playTimer');
  if (!timer) return;
  if (!activePlaySession) { timer.textContent = '00:00:00'; return; }
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(activePlaySession.started_at).getTime()) / 1000));
  timer.textContent = formatDuration(seconds);
}
function showActiveSession() {
  const active = Boolean(activePlaySession);
  $('#startPlaySession').classList.toggle('hidden', active);
  $('#stopPlaySession').classList.toggle('hidden', !active);
  $('#gameName').disabled = active;
  updatePlayTimer();
  if (playTimerInterval) clearInterval(playTimerInterval);
  if (active) playTimerInterval = setInterval(updatePlayTimer, 1000);
}
async function restoreActivePlaySession() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('game_sessions').select('id, game_name, started_at, last_heartbeat').eq('user_id', currentUser.id).eq('is_active', true).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.warn('Automatic game tracking table is not ready:', error.message); return; }
  if (!data) { activePlaySession = null; showActiveSession(); return; }
  const last = new Date(data.last_heartbeat || data.started_at).getTime();
  // If the browser was closed or disconnected for over 2 minutes, stop at the last heartbeat to avoid fake hours.
  if (Date.now() - last > 120000) {
    const endAt = new Date(last).toISOString();
    const elapsed = Math.max(0, (last - new Date(data.started_at).getTime()) / 1000);
    await supabase.from('game_sessions').update({ is_active: false, ended_at: endAt, elapsed_seconds: Math.floor(elapsed) }).eq('id', data.id).eq('user_id', currentUser.id);
    if (elapsed >= 60) await addElapsedHours(data.game_name, elapsed);
    activePlaySession = null; showActiveSession(); await loadHours(); return;
  }
  activePlaySession = data;
  $('#gameName').value = data.game_name;
  showActiveSession();
  startHeartbeat();
}
function startHeartbeat() {
  if (sessionHeartbeatInterval) clearInterval(sessionHeartbeatInterval);
  sessionHeartbeatInterval = setInterval(async () => {
    if (!activePlaySession || !supabase || !currentUser) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('game_sessions').update({ last_heartbeat: now }).eq('id', activePlaySession.id).eq('user_id', currentUser.id).eq('is_active', true);
    if (error) console.warn('Game session heartbeat failed:', error.message);
    else activePlaySession.last_heartbeat = now;
  }, 60000);
}
async function addElapsedHours(gameName, seconds) {
  const { data: existing, error: readError } = await supabase.from('game_hours').select('id,hours_played').eq('user_id', currentUser.id).ilike('game_name', gameName).maybeSingle();
  if (readError) throw readError;
  const total = Math.round(((Number(existing?.hours_played || 0) + seconds / 3600) * 1000)) / 1000;
  const payload = { user_id: currentUser.id, game_name: gameName, hours_played: total, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('game_hours').upsert(payload, { onConflict: 'user_id,game_name' });
  if (error) throw error;
}
async function startPlaySession() {
  if (!currentUser || !supabase) { socialMessage('hoursMessage', 'Entre na sua conta para iniciar a contagem.'); return; }
  const gameName = $('#gameName').value.trim();
  if (gameName.length < 1 || gameName.length > 80) { socialMessage('hoursMessage', 'Informe o nome do jogo.'); return; }
  $('#startPlaySession').disabled = true;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('game_sessions').insert({ user_id: currentUser.id, game_name: gameName, started_at: now, last_heartbeat: now, is_active: true }).select('id,game_name,started_at,last_heartbeat').single();
    if (error) throw error;
    activePlaySession = data; showActiveSession(); startHeartbeat(); socialMessage('hoursMessage', 'Contagem iniciada. Mantenha a MK Gaming aberta durante a sessão.', 'success');
  } catch (error) {
    socialMessage('hoursMessage', 'Não foi possível iniciar a contagem. Confira se executou o SQL atualizado no Supabase.');
    console.error('Start play session failed:', error.message);
  } finally { $('#startPlaySession').disabled = false; }
}
async function stopPlaySession() {
  if (!activePlaySession || !currentUser) return;
  $('#stopPlaySession').disabled = true;
  try {
    const now = new Date().toISOString();
    const seconds = Math.max(0, (Date.now() - new Date(activePlaySession.started_at).getTime()) / 1000);
    const { error } = await supabase.from('game_sessions').update({ is_active: false, ended_at: now, last_heartbeat: now, elapsed_seconds: Math.floor(seconds) }).eq('id', activePlaySession.id).eq('user_id', currentUser.id).eq('is_active', true);
    if (error) throw error;
    if (seconds >= 10) await addElapsedHours(activePlaySession.game_name, seconds);
    activePlaySession = null;
    if (sessionHeartbeatInterval) clearInterval(sessionHeartbeatInterval); sessionHeartbeatInterval = null;
    showActiveSession(); await loadHours();
    socialMessage('hoursMessage', `Sessão finalizada. Foram contabilizados ${Math.floor(seconds / 60)} minutos.`, 'success');
  } catch (error) { socialMessage('hoursMessage', 'Não foi possível salvar a sessão. Tente novamente.'); console.error('Stop play session failed:', error.message); }
  finally { $('#stopPlaySession').disabled = false; }
}
async function openPlayerProfile() {
  if (!currentUser) { openAuth('register'); return; }
  try {
    await loadSocialData();
    const name = socialProfile?.display_name || displayNameFor(currentUser);
    $('#profilePageTitle').textContent = name;
    $('#profileHandle').textContent = 'Membro da MK Gaming';
    $('#profileBioPreview').textContent = socialProfile?.bio || 'Adicione uma descrição ao seu perfil.';
    $('#profileEditName').value = name;
    $('#profileEditBio').value = socialProfile?.bio || '';
    $('#profileEditPublic').checked = socialProfile?.is_public !== false;
    $('#profileAvatarPreview').src = socialProfile?.avatar_url || '/assets/mk-logo.png';
    const { data: hours } = await supabase.from('game_hours').select('game_name,hours_played').eq('user_id', currentUser.id);
    const totalHours = (hours || []).reduce((sum, item) => sum + Number(item.hours_played || 0), 0);
    $('#profileTotalHours').textContent = `${Math.round(totalHours * 10) / 10} h`;
    const { count } = await supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);
    $('#profileFriendCount').textContent = String(count || 0);
    const games = $('#profileGamePreview'); games.replaceChildren();
    if (!hours?.length) games.innerHTML = '<p class="muted small">Nenhum jogo registrado ainda.</p>';
    else for (const game of hours) { const row = document.createElement('div'); row.className = 'social-item'; const label = document.createElement('strong'); label.textContent = game.game_name; const value = document.createElement('span'); value.textContent = `${Number(game.hours_played).toFixed(1)} h`; row.append(label, value); games.append(row); }
    $('#profileReadView').classList.remove('hidden'); $('#profileEditForm').classList.add('hidden');
    if (!profileDialog.open) profileDialog.showModal();
  } catch (error) { console.error('Open profile failed:', error.message); }
}
async function saveProfilePage(event) {
  event.preventDefault(); if (!currentUser || !supabase) return;
  const name = $('#profileEditName').value.trim(); const bio = $('#profileEditBio').value.trim();
  if (name.length < 2 || name.length > 32) { socialMessage('profileEditMessage', 'O nome deve ter de 2 a 32 caracteres.'); return; }
  const button = $('#saveProfilePage'); button.disabled = true; button.textContent = 'Salvando…';
  try {
    let avatarUrl = socialProfile?.avatar_url || null;
    const file = $('#profileAvatarFile').files?.[0];
    if (file) {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) throw new Error('A foto deve ser PNG, JPG ou WebP e ter até 3 MB.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('profile-avatars').getPublicUrl(path); avatarUrl = urlData.publicUrl;
    }
    const { data: authData, error: authError } = await supabase.auth.updateUser({ data: { display_name: name } }); if (authError) throw authError;
    const { data, error } = await supabase.from('profiles').upsert({ id: currentUser.id, display_name: name, bio, is_public: $('#profileEditPublic').checked, avatar_url: avatarUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single();
    if (error) throw error;
    socialProfile = data; currentUser = authData.user; renderAccount(authData.user);
    $('#profileEditMessage').textContent = 'Perfil atualizado.'; $('#profileEditMessage').dataset.kind = 'success';
    await openPlayerProfile();
  } catch (error) { socialMessage('profileEditMessage', error.message?.includes('foto') ? error.message : 'Não foi possível salvar. Confira se executou o SQL e configurou o Storage do Supabase.'); console.error('Profile save failed:', error.message); }
  finally { button.disabled = false; button.textContent = 'Salvar alterações'; }
}

async function loadHours() {
  const { data, error } = await supabase.from('game_hours').select('id, game_name, hours_played, updated_at').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
  if (error) throw error;
  hoursList.replaceChildren();
  if (!data.length) { hoursList.innerHTML = '<p class="muted small">Você ainda não contabilizou horas. Inicie uma sessão acima.</p>'; return; }
  for (const item of data) {
    const row = document.createElement('div'); row.className = 'social-item';
    const info = document.createElement('div'); info.className = 'social-item-info';
    const name = document.createElement('strong'); name.textContent = item.game_name;
    const hours = document.createElement('span'); hours.textContent = `${Number(item.hours_played)} h jogadas`;
    info.append(name, hours);
    const del = document.createElement('button'); del.className = 'ghost compact'; del.textContent = 'Remover'; del.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('game_hours').delete().eq('id', item.id).eq('user_id', currentUser.id);
      if (deleteError) { socialMessage('hoursMessage', 'Não foi possível remover esse registro.'); return; }
      await loadHours();
    });
    row.append(info, del); hoursList.append(row);
  }
}

function makeProfileCard(profile, actionLabel, action) {
  const card = document.createElement('div'); card.className = 'social-item';
  const info = document.createElement('div'); info.className = 'social-item-info';
  const name = document.createElement('strong'); name.textContent = profile.display_name || 'Jogador MK';
  const bio = document.createElement('span'); bio.textContent = profile.bio || 'Membro da MK Gaming';
  info.append(name, bio); card.append(info);
  if (actionLabel) { const button = document.createElement('button'); button.className = 'ghost compact'; button.textContent = actionLabel; button.addEventListener('click', () => action(button)); card.append(button); }
  return card;
}
async function searchPlayers(event) {
  event.preventDefault(); searchResults.replaceChildren(); socialMessage('searchMessage');
  const term = $('#playerSearch').value.trim();
  if (term.length < 2) { socialMessage('searchMessage', 'Digite pelo menos 2 caracteres.'); return; }
  try {
    const { data, error } = await supabase.from('profiles').select('id, display_name, bio').eq('is_public', true).ilike('display_name', `%${term.replace(/[%_,]/g, '')}%`).neq('id', currentUser.id).limit(20);
    if (error) throw error;
    if (!data.length) { socialMessage('searchMessage', 'Nenhum perfil público encontrado.'); return; }
    for (const profile of data) {
      const card = makeProfileCard(profile, 'Adicionar', async button => {
        button.disabled = true;
        try {
          const { error: requestError } = await supabase.from('friendships').insert({ requester_id: currentUser.id, addressee_id: profile.id, status: 'pending' });
          if (requestError) throw requestError;
          button.textContent = 'Solicitado'; socialMessage('searchMessage', 'Solicitação de amizade enviada.', 'success');
        } catch (error) {
          button.disabled = false;
          const msg = String(error?.message || '').toLowerCase();
          socialMessage('searchMessage', msg.includes('duplicate') || msg.includes('unique') ? 'Já existe uma solicitação ou amizade entre vocês.' : 'Não foi possível enviar. Talvez já exista uma solicitação.');
        }
      }); searchResults.append(card);
    }
  } catch (error) { socialMessage('searchMessage', 'A busca falhou. Confira se o SQL social foi executado no Supabase.'); console.error('Player search failed:', error?.message || error); }
}
async function loadFriendRequests() {
  const { data, error } = await supabase.from('friendships').select('id, requester_id, profiles!friendships_requester_id_fkey(id, display_name, bio)').eq('addressee_id', currentUser.id).eq('status', 'pending');
  if (error) throw error;
  friendRequests.replaceChildren();
  if (!data.length) { friendRequests.innerHTML = '<p class="muted small">Nenhuma solicitação pendente.</p>'; return; }
  for (const request of data) {
    const card = makeProfileCard(request.profiles || {display_name:'Jogador MK'}, 'Aceitar', async button => {
      button.disabled = true;
      const { error: updateError } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', request.id).eq('addressee_id', currentUser.id);
      if (updateError) { button.disabled = false; socialMessage('socialProfileMessage', 'Não foi possível aceitar a solicitação.'); return; }
      await loadFriendRequests(); await loadFriends();
    });
    const decline = document.createElement('button'); decline.className = 'ghost compact'; decline.textContent = 'Recusar'; decline.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('friendships').delete().eq('id', request.id).eq('addressee_id', currentUser.id);
      if (!deleteError) await loadFriendRequests();
    }); card.append(decline); friendRequests.append(card);
  }
}
async function loadFriends() {
  const { data, error } = await supabase.from('friendships').select('id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, display_name, bio), addressee:profiles!friendships_addressee_id_fkey(id, display_name, bio)').eq('status', 'accepted').or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);
  if (error) throw error;
  friendsList.replaceChildren();
  if (!data.length) { friendsList.innerHTML = '<p class="muted small">Sua lista de amigos está vazia por enquanto.</p>'; return; }
  for (const friendship of data) {
    const friend = friendship.requester_id === currentUser.id ? friendship.addressee : friendship.requester;
    if (!friend) continue;
    const card = makeProfileCard(friend, 'Remover', async button => {
      button.disabled = true;
      const { error: removeError } = await supabase.from('friendships').delete().eq('id', friendship.id);
      if (removeError) { button.disabled = false; return; }
      await loadFriends();
    }); friendsList.append(card);
  }
}

$('#loginOpen').addEventListener('click', () => openAuth('login'));
$('#signupOpen').addEventListener('click', () => openAuth('register'));
$('#heroSignup').addEventListener('click', () => currentUser ? openPlayerProfile() : openAuth('register'));
$('#accountSignup').addEventListener('click', () => openAuth('register'));
$('#logoutButton').addEventListener('click', logoutAccount);
$('#saveDisplayName').addEventListener('click', saveDisplayName);
$('#saveSocialProfile').addEventListener('click', saveSocialProfile);
$('#startPlaySession').addEventListener('click', startPlaySession);
$('#stopPlaySession').addEventListener('click', stopPlaySession);
$('#editProfileButton').addEventListener('click', () => { $('#profileReadView').classList.add('hidden'); $('#profileEditForm').classList.remove('hidden'); });
$('#cancelProfileEdit').addEventListener('click', () => { $('#profileEditForm').classList.add('hidden'); $('#profileReadView').classList.remove('hidden'); });
$('#profileEditForm').addEventListener('submit', saveProfilePage);
$('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
$('#playerSearchForm').addEventListener('submit', searchPlayers);
$('#showRegister').addEventListener('click', () => setView('register'));
$('#showLogin').addEventListener('click', () => setView('login'));
$('#discordAuth').addEventListener('click', loginWithDiscord);
$('#closeDialog').addEventListener('click', () => dialog.close());
loginForm.addEventListener('submit', submitLogin);
registerForm.addEventListener('submit', submitRegister);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#year').textContent = new Date().getFullYear();
loadAccount();
