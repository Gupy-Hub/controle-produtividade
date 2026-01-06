// js/layout.js

document.addEventListener("DOMContentLoaded", () => {
    criarSidebar();
    configurarLogout();
});

function criarSidebar() {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    
    // Se não tiver usuário logado, não renderiza sidebar (ou redireciona, mas o login.js já cuida disso)
    if (!usuario) return;

    // Define as páginas do sistema
    const paginas = [
        { 
            nome: "Painel", 
            link: "produtividade.html", 
            icone: "fas fa-columns",
            permissoes: ['Gestora', 'Auditora'] // Apenas Admins
        },
        { 
            nome: "Minha Área", 
            link: "minha_area.html", 
            icone: "fas fa-id-card",
            permissoes: ['Gestora', 'Auditora', 'Assistente'] // Todos
        },
        { 
            nome: "Gestão", 
            link: "gestao.html", 
            icone: "fas fa-cogs",
            permissoes: ['Gestora', 'Auditora'] // Apenas Admins
        },
        { 
            nome: "Biblioteca", 
            link: "biblioteca.html", 
            icone: "fas fa-book",
            permissoes: ['Gestora', 'Auditora', 'Assistente'] // Todos (Assumindo que existe)
        }
    ];

    // Cria a estrutura HTML da Sidebar
    const sidebar = document.createElement("div");
    sidebar.className = "fixed left-0 top-0 h-full w-64 bg-slate-900 text-white flex flex-col z-50 transition-transform transform -translate-x-full md:translate-x-0";
    sidebar.id = "main-sidebar";

    // Logo / Cabeçalho
    sidebar.innerHTML = `
        <div class="p-6 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/50">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div>
                    <h1 class="font-bold text-lg tracking-tight">Performance</h1>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Pro v1.0</p>
                </div>
            </div>
            <button class="md:hidden text-slate-400 hover:text-white" onclick="toggleSidebar()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <nav class="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
            </nav>

        <div class="p-4 border-t border-slate-800 bg-slate-900/50">
            <div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                    ${usuario.nome.charAt(0)}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white truncate">${usuario.nome}</p>
                    <p class="text-[10px] text-slate-400 truncate capitalize">${usuario.funcao}</p>
                </div>
                <button id="btn-logout" class="text-slate-400 hover:text-red-400 transition" title="Sair">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </div>
    `;

    // Injeta os links de navegação
    const nav = sidebar.querySelector("nav");
    const paginaAtual = window.location.pathname.split("/").pop();

    paginas.forEach(p => {
        // Verifica se o usuário tem permissão para ver este item
        if (p.permissoes.includes(usuario.funcao)) {
            const isActive = paginaAtual === p.link;
            const link = document.createElement("a");
            link.href = p.link;
            link.className = `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`;
            
            link.innerHTML = `
                <i class="${p.icone} w-5 text-center ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-400 transition-colors'}"></i>
                <span>${p.nome}</span>
                ${isActive ? '<i class="fas fa-chevron-right ml-auto text-xs opacity-50"></i>' : ''}
            `;
            nav.appendChild(link);
        }
    });

    document.body.prepend(sidebar);

    // Ajusta o padding do body para não ficar escondido atrás da sidebar (Mobile vs Desktop)
    // No CSS global (tailwind) geralmente usamos pl-0 md:pl-64 no container principal, 
    // mas vamos garantir via JS que o conteúdo principal tenha margem
    const conteudos = document.querySelectorAll('body > div:not(#main-sidebar)');
    conteudos.forEach(c => c.classList.add('md:pl-64', 'transition-all', 'duration-300'));

    // Botão Mobile Toggle (se não existir, cria um flutuante)
    if (!document.getElementById('mobile-menu-btn')) {
        const btnMobile = document.createElement('button');
        btnMobile.id = 'mobile-menu-btn';
        btnMobile.className = 'md:hidden fixed bottom-4 right-4 z-50 bg-blue-600 text-white w-12 h-12 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform';
        btnMobile.innerHTML = '<i class="fas fa-bars"></i>';
        btnMobile.onclick = toggleSidebar;
        document.body.appendChild(btnMobile);
    }
}

function toggleSidebar() {
    const sb = document.getElementById("main-sidebar");
    sb.classList.toggle("-translate-x-full");
}

function configurarLogout() {
    const btn = document.getElementById("btn-logout");
    if (btn) {
        btn.addEventListener("click", () => {
            if(confirm("Deseja realmente sair?")) {
                localStorage.removeItem("usuario");
                window.location.href = "index.html";
            }
        });
    }
}