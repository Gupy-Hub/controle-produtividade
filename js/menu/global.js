/* ARQUIVO: js/menu/global.js
   DESCRIÇÃO: Menu Superior Unificado (Com Correção de Permissões para Super Admin)
*/

const MenuGlobal = {
    init: function() {
        // Aguarda carregar sistema/sessão
        const check = setInterval(() => {
            if (typeof Sistema !== 'undefined') {
                clearInterval(check);
                this.renderizar();
            }
        }, 100);
    },

    renderizar: function() {
        const sessao = localStorage.getItem('usuario_logado');
        let usuario = null;
        if (sessao) usuario = JSON.parse(sessao);

        const path = window.location.pathname;
        const page = path.split("/").pop();

        // LOGO
        const logoHtml = `
            <a href="index.html" class="flex items-center gap-2 group">
                <div class="bg-blue-600 text-white p-2 rounded-lg group-hover:bg-blue-700 transition shadow-sm">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div class="leading-tight">
                    <span class="block font-bold text-slate-700 text-sm">GupyMesa</span>
                    <span class="block text-[10px] text-slate-400 font-mono">Performance Pro</span>
                </div>
            </a>`;

        // LINKS (Lógica de Permissão Corrigida)
        let linksHtml = '';
        
        if (usuario) {
            // Normalização de Dados de Acesso
            const perfil = (usuario.perfil || '').toLowerCase().trim();
            const funcao = (usuario.funcao || '').toLowerCase().trim();
            const id = parseInt(usuario.id);

            // Definição de Permissões
            // ID 1 e 1000 são Super Admins (acesso irrestrito)
            const isSuperAdmin = id === 1 || id === 1000 || perfil === 'admin' || perfil === 'administrador';
            const isGestor = funcao.includes('gestor') || funcao.includes('lider');
            const isAuditor = funcao.includes('auditor');

            // 1. Minha Área (Todos têm)
            const activeMa = page.includes('minha_area') ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50';
            linksHtml += `
                <a href="minha_area.html" class="${activeMa} px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                    <i class="fas fa-user-circle"></i> Minha Área
                </a>`;

            // 2. Biblioteca (Todos têm)
            const activeBib = page.includes('ferramentas') ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50';
            linksHtml += `
                <a href="ferramentas.html" class="${activeBib} px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                    <i class="fas fa-book"></i> Biblioteca
                </a>`;

            // 3. Gestão (Apenas Super Admin, Gestores)
            if (isSuperAdmin || isGestor) {
                const activeGest = page.includes('gestao') ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50';
                linksHtml += `
                    <a href="gestao.html" class="${activeGest} px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                        <i class="fas fa-cogs"></i> Gestão
                    </a>`;
            }

             // 4. Produtividade (Super Admin, Gestores e Auditores)
             if (isSuperAdmin || isGestor || isAuditor) {
                const activeProd = page.includes('produtividade') ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50';
                linksHtml += `
                    <a href="produtividade.html" class="${activeProd} px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                        <i class="fas fa-chart-pie"></i> Produtividade
                    </a>`;
            }
        }

        // USER DROPDOWN
        let userHtml = '';
        if (usuario) {
            userHtml = `
            <div class="flex items-center gap-4">
                <div class="text-right hidden sm:block">
                    <div class="text-xs font-bold text-slate-700" id="usuario-nome-top">${usuario.nome}</div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-wide">${usuario.funcao || 'Colaborador'}</div>
                </div>
                <button onclick="Sistema.limparSessao()" class="text-slate-400 hover:text-red-500 transition" title="Sair">
                    <i class="fas fa-sign-out-alt text-lg"></i>
                </button>
            </div>`;
        } else {
            userHtml = `<a href="index.html" class="text-sm font-bold text-blue-600 hover:underline">Entrar</a>`;
        }

        // RENDERIZAÇÃO FINAL
        const html = `
        <div class="bg-white/95 backdrop-blur-sm border-b border-slate-200 fixed top-0 left-0 w-full z-50 h-14 flex items-center shadow-sm transition-all">
            <div class="max-w-[1600px] mx-auto px-4 w-full flex items-center justify-between">
                ${logoHtml}
                <nav class="hidden md:flex items-center gap-1">
                    ${linksHtml}
                </nav>
                ${userHtml}
            </div>
        </div>`;

        const container = document.getElementById('global-menu');
        if (container) container.innerHTML = html;
    }
};

document.addEventListener('DOMContentLoaded', () => MenuGlobal.init());