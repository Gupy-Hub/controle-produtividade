// Namespace global para menus
window.Menu = window.Menu || {};

Menu.Global = {
    renderizar: function() {
        let container = document.getElementById('global-menu');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-menu';
            document.body.prepend(container);
        }

        const user = JSON.parse(localStorage.getItem('usuario_logado') || '{}');
        const isGestao = ['GESTORA', 'AUDITORA'].includes((user.funcao || '').toUpperCase()) || user.perfil === 'admin' || user.id == 1;
        const currentPath = window.location.pathname;

        const links = [
            { nome: 'Minha Área', url: 'minha_area.html', icon: 'fas fa-home' },
            // ALTERADO DE 'Painel Produtividade' PARA 'Produtividade'
            { nome: 'Produtividade', url: 'produtividade.html', icon: 'fas fa-chart-line' },
            { nome: 'Ferramentas', url: 'ferramentas.html', icon: 'fas fa-toolbox' }
        ];

        if (isGestao) links.push({ nome: 'Gestão', url: 'gestao.html', icon: 'fas fa-cogs' });

        let html = `
        <nav class="bg-slate-900 text-slate-300 shadow-md fixed top-0 left-0 w-full z-[60] h-12">
            <div class="max-w-[1600px] mx-auto px-4 h-full flex items-center justify-between">
                <div class="flex items-center gap-6">
                    <div class="font-black text-white tracking-wider text-sm flex items-center gap-2">
                        <i class="fas fa-layer-group text-blue-500"></i> HUB
                    </div>
                    <div class="flex items-center gap-1">`;

        links.forEach(link => {
            const ativo = currentPath.includes(link.url);
            const classe = ativo ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white transition-colors';
            html += `<a href="${link.url}" class="px-3 py-1.5 rounded text-xs flex items-center gap-2 ${classe}"><i class="${link.icon}"></i> ${link.nome}</a>`;
        });

        html += `   </div>
                </div>
                <div class="flex items-center gap-4 text-xs">
                    <span class="hidden md:inline">Olá, <strong class="text-white">${user.nome || 'Visitante'}</strong></span>
                    <button onclick="Sistema.sair()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition"><i class="fas fa-sign-out-alt"></i> Sair</button>
                </div>
            </div>
        </nav>`;

        container.innerHTML = html;
        document.body.style.paddingTop = '0px'; 
    }
};

document.addEventListener('DOMContentLoaded', Menu.Global.renderizar);