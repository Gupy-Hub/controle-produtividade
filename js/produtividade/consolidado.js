window.Produtividade = window.Produtividade || {};

Produtividade.Consolidado = {
    initialized: false,

    init: function() {
        console.log("🚀 [NEXUS] Consolidado: Grid View Loaded...");
        this.renderizarFiltros(); 
        this.carregarDados();
        this.initialized = true;
    },

    renderizarFiltros: function() {
        const selAno = document.getElementById('sel-consolidado-ano');
        const selPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!selAno || !selPeriodo) return;

        const anoAtual = new Date().getFullYear();
        selAno.innerHTML = `
            <option value="${anoAtual}" selected>${anoAtual}</option>
            <option value="${anoAtual - 1}">${anoAtual - 1}</option>
        `;

        selPeriodo.innerHTML = `
            <option value="anual" class="font-bold">📅 Ano Completo</option>
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
        `;

        selAno.onchange = () => this.carregarDados();
        selPeriodo.onchange = () => this.carregarDados();
    },

    getDatasIntervalo: function() {
        const elAno = document.getElementById('sel-consolidado-ano');
        const elPeriodo = document.getElementById('sel-consolidado-periodo');
        
        if (!elAno || !elPeriodo) {
            const y = new Date().getFullYear();
            return { inicio: `${y}-01-01`, fim: `${y}-12-31` };
        }

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

    carregar: function() {
        if(!this.initialized) this.init();
        else this.carregarDados();
    },

    carregarDados: async function() {
        const tbody = document.getElementById('cons-table-body');
        const { inicio, fim } = this.getDatasIntervalo();
        const diasUteisPeriodo = this.countDiasUteis(inicio, fim);

        // Atualiza Badge de Dias Úteis
        const badgeDias = document.getElementById('cons-dias-uteis-badge');
        if(badgeDias) badgeDias.innerText = diasUteisPeriodo;

        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>Carregando dados consolidados...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { data_inicio: inicio, data_fim: fim });

            if (error) throw error;
            this.processarDados(data, diasUteisPeriodo);

        } catch (error) {
            console.error(error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-rose-500">Erro: ${error.message}</td></tr>`;
        }
    },

    processarDados: function(data, diasUteisPeriodo) {
        // Filtrar e preparar dados
        const assistentes = data.filter(d => !['AUDITORA', 'GESTORA'].includes((d.funcao || '').toUpperCase()));
        
        // Variáveis de Acumulação
        let totalValidados = 0;
        let totalFifo = 0;
        let totalGradualTotal = 0;
        let totalGradualParcial = 0;
        let totalPerfilFc = 0;

        const dadosMapeados = assistentes.map(u => {
            const prod = Number(u.total_qty || 0);
            const fifo = Number(u.total_fifo || u.fifo || 0);
            const gradTotal = Number(u.total_gradual_total || u.gradual_total || 0);
            const gradParcial = Number(u.total_gradual_parcial || u.gradual_parcial || 0);
            const perfilFc = Number(u.total_perfil_fc || u.perfil_fc || 0);
            const metaDiaria = Number(u.meta_producao || 0);
            const metaPeriodo = metaDiaria * diasUteisPeriodo;

            // Acumula Totais
            totalValidados += prod;
            totalFifo += fifo;
            totalGradualTotal += gradTotal;
            totalGradualParcial += gradParcial;
            totalPerfilFc += perfilFc;

            // Cálculos Individuais
            const mediaDiaria = prod / diasUteisPeriodo;
            const atingimento = metaPeriodo > 0 ? (prod / metaPeriodo * 100) : 0;

            return {
                nome: u.nome,
                diasUteis: diasUteisPeriodo,
                fifo,
                gradTotal,
                gradParcial,
                perfilFc,
                total: prod,
                mediaDiaria,
                atingimento
            };
        });

        // Ordenar por maior produção
        dadosMapeados.sort((a,b) => b.total - a.total);

        // --- Atualizar KPIs (Cards) ---
        const totalAssistentes = assistentes.length;
        const mediaDiaTime = diasUteisPeriodo > 0 ? (totalValidados / diasUteisPeriodo) : 0;
        const mediaDiaInd = (totalAssistentes > 0 && diasUteisPeriodo > 0) ? (totalValidados / diasUteisPeriodo / totalAssistentes) : 0;

        this.setVal('cons-kpi-total', totalValidados.toLocaleString('pt-BR'));
        this.setVal('cons-kpi-assistentes', totalAssistentes);
        this.setVal('cons-kpi-media-time', Math.round(mediaDiaTime).toLocaleString('pt-BR'));
        this.setVal('cons-kpi-media-ind', mediaDiaInd.toFixed(1).replace('.', ','));
        
        this.setVal('cons-kpi-fifo', totalFifo.toLocaleString('pt-BR'));
        this.setVal('cons-kpi-grad-total', totalGradualTotal.toLocaleString('pt-BR'));
        this.setVal('cons-kpi-grad-parcial', totalGradualParcial.toLocaleString('pt-BR'));
        this.setVal('cons-kpi-perfil-fc', totalPerfilFc.toLocaleString('pt-BR'));

        // Atualizar contador footer
        const footerCount = document.getElementById('total-consolidado-registros');
        if(footerCount) footerCount.innerText = totalAssistentes;

        // --- Renderizar Tabela ---
        this.renderizarTabela(dadosMapeados);
    },

    setVal: function(id, val) {
        const el = document.getElementById(id);
        if(el) el.innerText = val;
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('cons-table-body');
        if(!tbody) return;

        tbody.innerHTML = '';

        if(dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400">Nenhum dado encontrado para o período selecionado.</td></tr>';
            return;
        }

        dados.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition-colors group";

            // Cor do atingimento
            let corAting = "text-slate-500";
            if(d.atingimento >= 100) corAting = "text-emerald-600 font-bold";
            else if(d.atingimento < 95) corAting = "text-rose-600 font-bold";

            // Formatação de nome curto
            const nomeCurto = d.nome.split(' ').slice(0, 2).join(' ');

            tr.innerHTML = `
                <td class="px-3 py-3 border-r border-slate-100">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            ${d.nome.charAt(0)}
                        </div>
                        <span class="font-bold text-slate-700 text-xs">${nomeCurto}</span>
                    </div>
                </td>
                <td class="px-2 py-3 text-center text-slate-500 border-r border-slate-100 font-mono text-xs">${d.diasUteis}</td>
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
    }
};