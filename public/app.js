import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = (selector) => document.querySelector(selector);
const dialog = $('#authDialog');
const form = $('#authForm');
const message = $('#formMessage');
const submitButton = $('#submitAuth');
const discordButton = $('#discordAuth');
const switchButton = $('#switchAuth');
let mode = 'login';
let supabase = null;
let authReady = false;

function showMessage(text, kind = 'error') {
  message.textContent = text;
  message.dataset.kind = kind;
}
function setMode(nextMode) {
  mode = nextMode === 'register' ? 'register' : 'login';
  const register = mode === 'register';
  $('#dialogTitle').textContent = register ? 'Criar sua conta' : 'Entrar na MK Gaming';
  $('#dialogDescription').textContent = register
    ? 'Crie sua conta para começar seu perfil na MK Gaming.'
    : 'Acesse sua conta MK Gaming.';
  $('#password').autocomplete = register ? 'new-password' : 'current-password';
  $('#password').minLength = register ? 12 : 1;
  $('#password').placeholder = register ? 'Use pelo menos 12 caracteres' : 'Digite sua senha';
  submitButton.textContent = register ? 'Criar conta' : 'Entrar';
  switchButton.textContent = register ? 'Já tem uma conta? Entrar' : 'Ainda não tem conta? Criar conta';
  showMessage('');
  // Deixa explícito qual modo está aberto, inclusive para leitores de tela.
  form.dataset.mode = mode;
}
function openAuth(nextMode) {
  setMode(nextMode);
  form.reset();
  setMode(nextMode);
  if (!dialog.open) dialog.showModal();
  if (!authReady) {
    showMessage('A conexão com o Supabase não foi carregada. Confira a configuração e atualize a página.');
  }
  $('#email').focus();
}
function renderAccount(user) {
  const actions = $('#headerActions');
  actions.replaceChildren();
  if (user) {
    const email = document.createElement('span');
    email.className = 'signed-in';
    email.textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta MK';
    const logout = document.createElement('button');
    logout.className = 'ghost';
    logout.textContent = 'Sair';
    logout.addEventListener('click', logoutAccount);
    actions.append(email, logout);
    $('#accountTitle').textContent = 'Sua conta MK';
    $('#accountDescription').textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta conectada';
    $('#accountSignup').classList.add('hidden');
    $('#logoutButton').classList.remove('hidden');
    $('#accountNote').textContent = 'Sua conta está conectada ao Supabase Auth.';
  } else {
    const login = document.createElement('button');
    login.className = 'ghost';
    login.textContent = 'Entrar';
    login.addEventListener('click', () => openAuth('login'));
    const signup = document.createElement('button');
    signup.className = 'primary';
    signup.textContent = 'Criar conta';
    signup.addEventListener('click', () => openAuth('register'));
    actions.append(login, signup);
    $('#accountTitle').textContent = 'MK ID';
    $('#accountDescription').textContent = 'Crie sua conta pessoal para começar seu perfil.';
    $('#accountSignup').classList.remove('hidden');
    $('#logoutButton').classList.add('hidden');
    $('#accountNote').textContent = authReady
      ? 'Cadastro e login usam o Supabase Auth.'
      : 'Não foi possível confirmar a conexão. Você pode abrir o formulário para ver o diagnóstico.';
  }
}
function friendlyError(error, action) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('user already registered')) return 'Este e-mail já possui uma conta. Tente entrar.';
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (text.includes('password') && (text.includes('least') || text.includes('short'))) return 'A senha precisa ter pelo menos 12 caracteres.';
  if (text.includes('fetch') || text.includes('network') || text.includes('failed to fetch')) return 'Não foi possível conectar ao Supabase. Confira sua conexão e as configurações de rede/CSP.';
  return action === 'register'
    ? 'Não foi possível criar a conta. Confira os dados e as configurações de autenticação do Supabase.'
    : 'Não foi possível entrar. Confira os dados e as configurações de autenticação do Supabase.';
}
function friendlyOAuthError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) return 'O provedor Discord não está ativado no Supabase.';
  if (text.includes('redirect') || text.includes('url')) return 'O endereço de retorno não está autorizado. Confira Authentication → URL Configuration e a Callback URL no Discord.';
  if (text.includes('client_id') || text.includes('client secret') || text.includes('invalid client')) return 'As credenciais OAuth do Discord parecem incorretas. Confira o Client ID e o Client Secret no Supabase, sem compartilhá-los.';
  if (text.includes('fetch') || text.includes('network') || text.includes('failed to fetch')) return 'Não foi possível conectar ao Supabase. Confira a conexão e tente novamente.';
  return 'Não foi possível iniciar o login com Discord. Confira o provedor e as URLs OAuth no Supabase.';
}
async function readConfig() {
  // Prefer the server config when available, with a public frontend config fallback for static hosting.
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config?.authConfigured && config?.supabaseUrl && config?.supabaseAnonKey) {
        return { url: config.supabaseUrl, key: config.supabaseAnonKey };
      }
    }
  } catch (_) {
    // Static hosting may not expose /api/config; use the public config file below.
  }
  const cfg = window.MK_SUPABASE_CONFIG;
  if (cfg?.supabaseUrl && cfg?.supabasePublishableKey) {
    return { url: cfg.supabaseUrl, key: cfg.supabasePublishableKey };
  }
  throw new Error('Configuração pública do Supabase não encontrada.');
}
async function loadAccount() {
  try {
    const cfg = await readConfig();
    supabase = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    authReady = true;
    $('#accountNote').textContent = 'Supabase conectado. Você pode criar uma conta ou entrar.';
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') {
      // Usuário sem sessão é um estado normal; outros erros não impedem abrir o formulário.
    }
    renderAccount(data?.user || null);
    supabase.auth.onAuthStateChange((event, session) => {
      renderAccount(session?.user || null);
      if (event === 'SIGNED_IN' && session?.user && dialog.open) dialog.close();
      if (event === 'SIGNED_IN' && session?.user) {
        $('#accountNote').textContent = 'Login realizado com sucesso.';
      }
    });
    // Supabase restores an OAuth session from the callback URL asynchronously.
    if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash.replace(/access_token=[^&]+&?/g, '').replace(/token_type=[^&]+&?/g, '').replace(/expires_in=[^&]+&?/g, '').replace(/state=[^&]+&?/g, ''));
    }
  } catch (error) {
    authReady = false;
    $('#accountNote').textContent = 'A conexão não foi confirmada. Abra Entrar para ver o estado e as orientações.';
    renderAccount(null);
    console.error('MK Gaming auth initialization failed:', error?.message || error);
  }
}
async function submitAuth(event) {
  event.preventDefault();
  showMessage('');
  if (!form.reportValidity()) return;
  if (!supabase || !authReady) {
    showMessage('A conexão com o Supabase não está pronta. Verifique a URL e a chave publicável em supabase-config.js ou nas variáveis do servidor.');
    return;
  }
  const email = $('#email').value.trim().toLowerCase();
  const password = $('#password').value;
  if (mode === 'register' && password.length < 12) {
    showMessage('A senha precisa ter pelo menos 12 caracteres.');
    return;
  }
  submitButton.disabled = true;
  const previousText = mode === 'register' ? 'Criar conta' : 'Entrar';
  submitButton.textContent = 'Processando…';
  try {
    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      if (data.session) {
        dialog.close(); form.reset(); renderAccount(data.user);
        showMessage('Conta criada com sucesso.', 'success');
      } else {
        showMessage('Cadastro iniciado. Verifique seu e-mail para confirmar a conta antes de entrar.', 'success');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      dialog.close(); form.reset(); renderAccount(data.user);
    }
  } catch (error) {
    showMessage(friendlyError(error, mode));
    console.error('MK Gaming email auth error:', error?.message || error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = previousText;
  }
}
async function loginWithDiscord() {
  if (!supabase || !authReady) {
    showMessage('A conexão com o Supabase não está pronta. Confira a URL e a chave publicável.');
    return;
  }
  showMessage('');
  discordButton.disabled = true;
  const previousText = discordButton.textContent;
  discordButton.textContent = 'Abrindo Discord…';
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true
      }
    });
    if (error) throw error;
    if (!data?.url) throw new Error('URL de autorização não retornada pelo Supabase.');
    // Explicit navigation avoids leaving the button in a permanent loading state.
    window.location.assign(data.url);
  } catch (error) {
    showMessage(friendlyOAuthError(error));
    console.error('MK Gaming Discord OAuth error:', error?.message || error);
    discordButton.disabled = false;
    discordButton.innerHTML = '<span class="discord-mark" aria-hidden="true">D</span>Continuar com Discord';
  }
}
async function logoutAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) $('#accountNote').textContent = 'Não foi possível sair da conta. Tente novamente.';
}
$('#loginOpen').addEventListener('click', () => openAuth('login'));
$('#signupOpen').addEventListener('click', () => openAuth('register'));
$('#heroSignup').addEventListener('click', () => openAuth('register'));
$('#accountSignup').addEventListener('click', () => openAuth('register'));
$('#logoutButton').addEventListener('click', logoutAccount);
switchButton.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
discordButton.addEventListener('click', loginWithDiscord);
$('#closeDialog').addEventListener('click', () => dialog.close());
form.addEventListener('submit', submitAuth);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#year').textContent = new Date().getFullYear();
loadAccount();
