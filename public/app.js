'use strict';
const dialog = document.querySelector('#authDialog');
const form = document.querySelector('#authForm');
const message = document.querySelector('#formMessage');
const submitButton = document.querySelector('#submitAuth');
let mode = 'login';
let csrfToken = '';
let authenticated = false;

async function refreshCsrf() {
  const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível iniciar uma sessão segura. Atualize a página.');
  const data = await response.json(); csrfToken = data.token;
}
function setMode(nextMode) {
  mode = nextMode;
  const register = mode === 'register';
  document.querySelector('#dialogTitle').textContent = register ? 'Criar conta MK' : 'Entrar na MK';
  document.querySelector('#dialogDescription').textContent = register ? 'Crie sua conta pessoal na MK Gaming.' : 'Acesse sua conta MK Gaming.';
  document.querySelector('#password').setAttribute('autocomplete', register ? 'new-password' : 'current-password');
  document.querySelector('#submitAuth').textContent = register ? 'Criar conta' : 'Entrar';
  document.querySelector('#switchAuth').textContent = register ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta';
  message.textContent = '';
}
function openAuth(nextMode) {
  setMode(nextMode);
  form.reset();
  if (!dialog.open) dialog.showModal();
  document.querySelector('#email').focus();
}
function renderAccount(user) {
  authenticated = Boolean(user);
  const actions = document.querySelector('#headerActions');
  actions.replaceChildren();
  const accountTitle = document.querySelector('#accountTitle');
  const accountDescription = document.querySelector('#accountDescription');
  const accountSignup = document.querySelector('#accountSignup');
  const logoutButton = document.querySelector('#logoutButton');
  if (user) {
    const email = document.createElement('span'); email.className = 'signed-in'; email.textContent = user.email;
    const logout = document.createElement('button'); logout.className = 'ghost'; logout.textContent = 'Sair'; logout.addEventListener('click', logoutAccount);
    actions.append(email, logout);
    accountTitle.textContent = 'Sua conta MK'; accountDescription.textContent = user.email;
    accountSignup.classList.add('hidden'); logoutButton.classList.remove('hidden');
  } else {
    const login = document.createElement('button'); login.className = 'ghost'; login.textContent = 'Entrar'; login.addEventListener('click', () => openAuth('login'));
    const signup = document.createElement('button'); signup.className = 'primary'; signup.textContent = 'Criar conta'; signup.addEventListener('click', () => openAuth('register'));
    actions.append(login, signup);
    accountTitle.textContent = 'MK ID'; accountDescription.textContent = 'Seu perfil começa com uma conta pessoal.';
    accountSignup.classList.remove('hidden'); logoutButton.classList.add('hidden');
  }
}
async function loadAccount() {
  try {
    await refreshCsrf();
    const response = await fetch('/api/auth/status', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 503) {
      document.querySelector('#accountNote').textContent = 'A autenticação ainda precisa ser configurada no servidor antes de liberar contas.';
      document.querySelectorAll('#loginOpen, #signupOpen, #heroSignup, #accountSignup').forEach(el => el.disabled = true);
      renderAccount(null); return;
    }
    const data = await response.json(); renderAccount(data.authenticated ? data.user : null);
  } catch (error) {
    document.querySelector('#accountNote').textContent = 'Não foi possível verificar a autenticação. Tente atualizar a página.';
    renderAccount(null);
  }
}
async function submitAuth(event) {
  event.preventDefault(); message.textContent = '';
  if (!form.reportValidity()) return;
  submitButton.disabled = true; submitButton.textContent = 'Aguarde…';
  try {
    if (!csrfToken) await refreshCsrf();
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ email: document.querySelector('#email').value, password: document.querySelector('#password').value }), cache: 'no-store'
    });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    if (data.csrfToken) csrfToken = data.csrfToken;
    renderAccount(data.user); dialog.close(); form.reset();
    document.querySelector('#accountNote').textContent = 'Sua sessão é protegida por cookie HTTP-only. Confirmação de e-mail e recuperação de senha ainda não estão disponíveis.';
  } catch (error) { message.textContent = error.message || 'Não foi possível conectar ao servidor.'; }
  finally { submitButton.disabled = false; submitButton.textContent = mode === 'register' ? 'Criar conta' : 'Entrar'; }
}
async function logoutAccount() {
  try {
    if (!csrfToken) await refreshCsrf();
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível encerrar a sessão. Atualize a página e tente novamente.');
    csrfToken = ''; await loadAccount();
  } catch (error) { document.querySelector('#accountNote').textContent = error.message; }
}

document.querySelector('#loginOpen').addEventListener('click', () => openAuth('login'));
document.querySelector('#signupOpen').addEventListener('click', () => openAuth('register'));
document.querySelector('#heroSignup').addEventListener('click', () => openAuth('register'));
document.querySelector('#accountSignup').addEventListener('click', () => openAuth('register'));
document.querySelector('#logoutButton').addEventListener('click', logoutAccount);
document.querySelector('#switchAuth').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
form.addEventListener('submit', submitAuth);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.querySelector('#year').textContent = new Date().getFullYear();
loadAccount();
