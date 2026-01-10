window.MenuGestao = {
    renderizar: function() {
        const path = window.location.pathname;
        const page = path.split("/").pop(); // ex: usuarios.html

        // Estilos das Abas
        const activeClass = "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50";
        const inactiveClass = "text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-all";
        const commonClass = "px-6 py-3 text-sm font-bold flex items-center gap-2 transition-all h-full";

        // HTML das Abas Horizontais
        const menuHtml = `
        <div class="max-w-[1600px] mx-auto px-4 flex items-center overflow-x-auto custom-scroll">
            
            <a href="usuarios.html" class="${commonClass} ${page.includes('usuarios') ? activeClass : inactiveClass}">
                <i class="fas fa-users"></i> Usuários
            </a>

            <a href="empresas.html" class="${commonClass} ${page.includes('empresas') ? activeClass : inactiveClass}">
                <i class="fas fa-building"></i> Empresas
            </a>

            <a href="assertividade.html" class="${commonClass} ${page.includes('assertividade') ? activeClass : inactiveClass}">
                <i class="fas fa-check-circle"></i> Assertividade
            </a>

            <a href="metas.html" class="${commonClass} ${page.includes('metas') ? activeClass : inactiveClass}">
                <i class="fas fa-bullseye"></i> Metas
            </a>

        </div>`;

        // Injeta dentro do container criado pelo Global
        const container = document.getElementById('submenu-container'); 
        if(container) container.innerHTML = menuHtml;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if(window.MenuGestao) window.MenuGestao.renderizar();
});