Produtividade.Consolidado = {
    dadosCache: null, // Armazena os dados brutos para recalculo rápido
    diasUteis: 0,
    diasTrabalhados: 0,

    init: function() { this.carregar(); },
    togglePeriodo: function() { this.carregar(); },

    carregar: async function() {
        const container = document.getElementById('lista-consolidada');
        const periodTypeEl = document.getElementById('cons-period-type');
        const dateInput = document.getElementById('global-date');

        if(container) container.innerHTML = '<div class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i><br>Calculando dados...</div>';
        
        try {
            const dataRef = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
            const tipoPeriodo = periodTypeEl ? periodTypeEl.value : 'mes';
            const [ano, mes, dia] = dataRef.split('-').map(Number);

            // 1. Definição do Intervalo (Mesma lógica do Geral para consistência)
            let dataInicio, dataFim;
            
            if (tipoPeriodo === 'mes') { 
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
            } else if (tipoPeriodo === 'trimestre') {
                const trimestres = [ [1,3], [4,6], [7,9], [10,12] ];
                const currentTri = trimestres.find(t => mes >= t[0] && mes <= t[1]);
                dataInicio = `${ano}-${String(currentTri[0]).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, currentTri[1], 0).getDate();
                dataFim = `${ano}-${String(currentTri[1]).padStart(2,'0')}-${ultimoDia}`;
            } else if (tipoPeriodo === 'ano_mes') {
                dataInicio = `${ano}-01-01`; dataFim = `${ano}-12-31`;
            } else { 
                // Diário
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
            }

            // 2. Busca Dados no Banco
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('quantidade, fifo, gradual_parcial, gradual_total, perfil_fc, data_referencia, usuario_id')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);
                
            if (error) throw error;

            // 3. Processamento dos Totais
            const totais = {
                geral: 0,
                fifo: 0,
                gParcial: 0,
                gTotal: 0,
                perfil: 0,
                assistentesUnicos: new Set(),
                diasComProducao: new Set()
            };

            data.forEach(d => {
                totais.geral += (d.quantidade || 0);
                totais.fifo += (d.fifo || 0);
                totais.gParcial += (d.gradual_parcial || 0);
                totais.gTotal += (d.gradual_total || 0);
                totais.perfil += (d.perfil_fc || 0);
                totais.assistentesUnicos.add(d.usuario_id);
                totais.diasComProducao.add(d.data_referencia);
            });

            // 4. Salva no Cache e Calcula Dias
            this.dadosCache = totais;
            this.diasUteis = this.calcularDiasUteis(dataInicio, dataFim);
            this.diasTrabalhados = totais.diasComProducao.size;

            // 5. Renderiza a Tela
            this.renderizarLista();

        } catch (e) {
            console.error(e);
            if(container) container.innerHTML = `<div class="text-red-500 text-center py-4">Erro: ${e.message}</div>`;
        }
    },

    renderizarLista: function() {
        const container = document.getElementById('lista-consolidada');
        if (!container || !this.dadosCache) return;

        const totais = this.dadosCache;
        
        // Controle de Assistentes (Input Manual vs Sistema)
        const inputAssist = document.getElementById('cons-input-assistentes');
        let qtdAssistentes = totais.assistentesUnicos.size; // Padrão do sistema
        
        if (inputAssist) {
            const valManual = parseInt(inputAssist.value);
            // Se o input tiver valor válido e diferente de 0, usamos ele. 
            // Se for 0 (inicial) ou vazio, setamos o do sistema.
            if (!isNaN(valManual) && valManual > 0) {
                qtdAssistentes = valManual;
            } else {
                inputAssist.value = qtdAssistentes;
            }
        }

        // Cálculos das Médias
        // 1. Total validação diária (Dias uteis) -> Média da Equipe por Dia
        const mediaEquipeDiaUtil = this.diasUteis > 0 ? Math.round(totais.geral / this.diasUteis) : 0;

        // 2. Média validação diária (Todas assistentes) -> Total / Qtd Assistentes (Produção Per Capita no Período)
        const mediaPorAssistenteTotal = qtdAssistentes > 0 ? Math.round(totais.geral / qtdAssistentes) : 0;

        // 3. Média validação diária (Por Assistentes) -> (Total / Qtd Assistentes) / Dias Uteis (Produção Per Capita por Dia)
        const mediaPorAssistenteDia = this.diasUteis > 0 ? Math.round(mediaPorAssistenteTotal / this.diasUteis) : 0;

        // HTML da Lista
        container.innerHTML = `
            <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-slate-100">
                    <span class="text-sm font-bold text-slate-600">Total de dias úteis / trabalhado</span>
                    <span class="text-lg font-black text-slate-800">${this.diasUteis} <span class="text-slate-400 text-xs font-normal">/ ${this.diasTrabalhados}</span></span>
                </div>

                <div class="space-y-2 pb-2 border-b border-slate-100">
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500">Total de documentos Fifo</span>
                        <span class="font-bold text-slate-700">${totais.fifo.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500">Total de documentos Gradual Parcial</span>
                        <span class="font-bold text-slate-700">${totais.gParcial.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500">Total de documentos Gradual Total</span>
                        <span class="font-bold text-slate-700">${totais.gTotal.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500">Total de documentos Perfil Fc</span>
                        <span class="font-bold text-slate-700">${totais.perfil.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div class="flex justify-between items-center py-2 bg-blue-50/50 px-3 -mx-3 rounded-lg border border-blue-50">
                    <span class="text-sm font-bold text-blue-800 uppercase">Total de documentos validados</span>
                    <span class="text-2xl font-black text-blue-700">${totais.geral.toLocaleString('pt-BR')}</span>
                </div>

                <div class="space-y-3 pt-2">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-bold text-slate-600">Total validação diária (Dias úteis)</span>
                        <span class="text-lg font-black text-slate-700">${mediaEquipeDiaUtil.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-slate-600">Média validação diária (Todas assistentes)</span>
                            <span class="text-[10px] text-slate-400 italic">Total / Nº Assistentes</span>
                        </div>
                        <span class="text-lg font-black text-indigo-600">${mediaPorAssistenteTotal.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-slate-600">Média validação diária (Por Assistentes)</span>
                            <span class="text-[10px] text-slate-400 italic">Média Total / Dias Úteis</span>
                        </div>
                        <span class="text-lg font-black text-emerald-600">${mediaPorAssistenteDia.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            </div>
        `;
    },

    recalcularMedias: function() {
        // Função chamada pelo onchange do input no HTML
        this.renderizarLista();
    },

    calcularDiasUteis: function(inicio, fim) {
        let count = 0;
        let curr = new Date(inicio + 'T00:00:00');
        let end = new Date(fim + 'T00:00:00');
        while (curr <= end) {
            const wd = curr.getDay();
            if (wd !== 0 && wd !== 6) count++;
            curr.setDate(curr.getDate() + 1);
        }
        return count;
    }
};