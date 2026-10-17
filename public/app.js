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

let supabase = null;
let authReady = false;
let activeView = 'login';

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

  if (user) {
    const label = document.createElement('span');
    label.className = 'signed-in';
    label.textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta MK';
    const logout = document.createElement('button');
    logout.className = 'ghost';
    logout.type = 'button';
    logout.textContent = 'Sair';
    logout.addEventListener('click', logoutAccount);
    actions.append(label, logout);

    $('#accountTitle').textContent = 'Sua conta MK';
    $('#accountDescription').textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta conectada';
    $('#accountSignup').classList.add('hidden');
    $('#logoutButton').classList.remove('hidden');
    $('#accountNote').textContent = 'Sua conta está conectada ao Supabase Auth.';
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

    $('#accountTitle').textContent = 'MK ID';
    $('#accountDescription').textContent = 'Crie sua conta pessoal para começar seu perfil.';
    $('#accountSignup').classList.remove('hidden');
    $('#logoutButton').classList.add('hidden');
    $('#accountNote').textContent = authReady
      ? 'Escolha entrar com e-mail ou continuar com Discord.'
      : 'A conexão com a autenticação ainda não foi confirmada.';
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

  const email = $('#registerEmail').value.trim().toLowerCase();
  const password = $('#registerPassword').value;
  const confirmation = $('#confirmPassword').value;
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
      options: { emailRedirectTo: `${window.location.origin}/` }
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
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Supabase não retornou uma URL de autorização.');
    // Navegação explícita: evita depender de redirecionamento automático do SDK.
    window.location.href = data.url;
  } catch (error) {
    message(oauthMessage, friendlyOAuthError(error));
    console.error('MK Gaming Discord OAuth error:', error?.message || error);
    discordButton.disabled = false;
    discordButton.textContent = 'Continuar com Discord';
  }
}

async function logoutAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    $('#accountNote').textContent = 'Não foi possível sair da conta. Tente novamente.';
  }
}

$('#loginOpen').addEventListener('click', () => openAuth('login'));
$('#signupOpen').addEventListener('click', () => openAuth('register'));
$('#heroSignup').addEventListener('click', () => openAuth('register'));
$('#accountSignup').addEventListener('click', () => openAuth('register'));
$('#logoutButton').addEventListener('click', logoutAccount);
$('#showRegister').addEventListener('click', () => setView('register'));
$('#showLogin').addEventListener('click', () => setView('login'));
$('#discordAuth').addEventListener('click', loginWithDiscord);
$('#closeDialog').addEventListener('click', () => dialog.close());
loginForm.addEventListener('submit', submitLogin);
registerForm.addEventListener('submit', submitRegister);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#year').textContent = new Date().getFullYear();
loadAccount();
