Produtividade.Consolidado = {
    dadosCarregados: null, // Armazena dados para recalculo rápido
    diasUteisPeriodo: 0,
    diasTrabalhadosPeriodo: 0,
    
    init: function() { this.carregar(); },
    togglePeriodo: function() { this.carregar(); },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        const periodTypeEl = document.getElementById('cons-period-type');
        const dateInput = document.getElementById('global-date');

        if(tbody) tbody.innerHTML = '<tr><td colspan="100%" class="text-center py-4 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</td></tr>';
        
        try {
            const dataRef = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
            const tipoPeriodo = periodTypeEl ? periodTypeEl.value : 'mes';
            const [ano, mes, dia] = dataRef.split('-').map(Number);

            // 1. Definição do Intervalo e Colunas
            let dataInicio, dataFim;
            let colunas = [];
            let funcAgrupamento;

            // --- Lógica de Datas (Igual à anterior, mantendo a estrutura dinâmica) ---
            if (tipoPeriodo === 'mes') { 
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
                
                const semanas = Produtividade.Geral.getSemanasDoMes ? Produtividade.Geral.getSemanasDoMes(ano, mes) : [];
                if(semanas.length === 0) {
                     colunas = [{label:'Total', id:'total'}];
                     funcAgrupamento = () => 'total';
                } else {
                    semanas.forEach((s, i) => colunas.push({ label: `Sem ${i+1}`, id: `s${i+1}`, inicio: s.inicio, fim: s.fim }));
                    funcAgrupamento = (dataReg) => {
                        const idx = semanas.findIndex(s => dataReg >= s.inicio && dataReg <= s.fim);
                        return idx >= 0 ? `s${idx+1}` : null;
                    };
                }
            } else if (tipoPeriodo === 'trimestre') {
                const trimestres = [ [1,3], [4,6], [7,9], [10,12] ];
                const currentTri = trimestres.find(t => mes >= t[0] && mes <= t[1]);
                dataInicio = `${ano}-${String(currentTri[0]).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, currentTri[1], 0).getDate();
                dataFim = `${ano}-${String(currentTri[1]).padStart(2,'0')}-${ultimoDia}`;
                
                const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                for(let m=currentTri[0]; m<=currentTri[1]; m++) colunas.push({ label: nomesMeses[m-1], id: `m${m}` });
                funcAgrupamento = (dataReg) => { return `m${parseInt(dataReg.split('-')[1])}`; };
            } else if (tipoPeriodo === 'ano_mes') {
                dataInicio = `${ano}-01-01`; dataFim = `${ano}-12-31`;
                const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                nomesMeses.forEach((nm, i) => colunas.push({ label: nm, id: `m${i+1}` }));
                funcAgrupamento = (dataReg) => { return `m${parseInt(dataReg.split('-')[1])}`; };
            } else { 
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
                for(let i=1; i<=ultimoDia; i++) colunas.push({ label: String(i), id: `d${i}` });
                funcAgrupamento = (dataReg) => { return `d${parseInt(dataReg.split('-')[2])}`; };
            }

            // 2. Busca Dados
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios!inner(nome, id)')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);
                
            if (error) throw error;
            this.dadosCarregados = { data, colunas, funcAgrupamento }; // Guarda para recalculo local

            // 3. Calcula Dias Úteis e Trabalhados
            this.diasUteisPeriodo = this.calcularDiasUteis(dataInicio, dataFim);
            const diasTrabalhadosSet = new Set(data.map(d => d.data_referencia));
            this.diasTrabalhadosPeriodo = diasTrabalhadosSet.size;

            // 4. Processa e Renderiza
            this.processarKPIsETabela();

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-red-500 text-center py-4">Erro: ${e.message}</td></tr>`;
        }
    },

    processarKPIsETabela: function() {
        const { data, colunas, funcAgrupamento } = this.dadosCarregados;
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');

        // Totais Acumulados
        let totalGeral = 0;
        let totalFifo = 0;
        let totalGParcial = 0;
        let totalGTotal = 0;
        let totalPerfil = 0;
        
        const mapUser = {};

        data.forEach(d => {
            const uid = d.usuario_id;
            if (!mapUser[uid]) {
                mapUser[uid] = { 
                    nome: d.usuarios.nome, 
                    total: 0, 
                    colunas: {} 
                };
                colunas.forEach(c => mapUser[uid].colunas[c.id] = 0);
            }
            
            const qtd = d.quantidade || 0;
            mapUser[uid].total += qtd;
            
            // Distribuição nas Colunas
            const colId = funcAgrupamento(d.data_referencia);
            if (colId && mapUser[uid].colunas[colId] !== undefined) {
                mapUser[uid].colunas[colId] += qtd;
            }

            // Somatórios Globais
            totalGeral += qtd;
            totalFifo += (d.fifo || 0);
            totalGParcial += (d.gradual_parcial || 0);
            totalGTotal += (d.gradual_total || 0);
            totalPerfil += (d.perfil_fc || 0);
        });

        // --- ATUALIZAÇÃO DOS CARDS (KPIs) ---
        
        // 1. Assistentes (Detectado vs Manual)
        const totalAssistentesSistema = Object.keys(mapUser).length;
        const inputAssist = document.getElementById('cons-input-assistentes');
        const labelFound = document.getElementById('cons-found-assistentes');
        
        // Se o input for 0 ou vazio (primeiro carregamento), assume o do sistema
        let totalAssistentesConsiderados = parseInt(inputAssist.value);
        if (totalAssistentesConsiderados <= 0 || isNaN(totalAssistentesConsiderados)) {
            totalAssistentesConsiderados = totalAssistentesSistema;
            inputAssist.value = totalAssistentesSistema;
        }
        
        if (labelFound) labelFound.innerText = totalAssistentesSistema;

        // 2. Dias
        document.getElementById('cons-kpi-dias-display').innerText = `${this.diasUteisPeriodo} / ${this.diasTrabalhadosPeriodo}`;

        // 3. Totais por Tipo
        document.getElementById('cons-kpi-total-geral').innerText = totalGeral.toLocaleString('pt-BR');
        document.getElementById('cons-kpi-fifo').innerText = totalFifo.toLocaleString('pt-BR');
        document.getElementById('cons-kpi-gparcial').innerText = totalGParcial.toLocaleString('pt-BR');
        document.getElementById('cons-kpi-gtotal').innerText = totalGTotal.toLocaleString('pt-BR');
        document.getElementById('cons-kpi-perfil').innerText = totalPerfil.toLocaleString('pt-BR');

        // 4. Médias Calculadas
        // Validação Diária (Dias Úteis) = Total / Dias Úteis
        const mediaDiaUteis = this.diasUteisPeriodo > 0 ? Math.round(totalGeral / this.diasUteisPeriodo) : 0;
        
        // Média por Assistente (Total) = Total / Nº Assistentes
        const mediaPorAssTotal = totalAssistentesConsiderados > 0 ? Math.round(totalGeral / totalAssistentesConsiderados) : 0;
        
        // Média por Assistente (Diária) = (Total / Nº Assistentes) / Dias Úteis
        const mediaPorAssDia = this.diasUteisPeriodo > 0 ? Math.round(mediaPorAssTotal / this.diasUteisPeriodo) : 0;

        document.getElementById('cons-media-dia-uteis').innerText = mediaDiaUteis.toLocaleString('pt-BR');
        document.getElementById('cons-media-ass-total').innerText = mediaPorAssTotal.toLocaleString('pt-BR');
        document.getElementById('cons-media-ass-dia').innerText = mediaPorAssDia.toLocaleString('pt-BR');

        // --- RENDERIZAÇÃO DA TABELA ---
        this.renderizarCabecalho(thead, colunas);
        
        if (totalAssistentesSistema === 0) {
            tbody.innerHTML = '<tr><td colspan="100%" class="text-center py-8 text-slate-400">Nenhum dado encontrado.</td></tr>';
            return;
        }

        let html = '';
        Object.values(mapUser).sort((a,b) => b.total - a.total).forEach(u => {
            let colsHtml = '';
            colunas.forEach(c => {
                const val = u.colunas[c.id];
                const style = val === 0 ? 'text-slate-300' : 'text-slate-600 font-semibold';
                colsHtml += `<td class="px-3 py-3 text-center ${style} border-l border-slate-50">${val.toLocaleString('pt-BR')}</td>`;
            });

            // Média na tabela continua sendo a real (Total / Dias Úteis do período)
            const mediaInd = this.diasUteisPeriodo > 0 ? Math.round(u.total / this.diasUteisPeriodo) : 0;

            html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
                <td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">${u.nome}</td>
                <td class="px-4 py-3 text-center font-black text-blue-700 bg-blue-50/30">${u.total.toLocaleString('pt-BR')}</td>
                <td class="px-4 py-3 text-center text-slate-500">${mediaInd.toLocaleString('pt-BR')}</td>
                ${colsHtml}
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    recalcularMedias: function() {
        // Chamado quando o usuário altera o input manual de assistentes
        if (this.dadosCarregados) {
            this.processarKPIsETabela();
        }
    },

    renderizarCabecalho: function(thead, colunas) {
        if(!thead) return;
        let colsHtml = '';
        colunas.forEach(c => {
            colsHtml += `<th class="px-3 py-3 text-center border-l border-slate-200 min-w-[60px]">${c.label}</th>`;
        });

        thead.innerHTML = `
            <tr class="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wide border-b border-slate-200">
                <th class="px-4 py-3 text-left w-48">Assistente</th>
                <th class="px-4 py-3 text-center text-blue-700 bg-blue-50/50 w-24">Total</th>
                <th class="px-4 py-3 text-center w-20">Méd/Dia</th>
                ${colsHtml}
            </tr>
        `;
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