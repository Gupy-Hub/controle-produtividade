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

        const html = `
        <div class="bg-white border-b border-slate-200 shadow-sm fixed top-12 left-0 w-full z-40 h-14 flex items-center transition-all">
            <div class="max-w-[1600px] mx-auto px-4 w-full flex items-center justify-between">
                
                <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    <button onclick="MinhaArea.mudarAba('diario')" id="btn-ma-diario" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-calendar-day"></i> Dia a Dia
                    </button>
                    <button onclick="MinhaArea.mudarAba('metas')" id="btn-ma-metas" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-bullseye"></i> Metas/OKR
                    </button>
                    <button onclick="MinhaArea.mudarAba('assertividade')" id="btn-ma-assertividade" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-check-double"></i> Assertividade
                    </button>
                    <button onclick="MinhaArea.mudarAba('auditoria')" id="btn-ma-auditoria" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-clipboard-check"></i> Auditoria
                    </button>
                    <button onclick="MinhaArea.mudarAba('comparativo')" id="btn-ma-comparativo" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-chart-line"></i> Comparativo
                    </button>
                    <button onclick="MinhaArea.mudarAba('feedback')" id="btn-ma-feedback" class="tab-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap text-slate-600 hover:bg-slate-50 transition">
                        <i class="fas fa-comments"></i> FeedBack
                    </button>
                </div>

                <div class="flex items-center gap-3 pl-4 border-l border-slate-100 ml-4 flex-shrink-0">
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
    }
};

document.addEventListener('DOMContentLoaded', Menu.MinhaArea.renderizar);