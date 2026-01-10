window.MenuGestao = {
    renderizar: function() {
        const path = window.location.pathname;
        // Pega o nome do arquivo atual (ex: usuarios.html)
        const page = path.split("/").pop(); 

        // Estilos
        const activeClass = "bg-slate-800 text-white shadow-lg border-l-4 border-blue-500";
        const inactiveClass = "text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all";

        // Links diretos para os arquivos na mesma pasta (gestao/)
        const menuHtml = `
        <div class="flex flex-col gap-2 p-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-3">Gestão</div>
            
            <a href="usuarios.html" class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${page.includes('usuarios') ? activeClass : inactiveClass}">
                <i class="fas fa-users w-5"></i> Usuários
            </a>

            <a href="empresas.html" class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${page.includes('empresas') ? activeClass : inactiveClass}">
                <i class="fas fa-building w-5"></i> Empresas
            </a>

            <a href="assertividade.html" class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${page.includes('assertividade') ? activeClass : inactiveClass}">
                <i class="fas fa-check-circle w-5"></i> Assertividade
            </a>

            <a href="metas.html" class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${page.includes('metas') ? activeClass : inactiveClass}">
                <i class="fas fa-bullseye w-5"></i> Metas
            </a>
        </div>`;

        // Injeta no container do menu lateral
        const sidebar = document.getElementById('sidebar-menu-content'); 
        if(sidebar) sidebar.innerHTML = menuHtml;
    }
};

// Auto-renderiza ao carregar
document.addEventListener('DOMContentLoaded', () => {
    if(window.MenuGestao) window.MenuGestao.renderizar();
});