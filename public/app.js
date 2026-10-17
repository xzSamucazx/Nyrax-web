'use strict';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const dialog = document.querySelector('#authDialog');
const form = document.querySelector('#authForm');
const message = document.querySelector('#formMessage');
const submitButton = document.querySelector('#submitAuth');
const discordButton = document.querySelector('#discordAuth');
let mode = 'login';
let supabase = null;
let authReady = false;

function setMode(nextMode) {
  mode = nextMode;
  const register = mode === 'register';
  document.querySelector('#dialogTitle').textContent = register ? 'Criar conta MK' : 'Entrar na MK';
  document.querySelector('#dialogDescription').textContent = register ? 'Crie sua conta pessoal na MK Gaming.' : 'Acesse sua conta MK Gaming.';
  document.querySelector('#password').setAttribute('autocomplete', register ? 'new-password' : 'current-password');
  document.querySelector('#password').setAttribute('minlength', register ? '12' : '1');
  document.querySelector('#password').placeholder = register ? 'Mínimo de 12 caracteres' : 'Sua senha';
  submitButton.textContent = register ? 'Criar conta' : 'Entrar';
  document.querySelector('#switchAuth').textContent = register ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta';
  message.textContent = '';
}
function openAuth(nextMode) {
  if (!authReady) {
    document.querySelector('#accountNote').textContent = 'O Supabase ainda não foi configurado no servidor.';
    return;
  }
  setMode(nextMode); form.reset();
  if (!dialog.open) dialog.showModal();
  document.querySelector('#email').focus();
}
function renderAccount(user) {
  const actions = document.querySelector('#headerActions');
  actions.replaceChildren();
  const accountTitle = document.querySelector('#accountTitle');
  const accountDescription = document.querySelector('#accountDescription');
  const accountSignup = document.querySelector('#accountSignup');
  const logoutButton = document.querySelector('#logoutButton');
  if (user) {
    const email = document.createElement('span'); email.className = 'signed-in'; email.textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta MK';
    const logout = document.createElement('button'); logout.className = 'ghost'; logout.textContent = 'Sair'; logout.addEventListener('click', logoutAccount);
    actions.append(email, logout);
    accountTitle.textContent = 'Sua conta MK'; accountDescription.textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Conta conectada';
    accountSignup.classList.add('hidden'); logoutButton.classList.remove('hidden');
    document.querySelector('#accountNote').textContent = 'Sua conta está conectada ao Supabase Auth.';
  } else {
    const login = document.createElement('button'); login.className = 'ghost'; login.textContent = 'Entrar'; login.addEventListener('click', () => openAuth('login'));
    const signup = document.createElement('button'); signup.className = 'primary'; signup.textContent = 'Criar conta'; signup.addEventListener('click', () => openAuth('register'));
    actions.append(login, signup);
    accountTitle.textContent = 'MK ID'; accountDescription.textContent = 'Crie sua conta pessoal para começar seu perfil.';
    accountSignup.classList.remove('hidden'); logoutButton.classList.add('hidden');
  }
}
function friendlyError(error, action) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('user already registered')) return 'Este e-mail já possui uma conta. Tente entrar.';
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (text.includes('password') && (text.includes('least') || text.includes('short'))) return 'A senha precisa ter pelo menos 12 caracteres.';
  if (text.includes('fetch') || text.includes('network')) return 'Não foi possível conectar ao Supabase. Verifique a configuração e tente novamente.';
  return action === 'register' ? 'Não foi possível criar a conta. Confira os dados e tente novamente.' : 'Não foi possível entrar. Confira os dados e tente novamente.';
}
async function loadAccount() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.authConfigured) throw new Error('Supabase não configurado');
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    authReady = true;
    document.querySelectorAll('#loginOpen, #signupOpen, #heroSignup, #accountSignup, #submitAuth, #discordAuth').forEach(el => el.disabled = false);
    const { data: { user } } = await supabase.auth.getUser();
    renderAccount(user);
    supabase.auth.onAuthStateChange((event, session) => {
      renderAccount(session?.user || null);
      if (event === 'SIGNED_IN' && session?.user && dialog.open) dialog.close();
      if (event === 'SIGNED_IN' && session?.user) {
        document.querySelector('#accountNote').textContent = 'Login realizado com sucesso. Sua conta está conectada ao Supabase Auth.';
      }
    });
  } catch (_) {
    authReady = false;
    document.querySelector('#accountNote').textContent = 'O cadastro e o login serão ativados após configurar o projeto Supabase.';
    document.querySelectorAll('#loginOpen, #signupOpen, #heroSignup, #accountSignup, #submitAuth, #discordAuth').forEach(el => el.disabled = true);
    renderAccount(null);
  }
}
async function submitAuth(event) {
  event.preventDefault(); message.textContent = '';
  if (!form.reportValidity() || !supabase) return;
  const email = document.querySelector('#email').value.trim().toLowerCase();
  const password = document.querySelector('#password').value;
  if (mode === 'register' && password.length < 12) {
    message.textContent = 'A senha precisa ter pelo menos 12 caracteres.'; return;
  }
  submitButton.disabled = true; submitButton.textContent = 'Aguarde…';
  try {
    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        renderAccount(data.user); dialog.close(); form.reset();
      } else {
        message.textContent = 'Conta criada. Verifique seu e-mail para confirmar o cadastro antes de entrar.';
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      renderAccount(data.user); dialog.close(); form.reset();
    }
  } catch (error) { message.textContent = friendlyError(error, mode); }
  finally { submitButton.disabled = false; submitButton.textContent = mode === 'register' ? 'Criar conta' : 'Entrar'; }
}
async function loginWithDiscord() {
  if (!supabase || !authReady) {
    message.textContent = 'O login ainda não está disponível. Confira a configuração do Supabase.';
    return;
  }
  message.textContent = '';
  discordButton.disabled = true;
  discordButton.textContent = 'Conectando ao Discord…';
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch (error) {
    message.textContent = friendlyOAuthError(error);
    discordButton.disabled = false;
    discordButton.innerHTML = '<span class="discord-mark" aria-hidden="true">D</span>Continuar com Discord';
  }
}
function friendlyOAuthError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) return 'O provedor Discord não está ativado no Supabase.';
  if (text.includes('redirect') || text.includes('url')) return 'O endereço de retorno não está autorizado. Confira Authentication → URL Configuration no Supabase.';
  if (text.includes('fetch') || text.includes('network')) return 'Não foi possível conectar ao Supabase. Verifique a conexão e tente novamente.';
  return 'Não foi possível iniciar o login com Discord. Confira a configuração OAuth e tente novamente.';
}
async function logoutAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) document.querySelector('#accountNote').textContent = 'Não foi possível sair da conta. Tente novamente.';
}

document.querySelector('#loginOpen').addEventListener('click', () => openAuth('login'));
document.querySelector('#signupOpen').addEventListener('click', () => openAuth('register'));
document.querySelector('#heroSignup').addEventListener('click', () => openAuth('register'));
document.querySelector('#accountSignup').addEventListener('click', () => openAuth('register'));
document.querySelector('#logoutButton').addEventListener('click', logoutAccount);
document.querySelector('#switchAuth').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
discordButton.addEventListener('click', loginWithDiscord);
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
form.addEventListener('submit', submitAuth);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.querySelector('#year').textContent = new Date().getFullYear();
loadAccount();
