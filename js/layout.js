const Layout = {
    renderizar: function() {
        // Não renderiza layout na tela de login para evitar sobreposição ou erros
        if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
            return;
        }

        const usuario = JSON.parse(localStorage.getItem('usuario_logado'));
        
        // Redirecionamento de segurança caso não haja usuário (Engenharia de Dados/Segurança)
        if (!usuario) {
            // Opcional: window.location.href = 'index.html'; 
            return; 
        }

        const primeiroNome = usuario.nome.split(' ')[0];
        // Normalização das permissões (Best Practice: centralizar regras de acesso)
        const isGestao = ['Gestora', 'Auditora', 'Admin', 'ADMIN', 'GESTORA'].includes(usuario.funcao) || usuario.perfil === 'admin';

        // HTML do Menu Superior Otimizado
        const navHtml = `
        <nav class="bg-slate-900 text-white shadow-lg mb-0 z-50 relative">
            <div class="max-w-[1400px] mx-auto px-4">
                <div class="flex items-center justify-between h-16">
                    
                    <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.href='minha_area.html'">
                        <div class="bg-blue-600 w-8 h-8 rounded flex items-center justify-center font-bold shadow-blue-500/50 shadow-lg">P</div>
                        <span class="font-bold text-lg tracking-tight">Performance Pro</span>
                    </div>

                    <div class="hidden md:flex items-center space-x-1">
                        <a href="minha_area.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-all duration-200 ${this.isActive('minha_area')}">
                            <i class="fas fa-user mr-2"></i>Minha Área
                        </a>
                        
                        <a href="produtividade.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-all duration-200 ${this.isActive('produtividade')}">
                            <i class="fas fa-chart-line mr-2"></i>Painel Produtividade
                        </a>

                        <a href="ferramentas.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-all duration-200 ${this.isActive('ferramentas')}">
                            <i class="fas fa-tools mr-2"></i>Ferramentas
                        </a>

                        ${isGestao ? `
                        <a href="gestao/usuarios.html" class="nav-link px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-800 transition-all duration-200 ${this.isActive('gestao')}">
                            <i class="fas fa-cogs mr-2"></i>Gestão
                        </a>` : ''}
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="text-right hidden sm:block">
                            <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Olá,</p>
                            <p class="text-sm font-bold text-white leading-none">${primeiroNome}</p>
                        </div>
                        <button onclick="Sistema.sair()" class="bg-slate-800 hover:bg-red-600 text-white p-2 rounded-full transition-all shadow-sm border border-slate-700 hover:border-red-500 hover:shadow-red-500/30 group" title="Sair do Sistema">
                            <i class="fas fa-power-off text-xs group-hover:scale-110 transition-transform"></i>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
        `;

        // Injeta no início do body (Performance: garante que o menu seja o primeiro elemento visual)
        document.body.insertAdjacentHTML('afterbegin', navHtml);
    },

    isActive: function(pagina) {
        // Lógica de Active State otimizada para subpastas
        return window.location.pathname.includes(pagina) ? 'bg-blue-700 text-white shadow-inner pointer-events-none' : 'text-slate-300';
    }
};

// Renderiza assim que o DOM estiver pronto (Melhor que window.onload para performance)
document.addEventListener('DOMContentLoaded', () => Layout.renderizar());