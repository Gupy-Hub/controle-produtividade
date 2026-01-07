Produtividade.Consolidado = {
    init: function() { this.carregar(); },

    togglePeriodo: function() { this.carregar(); },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        const periodTypeEl = document.getElementById('cons-period-type');
        const dateInput = document.getElementById('global-date');

        if(tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</td></tr>';
        
        try {
            const dataRef = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
            const tipoPeriodo = periodTypeEl ? periodTypeEl.value : 'mes';
            const [ano, mes, dia] = dataRef.split('-').map(Number);

            // 1. Define Intervalo de Datas e Configuração das Colunas
            let dataInicio, dataFim;
            let colunas = []; // { label: 'Sem 1', id: 's1' }
            let funcAgrupamento; // Função que diz a qual coluna o registro pertence

            if (tipoPeriodo === 'mes') { // MENSAL (SEMANAS)
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
                
                // Gera as semanas reais do calendário
                const semanas = Produtividade.Geral.getSemanasDoMes ? Produtividade.Geral.getSemanasDoMes(ano, mes) : [];
                
                // Se o helper não estiver disponível, faz um fallback simples ou definimos aqui
                if(semanas.length === 0) {
                     // Fallback simples se geral.js não carregou
                     colunas = [{label:'Total', id:'total'}];
                     funcAgrupamento = () => 'total';
                } else {
                    semanas.forEach((s, i) => {
                        colunas.push({ label: `Sem ${i+1}`, id: `s${i+1}`, inicio: s.inicio, fim: s.fim });
                    });
                    
                    funcAgrupamento = (dataReg) => {
                        const idx = semanas.findIndex(s => dataReg >= s.inicio && dataReg <= s.fim);
                        return idx >= 0 ? `s${idx+1}` : null;
                    };
                }

            } else if (tipoPeriodo === 'trimestre') { // TRIMESTRAL
                const trimestres = [ [1,3], [4,6], [7,9], [10,12] ];
                const currentTri = trimestres.find(t => mes >= t[0] && mes <= t[1]);
                const mesIni = currentTri[0];
                const mesFim = currentTri[1];

                dataInicio = `${ano}-${String(mesIni).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mesFim, 0).getDate();
                dataFim = `${ano}-${String(mesFim).padStart(2,'0')}-${ultimoDia}`;

                const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                for(let m=mesIni; m<=mesFim; m++) colunas.push({ label: nomesMeses[m-1], id: `m${m}` });

                funcAgrupamento = (dataReg) => {
                    const m = parseInt(dataReg.split('-')[1]);
                    return `m${m}`;
                };

            } else if (tipoPeriodo === 'ano_mes') { // ANUAL
                dataInicio = `${ano}-01-01`;
                dataFim = `${ano}-12-31`;
                const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                nomesMeses.forEach((nm, i) => colunas.push({ label: nm, id: `m${i+1}` }));

                funcAgrupamento = (dataReg) => {
                    const m = parseInt(dataReg.split('-')[1]);
                    return `m${m}`;
                };
                
            } else { 
                // Diário ou Outros (Fallback para mês simples)
                dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
                const ultimoDia = new Date(ano, mes, 0).getDate();
                dataFim = `${ano}-${String(mes).padStart(2,'0')}-${ultimoDia}`;
                
                // Colunas = Dias
                for(let i=1; i<=ultimoDia; i++) colunas.push({ label: String(i), id: `d${i}` });
                funcAgrupamento = (dataReg) => {
                    const d = parseInt(dataReg.split('-')[2]);
                    return `d${d}`;
                };
            }

            // 2. Busca Dados Filtrados
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios!inner(nome, id)')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);
                
            if (error) throw error;

            // 3. Processamento (Pivot)
            const mapUser = {};
            let totalGeral = 0;
            const diasUnicosSet = new Set();

            data.forEach(d => {
                const uid = d.usuario_id;
                const nome = d.usuarios ? d.usuarios.nome : 'Desconhecido';
                
                if (!mapUser[uid]) {
                    mapUser[uid] = { 
                        nome: nome, 
                        total: 0, 
                        dias_trab: new Set(),
                        colunas: {} 
                    };
                    colunas.forEach(c => mapUser[uid].colunas[c.id] = 0);
                }
                
                const qtd = d.quantidade || 0;
                mapUser[uid].total += qtd;
                mapUser[uid].dias_trab.add(d.data_referencia);
                totalGeral += qtd;
                diasUnicosSet.add(d.data_referencia);

                // Distribui nas colunas
                const colId = funcAgrupamento(d.data_referencia);
                if (colId && mapUser[uid].colunas[colId] !== undefined) {
                    mapUser[uid].colunas[colId] += qtd;
                }
            });

            // 4. Renderiza KPIs
            const totalAssist = Object.keys(mapUser).length;
            const diasUnicos = diasUnicosSet.size;
            
            // Média Diária da Equipe = Total Produção / Total Dias Trabalhados (Soma de dias de cada um ou dias corridos? Vamos usar dias corridos da equipe)
            const mediaGeral = (diasUnicos > 0) ? Math.round(totalGeral / diasUnicos) : 0;

            document.getElementById('cons-kpi-total').innerText = totalGeral.toLocaleString('pt-BR');
            document.getElementById('cons-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR'); // Média por Dia Útil do Time
            document.getElementById('cons-kpi-dias').innerText = diasUnicos;
            document.getElementById('cons-kpi-melhor').innerText = this.calcularMelhorDia(data);

            // 5. Renderiza Tabela Dinâmica
            this.renderizarCabecalho(thead, colunas);
            
            if (totalAssist === 0) {
                tbody.innerHTML = '<tr><td colspan="100%" class="text-center py-8 text-slate-400">Nenhum dado encontrado neste período.</td></tr>';
                return;
            }

            let html = '';
            // Ordena por produção total
            Object.values(mapUser).sort((a,b) => b.total - a.total).forEach(u => {
                let colsHtml = '';
                colunas.forEach(c => {
                    const val = u.colunas[c.id];
                    // Destaca valores zerados
                    const style = val === 0 ? 'text-slate-300' : 'text-slate-600 font-semibold';
                    colsHtml += `<td class="px-3 py-3 text-center ${style} border-l border-slate-50">${val.toLocaleString('pt-BR')}</td>`;
                });

                const mediaIndividual = u.dias_trab.size > 0 ? Math.round(u.total / u.dias_trab.size) : 0;

                html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
                    <td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">${u.nome}</td>
                    <td class="px-4 py-3 text-center font-black text-blue-700 bg-blue-50/30">${u.total.toLocaleString('pt-BR')}</td>
                    <td class="px-4 py-3 text-center text-slate-500">${mediaIndividual}</td>
                    ${colsHtml}
                </tr>`;
            });
            if(tbody) tbody.innerHTML = html;

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-red-500 text-center py-4">Erro: ${e.message}</td></tr>`;
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
                <th class="px-4 py-3 text-center w-20">Média/Dia</th>
                ${colsHtml}
            </tr>
        `;
    },

    calcularMelhorDia: function(data) {
        if(!data || data.length === 0) return '--';
        const mapa = {};
        data.forEach(d => {
            if(!mapa[d.data_referencia]) mapa[d.data_referencia] = 0;
            mapa[d.data_referencia] += (d.quantidade || 0);
        });
        
        let melhorData = '';
        let maiorValor = -1;
        
        for(const [dt, val] of Object.entries(mapa)) {
            if(val > maiorValor) {
                maiorValor = val;
                melhorData = dt;
            }
        }
        
        if(!melhorData) return '--';
        const [y, m, d] = melhorData.split('-');
        return `${d}/${m} (${maiorValor.toLocaleString('pt-BR')})`;
    },
    
    zerarCards: function() {
        ['cons-kpi-total', 'cons-kpi-media', 'cons-kpi-dias', 'cons-kpi-melhor'].forEach(id => {
            const el = document.getElementById(id); if(el) el.innerText = '--';
        });
    }
};