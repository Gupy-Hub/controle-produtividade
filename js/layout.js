// js/layout.js

// 1. Função de Logout Global
window.logout = function() {
    if(confirm("Tem a certeza que deseja sair?")) {
        localStorage.removeItem('usuario');
        window.location.href = 'index.html';
    }
}

// 2. Controle do Menu Lateral
window.toggleMenu = function() {
    const menu = document.getElementById('mobile-menu-overlay');
    if (menu) {
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('mobile-menu-content').classList.remove('translate-x-full');
            }, 10);
        } else {
            document.getElementById('mobile-menu-content').classList.add('translate-x-full');
            setTimeout(() => {
                menu.classList.add('hidden');
            }, 300);
        }
    }
}

// 3. Função Principal de Renderização
function renderNavbar() {
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('index.html') || path.endsWith('/');
    const usuarioLogado = JSON.parse(localStorage.getItem('usuario'));

    if (!usuarioLogado && !isLoginPage) {
        window.location.href = 'index.html';
        return;
    }

    if (isLoginPage) return;

    // Helper para links
    const createLink = (nome, url) => {
        const isActive = window.location.href.includes(url);
        const classe = isActive 
            ? "bg-blue-600 text-white shadow-sm border-l-4 border-blue-800" 
            : "text-slate-600 hover:bg-slate-100 border-l-4 border-transparent";
        return `<a href="${url}" class="${classe} block px-6 py-3 text-base font-bold transition duration-200">${nome}</a>`;
    };

    const navbarHTML = `
    <nav class="bg-slate-900 text-white fixed top-0 left-0 w-full z-40 shadow-md h-14 flex items-center justify-between px-4">
        
        <div class="flex items-center gap-3 select-none cursor-pointer" onclick="window.location.href='produtividade.html'">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50">
                <i class="fas fa-chart-line"></i>
            </div>
            <div class="flex flex-col leading-none hidden sm:block">
                <span class="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Controle de</span>
                <span class="text-lg font-extrabold tracking-tighter text-white">PRODUTIVIDADE</span>
            </div>
        </div>

        <div class="flex items-center gap-4">
            <div class="text-right hidden sm:block">
                <span class="block text-xs font-bold text-white">${usuarioLogado ? usuarioLogado.nome : 'Utilizador'}</span>
            </div>
            
            <button onclick="toggleMenu()" class="text-white hover:bg-slate-800 p-2 rounded-lg transition focus:outline-none">
                <i class="fas fa-bars text-xl"></i>
            </button>
        </div>
    </nav>

    <div id="mobile-menu-overlay" class="fixed inset-0 z-50 hidden">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onclick="toggleMenu()"></div>
        
        <div id="mobile-menu-content" class="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-out flex flex-col">
            
            <div class="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                    <p class="text-sm font-bold text-slate-400">Olá,</p>
                    <p class="text-xl font-black">${usuarioLogado ? usuarioLogado.nome.split(' ')[0] : 'Visitante'}</p>
                </div>
                <button onclick="toggleMenu()" class="text-slate-400 hover:text-white transition">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>

            <div class="flex-1 py-4 space-y-1 overflow-y-auto">
                <p class="px-6 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">Navegação</p>
                ${createLink('Gestão', 'gestao.html')}
                ${createLink('Produtividade', 'produtividade.html')}
                ${createLink('Minha Área', 'minha_area.html')}
                ${createLink('Biblioteca', 'ferramentas.html')}
            </div>

            <div class="p-6 border-t border-slate-100 bg-slate-50">
                <button onclick="logout()" class="w-full flex items-center justify-center gap-2 text-red-600 font-bold hover:bg-red-50 py-3 rounded-lg transition border border-red-200">
                    <i class="fas fa-sign-out-alt"></i> Sair do Sistema
                </button>
            </div>
        </div>
    </div>

    <div class="h-14"></div>
    `;

    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
}

renderNavbar();