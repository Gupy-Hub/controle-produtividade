// js/layout.js

// NÃO declaramos mais SB_URL ou _supabase aqui. 
// Eles já existem globalmente porque carregamos o config.js antes deste arquivo no HTML.

function renderNavbar() {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    
    const path = window.location.pathname;
    
    // Se não estiver logado e não for a tela de login, manda para o login
    if (!usuario && !path.includes('index.html')) {
        window.location.href = 'index.html';
        return;
    }

    // Se for a tela de login, não desenha a navbar
    if (path.includes('index.html')) return;

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

    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
}

function createNavLink(label, linkUrl) {
    const isActive = window.location.href.includes(linkUrl);
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

renderNavbar();