// js/menu/minha_area.js

window.Menu = window.Menu || {};

Menu.MinhaArea = {
    renderizar: function() {
        let container = document.getElementById('submenu-minha-area');
        if (!container) {
            container = document.createElement('div');
            container.id = 'submenu-minha-area';
            const globalMenu = document.getElementById('global-menu');
            if(globalMenu) globalMenu.after(container);
            else document.body.prepend(container);
        }

        // HTML Estrutural idêntico ao de Produtividade/Gestão (Fixed Top-12, h-14)
        const html = `
        <div class="bg-white border-b border-slate-200 shadow-sm fixed top-12 left-0 w-full z-40 h-14 flex items-center transition-all">
            <div class="max-w-[1600px] mx-auto px-4 w-full flex items-center justify-between">
                
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-3 border-r border-slate-200 pr-4">
                        <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 border border-blue-200 shadow-sm">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div class="flex flex-col">
                            <h1 class="text-xs font-black text-slate-700 truncate max-w-[150px]" id="user-name-display">Carregando...</h1>
                        </div>
                    </div>

                    <div class="flex gap-1">
                        <button onclick="MinhaArea.mudarAba('diario')" id="btn-ma-diario" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                            <i class="fas fa-list-alt"></i> Extrato
                        </button>
                        <button onclick="MinhaArea.mudarAba('metas')" id="btn-ma-metas" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                            <i class="fas fa-bullseye"></i> Metas
                        </button>
                        <button onclick="MinhaArea.mudarAba('comparativo')" id="btn-ma-comparativo" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                            <i class="fas fa-chart-line"></i> Comparativo
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onclick="MinhaArea.mudarPeriodo('mes')" id="btn-periodo-mes" class="px-3 py-1 text-[10px] font-bold rounded transition text-blue-600 bg-white shadow-sm">Mês</button>
                        <button onclick="MinhaArea.mudarPeriodo('semana')" id="btn-periodo-semana" class="px-3 py-1 text-[10px] font-bold rounded transition text-slate-500 hover:bg-white/50">Semana</button>
                        <button onclick="MinhaArea.mudarPeriodo('ano')" id="btn-periodo-ano" class="px-3 py-1 text-[10px] font-bold rounded transition text-slate-500 hover:bg-white/50">Ano</button>
                    </div>

                    <div class="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 transition group cursor-pointer shadow-sm h-9">
                        <i class="fas fa-calendar-alt text-blue-500"></i>
                        <input type="date" id="global-date" onchange="MinhaArea.atualizarTudo()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer w-[105px]">
                    </div>
                </div>

            </div>
        </div>`;

        container.innerHTML = html;
        
        // Pequeno hack para garantir que o nome do usuário seja preenchido se o JS principal já tiver rodado
        const nomeEl = document.getElementById('user-name-display');
        const storedUser = localStorage.getItem('usuario_logado'); // Ajustado para chave correta usada no login
        if(nomeEl && storedUser) {
            try {
                const u = JSON.parse(storedUser);
                nomeEl.innerText = u.nome || "Colaborador";
            } catch(e) {}
        }
    }
};

// Auto-renderizar ao carregar
document.addEventListener('DOMContentLoaded', Menu.MinhaArea.renderizar);