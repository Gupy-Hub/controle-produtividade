window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Grid Footer Stats Init...");
        this.renderizarFiltros(); 
        setTimeout(() => this.carregarDados(), 100);
        this.initialized = true;
    },

    renderizarFiltros: function() {
        const selAno = document.getElementById('sel-consolidado-ano');
        const selPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!selAno || !selPeriodo) return;

        const anoAtual = new Date().getFullYear(); 
        selAno.innerHTML = `
            <option value="${anoAtual}">${anoAtual}</option>
            <option value="${anoAtual - 1}" selected>${anoAtual - 1}</option>
            <option value="${anoAtual - 2}">${anoAtual - 2}</option>
        `;

        selPeriodo.innerHTML = `
            <option value="anual" class="font-bold">📅 Ano Completo</option>
            <optgroup label="Semestres"><option value="s1">1º Semestre</option><option value="s2">2º Semestre</option></optgroup>
            <optgroup label="Trimestres"><option value="t1">1º Trimestre</option><option value="t2">2º Trimestre</option><option value="t3">3º Trimestre</option><option value="t4">4º Trimestre</option></optgroup>
            <optgroup label="Meses">
                <option value="1">Janeiro</option><option value="2">Fevereiro</option><option value="3">Março</option>
                <option value="4">Abril</option><option value="5">Maio</option><option value="6">Junho</option>
                <option value="7">Julho</option><option value="8">Agosto</option><option value="9">Setembro</option>
                <option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
            </optgroup>
        `;

        selAno.onchange = () => this.carregarDados();
        selPeriodo.onchange = () => this.carregarDados();
    },

    getDatasIntervalo: function() {
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!elAno || !elPeriodo) return { inicio: '2025-01-01', fim: '2025-12-31' };

        const ano = elAno.value;
        const periodo = elPeriodo.value;
        let inicio = `${ano}-01-01`;
        let fim = `${ano}-12-31`;

        switch (periodo) {
            case 'anual': break;
            case 's1': inicio = `${ano}-01-01`; fim = `${ano}-06-30`; break;
            case 's2': inicio = `${ano}-07-01`; fim = `${ano}-12-31`; break;
            case 't1': inicio = `${ano}-01-01`; fim = `${ano}-03-31`; break;
            case 't2': inicio = `${ano}-04-01`; fim = `${ano}-06-30`; break;
            case 't3': inicio = `${ano}-07-01`; fim = `${ano}-09-30`; break;
            case 't4': inicio = `${ano}-10-01`; fim = `${ano}-12-31`; break;
            default:
                const mes = parseInt(periodo);
                if (mes >= 1 && mes <= 12) {
                    const lastDay = new Date(ano, mes, 0).getDate();
                    inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
                    fim = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
                }
                break;
        }

        const debugInicio = document.getElementById('debug-data-inicio');
        const debugFim = document.getElementById('debug-data-fim');
        if(debugInicio) debugInicio.innerText = inicio;
        if(debugFim) debugFim.innerText = fim;

        return { inicio, fim };
    },

    countDiasUteis: function(inicioStr, fimStr) {
        let count = 0;
        let cur = new Date(inicioStr + 'T12:00:00'); 
        const end = new Date(fimStr + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++; 
            cur.setDate(cur.getDate() + 1);
        }
        return count > 0 ? count : 1;
    },

    carregarDados: async function() {
        const tbody = document.getElementById('cons-table-body');
        const tfoot = document.getElementById('cons-table-footer');
        const { inicio, fim } = this.getDatasIntervalo();
        const diasUteisPeriodo = this.countDiasUteis(inicio, fim);

        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br>Carregando dados...</td></tr>';
        if (tfoot) tfoot.innerHTML = '';

        try {
            if(!Sistema || !Sistema.supabase) throw new Error("Sistema não inicializado.");

            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { data_inicio: inicio, data_fim: fim });

            if (error) throw error;
            this.processarDados(data, diasUteisPeriodo);

        } catch (error) {
            console.error("Erro:", error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-rose-500">Erro: ${error.message}</td></tr>`;
        }
    },

    processarDados: function(data, diasUteisPeriodo) {
        const assistentes = (data || []).filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));

        // --- CALCULO DOS 10 INDICADORES ---
        let totalValidados = 0;
        let totalFifo = 0;
        let totalGradualTotal = 0;
        let totalGradualParcial = 0;
        let totalPerfilFc = 0;

        const dadosMapeados = assistentes.map(u => {
            const prod = Number(u.total_qty || u.producao || 0);
            const fifo = Number(u.total_fifo || u.fifo || 0);
            const gradTotal = Number(u.total_gradual_total || u.gradual_total || 0);
            const gradParcial = Number(u.total_gradual_parcial || u.gradual_parcial || 0);
            const perfilFc = Number(u.total_perfil_fc || u.perfil_fc || 0);
            
            // 7. Total documentos validados
            totalValidados += prod;
            // 3. Total Fifo
            totalFifo += fifo;
            // 5. Total Gradual Total
            totalGradualTotal += gradTotal;
            // 4. Total Gradual Parcial
            totalGradualParcial += gradParcial;
            // 6. Total Perfil FC
            totalPerfilFc += perfilFc;

            const mediaDiaria = diasUteisPeriodo > 0 ? (prod / diasUteisPeriodo) : 0;
            const metaPeriodo = Number(u.meta_producao || 0) * diasUteisPeriodo;
            const atingimento = metaPeriodo > 0 ? (prod / metaPeriodo * 100) : 0;

            return {
                nome: u.nome,
                fifo, gradTotal, gradParcial, perfilFc,
                total: prod,
                mediaDiaria,
                atingimento
            };
        });

        dadosMapeados.sort((a,b) => b.total - a.total);

        // 1. Total assistentes
        const totalAssistentes = assistentes.length;
        
        // 2. Total dias úteis
        const totalDiasUteis = diasUteisPeriodo;

        // 8. Total validação diária (Dias uteis) = Soma Total / dias uteis
        const validacaoDiariaTime = totalDiasUteis > 0 ? (totalValidados / totalDiasUteis) : 0;

        // 9. Média validação diária (Todas assistentes) = Soma Total / Total de Assistentes 
        // (Nota: Isso é Média por Pessoa no Período)
        const mediaValPorAssistente = totalAssistentes > 0 ? (totalValidados / totalAssistentes) : 0;

        // 10. Média validação diária (Por Assistentes) = Soma Total / Dias Uteis / Total de Assistentes
        const mediaValDiariaPorAssistente = (totalAssistentes > 0 && totalDiasUteis > 0) 
            ? (totalValidados / totalDiasUteis / totalAssistentes) 
            : 0;

        // Renderiza
        this.renderizarTabela(dadosMapeados, {
            totalAssistentes,
            totalDiasUteis,
            totalFifo,
            totalGradualParcial,
            totalGradualTotal,
            totalPerfilFc,
            totalValidados,
            validacaoDiariaTime,
            mediaValPorAssistente,
            mediaValDiariaPorAssistente
        });
    },

    renderizarTabela: function(dados, totais) {
        const tbody = document.getElementById('cons-table-body');
        const tfoot = document.getElementById('cons-table-footer');
        
        if(!tbody) return;
        tbody.innerHTML = '';

        if(dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400">Nenhum registro. Tente ajustar o ano.</td></tr>';
            if(tfoot) tfoot.innerHTML = '';
            return;
        }

        // --- Renderiza Linhas (Corpo) ---
        dados.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition-colors group border-b border-slate-100 last:border-0";
            let corAting = d.atingimento >= 100 ? "text-emerald-600 font-bold" : (d.atingimento < 95 ? "text-rose-600 font-bold" : "text-slate-500");

            tr.innerHTML = `
                <td class="px-3 py-3 border-r border-slate-100 flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">${d.nome.charAt(0)}</div>
                    <span class="font-bold text-slate-700 text-xs">${d.nome.split(' ').slice(0,2).join(' ')}</span>
                </td>
                <td class="px-2 py-3 text-center text-slate-500 border-r border-slate-100 text-xs">-</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.fifo.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.gradTotal.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.gradParcial.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">${d.perfilFc.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center font-bold text-blue-700 bg-blue-50/30 border-x border-blue-100 text-sm">${d.total.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-700 font-bold border-r border-slate-100 text-xs">${Math.round(d.mediaDiaria)}</td>
                <td class="px-2 py-3 text-center ${corAting} text-xs">${d.atingimento.toFixed(1)}%</td>
            `;
            tbody.appendChild(tr);
        });

        // --- Renderiza Footer (Os 10 Dados Solicitados) ---
        // Organizados em 2 linhas para caber perfeitamente no Grid
        if(tfoot) {
            tfoot.innerHTML = `
                <tr class="bg-slate-50 border-t-2 border-slate-300">
                    <td class="px-3 py-2 text-right text-slate-500 uppercase text-[10px]">TOTAIS:</td>
                    <td class="px-2 py-2 text-center text-slate-400 text-[10px]">-</td>
                    <td class="px-2 py-2 text-center text-slate-800 font-bold text-xs" title="Total FIFO">${totais.totalFifo.toLocaleString('pt-BR')}</td>
                    <td class="px-2 py-2 text-center text-slate-800 font-bold text-xs" title="Total Gradual Total">${totais.totalGradualTotal.toLocaleString('pt-BR')}</td>
                    <td class="px-2 py-2 text-center text-slate-800 font-bold text-xs" title="Total Gradual Parcial">${totais.totalGradualParcial.toLocaleString('pt-BR')}</td>
                    <td class="px-2 py-2 text-center text-slate-800 font-bold text-xs" title="Total Perfil FC">${totais.totalPerfilFc.toLocaleString('pt-BR')}</td>
                    <td class="px-2 py-2 text-center text-blue-800 font-black bg-blue-100/50 border-x border-blue-200 text-sm" title="Total Validados">${totais.totalValidados.toLocaleString('pt-BR')}</td>
                    <td class="px-2 py-2 text-center text-slate-400 text-[10px]">-</td>
                    <td class="px-2 py-2 text-center text-slate-400 text-[10px]">-</td>
                </tr>
                
                <tr class="bg-slate-100 border-t border-slate-200">
                    <td class="px-3 py-2 text-left text-slate-600 text-[10px] uppercase font-bold pl-4">
                        <span title="Total Assistentes"><i class="fas fa-users mr-1"></i> ${totais.totalAssistentes}</span> &nbsp;|&nbsp; 
                        <span title="Dias Úteis"><i class="fas fa-calendar-day mr-1"></i> ${totais.totalDiasUteis}</span>
                    </td>
                    <td colspan="5" class="px-2 py-2 text-right text-slate-500 text-[10px] uppercase font-bold tracking-wide">MÉDIAS GLOBAIS:</td>
                    
                    <td class="px-2 py-2 text-center text-blue-600 font-bold text-[10px] border-l border-slate-200" title="Validação Diária (Time) = Total / Dias Úteis">
                        ${Math.round(totais.validacaoDiariaTime).toLocaleString('pt-BR')} /dia
                    </td>
                    
                    <td class="px-2 py-2 text-center text-indigo-700 font-bold text-[10px] bg-indigo-50/50" title="Média Diária (Por Assistente) = Total / Dias / Assistentes">
                        ${totais.mediaValDiariaPorAssistente.toFixed(1).replace('.',',')} /user
                    </td>
                    
                    <td class="px-2 py-2 text-center text-[10px] text-slate-600 font-bold" title="Média Total (Todas Assistentes) = Total / Assistentes">
                        Avg: ${Math.round(totais.mediaValPorAssistente).toLocaleString('pt-BR')}
                    </td>
                </tr>
            `;
        }
    }
};