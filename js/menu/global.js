/* ARQUIVO: js/menu/global.js
   DESCRIÇÃO: Menu Dark Mode (Estilo Original) com Correção para Super Admin (ID 1000)
*/

window.Menu = window.Menu || {};

Menu.Global = {
    renderizar: function() {
        let container = document.getElementById('global-menu');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-menu';
            document.body.prepend(container);
        }

        let user = {};
        try {
            const sessao = localStorage.getItem('usuario_logado');
            if (sessao) user = JSON.parse(sessao);
        } catch (e) { console.error("Erro ao ler sessão:", e); }

        // --- CORREÇÃO DE PERMISSÕES ---
        // Normaliza para garantir que ID 1000, ID 1 e ADMIN (maiúsculo/minúsculo) funcionem
        const perfil = (user.perfil || '').toUpperCase();
        const funcao = (user.funcao || '').toUpperCase();
        const id = parseInt(user.id);

        const isSuperAdmin = id === 1 || id === 1000 || perfil === 'ADMIN';
        const isGestor = funcao.includes('GESTOR') || funcao.includes('LIDER');
        const isAuditor = funcao.includes('AUDITOR');

        // Define quem pode ver o menu de gestão/produtividade
        const temAcessoGestao = isSuperAdmin || isGestor || isAuditor;

        const currentPath = window.location.pathname;

        // Links do Menu
        const links = [];
        
        // Só adiciona Gestão e Produtividade se tiver permissão
        if (temAcessoGestao) {
            links.push({ nome: 'Gestão', url: 'gestao.html', icon: 'fas fa-cogs' });
            links.push({ nome: 'Produtividade', url: 'produtividade.html', icon: 'fas fa-chart-line' });
        }
        
        // Links comuns a todos
        links.push({ nome: 'Minha Área', url: 'minha_area.html', icon: 'fas fa-home' });
        links.push({ nome: 'Biblioteca', url: 'ferramentas.html', icon: 'fas fa-book' });

        // --- HTML DO MENU (VISUAL DARK / FINO) ---
        let html = `
        <nav class="bg-slate-900 text-slate-300 shadow-md fixed top-0 left-0 w-full z-[60] h-12">
            <div class="max-w-[1600px] mx-auto px-4 h-full flex items-center justify-between">
                <div class="flex items-center gap-6">
                    
                    <a href="index.html" class="flex items-center">
                        <img src="img/logo.png" alt="Gupy" class="h-8 w-auto object-contain brightness-0 invert opacity-90 hover:opacity-100 transition">
                    </a>

                    <div class="flex items-center gap-1">`;

        links.forEach(link => {
            // Verifica se a página atual corresponde ao link para destacar
            const ativo = currentPath.includes(link.url);
            // Estilo do botão: Escuro quando inativo, Claro/Branco quando ativo
            const classe = ativo 
                ? 'bg-slate-700 text-white font-bold shadow-sm' 
                : 'hover:bg-slate-800 hover:text-white transition-colors';
            
            html += `<a href="${link.url}" class="px-3 py-1.5 rounded text-xs flex items-center gap-2 ${classe}"><i class="${link.icon}"></i> ${link.nome}</a>`;
        });

        html += `   </div>
                </div>
                
                <div class="flex items-center gap-4 text-xs">
                    <span class="hidden md:inline">Olá, <strong class="text-white">${user.nome ? user.nome.split(' ')[0] : 'Visitante'}</strong></span>
                    <button onclick="Sistema.limparSessao()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition shadow-sm border border-red-800"><i class="fas fa-sign-out-alt"></i> Sair</button>
                </div>
            </div>
        </nav>`;

        container.innerHTML = html;
        // Ajusta o padding do body para o menu não cobrir o conteúdo (48px = h-12)
        document.body.style.paddingTop = '48px'; 
    }
};

document.addEventListener('DOMContentLoaded', Menu.Global.renderizar);