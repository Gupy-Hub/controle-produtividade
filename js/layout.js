// js/layout.js

// 1. Função de Logout Global
window.logout = function() {
    if(confirm("Tem a certeza que deseja sair?")) {
        localStorage.removeItem('usuario');
        window.location.href = 'index.html';
    }
}

// 2. Função Principal de Renderização
function renderNavbar() {
    // --- VERIFICAÇÃO DE SEGURANÇA (FRONTEND) ---
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('index.html') || path.endsWith('/');
    const usuarioLogado = JSON.parse(localStorage.getItem('usuario'));

    if (!usuarioLogado && !isLoginPage) {
        window.location.href = 'index.html';
        return;
    }

    if (isLoginPage) return;

    // --- DESENHAR O MENU ---
    const createLink = (nome, url) => {
        const isActive = window.location.href.includes(url);
        const classe = isActive 
            ? "bg-blue-700 text-white shadow-md" 
            : "text-slate-300 hover:bg-slate-800 hover:text-white";
        return `<a href="${url}" class="${classe} px-4 py-2 rounded-lg text-sm font-medium transition duration-200">${nome}</a>`;
    };

    const navbarHTML = `
    <nav class="bg-slate-900 text-white fixed top-0 left-0 w-full z-50 shadow-lg h-16 flex items-center justify-between px-6">
        <div class="flex items-center gap-3 select-none cursor-pointer" onclick="window.location.href='produtividade.html'">
            <div class="flex flex-col leading-tight">
                <span class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Controle de</span>
                <span class="text-xl font-extrabold tracking-tighter text-white">PRODUTIVIDADE</span>
            </div>
        </div>

        <div class="hidden md:flex items-center gap-1 h-full">
            ${createLink('Gestão', 'gestao.html')}
            ${createLink('Produtividade', 'produtividade.html')}
            ${createLink('Minha Área', 'minha_area.html')}
            ${createLink('Biblioteca', 'ferramentas.html')} 
        </div>

        <div class="flex items-center gap-4">
            <div class="text-right hidden sm:block">
                <span class="block text-sm font-bold text-white">${usuarioLogado ? usuarioLogado.nome : 'Utilizador'}</span>
                <span class="block text-xs text-slate-400">${usuarioLogado ? usuarioLogado.funcao : ''}</span>
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

renderNavbar();