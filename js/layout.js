// js/layout.js

document.addEventListener("DOMContentLoaded", () => {
    criarNavbar();
    configurarLogout();
});

function criarNavbar() {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    
    // Se não tiver usuário logado, não renderiza nada
    if (!usuario) return;

    // 1. Definição das páginas e PERMISSÕES
    const paginas = [
        { 
            nome: "Painel Geral", 
            link: "produtividade.html", 
            icone: "fas fa-chart-line",
            permissoes: ['Gestora', 'Auditora'] // Apenas Gestão
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
            permissoes: ['Gestora', 'Auditora'] // Apenas Gestão
        },
        { 
            nome: "Biblioteca", 
            link: "biblioteca.html", 
            icone: "fas fa-book",
            permissoes: ['Gestora', 'Auditora', 'Assistente'] // Todos
        }
    ];

    // 2. Cria a estrutura da Navbar (Barra Fina no Topo)
    const navbar = document.createElement("header");
    // h-10 = 40px de altura (bem discreta)
    navbar.className = "fixed top-0 left-0 w-full h-10 bg-slate-900 text-white z-[60] flex items-center justify-between px-4 shadow-md";
    navbar.id = "main-navbar";

    // 3. Logo / Nome do App
    const logoHtml = `
        <div class="flex items-center gap-2">
            <span class="font-black text-sm tracking-tight text-blue-400">PERFORMANCE<span class="text-white">PRO</span></span>
        </div>
    `;

    // 4. Links de Navegação (Centro)
    let linksHtml = '<nav class="hidden md:flex items-center gap-1 h-full">';
    const paginaAtual = window.location.pathname.split("/").pop();

    paginas.forEach(p => {
        // Verifica permissão
        if (p.permissoes.includes(usuario.funcao)) {
            const ativo = paginaAtual === p.link;
            const classeAtivo = ativo ? "bg-slate-800 text-blue-400 border-b-2 border-blue-400" : "text-slate-400 hover:text-white hover:bg-slate-800";
            
            linksHtml += `
                <a href="${p.link}" class="${classeAtivo} h-full px-3 flex items-center gap-2 text-xs font-bold transition-all">
                    <i class="${p.icone}"></i> ${p.nome}
                </a>
            `;
        }
    });
    linksHtml += '</nav>';

    // 5. Perfil / Logout (Direita)
    const perfilHtml = `
        <div class="flex items-center gap-3">
            <div class="flex items-center gap-2 text-xs">
                <div class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center font-bold text-[10px] text-white">
                    ${usuario.nome.charAt(0)}
                </div>
                <span class="font-bold text-slate-300 hidden sm:inline">${usuario.nome}</span>
            </div>
            <div class="h-4 w-px bg-slate-700 mx-1"></div>
            <button id="btn-logout" class="text-slate-400 hover:text-red-400 transition text-xs" title="Sair">
                <i class="fas fa-power-off"></i>
            </button>
        </div>
    `;

    navbar.innerHTML = logoHtml + linksHtml + perfilHtml;
    document.body.prepend(navbar);

    // 6. Ajuste do Body para não ficar escondido atrás da barra
    document.body.classList.add('pt-10'); // Adiciona padding-top igual a altura da barra
}

function configurarLogout() {
    const btn = document.getElementById("btn-logout");
    if (btn) {
        btn.addEventListener("click", () => {
            if(confirm("Sair do sistema?")) {
                localStorage.removeItem("usuario");
                window.location.href = "index.html";
            }
        });
    }
}