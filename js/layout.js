// js/layout.js

// 1. Funções Auxiliares (Globais)
function createNavLink(label, linkUrl) {
    // Verifica se a página atual corresponde a este link
    const isActive = window.location.href.includes(linkUrl);
    const activeClass = isActive ? "bg-blue-700 text-white shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white";
    return `<a href="${linkUrl}" class="${activeClass} px-4 py-2 rounded-lg text-sm font-medium transition duration-200">${label}</a>`;
}

// Função de Logout Global
window.logout = function() {
    localStorage.removeItem('usuario');
    window.location.href = 'index.html';
}

// 2. Função Principal de Renderização
function renderNavbar() {
    console.log("Tentando renderizar navbar...");

    // Verificação de Segurança: O config.js carregou?
    if (!window._supabase) {
        console.error("ERRO: _supabase não encontrado. Verifique se js/config.js foi carregado antes de js/layout.js");
        // Opcional: alert("Erro de sistema: Configuração não carregada.");
        return;
    }

    const usuario = JSON.parse(localStorage.getItem('usuario'));
    const path = window.location.pathname;

    // Regra de Redirecionamento (Segurança Frontend)
    if (!usuario && !path.endsWith('index.html') && !path.endsWith('/')) {
        window.location.href = 'index.html';
        return;
    }

    // Não desenha menu na tela de login
    if (path.endsWith('index.html') || path.endsWith('/')) return;

    // HTML do Menu
    const navbarHTML = `
    <nav class="bg-slate-900 text-white fixed top-0 left-0 w-full z-50 shadow-lg h-16 flex items-center justify-between px-6">
        <div class="flex items-center gap-3 select-none cursor-pointer" onclick="window.location.href='produtividade.html'">
            <div class="flex flex-col leading-tight">
                <span class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Controle de</span>
                <span class="text-xl font-extrabold tracking-tighter text-white">PRODUTIVIDADE</span>
            </div>
        </div>
        <div class="hidden md:flex items-center gap-1 h-full">
            ${createNavLink('Gestão', 'gestao.html')}
            ${createNavLink('Produtividade', 'produtividade.html')}
            ${createNavLink('Performance', 'performance.html')}
            ${createNavLink('Consolidado', 'consolidado.html')}
            ${createNavLink('Minha Área', 'minha_area.html')}
            ${createNavLink('Ferramentas', 'ferramentas.html')} 
        </div>
        <div class="flex items-center gap-4">
            <div class="text-right hidden sm:block">
                <span class="block text-sm font-bold text-white">${usuario ? usuario.nome : 'Utilizador'}</span>
                <span class="block text-xs text-slate-400">${usuario ? usuario.funcao : ''}</span>
            </div>
            <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm font-semibold border border-red-900/50 bg-red-900/10 px-3 py-1 rounded transition">Sair</button>
        </div>
    </nav>
    <div class="h-20"></div>`; // Espaçador

    // Insere no topo do corpo da página
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    console.log("Navbar renderizada com sucesso.");
}

// 3. Inicialização Segura
// Aguarda o HTML carregar completamente antes de tentar desenhar o menu
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNavbar);
} else {
    renderNavbar();
}