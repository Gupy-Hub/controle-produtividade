window.MenuGlobal = {
    renderizar: function() {
        // 1. Detecta onde estamos (Raiz ou Subpasta)
        const path = window.location.pathname;
        const isInGestao = path.includes('/gestao/');
        
        // Define o caminho para voltar à raiz
        // Se estiver dentro de "gestao/", usa "../". Se estiver na raiz, usa "./"
        const rootPath = isInGestao ? '../' : './';

        // Verifica se estamos no módulo de gestão para deixar o botão ativo
        const isGestaoActive = isInGestao; 

        // Estilos
        const activeClass = "bg-slate-800 text-white border-l-4 border-blue-500 shadow-lg";
        const inactiveClass = "text-slate-400 hover:bg-slate-800 hover:text-white transition-all";

        // 2. Monta o HTML do Menu
        const menuHtml = `
        <aside class="fixed left-0 top-0 h-full w-20 md:w-64 bg-slate-900 z-50 flex flex-col transition-all duration-300 shadow-2xl">
            <div class="h-20 flex items-center justify-center border-b border-slate-800">
                <div class="font-bold text-white text-xl tracking-wider flex items-center gap-2 cursor-pointer" onclick="window.location.href='${rootPath}index.html'">
                    <i class="fas fa-chart-line text-blue-500"></i>
                    <span class="hidden md:inline">PERFORMANCE</span>
                </div>
            </div>

            <nav class="flex-1 py-6 flex flex-col gap-2 px-2 md:px-4 overflow-y-auto custom-scroll">
                
                <a href="${rootPath}index.html" class="flex items-center gap-4 px-4 py-3 rounded-lg font-medium ${!isGestaoActive ? activeClass : inactiveClass}">
                    <i class="fas fa-home w-5 text-center text-lg"></i>
                    <span class="hidden md:inline">Dashboard</span>
                </a>

                <a href="${rootPath}gestao/usuarios.html" class="flex items-center gap-4 px-4 py-3 rounded-lg font-medium ${isGestaoActive ? activeClass : inactiveClass}">
                    <i class="fas fa-users-cog w-5 text-center text-lg"></i>
                    <span class="hidden md:inline">Gestão</span>
                </a>

                <div class="my-2 border-t border-slate-800 mx-2"></div>

                <a href="#" class="flex items-center gap-4 px-4 py-3 rounded-lg font-medium ${inactiveClass}">
                    <i class="fas fa-cog w-5 text-center text-lg"></i>
                    <span class="hidden md:inline">Configurações</span>
                </a>
            </nav>

            <div class="p-4 border-t border-slate-800">
                <button class="flex items-center justify-center md:justify-start gap-3 text-slate-400 hover:text-white w-full transition p-2 rounded hover:bg-slate-800">
                    <i class="fas fa-sign-out-alt"></i>
                    <span class="hidden md:inline">Sair</span>
                </button>
            </div>
        </aside>

        <aside id="sidebar-menu-content" class="fixed left-20 md:left-64 top-0 h-full w-64 bg-white border-r border-slate-200 z-40 hidden lg:hidden pt-24 animate-fade overflow-y-auto">
            </aside>
        `;

        // 3. Injeta na página
        let container = document.getElementById('menu-global-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'menu-global-container';
            document.body.prepend(container);
        }
        container.innerHTML = menuHtml;

        // 4. Ajustes de Layout
        document.body.classList.add('pl-20', 'md:pl-64');

        // Se estiver na Gestão, mostramos o submenu lateral branco
        if (isGestaoActive) {
            const submenu = document.getElementById('sidebar-menu-content');
            if (submenu) {
                submenu.classList.remove('hidden', 'lg:hidden');
                submenu.classList.add('lg:block'); 
                
                const mainContent = document.querySelector('.max-w-\\[1600px\\]');
                if(mainContent) {
                    mainContent.classList.add('lg:ml-64'); 
                }
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MenuGlobal.renderizar();
});