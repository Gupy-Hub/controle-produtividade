// js/layout.js

document.addEventListener("DOMContentLoaded", () => {
    criarNavbar();
    configurarLogout();
});

function criarNavbar() {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    if (!usuario) return;

    const paginas = [
        { 
            nome: "Produtividade", // ALTERADO DE "Painel Geral"
            link: "produtividade.html", 
            icone: "fas fa-chart-line",
            permissoes: ['Gestora', 'Auditora'] 
        },
        { 
            nome: "Minha Área", 
            link: "minha_area.html", 
            icone: "fas fa-id-card",
            permissoes: ['Gestora', 'Auditora', 'Assistente'] 
        },
        { 
            nome: "Gestão", 
            link: "gestao.html", 
            icone: "fas fa-cogs",
            permissoes: ['Gestora', 'Auditora'] 
        },
        { 
            nome: "Biblioteca", 
            link: "biblioteca.html", 
            icone: "fas fa-book",
            permissoes: ['Gestora', 'Auditora', 'Assistente'] 
        }
    ];

    const navbar = document.createElement("header");
    navbar.className = "fixed top-0 left-0 w-full h-10 bg-slate-900 text-white z-[60] flex items-center justify-between px-4 shadow-md";
    navbar.id = "main-navbar";

    const logoHtml = `
        <div class="flex items-center gap-2">
            <span class="font-black text-sm tracking-tight text-blue-400">PERFORMANCE<span class="text-white">PRO</span></span>
        </div>
    `;

    let linksHtml = '<nav class="hidden md:flex items-center gap-1 h-full">';
    const paginaAtual = window.location.pathname.split("/").pop();

    paginas.forEach(p => {
        if (p.permissoes.includes(usuario.funcao)) {
            const ativo = paginaAtual === p.link;
            const classeAtivo = ativo ? "bg-slate-800 text-blue-400 border-b-2 border-blue-400" : "text-slate-400 hover:text-white hover:bg-slate-800";
            linksHtml += `<a href="${p.link}" class="${classeAtivo} h-full px-3 flex items-center gap-2 text-xs font-bold transition-all"><i class="${p.icone}"></i> ${p.nome}</a>`;
        }
    });
    linksHtml += '</nav>';

    const perfilHtml = `
        <div class="flex items-center gap-3">
            <div class="flex items-center gap-2 text-xs">
                <div class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center font-bold text-[10px] text-white">${usuario.nome.charAt(0)}</div>
                <span class="font-bold text-slate-300 hidden sm:inline">${usuario.nome}</span>
            </div>
            <div class="h-4 w-px bg-slate-700 mx-1"></div>
            <button id="btn-logout" class="text-slate-400 hover:text-red-400 transition text-xs" title="Sair"><i class="fas fa-power-off"></i></button>
        </div>
    `;

    navbar.innerHTML = logoHtml + linksHtml + perfilHtml;
    document.body.prepend(navbar);
    document.body.classList.add('pt-10');
}

function configurarLogout() {
    const btn = document.getElementById("btn-logout");
    if (btn) {
        btn.addEventListener("click", () => {
            if(confirm("Sair do sistema?")) { localStorage.removeItem("usuario"); window.location.href = "index.html"; }
        });
    }
}