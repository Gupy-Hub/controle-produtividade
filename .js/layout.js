// js/layout.js
// OBJETIVO: Desenhar a barra de navegação (Menu) automaticamente em todas as páginas.

function renderNavbar() {
    // 1. Verifica se o usuário está logado
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    
    // Se não estiver logado e não for a tela de login, manda voltar
    const path = window.location.pathname;
    if (!usuario && !path.includes('index.html')) {
        window.location.href = 'index.html';
        return;
    }

    // Se for a tela de login, não desenha menu
    if (path.includes('index.html')) return;

    // 2. Define o HTML do Menu usando classes do Tailwind
    // bg-slate-900 = Fundo escuro
    // fixed w-full = Fixo no topo e largura total
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
        </div>

        <div class="flex items-center gap-4">
            <div class="text-right hidden sm:block">
                <span class="block text-sm font-bold text-white">${usuario ? usuario.nome : 'Usuário'}</span>
                <span class="block text-xs text-slate-400">${usuario ? usuario.funcao : ''}</span>
            </div>
            <button onclick="logout()" class="text-red-400 hover:text-red-300 text-sm font-semibold border border-red-900/50 bg-red-900/10 px-3 py-1 rounded transition">
                Sair
            </button>
        </div>
    </nav>
    
    <div class="h-20"></div>
    `;

    // 3. Insere o menu no início do corpo da página
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
}

// Função auxiliar para criar links e marcar o ativo
function createNavLink(label, linkUrl) {
    const isActive = window.location.href.includes(linkUrl);
    // Classes: Se ativo, azul escuro. Se inativo, transparente (hover cinza)
    const activeClass = isActive ? "bg-blue-700 text-white shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white";
    
    return `
        <a href="${linkUrl}" class="${activeClass} px-4 py-2 rounded-lg text-sm font-medium transition duration-200">
            ${label}
        </a>
    `;
}

function logout() {
    localStorage.removeItem('usuario');
    window.location.href = 'index.html';
}

// Executa assim que o arquivo carrega
renderNavbar();