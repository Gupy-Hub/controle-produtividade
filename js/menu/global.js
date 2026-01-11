// Namespace global para menus
window.Menu = window.Menu || {};

Menu.Global = {
    /**
     * Inicializa e renderiza o menu global
     */
    renderizar: function() {
        // 1. Singleton do Container
        let container = document.getElementById('global-menu');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-menu';
            document.body.prepend(container);
        }

        // 2. Recuperação Segura de Sessão
        let user = {};
        try {
            const sessao = localStorage.getItem('usuario_logado');
            if (sessao) user = JSON.parse(sessao);
        } catch (e) {
            console.error('Erro ao processar sessão do utilizador:', e);
        }

        // 3. Definição de Permissões (Regras de Negócio)
        const funcaoUser = (user.funcao || '').toUpperCase();
        const isGestao = ['GESTORA', 'AUDITORA', 'ADMIN'].includes(funcaoUser) || user.perfil === 'admin' || user.id == 1;

        // 4. Lógica de Caminhos Relativos (Path Resolution)
        // Deteta se estamos numa subpasta (ex: /gestao/) para ajustar os links
        const pathAtual = window.location.pathname;
        const isInSubfolder = pathAtual.includes('/gestao/') || pathAtual.split('/').length > 2;
        const rootPrefix = isInSubfolder ? '../' : '';

        // 5. Configuração dos Links
        const links = [
            { 
                nome: 'Minha Área', 
                url: rootPrefix + 'minha_area.html', 
                icon: 'fas fa-home' 
            },
            { 
                nome: 'Painel Produtividade', 
                url: rootPrefix + 'produtividade.html', 
                icon: 'fas fa-chart-line' 
            },
            { 
                nome: 'Ferramentas', 
                url: rootPrefix + 'ferramentas.html', 
                icon: 'fas fa-toolbox' 
            }
        ];

        // Adiciona link de Gestão apenas se autorizado
        if (isGestao) {
            // Se já estiver na pasta gestão, navega localmente, senão entra na pasta
            const gestaoUrl = isInSubfolder ? 'usuarios.html' : 'gestao/usuarios.html';
            
            links.push({ 
                nome: 'Gestão', 
                url: gestaoUrl, 
                icon: 'fas fa-cogs' 
            });
        }

        // 6. Construção do HTML (Template String)
        let html = `
        <nav class="bg-slate-900 text-slate-300 shadow-md fixed top-0 left-0 w-full z-[60] h-12">
            <div class="max-w-[1600px] mx-auto px-4 h-full flex items-center justify-between">
                
                <div class="flex items-center gap-6">
                    <div class="font-black text-white tracking-wider text-sm flex items-center gap-2 cursor-default">
                        <i class="fas fa-layer-group text-blue-500"></i> HUB
                    </div>
                    
                    <div class="flex items-center gap-1">`;

        links.forEach(link => {
            // Lógica para estado "Ativo" insensível a prefixos (../)
            // Ex: se estou em 'produtividade.html', o link com essa string fica ativo
            const cleanUrl = link.url.replace('../', '');
            const cleanPath = pathAtual.split('/').pop(); // Pega apenas o nome do ficheiro atual
            
            const isAtivo = (cleanPath === cleanUrl) || (link.nome === 'Gestão' && pathAtual.includes('/gestao/'));
            
            const classe = isAtivo 
                ? 'bg-slate-800 text-white font-bold' 
                : 'hover:bg-slate-800 hover:text-white transition-colors';
            
            html += `
                <a href="${link.url}" class="px-3 py-1.5 rounded text-xs flex items-center gap-2 ${classe}">
                    <i class="${link.icon}"></i> ${link.nome}
                </a>`;
        });

        html += `   </div>
                </div>

                <div class="flex items-center gap-4 text-xs">
                    <span class="hidden md:inline">Olá, <strong class="text-white">${user.nome || 'Visitante'}</strong></span>
                    <button onclick="Sistema.sair()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition flex items-center gap-2">
                        <i class="fas fa-sign-out-alt"></i> Sair
                    </button>
                </div>
            </div>
        </nav>`;

        // 7. Renderização e Ajustes de Layout
        container.innerHTML = html;
        
        // Garante que o conteúdo não fique escondido atrás do menu fixo
        document.body.style.paddingTop = '0px'; 
    }
};

// Inicialização automática ao carregar o DOM
document.addEventListener('DOMContentLoaded', Menu.Global.renderizar);