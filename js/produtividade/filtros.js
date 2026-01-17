window.Produtividade = window.Produtividade || {};

Produtividade.Filtros = {
    datas: { inicio: null, fim: null },

    init: function() {
        console.log("🚀 [NEXUS] Filtros: Engine V2...");
        // Tenta renderizar. Se falhar (HTML não carregou), tenta de novo em breve.
        if (!this.renderizar()) {
            setTimeout(() => this.renderizar(), 500);
        }
        this.calcularDatas(); 
    },

    renderizar: function() {
        const areaFiltros = document.getElementById('area-filtros-produtividade') || document.querySelector('.area-filtros');
        if (!areaFiltros) return false; // Falhou, tenta depois

        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth() + 1;
        
        areaFiltros.innerHTML = `
            <div class="flex flex-wrap gap-2 items-end bg-white p-2 rounded shadow-sm border border-slate-200">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ano Ref.</label>
                    <select id="filtro-ano" onchange="Produtividade.Filtros.atualizar()" class="border border-slate-300 rounded text-sm py-1 px-2 font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer h-8">
                        <option value="${anoAtual}" selected>${anoAtual}</option>
                        <option value="${anoAtual - 1}">${anoAtual - 1}</option>
                        <option value="${anoAtual - 2}">${anoAtual - 2}</option>
                    </select>
                </div>

                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Período</label>
                    <select id="filtro-periodo" onchange="Produtividade.Filtros.atualizar()" class="border border-slate-300 rounded text-sm py-1 px-2 font-bold text-slate-700 outline-none focus:border-blue-500 min-w-[150px] cursor-pointer h-8">
                        <option value="mes_atual">Mês Atual</option>
                        <optgroup label="Semestres">
                            <option value="s1">1º Semestre (Jan-Jun)</option>
                            <option value="s2">2º Semestre (Jul-Dez)</option>
                        </optgroup>
                        <optgroup label="Trimestres">
                            <option value="t1">1º Trimestre (Jan-Mar)</option>
                            <option value="t2">2º Trimestre (Abr-Jun)</option>
                            <option value="t3">3º Trimestre (Jul-Set)</option>
                            <option value="t4">4º Trimestre (Out-Dez)</option>
                        </optgroup>
                        <optgroup label="Meses">
                            <option value="1">Janeiro</option>
                            <option value="2">Fevereiro</option>
                            <option value="3">Março</option>
                            <option value="4">Abril</option>
                            <option value="5">Maio</option>
                            <option value="6">Junho</option>
                            <option value="7">Julho</option>
                            <option value="8">Agosto</option>
                            <option value="9">Setembro</option>
                            <option value="10">Outubro</option>
                            <option value="11">Novembro</option>
                            <option value="12">Dezembro</option>
                        </optgroup>
                        <option value="anual">📅 Ano Completo</option>
                    </select>
                </div>

                <div class="ml-2 pl-2 border-l border-slate-200">
                    <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dia (Abono)</label>
                    <input type="date" id="sel-data-dia" class="border border-slate-300 rounded text-sm py-0.5 px-2 text-slate-600 outline-none focus:border-blue-500 h-8">
                </div>
                
                <button onclick="Produtividade.Filtros.atualizar()" class="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-3 h-8 rounded font-bold text-sm shadow-sm transition flex items-center justify-center">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        `;
        
        // Seta o mês atual e marca flag de sucesso
        const selPer = document.getElementById('filtro-periodo');
        if(selPer) selPer.value = mesAtual; // Define mês numérico direto
        
        return true;
    },

    calcularDatas: function() {
        const elAno = document.getElementById('filtro-ano');
        const elPeriodo = document.getElementById('filtro-periodo');
        
        // Se os elementos não existem, usa Data Padrão (Mês Atual)
        if (!elAno || !elPeriodo) {
            const hj = new Date();
            const m = hj.getMonth() + 1;
            const a = hj.getFullYear();
            const lastDay = new Date(a, m, 0).getDate();
            this.datas = {
                inicio: `${a}-${String(m).padStart(2,'0')}-01`,
                fim: `${a}-${String(m).padStart(2,'0')}-${lastDay}`
            };
            return;
        }

        const ano = parseInt(elAno.value);
        const periodo = elPeriodo.value;
        let inicio, fim;

        if (periodo === 'mes_atual') {
            const hj = new Date();
            const m = hj.getMonth() + 1;
            const a = hj.getFullYear();
            const lastDay = new Date(ano, (ano===a ? m : 1), 0).getDate();
            // Se ano selecionado != ano atual, assume Janeiro ou mês 1
            const mFinal = (ano===a) ? m : 1; 
            inicio = `${ano}-${String(mFinal).padStart(2,'0')}-01`;
            fim = `${ano}-${String(mFinal).padStart(2,'0')}-${lastDay}`;
        } 
        else if (periodo === 'anual') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        }
        else if (periodo.startsWith('s')) {
            if (periodo === 's1') { inicio = `${ano}-01-01`; fim = `${ano}-06-30`; }
            else { inicio = `${ano}-07-01`; fim = `${ano}-12-31`; }
        }
        else if (periodo.startsWith('t')) {
            if (periodo === 't1') { inicio = `${ano}-01-01`; fim = `${ano}-03-31`; }
            else if (periodo === 't2') { inicio = `${ano}-04-01`; fim = `${ano}-06-30`; }
            else if (periodo === 't3') { inicio = `${ano}-07-01`; fim = `${ano}-09-30`; }
            else { inicio = `${ano}-10-01`; fim = `${ano}-12-31`; }
        }
        else { 
            const mes = parseInt(periodo);
            const lastDay = new Date(ano, mes, 0).getDate();
            inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            fim = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
        }

        this.datas = { inicio, fim };
        console.log(`📅 Datas Calculadas: ${inicio} até ${fim}`);
    },

    atualizar: function() {
        this.calcularDatas();
        if (Produtividade.Geral && typeof Produtividade.Geral.carregarTela === 'function') {
            Produtividade.Geral.carregarTela();
        }
        // Correção do nome da função aqui também
        if (Produtividade.Consolidado && typeof Produtividade.Consolidado.carregar === 'function') {
            Produtividade.Consolidado.carregar();
        }
    },

    getDatas: function() {
        if (!this.datas.inicio) this.calcularDatas();
        return this.datas;
    }
};

Produtividade.Filtros.init();