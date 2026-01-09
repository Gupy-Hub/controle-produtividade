window.Menu = window.Menu || {};

Menu.Gestao = {
    renderizar: function() {
        let container = document.getElementById('submenu-gestao');
        if (!container) {
            container = document.createElement('div');
            container.id = 'submenu-gestao';
            const globalMenu = document.getElementById('global-menu');
            if(globalMenu) globalMenu.after(container);
            else document.body.prepend(container);
        }

        const html = `
        <div class="bg-white border-b border-slate-200 shadow-sm fixed top-12 left-0 w-full z-40 h-14 flex items-center">
            <div class="max-w-[1600px] mx-auto px-4 w-full flex items-center justify-between">
                
                <div class="flex gap-1 overflow-x-auto no-scrollbar">
                    <button onclick="Gestao.mudarAba('usuarios')" id="btn-g-usuarios" class="tab-btn px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 text-slate-600 hover:bg-slate-50 transition"><i class="fas fa-users"></i> Usuários</button>
                    <button onclick="Gestao.mudarAba('empresas')" id="btn-g-empresas" class="tab-btn px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 text-slate-600 hover:bg-slate-50 transition"><i class="fas fa-building"></i> Empresas</button>
                    <button onclick="Gestao.mudarAba('assertividade')" id="btn-g-assertividade" class="tab-btn px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 text-slate-600 hover:bg-slate-50 transition"><i class="fas fa-check-double"></i> Assertividade</button>
                    <button onclick="Gestao.mudarAba('metas')" id="btn-g-metas" class="tab-btn px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 text-slate-600 hover:bg-slate-50 transition"><i class="fas fa-bullseye"></i> Metas</button>
                </div>

                <div id="gestao-actions" class="flex items-center gap-2"></div>
            </div>
        </div>`;

        container.innerHTML = html;
    },

    atualizarAcao: function(aba) {
        const container = document.getElementById('gestao-actions');
        if (!container) return;

        let btnHtml = '';
        
        if (aba === 'usuarios') {
            btnHtml = `
            <label class="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm border border-blue-700">
                <i class="fas fa-upload"></i> Importar Usuários
                <input type="file" class="hidden" accept=".csv, .xlsx" onchange="Gestao.Importacao.Usuarios.executar(this)">
            </label>`;
        } 
        else if (aba === 'empresas') {
            btnHtml = `
            <label class="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm border border-blue-700">
                <i class="fas fa-upload"></i> Importar Empresas
                <input type="file" class="hidden" accept=".csv, .xlsx" onchange="Gestao.Importacao.Empresas.executar(this)">
            </label>`;
        }
        else if (aba === 'assertividade') {
            // NOVO BOTÃO DE IMPORTAR MENSAL
            btnHtml = `
            <label class="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm border border-purple-700">
                <i class="fas fa-file-invoice"></i> Importar Relatório Mensal
                <input type="file" class="hidden" accept=".csv, .xlsx" onchange="Gestao.Importacao.Assertividade.executar(this)">
            </label>`;
        }
        else if (aba === 'metas') {
            btnHtml = `
            <label class="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm border border-emerald-700">
                <i class="fas fa-bullseye"></i> Importar Metas
                <input type="file" class="hidden" accept=".csv, .xlsx" onchange="Gestao.Metas.importar(this)">
            </label>`;
        }
        
        container.innerHTML = btnHtml;
        
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('bg-blue-50', 'text-blue-700', 'border-b-2', 'border-blue-600');
            b.classList.add('text-slate-600');
        });
        
        const activeBtn = document.getElementById(`btn-g-${aba}`);
        if(activeBtn) {
            activeBtn.classList.remove('text-slate-600');
            activeBtn.classList.add('bg-blue-50', 'text-blue-700'); 
        }
    }
};