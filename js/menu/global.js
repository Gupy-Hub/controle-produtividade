window.MenuGlobal = {
    renderizar: function() {
        // 1. Lógica de Caminhos (Raiz vs Pasta Gestão)
        const path = window.location.pathname;
        const isInGestao = path.includes('/gestao/') || path.includes('\\gestao\\');
        const rootPath = isInGestao ? '../' : './';
        const isGestaoActive = isInGestao; 

        // Estilos
        const activeClass = "text-white font-bold border-b-4 border-blue-500";
        const inactiveClass = "text-slate-400 hover:text-white transition-colors";

        // 2. HTML da Barra Superior (Preta)
        const menuHtml = `
        <nav class="fixed top-0 left-0 w-full h-20 bg-slate-900 shadow-md z-50 flex items-center justify-between px-8">
            
            <div class="flex items-center gap-3 cursor-pointer group" onclick="window.location.href='${rootPath}index.html'">
                <div class="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition">
                    <i class="fas fa-chart-line text-xl"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-white font-bold text-lg tracking-wide leading-tight">PERFORMANCE</span>
                    <span class="text-blue-500 text-[10px] font-bold uppercase tracking-widest leading-none">PRO SYSTEM</span>
                </div>
            </div>

            <div class="flex items-center h-full gap-8">
                <a href="${rootPath}index.html" class="h-full flex items-center gap-2 px-2 ${!isGestaoActive ? activeClass : inactiveClass}">
                    <i class="fas fa-home"></i> Dashboard
                </a>
                
                <a href="${rootPath}gestao/usuarios.html" class="h-full flex items-center gap-2 px-2 ${isGestaoActive ? activeClass : inactiveClass}">
                    <i class="fas fa-users-cog"></i> Gestão
                </a>

                <a href="#" class="h-full flex items-center gap-2 px-2 ${inactiveClass}">
                    <i class="fas fa-cog"></i> Configurações
                </a>
            </div>

            <div class="flex items-center gap-4">
                <div class="text-right hidden md:block">
                    <p class="text-white text-sm font-bold">Gestora</p>
                    <p class="text-slate-500 text-xs">Admin</p>
                </div>
                <button class="bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 p-2.5 rounded-lg transition" title="Sair">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </nav>

        <div id="submenu-container" class="fixed top-20 left-0 w-full z-40 bg-white border-b border-slate-200 hidden">
            </div>
        `;

        // 3. Injeta na página
        let container = document.getElementById('menu-global-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'menu-global-container';
            document.body.prepend(container);
        }
        container.innerHTML = menuHtml;

        // 4. Ajuste do Submenu
        if (isGestaoActive) {
            document.getElementById('submenu-container').classList.remove('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MenuGlobal.renderizar();
});