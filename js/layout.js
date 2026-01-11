const Layout = {
    renderizar: function() {
        // Não renderiza layout na tela de login
        if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
            return;
        }

        const usuario = JSON.parse(localStorage.getItem('usuario_logado'));
        if (!usuario) return; // Sistema.js vai redirecionar

        const primeiroNome = usuario.nome.split(' ')[0];
        const isGestao = ['Gestora', 'Auditora', 'Admin'].includes(usuario.funcao);

        // HTML do Menu Superior (Estilo atualizado)
        const navHtml = `
        <nav class="bg-slate-900 text-white shadow-lg mb-0">
            <div class="max-w-[1400px] mx-auto px-4">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center gap-3">
                        <div class="bg-blue-600 w-8 h-8 rounded flex items-center justify-center font-bold">P</div>
                        <span class="font-bold text-lg tracking-tight">Performance Pro</span>
                    </div>

                    <div class="hidden md:flex items-center space-x-1">
                        <a href="minha_area.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition ${this.isActive('minha_area')}">
                            <i class="fas fa-user mr-2"></i>Minha Área
                        </a>
                        
                        <a href="produtividade.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition ${this.isActive('produtividade')}">
                            <i class="fas fa-chart-line mr-2"></i>Painel Produtividade
                        </a>

                        <a href="ferramentas.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition ${this.isActive('ferramentas')}">
                            <i class="fas fa-tools mr-2"></i>Ferramentas
                        </a>

                        ${isGestao ? `
                        <a href="gestao.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition ${this.isActive('gestao')}">
                            <i class="fas fa-cogs mr-2"></i>Gestão
                        </a>` : ''}
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="text-right hidden sm:block">
                            <p class="text-xs text-slate-400 uppercase font-bold">Olá,</p>
                            <p class="text-sm font-bold text-white leading-none">${primeiroNome}</p>
                        </div>
                        <button onclick="Sistema.sair()" class="bg-slate-800 hover:bg-red-600 text-white p-2 rounded-full transition shadow-sm border border-slate-700" title="Sair">
                            <i class="fas fa-power-off text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
        `;

        // Injeta no início do body
        document.body.insertAdjacentHTML('afterbegin', navHtml);
    },

    isActive: function(pagina) {
        return window.location.pathname.includes(pagina) ? 'bg-blue-700 text-white shadow-inner' : 'text-slate-300';
    }
};

// Renderiza assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => Layout.renderizar());