window.Produtividade = window.Produtividade || {};

Produtividade.Filtros = {
    datas: { inicio: null, fim: null },

    init: function() {
        console.log("🚀 [NEXUS] Filtros: Engine Iniciada...");
        this.renderizar();
        this.calcularDatas(); // Calcula datas iniciais (mês atual)
    },

    // 1. INJETA O HTML DOS FILTROS NA TELA
    renderizar: function() {
        const areaFiltros = document.getElementById('area-filtros-produtividade') || document.querySelector('.area-filtros');
        if (!areaFiltros) return console.warn("Área de filtros não encontrada no HTML.");

        const anoAtual = new Date().getFullYear();
        
        areaFiltros.innerHTML = `
            <div class="flex gap-2 items-end bg-white p-2 rounded shadow-sm border border-slate-200">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ano Ref.</label>
                    <select id="filtro-ano" onchange="Produtividade.Filtros.atualizar()" class="border border-slate-300 rounded text-sm py-1 px-2 font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer">
                        <option value="${anoAtual}" selected>${anoAtual}</option>
                        <option value="${anoAtual - 1}">${anoAtual - 1}</option>
                        <option value="${anoAtual - 2}">${anoAtual - 2}</option>
                    </select>
                </div>

                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Período</label>
                    <select id="filtro-periodo" onchange="Produtividade.Filtros.atualizar()" class="border border-slate-300 rounded text-sm py-1 px-2 font-bold text-slate-700 outline-none focus:border-blue-500 min-w-[150px] cursor-pointer">
                        <option value="mes_atual" selected>Mês Atual</option>
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
                    <input type="date" id="sel-data-dia" class="border border-slate-300 rounded text-sm py-0.5 px-2 text-slate-600 outline-none focus:border-blue-500">
                </div>
                
                <button onclick="Produtividade.Filtros.atualizar()" class="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded font-bold text-sm shadow-sm transition">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        `;
        
        // Seta o mês atual no select
        document.getElementById('filtro-periodo').value = new Date().getMonth() + 1;
    },

    // 2. CÁLCULO DAS DATAS (A LÓGICA DE SEMESTRES/TRIMESTRES FICA AQUI)
    calcularDatas: function() {
        const elAno = document.getElementById('filtro-ano');
        const elPeriodo = document.getElementById('filtro-periodo');
        
        if (!elAno || !elPeriodo) return;

        const ano = parseInt(elAno.value);
        const periodo = elPeriodo.value;

        let inicio, fim;

        // Se for "Mês Atual" (Dinâmico)
        if (periodo === 'mes_atual') {
            const hj = new Date();
            const m = hj.getMonth() + 1;
            const a = hj.getFullYear();
            // Se o ano selecionado for diferente do atual, respeita o ano selecionado
            const anoRef = (a === ano) ? a : ano; 
            const mesRef = (a === ano) ? m : 1; // Se mudou o ano, vai pra Janeiro ou mantém? Vamos manter simples:
            
            // Melhor: Se selecionou "Mês Atual" mas trocou o ano -> Vai para Janeiro daquele ano ou tenta o mesmo mês?
            // Vamos simplificar: Mês Atual é atalho. Se trocar ano, o usuário deve selecionar o mês.
            // Mas para robustez:
            const lastDay = new Date(ano, (a===ano ? m : 1), 0).getDate();
            inicio = `${ano}-${String(a===ano ? m : 1).padStart(2,'0')}-01`;
            fim = `${ano}-${String(a===ano ? m : 1).padStart(2,'0')}-${lastDay}`;
        } 
        else if (periodo === 'anual') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        }
        else if (periodo.startsWith('s')) { // Semestres
            if (periodo === 's1') { inicio = `${ano}-01-01`; fim = `${ano}-06-30`; }
            else { inicio = `${ano}-07-01`; fim = `${ano}-12-31`; }
        }
        else if (periodo.startsWith('t')) { // Trimestres
            if (periodo === 't1') { inicio = `${ano}-01-01`; fim = `${ano}-03-31`; }
            else if (periodo === 't2') { inicio = `${ano}-04-01`; fim = `${ano}-06-30`; }
            else if (periodo === 't3') { inicio = `${ano}-07-01`; fim = `${ano}-09-30`; }
            else { inicio = `${ano}-10-01`; fim = `${ano}-12-31`; }
        }
        else { // Meses Numéricos (1 a 12)
            const mes = parseInt(periodo);
            const lastDay = new Date(ano, mes, 0).getDate();
            inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
            fim = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
        }

        this.datas = { inicio, fim };
        console.log(`📅 Datas Calculadas: ${inicio} até ${fim}`);
    },

    // 3. AVISA AS OUTRAS ABAS PARA ATUALIZAR
    atualizar: function() {
        this.calcularDatas();

        // Se a Geral (Tabela) estiver ativa
        if (Produtividade.Geral && document.getElementById('tabela-corpo')) {
            Produtividade.Geral.carregarTela();
        }

        // Se o Consolidado (Gráfico) estiver ativo
        if (Produtividade.Consolidado && document.getElementById('grafico-consolidado')) {
            Produtividade.Consolidado.carregarDados();
        }
    },

    // 4. GETTER PÚBLICO
    getDatas: function() {
        // Se ainda não calculou, calcula agora
        if (!this.datas.inicio) this.calcularDatas();
        return this.datas;
    }
};

// Auto-init se carregar o script
Produtividade.Filtros.init();