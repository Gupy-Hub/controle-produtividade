const MenuGlobal = {
    // Cache de seletores para performance
    state: {
        containerId: 'global-menu',
        user: null
    },

    init: function() {
        this.loadUser();
        this.render();
        this.adjustLayout();
    },

    loadUser: function() {
        try {
            const sessao = localStorage.getItem('usuario_logado');
            this.state.user = sessao ? JSON.parse(sessao) : {};
        } catch (e) {
            console.error("Erro ao ler sessão do usuário", e);
            this.state.user = {};
        }
    },

    isGestao: function() {
        const user = this.state.user;
        const rolesGestao = ['GESTORA', 'AUDITORA', 'ADMIN'];
        const userRole = (user.funcao || '').toUpperCase();
        
        // Verificação centralizada de permissão
        return rolesGestao.includes(userRole) || user.perfil === 'admin' || user.id == 1;
    },

    getLinks: function() {
        const links = [
            { nome: 'Minha Área', url: 'minha_area.html', icon: 'fas fa-home' },
            { nome: 'Painel Produtividade', url: 'produtividade.html', icon: 'fas fa-chart-line' },
            { nome: 'Ferramentas', url: 'ferramentas.html', icon: 'fas fa-toolbox' }
        ];

        if (this.isGestao()) {
            // CORREÇÃO DO ERRO 404 AQUI:
            // Ajustamos o caminho relativo. Se estivermos dentro de uma subpasta (ex: gestao/usuarios.html),
            // precisamos garantir que o link funcione ou usar caminhos absolutos (recomendado).
            const basePath = window.location.pathname.includes('/gestao/') ? '' : 'gestao/';
            
            links.push({ 
                nome: 'Gestão', 
                // Aponta para o arquivo que realmente existe
                url: `${basePath}usuarios.html`, 
                icon: 'fas fa-cogs' 
            });
        }
        return links;
    },

    render: function() {
        let container = document.getElementById(this.state.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.state.containerId;
            document.body.prepend(container);
        }

        const links = this.getLinks();
        // Normaliza o path para comparação (remove barra inicial se houver)
        const currentPath = window.location.pathname.replace(/^\//, '');

        const linksHtml = links.map(link => {
            // Verifica se a URL do link está contida no path atual para marcar ativo
            // Ex: link 'gestao/' deve ficar ativo em 'gestao/usuarios.html'
            const isActive = currentPath.includes(link.url.replace('gestao/', '')); 
            
            const classe = isActive
                ? 'bg-slate-800 text-white font-bold'
                : 'hover:bg-slate-800 hover:text-white transition-colors';

            // Ajuste de caminho para navegação entre pastas
            // Se estou em /gestao/usuarios.html e clico em "Minha Área" (que está na raiz)
            let finalUrl = link.url;
            if (window.location.pathname.includes('/gestao/') && !link.url.includes('gestao/')) {
                finalUrl = '../' + link.url;
            } else if (!window.location.pathname.includes('/gestao/') && link.url.includes('usuarios.html')) {
                 finalUrl = 'gestao/usuarios.html'; // Garante caminho da raiz para gestão
            }

            return `
                <a href="${finalUrl}" class="px-3 py-1.5 rounded text-xs flex items-center gap-2 ${classe}">
                    <i class="${link.icon}"></i> ${link.nome}
                </a>
            `;
        }).join('');

        container.innerHTML = `
        <nav class="bg-slate-900 text-slate-300 shadow-md fixed top-0 left-0 w-full z-[60] h-12">
            <div class="max-w-[1600px] mx-auto px-4 h-full flex items-center justify-between">
                <div class="flex items-center gap-6">
                    <div class="font-black text-white tracking-wider text-sm flex items-center gap-2">
                        <i class="fas fa-layer-group text-blue-500"></i> HUB
                    </div>
                    <div class="flex items-center gap-1">
                        ${linksHtml}
                    </div>
                </div>
                <div class="flex items-center gap-4 text-xs">
                    <span class="hidden md:inline">Olá, <strong class="text-white">${this.state.user.nome || 'Visitante'}</strong></span>
                    <button onclick="Sistema.sair()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition">
                        <i class="fas fa-sign-out-alt"></i> Sair
                    </button>
                </div>
            </div>
        </nav>`;
    },

    adjustLayout: function() {
        // Remove padding hardcoded e adiciona classe se necessário, 
        // mas aqui mantemos sua lógica original de segurança de layout
        const subHeader = document.querySelector('.fixed.top-0:not(nav)');
        if (subHeader) {
            subHeader.style.top = '3rem';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => MenuGlobal.init());