const MenuGlobal = {
    init: function() {
        // Aguarda o DOM estar pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.renderizar());
        } else {
            this.renderizar();
        }
    },

    renderizar: function() {
        const elMenu = document.getElementById('global-menu');
        if (!elMenu) return;

        // Recupera dados do usuário para mostrar o nome
        const usuario = Sistema.lerSessao();
        if (!usuario) {
            // Se não tem sessão, manda pro login
            window.location.href = 'index.html';
            return;
        }

        const nome = usuario.nome.split(' ')[0];
        const perfil = usuario.perfil; // 'admin', 'gestor', 'user'

        // Define se mostra o link de Gestão
        const linkGestao = (perfil === 'admin' || perfil === 'gestor') 
            ? `<a href="gestao.html" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition rounded-lg mb-1 ${window.location.href.includes('gestao') ? 'bg-slate-800 text-white font-bold' : ''}">
                 <i class="fas fa-chart-pie w-5 text-center"></i> 
                 <span class="font-medium">Gestão</span>
               </a>`
            : '';

        // HTML do Menu Lateral (Estilo Dark/Slate)
        const html = `
            <div class="fixed top-0 left-0 h-full w-64 bg-slate-900 text-white flex flex-col z-50 transition-transform transform -translate-x-full md:translate-x-0 shadow-2xl" id="sidebar-menu">
                
                <div class="h-20 flex items-center px-6 border-b border-slate-800 bg-slate-950">
                    <i class="fas fa-bolt text-indigo-500 text-2xl mr-3"></i>
                    <span class="font-bold text-lg tracking-wide">Performance Pro</span>
                </div>

                <div class="p-6 border-b border-slate-800 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm shadow-lg">
                        ${nome.charAt(0)}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white">${nome}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">${perfil === 'admin' ? 'Administrador' : perfil}</div>
                    </div>
                </div>

                <nav class="flex-1 p-4 overflow-y-auto">
                    <div class="text-[10px] uppercase text-slate-500 font-bold mb-2 px-4 mt-2">Principal</div>
                    
                    <a href="minha_area.html" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition rounded-lg mb-1 ${window.location.href.includes('minha_area') ? 'bg-slate-800 text-white font-bold' : ''}">
                        <i class="fas fa-user-circle w-5 text-center"></i>
                        <span class="font-medium">Minha Área</span>
                    </a>

                    ${linkGestao}

                    <div class="text-[10px] uppercase text-slate-500 font-bold mb-2 px-4 mt-6">Ferramentas</div>
                    
                    <a href="#" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition rounded-lg mb-1">
                        <i class="fas fa-calculator w-5 text-center"></i>
                        <span class="font-medium">Calculadora</span>
                    </a>
                </nav>

                <div class="p-4 border-t border-slate-800 bg-slate-950">
                    <button onclick="Sistema.limparSessao()" class="w-full flex items-center justify-center gap-2 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white py-2.5 rounded-lg transition font-bold text-sm group">
                        <i class="fas fa-sign-out-alt group-hover:rotate-180 transition-transform"></i>
                        Sair do Sistema
                    </button>
                </div>
            </div>

            <div id="sidebar-overlay" onclick="MenuGlobal.toggleMobile()" class="fixed inset-0 bg-black/50 z-40 hidden md:hidden glass-effect"></div>

            <button onclick="MenuGlobal.toggleMobile()" class="fixed top-4 left-4 z-50 md:hidden bg-slate-900 text-white p-2 rounded-lg shadow-lg">
                <i class="fas fa-bars"></i>
            </button>
        `;

        elMenu.innerHTML = html;
        
        // Ajuste de Layout: Adiciona margem à esquerda no corpo para não ficar embaixo do menu
        document.body.classList.add('md:pl-64');
    },

    toggleMobile: function() {
        const sidebar = document.getElementById('sidebar-menu');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        }
    }
};

// Inicializa
MenuGlobal.init();