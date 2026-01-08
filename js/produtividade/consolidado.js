Produtividade.Consolidado = {
    dadosCache: null, 
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

            // 1. Definição do Intervalo
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

            // 2. Busca Dados
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('quantidade, fifo, gradual_parcial, gradual_total, perfil_fc, data_referencia, usuario_id')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);
                
            if (error) throw error;

            // 3. Processamento
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

            this.dadosCache = totais;
            this.diasUteis = this.calcularDiasUteis(dataInicio, dataFim);
            this.diasTrabalhados = totais.diasComProducao.size;

            // 4. Renderiza
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
        const totalSistema = totais.assistentesUnicos.size;
        
        // Controle de Assistentes (Input Manual)
        const inputAssist = document.getElementById('cons-input-assistentes');
        const hintAssist = document.getElementById('cons-found-hint');
        
        if (hintAssist) hintAssist.innerText = `(Encontrados: ${totalSistema})`;

        let qtdAssistentes = totalSistema;
        if (inputAssist) {
            const valManual = parseInt(inputAssist.value);
            // Se o input tem valor válido > 0, usa ele. Se for 0 (inicial), usa sistema.
            if (!isNaN(valManual) && valManual > 0) {
                qtdAssistentes = valManual;
            } else {
                // Se estiver zerado, preenche visualmente com o do sistema para o usuário saber
                if (inputAssist.value == 0 || inputAssist.value == "") inputAssist.value = totalSistema;
                qtdAssistentes = totalSistema > 0 ? totalSistema : 1; // Evita divisão por zero
            }
        }

        // --- CÁLCULOS DAS MÉDIAS (Conforme Solicitado) ---
        
        // 1. Total validação diária (Dias uteis)
        // Fórmula: Total Produção / Dias Úteis
        const mediaDiaUteis = this.diasUteis > 0 ? Math.round(totais.geral / this.diasUteis) : 0;

        // 2. Média validação diária (Todas assistentes)
        // Fórmula: Total Produção / Total Assistentes
        const mediaPorAssistenteTotal = qtdAssistentes > 0 ? Math.round(totais.geral / qtdAssistentes) : 0;

        // 3. Média validação diária (Por Assistentes)
        // Fórmula: (Total Produção / Total Assistentes) / Dias Úteis
        // Isso representa quanto UMA assistente produz, em média, por dia útil.
        const mediaPorAssistenteDia = this.diasUteis > 0 ? Math.round(mediaPorAssistenteTotal / this.diasUteis) : 0;


        // --- ATUALIZAÇÃO DOS 5 CARDS DO TOPO ---
        // Card 1: Total
        if(document.getElementById('cons-card-total')) document.getElementById('cons-card-total').innerText = totais.geral.toLocaleString('pt-BR');
        // Card 2: Dias
        if(document.getElementById('cons-card-dias')) document.getElementById('cons-card-dias').innerText = `${this.diasUteis} / ${this.diasTrabalhados}`;
        // Card 3: Assistentes (Reflete o manual ou sistema)
        if(document.getElementById('cons-card-assistentes')) document.getElementById('cons-card-assistentes').innerText = qtdAssistentes;
        // Card 4: Média Diária Equipe (Total / Dias Uteis)
        if(document.getElementById('cons-card-media-equipe')) document.getElementById('cons-card-media-equipe').innerText = mediaDiaUteis.toLocaleString('pt-BR');
        // Card 5: Média / Assistente (Total / Assistentes)
        // Nota: O card pede "Média / Assistente", geralmente se refere ao total do período.
        if(document.getElementById('cons-card-media-assist')) document.getElementById('cons-card-media-assist').innerText = mediaPorAssistenteTotal.toLocaleString('pt-BR'); 


        // --- GERAÇÃO DA LISTA (LINHAS ZEBRADAS) ---
        const rows = [
            { label: 'Total de dias úteis / trabalhado', val: `${this.diasUteis} / ${this.diasTrabalhados}` },
            { label: 'Total de documentos Fifo', val: totais.fifo.toLocaleString('pt-BR') },
            { label: 'Total de documentos Gradual Parcial', val: totais.gParcial.toLocaleString('pt-BR') },
            { label: 'Total de documentos Gradual Total', val: totais.gTotal.toLocaleString('pt-BR') },
            { label: 'Total de documentos Perfil Fc', val: totais.perfil.toLocaleString('pt-BR') },
            { label: 'Total de documentos validados', val: totais.geral.toLocaleString('pt-BR'), bold: true },
            { label: 'Total validação diária (Dias uteis)', val: mediaDiaUteis.toLocaleString('pt-BR') },
            { label: 'Média validação diária (Todas assistentes)', val: mediaPorAssistenteTotal.toLocaleString('pt-BR'), sub: 'Soma / Total Assistentes' },
            { label: 'Média validação diária (Por Assistentes)', val: mediaPorAssistenteDia.toLocaleString('pt-BR'), sub: 'Média por Dia Útil' }
        ];

        let html = '<ul class="divide-y divide-slate-100">';
        rows.forEach((r, idx) => {
            const bgClass = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'; // Zebrado
            const valClass = r.bold ? 'text-blue-700 font-black text-lg' : 'text-slate-700 font-bold';
            
            html += `
                <li class="flex justify-between items-center px-6 py-3 ${bgClass} hover:bg-blue-50/50 transition">
                    <div class="flex flex-col">
                        <span class="text-sm font-semibold text-slate-600">${r.label}</span>
                        ${r.sub ? `<span class="text-[10px] text-slate-400 italic">${r.sub}</span>` : ''}
                    </div>
                    <span class="${valClass}">${r.val}</span>
                </li>
            `;
        });
        html += '</ul>';

        container.innerHTML = html;
    },

    recalcularMedias: function() {
        if (this.dadosCarregados) {
            this.renderizarLista();
        }
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